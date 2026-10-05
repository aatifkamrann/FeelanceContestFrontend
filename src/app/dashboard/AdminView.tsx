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
  Panel,
  RankCards,
  RankTable,
  StatCard,
  StatGrid,
  tallyAction,
  type RankColumn,
} from '@/components/dashboard/kit';
import { count, formatAward, relativeTime } from '@/lib/opportunities';
import { matchesWords, noMatch, percent, type AdminDashboard, type DashLens } from '@/lib/dashboard';
import { linkIf, linkTo } from '@/lib/links';

const CLIENT_COLUMNS: RankColumn[] = [
  { key: 'name', label: 'Client' },
  { key: 'opportunities', label: 'Opportunities', align: 'right' },
  { key: 'entrants', label: 'Entrants', align: 'right' },
  { key: 'awards', label: 'Awards paid', align: 'right' },
  { key: 'paid', label: 'Paid out', align: 'right' },
  { key: 'last', label: 'Last posted', align: 'right' },
];

const FREELANCER_COLUMNS: RankColumn[] = [
  { key: 'name', label: 'Freelancer' },
  { key: 'entries', label: 'Active entries', align: 'right' },
  { key: 'claims', label: 'Milestones', align: 'right' },
  { key: 'pushes', label: 'Pushes', align: 'right' },
  { key: 'wins', label: 'Wins', align: 'right' },
  { key: 'earned', label: 'Earned', align: 'right' },
];

// Where the figures open. The reports and Users read their filters from the
// address (lib/links.ts), so each list opens narrowed to what was counted.
const USERS = '/admin/users';
const OPPORTUNITIES = '/reports/opportunities';
const APPLICATIONS = '/reports/applications';
const ENTRIES = '/reports/entries';
const REPO_HEALTH = '/admin/operations/repositories';
const AWARD_HANDOVERS = '/admin/operations/awards';
const WEBHOOKS = '/admin/operations/webhooks';

/** Applications waiting: under review, on an opportunity still open. */
const WAITING = { status: 'under_review', opportunityStatus: 'open' };
/** What the repository figures count: active entries on an opportunity with a repository. */
const REPO_ENTRIES = { status: 'active', delivery: ['repository', 'both'] };
/** Every announced award, paid or not. */
const ANNOUNCED = ['unpaid', 'paid'];
/** The opportunity mix's slices, in the API's order. */
const MIX_STATUSES = ['open', 'reviewing', 'awarded', 'draft', 'cancelled'];
/** The provisioning slices, in the API's order. */
const PROVISION_STATES = ['provisioned', 'pending', 'failed'];
/** Portal activity's series, in the API's order: opportunities published, entries, milestones claimed. */
const ACTIVITY_LINKS = [
  (day: string) => linkTo(OPPORTUNITIES, { published: day }),
  (day: string) => linkTo(ENTRIES, { entered: day }),
  // The entries that claimed a milestone that day.
  (day: string) => linkTo(ENTRIES, { claimed: day }),
];
/** Signups' series, in the API's order: clients, freelancers. */
const SIGNUP_LINKS = [
  (day: string) => linkTo(USERS, { role: 'client', joined: day }),
  (day: string) => linkTo(USERS, { role: 'freelancer', joined: day }),
];

/**
 * The operator's screen. Two jobs at once: portal health — the things that
 * quietly break and cost somebody money — and the marketplace itself, seen
 * from both sides, because an administrator fielding a dispute needs the
 * client's numbers and the freelancer's numbers in the same place.
 *
 * Every figure opens what it counts, in a new tab: people in Users, opportunities,
 * applications and entries in the reports, stuck machinery in Operations.
 */
