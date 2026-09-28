import { putJson, type OpportunityCard } from '@/lib/opportunities';
import { apiFetch } from '@/lib/api';

/**
 * The portfolio a member keeps, and the merit score read off it. One shape
 * for both views: `own` says whether the viewer is looking at themselves,
 * which is the only thing that differs between editing and reading.
 *
 * One field is not the same for both, and it is not about editing: payment
 * details come back only to the member, an administrator or a client. To
 * anybody else `payments` is null rather than empty — a freelancer reading a
 * rival's page is not told there is something they cannot see.
 */

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type ProfileSkill = {
  name: string;
  years: number;
  level: SkillLevel;
};

export type LanguageLevel = 'beginner' | 'conversational' | 'professional' | 'fluent' | 'native';

export type ProfileLanguage = {
  name: string;
  level: LanguageLevel;
};

export type WorkType = 'fulltime' | 'parttime' | 'independent' | 'agency';

/** Whether they can start — the API's words for it, see ProfileRules.ParseAvailability. */
export type Availability = 'now' | 'week' | 'twoweeks' | 'unavailable';

/** Keys from the API's ProjectDurations and EngagementTypes lists. */
export type ProjectDuration = 'short' | 'medium' | 'long';
export type EngagementType = 'competitive' | 'direct' | 'hourly';

/** One kind of work, as the API hands it over: the stored key and its name. */
export type CategoryRef = { key: string; label: string };

/** One screenshot as the API hands it over: where to show it from, and its id. */
export type ProjectImage = {
  /** What the form sends back to keep it — the bytes travel once, on the save that added it. */
  id: string;
  url: string;
};

export type ProfileProject = {
  title: string;
  description: string | null;
  /** What came of it: the result or the benefit, in the member's words. */
  outcome: string | null;
  role: string | null;
  /** Which kind of work it was, from the same taxonomy an opportunity is filed under. */
  category: CategoryRef | null;
  tech: string | null;
  url: string | null;
  repoUrl: string | null;
  year: number | null;
  /** 1-12 beside the year; null where only a year was given. */
  month: number | null;
  /**
   * The member has said they may show this work publicly. False reaches only
   * the member's own copy of the page — nobody else is sent the row at all.
   */
  mayShowPublicly: boolean;
  images: ProjectImage[];
};

/**
 * One picture on the form: one already stored, which travels back as its id
 * so the bytes are not sent twice, or one just chosen, which travels as the
 * data URL the browser shrank it to.
 */
export type ProjectImageDraft = ProjectImage | { dataBase64: string };

export const isStoredImage = (image: ProjectImageDraft): image is ProjectImage => 'id' in image;

/**
 * A project as the form holds it: the kind of work is its key rather than
 * its label, for the reason the profile's own categories are — the form
 * holds what is stored.
 */
export type ProjectDraft = {
  title: string;
  description: string | null;
  outcome: string | null;
  role: string | null;
  category: string | null;
  tech: string | null;
  url: string | null;
  repoUrl: string | null;
  year: number | null;
  month: number | null;
  mayShowPublicly: boolean;
  images: ProjectImageDraft[];
};

/**
 * The most pictures one project carries, mirroring ProjectImageRules on the
 * API — the form stops offering at the same number the save refuses past, so
 * nobody meets the ceiling as an error message.
 */
export const MAX_PROJECT_IMAGES = 4;

/** One filled-in field of a payment method, already labelled by the API. */
export type PaymentDetail = {
  key: string;
  label: string;
  value: string;
};

export type ProfilePayment = {
  method: string;
  methodLabel: string;
  label: string | null;
  /** The stored details could not be decrypted — the owner has to type them again. */
  unreadable: boolean;
  details: PaymentDetail[];
};

/** One thing a method needs before money can move. */
export type PaymentField = {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  maxLength: number;
};

/** A way of being paid, and the fields it asks for once it is picked. */
export type PaymentMethodDef = {
  key: string;
  label: string;
  hint: string;
  /** The field that says which account this is — what a duplicate is judged on. */
  identity: string;
  fields: PaymentField[];
};

