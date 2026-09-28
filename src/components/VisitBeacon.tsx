'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';

/**
 * Tells the API which page opened, on every navigation, signed in or not —
 * the browsing half of the activity log an administrator reads under
 * Admin → Activity. The path only: never the query string (a reset link's
 * token rides there) and never anything typed. Fire and forget, so a page
 * is never slower for being counted, and a failure is nobody's problem
 * but the log's.
 *
 * Mounted once beside the gates in providers.tsx, so it sees every page.
 */
export default function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    try {
      void apiFetch('/api/activity/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: pathname }),
        // Survives the tab closing mid-request.
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* no fetch — nothing to record it with */
    }
  }, [pathname]);

  return null;
}
