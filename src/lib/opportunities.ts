import { apiBase } from './api';

/** Shapes returned by the opportunity and entry endpoints. */
export type OpportunityCard = {
  slug: string;
  title: string;
  excerpt: string;
  awardAmount: number;
  currency: string;
  deadlineUtc: string | null;
  /** The last joining date, already resolved: null on the row means the deadline. */
  entryCloseUtc: string | null;
  /** False on a live opportunity whose joining date has passed — still building, shut to newcomers. */
  entryOpen: boolean;
  /** The client's start day (00:00 UTC) — information for the duration, never a gate; null means when it was published. */
  startsAtUtc: string | null;
  publishedAtUtc: string | null;
  status: string;
  /** Repository, upload or both — said on the card, because it decides who can enter. */
  delivery: OpportunityDelivery;
  /** Competitive, or one hired freelancer paid milestone by milestone — said on the card. */
  kind: OpportunityKind;
  /** Entries must run with Docker Compose: every claim is built, and the board says whether it did. */
  requiresCompose: boolean;
  clientName: string;
  clientAvatarUrl: string | null;
  entrantCount: number;
  milestoneCount: number;
  /** Applications submitted, whatever became of them — the line under the excerpt. */
  applicationCount: number;
  /** The trust line — how this client's past promises went. */
  clientAwardsPaid: number;
  clientRatingAvg: number | null;
  clientRatingCount: number;
  /** What kind of work — keys the filter takes back, and the words the card shows. */
  category: string | null;
  categoryLabel: string | null;
  subcategory: string | null;
  subcategoryLabel: string | null;
  /** The door: the merit score an entrant needs (0 for none) and the skills their profile must list. */
  minMeritScore: number;
  skills: string[];
  /** The viewer's own answer, only when the Recommended switch asked for it and they are a freelancer. */
  fit: OpportunityFitResult | null;
};

export type OpportunityFeed = { items: OpportunityCard[]; nextCursor: string | null };

/**
 * The figures over the Opportunities list, across everything open for entry:
 * how many, what the awards add up to, and how many close within the window
 * that turns a card's pulse orange.
 */
export type OpportunityStats = { open: number; rewards: number; currency: string; endingSoon: number };

export const opportunityStatsQuery = {
  queryKey: ['opportunities', 'stats'] as const,
  queryFn: async (): Promise<OpportunityStats> => {
    const res = await apiFetch('/api/opportunities/stats');
    if (!res.ok) throw new Error('Failed to load');
    return res.json();
  },
  staleTime: 60_000,
};

/**
 * One freelancer read against one opportunity — the same judgement on the card,
 * the opportunity page and at the entry door, so none of the three can disagree.
 * "blocked" cannot enter; "outside" can, but it is not their kind of work;
 * "fit" is both.
 */
/**
 * One line of the assessment: what was read, a number out of 100 (null
 * where the portal has nothing to read yet), and the sentence under it.
 */
import type { ApplicationReviewRow, ApplicationStatus } from './applications';
import { apiFetch } from '@/lib/api';

export type OpportunityFitFactor = {
  key: 'skills' | 'projects' | 'record' | 'availability';
  label: string;
  score: number | null;
  detail: string;
};

export type OpportunityFitResult = {
  verdict: 'fit' | 'outside' | 'blocked';
  canEnter: boolean;
  recommended: boolean;
  meritOk: boolean;
  skillsOk: boolean;
  categoryOk: boolean;
  meritScore: number;
  minMerit: number;
  missingSkills: string[];
  /** Every reason the answer is not a plain yes, in the entrant's own words. */
  reasons: string[];
  /** The assessment's lines averaged, skills counting double, 0–100; nought outside their kind of work. */
  match: number;
  /** The word on the ring — not the door: a strong match can still be turned away. */
  matchBand: 'strong' | 'good' | 'moderate' | 'outside';
  /** The four lines behind the match, in the order the entry box shows them. */
  factors: OpportunityFitFactor[];
  /** One sentence for the weakest line, or null when none is weak enough to need one. */
  risk: string | null;
};

/** The words the ring's band wears. */
export function matchLabel(band: OpportunityFitResult['matchBand']): string {
  return {
    strong: 'Strong fit',
    good: 'Good fit',
    moderate: 'Moderate',
    outside: 'Out of category',
  }[band];
}

/**
 * The pulse at the top right of a card: live, ending or ended. "Ending"
 * is within three days of the clock — the joining date where the card
 * knows it, the deadline otherwise (an entrant's own list has no joining
 * date to watch; the deadline is their clock). Null for a draft, which
 * has no clock yet.
 */
export type PulseState = 'live' | 'ending' | 'ended';
const ENDING_MS = 72 * 3_600_000;
export function pulseState(
  c: { status: string; deadlineUtc: string | null; entryCloseUtc?: string | null; entryOpen?: boolean },
  now: number = Date.now(),
): PulseState | null {
  if (c.status === 'draft') return null;
  if (c.status !== 'open' || c.entryOpen === false) return 'ended';
  const clock = c.entryCloseUtc ?? c.deadlineUtc;
  if (!clock) return 'live';
  const ms = new Date(clock).getTime() - now;
  if (ms <= 0) return 'ended';
  return ms <= ENDING_MS ? 'ending' : 'live';
}

