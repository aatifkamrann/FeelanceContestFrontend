import { postJson, putJson } from './opportunities';
import { apiFetch } from '@/lib/api';

// The conversations between a client and the entrants of their
// opportunities. A conversation is keyed by the entry it belongs to; the
// API answers "not found" to anyone but the entry's two parties. An
// administrator reads them, read-only, through the moderation routes at
// the end of this file.

export type ChatParty = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ChatThread = {
  /** The entry the conversation belongs to — its id is the conversation's. */
  entryId: string;
  opportunity: { slug: string; title: string; status: string };
  /** The other side: the client to an entrant, the entrant to the client. */
  other: ChatParty;
  /** The viewer's seat. */
  seat: 'client' | 'freelancer';
  /** active, withdrawn, removed or deselected — why a closed conversation is closed. */
  entryStatus: string;
  /** False reads as closed: what was said stays, nothing more can be sent. */
  canSend: boolean;
  last: { excerpt: string; atUtc: string; mine: boolean } | null;
  /** Lines from the other side the viewer has not opened yet. */
  unread: number;
  /** When the viewer reported it, while that report is being reviewed; null otherwise. */
  reportedAtUtc: string | null;
};

export type ChatThreads = { items: ChatThread[]; unread: number };

export type ChatMessage = {
  id: string;
  body: string;
  senderId: string;
  mine: boolean;
  createdAtUtc: string;
  /** When the other side opened it; null while unread. */
  readAtUtc: string | null;
};

/** One page of a conversation, newest first. */
export type ChatPage = {
  thread: ChatThread;
  items: ChatMessage[];
  /** The cursor for the page before this one; null on the oldest. */
  nextCursor: string | null;
};

export const chatKeys = {
  all: ['chat'] as const,
  threads: ['chat', 'threads'] as const,
  thread: (entryId: string) => ['chat', 'thread', entryId] as const,
};

