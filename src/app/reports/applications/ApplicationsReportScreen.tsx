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
import { COMMITMENTS, commitmentLabel, statusLabel, type ApplicationStatus, type Commitment } from '@/lib/applications';
import { meQuery } from '@/lib/opportunities';
import { linkParams, listParam } from '@/lib/links';
import {
  OPPORTUNITY_STATUS_LABEL,
  OPPORTUNITY_STATUS_ORDER,
  ENTRY_STATUS_LABEL,
  RESULT_LABEL,
  RESULT_ORDER,
  applicationsReportQuery,
  categoryText,
  opportunityStatusSeverity,
  resultSeverity,
  scopeOfRole,
  type ApplicationReportRow,
  type ApplicationResult,
  type OpportunityStatusName,
  type ReportScope,
} from '@/lib/reports';

/*
 * The applications report: one row per application that is the signed-in
 * account's to see — every one for an administrator, the ones to their
 * opportunities for a client, their own for a freelancer — with what the
 * applicant offered, how the portal read it, what the client answered and
 * how long that took, and what came of it. The table, its totals and its
 * exports are the shared report screen's.
 */

// ---------------------------------------------------------------- rows

const STATUS_ORDER: ApplicationStatus[] = ['under_review', 'selected', 'not_selected', 'withdrawn', 'removed'];

function statusSeverity(s: ApplicationStatus): 'secondary' | 'success' | 'info' | 'warning' | 'danger' {
  switch (s) {
    case 'under_review':
      return 'info';
    case 'selected':
      return 'success';
    case 'removed':
      return 'danger';
    default:
      return 'secondary';
  }
}

/** The evaluation's words, strongest first. */
const BAND_ORDER = ['Strong Candidate', 'Qualified Candidate', 'Developing Candidate', 'Outside their usual work'];

const INTRO: Record<ReportScope, string> = {
  all: 'Every application anybody has sent — to which opportunity, how it read against the brief, what the client answered and what came of it. Reading only.',
  posted:
    'Every application to the opportunities you posted — who applied, how they read against the brief, what you answered and what came of it. Reading only.',
  entered: 'Every application you have sent — how it read against the brief, what the client answered and what came of it. Reading only.',
};
const WHOSE: Record<ReportScope, string> = {
  all: 'applications',
  posted: 'applications to your opportunities',
  entered: 'applications you sent',
};
const EMPTY: Record<ReportScope, string> = {
  all: 'Nobody has applied to an opportunity yet.',
  posted: 'Nobody has applied to your opportunities yet.',
  entered: 'You have not applied to an opportunity yet.',
};

/** The row the table reads: the report's row plus the derived fields the columns sort and filter on. */
type Row = ApplicationReportRow & {
  statusLabel: string;
  /** Empty where nothing has come of it yet, or nothing will. */
  resultLabel: string;
  opportunityStatusLabel: string;
  categoryText: string;
  commitmentText: string;
  advantagesText: string;
  bandText: string;
  entryLabel: string;
  submittedAt: number;
  answeredAt: number | null;
  changedAt: number | null;
  entryCloseAt: number | null;
  deadlineAt: number | null;
  lastPushAt: number | null;
  paidAt: number | null;
};

