import type { ApplicationStatus, Commitment } from './applications';
import type { OpportunityDelivery, StandingBand } from './opportunities';
import { apiFetch } from '@/lib/api';

/**
 * Reports: what is the signed-in account's to see, as tables — opportunities,
 * applications and entries. Whose they are is the API's decision, by role —
 * an administrator's report is the portal, a client's what they posted and
 * who applied to and entered it, a freelancer's what they applied to or
 * entered.
 */

export type ReportScope = 'all' | 'posted' | 'entered';

/** Where a freelancer stands in an opportunity of theirs. */
export type MyPart = 'won' | 'selected' | 'under_review' | 'not_selected' | 'withdrawn' | 'removed';

/** One opportunity as the opportunities report sends it: every state, every count, nothing typed. */
export type OpportunityRow = {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'open' | 'reviewing' | 'awarded' | 'cancelled';
  clientId: string;
  clientName: string;
  /** An administrator's report only. */
  clientEmail: string | null;
  category: string | null;
  categoryLabel: string | null;
  subcategory: string | null;
  subcategoryLabel: string | null;
  delivery: string;
  awardAmount: number;
  currency: string;
  minMeritScore: number;
  skills: string[];
  createdAtUtc: string;
  publishedAtUtc: string | null;
  /** The later of the client's start day and the moment of publishing — the day the work counts from. */
  startsAtUtc: string | null;
  deadlineUtc: string | null;
  /** Resolved: the client's own date, else the deadline. */
  entryCloseUtc: string | null;
  cancelledAtUtc: string | null;
  /** Start to deadline in days, to a tenth; null until both are set. */
  durationDays: number | null;
  applicationCount: number;
  /** The five counts below are null on a freelancer's report: other people's applications are not theirs to count. */
  applicationsWaiting: number | null;
  applicationsSelected: number | null;
  entrantCount: number;
  entriesTotal: number | null;
  entriesWithdrawn: number | null;
  entriesRemoved: number | null;
  milestoneCount: number;
  winnerName: string | null;
  awardAnnouncedAtUtc: string | null;
  /** Null on a freelancer's report unless the award was theirs. */
  awardPaidAtUtc: string | null;
  /** A freelancer's report only. */
  myStatus: MyPart | null;
};

export type OpportunitiesReport = { generatedAtUtc: string; scope: ReportScope; rows: OpportunityRow[] };

export async function fetchOpportunitiesReport(): Promise<OpportunitiesReport> {
  const res = await apiFetch('/api/reports/opportunities');
  if (!res.ok) throw new Error(`Report failed (${res.status})`);
  return res.json();
}

/** Keyed by the account, so signing in as somebody else never shows the last person's opportunities. */
export const opportunitiesReportQuery = (userId: string) => ({
  queryKey: ['reports', 'opportunities', userId] as const,
  queryFn: fetchOpportunitiesReport,
  staleTime: 30_000,
});

/** Whose report the role stands for, until the API has said. */
export function scopeOfRole(role: string | null | undefined): ReportScope {
  return role === 'admin' ? 'all' : role === 'client' ? 'posted' : 'entered';
}

export type OpportunityStatusName = OpportunityRow['status'];

export const OPPORTUNITY_STATUS_LABEL: Record<OpportunityStatusName, string> = {
  draft: 'Draft',
  open: 'Open',
  reviewing: 'In review',
  awarded: 'Awarded',
  cancelled: 'Cancelled',
};
export const OPPORTUNITY_STATUS_ORDER: OpportunityStatusName[] = ['draft', 'open', 'reviewing', 'awarded', 'cancelled'];

export function opportunityStatusSeverity(s: OpportunityStatusName): 'secondary' | 'success' | 'info' | 'warning' | 'danger' {
  switch (s) {
    case 'open':
      return 'success';
    case 'reviewing':
      return 'info';
    case 'awarded':
      return 'warning';
    case 'cancelled':
      return 'danger';
    default:
      return 'secondary';
  }
}

/** "Web development › Dashboards", the category alone, or a dash. */
export function categoryText(label: string | null, subLabel: string | null): string {
  return label ? (subLabel ? `${label} › ${subLabel}` : label) : '—';
}

// ------------------------------------------------------- applications

/**
 * What came of an application: a selection's outcome as the opportunity went,
 * or `unanswered` for one still under review when its opportunity closed.
 */
export type ApplicationResult = 'open' | 'reviewing' | 'won' | 'lost' | 'cancelled' | 'unanswered';

/** The words for a result, on the applications report and the entries report alike. */
export const RESULT_LABEL: Record<ApplicationResult, string> = {
  unanswered: 'Never answered',
  open: 'Competing',
  reviewing: 'Work in review',
  won: 'Won',
  lost: 'Not won',
  cancelled: 'Cancelled',
};
export const RESULT_ORDER: ApplicationResult[] = ['unanswered', 'open', 'reviewing', 'won', 'lost', 'cancelled'];

export function resultSeverity(r: ApplicationResult): 'secondary' | 'success' | 'info' | 'warning' | 'danger' {
  switch (r) {
    case 'won':
      return 'warning';
    case 'open':
      return 'success';
    case 'reviewing':
      return 'info';
    case 'cancelled':
      return 'danger';
    default:
      return 'secondary';
  }
}

/** An entry's state, as the API names it. */
export type EntryStatusName = 'active' | 'withdrawn' | 'deselected' | 'removed';

export const ENTRY_STATUS_LABEL: Record<EntryStatusName, string> = {
  active: 'Active',
  withdrawn: 'Withdrew',
  deselected: 'Selection taken back',
  removed: 'Removed',
};

