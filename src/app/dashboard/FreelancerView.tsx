'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { ActivityChart, SplitChart } from '@/components/dashboard/charts';
import {
  ActivityFeed,
  AttentionList,
  FigureLink,
  MoneyPanel,
  NEW_TAB,
  NewTabHint,
  Panel,
  ProgressCard,
  ProgressRow,
  StatCard,
  StatGrid,
  tallyAction,
} from '@/components/dashboard/kit';
import LivePulse from '@/components/LivePulse';
import { count, deadlineLabel, formatAward, ordinal, pulseState, relativeTime, standingLabel } from '@/lib/opportunities';
import { matchesWords, noMatch, percent, type DashLens, type FreelancerDashboard } from '@/lib/dashboard';
import { linkIf, linkTo } from '@/lib/links';
import { myProfileQuery } from '@/lib/profile';

// Where the figures open: the entries report, which reads its filters from
// the address (lib/links.ts), so it opens narrowed to what was counted. A
// freelancer's report holds only their own entries.
const ENTRIES = '/reports/entries';

/** Activity's series, in the API's order: milestones claimed (the entries they were claimed on), opportunities entered. */
const ACTIVITY_LINKS = [
  (day: string) => linkTo(ENTRIES, { claimed: day }),
  (day: string) => linkTo(ENTRIES, { entered: day }),
];

/** The opportunities decided while they were still in: won or not. */
const DECIDED = { result: ['won', 'lost'] };

/**
 * The outcome slices, in the API's order: in progress, won, not selected,
 * withdrawn, removed, selection taken back, cancelled. A selection taken
 * back leaves nothing on their entries report — the application is where
 * they read it — so that slice opens nothing.
 */
const OUTCOME_LINKS: (string | null)[] = [
  linkTo(ENTRIES, { status: 'active', result: ['open', 'reviewing'] }),
  linkTo(ENTRIES, { result: 'won' }),
  linkTo(ENTRIES, { result: 'lost' }),
  linkTo(ENTRIES, { status: 'withdrawn' }),
  linkTo(ENTRIES, { status: 'removed' }),
  null,
  linkTo(ENTRIES, { result: 'cancelled' }),
];

/**
 * A half-written portfolio, said once at the top of the dashboard. It is the
 * cheapest thing an entrant can do to change how their entries read, and the
 * one thing nobody thinks to go back to. Silent at 100%.
 */
function ProfileNudge() {
  const { data } = useQuery(myProfileQuery);
  if (!data || data.merit.completeness >= 100) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
      <i className="pi pi-id-card text-xl text-[var(--primary-color)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Your profile is {data.merit.completeness}% written
        </p>
        <p className="text-sm text-[var(--text-color-secondary)]">
          It is what a client reads beside your board — and it is worth up to{' '}
          {data.merit.portfolio.available} of your merit score, of which you have{' '}
          {data.merit.portfolio.earned}.
        </p>
      </div>
      <Link href="/profile" {...NEW_TAB} className="no-underline">
        <Button label="Finish it" icon="pi pi-pencil" size="small" outlined />
      </Link>
    </div>
  );
}

type Entry = FreelancerDashboard['progress'][number];

/** One entry in flight — the same facts whether it is drawn as a row or a card. */
function entryProps(e: Entry) {
  return {
    href: `/opportunities/${e.slug}`,
    title: e.title,
    meta: `${formatAward(e.awardAmount, e.currency)}${
      e.deadlineUtc ? ` · ${deadlineLabel(e.deadlineUtc)}` : ''
    }${
      e.lastPushAtUtc
        ? ` · ${e.delivery === 'upload' ? 'uploaded' : 'pushed'} ${relativeTime(e.lastPushAtUtc)}`
        : e.delivery === 'upload'
          ? ' · nothing uploaded yet'
          : ' · no pushes yet'
    }${
      // Their own place on the board, in the board's own words.
      e.standing
        ? ` · ${ordinal(e.standing.rank)} of ${e.standing.of}, ${standingLabel(e.standing.band).toLowerCase()}`
        : ''
    }`,
    claimed: e.claimed,
    possible: e.possible,
    trailing: (
      <span className="inline-flex items-center gap-2">
        <LivePulse state={pulseState(e)} />
        {e.repoFullName ? (
          <span className="text-[var(--text-color-secondary)]">
            <i className="pi pi-github mr-1 text-xs" aria-hidden />
            {e.repoFullName.split('/')[1]}
          </span>
        ) : e.delivery === 'upload' ? (
          // No repository exists to be pending — the work is files.
          <span className="text-[var(--text-color-secondary)]">
            <i className="pi pi-upload mr-1 text-xs" aria-hidden />
            files
          </span>
        ) : (
          <Tag value="repo pending" severity="warning" />
        )}
      </span>
    ),
  };
}

