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
  fmtDays,
  monthOf,
  msOf,
  peopleChoices,
  uniqueSorted,
  type ReportColumn,
  type ReportGroup,
} from '@/components/report/ReportScreen';
import { meQuery } from '@/lib/opportunities';
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
  OPPORTUNITY_STATUS_ORDER,
  categoryText,
  opportunityStatusSeverity,
  opportunitiesReportQuery,
  scopeOfRole,
  type MyPart,
  type OpportunityRow,
  type ReportScope,
} from '@/lib/reports';

/*
 * The opportunities report: every opportunity that is the signed-in account's
 * to see as one table — the portal for an administrator, what they posted
 * for a client, what they applied to or entered for a freelancer. Which
 * columns, groups and filters are offered follows the same scope; the
 * table, its totals and its exports are the shared report screen's.
 */

// ---------------------------------------------------------------- rows

type Status = OpportunityRow['status'];

const DELIVERY_LABEL: Record<string, string> = { repository: 'Repository', upload: 'Upload', both: 'Both' };

const MY_PART_LABEL: Record<MyPart, string> = {
  won: 'Won',
  selected: 'Selected',
  under_review: 'Under review',
  not_selected: 'Not selected',
  withdrawn: 'Withdrew',
  removed: 'Removed',
};

function partSeverity(p: MyPart): 'secondary' | 'success' | 'info' | 'warning' | 'danger' {
  switch (p) {
    case 'won':
      return 'warning';
    case 'selected':
      return 'success';
    case 'under_review':
      return 'info';
    case 'removed':
      return 'danger';
    default:
      return 'secondary';
  }
}

const INTRO: Record<ReportScope, string> = {
  all: 'Every opportunity the portal has held — drafts, open, in review, awarded and cancelled — with who posted it, for how much, and what came of it. Reading only.',
  posted:
    'Every opportunity you have posted — drafts, open, in review, awarded and cancelled — with who applied, who competed, and what came of it. Reading only.',
  entered: 'Every opportunity you applied to or entered, with where you stand in each and what came of it. Reading only.',
};
const WHOSE: Record<ReportScope, string> = {
  all: 'opportunities',
  posted: 'opportunities you posted',
  entered: 'opportunities you applied to or entered',
};
const EMPTY: Record<ReportScope, string> = {
  all: 'No opportunity has been posted yet.',
  posted: 'You have not posted an opportunity yet.',
  entered: 'You have not applied to an opportunity yet.',
};

/** The row the table reads: the report's row plus the derived fields the columns sort and filter on. */
type Row = OpportunityRow & {
  statusLabel: string;
  /** A freelancer's own part, in words; empty on anybody else's report. */
  myPartLabel: string;
  deliveryLabel: string;
  categoryText: string;
  skillsText: string;
  createdAt: number;
  publishedAt: number | null;
  startsAt: number | null;
  deadlineAt: number | null;
  entryCloseAt: number | null;
  cancelledAt: number | null;
  paidAt: number | null;
  /** To the deadline from now, a tenth of a day fine; only while open or in review. */
  daysLeft: number | null;
  /** Null until an award is announced. */
  award: AwardState | null;
};

function toRow(r: OpportunityRow, now: number): Row {
  const deadlineAt = msOf(r.deadlineUtc);
  return {
    ...r,
    statusLabel: OPPORTUNITY_STATUS_LABEL[r.status],
    myPartLabel: r.myStatus ? MY_PART_LABEL[r.myStatus] : '',
    deliveryLabel: DELIVERY_LABEL[r.delivery] ?? r.delivery,
    categoryText: categoryText(r.categoryLabel, r.subcategoryLabel),
    skillsText: r.skills.join(', '),
    createdAt: new Date(r.createdAtUtc).getTime(),
    publishedAt: msOf(r.publishedAtUtc),
    startsAt: msOf(r.startsAtUtc),
    deadlineAt,
    entryCloseAt: msOf(r.entryCloseUtc),
    cancelledAt: msOf(r.cancelledAtUtc),
    paidAt: msOf(r.awardPaidAtUtc),
    daysLeft:
      deadlineAt !== null && (r.status === 'open' || r.status === 'reviewing')
        ? Math.round(((deadlineAt - now) / 86_400_000) * 10) / 10
        : null,
    award: awardState(r.awardAnnouncedAtUtc, r.awardPaidAtUtc),
  };
}

