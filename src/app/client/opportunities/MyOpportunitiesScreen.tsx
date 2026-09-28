'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { SelectButton } from 'primereact/selectbutton';
import SiteHeader from '@/components/SiteHeader';
import HelpIcon from '@/components/HelpIcon';
import AwardTimeline from '@/components/AwardTimeline';
import LivePulse from '@/components/LivePulse';
import StatusTag from '@/components/StatusTag';
import NotAClient from '@/components/NotAClient';
import {
  meQuery,
  formatAward,
  deadlineLabel,
  count,
  pulseState,
  timelineFrom,
  type MyOpportunity,
} from '@/lib/opportunities';
import { apiFetch, apiUrl } from '@/lib/api';

type View = 'cards' | 'list';
const VIEW_OPTIONS = [
  { icon: 'pi pi-th-large', value: 'cards', label: 'Cards' },
  { icon: 'pi pi-list', value: 'list', label: 'List' },
];
/** Its own key: the same person may browse the feed as cards and keep their own posts as a list. */
const VIEW_KEY = 'wp.client-opportunities.view';

export default function MyOpportunitiesScreen() {
  const { data: me, isLoading: meLoading } = useQuery(meQuery);

  // The GitHub connect flow lands back here with ?github=…
  // (window.location, not useSearchParams — no Suspense boundary needed).
  const [githubResult, setGithubResult] = useState<string | null>(null);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('github');
    if (result) {
      setGithubResult(result);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  const { data: opportunities, isLoading } = useQuery({
    queryKey: ['my-opportunities'],
    queryFn: async (): Promise<MyOpportunity[]> => {
      const res = await apiFetch('/api/opportunities/mine');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: me?.role === 'client',
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

  // Every word typed must appear in the title, in any order, and part of a
  // word counts. A client's posts are all on the page already, so this is
  // read on every keystroke with no request behind it.
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (opportunities ?? []).filter((c) => {
    const title = c.title.toLowerCase();
    return words.every((w) => title.includes(w));
  });
  // Applicants waiting on a decision, across every open opportunity — the same
  // count as the dashboard's tile. The search narrows the list, not this.
  const open = (opportunities ?? []).filter((c) => c.status === 'open');
  const waitingTotal = open.reduce((sum, c) => sum + c.applicationsWaiting, 0);
  const waitingOpportunities = open.filter((c) => c.applicationsWaiting > 0).length;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">My opportunities</h1>
          {me?.role === 'client' && (
            <Link href="/client/opportunities/new" className="no-underline">
              <Button label="Post an opportunity" icon="pi pi-plus" />
            </Link>
          )}
        </div>

        {githubResult === 'connected' && (
          <Message
            severity="success"
            className="mb-4 w-full"
            text={`GitHub connected${me?.githubLogin ? ` as @${me.githubLogin}` : ''}. Review access and repository handovers use this account.`}
          />
        )}
        {githubResult === 'error' && (
          <Message
            severity="error"
            className="mb-4 w-full"
            text="Connecting GitHub did not complete — try again, and check the portal's GitHub settings if it keeps failing."
          />
        )}
        {githubResult === 'unconfigured' && (
          <Message
            severity="warn"
            className="mb-4 w-full"
            text="The portal's GitHub App is not configured yet, so accounts cannot be connected. An administrator sets this up under Settings → GitHub."
          />
        )}

        {meLoading || isLoading ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
        ) : me?.role !== 'client' ? (
          <NotAClient
            me={me}
            next="/client/opportunities"
            title="Sign in to see your opportunities"
            detail="Every brief you have posted, with its entrants and milestones. Posting one needs a client account."
          />
        ) : (
          <>
            {/* Where the portal has no GitHub App the connect flow only
                bounces back with a warning — the opportunity page keeps quiet
                about connecting in that case, and so does this list. */}
            {me.githubLogin ? (
              <p className="mb-4 text-sm text-[var(--text-color-secondary)]">
                <i className="pi pi-github mr-1" aria-hidden />
                Connected as <code>@{me.githubLogin}</code>
              </p>
            ) : me.githubConfigured ? (
              <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5">
                <i className="pi pi-github text-2xl" aria-hidden />
                {/* The text keeps a readable width and the button wraps under
                    it on a phone, rather than the text shrinking to a word a
                    line beside the button. */}
                <div className="min-w-[14rem] flex-1">
                  <p className="font-medium">
                    Connect your GitHub account
                    <HelpIcon topic="github.connect" label="Connecting GitHub" />
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                    Needed twice per opportunity: read access to review the entries, and the
                    winning repository transfers to it. Connecting proves the account is
                    yours — nothing is typed, so nothing can be mistyped.
                  </p>
                </div>
                <a href={apiUrl('/api/github/connect?next=%2Fclient%2Fopportunities')} className="no-underline">
                  <Button label="Connect GitHub" icon="pi pi-github" outlined />
                </a>
              </div>
            ) : null}
          </>
        )}
        {meLoading || isLoading || me?.role !== 'client' ? null : !opportunities || opportunities.length === 0 ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-megaphone text-3xl text-[var(--text-color-secondary)]" />
            <p className="mt-3 font-medium">Nothing posted yet</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Write a brief, set a fixed award, and freelancers compete to build it.
            </p>
          </div>
        ) : (
          <>
            {/* Amber while anyone is waiting; a quiet zero otherwise, and
                nothing at all with no open opportunity to apply to. */}
            {open.length > 0 && (
              <p
                className={`mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-4 py-3 text-sm ${
                  waitingTotal > 0
                    ? 'border-amber-400/70 bg-amber-100/70 dark:border-amber-500/50 dark:bg-amber-500/10'
                    : 'border-[var(--surface-border)] bg-[var(--surface-card)] text-[var(--text-color-secondary)]'
                }`}
              >
                <i
                  className={`pi pi-inbox ${waitingTotal > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}
                  aria-hidden
                />
                <span>
                  <strong className="tabular-nums text-[var(--text-color)]">{waitingTotal}</strong>{' '}
                  {waitingTotal === 1 ? 'application' : 'applications'} waiting
                  {waitingTotal > 0
                    ? ` on ${count(waitingOpportunities, 'opportunity', 'opportunities')} — select or not on each opportunity page`
                    : ' on your open opportunities'}
                </span>
                <HelpIcon topic="dashboard.applicationsWaiting" label="Applications waiting" />
              </p>
            )}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {/* No button: the list narrows as the box is typed in. */}
              <form role="search" onSubmit={(ev) => ev.preventDefault()} className="flex flex-1 items-center">
                <span className="relative flex-1">
                  <i
                    className="pi pi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-color-secondary)]"
                    aria-hidden
                  />
                  <InputText
                    value={q}
                    onChange={(ev) => setQ(ev.target.value)}
                    placeholder="Search my opportunities"
                    className={q ? 'w-full !pl-10 !pr-10' : 'w-full !pl-10'}
                    aria-label="Search my opportunities"
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
              <SelectButton
                value={view}
                onChange={(ev) => ev.value && chooseView(ev.value as View)}
                options={VIEW_OPTIONS}
                optionLabel="label"
                itemTemplate={(o: (typeof VIEW_OPTIONS)[number]) => (
                  <i className={o.icon} aria-hidden title={o.label} />
                )}
                allowEmpty={false}
                aria-label="Layout"
              />
            </div>
            <p className="sr-only" aria-live="polite">
              {words.length > 0 ? `${shown.length} of ${count(opportunities.length, 'opportunity', 'opportunities')} match` : ''}
            </p>

            {shown.length === 0 ? (
              <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
                <i className="pi pi-search text-3xl text-[var(--text-color-secondary)]" aria-hidden />
                <p className="mt-3 font-medium">No opportunities match</p>
                <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                  None of your opportunities has &ldquo;{q.trim()}&rdquo; in its title.
                </p>
                <Button label="Clear search" icon="pi pi-times" text size="small" className="mt-3" onClick={() => setQ('')} />
              </div>
            ) : view === 'cards' ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((c) => (
                  <PostedOpportunity key={c.id} opportunity={c} layout="card" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {shown.map((c) => (
                  <PostedOpportunity key={c.id} opportunity={c} layout="row" />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

/**
 * One posted opportunity, as a card in the grid or a row in the list. Anywhere
 * on it opens the opportunity — a draft in its editor, anything published on its
 * page. The title's link is stretched over the whole box (a link cannot
 * hold the edit button's link, so the box itself cannot be one), and the
 * edit button sits above that layer and keeps working.
 */
function PostedOpportunity({ opportunity: c, layout }: { opportunity: MyOpportunity; layout: 'card' | 'row' }) {
  const card = layout === 'card';
  const draft = c.status === 'draft';
  // Applicants waiting on this opportunity's decision, beside its status.
  const waiting = c.status === 'open' && c.applicationsWaiting > 0 && (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
      <i className="pi pi-inbox text-xs" aria-hidden />
      {c.applicationsWaiting} {c.applicationsWaiting === 1 ? 'application' : 'applications'} waiting
    </span>
  );

  const link = (
    <Link
      href={draft ? `/client/opportunities/${c.id}/edit` : `/opportunities/${c.slug}`}
      className="text-[var(--text-color)] no-underline outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] group-hover:text-[var(--primary-color)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--primary-color)]"
    >
      {c.title}
    </Link>
  );

  const meta = (
    <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
      {!card && `${formatAward(c.awardAmount, c.currency)} · `}
      {count(c.entrantCount, 'entrant')} · {count(c.milestoneCount, 'milestone')}
      {c.deadlineUtc && c.status === 'open' && ` · ${deadlineLabel(c.deadlineUtc)}`}
    </p>
  );

  const edit = draft && (
    <Link href={`/client/opportunities/${c.id}/edit`} className="relative z-10 no-underline">
      <Button icon="pi pi-pencil" text size="small" aria-label={`Edit ${c.title}`} />
    </Link>
  );

  const box =
    'group relative rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5 transition-colors hover:border-[var(--primary-color)]';

  if (card) {
    return (
      <article className={`${box} flex h-full flex-col`}>
        <div className="mb-3 flex justify-end">
          <LivePulse state={pulseState(c)} />
        </div>
        <AwardTimeline
          awardAmount={c.awardAmount}
          currency={c.currency}
          fromUtc={timelineFrom(c.startsAtUtc, c.publishedAtUtc)}
          deadlineUtc={c.deadlineUtc}
        />
        <h2 className="mt-2 line-clamp-2 text-lg font-semibold leading-snug">{link}</h2>
        {meta}
        <div className="mt-auto flex items-center gap-2 pt-4">
          <StatusTag status={c.status} />
          {waiting}
          {edit && <span className="ml-auto">{edit}</span>}
        </div>
      </article>
    );
  }

  return (
    <article className={`${box} flex flex-wrap items-center gap-4`}>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{link}</h2>
        {meta}
      </div>
      <LivePulse state={pulseState(c)} />
      <StatusTag status={c.status} />
      {waiting}
      {edit}
    </article>
  );
}