export default function AdminView({ data, lens }: { data: AdminDashboard; lens: DashLens }) {
  const h = data.headline;
  const announced = data.money.reduce((sum, m) => sum + m.announced, 0);
  const outstanding = data.money.reduce((sum, m) => sum + m.outstanding, 0);
  const primaryCurrency = data.money[0]?.currency ?? 'USD';
  const reposPending = h.entries - h.repos - h.reposFailed;
  // The longest any applicant has waited, anywhere: a week without an
  // answer is a client who has stopped reading.
  const oldestWaiting = data.waiting[0]?.oldestUtc ?? null;
  const applicationsStale = oldestWaiting !== null && Date.now() - new Date(oldestWaiting).getTime() >= 7 * 86_400_000;

  // The search narrows the lists; the tiles, charts and money keep counting
  // everything.
  const searching = lens.words.length > 0;
  const m = (...fields: (string | null | undefined)[]) => matchesWords(lens.words, ...fields);
  const attention = data.attention.filter((a) => m(a.title, a.detail));
  const topClients = data.topClients.filter((c) => m(c.name));
  const topFreelancers = data.topFreelancers.filter((f) => m(f.name));
  const recent = data.recent.filter((r) => m(r.text, r.detail));

  // A name opens the account in Users; each figure, the rows it adds up.
  const clientRows = topClients.map((c) => {
    const theirs = { client: c.id };
    return {
      name: (
        <FigureLink href={linkTo(USERS, { user: c.id })} title="Open this account in Users" className="font-medium">
          {c.name}
        </FigureLink>
      ),
      opportunities: <FigureLink href={linkIf(c.opportunities, linkTo(OPPORTUNITIES, theirs))}>{c.opportunities}</FigureLink>,
      entrants: (
        <FigureLink href={linkIf(c.entrants, linkTo(ENTRIES, { ...theirs, status: 'active' }))}>{c.entrants}</FigureLink>
      ),
      awards: (
        <span className={c.awardsPaid < c.awardsAnnounced ? 'text-amber-600 dark:text-amber-400' : ''}>
          <FigureLink href={linkIf(c.awardsAnnounced, linkTo(OPPORTUNITIES, { ...theirs, award: ANNOUNCED }))}>
            {c.awardsPaid}/{c.awardsAnnounced}
          </FigureLink>
        </span>
      ),
      paid: (
        <FigureLink href={linkIf(c.paidValue, linkTo(OPPORTUNITIES, { ...theirs, award: 'paid' }))}>
          {formatAward(c.paidValue, c.currency)}
        </FigureLink>
      ),
      // Newest first is the report's own order, so their latest leads it.
      last: (
        <span className="text-[var(--text-color-secondary)]">
          <FigureLink href={linkTo(OPPORTUNITIES, theirs)}>{relativeTime(c.lastPostedUtc)}</FigureLink>
        </span>
      ),
    };
  });
  const clientsEmpty = searching && data.topClients.length > 0 ? noMatch(lens) : 'No opportunities posted yet.';

  const freelancerRows = topFreelancers.map((f) => {
    const theirs = { entrant: f.id };
    const active = linkTo(ENTRIES, { ...theirs, status: 'active' });
    return {
      name: (
        <FigureLink href={linkTo(USERS, { user: f.id })} title="Open this account in Users" className="font-medium">
          {f.name}
        </FigureLink>
      ),
      entries: <FigureLink href={linkIf(f.entries, active)}>{f.entries}</FigureLink>,
      claims: <FigureLink href={linkIf(f.claims, active)}>{f.claims}</FigureLink>,
      pushes: <FigureLink href={linkIf(f.pushes, active)}>{f.pushes}</FigureLink>,
      wins:
        f.wins > 0 ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            <FigureLink href={linkTo(ENTRIES, { ...theirs, result: 'won' })}>{f.wins}</FigureLink>
          </span>
        ) : (
          0
        ),
      earned: (
        <FigureLink href={linkIf(f.earned, linkTo(ENTRIES, { ...theirs, award: 'paid' }))}>
          {formatAward(f.earned, f.currency)}
        </FigureLink>
      ),
    };
  });
  const freelancersEmpty =
    searching && data.topFreelancers.length > 0 ? noMatch(lens) : 'No active entries yet.';

  return (
    <div className="flex flex-col gap-4">
      <StatGrid title="Marketplace" columns={5}>
        <StatCard
          label="People"
          value={h.users}
          sub={
            <>
              <FigureLink href={linkIf(h.clients, linkTo(USERS, { role: 'client' }))}>
                {count(h.clients, 'client')}
              </FigureLink>
              {' · '}
              <FigureLink href={linkIf(h.freelancers, linkTo(USERS, { role: 'freelancer' }))}>
                {count(h.freelancers, 'freelancer')}
              </FigureLink>
              {' · '}
              <FigureLink href={linkIf(h.newUsers, linkTo(USERS, { joined: '30' }))}>
                {h.newUsers} new in 30d
              </FigureLink>
            </>
          }
          icon="pi pi-users"
          tone="accent"
          href={USERS}
        />
        <StatCard
          label="Opportunities"
          value={h.opportunities}
          sub={
            <>
              <FigureLink href={linkIf(h.openOpportunities, linkTo(OPPORTUNITIES, { status: 'open' }))}>
                {h.openOpportunities} open
              </FigureLink>
              {' · '}
              <FigureLink href={linkIf(h.inReview, linkTo(OPPORTUNITIES, { status: 'reviewing' }))}>
                {h.inReview} in review
              </FigureLink>
            </>
          }
          icon="pi pi-megaphone"
          tone="neutral"
          href={OPPORTUNITIES}
        />
        {/* Applicants waiting on a client, portal-wide. One opportunity with
            some is a link straight to it, where an administrator can
            decide too; several open the applications report. */}
        <StatCard
          label="Applications waiting"
          value={h.applicationsWaiting}
          sub={
            h.applicationsWaiting === 0 || !oldestWaiting ? (
              'Nothing under review on open opportunities'
            ) : (
              <>
                <FigureLink href={linkTo(APPLICATIONS, WAITING)}>On {count(data.waiting.length, 'opportunity', 'opportunities')}</FigureLink>
                {' · '}
                <FigureLink href={`/opportunities/${data.waiting[0].slug}`} title={data.waiting[0].title}>
                  oldest filed {relativeTime(oldestWaiting)}
                </FigureLink>
              </>
            )
          }
          icon="pi pi-inbox"
          tone={applicationsStale ? 'warn' : 'neutral'}
          help="dashboard.applicationsWaitingPortal"
          href={data.waiting.length === 1 ? `/opportunities/${data.waiting[0].slug}` : linkTo(APPLICATIONS, WAITING)}
        />
        <StatCard
          label="Entries"
          value={h.entries}
          sub={
            <>
              <FigureLink href={linkIf(h.repos, linkTo(ENTRIES, { ...REPO_ENTRIES, repo: 'provisioned' }))}>
                {h.repos} repo{h.repos === 1 ? '' : 's'} provisioned
              </FigureLink>
              {` · ${percent(h.repos, h.entries)}%`}
            </>
          }
          icon="pi pi-flag"
          tone="neutral"
          help="dashboard.repoHealth"
          href={linkTo(ENTRIES, REPO_ENTRIES)}
        />
        <StatCard
          label="Award value"
          value={formatAward(announced, primaryCurrency)}
          sub={
            outstanding > 0 ? (
              <FigureLink href={linkTo(OPPORTUNITIES, { award: 'unpaid' })}>
                {formatAward(outstanding, primaryCurrency)} announced but unpaid
              </FigureLink>
            ) : (
              'Every announced award is paid'
            )
          }
          icon="pi pi-wallet"
          tone={outstanding > 0 ? 'warn' : 'ok'}
          help="dashboard.awardValue"
          href={linkTo(OPPORTUNITIES, { award: ANNOUNCED })}
        />
      </StatGrid>

      {/* The things that silently break — each opens its page under
          Operations, where it is unstuck. */}
      <StatGrid title="Portal health">
        <StatCard
          label="Repos failed"
          value={h.reposFailed}
          sub={
            h.reposFailed > 0 ? (
              'Entrants who cannot start work'
            ) : reposPending > 0 ? (
              <FigureLink href={linkTo(ENTRIES, { ...REPO_ENTRIES, repo: 'pending' })}>
                {reposPending} still waiting for a repository
              </FigureLink>
            ) : (
              'Every active entry has a repository'
            )
          }
          icon="pi pi-exclamation-triangle"
          tone={h.reposFailed > 0 ? 'danger' : 'ok'}
          help="dashboard.repoHealth"
          href={REPO_HEALTH}
        />
        <StatCard
          label="Handovers unverified"
          value={h.stuckHandovers}
          sub={h.stuckHandovers > 0 ? 'Paid, but the new owner is unconfirmed' : 'Every paid award has landed'}
          icon="pi pi-send"
          tone={h.stuckHandovers > 0 ? 'danger' : 'ok'}
          help="dashboard.handoverStuck"
          href={AWARD_HANDOVERS}
        />
        <StatCard
          label="Webhooks · 24h"
          value={h.webhooks24h}
          sub={
            h.unmatchedWebhooks > 0
              ? `${h.unmatchedWebhooks} matched no entry`
              : h.webhooks24h > 0
                ? 'All deliveries matched an entry'
                : 'No deliveries in the last 24 hours'
          }
          icon="pi pi-bolt"
          tone={h.unmatchedWebhooks > 0 ? 'warn' : 'ok'}
          help="dashboard.webhooks"
          href={WEBHOOKS}
        />
        <StatCard
          label="Settings"
          value={h.inReview + h.openOpportunities > 0 ? 'Live' : 'Quiet'}
          sub="GitHub, AI, storage and limits"
          icon="pi pi-cog"
          tone="neutral"
          href="/admin/settings"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Portal activity — last 30 days" help="dashboard.activity" className="lg:col-span-2">
          <ActivityChart data={data.activity} links={ACTIVITY_LINKS} />
        </Panel>

        <Panel
          title="Needs attention"
          help="dashboard.attention"
          action={tallyAction(
            searching,
            attention.length,
            data.attention.length,
            <Link href="/admin/settings" {...NEW_TAB} className="no-underline">
              <Button label="Settings" size="small" text />
            </Link>,
          )}
        >
          <AttentionList
            items={attention}
            empty={searching && data.attention.length > 0 ? noMatch(lens) : undefined}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Signups" help="dashboard.signups">
          <ActivityChart data={data.signups} links={SIGNUP_LINKS} />
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

        <Panel title="Repo provisioning" help="dashboard.repoHealth">
          <SplitChart
            split={data.provisionSplit}
            tones={['ok', 'warn', 'danger']}
            centerLabel="active entries"
            links={PROVISION_STATES.map((repo) => linkTo(ENTRIES, { ...REPO_ENTRIES, repo }))}
            totalHref={linkTo(ENTRIES, REPO_ENTRIES)}
          />
        </Panel>
      </div>

      {/* ---- the client side ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Clients"
          help="dashboard.topClients"
          className="lg:col-span-2"
          action={tallyAction(searching, topClients.length, data.topClients.length)}
        >
          {lens.view === 'cards' ? (
            <RankCards columns={CLIENT_COLUMNS} rows={clientRows} empty={clientsEmpty} />
          ) : (
            <RankTable columns={CLIENT_COLUMNS} rows={clientRows} empty={clientsEmpty} />
          )}
        </Panel>

        <Panel title="Award value" help="dashboard.awardValue">
          <MoneyPanel
            money={data.money}
            unpaidLabel="Outstanding"
            links={(currency) => ({
              all: linkTo(OPPORTUNITIES, { award: ANNOUNCED, currency }),
              paid: linkTo(OPPORTUNITIES, { award: 'paid', currency }),
              unpaid: linkTo(OPPORTUNITIES, { award: 'unpaid', currency }),
            })}
          />
        </Panel>
      </div>

      {/* ---- the freelancer side ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Freelancers"
          help="dashboard.topFreelancers"
          className="lg:col-span-2"
          action={tallyAction(searching, topFreelancers.length, data.topFreelancers.length)}
        >
          {lens.view === 'cards' ? (
            <RankCards columns={FREELANCER_COLUMNS} rows={freelancerRows} empty={freelancersEmpty} />
          ) : (
            <RankTable columns={FREELANCER_COLUMNS} rows={freelancerRows} empty={freelancersEmpty} />
          )}
        </Panel>

        <Panel
          title="Recent webhook deliveries"
          help="dashboard.webhooks"
          action={tallyAction(searching, recent.length, data.recent.length)}
        >
          <ActivityFeed
            items={recent}
            empty={
              searching && data.recent.length > 0
                ? noMatch(lens)
                : 'No deliveries in the last 24 hours. In development GitHub cannot reach localhost — the smee tunnel forwards them.'
            }
          />
        </Panel>
      </div>
    </div>
  );
}
