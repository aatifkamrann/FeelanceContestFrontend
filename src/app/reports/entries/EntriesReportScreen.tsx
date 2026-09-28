'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'primereact/calendar';
import { InputNumber } from 'primereact/inputnumber';
import { MultiSelect } from 'primereact/multiselect';
import { Tag } from 'primereact/tag';
import ReportScreen, {
  byLabel,
  dayRange,
  monthOf,
  msOf,
  peopleChoices,
  uniqueSorted,
  type ReportColumn,
  type ReportGroup,
} from '@/components/report/ReportScreen';
import { meQuery, standingLabel, standingSeverity, type StandingBand } from '@/lib/opportunities';
import {
  AWARD_STATE_LABEL,
  AWARD_STATE_ORDER,
  awardState,
  dayParam,
  linkParams,
  listParam,
  type AwardState,
} from '@/lib/links';
import {
  OPPORTUNITY_STATUS_LABEL,
  ENTRY_STATUS_LABEL,
  RESULT_LABEL,
  RESULT_ORDER,
  categoryText,
  opportunityStatusSeverity,
  entriesReportQuery,
  resultSeverity,
  scopeOfRole,
  type EntryReportRow,
  type EntryResult,
  type EntryStatusName,
  type ReportScope,
} from '@/lib/reports';

/*
 * The entries report: one row per entry that is the signed-in account's to
 * see — every one for an administrator, the ones into their opportunities for a
 * client, their own for a freelancer — with the board it built, the
 * activity behind it, where it stands while the opportunity runs, how it ended
 * and what it won. The table, its totals and its exports are the shared
 * report screen's.
 */

// ---------------------------------------------------------------- rows

const STATUS_ORDER: EntryStatusName[] = ['active', 'withdrawn', 'deselected', 'removed'];

function statusSeverity(s: EntryStatusName): 'secondary' | 'success' | 'danger' {
  return s === 'active' ? 'success' : s === 'removed' ? 'danger' : 'secondary';
}

/** An entry's results, in order; "never answered" is an application's alone. */
const ENTRY_RESULT_ORDER = RESULT_ORDER.filter((r): r is EntryResult => r !== 'unanswered');

/** The standing's readings, the healthy first. */
const BAND_ORDER: StandingBand[] = ['on_track', 'behind', 'at_risk', 'too_early'];

const DELIVERY_LABEL: Record<string, string> = { repository: 'Repository', upload: 'Upload', both: 'Both' };

type RepoSetup = NonNullable<EntryReportRow['repoSetup']>;

const REPO_SETUP_LABEL: Record<RepoSetup, string> = {
  pending: 'Waiting',
  provisioned: 'Ready',
  failed: 'Failed',
};
const REPO_SETUP_ORDER: RepoSetup[] = ['provisioned', 'pending', 'failed'];

const HANDOVER_LABEL: Record<NonNullable<EntryReportRow['handover']>, string> = {
  not_started: 'Awaiting payment',
  requested: 'Transfer requested',
  verified: 'Transferred',
};

const INTRO: Record<ReportScope, string> = {
  all: 'Every entry into every opportunity — who competed, how they kept to the milestones, where they stand, how it ended and who won. Reading only.',
  posted:
    'Every entry into the opportunities you posted — who competed, how they kept to your milestones, where they stand, how it ended and who won. Reading only.',
  entered: 'Every opportunity you entered — how you kept to the milestones, where you stand, how it ended and what came of it. Reading only.',
};
const WHOSE: Record<ReportScope, string> = {
  all: 'entries',
  posted: 'entries into your opportunities',
  entered: 'entries you made',
};
const EMPTY: Record<ReportScope, string> = {
  all: 'Nobody has entered an opportunity yet.',
  posted: 'Nobody has entered your opportunities yet.',
  entered: 'You have not entered an opportunity yet.',
};

/** The row the table reads: the report's row plus the derived fields the columns sort and filter on. */
type Row = EntryReportRow & {
  statusLabel: string;
  /** Empty for an entry that ended before its opportunity moved on. */
  resultLabel: string;
  opportunityStatusLabel: string;
  categoryText: string;
  deliveryText: string;
  bandText: string;
  repoSetupText: string;
  repoHasText: string;
  handoverText: string;
  enteredAt: number;
  claimedAt: number[];
  endedAt: number | null;
  appliedAt: number | null;
  firstClaimAt: number | null;
  lastPushAt: number | null;
  deadlineAt: number | null;
  announcedAt: number | null;
  paidAt: number | null;
  /** Null on an entry that won nothing. */
  award: AwardState | null;
};