/** One line of the merit breakdown — what was earned, out of what, and why. */
export type MeritPart = {
  label: string;
  earned: number;
  available: number;
  detail: string;
};

export type Merit = {
  score: number;
  max: number;
  band: 'new here' | 'building' | 'established' | 'proven';
  /** How much of the self-reported half is filled in, as a percentage. */
  completeness: number;
  portfolio: { earned: number; available: number; parts: MeritPart[] };
  record: { earned: number; available: number; parts: MeritPart[] };
};

/** One of the seven steps of joining, read back off the saved profile. */
export type StrengthStep = { label: string; done: boolean; detail: string };

/** The owner's own checklist — null on anybody else's copy of the page. */
export type Strength = { percent: number; steps: StrengthStep[] };

/** The review box's reading, as the API validated it: a phrase, and up to three lines with a figure each. */
export type ProfileReviewOutput = {
  strongFor: string | null;
  improvements: { id: string; gain: number; text: string }[];
};

export type MemberProfile = {
  userId: string;
  displayName: string;
  /** The picture beside the name, versioned; null where none is set. */
  avatarUrl: string | null;
  role: string;
  githubLogin: string | null;
  /** Whether this portal has a GitHub sign-in to offer at all. */
  githubConnectable: boolean;
  memberSince: string;
  /** The viewer is looking at their own profile. */
  own: boolean;
  headline: string | null;
  bio: string | null;
  /** The kind of work they mainly do, from the same taxonomy an opportunity uses. */
  primaryCategory: CategoryRef | null;
  /** Up to three more, in their own order. */
  secondaryCategories: CategoryRef[];
  workType: WorkType | null;
  location: string | null;
  timeZone: string | null;
  languages: ProfileLanguage[];
  yearsExperience: number | null;
  hoursPerWeek: number | null;
  /** Null until they say — never "available now" on anybody's behalf. */
  availability: Availability | null;
  preferredDurations: ProjectDuration[];
  preferredProjectTypes: EngagementType[];
  /** As they wrote it, read beside timeZone. */
  workingWindow: string | null;
  websiteUrl: string | null;
  linkedInUrl: string | null;
  updatedAtUtc: string | null;
  skills: ProfileSkill[];
  /** What the viewer may see: their own includes work they have not published. */
  projects: ProfileProject[];
  /** Null where the viewer may not read them, which is not the same as none. */
  payments: ProfilePayment[] | null;
  /** For a client held back from the payment details — until they award the member, or until the member verifies — the line that says so. */
  paymentsNote: string | null;
  /** When the verification provider approved the person behind this profile — the mark beside the name. */
  identityVerifiedAtUtc: string | null;
  /** The seven steps ticked off — the owner's alone, null for everybody else. */
  strength: Strength | null;
  merit: Merit;
};

/** One way of being paid, as the form holds it: values keyed by field. */
export type PaymentDraft = {
  method: string;
  label: string;
  details: Record<string, string>;
  /**
   * This row came back with no values because the stored ones could not be
   * decrypted. Carried so the form can say so instead of showing an empty
   * row the member never emptied; stripped before the save.
   */
  unreadable?: boolean;
};

/**
 * A change to the picture, riding the same save as everything else: a
 * new one as the data URL the browser shrank it to, or a removal. Absent
 * from the draft means the stored picture is left alone.
 */
export type AvatarChange = { dataBase64: string } | { remove: true };

/** What a save sends. The whole portfolio each time — it is one form. */
export type ProfileDraft = {
  /** The account's own name, saved with the form it sits at the top of. */
  displayName: string;
  /** Omitted where the picture was not touched. */
  avatar?: AvatarChange;
  headline: string;
  bio: string;
  /** Keys, not labels — the form holds what is stored. */
  primaryCategory: string | null;
  secondaryCategories: string[];
  workType: WorkType | null;
  location: string;
  timeZone: string;
  languages: ProfileLanguage[];
  yearsExperience: number | null;
  hoursPerWeek: number | null;
  availability: Availability | null;
  preferredDurations: ProjectDuration[];
  preferredProjectTypes: EngagementType[];
  workingWindow: string;
  websiteUrl: string;
  linkedInUrl: string;
  skills: ProfileSkill[];
  projects: ProjectDraft[];
  /** Omitted rather than empty where the form never showed them. */
  payments?: PaymentDraft[];
};