/**
 * The time left before entry closes, as the entry box counts it down:
 * "3d 08h" with a day or more to go, "08h 15m" inside a day, "15m" inside
 * an hour. Null once it has passed, or with no clock at all.
 */
export function closesIn(iso: string | null, now: number = Date.now()): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${two(hours)}h`;
  if (hours > 0) return `${two(hours)}h ${two(mins)}m`;
  return `${Math.max(1, mins)}m`;
}

/** The words a fit's verdict wears, and the colour — green, amber, red. */
export function fitLabel(verdict: OpportunityFitResult['verdict']): string {
  return { fit: 'Good fit — you can enter', outside: 'You can enter — not your usual work', blocked: 'Not open to you yet' }[verdict];
}

export type OpportunitySubcategoryDef = {
  key: string;
  label: string;
  /** The same kind of list as the category's, narrower — what the opportunity form offers first once it is picked. */
  skills: string[];
  /** Retired: still the label of what chose it, offered to nothing new. */
  hidden: boolean;
};
export type OpportunityCategoryDef = {
  key: string;
  label: string;
  subcategories: OpportunitySubcategoryDef[];
  /**
   * This portal's spelling of what the kind of work is built with — the
   * names offered to a member who has said they work in it. It decides
   * nothing: an opportunity is not filtered by it and no fit is judged on it.
   */
  skills: string[];
  /** Retired: still the label of what chose it, offered to nothing new. */
  hidden: boolean;
};

/** The taxonomy the form fills from and the browse page filters by — nobody's data. */
export type OpportunityCategories = {
  categories: OpportunityCategoryDef[];
  maxSkills: number;
  maxSkillName: number;
  maxMerit: number;
  /** How many kinds of work a member may claim beyond their primary one. */
  maxSecondaryCategories: number;
};

export const categoriesQuery = {
  queryKey: ['opportunity-categories'] as const,
  queryFn: async (): Promise<OpportunityCategories> => {
    const res = await apiFetch('/api/opportunities/categories');
    if (!res.ok) throw new Error('Failed to load categories');
    return res.json();
  },
  // An administrator edits the list (Admin → Categories); a tab picks the
  // change up within five minutes, or at once after that save.
  staleTime: 5 * 60_000,
};

/**
 * What a picker offers: every kind not hidden, plus any hidden one already
 * chosen — a retired kind stays on what had it and is offered to nothing new.
 */
export function offered<T extends { key: string; hidden: boolean }>(
  list: readonly T[] | undefined,
  ...chosen: (string | null | undefined)[]
): T[] {
  return (list ?? []).filter((x) => !x.hidden || chosen.includes(x.key));
}

/**
 * How entrants hand work in — the client's choice per opportunity, frozen at
 * publish. A repository suits code; an upload suits a logo, a document, a
 * deck; both is a build that comes with files.
 */
export type OpportunityDelivery = 'repository' | 'upload' | 'both';

/**
 * How an opportunity pays (Opportunities/MilestonePay.cs): competitive — many
 * build, one winner is paid — or one hired freelancer, paid milestone by
 * milestone, each approved and paid before the next opens.
 */
export type OpportunityKind = 'competitive' | 'milestones';

/** Where one milestone of an opportunity paid by milestone stands. */
export type MilestonePayState = 'locked' | 'open' | 'submitted' | 'changes_requested' | 'approved' | 'paid';

/** One milestone's review and payment; the ids and notes only for the owner and the hired freelancer. */
export type MilestonePayment = {
  number: number;
  state: MilestonePayState;
  amount: number | null;
  submittedAtUtc: string | null;
  approvedAtUtc: string | null;
  paidAtUtc: string | null;
  checkpointId: string | null;
  ref: string | null;
  changesNote: string | null;
  changesRequestedAtUtc: string | null;
  /** Every decision on it, oldest first; null for anyone but the owner, an administrator and the hired freelancer. */
  reviews: MilestoneReview[] | null;
};

/** One decision on a milestone handed in: approved or sent back, with its remarks and advice. */
export type MilestoneReview = {
  decision: 'approved' | 'changes_requested';
  note: string | null;
  advice: string | null;
  /** An administrator decided on the client's behalf. */
  onBehalf: boolean;
  atUtc: string;
};

/** A payment state as a person reads it. */
export const PAY_STATE_LABEL: Record<MilestonePayState, string> = {
  locked: 'Not open yet',
  open: 'In progress',
  submitted: 'Handed in',
  changes_requested: 'Changes asked for',
  approved: 'Approved — payment due',
  paid: 'Paid',
};

export const usesRepo = (d: OpportunityDelivery) => d === 'repository' || d === 'both';
export const usesUpload = (d: OpportunityDelivery) => d === 'upload' || d === 'both';

export function deliveryLabel(d: OpportunityDelivery): string {
  return d === 'upload' ? 'File upload' : d === 'both' ? 'GitHub + files' : 'GitHub repository';
}

/** How a page shows a stored file in place of its link. */
export type FilePreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'text';

/** A stored file as the previews read it: a brief attachment, or a file an entrant handed in. */
export type PreviewFile = {
  id: string;
  fileName: string;
  /** The type the view link serves it as when it has a preview; as uploaded otherwise. */
  contentType: string;
  sizeBytes: number;
  /** Null keeps the file a download. */
  preview: FilePreviewKind | null;
};

/** One file an entrant handed in. Metadata only; the bytes sit behind the signed-in download and view links. */
export type EntryFile = PreviewFile & {
  uploadedAtUtc: string;
  /** 1-based milestone this file claimed, or null — most files claim nothing. */
  milestone: number | null;
};

/** One board cell, read against its milestone's date. */
export type MilestoneState = 'open' | 'overdue' | 'on_time' | 'late' | 'claimed';

/** The one-word reading of a row on this opportunity — the keep-or-remove signal beside the score. */
export type StandingBand = 'too_early' | 'on_track' | 'behind' | 'at_risk';

/** One line of the standing breakdown; available is 0 where the portal cannot read the part yet. */
export type StandingPart = {
  key: string;
  label: string;
  earned: number;
  available: number;
  detail: string;
};

/** A row's standing as a list shows it — the score out of 100, the place, the word. */
export type StandingSummary = {
  score: number;
  band: StandingBand;
  rank: number;
  of: number;
};

/** The viewer's own standing, with the arithmetic and the one step that moves it most. */
export type OwnStanding = StandingSummary & {
  parts: StandingPart[];
  nextStep: string | null;
};

export function standingLabel(band: StandingBand): string {
  return { too_early: 'Too early to say', on_track: 'On track', behind: 'Behind', at_risk: 'At risk' }[band];
}

/** The colour a band wears; "too early" wears none, because it says nothing yet. */
export function standingSeverity(band: StandingBand): 'success' | 'warning' | 'danger' | null {
  if (band === 'on_track') return 'success';
  if (band === 'behind') return 'warning';
  if (band === 'at_risk') return 'danger';
  return null;
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** A row summarised: what the client reads while deciding. */
export type EntrantStanding = {
  done: number;
  onTime: number;
  late: number;
  overdue: number;
  /** How many of the opportunity's milestones carry a date at all — zero means the rest say nothing. */
  dated: number;
};

export type OpportunityEntrant = {
  displayName: string;
  avatarUrl: string | null;
  /** Their account, for the profile link. */
  userId: string;
  /** The one line from their profile, or null if they have not written one. */
  headline: string | null;
  /**
   * The client's alone: the first of their publicly shown projects that fits
   * this brief and says what came of it. Null without one, and for anyone else.
   */
  pastWork: { title: string; outcome: string } | null;
  meritScore: number;
  meritBand: 'new here' | 'building' | 'established' | 'proven';
  note: string | null;
  enteredAtUtc: string;
  /** Board columns — 1-based milestone numbers; null when the board is hidden. */
  milestonesDone: number[] | null;
  /** The same columns told apart by their dates, one per milestone in order. */
  milestoneStates: MilestoneState[] | null;
  standing: EntrantStanding | null;
  /**
   * The standing score the board is ordered by, its place and its reading —
   * as public as the board. The breakdown behind it comes only to the
   * entrant themselves and to whoever can remove them.
   */
  standingScore: number | null;
  standingBand: StandingBand | null;
  standingRank: number | null;
  standingParts: StandingPart[] | null;
  /** Last push or last upload — activity, whichever way the work arrives. */
  lastPushAtUtc: string | null;
  /** How many files they handed in — as public as the board; null when the board is hidden. */
  filesUploaded: number | null;
  /**
   * The files themselves, when the viewer may open them: the entrant's own
   * always, an administrator's always, the client's from the deadline on —
   * and before it, the files of the milestones the entrant has claimed.
   */
  files: EntryFile[] | null;
  /** The entrant's portable record — wins anywhere, ratings from clients. */
  wins: number;
  ratingAvg: number | null;
  ratingCount: number;
  /** Owner-only review fields. */
  entryId: string | null;
  repoFullName: string | null;
  /**
   * One per milestone, in order, on an opportunity that requires Docker Compose:
   * the build of each claim, as public as the claim. Null otherwise.
   */
  builds: BuildCell[] | null;
  /**
   * The final version's preview once the entry is frozen on an opportunity that
   * runs previews — for the client, an administrator and the entrant:
   * none, pending, starting or running. Null otherwise.
   */
  finalPreview: 'none' | 'pending' | 'starting' | 'running' | null;
  /**
   * One per milestone, in order, on a competitive opportunity: each claim's
   * reviews — on every row for the client and administrators, on their own
   * row for the entrant. Null for everyone else, and on a job paid by milestone.
   */
  reviews?: ClaimReviewCell[] | null;
};

/** Where one claim stands with its reviewer; "updated" is work landed after a request for changes. */
export type ClaimReviewState = 'unclaimed' | 'unreviewed' | 'approved' | 'changes_requested' | 'updated';

/** The reviews of one board cell: the claim they answer (null while unclaimed), its state, every decision. */
export type ClaimReviewCell = {
  checkpointId: string | null;
  state: ClaimReviewState;
  reviews: MilestoneReview[];
};

/** A claim's review state as a person reads it. */
export const CLAIM_REVIEW_LABEL: Record<ClaimReviewState, string> = {
  unclaimed: 'Not claimed yet',
  unreviewed: 'Not reviewed yet',
  approved: 'Approved',
  changes_requested: 'Changes asked for',
  updated: 'Updated since the request',
};

/** The build behind one board cell; the checkpoint id is what the log dialog asks about. */
export type BuildCell = {
  status: 'none' | 'pending' | 'building' | 'built' | 'failed';
  checkpointId: string | null;
  finishedAtUtc: string | null;
  /** The milestone's preview while it is on its way or up; null otherwise. */
  preview: 'pending' | 'starting' | 'running' | null;
};

/** What GET /api/previews/{id} answers: one preview, as its panel reads it. */
export type PreviewState = {
  id: string;
  status: 'none' | 'pending' | 'starting' | 'running' | 'stopped' | 'failed';
  kind: 'milestone' | 'final';
  milestoneNumber: number | null;
  commit: string | null;
  canStart: boolean;
  startProblem: string | null;
  address: string | null;
  requestedAtUtc: string | null;
  startedAtUtc: string | null;
  lastSeenAtUtc: string | null;
  stoppedAtUtc: string | null;
  stopping: boolean;
  stopReason: string | null;
  error: string | null;
  logTail: string | null;
  notes: string | null;
  idleMinutes: number;
  /** The viewer is the entrant, so the notes are theirs. */
  viewerIsEntrant: boolean;
};

/** One party's public score of the other on a finished award. */
export type AwardRating = {
  stars: number;
  comment: string | null;
  byName: string;
  updatedAtUtc: string;
};

/** The client's public payment record — derived, never self-reported. */
export type ClientRecord = {
  opportunitiesPosted: number;
  /** Cancelled after entrants had joined — empty cancellations are not counted. */
  opportunitiesCancelled: number;
  awardsAnnounced: number;
  awardsPaid: number;
  medianDaysToPay: number | null;
  oldestUnpaidDays: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  reviews: {
    stars: number;
    comment: string;
    byName: string;
    opportunityTitle: string;
    atUtc: string;
  }[];
};

export type OpportunityAward = {
  winnerName: string;
  announcedAtUtc: string;
  /** Public — an award left unpaid is visible to everyone who looks. */
  paidAtUtc: string | null;
  ratingOfClient: AwardRating | null;
  ratingOfWinner: AwardRating | null;
  /** Viewer-specific rating state. */
  viewerIsWinner: boolean;
  canRate: boolean;
  myRating: { stars: number; comment: string | null } | null;
  /** Set for the owner and the winner (the rating endpoint needs it). */
  id: string | null;
  /** Owner-only handover trail. */
  handover: 'not_started' | 'requested' | 'verified' | null;
  winnerEntryId: string | null;
  /** The winner's profile, where the owner reads how to pay them. Owner-only. */
  winnerUserId: string | null;
  transferTargetLogin: string | null;
  /** When the transfer actually reached GitHub — null while it is still queued. */
  transferRequestedAtUtc: string | null;
  handoverVerifiedAtUtc: string | null;
  handoverNote: string | null;
  winnerRepoFullName: string | null;
  /** Paid by milestone: each milestone's review and payment, in order; null on a competitive opportunity. */
  payments: MilestonePayment[] | null;
  amountPaid: number | null;
  amountOwed: number | null;
};

/** A brief file. Metadata is public; the bytes sit behind the signed-in download. */
export type OpportunityAttachment = PreviewFile;

export type OpportunityMilestone = {
  title: string;
  description: string | null;
  dueUtc: string | null;
  /** This milestone's share of the work in percent, or null on a checklist that states none. */
  weightPercent: number | null;
  /** What it pays, paid by milestone; null on a competitive opportunity. */
  amount: number | null;
};

/** One row of the technical requirements table: the constraint, and what it asks for. */
export type OpportunityRequirement = { title: string; detail: string };

/** One line of the scoring rubric. The page adds the points up and calls the sum the total. */
export type OpportunityCriterion = { points: number; title: string; description: string | null };

/**
 * How long an opportunity runs, in whole weeks rounded up, from where its
 * timeline counts (timelineFrom; null for now) to its deadline — the
 * timeline an entrant commits to. Null without a deadline.
 */
export function timelineWeeks(fromUtc: string | null, deadlineUtc: string | null): number | null {
  if (!deadlineUtc) return null;
  const from = fromUtc ? new Date(fromUtc).getTime() : Date.now();
  const days = (new Date(deadlineUtc).getTime() - from) / 86_400_000;
  return Math.max(1, Math.ceil(days / 7));
}

export type OpportunityDetail = {
  id: string;
  slug: string;
  title: string;
  briefMarkdown: string;
  awardAmount: number;
  currency: string;
  status: string;
  /** Repository, upload or both — every role-specific panel branches on this before saying "repo". */
  delivery: OpportunityDelivery;
  kind: OpportunityKind;
  requiresCompose: boolean;
  deadlineUtc: string | null;
  /** The last joining date, already resolved: null on the row means the deadline. */
  entryCloseUtc: string | null;
  entryOpen: boolean;
  /** True only when the client actually set an earlier joining date than the deadline. */
  entryClosesEarly: boolean;
  /** The client's own start day, raw — information for the duration, never a gate; the editor reads blank back as blank. */
  startsAtUtc: string | null;
  publishedAtUtc: string | null;
  /** Set once the client calls it off — as public as the brief it voided. */
  cancelledAtUtc: string | null;
  cancelReason: string | null;
  clientName: string;
  clientAvatarUrl: string | null;
  clientRecord: ClientRecord;
  milestones: OpportunityMilestone[];
  attachments: OpportunityAttachment[];
  /** The terms beside the brief — what the work must be built with, and what it is scored on. Either may be empty. */
  requirements: OpportunityRequirement[];
  criteria: OpportunityCriterion[];
  /** Search metadata — drafted by AI on request, always saved by the client. */
  metaTitle: string | null;
  metaDescription: string | null;
  /** What kind of work, and who it is for — the terms the entry door checks. */
  category: string | null;
  categoryLabel: string | null;
  subcategory: string | null;
  subcategoryLabel: string | null;
  minMeritScore: number;
  skills: string[];
  /** The viewer's own fit; null for anyone who is not a freelancer. */
  viewerFit: OpportunityFitResult | null;
  /** The day's AI-drafted board note; null when the feature (or AI) is off. */
  narrative: { text: string; atUtc: string } | null;
  entrants: OpportunityEntrant[];
  entrantCount: number;
  /** Applications submitted, whatever became of them — as public as the entrant count. */
  applicationCount: number;
  /** The viewer's own application, if they have one — the page says where it stands instead of offering the wizard. */
  viewerApplication: {
    id: string;
    status: ApplicationStatus;
    submittedAtUtc: string;
    decidedAtUtc: string | null;
  } | null;
  /** The client's (and an administrator's) review box; null for everyone else. */
  applications: ApplicationReviewRow[] | null;
  /** limits.maxEntriesPerOpportunity, or null when uncapped (the default). */
  maxEntries: number | null;
  entriesFull: boolean;
  showBoard: boolean;
  isOwner: boolean;
  /** The viewer is a portal administrator: they may remove an entrant, and nothing else. */
  isAdmin: boolean;
  /** Owner-only: whether the portal's GitHub App is configured at all. */
  githubConfigured: boolean | null;
  /** Owner-only: whether signed URLs can be minted — gates the ZIP fallback. */
  storageConfigured: boolean | null;
  viewerEntry: {
    id: string;
    githubUsername: string;
    enteredAtUtc: string;
    repoFullName: string | null;
    provisionStatus: 'pending' | 'provisioned' | 'failed';
    milestonesDone: number[];
    /** The entrant's own files. */
    files: EntryFile[];
    /** Why another file may not land right now, or null while uploads are open. */
    uploadProblem: string | null;
    /** The entrant's own standing on this board, arithmetic included. */
    standing: OwnStanding | null;
    /** Their final version's preview, once there is a final to run; null before. */
    finalPreview: OpportunityEntrant['finalPreview'];
  } | null;
  award: OpportunityAward | null;
};

export type MyOpportunity = {
  id: string;
  slug: string;
  title: string;
  awardAmount: number;
  currency: string;
  deadlineUtc: string | null;
  startsAtUtc: string | null;
  publishedAtUtc: string | null;
  status: string;
  createdAtUtc: string;
  entrantCount: number;
  milestoneCount: number;
  /** Applications under review on this opportunity while it is open — 0 on any other. */
  applicationsWaiting: number;
};

export type MyEntry = {
  id: string;
  /** Withdrawn is the entrant's own decision; removed is the client's. */
  status: 'active' | 'withdrawn' | 'removed';
  /** Where this entry stands on a live board; null once the opportunity is decided or the entry is gone. */
  standing: StandingSummary | null;
  /** Set on a removed entry — the client's reason, word for word. */
  removedAtUtc: string | null;
  removedReason: string | null;
  /** When read access to the repository ends; until then it can still be cloned. */
  repoAccessEndsAtUtc: string | null;
  githubUsername: string;
  repoFullName: string | null;
  provisionStatus: 'pending' | 'provisioned' | 'failed';
  lastPushAtUtc: string | null;
  milestonesDone: number;
  milestoneCount: number;
  filesUploaded: number;
  enteredAtUtc: string;
  /** True when the award went to this entry. */
  won: boolean;
  awardPaidAtUtc: string | null;
  /** The viewer's fit for this opportunity — the ring on the row, the same judgement the card makes. */
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

export type Me = {
  id: string;
  email: string;
  displayName: string;
  /** The picture beside the name in the header; null where none is set. */
  avatarUrl: string | null;
  role: string;
  githubLogin: string | null;
  /** False on a portal without the GitHub App — then no account can be connected, so nothing should ask. */
  githubConfigured: boolean;
  /** The terms version this account accepted; null for an account older than the terms. */
  acceptedTermsVersion: number | null;
  /** True while the portal's terms are newer than that — the gate prompts, the API refuses writes. */
  termsPending: boolean;
  /** True while no code has come back: the gate prompts, and the API refuses everything but the session's own calls. */
  confirmationPending: boolean;
  /** Where they stand with identity verification; "none" until a session is opened, and again after a lapsed one. */
  identityStatus: IdentityStatus;
  /** A door of theirs asks for a verification they have not got — the cue to invite, never a gate of its own. */
  identityRequired: boolean;
  /** International form, or null — kept only to text a code to. */
  phone: string | null;
  /** Where the standing codes went, masked; null for a channel nothing went to. */
  codeSentTo: CodeSentTo;
};

/**
 * "b•••@example.com" and "+92 ••• 4567" — enough to recognise a typo, not
 * enough to copy — and when the code standing there stops working, so the
 * form counts down to a real moment rather than from a fixed fifteen.
 */
export type CodeSentTo = { email: string | null; phone: string | null; expiresAtUtc: string | null };

/** The five words the API uses for where a member stands with the verification provider. */
export type IdentityStatus = 'none' | 'pending' | 'in_review' | 'approved' | 'declined';

export type FeedParams = {
  q?: string;
  status?: string;
  category?: string;
  subcategory?: string;
  /** "ending" orders by soonest deadline and drops what has ended; "award" puts the largest award first. */
  sort?: string;
  /** Ask for the viewer's fit on every card — only a signed-in freelancer gets one. */
  fit?: boolean;
  cursor?: string;
};

export async function fetchFeed(params: FeedParams): Promise<OpportunityFeed> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status) search.set('status', params.status);
  if (params.category) search.set('category', params.category);
  if (params.subcategory) search.set('subcategory', params.subcategory);
  if (params.sort) search.set('sort', params.sort);
  if (params.fit) search.set('fit', 'true');
  if (params.cursor) search.set('cursor', params.cursor);
  const qs = search.toString();
  const path = `/api/opportunities${qs ? `?${qs}` : ''}`;
  // Read on the server for the first page and in the browser for every
  // page after — and for the viewer's fit, which rides the cookie.
  const res =
    typeof window === 'undefined'
      ? await fetch(`${apiBase()}${path}`, { cache: 'no-store' })
      : await apiFetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Feed failed: ${res.status}`);
  return res.json();
}