const GROUPS: ReportGroup<Row>[] = [
  { label: 'No grouping', value: 'none' },
  {
    label: 'Status',
    value: 'status',
    of: (r) => ({ key: `${OPPORTUNITY_STATUS_ORDER.indexOf(r.status)} ${r.status}`, label: r.statusLabel }),
  },
  { label: 'Your part', value: 'mine', only: ['entered'], of: (r) => byLabel(r.myPartLabel || 'No part') },
  // A client's report is all theirs: one group would be the table.
  { label: 'Client', value: 'client', only: ['all', 'entered'], of: (r) => byLabel(r.clientName) },
  { label: 'Category', value: 'category', of: (r) => byLabel(r.categoryText === '—' ? 'No category' : r.categoryText) },
  { label: 'Delivery', value: 'delivery', of: (r) => byLabel(r.deliveryLabel) },
  { label: 'Currency', value: 'currency', of: (r) => byLabel(r.currency) },
  { label: 'Month created', value: 'month', of: (r) => monthOf(r.createdAtUtc) },
];

// ------------------------------------------------------------- columns

const COLUMNS: ReportColumn<Row>[] = [
  {
    key: 'title',
    header: 'Opportunity',
    kind: 'text',
    on: true,
    wrap: true,
    width: '18rem',
    render: (row, scope) =>
      // A draft has no page anybody but its client can open — and its
      // client opens it in the editor.
      row.status === 'draft' && scope === 'posted' ? (
        <Link href={`/client/opportunities/${row.id}/edit`} className="font-medium">
          {row.title}
        </Link>
      ) : row.status === 'draft' ? (
        <span className="font-medium">{row.title}</span>
      ) : (
        <Link href={`/opportunities/${row.slug}`} className="font-medium">
          {row.title}
        </Link>
      ),
  },
  { key: 'clientName', header: 'Client', kind: 'text', on: true, only: ['all', 'entered'], width: '11rem' },
  { key: 'clientEmail', header: 'Client email', kind: 'text', only: ['all'], width: '14rem' },
  {
    key: 'statusLabel',
    header: 'Status',
    kind: 'text',
    filter: false,
    on: true,
    width: '7.5rem',
    render: (row) => <Tag value={row.statusLabel} severity={opportunityStatusSeverity(row.status)} />,
  },
  {
    key: 'myPartLabel',
    header: 'Your part',
    kind: 'text',
    filter: false,
    on: true,
    only: ['entered'],
    width: '8rem',
    render: (row) => (row.myStatus ? <Tag value={row.myPartLabel} severity={partSeverity(row.myStatus)} /> : '—'),
  },
  { key: 'categoryText', header: 'Category', kind: 'text', on: true, width: '13rem' },
  { key: 'deliveryLabel', header: 'Delivery', kind: 'text', on: true, width: '7rem' },
  { key: 'awardAmount', header: 'Award', kind: 'money', total: 'sum', on: true, width: '8rem' },
  { key: 'currency', header: 'Currency', kind: 'text', width: '6rem' },
  { key: 'minMeritScore', header: 'Merit floor', kind: 'int', total: 'avg', width: '7rem' },
  { key: 'skillsText', header: 'Skills', kind: 'text', width: '14rem' },
  { key: 'createdAt', header: 'Created', kind: 'date', on: true, width: '7.5rem' },
  { key: 'publishedAt', header: 'Published', kind: 'date', width: '7.5rem' },
  { key: 'startsAt', header: 'Starts', kind: 'date', width: '7.5rem' },
  { key: 'deadlineAt', header: 'Deadline', kind: 'date', on: true, width: '7.5rem' },
  { key: 'entryCloseAt', header: 'Entry closes', kind: 'date', width: '7.5rem' },
  { key: 'durationDays', header: 'Duration (days)', kind: 'days', total: 'avg', on: true, width: '7rem' },
  {
    key: 'daysLeft',
    header: 'Days left',
    kind: 'days',
    width: '6rem',
    render: (row) => <span className={row.daysLeft !== null && row.daysLeft < 0 ? 'text-red-600' : undefined}>{fmtDays(row.daysLeft)}</span>,
  },
  { key: 'applicationCount', header: 'Applications', kind: 'int', total: 'sum', on: true, width: '7rem' },
  { key: 'applicationsWaiting', header: 'Waiting', kind: 'int', total: 'sum', on: true, only: ['all', 'posted'], width: '6rem' },
  { key: 'applicationsSelected', header: 'Selected', kind: 'int', total: 'sum', only: ['all', 'posted'], width: '6rem' },
  { key: 'entrantCount', header: 'Entrants', kind: 'int', total: 'sum', on: true, width: '6rem' },
  { key: 'entriesWithdrawn', header: 'Withdrew', kind: 'int', total: 'sum', only: ['all', 'posted'], width: '6rem' },
  { key: 'entriesRemoved', header: 'Removed', kind: 'int', total: 'sum', only: ['all', 'posted'], width: '6rem' },
  { key: 'milestoneCount', header: 'Milestones', kind: 'int', total: 'sum', on: true, width: '6.5rem' },
  { key: 'winnerName', header: 'Winner', kind: 'text', width: '11rem' },
  { key: 'paidAt', header: 'Paid', kind: 'date', width: '7.5rem' },
  { key: 'cancelledAt', header: 'Cancelled', kind: 'date', width: '7.5rem' },
];

