'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { OverlayPanel } from 'primereact/overlaypanel';
import { InboxEmpty, InboxLines, MarkAllButtons, useInboxMarks } from '@/components/InboxList';
import { inboxQuery } from '@/lib/notifications';

/**
 * The bell in the header: the unread count on it, and behind it the
 * newest lines of the inbox — a click on one reads it and goes where it
 * points. The two buttons at the top mark everything; the two links at
 * the foot lead to the whole inbox and to the switches that decide what
 * arrives in it.
 */
export default function NotificationBell() {
  const panel = useRef<OverlayPanel>(null);
  const { data, isError } = useQuery(inboxQuery);
  const { mark, markAll, error } = useInboxMarks();

  const unread = data?.unread ?? 0;
  const badge = unread > 99 ? '99+' : unread > 0 ? String(unread) : null;
  const label = unread === 0 ? 'Notifications' : `Notifications, ${unread} unread`;

  return (
    <>
      <span className="relative inline-flex">
        <Button
          icon="pi pi-bell"
          text
          rounded
          severity="secondary"
          aria-label={label}
          aria-haspopup="dialog"
          tooltip={label}
          tooltipOptions={{ position: 'bottom' }}
          onClick={(e) => panel.current?.toggle(e)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') panel.current?.hide();
          }}
        />
        {badge && (
          // The count sits on the bell's shoulder; the label above says it in words.
          <span
            aria-hidden
            className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-[var(--primary-color)] px-1 text-[0.65rem] font-bold leading-none text-[var(--primary-color-text)] ring-2 ring-[var(--surface-card)]"
          >
            {badge}
          </span>
        )}
      </span>

      <OverlayPanel ref={panel} dismissable className="max-w-[calc(100vw-1rem)]">
        <div className="flex w-[24rem] max-w-full flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              Notifications
              {unread > 0 && (
                <span className="ml-2 text-xs font-medium text-[var(--text-color-secondary)]">{unread} unread</span>
              )}
            </h2>
            <MarkAllButtons unread={unread} total={data?.total ?? 0} markAll={markAll} />
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {isError ? (
              <p className="px-2 py-6 text-center text-sm text-[var(--text-color-secondary)]">
                Your notifications could not be loaded.
              </p>
            ) : !data ? (
              <p className="px-2 py-6 text-center text-sm text-[var(--text-color-secondary)]">Loading…</p>
            ) : data.items.length === 0 ? (
              <InboxEmpty compact />
            ) : (
              <InboxLines lines={data.items} mark={mark} onFollow={() => panel.current?.hide()} />
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-[var(--surface-border)] pt-2">
            <Link href="/notifications" className="no-underline" onClick={() => panel.current?.hide()}>
              <Button
                label={data?.nextCursor ? 'See all' : 'Open inbox'}
                icon="pi pi-list"
                size="small"
                text
              />
            </Link>
            <Link href="/notifications?tab=settings" className="no-underline" onClick={() => panel.current?.hide()}>
              <Button label="Settings" icon="pi pi-cog" size="small" text aria-label="Notification settings" />
            </Link>
          </div>
        </div>
      </OverlayPanel>
    </>
  );
}
