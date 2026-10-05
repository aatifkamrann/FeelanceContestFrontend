'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { apiUrl } from '@/lib/api';
import { chatKeys } from '@/lib/chat';

/**
 * The signed-in member's ear on their conversations. The hub never
 * carries data — a "chatChanged" nudge means "refetch", and the queries
 * behind the dock and the Messages page re-read through the same API they
 * already trust, so there is no payload to merge and nothing to get out
 * of sync. Without a connection the polling interval still brings every
 * line; it is just slower.
 *
 * Mount it once, where the dock is: one socket per tab, whatever page.
 */
export function useChatLive(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const connection = new HubConnectionBuilder()
      // Same origin — Caddy (or the dev rewrite) routes it — unless the API
      // has a hostname of its own; the cookie travels either way.
      .withUrl(apiUrl('/api/live/chat'), { withCredentials: true })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.None)
      .build();

    const nudged = () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all });
    };
    connection.on('chatChanged', nudged);
    // Whatever landed while we were away.
    connection.onreconnected(nudged);
    connection.start().catch(() => {
      /* no realtime today; the queries still poll */
    });

    return () => {
      connection.stop().catch(() => {});
    };
  }, [enabled, queryClient]);
}
