'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { apiUrl } from '@/lib/api';

/**
 * The page's ear on the live board. The hub never carries data — a
 * "opportunityChanged" nudge means "refetch", and router.refresh() re-runs the
 * server render that is already the single source of truth. So there is
 * nothing here to get out of sync: no payload to merge, no cell to patch.
 *
 * Mount it once per opportunity page. With `badge` it renders the small “live”
 * pill — shown only while the watch is actually established, because a
 * liveness indicator that lies is worse than none. Without a connection the
 * page is exactly what it was before this component existed.
 */
export default function LiveOpportunity({ slug, badge = false }: { slug: string; badge?: boolean }) {
  const router = useRouter();
  const [watching, setWatching] = useState(false);
  // useRef, not useState: refresh() must see the latest timer across renders.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let disposed = false;
    const connection = new HubConnectionBuilder()
      // Same origin — Caddy (or the dev rewrite) routes it — unless the API
      // has a hostname of its own; the cookie travels either way.
      .withUrl(apiUrl('/api/live/opportunities'), { withCredentials: true })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.None)
      .build();

    // A burst — an entrant pushing five tags — becomes one refresh.
    const nudged = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 800);
    };
    connection.on('opportunityChanged', nudged);

    const watch = () =>
      connection
        .invoke('Watch', slug)
        .then(() => {
          if (!disposed) setWatching(true);
        })
        .catch(() => {
          /* not watchable (or hub too old) — the page still works, unlabelled */
        });

    connection.onreconnecting(() => setWatching(false));
    connection.onclose(() => setWatching(false));
    connection.onreconnected(() => {
      // Group membership died with the old connection; re-watch, and refresh
      // once for whatever happened while we were away.
      watch();
      nudged();
    });

    connection.start().then(watch).catch(() => {
      /* no realtime today; the board is still correct on every reload */
    });

    return () => {
      disposed = true;
      if (timer.current) clearTimeout(timer.current);
      connection.stop().catch(() => {});
    };
  }, [slug, router]);

  if (!badge || !watching) return null;
  return (
    <span
      className="ml-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--surface-border)] px-2 py-0.5 align-middle text-xs font-normal text-[var(--text-color-secondary)]"
      title="Updates by itself — claims, entries, and the winner appear as they happen."
    >
      <span
        className="h-2 w-2 rounded-full bg-[var(--primary-color)] motion-safe:animate-pulse"
        aria-hidden
      />
      live
    </span>
  );
}