/** One application as the applications report sends it. */
export type ApplicationReportRow = {
  id: string;
  status: ApplicationStatus;
  /** Null while nothing has come of it, or nothing will: waiting on an open opportunity, not selected, withdrawn, removed. */
  result: ApplicationResult | null;
  freelancerId: string;
  freelancerName: string;
  /** An administrator's report only. */
  freelancerEmail: string | null;
  opportunityId: string;
  opportunitySlug: string;
  opportunityTitle: string;
  opportunityStatus: OpportunityStatusName;
  clientId: string;
  clientName: string;
  category: string | null;
  categoryLabel: string | null;
  subcategory: string | null;
  subcategoryLabel: string | null;
  awardAmount: number;
  currency: string;
  minMeritScore: number;
  deadlineUtc: string | null;
  /** Resolved: the client's own date, else the deadline. */
  entryCloseUtc: string | null;
  submittedAtUtc: string;
  /** When the client first answered: the selection where one made an entry, the decision otherwise. */
  answeredAtUtc: string | null;
  /** The last change to the answer — a decision, a withdrawal, a removal, a selection taken back. */
  changedAtUtc: string | null;
  /** Sent to first answered, in days to a tenth. */
  daysToAnswer: number | null;
  /** The match figure and merit score when it was sent. */
  match: number;
  meritScore: number;
  /** The evaluation's word as filed: "Strong Candidate", "Qualified Candidate", "Developing Candidate", "Outside their usual work". */
  band: string | null;
  commitment: Commitment;
  hoursPerWeek: number;
  portfolioCount: number;
  /** The advantages claimed, as their labels. */
  advantages: string[];
  githubUsername: string | null;
  /** The entry a selection made, and what became of it; null where none was made. */
  entryStatus: EntryStatusName | null;
  milestonesClaimed: number | null;
  pushCount: number | null;
  lastPushAtUtc: string | null;
  /** A removal's reason, or a withdrawal's where the entrant gave one. */
  reason: string | null;
  /** Only where the award was this application's. */
  paidAtUtc: string | null;
};

export type ApplicationsReport = { generatedAtUtc: string; scope: ReportScope; rows: ApplicationReportRow[] };

export async function fetchApplicationsReport(): Promise<ApplicationsReport> {
  const res = await apiFetch('/api/reports/applications');
  if (!res.ok) throw new Error(`Report failed (${res.status})`);
  return res.json();
}

/** Keyed by the account, like the opportunities report. */
export const applicationsReportQuery = (userId: string) => ({
  queryKey: ['reports', 'applications', userId] as const,
  queryFn: fetchApplicationsReport,
  staleTime: 30_000,
});

// ------------------------------------------------------------ entries

/** What came of an entry still in when its opportunity moved on; one that ended first has none. */
export type EntryResult = Exclude<ApplicationResult, 'unanswered'>;

/** One entry as the entries report sends it. */
export type EntryReportRow = {
  id: string;
  status: EntryStatusName;
  result: EntryResult | null;
  freelancerId: string;
  freelancerName: string;
  /** An administrator's report only. */
  freelancerEmail: string | null;
  opportunityId: string;
  opportunitySlug: string;
  opportunityTitle: string;
  opportunityStatus: OpportunityStatusName;
  clientId: string;
  clientName: string;
  category: string | null;
  categoryLabel: string | null;
  subcategory: string | null;
  subcategoryLabel: string | null;
  delivery: OpportunityDelivery;
  awardAmount: number;
  currency: string;
  deadlineUtc: string | null;
  enteredAtUtc: string;
  /** The withdrawal, the removal, or the answer that took a selection back; null while still in. */
  endedAtUtc: string | null;
  /** Entered to the end, the deadline, a cancellation or now, whichever came first — in days to a tenth. */
  daysIn: number | null;
  /** The application it was selected from, where it had one. */
  appliedAtUtc: string | null;
  match: number | null;
  note: string | null;
  githubUsername: string | null;
  repoFullName: string | null;
  /** Null on an opportunity handed in by upload alone. */
  repoSetup: 'pending' | 'provisioned' | 'failed' | null;
  milestoneCount: number;
  /** The board, read as it stood when the entry ended, at the deadline, or now. */
  milestonesClaimed: number;
  onTime: number;
  late: number;
  overdue: number;
  firstClaimAtUtc: string | null;
  /** Every claim's moment, oldest first. */
  claimedAtUtc: string[];
  daysToFirstClaim: number | null;
  pushCount: number;
  lastPushAtUtc: string | null;
  filesUploaded: number;
  /** What the repository's listing showed when last read; null before a read. */
  repoFileCount: number | null;
  repoHas: string[] | null;
  /** An active entry's standing while its opportunity is open or in review; null otherwise. */
  standingScore: number | null;
  standingBand: StandingBand | null;
  standingRank: number | null;
  standingOf: number | null;
  /** A removal's reason, or a withdrawal's where the entrant gave one. */
  reason: string | null;
  awardAnnouncedAtUtc: string | null;
  awardPaidAtUtc: string | null;
  /** The winning repository's way to its winner; never on a freelancer's report. */
  handover: 'not_started' | 'requested' | 'verified' | null;
  /** The stars the client gave the winner, and the winner the client. */
  ratingOfWinner: number | null;
  ratingOfClient: number | null;
};

export type EntriesReport = { generatedAtUtc: string; scope: ReportScope; rows: EntryReportRow[] };

export async function fetchEntriesReport(): Promise<EntriesReport> {
  const res = await apiFetch('/api/reports/entries');
  if (!res.ok) throw new Error(`Report failed (${res.status})`);
  return res.json();
}

/** Keyed by the account, like the other reports. */
export const entriesReportQuery = (userId: string) => ({
  queryKey: ['reports', 'entries', userId] as const,
  queryFn: fetchEntriesReport,
  staleTime: 30_000,
});
