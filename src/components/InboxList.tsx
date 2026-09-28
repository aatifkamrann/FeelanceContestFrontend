'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { relativeTime } from '@/lib/opportunities';
import { inboxIcon, inboxQuery, markInbox, markLine, patchInbox, type InboxLine } from '@/lib/notifications';

/**
 * What the bell's panel and the Notifications page both do with the
 * inbox: the two buttons that mark everything, and the lines. A click on
 * a line marks it read and follows its link; the small circle at its end
 * flips it back to unread, or reads it without going anywhere. Every mark
 * shows at once and the server is told; a refused one is put back.
 */
export function useInboxMarks() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const settle = async (work: Promise<unknown>) => {
    setError(null);
    try {
      await work;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change could not be saved.');
    } finally {
      // The server's own count and stamps, whatever happened.
      await queryClient.invalidateQueries({ queryKey: inboxQuery.queryKey });
    }
  };

  const mark = (line: InboxLine, read: boolean) => {
    if (read === !!line.readAtUtc) return Promise.resolve();
    const now = new Date().toISOString();
    patchInbox(queryClient, (l) => (l.id === line.id ? { ...l, readAtUtc: read ? now : null } : l));
    return settle(markLine(line.id, read));
  };

  const markAll = (read: boolean) => {
    const now = new Date().toISOString();
    patchInbox(queryClient, (l) => ({ ...l, readAtUtc: read ? (l.readAtUtc ?? now) : null }));
    return settle(markInbox(read));
  };

  return { mark, markAll, error };
}

/** "All read" and "All unread", each disabled when it would change nothing. */
export function MarkAllButtons({
  unread,
  total,
  markAll,
}: {
  unread: number;
  total: number;
  markAll: (read: boolean) => Promise<void>;
}) {
  return (
    <span className="flex items-center gap-1">
      <Button
        label="All read"
        icon="pi pi-check-circle"
        size="small"
        text
        disabled={unread === 0}
        onClick={() => void markAll(true)}
        aria-label="Mark every notification read"
      />
      <Button
        label="All unread"
        icon="pi pi-circle"
        size="small"
        text
        disabled={total === 0 || unread === total}
        onClick={() => void markAll(false)}
        aria-label="Mark every notification unread"
      />
    </span>
  );
}

/**
 * The lines. Unread ones are bold with a dot; the whole line is the
 * link, so a keyboard reaches it as one control. Where a line has
 * nowhere to go, the click only reads it.
 */
export function InboxLines({
  lines,
  mark,
  onFollow,
}: {
  lines: InboxLine[];
  mark: (line: InboxLine, read: boolean) => Promise<void>;
  /** Called as a line's link is followed — the panel closes itself here. */
  onFollow?: () => void;
}) {
  return (
    <ul className="divide-y divide-[var(--surface-border)]">
      {lines.map((line) => {
        const unread = !line.readAtUtc;
        const inner = (
          <>
            <span
              className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                unread
                  ? 'bg-[color-mix(in_srgb,var(--primary-color)_14%,transparent)] text-[var(--primary-color)]'
                  : 'bg-[var(--surface-ground)] text-[var(--text-color-secondary)]'
              }`}
              aria-hidden
            >
              <i className={`${inboxIcon(line.kind)} text-sm`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm leading-snug ${unread ? 'font-semibold text-[var(--text-color)]' : 'text-[var(--text-color)]'}`}>
                {line.title}
              </span>
              <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--text-color-secondary)]">{line.body}</span>
              <span className="mt-1 block text-xs text-[var(--text-color-secondary)]">
                <time dateTime={line.createdAtUtc} title={new Date(line.createdAtUtc).toLocaleString()}>
                  {relativeTime(line.createdAtUtc)}
                </time>
                {unread && (
                  <>
                    {' · '}
                    <span className="font-medium text-[var(--primary-color)]">new</span>
                  </>
                )}
              </span>
            </span>
          </>
        );
        const lineClass = `flex flex-1 items-start gap-3 rounded-lg px-2 py-3 text-left no-underline transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)] ${
          unread ? 'bg-[color-mix(in_srgb,var(--primary-color)_4%,transparent)]' : ''
        }`;
        return (
          <li key={line.id} className="flex items-start">
            {line.path ? (
              <Link
                href={line.path}
                className={lineClass}
                onClick={() => {
                  void mark(line, true);
                  onFollow?.();
                }}
              >
                {inner}
              </Link>
            ) : (
              <button type="button" className={lineClass} onClick={() => void mark(line, true)}>
                {inner}
              </button>
            )}
            {/* The one control that goes the other way; stops nothing
                else, because it sits beside the link, not inside it. */}
            <button
              type="button"
              onClick={() => void mark(line, unread)}
              aria-label={unread ? 'Mark read' : 'Mark unread'}
              title={unread ? 'Mark read' : 'Mark unread'}
              className="mt-3 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--text-color-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--primary-color)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
            >
              <i className={`${unread ? 'pi pi-circle-fill text-[var(--primary-color)]' : 'pi pi-circle'} text-[0.6rem]`} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** What an empty inbox says, and where the switches are. */
export function InboxEmpty({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`text-center ${compact ? 'px-2 py-8' : 'rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10'}`}>
      <i className="pi pi-bell-slash text-3xl text-[var(--text-color-secondary)]" aria-hidden />
      <p className="mt-3 font-medium">Nothing yet</p>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        Whatever happens on your opportunities lands here, and so does every opportunity opening or winner announced
        that you asked to hear about.
      </p>
    </div>
  );
}
