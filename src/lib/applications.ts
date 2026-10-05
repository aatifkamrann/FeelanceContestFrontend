import { postJson, type OpportunityDelivery, type OpportunityFitResult, type OpportunityKind } from './opportunities';
import { apiFetch } from '@/lib/api';

/**
 * Applying to compete. The opportunity page used to put a freelancer straight
 * in; now it sends them through eight steps that read their own profile
 * against the brief and ask for the one thing the profile cannot supply —
 * how they would do this job — and the client selects who competes. The
 * shapes here mirror the API's ApplicationEndpoints exactly.
 */

/**
 * Removed: selected, then taken off the opportunity with a reason. Withdrawn:
 * selected, then the entrant left. Both are final.
 */
export type ApplicationStatus = 'under_review' | 'selected' | 'not_selected' | 'removed' | 'withdrawn';

/** How a selection ended up, as the opportunity went: still running, in review, won, lost, or cancelled. */
/** hired: paid by milestone, the selection was the hire itself. */
export type ApplicationOutcome = 'open' | 'reviewing' | 'won' | 'hired' | 'lost' | 'cancelled';

/** How much of their week the applicant gives this opportunity — the application's own answer, not the profile's. */
export type Commitment = 'full' | 'partial' | 'limited';

export const COMMITMENTS: { value: Commitment; label: string; hint: string }[] = [
  { value: 'full', label: 'Full availability', hint: 'This would be the main thing you work on.' },
  { value: 'partial', label: 'Partial availability', hint: 'Alongside other work, with real hours for it.' },
  { value: 'limited', label: 'Limited availability', hint: 'Evenings and weekends, or a few hours a week.' },
];

export function statusLabel(status: ApplicationStatus): string {
  return status === 'selected'
    ? 'Selected'
    : status === 'not_selected'
      ? 'Not selected'
      : status === 'removed'
        ? 'Removed'
        : status === 'withdrawn'
          ? 'Withdrawn'
          : 'Under review';
}

export function commitmentLabel(c: Commitment): string {
  return COMMITMENTS.find((o) => o.value === c)?.label ?? c;
}

/** One project as the application carries it — a copy of the profile's, with the relevance figure it had. */
export type PortfolioItem = {
  title: string;
  role: string | null;
  tech: string | null;
  outcome: string | null;
  relevance: number | null;
};

/** One line of the evaluation: the portal's label, and the model's phrase for it where one has landed. */
export type EvaluationLine = { id: string; label: string; text: string };

export type ApplicationEvaluation = {
  /** The model's words: none asked for, still coming, done, or not run. The figure and lines are there regardless. */
  status: 'none' | 'pending' | 'done' | 'failed' | 'skipped';
  percent: number;
  /** "Strong Candidate", "Qualified Candidate", "Developing Candidate", or outside their usual work. */
  band: string;
  strengths: EvaluationLine[];
  risks: EvaluationLine[];
  /** One sentence for the client on what to open first, once the model has answered. */
  note: string | null;
  worded: boolean;
  provider: string | null;
  completedAtUtc: string | null;
};

export type ApplicationStage = {
  key: 'submitted' | 'evaluation' | 'review' | 'selection' | 'start';
  label: string;
  state: 'done' | 'current' | 'todo';
};

/** After a no: what held up, and one line per weakness — read off the evaluation, never the client's reasons. */
export type ApplicationAdvice = { strong: string[]; improve: string[] };

/** The application as its owner reads it back, and as the client's review row carries it. */
export type ApplicationView = {
  id: string;
  status: ApplicationStatus;
  submittedAtUtc: string;
  decidedAtUtc: string | null;
  /** The entry a selection made; null until then. */
  entryId: string | null;
  match: number;
  meritScore: number;
  summary: string;
  approach: string;
  portfolio: PortfolioItem[];
  commitment: Commitment;
  hoursPerWeek: number;
  /** The claimed advantages, as labels. */
  advantages: string[];
  githubUsername: string;
  evaluation: ApplicationEvaluation;
  /** "Stronger than N% of applicants"; null with nobody to compare with. */
  strongerThan: number | null;
  /** Set once not selected; null while under review and once selected. */
  advice: ApplicationAdvice | null;
  /** Still under review when the opportunity closed — nothing more happens to it. */
  closedUndecided: boolean;
  /** Once selected, how the competition went; null for every other status. */
  outcome: ApplicationOutcome | null;
  stages: ApplicationStage[];
};

/** One of the applicant's own projects as the portfolio step lists it, with the portal's relevance figure. */
export type ApplyProject = {
  id: string;
  title: string;
  role: string | null;
  tech: string | null;
  outcome: string | null;
  /** 0–100, or null when the brief names nothing to measure past work against. */
  relevance: number | null;
};

