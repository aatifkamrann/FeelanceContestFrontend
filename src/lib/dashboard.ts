import type { StandingSummary } from '@/lib/opportunities';
import { apiFetch } from '@/lib/api';

/**
 * Shapes returned by GET /api/dashboard — one response per role, filled in a
 * single round trip. The discriminant is `role`, so a view narrows with a
 * plain equality check and TypeScript keeps the panels honest.
 */

export type DashSeries = {
  /** ISO days, oldest first — one label per bucket. */
  labels: string[];
  series: { name: string; points: number[] }[];
};

export type DashSplit = { labels: string[]; values: number[] };

export type DashMoney = {
  currency: string;
  announced: number;
  paid: number;
  outstanding: number;
  count: number;
};

export type DashAttention = {
  kind: string;
  severity: 'info' | 'warn' | 'danger';
  title: string;
  detail: string;
  href: string | null;
};

export type DashFeedItem = {
  atUtc: string;
  text: string;
  detail: string;
  href: string | null;
};

export type ClientDashboard = {
  role: 'client';
  generatedAtUtc: string;
  headline: {
    liveOpportunities: number;
    inReview: number;
    awarded: number;
    drafts: number;
    entrants: number;
    avgEntrants: number;
    milestonesClaimed: number;
    milestonesPossible: number;
    repoIssues: number;
    /** Applications under review on the client's open opportunities. */
    applicationsWaiting: number;
  };
  money: DashMoney[];
  activity: DashSeries;
  statusSplit: DashSplit;
  progress: {
    slug: string;
    title: string;
    status: string;
    deadlineUtc: string | null;
    entrants: number;
    claimed: number;
    possible: number;
    /** Who leads the board right now, by standing; null on a board with no rows. */
    leader: { name: string; score: number } | null;
    /** Rows reading "at risk" — the ones to open before deciding who stays. */
    atRisk: number;
  }[];
  attention: DashAttention[];
  /** One row per open opportunity with applications under review, the longest-waiting first. */
  waiting: { slug: string; title: string; count: number; oldestUtc: string }[];
  deadlines: { slug: string; title: string; deadlineUtc: string | null; entrants: number }[];
  recent: DashFeedItem[];
};

export type FreelancerDashboard = {
  role: 'freelancer';
  generatedAtUtc: string;
  headline: {
    activeEntries: number;
    totalEntries: number;
    milestonesClaimed: number;
    milestonesPossible: number;
    wins: number;
    decided: number;
    winRate: number;
    pushes: number;
    repoIssues: number;
  };
  money: DashMoney[];
  activity: DashSeries;
  outcomeSplit: DashSplit;
  progress: {
    slug: string;
    title: string;
    status: string;
    deadlineUtc: string | null;
    claimed: number;
    possible: number;
    repoFullName: string | null;
    /** Repository, upload or both — an upload-only row has no repo to be pending. */
    delivery: 'repository' | 'upload' | 'both';
    lastPushAtUtc: string | null;
    awardAmount: number;
    currency: string;
    /** Their own place on the board — never another entrant's. */
    standing: StandingSummary | null;
  }[];
  attention: DashAttention[];
  deadlines: {
    slug: string;
    title: string;
    deadlineUtc: string | null;
    claimed: number;
    possible: number;
  }[];
  recent: DashFeedItem[];
};

export type AdminDashboard = {
  role: 'admin';
  generatedAtUtc: string;
  headline: {
    users: number;
    clients: number;
    freelancers: number;
    newUsers: number;
    opportunities: number;
    openOpportunities: number;
    inReview: number;
    entries: number;
    repos: number;
    reposFailed: number;
    webhooks24h: number;
    unmatchedWebhooks: number;
    stuckHandovers: number;
    /** Applications under review on every open opportunity. */
    applicationsWaiting: number;
  };
  money: DashMoney[];
  activity: DashSeries;
  signups: DashSeries;
  statusSplit: DashSplit;
  provisionSplit: DashSplit;
  /** Every open opportunity with applications under review, the longest-waiting first. */
  waiting: { slug: string; title: string; count: number; oldestUtc: string }[];
  topClients: {
    /** The account, for links to Users and the reports. */
    id: string;
    name: string;
    opportunities: number;
    entrants: number;
    awardsAnnounced: number;
    awardsPaid: number;
    paidValue: number;
    currency: string;
    lastPostedUtc: string;
  }[];
  topFreelancers: {
    /** The account, as for clients. */
    id: string;
    name: string;
    entries: number;
    claims: number;
    pushes: number;
    wins: number;
    earned: number;
    currency: string;
  }[];
  attention: DashAttention[];
  recent: DashFeedItem[];
};

export type Dashboard = ClientDashboard | FreelancerDashboard | AdminDashboard;

/** The browser's IANA zone ("Asia/Karachi"), or none where it will not say. */
function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

export async function fetchDashboard(): Promise<Dashboard> {
  // The charts count days in this zone, so a point's day is the day the
  // report it opens filters by — the reports' dates are this browser's.
  const tz = browserZone();
  const res = await apiFetch(tz ? `/api/dashboard?tz=${encodeURIComponent(tz)}` : '/api/dashboard');
  if (!res.ok) throw new Error(`Dashboard failed (${res.status})`);
  return res.json();
}

export const dashboardQuery = {
  queryKey: ['dashboard'] as const,
  queryFn: fetchDashboard,
  // Long enough that navigating away and back is instant, short enough that a
  // claim landing while the tab is open shows up on the next visit.
  staleTime: 30_000,
};

/** Percent of a whole, safe at zero — progress bars are everywhere here. */
export function percent(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 100);
}

/** What the dashboard's search box and layout switch hand every view. */
export type DashLens = {
  /** The words typed, lower-cased; empty when nothing is. */
  words: string[];
  /** What was typed, for the line that says nothing matched. */
  text: string;
  view: 'cards' | 'list';
};

/**
 * Whether a row answers the dashboard's search: every word typed appears in
 * one of its fields, in any order, and part of a word counts.
 */
export function matchesWords(words: string[], ...fields: (string | null | undefined)[]): boolean {
  if (words.length === 0) return true;
  const known = fields.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => known.includes(w));
}

/** The empty line of a list the search emptied, as opposed to one with nothing in it. */
export function noMatch(lens: DashLens): string {
  return `Nothing here matches “${lens.text}”.`;
}

/** "12 Aug" — chart axis labels from the API's ISO days. */
export function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