/** The columns the global search box reads. */
const SEARCH_FIELDS: (keyof Row & string)[] = [
  'title',
  'slug',
  'clientName',
  'clientEmail',
  'statusLabel',
  'myPartLabel',
  'categoryText',
  'deliveryLabel',
  'skillsText',
  'winnerName',
  'currency',
];

const DEFAULT_SORT = [{ field: 'createdAt', order: -1 as const }];

// ------------------------------------------------------------- filters

type PanelFilters = {
  statuses: Status[];
  awards: AwardState[];
  /** Account ids. */
  clients: string[];
  categories: string[];
  deliveries: string[];
  currencies: string[];
  created: (Date | null)[] | null;
  published: (Date | null)[] | null;
  deadline: (Date | null)[] | null;
  awardMin: number | null;
  awardMax: number | null;
};

const NO_FILTERS: PanelFilters = {
  statuses: [],
  awards: [],
  clients: [],
  categories: [],
  deliveries: [],
  currencies: [],
  created: null,
  published: null,
  deadline: null,
  awardMin: null,
  awardMax: null,
};

function countActive(f: PanelFilters): number {
  return (
    (f.statuses.length ? 1 : 0) +
    (f.awards.length ? 1 : 0) +
    (f.clients.length ? 1 : 0) +
    (f.categories.length ? 1 : 0) +
    (f.deliveries.length ? 1 : 0) +
    (f.currencies.length ? 1 : 0) +
    (dayRange(f.created) ? 1 : 0) +
    (dayRange(f.published) ? 1 : 0) +
    (dayRange(f.deadline) ? 1 : 0) +
    (f.awardMin !== null ? 1 : 0) +
    (f.awardMax !== null ? 1 : 0)
  );
}

function narrow(rows: Row[], f: PanelFilters): Row[] {
  const created = dayRange(f.created);
  const published = dayRange(f.published);
  const deadline = dayRange(f.deadline);
  return rows.filter(
    (r) =>
      (f.statuses.length === 0 || f.statuses.includes(r.status)) &&
      (f.awards.length === 0 || (r.award !== null && f.awards.includes(r.award))) &&
      (f.clients.length === 0 || f.clients.includes(r.clientId)) &&
      (f.categories.length === 0 || f.categories.includes(r.categoryText)) &&
      (f.deliveries.length === 0 || f.deliveries.includes(r.deliveryLabel)) &&
      (f.currencies.length === 0 || f.currencies.includes(r.currency)) &&
      (!created || (r.createdAt >= created[0] && r.createdAt <= created[1])) &&
      (!published || (r.publishedAt !== null && r.publishedAt >= published[0] && r.publishedAt <= published[1])) &&
      (!deadline || (r.deadlineAt !== null && r.deadlineAt >= deadline[0] && r.deadlineAt <= deadline[1])) &&
      (f.awardMin === null || r.awardAmount >= f.awardMin) &&
      (f.awardMax === null || r.awardAmount <= f.awardMax),
  );
}

// -------------------------------------------------------------- screen

