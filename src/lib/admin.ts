import { keepPreviousData } from '@tanstack/react-query';
import { ApiError, postJson, putJson } from '@/lib/opportunities';
import { apiFetch, apiUrl } from '@/lib/api';

/**
 * The operations console's data layer: one fetch for everything on the
 * screen, three actions that each restart machinery the API already has,
 * and one that starts the slow-query tally again.
 */

export type AdminProvisionRow = {
  id: string;
  githubUsername: string;
  freelancer: string;
  opportunityTitle: string;
  opportunitySlug: string;
  opportunityStatus: string;
  status: string; // pending | provisioned | failed
  attempts: number;
  lastAttemptAtUtc: string | null;
  note: string | null;
  canRetry: boolean;
};

export type AdminHandoverRow = {
  id: string;
  opportunityTitle: string;
  opportunitySlug: string;
  client: string;
  clientGithubLogin: string | null;
  winner: string;
  repoFullName: string | null;
  amount: number;
  currency: string;
  announcedAtUtc: string;
  paidAtUtc: string | null;
  handover: string; // not_started | requested | verified
  transferTargetLogin: string | null;
  transferRequestedAtUtc: string | null;
  handoverVerifiedAtUtc: string | null;
  note: string | null;
  canRestart: boolean;
};

export type AdminDeliveryRow = {
  id: string;
  /** Who sent it: github or identity. */
  source: string;
  deliveryId: string;
  event: string;
  action: string | null;
  repoFullName: string | null;
  handledNote: string | null;
  receivedAtUtc: string;
};

/** One query in the code, one SQL text, and how slow it has been. */
export type AdminSlowQueryRow = {
  /** With placeholders where the values go; never the values. */
  sql: string;
  /** Query, SaveChanges, BulkUpdate, ExecuteSqlRaw… */
  source: string;
  count: number;
  totalMs: number;
  averageMs: number;
  maxMs: number;
  lastMs: number;
  lastRows: number | null;
  /** The request it last served, as method and path, or "background work". */
  lastDuring: string;
  firstAtUtc: string;
  lastAtUtc: string;
};

export type AdminSlowQueries = {
  /** What counts as slow; null when the slow-query log is off. */
  thresholdMs: number | null;
  /** Whether commands that served no request, background work, are counted. */
  includesBackground: boolean;
  sinceUtc: string;
  /** The costliest in all first. */
  items: AdminSlowQueryRow[];
};

export type AdminOperations = {
  generatedAtUtc: string;
  provisioning: AdminProvisionRow[];
  handovers: AdminHandoverRow[];
  deliveries: AdminDeliveryRow[];
  slowQueries: AdminSlowQueries;
};

export async function fetchOperations(): Promise<AdminOperations> {
  const res = await apiFetch('/api/admin/operations');
  if (!res.ok) throw new Error(`Operations failed (${res.status})`);
  return res.json();
}

export const operationsQuery = {
  queryKey: ['admin', 'operations'] as const,
  queryFn: fetchOperations,
  // Operator screens want the truth, not a cache — but a few seconds of
  // staleness beats hammering the API on every focus change.
  staleTime: 5_000,
};

export const retryProvision = (entryId: string) =>
  postJson<{ status: string }>(`/api/admin/entries/${entryId}/retry-provision`);

export const restartHandover = (awardId: string) =>
  postJson<{ handover: string; transferTargetLogin: string | null }>(
    `/api/admin/awards/${awardId}/restart-handover`,
  );

export const replayDelivery = (deliveryId: string) =>
  postJson<{ note: string }>(`/api/admin/deliveries/${deliveryId}/replay`);

/** Starts the slow-query tally again from now; the API's log keeps what it wrote. */
export const clearSlowQueries = () => postJson<AdminSlowQueries>('/api/admin/slow-queries/clear');

// ------------------------------------------------------------- users
// The Users screen: every living account with the counts its decisions
// turn on, and the actions an administrator has over one.

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: string; // admin | client | freelancer
  createdAtUtc: string;
  lockedAtUtc: string | null;
  /** The administrator's own note; the person never sees it. */
  lockReason: string | null;
  githubLogin: string | null;
  avatarUrl: string | null;
  /** A reset link sent earlier is still live. */
  resetPending: boolean;
  /**
   * False for an invited account nobody has claimed. With `resetPending` it
   * tells the two apart: a live link is an invitation in flight, an expired
   * one is a door nobody can open until an administrator sends another.
   */
  passwordSet: boolean;
  /** The provider approved the person behind the account; an administrator may take it back. */
  identityVerified: boolean;
  opportunities: number;
  /** Open or reviewing — what an erasure would cancel. */
  liveOpportunities: number;
  entries: number;
  /** Active, in an open or reviewing opportunity — what an erasure would withdraw. */
  activeEntries: number;
  awardsWon: number;
  ratings: number;
  isYou: boolean;
};

export async function fetchUsers(): Promise<AdminUser[]> {
  const res = await apiFetch('/api/admin/users');
  if (!res.ok) throw new Error(`Users failed (${res.status})`);
  const body = (await res.json()) as { users: AdminUser[] };
  return body.users;
}

