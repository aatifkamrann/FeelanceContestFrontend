import { postJson, type IdentityStatus } from '@/lib/opportunities';
import { apiFetch } from '@/lib/api';

/** Where a member stands with the verification provider, and which of their doors ask for it. */
export type IdentityState = {
  status: IdentityStatus;
  verifiedAtUtc: string | null;
  /** The provider's reason category on a decline; null otherwise. */
  note: string | null;
  /** Whether this portal verifies anybody at all. */
  enabled: boolean;
  /** Whether any of this member's doors asks. */
  required: boolean;
  requiredFor: { publish: boolean; apply: boolean; payments: boolean };
};

export async function fetchIdentity(): Promise<IdentityState> {
  const res = await apiFetch('/api/identity/status');
  if (!res.ok) throw new Error(`Verification status failed (${res.status})`);
  return res.json();
}

export const identityQuery = {
  queryKey: ['identity'] as const,
  queryFn: fetchIdentity,
  staleTime: 10_000,
};

/** Opens a session with the provider; the browser goes to the URL and comes back to /verify/done. */
export const startVerification = () => postJson<{ url: string }>('/api/identity/session');

/** The verdict asked of the provider directly — for the member back before the webhook landed. */
export const refreshVerification = () => postJson<IdentityState>('/api/identity/refresh');

/** The verify page with a way back to where the door was. */
export const verifyPath = (next?: string | null): string =>
  next && next.startsWith('/') && !next.startsWith('//') ? `/verify?next=${encodeURIComponent(next)}` : '/verify';

/** Only a path on this portal, as the sign-in and join pages read it. */
export function safeNext(search: string): string | null {
  const next = new URLSearchParams(search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

// The provider sends every member back to the same /verify/done, with
// nothing of ours on the address, so the way back to the door they came
// from waits here while they are away. Local rather than session storage:
// the provider may finish in another tab. A day is long enough for its
// page and short enough that last week's door is not today's.
const RETURN_KEY = 'wp.verify.next';
const RETURN_LIFE_MS = 24 * 60 * 60 * 1000;

/** Kept just before the browser leaves for the provider; a start with no way back clears an older one. */
export function rememberReturn(next: string | null): void {
  try {
    if (next) localStorage.setItem(RETURN_KEY, JSON.stringify({ next, at: Date.now() }));
    else localStorage.removeItem(RETURN_KEY);
  } catch {
    /* nothing kept: the return page's button goes home, as it did */
  }
}

/** The way back the return page offers: its own ?next= first, else what the verify page kept. */
export function returnPath(search: string): string | null {
  const own = safeNext(search);
  if (own) return own;
  try {
    const raw = localStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    const { next, at } = JSON.parse(raw) as { next?: unknown; at?: unknown };
    if (typeof next !== 'string' || typeof at !== 'number' || Date.now() - at > RETURN_LIFE_MS) return null;
    return next.startsWith('/') && !next.startsWith('//') ? next : null;
  } catch {
    return null;
  }
}

/** What the way-back button says: an application by name, anywhere else as where they were. */
export const returnLabel = (next: string): string =>
  /^\/opportunities\/[^/?]+\/apply(\?|$)/.test(next) ? 'Back to your application' : 'Back to where you were';