function toRow(r: EntryReportRow): Row {
  return {
    ...r,
    statusLabel: ENTRY_STATUS_LABEL[r.status],
    resultLabel: r.result ? RESULT_LABEL[r.result] : '',
    opportunityStatusLabel: OPPORTUNITY_STATUS_LABEL[r.opportunityStatus],
    categoryText: categoryText(r.categoryLabel, r.subcategoryLabel),
    deliveryText: DELIVERY_LABEL[r.delivery] ?? r.delivery,
    bandText: r.standingBand ? standingLabel(r.standingBand) : '',
    repoSetupText: r.repoSetup ? REPO_SETUP_LABEL[r.repoSetup] : '',
    // Read and found nothing is an answer too; not read yet stays blank.
    repoHasText: r.repoHas === null ? '' : r.repoHas.length ? r.repoHas.join(', ') : 'None',
    handoverText: r.handover ? HANDOVER_LABEL[r.handover] : '',
    enteredAt: new Date(r.enteredAtUtc).getTime(),
    claimedAt: r.claimedAtUtc.map((at) => new Date(at).getTime()),
    endedAt: msOf(r.endedAtUtc),
    appliedAt: msOf(r.appliedAtUtc),
    firstClaimAt: msOf(r.firstClaimAtUtc),
    lastPushAt: msOf(r.lastPushAtUtc),
    deadlineAt: msOf(r.deadlineUtc),
    announcedAt: msOf(r.awardAnnouncedAtUtc),
    paidAt: msOf(r.awardPaidAtUtc),
    award: awardState(r.awardAnnouncedAtUtc, r.awardPaidAtUtc),
  };
}

const GROUPS: ReportGroup<Row>[] = [
  { label: 'No grouping', value: 'none' },
  {
    label: 'Status',
    value: 'status',
    of: (r) => ({ key: `${STATUS_ORDER.indexOf(r.status)} ${r.status}`, label: r.statusLabel }),
  },
  {
    label: 'Result',
    value: 'result',
    of: (r) =>
      r.result
        ? { key: `${ENTRY_RESULT_ORDER.indexOf(r.result)} ${r.result}`, label: r.resultLabel }
        : { key: '9', label: 'Ended before a result' },
  },
  // Two opportunities may share a title; the id keeps them apart.
  { label: 'Opportunity', value: 'opportunity', of: (r) => ({ key: `${r.opportunityTitle} ${r.opportunityId}`, label: r.opportunityTitle }) },
  // A freelancer's report is all theirs: one group would be the table.
  {
    label: 'Entrant',
    value: 'entrant',
    only: ['all', 'posted'],
    of: (r) => ({ key: `${r.freelancerName} ${r.freelancerId}`, label: r.freelancerName }),
  },
  { label: 'Client', value: 'client', only: ['all', 'entered'], of: (r) => byLabel(r.clientName) },
  { label: 'Category', value: 'category', of: (r) => byLabel(r.categoryText === '—' ? 'No category' : r.categoryText) },
  { label: 'Delivery', value: 'delivery', of: (r) => byLabel(r.deliveryText) },
  {
    label: 'Reading',
    value: 'band',
    of: (r) =>
      r.standingBand
        ? { key: String(BAND_ORDER.indexOf(r.standingBand)), label: r.bandText }
        : { key: '9', label: 'No standing' },
  },
  { label: 'Month entered', value: 'month', of: (r) => monthOf(r.enteredAtUtc) },
];

// ------------------------------------------------------------- columns