export default function OpportunitiesReportScreen() {
  const me = useQuery(meQuery);
  const report = useQuery({ ...opportunitiesReportQuery(me.data?.id ?? ''), enabled: !!me.data });
  // Whose opportunities these are: the API says, and the role stands in until it has.
  const scope: ReportScope = report.data?.scope ?? scopeOfRole(me.data?.role);

  const [panel, setPanel] = useState<PanelFilters>(NO_FILTERS);
  // A link can open the report already narrowed — the dashboard's figures
  // do: ?status=open,reviewing&award=unpaid&client=<account id>&currency=USD,
  // and a chart's point: ?published=2026-09-12.
  useEffect(() => {
    const p = linkParams();
    const linked: PanelFilters = {
      ...NO_FILTERS,
      statuses: listParam(p, 'status', OPPORTUNITY_STATUS_ORDER),
      awards: listParam(p, 'award', AWARD_STATE_ORDER),
      clients: listParam(p, 'client'),
      currencies: listParam(p, 'currency'),
      published: dayParam(p, 'published'),
    };
    if (countActive(linked) > 0) setPanel(linked);
  }, []);
  const now = useMemo(() => Date.now(), [report.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (report.data?.rows ?? []).map((r) => toRow(r, now)), [report.data, now]);
  const narrowRows = useCallback((list: Row[]) => narrow(list, panel), [panel]);

  // The choices the panel offers come from the data itself.
  const options = useMemo(
    () => ({
      clients: peopleChoices(rows, (r) => r.clientId, (r) => r.clientName),
      categories: uniqueSorted(rows.map((r) => r.categoryText)),
      deliveries: uniqueSorted(rows.map((r) => r.deliveryLabel)),
      currencies: uniqueSorted(rows.map((r) => r.currency)),
    }),
    [rows],
  );

  return (
    <ReportScreen
      name="Opportunities"
      file="opportunities"
      helpTopic="reports.opportunities"
      noun={['opportunity', 'opportunities']}
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
      searchPlaceholder="A title, a client, a category, a skill, a winner"
      defaultSort={DEFAULT_SORT}
      filters={{
        active: countActive(panel),
        clear: () => setPanel(NO_FILTERS),
        narrow: narrowRows,
        node: (
          <>
            <MultiSelect
              value={panel.statuses}
              options={OPPORTUNITY_STATUS_ORDER.map((s) => ({ label: OPPORTUNITY_STATUS_LABEL[s], value: s }))}
              onChange={(e) => setPanel({ ...panel, statuses: e.value })}
              placeholder="Any status"
              maxSelectedLabels={2}
              aria-label="Status"
              className="w-full"
            />
            {/* A freelancer's report does not know whether somebody else's
                award was paid, so it offers no award filter. */}
            {scope !== 'entered' && (
              <MultiSelect
                value={panel.awards}
                options={AWARD_STATE_ORDER.map((a) => ({ label: AWARD_STATE_LABEL[a], value: a }))}
                onChange={(e) => setPanel({ ...panel, awards: e.value })}
                placeholder="Any award"
                maxSelectedLabels={2}
                aria-label="Award"
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
              value={panel.currencies}
              options={options.currencies}
              onChange={(e) => setPanel({ ...panel, currencies: e.value })}
              placeholder="Any currency"
              maxSelectedLabels={2}
              aria-label="Currency"
              className="w-full"
            />
            <Calendar
              value={panel.created as Date[] | null}
              onChange={(e) => setPanel({ ...panel, created: (e.value as Date[] | null) ?? null })}
              selectionMode="range"
              readOnlyInput
              showButtonBar
              placeholder="Created between"
              ariaLabel="Created between"
              className="w-full"
            />
            <Calendar
              value={panel.published as Date[] | null}
              onChange={(e) => setPanel({ ...panel, published: (e.value as Date[] | null) ?? null })}
              selectionMode="range"
              readOnlyInput
              showButtonBar
              placeholder="Published between"
              ariaLabel="Published between"
              className="w-full"
            />
            <Calendar
              value={panel.deadline as Date[] | null}
              onChange={(e) => setPanel({ ...panel, deadline: (e.value as Date[] | null) ?? null })}
              selectionMode="range"
              readOnlyInput
              showButtonBar
              placeholder="Deadline between"
              ariaLabel="Deadline between"
              className="w-full"
            />
            <InputNumber
              value={panel.awardMin}
              onValueChange={(e) => setPanel({ ...panel, awardMin: e.value ?? null })}
              placeholder="Award from"
              aria-label="Award from"
              min={0}
              className="w-full"
              inputClassName="w-full"
            />
            <InputNumber
              value={panel.awardMax}
              onValueChange={(e) => setPanel({ ...panel, awardMax: e.value ?? null })}
              placeholder="Award up to"
              aria-label="Award up to"
              min={0}
              className="w-full"
              inputClassName="w-full"
            />
          </>
        ),
      }}
    />
  );
}