/**
 * The freelancer's landing screen: what is in flight, how far along it is,
 * and what has actually been earned. Only their own entries — the portal
 * deliberately never shows one entrant another entrant's work or progress.
 *
 * Every figure opens what it counts, in a new tab: an entry its opportunity, the
 * rest their entries report, narrowed to the figure.
 */
export default function FreelancerView({ data, lens }: { data: FreelancerDashboard; lens: DashLens }) {
  const h = data.headline;
  const earned = data.money.reduce((sum, m) => sum + m.paid, 0);
  const pending = data.money.reduce((sum, m) => sum + m.outstanding, 0);
  const primaryCurrency = data.money[0]?.currency ?? 'USD';

  // The search narrows the lists; the tiles, charts and money above and
  // beside them keep counting everything.
  const searching = lens.words.length > 0;
  const m = (...fields: (string | null | undefined)[]) => matchesWords(lens.words, ...fields);
  const attention = data.attention.filter((a) => m(a.title, a.detail));
  const progress = data.progress.filter((e) =>
    m(e.title, e.status, e.repoFullName, e.delivery === 'upload' ? 'files' : null),
  );
  const deadlines = data.deadlines.filter((d) => m(d.title));
  const recent = data.recent.filter((r) => m(r.text, r.detail));

  return (
    <div className="flex flex-col gap-4">
      <ProfileNudge />
      <StatGrid title="At a glance">
        <StatCard
          label="Active entries"
          value={h.activeEntries}
          sub={<FigureLink href={linkIf(h.totalEntries, ENTRIES)}>{h.totalEntries} entered in total</FigureLink>}
          icon="pi pi-flag"
          tone="accent"
          href="/entries"
        />
        <StatCard
          label="Milestones claimed"
          value={h.milestonesClaimed}
          sub={`of ${h.milestonesPossible} across your entries · ${percent(
            h.milestonesClaimed,
            h.milestonesPossible,
          )}%`}
          icon="pi pi-check-circle"
          tone="ok"
          help="dashboard.milestonesClaimed"
          href={ENTRIES}
        />
        <StatCard
          label="Win rate"
          value={h.decided === 0 ? '—' : `${h.winRate}%`}
          sub={
            h.decided === 0 ? (
              'No opportunity you entered has been decided yet'
            ) : (
              <>
                <FigureLink href={linkIf(h.wins, linkTo(ENTRIES, { result: 'won' }))}>{h.wins} won</FigureLink> of{' '}
                <FigureLink href={linkTo(ENTRIES, DECIDED)}>{h.decided} decided</FigureLink>
              </>
            )
          }
          icon="pi pi-trophy"
          tone={h.wins > 0 ? 'ok' : 'neutral'}
          help="dashboard.winRate"
          href={h.decided > 0 ? linkTo(ENTRIES, DECIDED) : ENTRIES}
        />
        <StatCard
          label="Earned"
          value={formatAward(earned, primaryCurrency)}
          sub={
            pending > 0 ? (
              <FigureLink href={linkTo(ENTRIES, { award: 'unpaid' })}>
                {formatAward(pending, primaryCurrency)} awaiting payment
              </FigureLink>
            ) : (
              'Awards paid to you'
            )
          }
          icon="pi pi-wallet"
          tone={pending > 0 ? 'warn' : 'ok'}
          help="dashboard.earned"
          href={linkTo(ENTRIES, { award: 'paid' })}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Your activity — last 30 days" help="dashboard.activity" className="lg:col-span-2">
          <ActivityChart data={data.activity} links={ACTIVITY_LINKS} />
        </Panel>

        <Panel
          title="Needs you"
          help="dashboard.attention"
          action={tallyAction(searching, attention.length, data.attention.length)}
        >
          <AttentionList
            items={attention}
            empty={searching && data.attention.length > 0 ? noMatch(lens) : undefined}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Entries in flight"
          help="dashboard.entryProgress"
          className="lg:col-span-2"
          action={tallyAction(
            searching,
            progress.length,
            data.progress.length,
            <Link href="/entries" {...NEW_TAB} className="no-underline">
              <Button label="All entries" size="small" text />
            </Link>,
          )}
        >
          {data.progress.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium">Nothing in flight</p>
              <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
                Only the winner is paid, but every entry builds a public track record.
              </p>
              <Link href="/opportunities" {...NEW_TAB} className="no-underline">
                <Button label="Browse opportunities" icon="pi pi-search" size="small" outlined className="mt-4" />
              </Link>
            </div>
          ) : progress.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">{noMatch(lens)}</p>
          ) : lens.view === 'cards' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {progress.map((e) => (
                <ProgressCard key={e.slug} {...entryProps(e)} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              {progress.map((e) => (
                <ProgressRow key={e.slug} {...entryProps(e)} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Entry outcomes" help="dashboard.outcomes">
          {/* Seven slices, one tone each, in the API's order: in progress,
              won, not selected, withdrawn, removed, selection taken back,
              cancelled. A tone short and the list wraps — cancelled would
              wear the accent, which reads as a good outcome. Taken back is
              the quieter grey beside not selected: neither was a verdict. */}
          <SplitChart
            split={data.outcomeSplit}
            tones={['accent', 'ok', 'neutral', 'warn', 'danger', 'neutralSoft', 'accentSoft']}
            centerLabel="entries"
            links={OUTCOME_LINKS}
            totalHref={ENTRIES}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Awards won" help="dashboard.earned">
          <MoneyPanel
            money={data.money}
            unpaidLabel="Awaiting payment"
            links={(currency) => ({
              all: linkTo(ENTRIES, { award: ['unpaid', 'paid'], currency }),
              paid: linkTo(ENTRIES, { award: 'paid', currency }),
              unpaid: linkTo(ENTRIES, { award: 'unpaid', currency }),
            })}
          />
        </Panel>

        <Panel
          title="Next deadlines"
          help="dashboard.deadlines"
          action={tallyAction(searching, deadlines.length, data.deadlines.length)}
        >
          {data.deadlines.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">
              No open opportunities with a deadline.
            </p>
          ) : deadlines.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">{noMatch(lens)}</p>
          ) : (
            <ul className="flex flex-col">
              {deadlines.map((d) => (
                <li key={d.slug} className="border-b border-[var(--surface-border)] last:border-0">
                  <Link
                    href={`/opportunities/${d.slug}`}
                    {...NEW_TAB}
                    className="flex items-center gap-3 px-2 py-2.5 no-underline transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-[var(--text-color)]">{d.title}</p>
                      <p className="text-xs text-[var(--text-color-secondary)]">
                        {d.claimed}/{count(d.possible, 'milestone')} claimed
                      </p>
                    </div>
                    <LivePulse state={pulseState({ status: 'open', deadlineUtc: d.deadlineUtc })} />
                    <span className="shrink-0 text-xs font-medium text-[var(--primary-color)]">
                      {deadlineLabel(d.deadlineUtc)}
                    </span>
                    <NewTabHint />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Your recent claims"
          help="dashboard.recent"
          action={tallyAction(searching, recent.length, data.recent.length)}
        >
          <ActivityFeed
            items={recent}
            empty={
              searching && data.recent.length > 0
                ? noMatch(lens)
                : 'No claims yet — push a tag m1 from inside your repo to stamp the first one.'
            }
          />
        </Panel>
      </div>
    </div>
  );
}