/**
 * Server-side detail fetch. The opportunity itself reads the same for
 * everybody; the viewer's cookie header goes along for the parts that are
 * theirs — their fit, their entry, their application — and the client
 * still refetches for live viewer state.
 */
export async function fetchOpportunity(
  slug: string,
  cookie?: string,
): Promise<OpportunityDetail | null> {
  const res = await fetch(`${apiBase()}/api/opportunities/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
    headers: cookie ? { cookie } : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Opportunity failed: ${res.status}`);
  return res.json();
}

/** The signed-in user, or null. Browser-side only (rides the cookie). */
export async function fetchMe(): Promise<Me | null> {
  const res = await apiFetch('/api/auth/me');
  if (!res.ok) return null;
  return res.json();
}

export const meQuery = {
  queryKey: ['me'] as const,
  queryFn: fetchMe,
  staleTime: 60_000,
};

/**
 * Where to go once the signed-in account has changed — a sign-in, a sign-out,
 * a new account confirmed, a reset that signs in — as a new page load, never
 * a client-side move. Everything the last account's pages read (its profile,
 * its verification link, its inbox, its applications) sits in this tab's
 * query cache under keys that name no account, and forms seed themselves
 * from it once: a client-side move handed the next account the last one's
 * profile form, headline and bio filled in, ready to be saved as its own.
 * A page load starts the cache, the forms and the live connection from
 * nothing, as the new account.
 */
