'use client';

import Link from 'next/link';
import { Button } from 'primereact/button';
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
import StatusTag from '@/components/StatusTag';
import { count, deadlineLabel, formatAward, pulseState } from '@/lib/opportunities';
import { matchesWords, noMatch, percent, type ClientDashboard, type DashLens } from '@/lib/dashboard';
import { linkIf, linkTo } from '@/lib/links';

type Posted = ClientDashboard['progress'][number];

// Where the figures open: the reports, which read their filters from the
// address (lib/links.ts), so each opens narrowed to what was counted. A
// client's reports hold only their own opportunities.
const OPPORTUNITIES = '/reports/opportunities';
const APPLICATIONS = '/reports/applications';
const ENTRIES = '/reports/entries';

/** Applications waiting: under review, on an opportunity still open. */
const WAITING = { status: 'under_review', opportunityStatus: 'open' };
/**
 * The entrants the headline counts: still in, on an opportunity open, in review
 * or awarded — a cancelled opportunity's are history.
 */
const COUNTED_ENTRIES = { status: 'active', result: ['open', 'reviewing', 'won', 'lost'] };
/** The opportunity mix's slices, in the API's order. */
const MIX_STATUSES = ['open', 'reviewing', 'awarded', 'draft', 'cancelled'];
/** Activity's series, in the API's order: entries received, milestones claimed (the entries that claimed them). */
const ACTIVITY_LINKS = [
  (day: string) => linkTo(ENTRIES, { entered: day }),
  (day: string) => linkTo(ENTRIES, { claimed: day }),
];

/** One posted opportunity's progress — the same facts whether drawn as a row or a card. */
function opportunityProps(c: Posted) {
  return {
    href: `/opportunities/${c.slug}`,
    title: c.title,
    meta: `${count(c.entrants, 'entrant')}${
      c.deadlineUtc ? ` · ${deadlineLabel(c.deadlineUtc)}` : ''
    }${
      // Who leads the board, and how many rows need a look.
      c.leader ? ` · ${c.leader.name} leads at ${c.leader.score}` : ''
    }${c.atRisk > 0 ? ` · ${c.atRisk} at risk` : ''}`,
    claimed: c.claimed,
    possible: c.possible,
    trailing: (
      <span className="inline-flex items-center gap-2">
        <LivePulse state={pulseState(c)} />
        <StatusTag status={c.status} />
      </span>
    ),
  };
}

/**
 * The client's landing screen: the money first, then who turned up, then what
 * is waiting on a decision. Everything on it is a projection of the opportunities
 * they posted — a client never sees another client's numbers.
 *
 * Every figure opens what it counts, in a new tab: an opportunity its page, the
 * rest the reports, narrowed to the figure.
 */
