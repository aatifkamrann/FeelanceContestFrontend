'use client';

import Avatar from '@/components/Avatar';
import { type ChatThread } from '@/lib/chat';
import { relativeTime } from '@/lib/opportunities';

/**
 * The conversations, newest first: who, about which opportunity, the last
 * thing said and how much is unread. One list for the dock and the
 * Messages page; the page just gives it more room.
 */
export default function ChatThreadList({
  threads,
  selected,
  onSelect,
}: {
  threads: ChatThread[];
  selected: string | null;
  onSelect: (entryId: string) => void;
}) {
  if (threads.length === 0) return <ChatEmpty />;
  return (
    <ul className="m-0 flex list-none flex-col p-0" aria-label="Conversations">
      {threads.map((t) => {
        const active = t.entryId === selected;
        return (
          <li key={t.entryId}>
            <button
              type="button"
              onClick={() => onSelect(t.entryId)}
              aria-current={active ? 'true' : undefined}
              className={`flex w-full items-start gap-3 border-0 border-b border-solid border-[var(--surface-border)] px-3 py-2.5 text-left transition-colors ${
                active ? 'bg-[var(--highlight-bg)]' : 'bg-transparent hover:bg-[var(--surface-hover)]'
              }`}
            >
              <Avatar name={t.other.displayName} url={t.other.avatarUrl} size="sm" className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${t.unread > 0 ? 'font-semibold' : 'font-medium'}`}>
                    {t.other.displayName}
                  </span>
                  {t.last && (
                    <span className="shrink-0 text-[0.7rem] text-[var(--text-color-secondary)]">
                      {relativeTime(t.last.atUtc)}
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-[var(--text-color-secondary)]">{t.opportunity.title}</span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-xs ${
                      t.unread > 0 ? 'text-[var(--text-color)]' : 'text-[var(--text-color-secondary)]'
                    }`}
                  >
                    {t.last ? (
                      <>
                        {t.last.mine && <span className="text-[var(--text-color-secondary)]">You: </span>}
                        {t.last.excerpt}
                      </>
                    ) : t.canSend ? (
                      <em>No messages yet</em>
                    ) : (
                      <em>Closed</em>
                    )}
                  </span>
                  {t.unread > 0 && (
                    <span
                      aria-label={`${t.unread} unread`}
                      className="grid h-[1.125rem] min-w-[1.125rem] shrink-0 place-items-center rounded-full bg-[var(--primary-color)] px-1 text-[0.65rem] font-bold leading-none text-[var(--primary-color-text)]"
                    >
                      {t.unread > 99 ? '99+' : t.unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function ChatEmpty({ seat }: { seat?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <i className="pi pi-comments text-3xl text-[var(--text-color-secondary)]" aria-hidden />
      <p className="mt-3 text-sm font-medium">No conversations yet</p>
      <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
        {seat === 'client'
          ? 'A conversation opens with each entrant the moment they join one of your opportunities.'
          : 'A conversation with the client opens the moment you join an opportunity.'}
      </p>
    </div>
  );
}