export function startFreshAt(path: string): void {
  window.location.assign(path);
}

/** Which AI features this portal may offer — panels for off features never render. */
export type AiStatus = {
  enabled: boolean;
  sendCode: boolean;
  features: {
    milestones: boolean;
    coach: boolean;
    digest: boolean;
    spam: boolean;
    narrative: boolean;
    seo: boolean;
    standing: boolean;
    categorise: boolean;
    recommended: boolean;
    /** The About drafted from the rest of the profile form. */
    summary: boolean;
    /** The improvements box on a freelancer's own profile review. */
    review: boolean;
    /** The approach drafted on an application's fifth step. */
    approach: boolean;
    /** The evaluation worded on a filed application. */
    evaluation: boolean;
    /** The requirements table drafted on the opportunity form. */
    requirements: boolean;
    /** The scoring rubric drafted on the opportunity form. */
    criteria: boolean;
  };
};

/**
 * The opportunity form as the form-reading AI tools receive it — the whole
 * form on every request, saved or not, in the API's `OpportunityFormSnapshot`
 * shape. No dates, and the award only paid by milestone — the total the
 * milestone draft splits; null otherwise, so it changes nothing a
 * competitive form's drafts read.
 */
export type OpportunityFormSnapshot = {
  title: string;
  briefMarkdown: string;
  category: string | null;
  subcategory: string | null;
  skills: string[];
  requirements: { title: string; detail: string }[];
  delivery: OpportunityDelivery | null;
  requiresCompose: boolean;
  milestones: { title: string; description: string }[];
  criteria: { points: number | null; title: string; description: string }[];
  kind: OpportunityKind;
  awardAmount: number | null;
};

