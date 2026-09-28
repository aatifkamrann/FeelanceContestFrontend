'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { TabPanel, TabView } from 'primereact/tabview';
import SiteHeader from '@/components/SiteHeader';
import { meQuery, type Me } from '@/lib/opportunities';
import ChangePassword from './ChangePassword';
import NotificationInbox from './NotificationInbox';
import NotificationSettings from './NotificationSettings';

/**
 * The inbox on one tab, the switches and the account's password on the
 * other. Reached from the bell
 * in the header, from the nudge on the feed, and from the foot of every
 * email these settings produce; `?tab=settings` opens on the switches.
 */
export default function NotificationsPage() {
  const { data: me, isLoading } = useQuery(meQuery);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          What happened on your opportunities, and the moment an opportunity opens or a winner is announced &mdash; here,
          by email, by push, or all three. Nothing is sent until you ask for it.
        </p>

        <div className="mt-6">
          {isLoading ? (
            <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
          ) : !me ? (
            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
              <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
              <p className="mt-3 font-medium">Sign in to see your notifications</p>
              <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                Members can be told the moment an opportunity opens or a winner is announced. Joining is
                free.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Link href="/login?next=%2Fnotifications" className="no-underline">
                  <Button label="Sign in" icon="pi pi-sign-in" />
                </Link>
                <Link href="/register?next=%2Fnotifications" className="no-underline">
                  <Button label="Create an account" icon="pi pi-user-plus" outlined />
                </Link>
              </div>
            </div>
          ) : (
            <Suspense fallback={null}>
              <Tabs me={me} />
            </Suspense>
          )}
        </div>
      </main>
    </>
  );
}

function Tabs({ me }: { me: Me }) {
  // The bell's Settings link opens on the switches; every other way in
  // opens on the inbox.
  const wanted = useSearchParams().get('tab') === 'settings' ? 1 : 0;
  const [active, setActive] = useState(wanted);
  return (
    <TabView activeIndex={active} onTabChange={(e) => setActive(e.index)}>
      <TabPanel header="Inbox" leftIcon="pi pi-inbox mr-2">
        <NotificationInbox />
      </TabPanel>
      <TabPanel header="Settings" leftIcon="pi pi-cog mr-2">
        <NotificationSettings me={me} />
        <ChangePassword />
      </TabPanel>
    </TabView>
  );
}
