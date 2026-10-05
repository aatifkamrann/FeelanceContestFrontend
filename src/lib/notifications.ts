import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { deleteJson, postJson, putJson } from './opportunities';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------- inbox

/** One line behind the bell: what happened, and where a click goes. */
export type InboxLine = {
  id: string;
  /** application_received, award_won, opportunity_open… — picks the icon. */
  kind: string;
  title: string;
  body: string;
  /** Portal-relative; null where there is nowhere to go. */
  path: string | null;
  createdAtUtc: string;
  /** Null while unread. */
  readAtUtc: string | null;
};

export type Inbox = {
  items: InboxLine[];
  unread: number;
  total: number;
  /** The cursor for the page after this one; null on the last. */
  nextCursor: string | null;
};

export async function fetchInbox(cursor?: string | null): Promise<Inbox> {
  const res = await apiFetch(
    cursor ? `/api/notifications/inbox?cursor=${encodeURIComponent(cursor)}` : '/api/notifications/inbox',
  );
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

/**
 * The first page, which is what the bell shows and where its count comes
 * from. Re-read every minute and whenever the tab comes back into view,
 * so a line written while the page sat open shows without a reload.
 */
export const inboxQuery = {
  queryKey: ['inbox'] as const,
  queryFn: () => fetchInbox(),
  staleTime: 30_000,
  refetchInterval: 60_000,
  refetchOnWindowFocus: true,
};

/** Every page so far, for the Notifications page; the same rows, the bell's first. */
export const inboxPagesKey = ['inbox', 'pages'] as const;

export function markLine(id: string, read: boolean): Promise<{ id: string; readAtUtc: string | null }> {
  return putJson(`/api/notifications/inbox/${id}`, { read });
}

export function markInbox(read: boolean): Promise<{ changed: number }> {
  return putJson('/api/notifications/inbox', { read });
}

/**
 * The bell and the page hold the same lines in two caches; a mark shows
 * in both at once, before the server answers, and the counts follow. A
 * refetch after the answer puts the server's own numbers back.
 */
export function patchInbox(queryClient: QueryClient, change: (line: InboxLine) => InboxLine): void {
  const stamp = (page: Inbox): Inbox => {
    const items = page.items.map(change);
    return { ...page, items, unread: page.unread + items.filter((l) => !l.readAtUtc).length - page.items.filter((l) => !l.readAtUtc).length };
  };
  queryClient.setQueryData<Inbox>(inboxQuery.queryKey, (old) => (old ? stamp(old) : old));
  queryClient.setQueryData<InfiniteData<Inbox>>(inboxPagesKey, (old) =>
    old ? { ...old, pages: old.pages.map(stamp) } : old,
  );
}

/** The PrimeIcons glyph for a kind of news; the bell for one nobody drew. */
export function inboxIcon(kind: string): string {
  if (kind === 'application_hired') return 'pi pi-briefcase';
  if (kind === 'milestone_paid') return 'pi pi-wallet';
  if (kind.startsWith('milestone')) return 'pi pi-flag';
  if (kind.startsWith('application')) return 'pi pi-inbox';
  if (kind.startsWith('award') || kind === 'winner_announced') return 'pi pi-trophy';
  if (kind === 'opportunity_open') return 'pi pi-megaphone';
  if (kind === 'opportunity_cancelled') return 'pi pi-ban';
  if (kind.startsWith('opportunity_review')) return 'pi pi-clock';
  if (kind.startsWith('repo') || kind === 'transfer_requested') return 'pi pi-github';
  if (kind === 'rating_received') return 'pi pi-star';
  if (kind.startsWith('identity')) return 'pi pi-id-card';
  if (kind === 'password_changed') return 'pi pi-key';
  if (kind.startsWith('entr')) return 'pi pi-user-minus';
  return 'pi pi-bell';
}

// ---------------------------------------------------------- preferences

/** One browser that asked for push; the endpoint itself stays on the server. */
export type PushDevice = {
  id: string;
  label: string | null;
  createdAtUtc: string;
  /** SHA-256 of the endpoint, so the page can tell its own browser apart. */
  endpointHash: string;
};

export type NotificationPreferences = {
  /** Tell me when an opportunity opens for entry. */
  newOpportunities: boolean;
  /** Tell me when a winner is announced. */
  winners: boolean;
  /** …by email. The one-click unsubscribe in every such email clears this. */
  byEmail: boolean;
  /** The portal's VAPID public key, which a browser subscribes against. */
  pushKey: string | null;
  devices: PushDevice[];
};

export type PreferencesUpdate = Pick<NotificationPreferences, 'newOpportunities' | 'winners' | 'byEmail'>;

export const notificationsQuery = {
  queryKey: ['notifications'] as const,
  queryFn: async (): Promise<NotificationPreferences | null> => {
    const res = await apiFetch('/api/notifications');
    if (!res.ok) return null;
    return res.json();
  },
  staleTime: 30_000,
};

export function savePreferences(update: PreferencesUpdate): Promise<PreferencesUpdate> {
  return putJson<PreferencesUpdate>('/api/notifications', update);
}

export function registerDevice(device: {
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string | null;
}): Promise<{ id: string; endpointHash: string }> {
  return postJson('/api/notifications/devices', device);
}

export function removeDevice(id: string): Promise<void> {
  return deleteJson(`/api/notifications/devices/${id}`);
}

/** The anonymous one-click opt-out an email carries. */
export function unsubscribeByToken(token: string): Promise<{ byEmail: boolean }> {
  return postJson('/api/notifications/unsubscribe', { token });
}