async function fetchProfile(userId?: string): Promise<MemberProfile | null> {
  const res = await apiFetch(userId ? `/api/profile/${userId}` : '/api/profile');
  if (!res.ok) return null;
  return (await res.json()) as MemberProfile;
}

export const myProfileQuery = {
  queryKey: ['profile', 'me'] as const,
  queryFn: () => fetchProfile(),
  staleTime: 30_000,
};

/**
 * The screen after the eighth step of joining: where the member stands,
 * read fresh each time. A client's carries the greeting alone — the four
 * figures and the opportunity are a freelancer's.
 */
export type Welcome = {
  displayName: string;
  role: string;
  strengthPercent: number | null;
  meritScore: number | null;
  meritMax: number | null;
  rank: {
    /** One more than the number of freelancers with a higher score; equals share a rank. */
    global: number;
    ofFreelancers: number;
    /** The same rank among freelancers whose primary category is this one; null without a category. */
    category: { key: string; label: string; rank: number; of: number } | null;
  } | null;
  /** Opportunities open for entry today, and how many of them the portal recommends to this member. */
  openOpportunities: number;
  matches: number;
  /** The recommended opportunity asking for the most of their skills — null when none is theirs to enter. */
  strongest: OpportunityCard | null;
  /**
   * The first of their own projects that fits the strongest opportunity and says
   * what came of it, shown on its card. Null without one.
   */
  strongestWork: { title: string; outcome: string } | null;
};

async function fetchWelcome(): Promise<Welcome> {
  const res = await apiFetch('/api/profile/welcome');
  if (!res.ok) throw new Error('Welcome failed: ' + res.status);
  return (await res.json()) as Welcome;
}

export const welcomeQuery = {
  queryKey: ['profile', 'welcome'] as const,
  queryFn: fetchWelcome,
  staleTime: 30_000,
};

export const profileQuery = (userId: string) => ({
  queryKey: ['profile', userId] as const,
  queryFn: () => fetchProfile(userId),
  staleTime: 30_000,
});

/**
 * The saved profile as the form holds it. Keys, not labels: the taxonomy
 * loaded separately turns them back into words; a picture already stored
 * goes back as the id that keeps it; and payment rows are absent, not
 * empty, where the viewer never had them, so a save that omits the list
 * leaves the stored one alone. The profile editor's own draft, and the
 * application wizard's when it offers to tighten the summary.
 */
export function draftFrom(p: MemberProfile): ProfileDraft {
  return {
    displayName: p.displayName,
    headline: p.headline ?? '',
    bio: p.bio ?? '',
    primaryCategory: p.primaryCategory?.key ?? null,
    secondaryCategories: p.secondaryCategories.map((c) => c.key),
    workType: p.workType,
    location: p.location ?? '',
    timeZone: p.timeZone ?? '',
    languages: p.languages,
    yearsExperience: p.yearsExperience,
    hoursPerWeek: p.hoursPerWeek,
    availability: p.availability,
    preferredDurations: p.preferredDurations,
    preferredProjectTypes: p.preferredProjectTypes,
    workingWindow: p.workingWindow ?? '',
    websiteUrl: p.websiteUrl ?? '',
    linkedInUrl: p.linkedInUrl ?? '',
    skills: p.skills,
    projects: p.projects.map((project) => ({
      ...project,
      category: project.category?.key ?? null,
      images: [...project.images],
    })),
    payments:
      p.payments === null
        ? undefined
        : p.payments.map((row) => ({
            method: row.method,
            label: row.label ?? '',
            details: Object.fromEntries(row.details.map((d) => [d.key, d.value])),
            unreadable: row.unreadable,
          })),
  };
}

