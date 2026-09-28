'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InboxEmpty, InboxLines, MarkAllButtons, useInboxMarks } from '@/components/InboxList';
import { fetchInbox, inboxPagesKey } from '@/lib/notifications';

/**
 * The whole inbox, a page at a time — the same lines the bell shows,
 * with the older ones behind "Show older". The counts come with the
 * first page; the marks are the bell's.
 */
export default function NotificationInbox() {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: inboxPagesKey,
    queryFn: ({ pageParam }) => fetchInbox(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
  const { mark, markAll, error } = useInboxMarks();

  if (isLoading) {
    return <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>;
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
        <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
        <p className="mt-3 font-medium">Your notifications could not be loaded</p>
        <Button label="Try again" className="mt-4" outlined onClick={() => void refetch()} />
      </div>
    );
  }

  const first = data.pages[0];
  const lines = data.pages.flatMap((p) => p.items);
  if (lines.length === 0) return <InboxEmpty />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-color-secondary)]">
          {first.unread === 0
            ? `${first.total} ${first.total === 1 ? 'notification' : 'notifications'}, all read.`
            : `${first.unread} unread of ${first.total}.`}
        </p>
        <MarkAllButtons unread={first.unread} total={first.total} markAll={markAll} />
      </div>
      <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-5 py-2">
        <InboxLines lines={lines} mark={mark} />
      </section>
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            label="Show older"
            icon="pi pi-chevron-down"
            text
            loading={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