/** The six tools that read the opportunity form, by the slug each is asked at. */
export type FormFeature = 'categorise' | 'coach' | 'requirements' | 'milestones' | 'criteria' | 'seo';

/**
 * Which parts of the form each tool reads — the same table as the API's
 * `AiFormReads` (Services/Ai/AiRules.cs), which is what the prompt is
 * actually built from. The form is a funnel: a tool is handed the
 * sections above the one it fills, so its answer builds on what the
 * client has decided and cannot lean on a field they have not reached.
 * Here the table says which edits make an answer stale: a milestone
 * typed below the category picker changes nothing the picker's
 * suggestion read, so that button stays quiet and spends nothing.
 */
export const FORM_READS: Record<FormFeature, (keyof OpportunityFormSnapshot)[]> = {
  categorise: ['title', 'briefMarkdown'],
  // The coach reviews the whole form: contradictions between the brief
  // and the terms set beside it are exactly what it is for.
  coach: ['title', 'briefMarkdown', 'category', 'subcategory', 'skills', 'requirements', 'delivery', 'requiresCompose', 'milestones', 'criteria', 'kind', 'awardAmount'],
  requirements: ['title', 'briefMarkdown', 'category', 'subcategory', 'skills'],
  milestones: ['title', 'briefMarkdown', 'category', 'subcategory', 'skills', 'requirements', 'delivery', 'requiresCompose', 'kind', 'awardAmount'],
  criteria: ['title', 'briefMarkdown', 'category', 'subcategory', 'requirements', 'delivery', 'requiresCompose', 'milestones'],
  seo: ['title', 'briefMarkdown', 'category', 'subcategory'],
};