export const saveProfile = (draft: ProfileDraft) =>
  putJson<MemberProfile>('/api/profile', {
    ...draft,
    // The one field the wire shape differs on: a picture already stored
    // travels as its id alone, so the bytes cross the wire once — on the
    // save that added them — rather than on every save afterwards.
    projects: draft.projects.map((p) => ({
      ...p,
      images: p.images.map((image) =>
        isStoredImage(image) ? { id: image.id } : { dataBase64: image.dataBase64 },
      ),
    })),
  });

/** A completion date as it reads: 07/2024, or just the year where no month was given. */
export const completedOn = (year: number | null, month: number | null): string | null =>
  year === null ? null : month === null ? String(year) : `${String(month).padStart(2, '0')}/${year}`;

/**
 * What other members already wrote in the free-text fields, most-used
 * first — the form offers it back so one city or skill is spelt one way
 * across the portal. Empty lists are the normal answer on a new portal.
 */
export type ProfileSuggestions = {
  locations: string[];
  timeZones: string[];
  languages: string[];
  skills: string[];
  roles: string[];
  workingWindows: string[];
};

const NO_SUGGESTIONS: ProfileSuggestions = {
  locations: [],
  timeZones: [],
  languages: [],
  skills: [],
  roles: [],
  workingWindows: [],
};

export const suggestionsQuery = {
  queryKey: ['profile', 'suggestions'] as const,
  queryFn: async (): Promise<ProfileSuggestions> => {
    const res = await apiFetch('/api/profile/suggestions');
    if (!res.ok) return NO_SUGGESTIONS;
    return (await res.json()) as ProfileSuggestions;
  },
  staleTime: 5 * 60_000,
};

/**
 * The catalogue the payment form builds itself from. It is the shape of the
 * questions, not anybody's answers, so it caches for the session — a new
 * method appears when the API ships one, without a change here.
 */
export type PaymentCatalogue = { methods: PaymentMethodDef[]; max: number };

const NO_PAYMENT_METHODS: PaymentCatalogue = { methods: [], max: 0 };

export const paymentMethodsQuery = {
  queryKey: ['profile', 'payment-methods'] as const,
  queryFn: async (): Promise<PaymentCatalogue> => {
    const res = await apiFetch('/api/profile/payment-methods');
    if (!res.ok) return NO_PAYMENT_METHODS;
    return (await res.json()) as PaymentCatalogue;
  },
  staleTime: 30 * 60_000,
};

export const SKILL_LEVELS: { value: SkillLevel; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', hint: 'Used it, still learning it.' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Ships production work with it.' },
  { value: 'advanced', label: 'Advanced', hint: 'Ships the hard parts, unsupervised.' },
  { value: 'expert', label: 'Expert', hint: 'The person others ask.' },
];

/**
 * How somebody works — the answer a client wants before they count on a
 * deadline. None of the four is worth more than the others, and no opportunity
 * is closed to any of them; it is context for "20 hours a week", which
 * means a different thing from each of them.
 */
export const WORK_TYPES: { value: WorkType; label: string; hint: string }[] = [
  {
    value: 'fulltime',
    label: 'Full-time freelancer',
    hint: 'Freelancing is the job — the week is yours to book.',
  },
  {
    value: 'parttime',
    label: 'Part-time freelancer',
    hint: 'Around something else: a job, a degree, a business.',
  },
  {
    value: 'independent',
    label: 'Independent professional',
    hint: 'A business of one, with your own clients and your own terms.',
  },
  {
    value: 'agency',
    label: 'Agency/team member',
    hint: 'One of a team — somebody may be working beside you.',
  },
];

/**
 * The most hours a week the slider offers, mirroring ProfileRules — the
 * API caps at the same number, so nobody meets the ceiling as a surprise.
 */
export const MAX_HOURS_PER_WEEK = 80;

/**
 * Whether somebody can start — a status, not a fact about them, and the
 * one line on a profile a client acts on directly. Null is nothing said.
 */