const COLUMNS: ReportColumn<Row>[] = [
  {
    key: 'opportunityTitle',
    header: 'Opportunity',
    kind: 'text',
    on: true,
    wrap: true,
    width: '16rem',
    // The opportunity page is where the board is, for the entrant and the client alike.
    render: (row) => (
      <Link href={`/opportunities/${row.opportunitySlug}`} className="font-medium">
        {row.opportunityTitle}
      </Link>
    ),
  },
  {
    key: 'freelancerName',
    header: 'Entrant',
    kind: 'text',
    on: true,
    only: ['all', 'posted'],
    width: '11rem',
    render: (row) => <Link href={`/profile/${row.freelancerId}`}>{row.freelancerName}</Link>,
  },
  { key: 'freelancerEmail', header: 'Entrant email', kind: 'text', only: ['all'], width: '14rem' },
  { key: 'clientName', header: 'Client', kind: 'text', on: true, only: ['all', 'entered'], width: '11rem' },
  {
    key: 'statusLabel',
    header: 'Status',
    kind: 'text',
    filter: false,
    on: true,
    width: '9rem',
    render: (row) => <Tag value={row.statusLabel} severity={statusSeverity(row.status)} />,
  },
  {
    key: 'resultLabel',
    header: 'Result',
    kind: 'text',
    filter: false,
    on: true,
    width: '8.5rem',
    render: (row) => (row.result ? <Tag value={row.resultLabel} severity={resultSeverity(row.result)} /> : '—'),
  },
  {
    key: 'opportunityStatusLabel',
    header: 'Opportunity status',
    kind: 'text',
    filter: false,
    width: '8rem',
    render: (row) => <Tag value={row.opportunityStatusLabel} severity={opportunityStatusSeverity(row.opportunityStatus)} />,
  },
  { key: 'categoryText', header: 'Category', kind: 'text', width: '13rem' },
  { key: 'deliveryText', header: 'Delivery', kind: 'text', width: '7rem' },
  { key: 'enteredAt', header: 'Entered', kind: 'date', on: true, width: '7.5rem' },
  { key: 'milestonesClaimed', header: 'Claimed', kind: 'int', total: 'sum', on: true, width: '6.5rem' },
  { key: 'milestoneCount', header: 'Milestones', kind: 'int', total: 'avg', width: '7rem' },
  { key: 'onTime', header: 'On time', kind: 'int', total: 'sum', on: true, width: '6.5rem' },
  { key: 'late', header: 'Late', kind: 'int', total: 'sum', on: true, width: '5.5rem' },
  { key: 'overdue', header: 'Overdue', kind: 'int', total: 'sum', on: true, width: '6.5rem' },
  { key: 'firstClaimAt', header: 'First claim', kind: 'date', width: '7.5rem' },
  { key: 'daysToFirstClaim', header: 'Days to first claim', kind: 'days', total: 'avg', width: '7.5rem' },
  { key: 'pushCount', header: 'Pushes', kind: 'int', total: 'sum', on: true, width: '6rem' },
  { key: 'lastPushAt', header: 'Last push', kind: 'date', on: true, width: '7.5rem' },
  { key: 'filesUploaded', header: 'Files', kind: 'int', total: 'sum', width: '5.5rem' },
  { key: 'standingScore', header: 'Standing', kind: 'int', total: 'avg', on: true, width: '7rem' },
  {
    key: 'bandText',
    header: 'Reading',
    kind: 'text',
    filter: false,
    on: true,
    width: '9rem',
    render: (row) =>
      row.standingBand ? (
        <Tag value={row.bandText} severity={standingSeverity(row.standingBand) ?? 'secondary'} />
      ) : (
        '—'
      ),
  },
  { key: 'standingRank', header: 'Place', kind: 'int', width: '5.5rem' },
  { key: 'daysIn', header: 'Days in', kind: 'days', total: 'avg', on: true, width: '6.5rem' },
  { key: 'endedAt', header: 'Ended', kind: 'date', width: '7.5rem' },
  { key: 'reason', header: 'Reason', kind: 'text', wrap: true, width: '16rem' },
  { key: 'appliedAt', header: 'Applied', kind: 'date', width: '7.5rem' },
  { key: 'match', header: 'Match (%)', kind: 'int', total: 'avg', width: '6.5rem' },
  { key: 'note', header: 'Note', kind: 'text', wrap: true, width: '14rem' },
  { key: 'githubUsername', header: 'GitHub', kind: 'text', width: '9rem' },
  { key: 'repoFullName', header: 'Repository', kind: 'text', width: '14rem' },
  { key: 'repoSetupText', header: 'Repository setup', kind: 'text', width: '8rem' },
  { key: 'repoFileCount', header: 'Repo files', kind: 'int', total: 'avg', width: '6.5rem' },
  { key: 'repoHasText', header: 'Repo has', kind: 'text', width: '10rem' },
  // No total: an opportunity's award is on every one of its entrants' rows.
  { key: 'awardAmount', header: 'Award', kind: 'money', width: '8rem' },
  { key: 'currency', header: 'Currency', kind: 'text', width: '6rem' },
  { key: 'deadlineAt', header: 'Deadline', kind: 'date', width: '7.5rem' },
  { key: 'announcedAt', header: 'Announced', kind: 'date', width: '7.5rem' },
  { key: 'paidAt', header: 'Paid', kind: 'date', width: '7.5rem' },
  { key: 'handoverText', header: 'Handover', kind: 'text', only: ['all', 'posted'], width: '9rem' },
  { key: 'ratingOfWinner', header: 'Rating of winner', kind: 'int', total: 'avg', width: '7rem' },
  { key: 'ratingOfClient', header: 'Rating of client', kind: 'int', total: 'avg', width: '7rem' },
];

