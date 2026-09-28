'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import SiteHeader from '@/components/SiteHeader';
import HelpIcon from '@/components/HelpIcon';
import AwardTimeline from '@/components/AwardTimeline';
import LivePulse from '@/components/LivePulse';
import MatchRing from '@/components/MatchRing';
import StatusTag from '@/components/StatusTag';
import { StandingBadge } from '@/components/StandingBadge';
import { myApplicationsQuery, type MyApplication } from '@/lib/applications';
import {
  meQuery,
  formatAward,
  deadlineLabel,
  relativeTime,
  count,
  pulseState,
  timelineFrom,
  utcMoment,
  type MyEntry,
} from '@/lib/opportunities';
import { apiFetch } from '@/lib/api';

type View = 'cards' | 'list';
const VIEW_OPTIONS = [
  { icon: 'pi pi-th-large', value: 'cards', label: 'Cards' },
  { icon: 'pi pi-list', value: 'list', label: 'List' },
];
/** Its own key: a freelancer may browse as cards and keep their own entries as a list. */
const VIEW_KEY = 'wp.entries.view';

/**
 * What is left of a removed entrant's access to their own repository. The
 * archive already stopped every push; this is the window for getting the
 * work out, and it matters most on the day it is nearly over.
 */
function repoAccessLine(endsAtUtc: string | null): string {
  if (!endsAtUtc) return 'Your repository has been archived.';
  const days = Math.ceil((new Date(endsAtUtc).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'Your repository was archived and your access to it has ended.';
  return (
    `Your repository is archived and read-only. You can still clone it for ${days} more ` +
    `day${days === 1 ? '' : 's'}, until ${utcMoment(endsAtUtc)}.`
  );
}

/**
 * Whether an entry answers the search: every word typed appears in the
 * opportunity's title or the repository's name, in any order, and part of a
 * word counts. A freelancer's entries are all on the page already, so this
 * is read on every keystroke with no request behind it.
 */
function matches(e: MyEntry, words: string[]): boolean {
  if (words.length === 0) return true;
  const known = `${e.opportunity.title} ${e.repoFullName ?? ''}`.toLowerCase();
  return words.every((w) => known.includes(w));
}

/** An application answers the search by its opportunity's title alone — it has no repository yet. */
function applicationMatches(a: MyApplication, words: string[]): boolean {
  if (words.length === 0) return true;
  const known = a.opportunity.title.toLowerCase();
  return words.every((w) => known.includes(w));
}

const BOX =
  'group relative rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5 transition-colors hover:border-[var(--primary-color)]';

export default function MyEntriesPage() {
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const { data: entries, isLoading } = useQuery({
    queryKey: ['my-entries'],
    queryFn: async (): Promise<MyEntry[]> => {
      const res = await apiFetch('/api/entries/mine');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: me?.role === 'freelancer',
  });
  // Their applications, the same read the opportunity page's box makes. The
  // ones waiting on a client, and the ones not selected, are listed above
  // the entries; a selected one *is* an entry, and is not shown twice.
  const { data: applications, isLoading: applicationsLoading } = useQuery({
    ...myApplicationsQuery,
    enabled: me?.role === 'freelancer',
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

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (entries ?? []).filter((e) => matches(e, words));
  // Selected and removed applications are their entry's row — the removal,
  // with its reason, is said there.
  const waiting = (applications ?? []).filter((a) => a.status === 'under_review' || a.status === 'not_selected');
  const shownApplications = waiting.filter((a) => applicationMatches(a, words));
  // The application behind each entry a selection made, for the date on its row.
  const selectedBy = new Map<string, MyApplication>();
  for (const a of applications ?? []) if (a.entryId) selectedBy.set(a.entryId, a);
  const nothingYet = (entries?.length ?? 0) === 0 && waiting.length === 0;
  const grid = view === 'cards' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-3';
  const layout = view === 'cards' ? 'card' : 'row';

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">My Opportunities</h1>

        {meLoading || isLoading || applicationsLoading ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
        ) : !me ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">Sign in to see your entries</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Every opportunity you have applied to or entered — where each application stands, and each entry&rsquo;s
              private repo or files and the milestones claimed so far.
            </p>
            <Link href="/login?next=/entries" className="no-underline">
              <Button label="Sign in" className="mt-4" />
            </Link>
          </div>
        ) : me.role !== 'freelancer' ? (
          // Signed in, but not as a freelancer: telling them to sign in would
          // be telling them to do what they have just done. Point at where
          // their own work lives instead.
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <p className="font-medium">This page is for freelancer accounts</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              {me.role === 'client'
                ? 'Your opportunities, and the entries they have drawn, are under My opportunities.'
                : 'Entries across the portal are on the dashboard.'}
            </p>
            <Link href={me.role === 'client' ? '/client/opportunities' : '/dashboard'} className="no-underline">
              <Button label={me.role === 'client' ? 'My opportunities' : 'Dashboard'} className="mt-4" />
            </Link>
          </div>
        ) : nothingYet ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-flag text-3xl text-[var(--text-color-secondary)]" />
            <p className="mt-3 font-medium">No opportunities yet</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Find an open opportunity and apply — only the winner is paid, but every entry
              builds your track record.
            </p>
            <Link href="/opportunities" className="no-underline">
              <Button label="Browse opportunities" className="mt-4" outlined />
            </Link>
          </div>
        ) : (
          <>
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
                    placeholder="Search My Opportunities"
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
              {words.length > 0
                ? `${shown.length + shownApplications.length} of ${count((entries?.length ?? 0) + waiting.length, 'opportunity', 'opportunities')} match`
                : ''}
            </p>

            {shown.length === 0 && shownApplications.length === 0 ? (
              <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
                <i className="pi pi-search text-3xl text-[var(--text-color-secondary)]" aria-hidden />
                <p className="mt-3 font-medium">No opportunities match</p>
                <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                  None of your opportunities has &ldquo;{q.trim()}&rdquo; in its title or repository.
                </p>
                <Button label="Clear search" icon="pi pi-times" text size="small" className="mt-3" onClick={() => setQ('')} />
              </div>
            ) : (
              <>
                {shownApplications.length > 0 && (
                  <section aria-label="Applications" className="mb-8">
                    <h2 className="mb-3 text-lg font-semibold">
                      Applications
                      <HelpIcon topic="apply.mine" label="Your applications here" />
                    </h2>
                    <div className={grid}>
                      {shownApplications.map((a) => (
                        <ApplicationItem key={a.id} application={a} layout={layout} />
                      ))}
                    </div>
                  </section>
                )}
                {shown.length > 0 && (
                  <section aria-label="Entries">
                    {/* A heading only once there is something above to tell it from. */}
                    {shownApplications.length > 0 && <h2 className="mb-3 text-lg font-semibold">Entries</h2>}
                    <div className={grid}>
                      {shown.map((e) => (
                        <EntryView key={e.id} entry={e} application={selectedBy.get(e.id) ?? null} layout={layout} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

/**
 * One entry, as a card in the grid or a row in the list — the same facts in
 * two shapes. Anywhere on it opens the opportunity: the title's link is
 * stretched over the whole box (a link cannot hold another link, so the box
 * itself cannot be one), and the few things inside that do something of
 * their own — the repository link, the help button, the tag command to
 * copy — sit above that layer and keep working.
 */
function EntryView({
  entry: e,
  application,
  layout,
}: {
  entry: MyEntry;
  /** The application this entry was selected from, where there was one. */
  application: MyApplication | null;
  layout: 'card' | 'row';
}) {
  const card = layout === 'card';

  // The strip the browse card wears: the match at the left, the clock at
  // the right, across the whole box.
  const strip = (
    <div className={`flex items-start justify-between gap-3 ${card ? 'mb-3' : 'basis-full'}`}>
      {e.fit ? <MatchRing fit={e.fit} /> : <span />}
      <LivePulse state={pulseState(e.opportunity)} />
    </div>
  );

  const link = (
    <Link
      href={`/opportunities/${e.opportunity.slug}`}
      className="text-[var(--text-color)] no-underline outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] group-hover:text-[var(--primary-color)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--primary-color)]"
    >
      {e.opportunity.title}
    </Link>
  );

  const metaParts: React.ReactNode[] = [];
  if (!card) metaParts.push(formatAward(e.opportunity.awardAmount, e.opportunity.currency));
  // No username on an upload-only opportunity — none was asked for.
  if (e.githubUsername)
    metaParts.push(
      <>
        entered as <code>{e.githubUsername}</code>
      </>,
    );
  if (e.opportunity.deadlineUtc && e.opportunity.status === 'open') metaParts.push(deadlineLabel(e.opportunity.deadlineUtc));
  const meta = metaParts.length > 0 && (
    <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
      {metaParts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </p>
  );

  const details = (
    <>
      {/* Selection is how an entry is made now; the date is the client's
          decision, and the link is the application they read. */}
      {application?.status === 'selected' && application.decidedAtUtc && (
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          <i className="pi pi-check-circle mr-1" aria-hidden />
          Selected on {utcMoment(application.decidedAtUtc)} from your{' '}
          <Link href={`/opportunities/${e.opportunity.slug}/apply`} className="relative z-10 text-[var(--primary-color)]">
            application
          </Link>
        </p>
      )}
      {/* A repo name alone is not access: the worker records the name
          as soon as GitHub creates the repo, but the entrant is only
          invited once the whole provisioning finishes. Until then the
          opportunity page says "being prepared", and so does this. */}
      {e.repoFullName && e.provisionStatus === 'provisioned' ? (
        <p className="mt-1 text-sm">
          <i className="pi pi-github mr-1" aria-hidden />
          {/* overflow-wrap:anywhere, not break-all: a repo name breaks at its
              hyphens first, and mid-word only when a segment is wider
              than the line. */}
          <a
            href={`https://github.com/${e.repoFullName}`}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 [overflow-wrap:anywhere] text-[var(--primary-color)]"
          >
            {e.repoFullName}
          </a>
          {e.status === 'active' && e.opportunity.status === 'open' && (
            <span className="relative z-10 ml-2 text-[var(--text-color-secondary)]">
              claim with <code className="text-xs">git tag m1</code>
              <HelpIcon topic="entry.claimMilestone" label="Claiming milestones" />
            </span>
          )}
        </p>
      ) : e.opportunity.delivery === 'upload' ? (
        // No repository exists to be on its way — the work is files,
        // handed in on the opportunity page.
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          <i className="pi pi-upload mr-1" aria-hidden />
          {e.filesUploaded === 0 ? 'nothing handed in yet' : `${count(e.filesUploaded, 'file')} handed in`}
        </p>
      ) : e.status !== 'active' || e.opportunity.status !== 'open' ? (
        // A repo still on its way, or one that could not be made,
        // only matters while the opportunity is open: afterwards
        // nothing would be built in it anyway.
        null
      ) : e.provisionStatus === 'pending' ? (
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          <i className="pi pi-github mr-1" aria-hidden />
          private repo being prepared…
        </p>
      ) : e.provisionStatus === 'failed' ? (
        <p className="mt-1 text-sm">
          <i className="pi pi-exclamation-triangle mr-1 text-amber-500" aria-hidden />
          Your repository could not be created — the operator has been notified and it will be retried.
        </p>
      ) : null}
      {e.won && (
        <p className="mt-1 text-sm">
          <i className="pi pi-trophy mr-1 text-[var(--primary-color)]" aria-hidden />
          {e.awardPaidAtUtc
            ? `Award paid ${new Date(e.awardPaidAtUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
            : "Awaiting the client's payment"}
        </p>
      )}
      {e.status === 'active' && e.milestoneCount > 0 && (
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          {e.milestonesDone} of {count(e.milestoneCount, 'milestone')} claimed
          {e.lastPushAtUtc &&
            ` · last ${e.opportunity.delivery === 'upload' ? 'upload' : 'push'} ${relativeTime(e.lastPushAtUtc)}`}
        </p>
      )}
      {/* Their place on a live board — the same number the
          opportunity page orders by; the sums open on that page. */}
      {e.standing && (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--text-color-secondary)]">Standing</span>
          <StandingBadge score={e.standing.score} band={e.standing.band} rank={e.standing.rank} of={e.standing.of} />
        </p>
      )}
      {/* The client's reason, word for word. The email carried it
          once; this is the only place it can be read back. */}
      {e.status === 'removed' && (
        <div className="mt-2 rounded-lg border border-red-500/40 bg-[var(--surface-hover)] p-3 text-sm">
          <p className="font-medium">
            Removed from this opportunity
            {e.removedAtUtc && ` on ${utcMoment(e.removedAtUtc)}`}
          </p>
          {e.removedReason && <p className="mt-1 italic">“{e.removedReason}”</p>}
          <p className="mt-1 text-[var(--text-color-secondary)]">
            {e.repoFullName ? repoAccessLine(e.repoAccessEndsAtUtc) : 'No repository had been created for this entry.'}{' '}
            You cannot enter this opportunity again; every other opportunity is unaffected, and this does not appear on your
            public record.
          </p>
        </div>
      )}
    </>
  );

  // The opportunity's state first: an active entry on an awarded or cancelled
  // opportunity is over, whatever the entry says.
  const tags = (
    <div className={`flex flex-wrap items-center gap-2 ${card ? 'mt-auto pt-4' : 'sm:justify-end'}`}>
      <StatusTag status={e.opportunity.status} />
      {e.status === 'removed' ? (
        <Tag value="Removed" severity="danger" icon="pi pi-ban" rounded />
      ) : e.status !== 'active' ? (
        <Tag value="Withdrawn" severity="warning" rounded />
      ) : e.opportunity.status === 'awarded' ? (
        // "Awarded" alone leaves the entrant guessing who; say it.
        e.won ? (
          <Tag value="You won" severity="success" icon="pi pi-trophy" rounded />
        ) : (
          <Tag
            value="Not selected"
            rounded
            style={{ background: 'var(--surface-border)', color: 'var(--text-color-secondary)' }}
          />
        )
      ) : e.opportunity.status === 'cancelled' ? null : (
        <Tag value="Active" severity="success" rounded />
      )}
    </div>
  );

  if (card) {
    return (
      <article className={`${BOX} flex h-full flex-col`}>
        {strip}
        <AwardTimeline
          awardAmount={e.opportunity.awardAmount}
          currency={e.opportunity.currency}
          fromUtc={timelineFrom(e.opportunity.startsAtUtc, e.opportunity.publishedAtUtc)}
          deadlineUtc={e.opportunity.deadlineUtc}
        />
        <h2 className="mt-2 line-clamp-2 text-lg font-semibold leading-snug">{link}</h2>
        {meta}
        {details}
        {tags}
      </article>
    );
  }

  return (
    <article className={`${BOX} flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4`}>
      {strip}
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{link}</h2>
        {meta}
        {details}
      </div>
      {tags}
    </article>
  );
}

/**
 * One application, in the same two shapes as an entry: the ring and the
 * clock across the top, the title over the opportunity's figures, where it
 * stands in one line, and the tags. Anywhere on it opens the application
 * as it was filed and where it stands — the page the last step left off on.
 */
function ApplicationItem({ application: a, layout }: { application: MyApplication; layout: 'card' | 'row' }) {
  const card = layout === 'card';
  const open = a.opportunity.status === 'open';

  const strip = (
    <div className={`flex items-start justify-between gap-3 ${card ? 'mb-3' : 'basis-full'}`}>
      {a.fit ? <MatchRing fit={a.fit} /> : <span />}
      <LivePulse state={pulseState(a.opportunity)} />
    </div>
  );

  const link = (
    <Link
      href={`/opportunities/${a.opportunity.slug}/apply`}
      className="text-[var(--text-color)] no-underline outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] group-hover:text-[var(--primary-color)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--primary-color)]"
    >
      {a.opportunity.title}
    </Link>
  );

  const metaParts: React.ReactNode[] = [];
  if (!card) metaParts.push(formatAward(a.opportunity.awardAmount, a.opportunity.currency));
  metaParts.push(`applied ${relativeTime(a.submittedAtUtc)}`);
  if (a.opportunity.deadlineUtc && open) metaParts.push(deadlineLabel(a.opportunity.deadlineUtc));
  const meta = (
    <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
      {metaParts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          {part}
        </Fragment>
      ))}
    </p>
  );

  // Where it stands: decided, waiting on the client, or overtaken by the
  // opportunity closing first — a decision is only made while it is open.
  const standing =
    a.status === 'not_selected' ? (
      <p className="mt-1 text-sm">
        <i className="pi pi-flag mr-1 text-[var(--text-color-secondary)]" aria-hidden />
        Not selected{a.decidedAtUtc && ` on ${utcMoment(a.decidedAtUtc)}`}. This is not held against you, and
        every other opportunity is unaffected.
      </p>
    ) : !open ? (
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        <i className="pi pi-lock mr-1" aria-hidden />
        The opportunity closed before the client decided — nothing more happens to this application.
      </p>
    ) : (
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        <i className="pi pi-clock mr-1" aria-hidden />
        {a.evaluationPending ? 'Being evaluated, then with the client to decide.' : 'With the client to decide.'}
      </p>
    );

  // What was sent, in the three figures the client's row leads with.
  const figures = (
    <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
      {a.match}% match · {count(a.portfolioCount, 'project')} attached · {a.hoursPerWeek} hrs/week
    </p>
  );

  const tags = (
    <div className={`flex flex-wrap items-center gap-2 ${card ? 'mt-auto pt-4' : 'sm:justify-end'}`}>
      <StatusTag status={a.opportunity.status} />
      {a.status === 'not_selected' || !open ? (
        <Tag
          value={a.status === 'not_selected' ? 'Not selected' : 'Not decided'}
          rounded
          style={{ background: 'var(--surface-border)', color: 'var(--text-color-secondary)' }}
        />
      ) : (
        <Tag value="Under review" severity="info" icon="pi pi-clock" rounded />
      )}
    </div>
  );

  if (card) {
    return (
      <article className={`${BOX} flex h-full flex-col`}>
        {strip}
        <AwardTimeline
          awardAmount={a.opportunity.awardAmount}
          currency={a.opportunity.currency}
          fromUtc={timelineFrom(a.opportunity.startsAtUtc, a.opportunity.publishedAtUtc)}
          deadlineUtc={a.opportunity.deadlineUtc}
        />
        <h2 className="mt-2 line-clamp-2 text-lg font-semibold leading-snug">{link}</h2>
        {meta}
        {standing}
        {figures}
        {tags}
      </article>
    );
  }

  return (
    <article className={`${BOX} flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4`}>
      {strip}
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{link}</h2>
        {meta}
        {standing}
        {figures}
      </div>
      {tags}
    </article>
  );
}