export const AVAILABILITIES: { value: Availability; label: string; hint: string }[] = [
  { value: 'now', label: 'Available now', hint: 'Could start this week.' },
  { value: 'week', label: 'Available within 1 week', hint: 'Finishing something.' },
  { value: 'twoweeks', label: 'Available within 2 weeks', hint: 'Free within a fortnight.' },
  { value: 'unavailable', label: 'Currently unavailable', hint: 'Not taking anything on for now.' },
];

/** The lengths of work somebody prefers. A preference: no opportunity checks it. */
export const PROJECT_DURATIONS: { value: ProjectDuration; label: string; hint: string }[] = [
  { value: 'short', label: 'Short-term', hint: 'Days to a few weeks — an opportunity, a fix, a feature.' },
  { value: 'medium', label: 'Medium-term', hint: 'One to three months — a build with milestones.' },
  { value: 'long', label: 'Long-term', hint: 'Three months and up — a product, or a retainer.' },
];

/**
 * The terms somebody prefers to work on. Every opportunity on the portal is the
 * first of these today; the other two are asked so the portal knows who to
 * put in front of a client once it can offer them.
 */
export const PROJECT_TYPES: { value: EngagementType; label: string; hint: string }[] = [
  {
    value: 'competitive',
    label: 'Competitive Fixed Price',
    hint: 'An opportunity: several entrants, one fixed award, the client picks.',
  },
  {
    value: 'direct',
    label: 'Direct Fixed Price',
    hint: 'One client, one freelancer, a price agreed up front.',
  },
  { value: 'hourly', label: 'Hourly Engagement', hint: 'Paid by the hour, for as long as the work runs.' },
];

/**
 * How well a language is spoken. A separate scale from a skill's on
 * purpose: "strong at Urdu" says nothing, and the question a client is
 * actually asking is whether the stand-up can happen in it.
 */
export const LANGUAGE_LEVELS: { value: LanguageLevel; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', hint: 'A few phrases. Enough to be polite.' },
  {
    value: 'conversational',
    label: 'Conversational',
    hint: 'Can hold a conversation about the work, given patience.',
  },
  {
    value: 'professional',
    label: 'Professional',
    hint: 'Works in it: meetings, written specs, code review.',
  },
  { value: 'fluent', label: 'Fluent', hint: 'No effort. An accent at most.' },
  { value: 'native', label: 'Native', hint: 'Native, or grew up with it.' },
];

/**
 * Which rows of a list say the same thing as an earlier one. The fold
 * matches the API's: trimmed, inner runs of whitespace collapsed, case set
 * aside — so "React Native", "react native" and "React  Native" are one
 * entry, and the save that would be refused is caught before it is sent.
 * Only the repeats are returned; the first mention is not the mistake.
 */
export function duplicateIndexes(values: (string | null | undefined)[]): Set<number> {
  const seen = new Map<string, number>();
  const repeats = new Set<number>();
  values.forEach((value, i) => {
    const folded = (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (folded === '') return;
    if (seen.has(folded)) repeats.add(i);
    else seen.set(folded, i);
  });
  return repeats;
}

/**
 * What makes two payment rows the same account: the method, and its
 * identifying field once spacing, case and the punctuation people put in
 * account numbers are set aside. The same fold the API applies before it
 * refuses the save.
 */
export function paymentIdentity(
  method: PaymentMethodDef | undefined,
  details: Record<string, string>,
): string {
  if (!method) return '';
  const value = (details[method.identity] ?? '').replace(/[\s\-./]/g, '').toLowerCase();
  return value === '' ? '' : method.key + ':' + value;
}

/**
 * The colour a merit band wears. Never red: a low score means new, not bad,
 * and the portal is trying to get new people their first opportunity.
 */
export function bandSeverity(band: Merit['band']): 'success' | 'info' | 'warning' | null {
  if (band === 'proven') return 'success';
  if (band === 'established') return 'info';
  if (band === 'building') return 'warning';
  return null;
}