/** What one tool's answer answers: the parts it reads, as one string to compare. */
export const formKey = (feature: FormFeature, form: OpportunityFormSnapshot): string =>
  JSON.stringify(FORM_READS[feature].map((part) => form[part]));

/** One AI draft as the API reports it. Output is present only when done. */
export type AiArtifact = {
  status: 'none' | 'pending' | 'done' | 'failed' | 'skipped';
  output: unknown;
  note: string | null;
  provider: string | null;
  completedAtUtc: string | null;
};

export const aiStatusQuery = {
  queryKey: ['ai-status'] as const,
  queryFn: async (): Promise<AiStatus | null> => {
    const res = await apiFetch('/api/ai/status');
    if (!res.ok) return null;
    return res.json();
  },
  staleTime: 60_000,
};

/**
 * Whether Docker Compose builds are on: a build host is switched on and
 * has passed its test. While they are off the form does not offer the
 * requirement at all, and the API refuses it.
 */
export type BuildHostStatus = { ready: boolean };

export const buildHostQuery = {
  queryKey: ['build-host-status'] as const,
  queryFn: async (): Promise<BuildHostStatus | null> => {
    const res = await apiFetch('/api/build-host/status');
    if (!res.ok) return null;
    return res.json();
  },
  staleTime: 60_000,
};