/** The columns the global search box reads. */
const SEARCH_FIELDS: (keyof Row & string)[] = [
  'opportunityTitle',
  'freelancerName',
  'freelancerEmail',
  'clientName',
  'statusLabel',
  'resultLabel',
  'categoryText',
  'deliveryText',
  'bandText',
  'note',
  'githubUsername',
  'repoFullName',
  'reason',
];

const DEFAULT_SORT = [{ field: 'enteredAt', order: -1 as const }];

// ------------------------------------------------------------- filters

type PanelFilters = {
  statuses: EntryStatusName[];
  results: EntryResult[];
  awards: AwardState[];
  opportunities: string[];
  /** Account ids, as the one below. */
  entrants: string[];
  clients: string[];
  categories: string[];
  deliveries: string[];
  repos: RepoSetup[];
  currencies: string[];
  bands: StandingBand[];
  entered: (Date | null)[] | null;
  /** Entries with a milestone claimed in the range. */
  claimed: (Date | null)[] | null;
  standingMin: number | null;
  standingMax: number | null;
};

const NO_FILTERS: PanelFilters = {
  statuses: [],
  results: [],
  awards: [],
  opportunities: [],
  entrants: [],
  clients: [],
  categories: [],
  deliveries: [],
  repos: [],
  currencies: [],
  bands: [],
  entered: null,
  claimed: null,
  standingMin: null,
  standingMax: null,
};

function countActive(f: PanelFilters): number {
  return (
    (f.statuses.length ? 1 : 0) +
    (f.results.length ? 1 : 0) +
    (f.awards.length ? 1 : 0) +
    (f.opportunities.length ? 1 : 0) +
    (f.entrants.length ? 1 : 0) +
    (f.clients.length ? 1 : 0) +
    (f.categories.length ? 1 : 0) +
    (f.deliveries.length ? 1 : 0) +
    (f.repos.length ? 1 : 0) +
    (f.currencies.length ? 1 : 0) +
    (f.bands.length ? 1 : 0) +
    (dayRange(f.entered) ? 1 : 0) +
    (dayRange(f.claimed) ? 1 : 0) +
    (f.standingMin !== null ? 1 : 0) +
    (f.standingMax !== null ? 1 : 0)
  );
}

function narrow(rows: Row[], f: PanelFilters): Row[] {
  const entered = dayRange(f.entered);
  const claimed = dayRange(f.claimed);
  return rows.filter(
    (r) =>
      (f.statuses.length === 0 || f.statuses.includes(r.status)) &&
      (f.results.length === 0 || (r.result !== null && f.results.includes(r.result))) &&
      (f.awards.length === 0 || (r.award !== null && f.awards.includes(r.award))) &&
      (f.opportunities.length === 0 || f.opportunities.includes(r.opportunityTitle)) &&
      (f.entrants.length === 0 || f.entrants.includes(r.freelancerId)) &&
      (f.clients.length === 0 || f.clients.includes(r.clientId)) &&
      (f.categories.length === 0 || f.categories.includes(r.categoryText)) &&
      (f.deliveries.length === 0 || f.deliveries.includes(r.deliveryText)) &&
      (f.repos.length === 0 || (r.repoSetup !== null && f.repos.includes(r.repoSetup))) &&
      (f.currencies.length === 0 || f.currencies.includes(r.currency)) &&
      (f.bands.length === 0 || (r.standingBand !== null && f.bands.includes(r.standingBand))) &&
      (!entered || (r.enteredAt >= entered[0] && r.enteredAt <= entered[1])) &&
      (!claimed || r.claimedAt.some((at) => at >= claimed[0] && at <= claimed[1])) &&
      // A standing range asks about entries that have one.
      (f.standingMin === null || (r.standingScore !== null && r.standingScore >= f.standingMin)) &&
      (f.standingMax === null || (r.standingScore !== null && r.standingScore <= f.standingMax)),
  );
}