export default function ClientView({ data, lens }: { data: ClientDashboard; lens: DashLens }) {
  const h = data.headline;
  const outstanding = data.money.reduce((sum, m) => sum + m.outstanding, 0);
  const primaryCurrency = data.money[0]?.currency ?? 'USD';

  // The search narrows the lists; the tiles, charts and money keep counting
  // everything.
  const searching = lens.words.length > 0;
  const m = (...fields: (string | null | undefined)[]) => matchesWords(lens.words, ...fields);
  const attention = data.attention.filter((a) => m(a.title, a.detail));
  const progress = data.progress.filter((c) => m(c.title, c.status, c.leader?.name));
  const deadlines = data.deadlines.filter((d) => m(d.title));
  const recent = data.recent.filter((r) => m(r.text, r.detail));

  return (
    <div className="flex flex-col gap-4">
      <StatGrid title="At a glance" columns={5}>
        <StatCard
          label="Live opportunities"
          value={h.liveOpportunities}
          sub={
            <>
              <FigureLink href={linkIf(h.inReview, linkTo(OPPORTUNITIES, { status: 'reviewing' }))}>
                {h.inReview} in review
              </FigureLink>
              {' · '}
              <FigureLink href={linkIf(h.awarded, linkTo(OPPORTUNITIES, { status: 'awarded' }))}>
                {h.awarded} awarded
              </FigureLink>
              {h.drafts > 0 && (
                <>
                  {' · '}
                  <FigureLink href={linkTo(OPPORTUNITIES, { status: 'draft' })}>{h.drafts} draft</FigureLink>
                </>
              )}
            </>
          }
          icon="pi pi-megaphone"
          tone="accent"
          href="/client/opportunities"
        />
        {/* Applicants waiting on a decision. One opportunity with some is a
            link straight to it, where the decision is made; several open
            the applications report, and each is a row in Needs you. */}
        <StatCard
          label="Applications waiting"
          value={h.applicationsWaiting}
          sub={
            h.applicationsWaiting === 0 ? (
              'Nothing under review on your open opportunities'
            ) : (
              <>
                Under review on{' '}
                <FigureLink href={linkTo(APPLICATIONS, WAITING)}>{count(data.waiting.length, 'opportunity', 'opportunities')}</FigureLink> —
                select or not on the opportunity page
              </>
            )
          }
          icon="pi pi-inbox"
          tone={h.applicationsWaiting > 0 ? 'warn' : 'neutral'}
          help="dashboard.applicationsWaiting"
          href={data.waiting.length === 1 ? `/opportunities/${data.waiting[0].slug}` : linkTo(APPLICATIONS, WAITING)}
        />
        <StatCard
          label="Entrants"
          value={h.entrants}
          sub={`${h.avgEntrants} per published opportunity on average`}
          icon="pi pi-users"
          tone="neutral"
          help="dashboard.entrants"
          href={linkTo(ENTRIES, COUNTED_ENTRIES)}
        />
        {/* The entries report carries each entry's claims beside its milestones. */}
        <StatCard
          label="Milestones claimed"
          value={h.milestonesClaimed}
          sub={`of ${h.milestonesPossible} possible · ${percent(h.milestonesClaimed, h.milestonesPossible)}%`}
          icon="pi pi-check-circle"
          tone="ok"
          help="dashboard.milestonesClaimed"
          href={linkTo(ENTRIES, COUNTED_ENTRIES)}
        />
        <StatCard
          label="Award outstanding"
          value={formatAward(outstanding, primaryCurrency)}
          sub={outstanding > 0 ? 'Announced but not yet paid' : 'Every announced award is paid'}
          icon="pi pi-wallet"
          tone={outstanding > 0 ? 'warn' : 'ok'}
          help="dashboard.awardOutstanding"
          href={linkTo(OPPORTUNITIES, { award: outstanding > 0 ? 'unpaid' : ['unpaid', 'paid'] })}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Activity — last 30 days"
          help="dashboard.activity"
          className="lg:col-span-2"
        >
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
          title="Opportunity progress"
          help="dashboard.opportunityProgress"
          className="lg:col-span-2"
          action={tallyAction(
            searching,
            progress.length,
            data.progress.length,
            <Link href="/client/opportunities" {...NEW_TAB} className="no-underline">
              <Button label="All opportunities" size="small" text />
            </Link>,
          )}
        >
          {data.progress.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium">No published opportunities yet</p>
              <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
                Post a brief with an award and milestones — the board fills in as entrants push tags.
              </p>
              <Link href="/client/opportunities/new" {...NEW_TAB} className="no-underline">
                <Button label="Post an opportunity" icon="pi pi-plus" size="small" className="mt-4" />
              </Link>
            </div>
          ) : progress.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">{noMatch(lens)}</p>
          ) : lens.view === 'cards' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {progress.map((c) => (
                <ProgressCard key={c.slug} {...opportunityProps(c)} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              {progress.map((c) => (
                <ProgressRow key={c.slug} {...opportunityProps(c)} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Opportunity mix" help="dashboard.opportunityMix">
          <SplitChart
            split={data.statusSplit}
            tones={['accent', 'warn', 'ok', 'neutral', 'danger']}
            centerLabel="opportunities"
            links={MIX_STATUSES.map((status) => linkTo(OPPORTUNITIES, { status }))}
            totalHref={OPPORTUNITIES}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Award value" help="dashboard.awardValue">
          <MoneyPanel
            money={data.money}
            unpaidLabel="Outstanding"
            links={(currency) => ({
              all: linkTo(OPPORTUNITIES, { award: ['unpaid', 'paid'], currency }),
              paid: linkTo(OPPORTUNITIES, { award: 'paid', currency }),
              unpaid: linkTo(OPPORTUNITIES, { award: 'unpaid', currency }),
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
                        {d.entrants} entrant{d.entrants === 1 ? '' : 's'}
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
          title="Recent progress"
          help="dashboard.recent"
          action={tallyAction(searching, recent.length, data.recent.length)}
        >
          <ActivityFeed
            items={recent}
            empty={
              searching && data.recent.length > 0
                ? noMatch(lens)
                : 'No milestones claimed yet — they appear here the moment a tag lands.'
            }
          />
        </Panel>
      </div>
    </div>
  );
}