/** POST helper that surfaces the API's { error } message. */
/**
 * A request the API refused, carrying the status alongside the message so
 * a form can tell "wrong password" (401) from "the portal is unreachable"
 * — a plain network failure is still a plain Error.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** The refusal's whole body, for the flags some carry beside the sentence — verificationRequired, expired. */
    public readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The door refused for want of an identity verification: send them to verify and back. */
  get verificationRequired(): boolean {
    return this.body.verificationRequired === true;
  }
}

export async function postJson<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) ?? {};
      if (typeof data.error === 'string') message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function putJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return res.json();
}

/**
 * The bytes of an upload, PUT as they are to the slot the reserve made: the
 * API writes them to storage and answers with the file as it is now listed.
 * Through the API rather than to a signed storage address, so no bucket is
 * ever asked to answer a page and none needs a CORS rule.
 */
export async function putFile<T = unknown>(url: string, file: File): Promise<T> {
  const res = await apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) {
    let message = `The upload was refused (${res.status}).`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return res.json();
}

export async function deleteJson(url: string): Promise<void> {
  const res = await apiFetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
}

/** "512 KB", "4.2 MB" — file sizes the way a person reads them. */
/** The PrimeIcons glyph for a file of this type. */
export function fileIcon(contentType: string): string {
  const t = contentType;
  if (t === 'application/pdf') return 'pi-file-pdf';
  if (t.startsWith('image/')) return 'pi-image';
  if (t.startsWith('video/')) return 'pi-video';
  if (t.startsWith('audio/')) return 'pi-volume-up';
  if (t.includes('zip') || t.includes('compressed')) return 'pi-box';
  if (t.startsWith('text/') || t.includes('document') || t.includes('markdown') || t.includes('json'))
    return 'pi-file-edit';
  return 'pi-file';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAward(amount: number, currency: string): string {
  return `${currency === 'USD' ? '$' : `${currency} `}${amount.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })}`;
}

/** "$312K", "$1.2M", "$950" — a total read at a glance. */
export function compactAward(amount: number, currency: string): string {
  const figure = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  return (currency === 'USD' ? '$' : currency + ' ') + figure;
}

/** "★ 4.8" — one-decimal rating average, identical on every surface. */
export function starScore(avg: number): string {
  return `★ ${avg.toFixed(1)}`;
}

/** "3h ago", "2d ago" — board activity stamps. */
export function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** "6 days left", "closes in 3 hours", or "entry closed". */
export function deadlineLabel(deadlineUtc: string | null): string {
  if (!deadlineUtc) return '';
  const ms = new Date(deadlineUtc).getTime() - Date.now();
  // The deadline is when the work freezes. Entry may well have closed
  // earlier, which is the joining date's line to say, not this one.
  if (ms <= 0) return 'deadline passed';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'ends within the hour';
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} left`;
  const days = Math.floor(hours / 24);
  return `${days} days left`;
}

/**
 * "10 wk", "6 d", "5 h" — the time to the deadline as one figure, for the
 * box over the brief. Empty once it has passed, so the box can say so in
 * its own word.
 */
export function timeLeftFigure(deadlineUtc: string | null, now: number = Date.now()): string {
  if (!deadlineUtc) return '';
  const ms = new Date(deadlineUtc).getTime() - now;
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 48) return Math.max(hours, 1) + ' h';
  const days = Math.floor(hours / 24);
  if (days < 14) return days + ' d';
  return Math.round(days / 7) + ' wk';
}

/**
 * The joining date's own line, for an opportunity that shuts to newcomers before
 * it ends. Empty when entry runs to the deadline, because then the deadline
 * line above it already says everything there is to say.
 */
export function joiningLabel(entryCloseUtc: string | null, entryOpen: boolean): string {
  if (!entryCloseUtc) return '';
  if (!entryOpen) return 'entry closed';
  const hours = Math.floor((new Date(entryCloseUtc).getTime() - Date.now()) / 3_600_000);
  if (hours < 1) return 'last hour to join';
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} left to join`;
  return `${Math.floor(hours / 24)} days left to join`;
}