// -------------------------------------------------------------- screen

export default function EntriesReportScreen() {
  const me = useQuery(meQuery);
  const report = useQuery({ ...entriesReportQuery(me.data?.id ?? ''), enabled: !!me.data });
  // Whose entries these are: the API says, and the role stands in until it has.
  const scope: ReportScope = report.data?.scope ?? scopeOfRole(me.data?.role);

  const [panel, setPanel] = useState<PanelFilters>(NO_FILTERS);
  // A link can open the report already narrowed — the dashboard's figures
  // do: ?status=active&result=won&award=paid&repo=failed&delivery=repository,both,
  // with entrant= and client= taking account ids; a chart's point opens a
  // day: ?entered=2026-09-12 or ?claimed=2026-09-12.
  useEffect(() => {
    const p = linkParams();
    const linked: PanelFilters = {
      ...NO_FILTERS,
      statuses: listParam(p, 'status', STATUS_ORDER),
      results: listParam(p, 'result', ENTRY_RESULT_ORDER),
      awards: listParam(p, 'award', AWARD_STATE_ORDER),
      entrants: listParam(p, 'entrant'),
      clients: listParam(p, 'client'),
      deliveries: listParam(p, 'delivery', Object.keys(DELIVERY_LABEL)).map((d) => DELIVERY_LABEL[d]),
      repos: listParam(p, 'repo', REPO_SETUP_ORDER),
      currencies: listParam(p, 'currency'),
      entered: dayParam(p, 'entered'),
      claimed: dayParam(p, 'claimed'),
    };
    if (countActive(linked) > 0) setPanel(linked);
  }, []);
  const rows = useMemo(() => (report.data?.rows ?? []).map(toRow), [report.data]);
  const narrowRows = useCallback((list: Row[]) => narrow(list, panel), [panel]);

  // The choices the panel offers come from the data itself.
  const options = useMemo(
    () => ({
      opportunities: uniqueSorted(rows.map((r) => r.opportunityTitle)),
      entrants: peopleChoices(rows, (r) => r.freelancerId, (r) => r.freelancerName),
      clients: peopleChoices(rows, (r) => r.clientId, (r) => r.clientName),
      categories: uniqueSorted(rows.map((r) => r.categoryText)),
      deliveries: uniqueSorted(rows.map((r) => r.deliveryText)),
      currencies: uniqueSorted(rows.map((r) => r.currency)),
    }),
    [rows],
  );

  return (
    <ReportScreen
      name="Entries"
      file="entries"
      helpTopic="reports.entries"
      noun={['entry', 'entries']}
      scope={scope}
      intro={INTRO[scope]}
      whose={WHOSE[scope]}
      empty={EMPTY[scope]}
      rows={rows}
      loading={report.isLoading}
      fetching={report.isFetching}
      failed={report.isError}
      refetch={() => void report.refetch()}
      columns={COLUMNS}
      groups={GROUPS}
      searchFields={SEARCH_FIELDS}
      searchPlaceholder="An opportunity, an entrant, a client, a repository, a reason"
      defaultSort={DEFAULT_SORT}
      filters={{
        active: countActive(panel),
        clear: () => setPanel(NO_FILTERS),
        narrow: narrowRows,
        node: (
          <>
            <MultiSelect
              value={panel.statuses}
              options={STATUS_ORDER.map((s) => ({ label: ENTRY_STATUS_LABEL[s], value: s }))}
              onChange={(e) => setPanel({ ...panel, statuses: e.value })}
              placeholder="Any status"
              maxSelectedLabels={2}
              aria-label="Status"
              className="w-full"
            />
            <MultiSelect
              value={panel.results}
              options={ENTRY_RESULT_ORDER.map((r) => ({ label: RESULT_LABEL[r], value: r }))}
              onChange={(e) => setPanel({ ...panel, results: e.value })}
              placeholder="Any result"
              maxSelectedLabels={2}
              aria-label="Result"
              className="w-full"
            />
            <MultiSelect
              value={panel.awards}
              options={AWARD_STATE_ORDER.map((a) => ({ label: AWARD_STATE_LABEL[a], value: a }))}
              onChange={(e) => setPanel({ ...panel, awards: e.value })}
              placeholder="Any award"
              maxSelectedLabels={2}
              aria-label="Award"
              className="w-full"
            />
            <MultiSelect
              value={panel.opportunities}
              options={options.opportunities}
              onChange={(e) => setPanel({ ...panel, opportunities: e.value })}
              placeholder="Any opportunity"
              filter
              maxSelectedLabels={1}
              aria-label="Opportunity"
              className="w-full"
            />
            {scope !== 'entered' && (
              <MultiSelect
                value={panel.entrants}
                options={options.entrants}
                onChange={(e) => setPanel({ ...panel, entrants: e.value })}
                placeholder="Any entrant"
                filter
                maxSelectedLabels={1}
                aria-label="Entrant"
                className="w-full"
              />
            )}
            {scope !== 'posted' && (
              <MultiSelect
                value={panel.clients}
                options={options.clients}
                onChange={(e) => setPanel({ ...panel, clients: e.value })}
                placeholder="Any client"
                filter
                maxSelectedLabels={1}
                aria-label="Client"
                className="w-full"
              />
            )}
            <MultiSelect
              value={panel.categories}
              options={options.categories}
              onChange={(e) => setPanel({ ...panel, categories: e.value })}
              placeholder="Any category"
              filter
              maxSelectedLabels={1}
              aria-label="Category"
              className="w-full"
            />
            <MultiSelect
              value={panel.deliveries}
              options={options.deliveries}
              onChange={(e) => setPanel({ ...panel, deliveries: e.value })}
              placeholder="Any delivery"
              maxSelectedLabels={2}
              aria-label="Delivery"
              className="w-full"
            />
            <MultiSelect
              value={panel.repos}
              options={REPO_SETUP_ORDER.map((s) => ({ label: REPO_SETUP_LABEL[s], value: s }))}
              onChange={(e) => setPanel({ ...panel, repos: e.value })}
              placeholder="Any repository setup"
              maxSelectedLabels={2}
              aria-label="Repository setup"
              className="w-full"
            />
            <MultiSelect
              value={panel.currencies}
              options={options.currencies}
              onChange={(e) => setPanel({ ...panel, currencies: e.value })}
              placeholder="Any currency"
              maxSelectedLabels={2}
              aria-label="Currency"
              className="w-full"
            />
            <MultiSelect
              value={panel.bands}
              options={BAND_ORDER.map((b) => ({ label: standingLabel(b), value: b }))}
              onChange={(e) => setPanel({ ...panel, bands: e.value })}
              placeholder="Any reading"
              maxSelectedLabels={2}
              aria-label="Reading"
              className="w-full"
            />
            <Calendar
              value={panel.entered as Date[] | null}
              onChange={(e) => setPanel({ ...panel, entered: (e.value as Date[] | null) ?? null })}
              selectionMode="range"
              readOnlyInput
              showButtonBar
              placeholder="Entered between"
              ariaLabel="Entered between"
              className="w-full"
            />
            <Calendar
              value={panel.claimed as Date[] | null}
              onChange={(e) => setPanel({ ...panel, claimed: (e.value as Date[] | null) ?? null })}
              selectionMode="range"
              readOnlyInput
              showButtonBar
              placeholder="Claimed between"
              ariaLabel="Claimed between"
              className="w-full"
            />
            <InputNumber
              value={panel.standingMin}
              onValueChange={(e) => setPanel({ ...panel, standingMin: e.value ?? null })}
              placeholder="Standing from"
              aria-label="Standing from"
              min={0}
              max={100}
              className="w-full"
              inputClassName="w-full"
            />
            <InputNumber
              value={panel.standingMax}
              onValueChange={(e) => setPanel({ ...panel, standingMax: e.value ?? null })}
              placeholder="Standing up to"
              aria-label="Standing up to"
              min={0}
              max={100}
              className="w-full"
              inputClassName="w-full"
            />
          </>
        ),
      }}
    />
  );
}