function toRow(r: ApplicationReportRow): Row {
  return {
    ...r,
    statusLabel: statusLabel(r.status),
    resultLabel: r.result ? RESULT_LABEL[r.result] : '',
    opportunityStatusLabel: OPPORTUNITY_STATUS_LABEL[r.opportunityStatus],
    categoryText: categoryText(r.categoryLabel, r.subcategoryLabel),
    commitmentText: commitmentLabel(r.commitment),
    advantagesText: r.advantages.join(', '),
    bandText: r.band ?? '',
    entryLabel: r.entryStatus ? ENTRY_STATUS_LABEL[r.entryStatus] : '',
    submittedAt: new Date(r.submittedAtUtc).getTime(),
    answeredAt: msOf(r.answeredAtUtc),
    changedAt: msOf(r.changedAtUtc),
    entryCloseAt: msOf(r.entryCloseUtc),
    deadlineAt: msOf(r.deadlineUtc),
    lastPushAt: msOf(r.lastPushAtUtc),
    paidAt: msOf(r.paidAtUtc),
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
        ? { key: `${RESULT_ORDER.indexOf(r.result)} ${r.result}`, label: r.resultLabel }
        : { key: '9', label: 'Nothing yet' },
  },
  // Two opportunities may share a title; the id keeps them apart.
  { label: 'Opportunity', value: 'opportunity', of: (r) => ({ key: `${r.opportunityTitle} ${r.opportunityId}`, label: r.opportunityTitle }) },
  // A freelancer's report is all theirs: one group would be the table.
  {
    label: 'Applicant',
    value: 'applicant',
    only: ['all', 'posted'],
    of: (r) => ({ key: `${r.freelancerName} ${r.freelancerId}`, label: r.freelancerName }),
  },
  { label: 'Client', value: 'client', only: ['all', 'entered'], of: (r) => byLabel(r.clientName) },
  { label: 'Category', value: 'category', of: (r) => byLabel(r.categoryText === '—' ? 'No category' : r.categoryText) },
  {
    label: 'Commitment',
    value: 'commitment',
    of: (r) => ({ key: String(COMMITMENTS.findIndex((c) => c.value === r.commitment)), label: r.commitmentText }),
  },
  {
    label: 'Evaluation',
    value: 'band',
    of: (r) => {
      const i = r.band ? BAND_ORDER.indexOf(r.band) : -1;
      return { key: String(i < 0 ? 9 : i), label: r.band ?? 'Not evaluated' };
    },
  },
  { label: 'Month applied', value: 'month', of: (r) => monthOf(r.submittedAtUtc) },
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
    // A freelancer opens their own application; anybody else the opportunity, where the applications are.
    render: (row, scope) => (
      <Link
        href={scope === 'entered' ? `/opportunities/${row.opportunitySlug}/apply` : `/opportunities/${row.opportunitySlug}`}
        className="font-medium"
      >
        {row.opportunityTitle}
      </Link>
    ),
  },
  {
    key: 'freelancerName',
    header: 'Applicant',
    kind: 'text',
    on: true,
    only: ['all', 'posted'],
    width: '11rem',
    render: (row) => <Link href={`/profile/${row.freelancerId}`}>{row.freelancerName}</Link>,
  },
  { key: 'freelancerEmail', header: 'Applicant email', kind: 'text', only: ['all'], width: '14rem' },
  { key: 'clientName', header: 'Client', kind: 'text', on: true, only: ['all', 'entered'], width: '11rem' },
  {
    key: 'statusLabel',
    header: 'Status',
    kind: 'text',
    filter: false,
    on: true,
    width: '8rem',
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
  { key: 'categoryText', header: 'Category', kind: 'text', on: true, width: '13rem' },
  { key: 'match', header: 'Match (%)', kind: 'int', total: 'avg', on: true, width: '6.5rem' },
  { key: 'bandText', header: 'Evaluation', kind: 'text', width: '10rem' },
  { key: 'meritScore', header: 'Merit', kind: 'int', total: 'avg', on: true, width: '6rem' },
  { key: 'minMeritScore', header: 'Merit floor', kind: 'int', total: 'avg', width: '7rem' },
  { key: 'commitmentText', header: 'Commitment', kind: 'text', on: true, width: '10rem' },
  { key: 'hoursPerWeek', header: 'Hours a week', kind: 'int', total: 'avg', on: true, width: '7rem' },
  { key: 'portfolioCount', header: 'Portfolio', kind: 'int', total: 'avg', width: '6.5rem' },
  { key: 'advantagesText', header: 'Advantages', kind: 'text', wrap: true, width: '16rem' },
  { key: 'githubUsername', header: 'GitHub', kind: 'text', width: '9rem' },
  // No total: one award is counted once per applicant, so a sum would say nothing.
  { key: 'awardAmount', header: 'Award', kind: 'money', on: true, width: '8rem' },
  { key: 'currency', header: 'Currency', kind: 'text', width: '6rem' },
  { key: 'submittedAt', header: 'Applied', kind: 'date', on: true, width: '7.5rem' },
  { key: 'answeredAt', header: 'Answered', kind: 'date', on: true, width: '7.5rem' },
  { key: 'daysToAnswer', header: 'Days to answer', kind: 'days', total: 'avg', on: true, width: '7rem' },
  { key: 'changedAt', header: 'Last change', kind: 'date', width: '7.5rem' },
  { key: 'entryCloseAt', header: 'Applications close', kind: 'date', width: '8rem' },
  { key: 'deadlineAt', header: 'Deadline', kind: 'date', width: '7.5rem' },
  { key: 'entryLabel', header: 'Entry', kind: 'text', width: '9rem' },
  { key: 'milestonesClaimed', header: 'Milestones claimed', kind: 'int', total: 'sum', width: '7.5rem' },
  { key: 'pushCount', header: 'Pushes', kind: 'int', total: 'sum', width: '6rem' },
  { key: 'lastPushAt', header: 'Last push', kind: 'date', width: '7.5rem' },
  { key: 'reason', header: 'Reason', kind: 'text', wrap: true, width: '16rem' },
  { key: 'paidAt', header: 'Paid', kind: 'date', width: '7.5rem' },
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
  'commitmentText',
  'advantagesText',
  'bandText',
  'githubUsername',
  'reason',
];