/** Everything the eight steps show, read once. */
export type ApplyContext = {
  opportunity: {
    slug: string;
    title: string;
    awardAmount: number;
    currency: string;
    status: string;
    delivery: OpportunityDelivery;
    needsGithubUsername: boolean;
    /** Competitive, or one hire paid by milestone — the pledges are worded by it. */
    kind: OpportunityKind;
    category: string | null;
    categoryLabel: string | null;
    skills: string[];
    minMeritScore: number;
    /** When the work starts, or started — the client's start day or the moment of publishing. */
    startsAtUtc: string | null;
    deadlineUtc: string | null;
    entryCloseUtc: string | null;
    entryOpen: boolean;
    /** Whole weeks from the start to the deadline. */
    weeks: number | null;
    clientName: string;
    /** Selected freelancers — the competitors. */
    entrantCount: number;
    maxEntries: number | null;
    /** Applications submitted, whatever became of them. */
    applicationCount: number;
  };
  fit: OpportunityFitResult | null;
  eligibility: {
    canApply: boolean;
    /** Why not, in the applicant's words, when canApply is false. */
    problem: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    /** Whether this portal asks freelancers to verify their identity before applying. */
    identityRequired: boolean;
    identityVerified: boolean;
    availabilitySet: boolean;
    availabilityOk: boolean;
  };
  profile: {
    summary: string | null;
    hoursPerWeek: number | null;
    projects: ApplyProject[];
    relevantCount: number;
  };
  advantages: { key: string; label: string }[];
  suggestedAdvantages: string[];
  /** The application already filed, if any — then the wizard shows where it stands instead. */
  application: ApplicationView | null;
};

/** One row of the client's review box. */
export type ApplicationReviewRow = {
  applicant: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    headline: string | null;
  };
  application: ApplicationView;
  /** Why they withdrew, in their words; null unless the application reads Withdrawn and they said. */
  withdrawnReason: string | null;
};

export type ApplyRequest = {
  summary: string;
  approach: string;
  projectIds: string[];
  commitment: Commitment;
  hoursPerWeek: number;
  advantages: string[];
  githubUsername: string | null;
  dedicateTime: boolean;
  onSchedule: boolean;
  competitive: boolean;
  originalWork: boolean;
  captchaToken: string | null;
};

/** A past project at or above this is highlighted and ticked before the applicant chooses — the API's own line. */
export const RELEVANT_FROM = 60;

export const MIN_APPROACH = 100;
export const MAX_APPROACH = 1000;

export const applyQuery = (slug: string) => ({
  queryKey: ['apply', slug],
  queryFn: async (): Promise<ApplyContext | null> => {
    const res = await apiFetch(`/api/opportunities/${encodeURIComponent(slug)}/apply`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (await res.json()) as ApplyContext;
  },
  staleTime: 15_000,
});

/**
 * One application as My Opportunities lists it: where it stands, what was sent
 * in three figures, and the opportunity in the figures an entry row carries.
 */
export type MyApplication = {
  id: string;
  status: ApplicationStatus;
  submittedAtUtc: string;
  decidedAtUtc: string | null;
  /** The entry a selection made; null until then. */
  entryId: string | null;
  match: number;
  meritScore: number;
  portfolioCount: number;
  hoursPerWeek: number;
  /** The model's words on the evaluation are still on their way. */
  evaluationPending: boolean;
  /** The viewer's fit for this opportunity, read now — the ring on the row. */
  fit: OpportunityFitResult | null;
  opportunity: {
    slug: string;
    title: string;
    awardAmount: number;
    currency: string;
    deadlineUtc: string | null;
    startsAtUtc: string | null;
    publishedAtUtc: string | null;
    status: string;
    delivery: OpportunityDelivery;
  };
};

export const myApplicationsQuery = {
  queryKey: ['my-applications'] as const,
  queryFn: async (): Promise<MyApplication[]> => {
    const res = await apiFetch('/api/applications/mine');
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (await res.json()) as MyApplication[];
  },
};

export const applicationQuery = (id: string) => ({
  queryKey: ['application', id],
  queryFn: async (): Promise<ApplicationView> => {
    const res = await apiFetch(`/api/applications/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (await res.json()) as ApplicationView;
  },
});

export const submitApplication = (slug: string, body: ApplyRequest) =>
  postJson<ApplicationView>(`/api/opportunities/${encodeURIComponent(slug)}/applications`, body);

export const decideApplication = (id: string, decision: 'selected' | 'not_selected') =>
  postJson<{ status: ApplicationStatus; entryId: string | null }>(
    `/api/applications/${encodeURIComponent(id)}/decide`,
    { decision },
  );

/** The word for "stronger than N%": where the application sits in the field. */
export function strengthRange(strongerThan: number | null): string {
  if (strongerThan === null) return 'First applicant';
  if (strongerThan >= 75) return 'Top candidate range';
  if (strongerThan >= 50) return 'Upper range';
  if (strongerThan >= 25) return 'Middle range';
  return 'Building range';
}