export const usersQuery = {
  queryKey: ['admin', 'users'] as const,
  queryFn: fetchUsers,
  staleTime: 5_000,
};

/**
 * A new account. An empty password asks the API to email an invitation
 * instead — the better of the two, since nobody but the person ever knows
 * what they choose.
 */
export const createUser = (body: {
  displayName: string;
  email: string;
  role: string;
  password: string;
}) => postJson<{ user: AdminUser; invited: boolean }>('/api/admin/users', body);

export const updateUser = (id: string, body: { displayName: string; email: string }) =>
  putJson<AdminUser>(`/api/admin/users/${id}`, body);

export const lockUser = (id: string, reason: string) =>
  postJson<AdminUser>(`/api/admin/users/${id}/lock`, { reason });

export const unlockUser = (id: string) => postJson<AdminUser>(`/api/admin/users/${id}/unlock`, {});

/** Takes an identity verification back: the doors shut again until a new one passes. */
export const resetVerification = (id: string) =>
  postJson<AdminUser>(`/api/admin/users/${id}/reset-verification`, {});

/**
 * The proof behind a member's identity verdict, as an administrator reads
 * it: the facts off the document, the provider's whole decision, and the
 * stored copies of its images. Null for a member who never started one.
 */
export type IdentityProof = {
  status: string;
  provider: string;
  sessionId: string;
  startedAtUtc: string;
  decidedAtUtc: string | null;
  note: string | null;
  decisionReadAtUtc: string | null;
  /** The provider's whole decision, indented; null until it has been read. */
  decision: string | null;
  facts: { label: string; value: string }[];
  documents: { id: string; label: string; contentType: string; sizeBytes: number }[];
  /** The worker still has the decision and its images to copy. */
  proofPending: boolean;
  proofError: string | null;
};