/**
 * The start date's own countdown while it is still ahead: "in 3 days".
 * Empty once the competition has started — the date is history then, and
 * the page says "Started" beside it instead of counting.
 */
export function startsLabel(startsAtUtc: string | null): string {
  if (!startsAtUtc) return '';
  const ms = new Date(startsAtUtc).getTime() - Date.now();
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'within the hour';
  if (hours < 48) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `in ${Math.floor(hours / 24)} days`;
}

/**
 * When an opportunity's work starts, or started: the client's start day or the
 * moment it was published, whichever is later — a start of "today" on an
 * opportunity posted at three in the afternoon began at three.
 */
export function startedAt(startsAtUtc: string | null, publishedAtUtc: string | null): string | null {
  if (!startsAtUtc || !publishedAtUtc) return startsAtUtc ?? publishedAtUtc;
  return Date.parse(startsAtUtc) > Date.parse(publishedAtUtc) ? startsAtUtc : publishedAtUtc;
}

/** "14 days", "36 hours" — the opportunity duration, from its start to its deadline. Empty without both, or backwards. */
export function opportunityDuration(fromUtc: string | null, deadlineUtc: string | null): string {
  if (!fromUtc || !deadlineUtc) return '';
  const ms = Date.parse(deadlineUtc) - Date.parse(fromUtc);
  if (ms <= 0) return '';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * Where an opportunity's timeline counts from. Published, it is when the work
 * started (startedAt); a draft counts from its start day while that is still
 * ahead, and otherwise from now — null — which is when publishing would
 * start it.
 */
export function timelineFrom(startsAtUtc: string | null, publishedAtUtc: string | null): string | null {
  if (publishedAtUtc) return startedAt(startsAtUtc, publishedAtUtc);
  return startsAtUtc && Date.parse(startsAtUtc) > Date.now() ? startsAtUtc : null;
}

/**
 * The opportunity duration as a card figure: "10 wk", whole weeks rounded up as
 * the eligibility tab counts them; "9 d" under a fortnight and "36 h" under
 * two days, where a week would overstate it. From a timeline start (null for
 * now) to the deadline; empty without a deadline.
 */
export function timelineFigure(fromUtc: string | null, deadlineUtc: string | null, now: number = Date.now()): string {
  if (!deadlineUtc) return '';
  const ms = Date.parse(deadlineUtc) - (fromUtc ? Date.parse(fromUtc) : now);
  if (ms <= 0) return '';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return Math.max(hours, 1) + ' h';
  const days = Math.round(hours / 24);
  if (days < 14) return days + ' d';
  return Math.ceil(ms / 604_800_000) + ' wk';
}

/** "16 Sep 2026" — a day with no time on it, like the start date, read in UTC. */
export function utcDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * "12 Sep 2026, 17:00 UTC" — a moment somebody has to plan their week
 * around, so it carries the time and names its zone. UTC explicitly: this
 * renders on the server, and a server-local format would disagree with the
 * browser's re-render.
 */
export function utcMoment(iso: string): string {
  const at = new Date(iso);
  const day = at.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const time = at.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${day}, ${time} UTC`;
}

/** "1 milestone", "4 milestones" — a count with its noun, for the summary lines;
 * a noun that does not just take an s says its plural. */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

/**
 * The status word as a badge shows it: "Reviewing", "Awarded", "Cancelled".
 * The API sends the lower-case enum name; Open and Draft get their own
 * coloured tags where they appear, and this covers the rest so "awarded"
 * never sits next to "Draft" in the same list.
 */
export function statusLabel(status: string): string {
  return status ? status[0].toUpperCase() + status.slice(1) : status;
}
