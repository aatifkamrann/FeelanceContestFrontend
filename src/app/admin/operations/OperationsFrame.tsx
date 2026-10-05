'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { SelectButton } from 'primereact/selectbutton';
import HelpIcon from '@/components/HelpIcon';
import SiteHeader from '@/components/SiteHeader';
import { DashboardSkeleton } from '@/components/dashboard/kit';
import { operationsQuery, type AdminOperations } from '@/lib/admin';
import { meQuery } from '@/lib/opportunities';

export type OperationsView = 'cards' | 'list';
const VIEW_OPTIONS = [
  { icon: 'pi pi-th-large', value: 'cards', label: 'Cards' },
  { icon: 'pi pi-list', value: 'list', label: 'List' },
];
/** The layout on this device, apart from every other page's — one for all five operations pages. */
const VIEW_KEY = 'wp.operations.view';

/**
 * The stretched link a card opens its opportunity by: the title's link is laid
 * over the whole card, and the one button inside sits above it. A link
 * cannot hold a button, so the card itself cannot be the link.
 */
export const STRETCHED =
  "text-[var(--text-color)] no-underline outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] group-hover:text-[var(--primary-color)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--primary-color)]";
export const CARD = 'flex w-full flex-col rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4';
const CARD_GRID = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';

/**
 * What every operations page shares: the one request behind all five (each
 * page shows its part of it, so moving between them reads the cache), the
 * remembered layout, the action runner and the search. Every word typed must
 * appear somewhere in what a row is known by, in any order, and part of a
 * word counts; everything is on the page, so it is read on every keystroke
 * with no request behind it.
 */
export function useOperations() {
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const query = useQuery({ ...operationsQuery, enabled: me?.role === 'admin' });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState<OperationsView>('list');

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
  const chooseView = (v: OperationsView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* fine — it just will not be remembered */
    }
  };

  const act = async (id: string, run: () => Promise<unknown>, doneMessage: string) => {
    setBusyId(id);
    setError(null);
    setDone(null);
    try {
      await run();
      setDone(doneMessage);
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const matches = (...fields: (string | null | undefined)[]) => {
    if (!searching) return true;
    const known = fields.filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => known.includes(w));
  };

  return {
    me,
    meLoading,
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: () => void query.refetch(),
    view,
    chooseView,
    busyId,
    act,
    error,
    done,
    q,
    setQ,
    searching,
    matches,
    noneMatch: `Nothing here matches “${q.trim()}”.`,
  };
}

export type Operations = ReturnType<typeof useOperations>;

/**
 * One operations page: its heading and help, the layout switch where the
 * page has cards, Refresh, what the last action did, the search that
 * narrows the page, and the page's own content once the console has
 * loaded. Only an administrator gets past the lock.
 */
export default function OperationsFrame({
  ops,
  path,
  title,
  help,
  intro,
  cards = true,
  actions,
  search,
  shown,
  total,
  noun,
  children,
}: {
  ops: Operations;
  /** This page's address, for the sign-in link's way back. */
  path: string;
  title: string;
  help: string;
  intro: string;
  /** Whether the page offers cards beside its table. */
  cards?: boolean;
  /** The page's own buttons, beside Refresh. */
  actions?: React.ReactNode;
  search: string;
  /** Rows left by the search, and rows in all — the tally beside the box while searching. */
  shown: number;
  total: number;
  noun: [one: string, several: string];
  children: (data: AdminOperations) => React.ReactNode;
}) {
  const { me, meLoading, data } = ops;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              {title}
              <HelpIcon topic={help} label={title} />
            </h1>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">{intro}</p>
          </div>
          {data && (
            <div className="flex items-center gap-2">
              {actions}
              {cards && (
                <SelectButton
                  value={ops.view}
                  onChange={(e) => e.value && ops.chooseView(e.value as OperationsView)}
                  options={VIEW_OPTIONS}
                  optionLabel="label"
                  itemTemplate={(o: (typeof VIEW_OPTIONS)[number]) => (
                    <i className={o.icon} aria-hidden title={o.label} />
                  )}
                  allowEmpty={false}
                  aria-label="Layout"
                />
              )}
              <Button
                label="Refresh"
                icon="pi pi-refresh"
                size="small"
                text
                loading={ops.isFetching}
                onClick={ops.refetch}
              />
            </div>
          )}
        </div>

        {ops.error && <Message severity="error" text={ops.error} className="mb-4 w-full justify-start" />}
        {ops.done && !ops.error && <Message severity="success" text={ops.done} className="mb-4 w-full justify-start" />}

        {meLoading || (me?.role === 'admin' && ops.isLoading) ? (
          <DashboardSkeleton />
        ) : me?.role !== 'admin' ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">This screen is for portal administrators</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              {me ? 'Your account does not have the admin role.' : 'Sign in with the admin account to continue.'}
            </p>
            {!me && (
              <Link href={`/login?next=${path}`} className="no-underline">
                <Button label="Sign in" size="small" outlined className="mt-4" />
              </Link>
            )}
          </div>
        ) : ops.isError || !data ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <p className="font-medium">This page could not load</p>
            <Button label="Try again" size="small" outlined className="mt-4" onClick={ops.refetch} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* No button: the page narrows as the box is typed in. */}
            <form role="search" onSubmit={(e) => e.preventDefault()} className="flex items-center gap-3">
              <span className="relative flex-1">
                <i
                  className="pi pi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-color-secondary)]"
                  aria-hidden
                />
                <InputText
                  value={ops.q}
                  onChange={(e) => ops.setQ(e.target.value)}
                  placeholder={search}
                  className={ops.q ? 'w-full !pl-10 !pr-10' : 'w-full !pl-10'}
                  aria-label={`Search ${title.toLowerCase()}`}
                  enterKeyHint="search"
                />
                {ops.q && (
                  <Button
                    type="button"
                    icon="pi pi-times"
                    aria-label="Clear search"
                    text
                    rounded
                    size="small"
                    className="wp-search-clear"
                    onClick={() => ops.setQ('')}
                  />
                )}
              </span>
              {ops.searching && (
                <span className="whitespace-nowrap text-xs tabular-nums text-[var(--text-color-secondary)]">
                  {shown} of {total}
                </span>
              )}
            </form>
            <p className="sr-only" aria-live="polite">
              {ops.searching ? `${many(shown, noun[0], noun[1])} match` : ''}
            </p>
            <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
              {children(data)}
            </section>
          </div>
        )}
      </main>
    </>
  );
}

/** "1 repository", "3 repositories" — nouns whose plural is not an s. */
export function many(n: number, one: string, several: string): string {
  return `${n} ${n === 1 ? one : several}`;
}

/** A page's rows as cards, or the page's own empty line. */
export function Cards({ items, empty }: { items: React.ReactNode[]; empty: string }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">{empty}</p>;
  }
  return (
    <ul role="list" className={CARD_GRID}>
      {items}
    </ul>
  );
}