const DEFAULT_SORT = [{ field: 'submittedAt', order: -1 as const }];

// ------------------------------------------------------------- filters

type PanelFilters = {
  statuses: ApplicationStatus[];
  results: ApplicationResult[];
  opportunityStatuses: OpportunityStatusName[];
  opportunities: string[];
  /** Account ids, as the two below. */
  applicants: string[];
  clients: string[];
  categories: string[];
  commitments: Commitment[];
  applied: (Date | null)[] | null;
  answered: (Date | null)[] | null;
  matchMin: number | null;
  matchMax: number | null;
};

const NO_FILTERS: PanelFilters = {
  statuses: [],
  results: [],
  opportunityStatuses: [],
  opportunities: [],
  applicants: [],
  clients: [],
  categories: [],
  commitments: [],
  applied: null,
  answered: null,
  matchMin: null,
  matchMax: null,
};

function countActive(f: PanelFilters): number {
  return (
    (f.statuses.length ? 1 : 0) +
    (f.results.length ? 1 : 0) +
    (f.opportunityStatuses.length ? 1 : 0) +
    (f.opportunities.length ? 1 : 0) +
    (f.applicants.length ? 1 : 0) +
    (f.clients.length ? 1 : 0) +
    (f.categories.length ? 1 : 0) +
    (f.commitments.length ? 1 : 0) +
    (dayRange(f.applied) ? 1 : 0) +
    (dayRange(f.answered) ? 1 : 0) +
    (f.matchMin !== null ? 1 : 0) +
    (f.matchMax !== null ? 1 : 0)
  );
}

function narrow(rows: Row[], f: PanelFilters): Row[] {
  const applied = dayRange(f.applied);
  const answered = dayRange(f.answered);
  return rows.filter(
    (r) =>
      (f.statuses.length === 0 || f.statuses.includes(r.status)) &&
      (f.results.length === 0 || (r.result !== null && f.results.includes(r.result))) &&
      (f.opportunityStatuses.length === 0 || f.opportunityStatuses.includes(r.opportunityStatus)) &&
      (f.opportunities.length === 0 || f.opportunities.includes(r.opportunityTitle)) &&
      (f.applicants.length === 0 || f.applicants.includes(r.freelancerId)) &&
      (f.clients.length === 0 || f.clients.includes(r.clientId)) &&
      (f.categories.length === 0 || f.categories.includes(r.categoryText)) &&
      (f.commitments.length === 0 || f.commitments.includes(r.commitment)) &&
      (!applied || (r.submittedAt >= applied[0] && r.submittedAt <= applied[1])) &&
      (!answered || (r.answeredAt !== null && r.answeredAt >= answered[0] && r.answeredAt <= answered[1])) &&
      (f.matchMin === null || r.match >= f.matchMin) &&
      (f.matchMax === null || r.match <= f.matchMax),
  );
}

// -------------------------------------------------------------- screen