export async function fetchIdentityProof(userId: string): Promise<IdentityProof | null> {
  const res = await apiFetch(`/api/admin/users/${userId}/identity`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The verification could not be loaded (${res.status})`);
  return res.json();
}

export const identityProofQuery = (userId: string) => ({
  queryKey: ['admin', 'identity', userId] as const,
  queryFn: () => fetchIdentityProof(userId),
  // While the worker copies, look again every few seconds.
  refetchInterval: (q: { state: { data?: IdentityProof | null } }) => (q.state.data?.proofPending ? 5_000 : false),
});

export const fetchIdentityProofAgain = (userId: string) =>
  postJson<IdentityProof>(`/api/admin/users/${userId}/identity/fetch`, {});

/** A stored document image, through a five-minute signed link; opening one is an activity row. */
export const identityDocumentUrl = (id: string) => apiUrl(`/api/admin/identity-documents/${id}/view`);

export const setUserPassword = (id: string, password: string) =>
  postJson<void>(`/api/admin/users/${id}/password`, { password });

/** Sends an invitation instead of a reset when the account never had a password. */
export const sendUserResetLink = (id: string) =>
  postJson<{ sentTo: string; expiresAtUtc: string; invited: boolean }>(
    `/api/admin/users/${id}/reset-link`,
    {},
  );

export type DeleteOutcome = {
  /** "deleted" removed the row; "erased" kept it as a record with the person wiped. */
  outcome: 'deleted' | 'erased';
  opportunitiesCancelled: number;
  entriesWithdrawn: number;
};

// ---------------------------------------------------------- activity
// Admin → Activity: who did what, when, on which page — read a page at a
// time, newest first, narrowed by the filters the screen offers. Besides
// pages and actions, every call the portal made to a third-party API is a
// row of its own, with what was sent and what came back (secrets masked).

export type ActivityKind = 'all' | 'visit' | 'action' | 'external';

/** The outside services the portal calls, as the API names them, in the order the screen offers them. */
export const EXTERNAL_SERVICES = [
  { value: 'ai', label: 'AI' },
  { value: 'identity', label: 'Identity verification' },
  { value: 'github', label: 'GitHub' },
  { value: 'sms', label: 'SMS' },
  { value: 'captcha', label: 'Captcha' },
  { value: 'push', label: 'Push' },
  { value: 'storage', label: 'Storage' },
  { value: 'email', label: 'Email' },
] as const;

export type ExternalService = (typeof EXTERNAL_SERVICES)[number]['value'];

export function serviceLabel(service: string | null): string | null {
  return EXTERNAL_SERVICES.find((s) => s.value === service)?.label ?? service;
}
export type ActivityWho = 'all' | 'members' | 'visitors';
export type ActivityRange = 'today' | '7d' | '30d' | 'all';

export type ActivityFilters = {
  q: string;
  kind: ActivityKind;
  /** One outside service; only sent with kind 'external'. */
  service: ExternalService | null;
  /** One AI provider by its settings key (openai, gemini, …); only sent with the AI service. */
  aiProvider: string | null;
  /** One exact provider and model, "openai/gpt-5.5"; only sent with the AI service. */
  aiModel: string | null;
  who: ActivityWho;
  range: ActivityRange;
  userId: string | null;
  /** One browser session, 16 hex characters — the thread a visitor's pages hang on. */
  visitor: string | null;
  /** 1-based. */
  page: number;
  size: number;
};

export type ActivityRow = {
  id: number;
  atUtc: string;
  kind: 'visit' | 'action' | 'external';
  /** In words: "Applied to an opportunity", "Opened the dashboard", "Called OpenAI". */
  action: string;
  method: string;
  /** The API path of an action; the page of a visit; host and path of a third-party call. Never a query string. */
  path: string;
  /** The page the browser was on; for a visit, the page itself. */
  page: string | null;
  /** What it was done to — a slug, an id — from the route only; for an AI call, its provider and model, "openai/gpt-5.5". */
  subject: string | null;
  /** The reason given for a withdrawal or a removal — the one typed thing a row holds. */
  detail: string | null;
  /**
   * The HTTP status an action or a third-party call ended with; 0 for a
   * visit, and for a call that got no answer. 400 and up is a failure.
   */
  status: number;
  ip: string | null;
  userAgent: string | null;
  visitor: string | null;
  /** Set with `user` null when the account was removed outright. */
  userId: string | null;
  user: {
    id: string;
    displayName: string;
    email: string;
    role: string;
    erased: boolean;
    avatarUrl: string | null;
  } | null;
  /** A third-party call's service (ai, identity, …); null on every other row. */
  service: string | null;
  /** How long a third-party call took; null on every other row. */
  durationMs: number | null;
};

export type ActivityPage = { total: number; page: number; size: number; rows: ActivityRow[] };

/** The start of the range, in the administrator's own day for "today". */
function rangeStart(range: ActivityRange): string | null {
  const now = new Date();
  switch (range) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    case '7d':
      return new Date(now.getTime() - 7 * 86_400_000).toISOString();
    case '30d':
      return new Date(now.getTime() - 30 * 86_400_000).toISOString();
    default:
      return null;
  }
}

export async function fetchActivity(f: ActivityFilters): Promise<ActivityPage> {
  const params = new URLSearchParams();
  if (f.q) params.set('q', f.q);
  if (f.kind !== 'all') params.set('kind', f.kind);
  if (f.kind === 'external' && f.service) params.set('service', f.service);
  if (f.kind === 'external' && f.service === 'ai') {
    if (f.aiProvider) params.set('aiProvider', f.aiProvider);
    if (f.aiModel) params.set('aiModel', f.aiModel);
  }
  if (f.who !== 'all') params.set('who', f.who);
  if (f.userId) params.set('user', f.userId);
  if (f.visitor) params.set('visitor', f.visitor);
  const from = rangeStart(f.range);
  if (from) params.set('from', from);
  params.set('page', String(f.page));
  params.set('size', String(f.size));
  const res = await apiFetch(`/api/admin/activity?${params.toString()}`);
  if (!res.ok) throw new Error(`Activity failed (${res.status})`);
  return res.json();
}

export const activityQuery = (f: ActivityFilters) => ({
  queryKey: ['admin', 'activity', f] as const,
  queryFn: () => fetchActivity(f),
  staleTime: 5_000,
  // The old page stays up while the next loads, so paging never blanks.
  placeholderData: keepPreviousData,
});

/** The AI providers the portal can call, and every provider and model the log's AI calls were made with. */
export type ActivityAiModels = {
  providers: { key: string; label: string }[];
  /** Most recently used first. The id is what a row's subject says and what the Model filter sends. */
  models: { id: string; provider: string; providerLabel: string; model: string; calls: number; lastAtUtc: string }[];
};

export const activityAiModelsQuery = {
  queryKey: ['admin', 'activity', 'ai-models'] as const,
  queryFn: async (): Promise<ActivityAiModels> => {
    const res = await apiFetch('/api/admin/activity/ai-models');
    if (!res.ok) throw new Error(`AI models failed (${res.status})`);
    return res.json();
  },
  staleTime: 30_000,
};

/** What one third-party call sent and got back: request line, headers, body — secrets already masked. */
export type ActivityExchange = { id: number; request: string | null; response: string | null };

export async function fetchActivityExchange(id: number): Promise<ActivityExchange> {
  const res = await apiFetch(`/api/admin/activity/${id}/exchange`);
  if (!res.ok) throw new Error(`The call could not be loaded (${res.status})`);
  return res.json();
}

/** Read once and kept: a row that is written never changes. */
export const activityExchangeQuery = (id: number) => ({
  queryKey: ['admin', 'activity', 'exchange', id] as const,
  queryFn: () => fetchActivityExchange(id),
  staleTime: Infinity,
});

/**
 * "Chrome · Windows" from a user-agent string — enough to tell a phone
 * from a desk and a browser from a script, which is all the screen asks.
 */
export function browserOf(ua: string | null): string {
  if (!ua) return '—';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl|python|node|go-http|powershell|wget/i.test(ua)
              ? 'Script'
              : 'Other';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}

export async function deleteUser(id: string): Promise<DeleteOutcome> {
  const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return res.json();
}