export async function fetchThreads(): Promise<ChatThreads> {
  const res = await apiFetch('/api/chat/threads');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

/**
 * Every conversation, which is where the dock's badge comes from. The
 * live hub nudges a refetch the moment a line lands; the interval is for
 * a tab the hub could not reach.
 */
export const threadsQuery = {
  queryKey: chatKeys.threads,
  queryFn: fetchThreads,
  staleTime: 15_000,
  refetchInterval: 60_000,
  refetchOnWindowFocus: true,
};

export async function fetchThread(entryId: string, cursor?: string | null): Promise<ChatPage> {
  const res = await apiFetch(
    cursor
      ? `/api/chat/threads/${entryId}?cursor=${encodeURIComponent(cursor)}`
      : `/api/chat/threads/${entryId}`,
  );
  if (res.status === 404) throw new Error('This conversation is not yours to read.');
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export function sendMessage(entryId: string, body: string): Promise<ChatMessage> {
  return postJson(`/api/chat/threads/${entryId}`, { body });
}

export function markThreadRead(entryId: string): Promise<{ changed: number }> {
  return putJson(`/api/chat/threads/${entryId}/read`, {});
}

// ---------------------------------------------------------------- reporting

/** Why a conversation is reported. The keys are the API's (ChatRules.ReportReasons); keep them in step. */
export const REPORT_REASONS = [
  { key: 'abuse', label: 'Harassment, threats or abuse' },
  { key: 'spam', label: 'Spam, a scam or phishing' },
  { key: 'inappropriate', label: 'Inappropriate or offensive content' },
  { key: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

/** The details box's limit, as the column's (ChatReport.MaxDetailsLength). */
export const REPORT_DETAILS_MAX = 1000;

export function reportThread(entryId: string, reason: ReportReason, details: string): Promise<{ reportedAtUtc: string }> {
  return postJson(`/api/chat/threads/${entryId}/report`, { reason, details: details.trim() || null });
}

// ---------------------------------------------------------------- opening

/**
 * How a page opens the dock on a conversation — the "Message" buttons on
 * the opportunity page. A window event, so the button needs no handle on
 * the dock, which sits outside every page in the providers.
 */
export const CHAT_OPEN_EVENT = 'wp:chat-open';

export function openChat(entryId: string): void {
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT, { detail: { entryId } }));
}

/** The name of a closed conversation's reason, for the notice under it. */
export function closedReason(thread: ChatThread): string {
  if (thread.opportunity.status === 'cancelled') return 'The opportunity was cancelled.';
  switch (thread.entryStatus) {
    case 'withdrawn':
      return thread.seat === 'freelancer' ? 'You withdrew from this opportunity.' : 'They withdrew from this opportunity.';
    case 'removed':
      return thread.seat === 'freelancer' ? 'Your entry was removed.' : 'Their entry was removed.';
    case 'deselected':
      return thread.seat === 'freelancer' ? 'Your selection was taken back.' : 'Their selection was taken back.';
    default:
      return 'This conversation is closed.';
  }
}

// ------------------------------------------------------------- moderation

/**
 * A conversation as an administrator lists it: both people, the
 * opportunity, how many lines and when the last was said — never what.
 */
export type AdminConversation = {
  entryId: string;
  opportunity: { slug: string; title: string; status: string };
  client: ChatParty;
  freelancer: ChatParty;
  entryStatus: string;
  /** Whether the two can still add to it. */
  open: boolean;
  messages: number;
  lastAtUtc: string | null;
  lastFrom: 'client' | 'freelancer' | null;
  /** Reports on it nobody has reviewed yet. */
  openReports: number;
};

/** A member's report of a conversation, and what became of it. */
export type AdminReport = {
  id: string;
  from: 'client' | 'freelancer';
  reporterName: string;
  reason: string;
  reasonLabel: string;
  details: string | null;
  createdAtUtc: string;
  resolvedAtUtc: string | null;
  resolvedByName: string | null;
  resolution: string | null;
};

export type AdminConversations = { items: AdminConversation[]; nextCursor: string | null };

export type AdminLine = {
  id: string;
  body: string;
  from: 'client' | 'freelancer';
  createdAtUtc: string;
  readAtUtc: string | null;
};

/** One page of a conversation as an administrator reads it, newest first. */
export type AdminConversationPage = {
  conversation: AdminConversation;
  /** Every report on it, open ones first; on the first page only. */
  reports: AdminReport[];
  items: AdminLine[];
  nextCursor: string | null;
};

export const adminChatKeys = {
  all: ['admin', 'conversations'] as const,
  list: (q: string, member: string | null, reported: boolean) => ['admin', 'conversations', q, member, reported] as const,
  one: (entryId: string) => ['admin', 'conversation', entryId] as const,
};

export async function fetchAdminConversations(
  q: string,
  member: string | null,
  reported: boolean,
  cursor: string | null,
): Promise<AdminConversations> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (member) params.set('member', member);
  if (reported) params.set('reported', 'true');
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  const res = await apiFetch(`/api/admin/conversations${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error('The conversations could not be loaded.');
  return res.json();
}

/** Every page fetched is a "Read a conversation" row in the activity log. */
export async function fetchAdminConversation(entryId: string, cursor: string | null): Promise<AdminConversationPage> {
  const res = await apiFetch(
    cursor
      ? `/api/admin/conversations/${entryId}?cursor=${encodeURIComponent(cursor)}`
      : `/api/admin/conversations/${entryId}`,
  );
  if (res.status === 404) throw new Error('There is no such conversation.');
  if (!res.ok) throw new Error('The conversation could not be loaded.');
  return res.json();
}

/** The conversation's open reports marked reviewed; each reporter is told it was, and nothing more. */
export function resolveReports(entryId: string, note: string): Promise<{ resolved: number }> {
  return postJson(`/api/admin/conversations/${entryId}/reports/resolve`, { note: note.trim() || null });
}