export default function ApplicationsReportScreen() {
  const me = useQuery(meQuery);
  const report = useQuery({ ...applicationsReportQuery(me.data?.id ?? ''), enabled: !!me.data });
  // Whose applications these are: the API says, and the role stands in until it has.
  const scope: ReportScope = report.data?.scope ?? scopeOfRole(me.data?.role);

  const [panel, setPanel] = useState<PanelFilters>(NO_FILTERS);
  // A link can open the report already narrowed — the dashboard's
  // applications waiting do: ?status=under_review&opportunityStatus=open, with
  // applicant= and client= taking account ids.
  useEffect(() => {
    const p = linkParams();
    const linked: PanelFilters = {
      ...NO_FILTERS,
      statuses: listParam(p, 'status', STATUS_ORDER),
      results: listParam(p, 'result', RESULT_ORDER),
      opportunityStatuses: listParam(p, 'opportunityStatus', OPPORTUNITY_STATUS_ORDER),
      applicants: listParam(p, 'applicant'),
      clients: listParam(p, 'client'),
    };
    if (countActive(linked) > 0) setPanel(linked);
  }, []);
  const rows = useMemo(() => (report.data?.rows ?? []).map(toRow), [report.data]);
  const narrowRows = useCallback((list: Row[]) => narrow(list, panel), [panel]);

  // The choices the panel offers come from the data itself.
  const options = useMemo(
    () => ({
      opportunities: uniqueSorted(rows.map((r) => r.opportunityTitle)),
      applicants: peopleChoices(rows, (r) => r.freelancerId, (r) => r.freelancerName),
      clients: peopleChoices(rows, (r) => r.clientId, (r) => r.clientName),
      categories: uniqueSorted(rows.map((r) => r.categoryText)),
    }),
    [rows],
  );

  return (
    <ReportScreen
      name="Applications"
      file="applications"
      helpTopic="reports.applications"
      noun={['application', 'applications']}
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
      searchPlaceholder="An opportunity, an applicant, a client, an advantage, a reason"
      defaultSort={DEFAULT_SORT}
      filters={{
        active: countActive(panel),
        clear: () => setPanel(NO_FILTERS),
        narrow: narrowRows,
        node: (
          <>
            <MultiSelect
              value={panel.statuses}
              options={STATUS_ORDER.map((s) => ({ label: statusLabel(s), value: s }))}
              onChange={(e) => setPanel({ ...panel, statuses: e.value })}
              placeholder="Any status"
              maxSelectedLabels={2}
              aria-label="Status"
              className="w-full"
            />
            <MultiSelect
              value={panel.results}
              options={RESULT_ORDER.map((r) => ({ label: RESULT_LABEL[r], value: r }))}
              onChange={(e) => setPanel({ ...panel, results: e.value })}
              placeholder="Any result"
              maxSelectedLabels={2}
              aria-label="Result"
              className="w-full"
            />
            <MultiSelect
              value={panel.opportunityStatuses}
              options={OPPORTUNITY_STATUS_ORDER.map((s) => ({ label: OPPORTUNITY_STATUS_LABEL[s], value: s }))}
              onChange={(e) => setPanel({ ...panel, opportunityStatuses: e.value })}
              placeholder="Any opportunity status"
              maxSelectedLabels={2}
              aria-label="Opportunity status"
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
                value={panel.applicants}
                options={options.applicants}
                onChange={(e) => setPanel({ ...panel, applicants: e.value })}
                placeholder="Any applicant"
                filter
                maxSelectedLabels={1}
                aria-label="Applicant"
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
              value={panel.commitments}
              options={COMMITMENTS.map((c) => ({ label: c.label, value: c.value }))}
              onChange={(e) => setPanel({ ...panel, commitments: e.value })}
              placeholder="Any commitment"
              maxSelectedLabels={1}
              aria-label="Commitment"
              className="w-full"
            />
            <Calendar
              value={panel.applied as Date[] | null}
              onChange={(e) => setPanel({ ...panel, applied: (e.value as Date[] | null) ?? null })}
              selectionMode="range"
              readOnlyInput
              showButtonBar
              placeholder="Applied between"
              ariaLabel="Applied between"
              className="w-full"
            />
            <Calendar
              value={panel.answered as Date[] | null}
              onChange={(e) => setPanel({ ...panel, answered: (e.value as Date[] | null) ?? null })}
              selectionMode="range"
              readOnlyInput
              showButtonBar
              placeholder="Answered between"
              ariaLabel="Answered between"
              className="w-full"
            />
            <InputNumber
              value={panel.matchMin}
              onValueChange={(e) => setPanel({ ...panel, matchMin: e.value ?? null })}
              placeholder="Match from (%)"
              aria-label="Match from"
              min={0}
              max={100}
              className="w-full"
              inputClassName="w-full"
            />
            <InputNumber
              value={panel.matchMax}
              onValueChange={(e) => setPanel({ ...panel, matchMax: e.value ?? null })}
              placeholder="Match up to (%)"
              aria-label="Match up to"
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
