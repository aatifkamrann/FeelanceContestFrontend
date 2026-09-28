'use client';

import { useQuery } from '@tanstack/react-query';
import { brandingQuery } from '@/lib/api';
import { meQuery } from '@/lib/opportunities';

/**
 * The strip under a header while maintenance mode is on. Shown to everyone,
 * admins included — for visitors it explains the errors they are about to
 * hit; for the admin it is the reminder that the switch is still on. Both
 * headers draw it: the portal's (SiteHeader) and the landing page's.
 */
export default function MaintenanceBanner() {
  const { data: me } = useQuery(meQuery);
  const { data: publicInfo } = useQuery(brandingQuery);
  if (!publicInfo?.maintenanceMode) return null;
  return (
    <div
      role="status"
      className="border-t border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-sm text-[var(--text-color)]"
    >
      <i className="pi pi-wrench mr-2 text-amber-600" aria-hidden />
      The portal is in maintenance mode —{' '}
      {me?.role === 'admin'
        ? 'only administrators can use it right now. Turn it off in Settings when you are done.'
        : 'only administrators can use it right now. Please check back shortly.'}
    </div>
  );
}
