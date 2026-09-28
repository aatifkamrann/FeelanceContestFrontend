'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import SiteHeader from '@/components/SiteHeader';
import { DashboardSkeleton } from '@/components/dashboard/kit';
import { meQuery } from '@/lib/opportunities';
import { dashboardQuery, type DashLens } from '@/lib/dashboard';
import AdminView from './AdminView';
import ClientView from './ClientView';
import FreelancerView from './FreelancerView';

type View = DashLens['view'];
const VIEW_OPTIONS = [
  { icon: 'pi pi-th-large', value: 'cards', label: 'Cards' },
  { icon: 'pi pi-list', value: 'list', label: 'List' },
];
/** The dashboard's layout on this device, apart from every other page's. */
const VIEW_KEY = 'wp.dashboard.view';

/**
 * The signed-in home. One request fills whichever view the role selects — the
 * API decides the shape from the session, so this page never asks for numbers
 * the viewer is not entitled to and there is no client-side role check
 * standing in for authorisation.
 *
 * One search narrows every list on the screen as it is typed; the tiles and
 * charts keep counting everything, because they are the state of the portal,
 * not of the search. The layout switch turns the wide lists into cards.
 */
export default function DashboardPage() {
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    ...dashboardQuery,
    enabled: !!me,
  });

  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('list');

  // The layout is a per-device preference, read after mount so the server
  // render and the first client render agree.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'cards') setView(saved);
    } catch {
      /* private mode, or storage blocked */
    }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* fine — it just will not be remembered */
    }
  };

  const lens: DashLens = {
    words: q.trim().toLowerCase().split(/\s+/).filter(Boolean),
    text: q.trim(),
    view,
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {me ? `Welcome back, ${me.displayName.split(' ')[0]}` : 'Dashboard'}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              {data
                ? SUBTITLE[data.role]
                : 'Everything that needs you, and everything that moved since your last visit.'}
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-2">
              <SelectButton
                value={view}
                onChange={(e) => e.value && chooseView(e.value as View)}
                options={VIEW_OPTIONS}
                optionLabel="label"
                itemTemplate={(o: (typeof VIEW_OPTIONS)[number]) => (
                  <i className={o.icon} aria-hidden title={o.label} />
                )}
                allowEmpty={false}
                aria-label="Layout"
              />
              <Button
                label="Refresh"
                icon="pi pi-refresh"
                size="small"
                text
                loading={isFetching}
                onClick={() => void refetch()}
              />
            </div>
          )}
        </div>

        {meLoading || (me && isLoading) ? (
          <DashboardSkeleton />
        ) : !me ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">Sign in to see your dashboard</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Clients see their opportunities and awards, freelancers see their entries and earnings.
            </p>
            <Link href="/login" className="no-underline">
              <Button label="Sign in" className="mt-4" />
            </Link>
          </div>
        ) : isError || !data ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
            <p className="mt-3 font-medium">The dashboard could not be loaded</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Nothing is wrong with your opportunities or entries — this screen only reads them.
            </p>
            <Button label="Try again" className="mt-4" outlined onClick={() => void refetch()} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* No button: every list below narrows as the box is typed in. */}
            <form role="search" onSubmit={(e) => e.preventDefault()} className="flex items-center">
              <span className="relative flex-1">
                <i
                  className="pi pi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-color-secondary)]"
                  aria-hidden
                />
                <InputText
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search this dashboard"
                  className={q ? 'w-full !pl-10 !pr-10' : 'w-full !pl-10'}
                  aria-label="Search this dashboard"
                  enterKeyHint="search"
                />
                {q && (
                  <Button
                    type="button"
                    icon="pi pi-times"
                    aria-label="Clear search"
                    text
                    rounded
                    size="small"
                    className="wp-search-clear"
                    onClick={() => setQ('')}
                  />
                )}
              </span>
            </form>
            {data.role === 'admin' ? (
              <AdminView data={data} lens={lens} />
            ) : data.role === 'client' ? (
              <ClientView data={data} lens={lens} />
            ) : (
              <FreelancerView data={data} lens={lens} />
            )}
          </div>
        )}
      </main>
    </>
  );
}

const SUBTITLE: Record<string, string> = {
  client: 'Your opportunities, your entrants, and what is waiting on a decision.',
  freelancer: 'Your entries, your progress against the board, and what you have earned.',
  admin: 'Portal health, plus both sides of the marketplace.',
};
