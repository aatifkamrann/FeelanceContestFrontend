/**
 * Server components talk to the API directly (API_INTERNAL_URL — `http://api:8080`
 * inside compose). The browser is same-origin unless the portal's Branding
 * settings name an API URL: Caddy routes /api/* in compose, a Next rewrite
 * covers the bare-metal dev loop, and on the two-site Windows layout the
 * pages at web.crm.com call the API at api.crm.com — every browser-side
 * call goes through apiFetch, which prefixes that address and sends the
 * cookie. The address comes from the API's own public branding, read by
 * the root layout on every request, so nothing about it is compiled in
 * and a change on the Settings screen reaches the next page load.
 */
import type { Me } from '@/lib/opportunities';

export function apiBase(): string {
  if (typeof window !== 'undefined') return '';
  return process.env.API_INTERNAL_URL ?? 'http://localhost:8080';
}

/**
 * Where the browser reaches the API: '' — same origin — unless the
 * branding's apiUrl says otherwise, which the root layout stamps on
 * <html> as data-api so a page can read it without a build-time constant.
 * On the server the layout remembers the same value before it renders,
 * so a link rendered there (a file's download) says what the browser
 * will. It is one portal-wide address, so the last request's value is
 * everybody's.
 */
export function apiPublic(): string {
  if (typeof window === 'undefined') return serverBase;
  if (publicBase === undefined) publicBase = (document.documentElement.dataset.api ?? '').replace(/\/+$/, '');
  return publicBase;
}
let publicBase: string | undefined;
let serverBase = '';

/** The root layout's note of the branding's apiUrl for this render; '' when the API is this origin. */
export function rememberApiPublic(apiUrl: string | null | undefined): string {
  serverBase = (apiUrl ?? '').replace(/\/+$/, '');
  return serverBase;
}

/**
 * A portal-relative API path as the browser must ask for it: `/api/profile` → `https://api.crm.com/api/profile`, or itself.
 * An address that is already absolute — one apiUrl made — passes through as written.
 */
export function apiUrl(path: string): string {
  return /^https?:\/\//i.test(path) ? path : apiPublic() + path;
}

/**
 * fetch, for the browser, against the API wherever it is. Cross-origin the
 * cookie only travels when asked for, and the page's full address only
 * reaches the API's activity log (what an action was taken from) under a
 * referrer policy looser than the default — both are harmless same-origin.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { credentials: 'include', referrerPolicy: 'no-referrer-when-downgrade', ...init });
}

export type SetupStatus = { completed: boolean };
export type Branding = {
  portalName: string | null;
  accentColor: string | null;
  /** The uploaded logo first, then the Logo URL setting; null when there is neither and the trophy stands in. */
  logoUrl: string | null;
  /** True when logoUrl is the upload — the Settings screen offers to remove it. */
  logoUploaded: boolean;
  /** The tab icon: the uploaded icon, else whatever logoUrl resolved to, else null. */
  iconUrl: string | null;
  /** True when iconUrl is the icon's own upload rather than the logo standing in. */
  iconUploaded: boolean;
  /** Set only when the operator configured the Turnstile key pair — the
   * signup and entry forms render a challenge exactly when this is present. */
  captchaSiteKey: string | null;
  /** The shell shows the banner; the API's gate does the enforcing. */
  maintenanceMode: boolean;
  /** The current terms version, or null when the portal has no terms — then signup asks for no acceptance. */
  termsVersion: number | null;
  /** True when a privacy policy is published — the join form then links it beside the terms. */
  privacyPublished: boolean;
  /** True when the portal can text: the join form's phone field says where the code will come from either way. */
  phoneCodes: boolean;
  /** The opportunity policy's default duration in days — what a blank deadline becomes, counted from the start. */
  opportunityDefaultDurationDays: number;
  /** Where a page sends the browser for the API — the Branding settings' API URL — or null when it is this same origin. */
  apiUrl: string | null;
};

/** The agreement itself; both null when the portal has no terms. */
export type TermsDoc = { version: number | null; markdown: string | null };

/** The privacy policy. Unversioned — nobody re-accepts a statement of practice. */
export type PrivacyDoc = { markdown: string | null };

/** Client-side view of the same payload, for components that live in the shell. */
export const brandingQuery = {
  queryKey: ['public', 'branding'] as const,
  queryFn: async (): Promise<Branding | null> => {
    try {
      const res = await apiFetch('/api/public/branding');
      if (!res.ok) return null;
      return (await res.json()) as Branding;
    } catch {
      return null;
    }
  },
  staleTime: 60_000,
};

export const termsQuery = {
  queryKey: ['public', 'terms'] as const,
  queryFn: async (): Promise<TermsDoc | null> => {
    try {
      const res = await apiFetch('/api/public/terms');
      if (!res.ok) return null;
      return (await res.json()) as TermsDoc;
    } catch {
      return null;
    }
  },
  staleTime: 60_000,
};

export const privacyQuery = {
  queryKey: ['public', 'privacy'] as const,
  queryFn: async (): Promise<PrivacyDoc | null> => {
    try {
      const res = await apiFetch('/api/public/privacy');
      if (!res.ok) return null;
      return (await res.json()) as PrivacyDoc;
    } catch {
      return null;
    }
  },
  staleTime: 60_000,
};

/** null = API unreachable (distinct from “setup incomplete”). */
export async function getSetupStatus(): Promise<SetupStatus | null> {
  try {
    const res = await fetch(`${apiBase()}/api/setup/status`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as SetupStatus;
  } catch {
    return null;
  }
}

/**
 * What to call the portal when it has not said: the API is unreachable, or
 * the operator never set a name. Every header, tab title and signature
 * falls back to this one word rather than each carrying its own copy —
 * a portal that renames itself must not keep a stock name in some corner.
 */
export const PORTAL_NAME = 'Winners Portal';

/** What the portal is, in one line: the sign-in frame's brand panel and the footer say it alike. */
export const PORTAL_LEDE = 'A fixed award, a clear brief, and your own private repo.';

export async function getBranding(): Promise<Branding | null> {
  try {
    const res = await fetch(`${apiBase()}/api/public/branding`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Branding;
  } catch {
    return null;
  }
}

/**
 * The signed-in account, read on the server with the request's cookie
 * header passed through verbatim — null for a visitor, exactly as the
 * client's fetchMe answers, so the two can seed one query.
 */
export async function getMe(cookie: string | undefined): Promise<Me | null> {
  if (!cookie) return null;
  try {
    const res = await fetch(`${apiBase()}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}

export async function getTerms(): Promise<TermsDoc | null> {
  try {
    const res = await fetch(`${apiBase()}/api/public/terms`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as TermsDoc;
  } catch {
    return null;
  }
}

export async function getPrivacy(): Promise<PrivacyDoc | null> {
  try {
    const res = await fetch(`${apiBase()}/api/public/privacy`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as PrivacyDoc;
  } catch {
    return null;
  }
}
