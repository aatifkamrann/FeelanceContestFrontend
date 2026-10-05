'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import HelpIcon from '@/components/HelpIcon';
import ChatConversation from '@/components/chat/ChatConversation';
import { useChatLive } from '@/components/chat/ChatLive';
import ChatThreadList from '@/components/chat/ChatThreadList';
import { CHAT_OPEN_EVENT, threadsQuery } from '@/lib/chat';
import { meQuery } from '@/lib/opportunities';

/**
 * The conversations at the corner of every page: a button with the unread
 * count on it, and behind it the list of conversations and the one that
 * is open — the same lines the Messages page shows, in less room. It
 * exists only for a client or a freelancer with a conversation to have:
 * an entrant of theirs, or an opportunity they entered. The "Message"
 * buttons on the opportunity page open it on a conversation by event.
 * On the Messages page itself it steps aside — but keeps its socket,
 * the one per tab that refreshes the page's list and conversation too.
 */
export default function ChatDock() {
  const pathname = usePathname();
  const { data: me } = useQuery(meQuery);
  const eligible = !!me && (me.role === 'client' || me.role === 'freelancer');
  const { data } = useQuery({ ...threadsQuery, enabled: eligible });
  useChatLive(eligible);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const entryId = (e as CustomEvent<{ entryId: string }>).detail?.entryId;
      if (!entryId) return;
      setSelected(entryId);
      setOpen(true);
    };
    window.addEventListener(CHAT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CHAT_OPEN_EVENT, onOpen);
  }, []);

  // Escape closes, wherever focus is inside the dock.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!eligible || pathname === '/messages') return null;
  const threads = data?.items ?? [];
  // No conversation to have: no button. A page that asked for one by
  // event still gets it — the list may not have caught up yet.
  if (threads.length === 0 && !selected) return null;

  const unread = data?.unread ?? 0;
  const badge = unread > 99 ? '99+' : unread > 0 ? String(unread) : null;
  const label = unread === 0 ? 'Messages' : `Messages, ${unread} unread`;

  return (
    <div className="wp-chat-dock" data-open={open || undefined}>
      {open && (
        <section
          className="wp-chat-panel"
          role="dialog"
          aria-label="Messages"
        >
          {selected ? (
            <ChatConversation entryId={selected} compact onBack={() => setSelected(null)} />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--surface-border)] px-3 py-1.5">
                <h2 className="m-0 text-sm font-semibold">
                  Messages
                  {unread > 0 && (
                    <span className="ml-2 text-xs font-medium text-[var(--text-color-secondary)]">{unread} unread</span>
                  )}
                  <HelpIcon topic="chat.messages" label="Messages" />
                </h2>
                <div className="flex items-center">
                  <Link href="/messages" className="no-underline" onClick={() => setOpen(false)}>
                    <Button icon="pi pi-external-link" text rounded size="small" aria-label="Open the Messages page" tooltip="All messages" tooltipOptions={{ position: 'left' }} />
                  </Link>
                  <Button icon="pi pi-times" text rounded size="small" aria-label="Close messages" onClick={() => setOpen(false)} className="wp-chat-close" />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ChatThreadList threads={threads} selected={selected} onSelect={setSelected} />
              </div>
            </div>
          )}
        </section>
      )}

      <span className="relative inline-flex">
        <Button
          icon={open ? 'pi pi-times' : 'pi pi-comments'}
          rounded
          aria-label={open ? 'Close messages' : label}
          aria-expanded={open}
          aria-haspopup="dialog"
          tooltip={open ? undefined : label}
          tooltipOptions={{ position: 'left' }}
          onClick={() => setOpen((o) => !o)}
          className="wp-chat-button"
        />
        {badge && !open && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-[var(--red-500)] px-1 text-[0.65rem] font-bold leading-none text-white ring-2 ring-[var(--surface-card)]"
          >
            {badge}
          </span>
        )}
      </span>
    </div>
  );
}
