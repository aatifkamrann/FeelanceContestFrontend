'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { verifyPath } from '@/lib/identity';
import { useRouter } from 'next/navigation';
import { Button } from 'primereact/button';
import { Calendar } from 'primereact/calendar';
import { Checkbox } from 'primereact/checkbox';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { TabPanel, TabView } from 'primereact/tabview';
import { Toast } from 'primereact/toast';
import { useQuery } from '@tanstack/react-query';
import {
  AiAwardDraft,
  AiCategoryDraft,
  AiCoach,
  AiCriteriaDraft,
  AiMilestonesDraft,
  AiRequirementsDraft,
  AiSeoDraft,
  awardVerdict,
  toSnapshot,
  type AwardVerdict,
} from '@/components/AiBriefTools';
import { useFormDraft } from '@/components/AiDraft';
import BriefAttachments from '@/components/BriefAttachments';
import OpportunityPreview from '@/components/OpportunityPreview';
import HelpIcon from '@/components/HelpIcon';
import SuggestInput from '@/components/SuggestInput';
import {
  aiStatusQuery,
  buildHostQuery,
  categoriesQuery,
  offered,
  ApiError,
  postJson,
  putJson,
  usesRepo,
  type AwardSuggestion,
  type OpportunityDelivery,
  type OpportunityKind,
} from '@/lib/opportunities';
import { brandingQuery } from '@/lib/api';
import { skillsForCategories, suggestSkills } from '@/lib/categorise';
import { STEPPER } from '@/lib/forms';
import { duplicateIndexes, suggestionsQuery } from '@/lib/profile';
import { SKILL_SEEDS } from '@/lib/suggestions';

export type EditorMilestone = {
  title: string;
  description: string;
  dueUtc?: string | null;
  /** This milestone's share of the work in percent; blank on a checklist that states none. */
  weightPercent?: number | null;
  /** What it pays, on an opportunity paid by milestone; blank while drafting. */
  amount?: number | null;
};
/** One row of the technical requirements table: the constraint, and what it asks for. */
export type EditorRequirement = { title: string; detail: string };
/** One line of the scoring rubric. */
export type EditorCriterion = { points: number | null; title: string; description: string };
export type EditorValue = {
  id?: string;
  title: string;
  briefMarkdown: string;
  awardAmount: number | null;
  /** Competitive, or one hired freelancer paid milestone by milestone. Frozen at publish. */
  kind: OpportunityKind;
  /** How work is handed in. No default: it is a term of the deal, and the client chooses it. */
  delivery: OpportunityDelivery | null;
  /** Entries must run with Docker Compose — only with a repository delivery; the tick clears when that goes. */
  requiresCompose: boolean;
  /**
   * The start day, 00:00 UTC — information for the opportunity duration, never
   * a gate on entry. A new opportunity starts today; blank means the same.
   */
  startsAtUtc: string | null;
  deadlineUtc: string | null;
  /** Blank keeps entry open to the deadline, which is what every opportunity did before this field. */
  entryCloseUtc: string | null;
  milestones: EditorMilestone[];
  metaTitle: string;
  metaDescription: string;
  /** What kind of work — keys from the API's taxonomy. A draft may leave both blank; publish needs the category. */
  category: string | null;
  subcategory: string | null;
  /** The merit score an entrant needs; null or 0 is no minimum. */
  minMeritScore: number | null;
  /** Skills an entrant's profile must list. Blank rows are dropped on save. */
  skills: string[];
  /** The technical requirements table. Rows left wholly blank are dropped on save. */
  requirements: EditorRequirement[];
  /** The scoring rubric. Rows left wholly blank are dropped on save. */
  criteria: EditorCriterion[];
};

const CATEGORY_MISSING = 'Pick a category before publishing — it is how entrants browse for this opportunity.';

/**
 * The range the form offers for the merit floor, narrower than the 0–100
 * the API accepts: the ends are answers nobody means. A floor of 5 turns
 * nobody away and one of 95 needs a record almost nobody has, so both read
 * as a slip of the stepper rather than a decision. No minimum is still an
 * answer — it is the empty box, not a number.
 */
const MIN_MERIT = 10;
const MAX_MERIT = 90;

/**
 * InputNumber's own min and max only bound its steppers: once typing has
 * updated the model, its blur check sees no change and never clamps. So the
 * form clamps for itself, on blur and again in the payload.
 */
const clampMerit = (n: number | null): number | null =>
  n === null ? null : Math.min(MAX_MERIT, Math.max(MIN_MERIT, Math.round(n)));

/** A row said twice — the same outline the profile form draws. */
const REPEATED = 'border-red-500/60 bg-red-500/5';

/**
 * The two ways an opportunity pays. Competitive first: it is what the portal
 * was built for, and what every opportunity before the choice was.
 */
const KIND_OPTIONS: { value: OpportunityKind; icon: string; title: string; detail: string }[] = [
  {
    value: 'competitive',
    icon: 'pi-trophy',
    title: 'Competitive',
    detail: 'The applicants you select all build it. You review every entry after the deadline and pay the one winner the award.',
  },
  {
    value: 'milestones',
    icon: 'pi-list-check',
    title: 'Paid by milestone',
    detail: 'You hire one applicant. Each milestone is handed in, approved and paid its amount before the next one opens.',
  },
];

/** Whole dollars split over n milestones, the remainder cent-free and on the first. */
const evenAmounts = (total: number, n: number): number[] => {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? total - base * n : 0));
};

/**
 * A drafted split made to add up to the total exactly: the model's amounts
 * scaled where they miss it, whole dollars, the rounding on the last; an
 * even split where the model gave none. Nothing without a total to split.
 */
const fitAmounts = (drafted: (number | null | undefined)[], total: number | null): (number | null)[] => {
  const n = drafted.length;
  if (!total || total <= 0 || n === 0) return drafted.map(() => null);
  if (drafted.some((a) => a == null || a <= 0)) return evenAmounts(total, n);
  const sum = drafted.reduce<number>((s, a) => s + (a ?? 0), 0);
  if (sum === total) return drafted.map((a) => a!);
  const scaled = drafted.map((a) => Math.max(1, Math.round(((a ?? 0) * total) / sum)));
  scaled[n - 1] += total - scaled.reduce((s, a) => s + a, 0);
  return scaled;
};

/**
 * The three ways work arrives, in the words a client chooses between. Order
 * is the order of likelihood on a portal built for code opportunities.
 */
const DELIVERY_OPTIONS: { value: OpportunityDelivery; icon: string; title: string; detail: string }[] = [
  {
    value: 'repository',
    icon: 'pi-github',
    title: 'GitHub repository',
    detail: 'A private repo per entrant. Milestones are claimed by pushed tags; the winning repo transfers to you when you pay.',
  },
  {
    value: 'upload',
    icon: 'pi-upload',
    title: 'File upload',
    detail: 'For a logo, a document, a deck. Entrants hand files in on the opportunity page; you review them here after the deadline.',
  },
  {
    value: 'both',
    icon: 'pi-clone',
    title: 'Both',
    detail: 'A repo each, plus files alongside — a build that comes with design assets or a written report.',
  },
];

const DELIVERY_MISSING = 'Choose how work is delivered: a GitHub repository, file uploads, or both.';

/**
 * The constraints a technical brief tends to bury, offered as row names so
 * the table is five clicks from full. A name already in the table is not
 * offered again.
 */
const REQUIREMENT_NAMES = ['Language', 'Frameworks', 'Data', 'Serving', 'Eval', 'Hosting', 'Licence'];

/** The API's ceilings, mirrored so the buttons stop where the save would refuse. */
const MAX_REQUIREMENTS = 20;
const MAX_CRITERIA = 10;
const MAX_TERM_TITLE = 60;
const MAX_TERM_DETAIL = 240;

/**
 * The rubric most code opportunities want, to start from rather than to type.
 * A hundred points, so the sentence on the page reads "a 100-point rubric".
 */
const STANDARD_RUBRIC: EditorCriterion[] = [
  { points: 35, title: 'Functionality', description: 'All requirements met and working end-to-end' },
  { points: 25, title: 'Craft & quality', description: 'Execution, structure, attention to detail' },
  { points: 20, title: 'UX & design', description: 'Usability, polish, adherence to spec' },
  { points: 10, title: 'Timeliness', description: 'Milestones delivered on schedule' },
  { points: 10, title: 'Documentation', description: 'Setup, handoff, and delivery clarity' },
];

const EMPTY: EditorValue = {
  title: '',
  briefMarkdown: '',
  awardAmount: null,
  kind: 'competitive',
  delivery: null,
  requiresCompose: false,
  startsAtUtc: null,
  deadlineUtc: null,
  entryCloseUtc: null,
  milestones: [{ title: '', description: '', dueUtc: null, weightPercent: null, amount: null }],
  metaTitle: '',
  metaDescription: '',
  category: null,
  subcategory: null,
  minMeritScore: null,
  skills: [],
  requirements: [],
  criteria: [],
};

/**
 * ISO or nothing — the shape the API takes, from whatever the Calendar
 * hands back. The fields say UTC, so the time typed or picked is taken as
 * UTC: the Calendar works in the browser's own clock, and its numbers are
 * carried across rather than its instant, which would shift every date by
 * the browser's offset and leave the opportunity page — which reads UTC —
 * showing a different time from the one the client chose.
 */
const iso = (value: unknown): string | null => {
  if (!value) return null;
  const d = value as Date;
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()),
  ).toISOString();
};

/** The other way: a UTC moment as the Calendar should show it — its UTC numbers on the browser's clock. */
const wallClock = (at: string | number): Date => {
  const d = new Date(at);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
};

/**
 * The start date is a day, not a moment — 00:00 UTC on it. The Calendar
 * works in the browser's own midnight, so the day crosses over by its
 * numbers, never by the instant (which would slip a day east of Greenwich).
 */
const dayIso = (value: unknown): string | null => {
  if (!value) return null;
  const d = value as Date;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
};

/** Today, as the start date field holds a day. */
const todayUtc = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** "14 days", "13 days 9 hours", "20 hours" — how long an opportunity runs, start to deadline. */
const durationLabel = (ms: number): string => {
  const hours = Math.floor(ms / HOUR_MS);
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (days === 0) return plural(hours, 'hour');
  return rest === 0 ? plural(days, 'day') : `${plural(days, 'day')} ${plural(rest, 'hour')}`;
};

const blankRequirement = (r: EditorRequirement) => r.title.trim() === '' && r.detail.trim() === '';
const blankCriterion = (c: EditorCriterion) =>
  c.title.trim() === '' && c.description.trim() === '' && c.points === null;

/**
 * A hundred split over n milestones in whole percentages: the remainder
 * goes to the first ones, so 100 over 3 is 34, 33, 33 rather than a total
 * of 99.
 */
const evenShares = (n: number): number[] => {
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => base + (i < 100 - base * n ? 1 : 0));
};

/**
 * One drafted step's due moment: the (i+1)/n point of the build window, so
 * the last step lands on the deadline itself. Where the steps are a day
 * apart or more, each one takes the deadline's own time of day — a checklist
 * that reads "18:00" all the way down, rather than whatever minute the
 * arithmetic happened to land on.
 */
const stepDue = (beginsAt: number, end: number, i: number, n: number, byTheDay: boolean): string => {
  const at = new Date(beginsAt + ((end - beginsAt) * (i + 1)) / n);
  if (!byTheDay) {
    at.setUTCSeconds(0, 0);
    return at.toISOString();
  }
  const deadline = new Date(end);
  return new Date(
    Date.UTC(
      at.getUTCFullYear(),
      at.getUTCMonth(),
      at.getUTCDate(),
      deadline.getUTCHours(),
      deadline.getUTCMinutes(),
    ),
  ).toISOString();
};

/**
 * The dates and shares a drafted checklist arrives with: the steps spread
 * evenly across the window the client has already set, and the hundred split
 * the way "Split shares evenly" splits it. The model names the steps; the
 * schedule is arithmetic on the dates above, not a second opinion about them.
 *
 * Every number is a starting point — each row stays editable, and publishing
 * still asks the client to mean them. An opportunity with no deadline yet gets no
 * dates at all: that window would be the portal's default rather than
 * anything the client chose, and a date nobody chose is worse than a blank.
 */
const scheduleDraft = (
  drafted: { title: string; description: string; amount?: number | null }[],
  beginsAt: number,
  deadlineUtc: string | null,
  paidBy: { total: number | null } | null = null,
): EditorMilestone[] => {
  const n = drafted.length;
  if (n === 0) return [];
  const shares = evenShares(n);
  // Paid by milestone the amounts are the shares, and they are the total's.
  const amounts = paidBy ? fitAmounts(drafted.map((m) => m.amount), paidBy.total) : null;
  const end = deadlineUtc ? Date.parse(deadlineUtc) : null;
  const dated = end !== null && end > beginsAt;
  const byTheDay = dated && end! - beginsAt >= n * DAY_MS;
  return drafted.map((m, i) => ({
    title: m.title,
    description: m.description,
    dueUtc: dated ? stepDue(beginsAt, end!, i, n, byTheDay) : null,
    weightPercent: amounts ? null : shares[i],
    amount: amounts ? amounts[i] : null,
  }));
};

/**
 * One rounded panel of the form: a heading, a line on what it is for, and
 * its fields. The form is nine of these, so the eye finds "Milestones"
 * without reading the labels between.
 */
function Panel({
  title,
  help,
  intro,
  aside,
  children,
}: {
  title: string;
  help?: React.ReactNode;
  intro?: React.ReactNode;
  /** Sits at the heading's right — a total, a count. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">
          {title}
          {help}
        </h2>
        {aside}
      </div>
      {intro && <p className="mt-1 text-sm text-[var(--text-color-secondary)]">{intro}</p>}
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

/**
 * A row of names offered under a list, each a chip that adds itself when
 * pressed. Nothing is added until one is; an empty offer draws nothing.
 */
function ChipOffer({
  label,
  names,
  disabled,
  onPick,
  title,
}: {
  label: string;
  names: string[];
  disabled: boolean;
  onPick: (name: string) => void;
  title: (name: string) => string;
}) {
  if (names.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-[var(--text-color-secondary)]">
        <i className="pi pi-lightbulb mr-1 text-amber-500" aria-hidden />
        {label}
      </span>
      {names.map((name) => (
        <button
          type="button"
          key={name}
          onClick={() => onPick(name)}
          disabled={disabled}
          className="rounded-full border border-[var(--surface-border)] px-2 py-0.5 text-xs hover:border-[var(--primary-color)] disabled:opacity-50"
          title={title(name)}
        >
          + {name}
        </button>
      ))}
    </div>
  );
}

/**
 * Draft editor for an opportunity. Everything here is editable until Publish —
 * the one-way door that locks the brief, milestones, deadline, and award.
 */
export default function OpportunityEditor({ initial }: { initial?: EditorValue }) {
  const router = useRouter();
  const toast = useRef<Toast>(null);
  // A new opportunity starts today unless the client picks another day; a
  // draft keeps whatever it was saved with, blank included.
  const [value, setValue] = useState<EditorValue>(() => initial ?? { ...EMPTY, startsAtUtc: todayUtc() });
  const [error, setError] = useState<string | null>(null);
  const [verifyNeeded, setVerifyNeeded] = useState(false);
  const [busy, setBusy] = useState<'save' | 'check' | 'publish' | null>(null);
  /** 0 the form, 1 the preview — Save and Publish sit under both. */
  const [tab, setTab] = useState(0);
  const { data: aiStatus } = useQuery(aiStatusQuery);
  const { data: taxonomy } = useQuery(categoriesQuery);
  const { data: pools } = useQuery(suggestionsQuery);
  const { data: branding } = useQuery(brandingQuery);
  // Docker Compose is offered only while builds are on — a build host
  // switched on and passing its test. Unknown counts as off.
  const { data: buildHost } = useQuery(buildHostQuery);
  const composeOffered = buildHost?.ready === true;
  const defaultDays = branding?.opportunityDefaultDurationDays ?? 14;
  const categories = useMemo(() => taxonomy?.categories ?? [], [taxonomy]);
  const categoryDef = categories.find((c) => c.key === value.category) ?? null;
  // A retired kind is offered only to the draft that already has it.
  const offeredCategories = useMemo(() => offered(categories, value.category), [categories, value.category]);
  const offeredSubcategories = useMemo(
    () => offered(categoryDef?.subcategories, value.subcategory),
    [categoryDef, value.subcategory],
  );


  const skillVocabulary = useMemo(
    () => [...(pools?.skills ?? []), ...SKILL_SEEDS],
    [pools],
  );
  const suggestedSkills = useMemo(
    () => suggestSkills(value.title, value.briefMarkdown, skillVocabulary, value.skills),
    [value.title, value.briefMarkdown, skillVocabulary, value.skills],
  );
  // The chosen kind of work's own skill names, as the profile's Expertise
  // step offers them — there whether or not the brief is written yet, the
  // way the requirements table offers its rows. The subcategory's narrower
  // list comes first, then the category's; neither repeats what is listed,
  // what the brief chips offer, or the other.
  const subcategoryDef = categoryDef?.subcategories.find((s) => s.key === value.subcategory) ?? null;
  const subcategorySkills = useMemo(
    () =>
      subcategoryDef
        ? skillsForCategories([subcategoryDef], [subcategoryDef.key], [...value.skills, ...suggestedSkills])
        : [],
    [subcategoryDef, value.skills, suggestedSkills],
  );
  const categorySkills = useMemo(
    () =>
      skillsForCategories(categories, [value.category], [
        ...value.skills,
        ...suggestedSkills,
        ...subcategorySkills,
      ]),
    [categories, value.category, value.skills, suggestedSkills, subcategorySkills],
  );
  const repeatedSkills = useMemo(() => duplicateIndexes(value.skills), [value.skills]);
  const maxSkills = taxonomy?.maxSkills ?? 15;
  const skillsFull = value.skills.filter((x) => x.trim() !== '').length >= maxSkills;

  // The row names not yet in the table, offered as chips.
  const usedRequirementNames = new Set(value.requirements.map((r) => r.title.trim().toLowerCase()));
  const offeredRequirementNames = REQUIREMENT_NAMES.filter((n) => !usedRequirementNames.has(n.toLowerCase()));

  // The milestone shares, read as publish will read them: the titled
  // milestones only, and either none of them stated or all of them.
  const titledMilestones = value.milestones.filter((m) => m.title.trim() !== '');
  const sharesStated = titledMilestones.filter((m) => m.weightPercent != null).length;
  const sharesTotal = titledMilestones.reduce((sum, m) => sum + (m.weightPercent ?? 0), 0);
  const sharesWhole = sharesStated === titledMilestones.length && sharesTotal === 100;

  // Paid by milestone: the amounts, read as publish reads them — every
  // titled milestone paying something, together exactly the total.
  const byMilestone = value.kind === 'milestones';
  const amountsStated = titledMilestones.filter((m) => (m.amount ?? 0) > 0).length;
  const allocated = titledMilestones.reduce((sum, m) => sum + (m.amount ?? 0), 0);
  const total = value.awardAmount ?? 0;
  const amountsWhole = amountsStated === titledMilestones.length && allocated === total && total > 0;
  const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  const rubricTotal = value.criteria.reduce((sum, c) => sum + (c.points ?? 0), 0);

  // The draft replaces the list, so hand-written milestones get a warning
  // first — AI drafts, humans decide, and deciding needs a real yes.
  const useDraftMilestones = (drafted: EditorMilestone[]) => {
    const hasHandWritten = value.milestones.some((m) => m.title.trim() !== '');
    if (!hasHandWritten) {
      set('milestones', drafted);
      return;
    }
    confirmDialog({
      header: 'Replace the milestone list?',
      message:
        'The drafted list replaces what is below, its dates and shares included. Your current ' +
        'milestones are lost unless you re-type them.',
      acceptLabel: 'Replace the list',
      rejectLabel: 'Keep mine',
      accept: () => set('milestones', drafted),
    });
  };

  // The same courtesy for a whole rubric — the standard one or a drafted
  // one: it replaces the table, so a table somebody typed gets a warning
  // first.
  const replaceRubric = (rows: EditorCriterion[], what: string) => {
    const hasHandWritten = value.criteria.some((c) => !blankCriterion(c));
    if (!hasHandWritten) {
      set('criteria', rows);
      return;
    }
    confirmDialog({
      header: 'Replace the rubric?',
      message: `${what} replace what is in the table. Your current criteria are lost unless you re-type them.`,
      acceptLabel: 'Replace the rubric',
      rejectLabel: 'Keep mine',
      accept: () => set('criteria', rows),
    });
  };
  const useStandardRubric = () => replaceRubric(STANDARD_RUBRIC.map((c) => ({ ...c })), 'The standard five lines');
  const useDraftCriteria = (rows: EditorCriterion[]) => replaceRubric(rows, 'The drafted lines');

  const set = <K extends keyof EditorValue>(key: K, v: EditorValue[K]) =>
    setValue((prev) => ({ ...prev, [key]: v }));

  // A draft saved with the requirement while builds were on drops it once
  // they are off: the option is not shown, and the API would refuse it.
  useEffect(() => {
    if (buildHost && !buildHost.ready && value.requiresCompose) set('requiresCompose', false);
  }, [buildHost, value.requiresCompose]);

  const setMilestone = (i: number, patch: Partial<EditorMilestone>) =>
    setValue((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m, j) => (j === i ? { ...m, ...patch } : m)),
    }));

  const setSkill = (i: number, v: string) =>
    setValue((prev) => ({ ...prev, skills: prev.skills.map((x, j) => (j === i ? v : x)) }));

  const setRequirement = (i: number, patch: Partial<EditorRequirement>) =>
    setValue((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    }));

  const setCriterion = (i: number, patch: Partial<EditorCriterion>) =>
    setValue((prev) => ({
      ...prev,
      criteria: prev.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }));

  // A suggested skill lands in the first blank row if there is one, so
  // pressing "Add skill" and then a chip does not leave an empty row behind.
  const addSkill = (name: string) =>
    setValue((prev) => {
      const list = [...prev.skills];
      const blank = list.findIndex((x) => x.trim() === '');
      if (blank >= 0) list[blank] = name;
      else list.push(name);
      return { ...prev, skills: list };
    });

  // A row name from the chips does the same: it takes the first row with
  // no name rather than adding a row under an empty one.
  const addRequirement = (title: string) =>
    setValue((prev) => {
      const list = [...prev.requirements];
      const blank = list.findIndex((r) => r.title.trim() === '');
      if (blank >= 0) list[blank] = { ...list[blank], title };
      else list.push({ title, detail: '' });
      return { ...prev, requirements: list };
    });

  // Drafted rows go under what is there, wholly blank rows giving way
  // first; the table's ceiling holds.
  const addRequirements = (rows: EditorRequirement[]) =>
    setValue((prev) => {
      const kept = prev.requirements.filter((r) => !blankRequirement(r));
      return { ...prev, requirements: [...kept, ...rows].slice(0, MAX_REQUIREMENTS) };
    });

  const moveMilestone = (i: number, delta: -1 | 1) =>
    setValue((prev) => {
      const list = [...prev.milestones];
      const j = i + delta;
      if (j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...prev, milestones: list };
    });

  // The shares, over the titled milestones only: an untitled row is dropped
  // at save and must not take a share with it.
  const splitSharesEvenly = () =>
    setValue((prev) => {
      const titled = prev.milestones.filter((m) => m.title.trim() !== '');
      if (titled.length === 0) return prev;
      const shares = evenShares(titled.length);
      let k = 0;
      return {
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.title.trim() === '' ? { ...m, weightPercent: null } : { ...m, weightPercent: shares[k++] },
        ),
      };
    });

  const clearShares = () =>
    set('milestones', value.milestones.map((m) => ({ ...m, weightPercent: null })));

  // The total in whole dollars over the titled milestones.
  const splitAmountsEvenly = () =>
    setValue((prev) => {
      const titled = prev.milestones.filter((m) => m.title.trim() !== '');
      const whole = Math.floor(prev.awardAmount ?? 0);
      if (titled.length === 0 || whole <= 0) return prev;
      const parts = evenAmounts(whole, titled.length);
      let k = 0;
      return {
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.title.trim() === '' ? { ...m, amount: null } : { ...m, amount: parts[k++] },
        ),
      };
    });

  // Changing how it pays swaps shares for amounts: kept on the rows, but
  // the one the choice does not read is cleared so nothing stale is saved.
  const chooseKind = (kind: OpportunityKind) =>
    setValue((prev) => ({
      ...prev,
      kind,
      milestones: prev.milestones.map((m) =>
        kind === 'milestones' ? { ...m, weightPercent: null } : { ...m, amount: null },
      ),
    }));

  // The opportunity duration, as the publish gate counts it: from the start
  // day where that is still ahead, from now where it is today or blank, to
  // the deadline. Null while the deadline is blank — the policy's default
  // duration, from the same start.
  const startsAhead = !!value.startsAtUtc && Date.parse(value.startsAtUtc) > Date.now();
  const begins = startsAhead ? Date.parse(value.startsAtUtc!) : Date.now();
  const runsMs = value.deadlineUtc ? Date.parse(value.deadlineUtc) - begins : null;

  // The drafting help draws its dates and shares from that same window, so a
  // deadline moved after a draft was read moves the list it is offering too.
  const planDraft = (drafted: { title: string; description: string; amount?: number | null }[]) =>
    scheduleDraft(drafted, begins, value.deadlineUtc, byMilestone ? { total: value.awardAmount } : null);

  // The form as every drafting tool reads it — the same snapshot to each,
  // with each reading the sections above the one it fills.
  const form = toSnapshot(value);
  const features = aiStatus?.features;
  const anyFormTool =
    !!features &&
    (features.coach || features.categorise || features.requirements || features.milestones || features.criteria || features.seo || features.award);
  // The award suggestion lives here rather than in its panel: Publish checks
  // the award against the same answer, and asks again only when something
  // it read has changed since.
  const award = useFormDraft<AwardSuggestion>('award', form);

  const payload = () => ({
    title: value.title,
    briefMarkdown: value.briefMarkdown,
    awardAmount: value.awardAmount ?? 0,
    kind: value.kind,
    delivery: value.delivery,
    requiresCompose: value.requiresCompose,
    startsAtUtc: value.startsAtUtc,
    deadlineUtc: value.deadlineUtc,
    entryCloseUtc: value.entryCloseUtc,
    milestones: value.milestones
      .filter((m) => m.title.trim() !== '')
      .map((m) => ({
        title: m.title,
        description: m.description || null,
        dueUtc: m.dueUtc ?? null,
        weightPercent: byMilestone ? null : m.weightPercent ?? null,
        amount: byMilestone ? m.amount ?? null : null,
      })),
    metaTitle: value.metaTitle || null,
    metaDescription: value.metaDescription || null,
    category: value.category,
    subcategory: value.subcategory,
    // Clamped again here: a value typed and saved without ever losing
    // focus never met the blur handler.
    minMeritScore: clampMerit(value.minMeritScore) ?? 0,
    skills: value.skills.map((x) => x.trim()).filter((x) => x !== ''),
    requirements: value.requirements
      .filter((r) => !blankRequirement(r))
      .map((r) => ({ title: r.title, detail: r.detail })),
    criteria: value.criteria
      .filter((c) => !blankCriterion(c))
      .map((c) => ({ points: c.points, title: c.title, description: c.description || null })),
  });

  // The API refuses a skill said twice in these words; the row is already
  // outlined, so saying it here saves the round trip, not the rule.
  const repeatProblem = (): string | null => {
    const first = [...repeatedSkills][0];
    return first === undefined
      ? null
      : `“${value.skills[first].trim()}” is in the required skills twice — one row each.`;
  };

  // The rules the API applies to the two tables on every save, in its
  // words: a half-filled requirement, a criterion with no name or no
  // points. Judged here so the row is still on screen when it is named.
  const termsProblem = (): string | null => {
    const half = value.requirements.find(
      (r) => !blankRequirement(r) && (r.title.trim() === '' || r.detail.trim() === ''),
    );
    if (half)
      return 'Every technical requirement needs a name and what it asks for — "Language" and "Python 3.11+", say.';
    for (const c of value.criteria) {
      if (blankCriterion(c)) continue;
      if (c.title.trim() === '') return 'Every scoring criterion needs a name — what the points are for.';
      if (c.points === null || c.points < 1 || c.points > 100)
        return `Give “${c.title.trim()}” a whole number of points, from 1 to 100.`;
    }
    return null;
  };

  // `publishing` only names the activity row an administrator reads —
  // the save is a draft either way, and the publish request follows it.
  const save = async (publishing = false): Promise<{ id: string; slug: string } | null> => {
    setError(null);
    // The API refuses a draft with no delivery in these same words; asking
    // here saves the round trip, not the rule.
    if (!value.delivery) {
      setError(DELIVERY_MISSING);
      return null;
    }
    const problem = repeatProblem() ?? termsProblem();
    if (problem) {
      setError(problem);
      return null;
    }
    try {
      const intent = publishing ? '?intent=publish' : '';
      const result = value.id
        ? await putJson<{ id: string; slug: string }>(`/api/opportunities/${value.id}${intent}`, payload())
        : await postJson<{ id: string; slug: string }>(`/api/opportunities${intent}`, payload());
      setValue((prev) => ({ ...prev, id: result.id }));
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
      return null;
    }
  };

  const saveDraft = async () => {
    setBusy('save');
    const result = await save();
    setBusy(null);
    if (result) {
      toast.current?.show({ severity: 'success', summary: 'Draft saved', life: 2000 });
      if (!initial?.id) router.replace(`/client/opportunities/${result.id}/edit`);
    }
  };

  // The confirm is a one-way door; nobody should walk through it only to
  // be told the title is missing. The publish rules the API enforces that
  // can be judged from here are judged here first, in the API's own words.
  // The award floor and the deadline are portal policy and stay with it.
  const unfinished = (): string | null => {
    const title = value.title.trim().length;
    if (title < 4 || title > 140) return 'Title must be 4–140 characters.';
    if (!value.delivery) return DELIVERY_MISSING;
    if (!value.category) return CATEGORY_MISSING;
    if (repeatProblem()) return repeatProblem();
    if (termsProblem()) return termsProblem();
    if (value.briefMarkdown.trim() === '')
      return 'Write the brief before publishing — it is what entrants build against.';
    if (!value.milestones.some((m) => m.title.trim() !== ''))
      return "Add at least one milestone; the checklist becomes every entrant's board.";
    // The shares: all of them or none, and the whole — the API's own rule,
    // in its words, while the rows are still on screen.
    if (sharesStated > 0 && sharesStated < titledMilestones.length)
      return 'Either give every milestone its share of the work, or leave every share blank.';
    if (sharesStated > 0 && sharesTotal !== 100)
      return `The milestone shares add up to ${sharesTotal}%, not 100%. Adjust them, or leave every share blank.`;
    // The opportunity duration, start to deadline — the API's own rule, in its
    // words, compared as moments (a date loaded from the API and one picked
    // here are spelled differently). The start gates nothing else: entry
    // opens at publish, and the joining date and milestones may fall either
    // side of it.
    if (value.startsAtUtc && value.deadlineUtc && Date.parse(value.deadlineUtc) <= Date.parse(value.startsAtUtc))
      return 'The competition cannot start at or after the deadline — there would be no time to build.';
    if (runsMs !== null && runsMs < DAY_MS)
      return startsAhead
        ? 'The deadline must be at least 24 hours after the competition starts — entrants need time to build.'
        : 'The deadline must be at least 24 hours away — entrants need time to build.';
    // The schedule rules that can be judged without knowing the portal's
    // defaults. A blank deadline is one the API fills in, so the dates below
    // are only checkable against a deadline the client actually typed.
    if (value.deadlineUtc) {
      // Compared as moments, not as text: a date typed here and one loaded
      // from the API are the same instant spelled differently, and a drafted
      // milestone sits exactly on the deadline, where the difference shows.
      const deadline = Date.parse(value.deadlineUtc);
      if (value.entryCloseUtc && Date.parse(value.entryCloseUtc) > deadline)
        return 'Entry cannot close after the deadline — nobody could enter in the time left.';
      const dated = value.milestones.filter((m) => m.title.trim() !== '');
      const past = dated.findIndex((m) => m.dueUtc && Date.parse(m.dueUtc) > deadline);
      if (past >= 0)
        return `Milestone ${past + 1} is due after the deadline. Move the date, or move the deadline.`;
    }
    return null;
  };

  // The award against the suggestion for the form as it stands: the answer
  // on screen where it still answers this form, else one more ask — free
  // when a saved draft or the hour's memory already holds it. Information
  // for the dialog, never a gate: a check that cannot run says so and the
  // door stays open.
  const checkAward = async (): Promise<{ verdict: AwardVerdict | null; failed: string | null } | null> => {
    if (!features?.award || award.tooThin) return null;
    let suggestion = award.read ? award.output : null;
    let failed: string | null = null;
    if (!suggestion) {
      setBusy('check');
      const asked = await award.ask();
      setBusy(null);
      suggestion = asked.draft?.output ?? null;
      failed = asked.error;
    }
    return { verdict: suggestion ? awardVerdict(value.awardAmount, suggestion, byMilestone) : null, failed };
  };

  // Back to the field, from a dialog that said the award was low.
  const toAward = () => {
    setTab(0);
    setTimeout(() => document.getElementById('c-award')?.focus(), 0);
  };

  const publish = async () => {
    const problem = unfinished();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const check = await checkAward();
    const low = check?.verdict?.low === true && value.awardAmount != null;
    const what = byMilestone ? 'total' : 'award';
    confirmDialog({
      header: 'Publish this opportunity?',
      message: (
        <div className="flex max-w-xl flex-col gap-3">
          <p>
            Publishing lists it publicly, opens entry, and locks the brief, milestones and their dates, the start
            date, the deadline, the last joining date, and the {what}. Entrants commit real time against these
            terms — they cannot be edited afterwards.
          </p>
          {check?.verdict && (
            <Message
              severity={check.verdict.severity}
              className="w-full justify-start"
              content={
                <span className="text-sm">
                  {check.verdict.text} {check.verdict.used}
                </span>
              }
            />
          )}
          {check?.failed && (
            <p className="text-sm text-[var(--text-color-secondary)]">
              <i className="pi pi-info-circle mr-1" aria-hidden />
              The {what} check did not run: {check.failed} You can still publish.
            </p>
          )}
        </div>
      ),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: low ? `Publish at ${usd(value.awardAmount!)}` : 'Publish',
      rejectLabel: low ? `Change the ${what}` : 'Keep drafting',
      reject: low ? toAward : undefined,
      accept: async () => {
        setBusy('publish');
        const saved = await save(true);
        if (!saved) {
          setBusy(null);
          return;
        }
        try {
          const result = await postJson<{ slug: string }>(`/api/opportunities/${saved.id}/publish`);
          router.push(`/opportunities/${result.slug}`);
        } catch (err) {
          // The portal's own door, not the brief's: the sentence comes
          // with a way through it, back here after.
          setVerifyNeeded(err instanceof ApiError && err.verificationRequired);
          setError(err instanceof Error ? err.message : 'Publish failed.');
          setBusy(null);
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Toast ref={toast} />
      <ConfirmDialog />

      {/* The form, and the opportunity as an entrant will read it. Both stay
          mounted: a drafting panel below may hold a model’s answer that
          cost real money, and looking at the preview must not throw it away. */}
      <TabView renderActiveOnly={false} activeIndex={tab} onTabChange={(e) => setTab(e.index)}>
        <TabPanel header="Edit" leftIcon="pi pi-pencil mr-2">
          <div className="flex flex-col gap-5">
            {/* The form is a funnel. The name first, then the brief, and
                every section after them is drafted from what sits above it:
                the category suggestion and the skill chips read the title and
                brief, the requirements draft reads those and the kind of work,
                the milestones read the requirements and the hand-in shape, the
                rubric reads the milestones. So a client filling it top to
                bottom never meets a helper asking for something further down. */}
            <Panel
              title="Title"
              intro="What the opportunity is called — on the feed, at the top of its page, and in the subject line of every email about it."
            >
              <div>
                <InputText
                  id="c-title"
                  value={value.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Inventory dashboard for a textile wholesaler"
                  className="w-full"
                  maxLength={140}
                  aria-label="Title"
                />
              </div>
            </Panel>

            {/* ------------------------------------------------------ the brief
                Second, because it is what everything below reads — the
                drafting help under each section as much as the entrant. */}
            <Panel
              title="The brief"
              help={<HelpIcon topic="opportunity.brief" label="Writing the brief" />}
              intro={
                anyFormTool
                  ? 'What entrants build against. Every Suggest button further down reads it, with what you have set above that button — saved or not.'
                  : undefined
              }
            >
              <div>
                <label htmlFor="c-brief" className="font-medium">
                  The brief
                </label>
                <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                  Markdown supported. Say what you need, what done means, and any hard constraints.
                </p>
                <InputTextarea
                  id="c-brief"
                  value={value.briefMarkdown}
                  onChange={(e) => set('briefMarkdown', e.target.value)}
                  rows={12}
                  className="mt-2 w-full font-mono text-sm"
                  placeholder={'## What we need\n\n…\n\n## Definition of done\n\n…'}
                />
                {/* Attachments are part of the brief and lock with it. They belong
                    to a saved draft — files need an opportunity to attach to. */}
                <div className="mt-4">
                  {value.id ? (
                    <BriefAttachments opportunityId={value.id} />
                  ) : (
                    <p className="text-sm text-[var(--text-color-secondary)]">
                      <i className="pi pi-paperclip mr-1" aria-hidden />
                      Save the draft to attach files — logo masters, sample data, mockups.
                    </p>
                  )}
                </div>
                {/* The coach reads the whole form, so it is worth a second press
                    once the terms below are filled in; the panel vanishes
                    entirely while AI is switched off. */}
                {features?.coach && <AiCoach form={form} />}
              </div>
            </Panel>

            {/* What kind of work, and who it is for. The category is how
                entrants browse for it; the skills and the merit floor are the
                door. Both helpers here read the title and the brief above:
                the category suggestion is a model reading them on request,
                and the skill chips are names this portal already knows, which
                cost nothing. Neither appears until there is something written
                for them to read. */}
            <Panel
              title="Who it is for"
              intro="What kind of work this is, and the door an entrant comes through: the skills their profile must list and the merit score they need."
            >
              <div>
                <p className="font-medium">
                  What kind of work
                  <HelpIcon topic="opportunity.category" label="Category" />
                </p>
                <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                  How entrants browse for it, and half of what tells them it is theirs. Required to
                  publish; the subcategory is optional.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Dropdown
                    inputId="c-category"
                    value={value.category}
                    options={offeredCategories}
                    optionLabel="label"
                    optionValue="key"
                    placeholder="Pick a category"
                    showClear
                    onChange={(e) =>
                      setValue((prev) => ({ ...prev, category: e.value ?? null, subcategory: null }))
                    }
                    className="w-full"
                    aria-label="Category"
                  />
                  <Dropdown
                    inputId="c-subcategory"
                    value={value.subcategory}
                    options={offeredSubcategories}
                    optionLabel="label"
                    optionValue="key"
                    placeholder={
                      !categoryDef
                        ? 'Pick a category first'
                        : offeredSubcategories.length === 0
                          ? 'No subcategories'
                          : 'Subcategory (optional)'
                    }
                    showClear
                    disabled={!categoryDef || offeredSubcategories.length === 0}
                    onChange={(e) => set('subcategory', e.value ?? null)}
                    className="w-full"
                    aria-label="Subcategory"
                  />
                </div>
                {features?.categorise && (
                  <AiCategoryDraft
                    form={form}
                    categories={categories}
                    current={{ category: value.category, subcategory: value.subcategory }}
                    onApply={(category, subcategory) =>
                      setValue((prev) => ({ ...prev, category, subcategory }))
                    }
                  />
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
                <div>
                  <p className="font-medium">
                    Required skills
                    <HelpIcon topic="opportunity.requiredSkills" label="Required skills" />
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                    Skills an entrant&apos;s profile must list to enter. Leave it empty to ask for none.
                  </p>
                  {value.skills.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      {value.skills.map((x, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2 rounded-lg border p-2 ${
                            repeatedSkills.has(i) ? REPEATED : 'border-[var(--surface-border)]'
                          }`}
                        >
                          <SuggestInput
                            value={x}
                            onChange={(v) => setSkill(i, v)}
                            options={[pools?.skills ?? [], SKILL_SEEDS]}
                            placeholder="e.g. React"
                            maxLength={taxonomy?.maxSkillName ?? 60}
                            ariaLabel={`Required skill ${i + 1}`}
                            className="flex-1"
                          />
                          <Button
                            icon="pi pi-trash"
                            text
                            size="small"
                            severity="danger"
                            onClick={() => set('skills', value.skills.filter((_, j) => j !== i))}
                            aria-label={`Remove required skill ${i + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {repeatedSkills.size > 0 && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                      A skill is listed twice — one row each.
                    </p>
                  )}
                  <Button
                    label="Add skill"
                    icon="pi pi-plus"
                    text
                    size="small"
                    className="mt-2"
                    disabled={value.skills.length >= maxSkills}
                    onClick={() => set('skills', [...value.skills, ''])}
                  />
                  <ChipOffer
                    label="Named in the brief:"
                    names={suggestedSkills}
                    disabled={skillsFull}
                    onPick={addSkill}
                    title={(name) => `Require ${name}`}
                  />
                  {subcategoryDef && (
                    <ChipOffer
                      label={`Suggested for ${subcategoryDef.label}:`}
                      names={subcategorySkills}
                      disabled={skillsFull}
                      onPick={addSkill}
                      title={(name) => `Require ${name}`}
                    />
                  )}
                  {categoryDef ? (
                    <ChipOffer
                      label={`Suggested for ${categoryDef.label}:`}
                      names={categorySkills}
                      disabled={skillsFull}
                      onPick={addSkill}
                      title={(name) => `Require ${name}`}
                    />
                  ) : (
                    <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                      <i className="pi pi-lightbulb mr-1 text-amber-500" aria-hidden />
                      Pick what kind of work it is above, and the skills it usually needs are offered here.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="c-min-merit" className="font-medium">
                    Minimum merit score
                    <HelpIcon topic="opportunity.minMerit" label="Minimum merit score" />
                  </label>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <InputNumber
                      {...STEPPER}
                      inputId="c-min-merit"
                      value={value.minMeritScore}
                      onValueChange={(e) => set('minMeritScore', e.value ?? null)}
                      // Fresh state, not the render's copy: the library updates the
                      // model and then calls this in the same tick.
                      onBlur={() =>
                        setValue((prev) => ({ ...prev, minMeritScore: clampMerit(prev.minMeritScore) }))
                      }
                      min={MIN_MERIT}
                      max={MAX_MERIT}
                      step={5}
                      className="w-44"
                      inputClassName="w-full text-center"
                      placeholder="No minimum"
                    />
                    {/* The stepper stops at the floor, so there is no way down to
                        "none" from inside it. This is that way. */}
                    {value.minMeritScore !== null && (
                      <Button
                        label="No minimum"
                        icon="pi pi-times"
                        text
                        size="small"
                        onClick={() => set('minMeritScore', null)}
                      />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
                    {MIN_MERIT} to {MAX_MERIT}, out of 100 — blank asks for no minimum. Somebody short of
                    it cannot enter. 25 asks for a written profile or one finished opportunity here; 50 for a
                    record; 75 for a proven one.
                  </p>
                </div>
              </div>
            </Panel>

            {/* ------------------------------------------- technical requirements
                The constraints a brief tends to bury, as a table of their own:
                the language, the frameworks, the data. Shown on the opportunity's
                Requirements tab beside the skills; refused to nobody. */}
            <Panel
              title="Technical requirements"
              help={<HelpIcon topic="opportunity.requirements" label="Technical requirements" />}
              intro="The constraints the work must meet, one row each — what the constraint is, and what it asks for. Optional; shown on the opportunity page beside the required skills."
              aside={
                value.requirements.some((r) => !blankRequirement(r)) ? (
                  <span className="text-sm tabular-nums text-[var(--text-color-secondary)]">
                    {value.requirements.filter((r) => !blankRequirement(r)).length} of {MAX_REQUIREMENTS}
                  </span>
                ) : undefined
              }
            >
              <div>
                {value.requirements.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {value.requirements.map((r, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--surface-border)] p-2"
                      >
                        <InputText
                          value={r.title}
                          onChange={(e) => setRequirement(i, { title: e.target.value })}
                          placeholder="Language"
                          className="w-full sm:w-44"
                          maxLength={MAX_TERM_TITLE}
                          aria-label={`Requirement ${i + 1} name`}
                        />
                        <InputText
                          value={r.detail}
                          onChange={(e) => setRequirement(i, { detail: e.target.value })}
                          placeholder="Python 3.11+"
                          className="min-w-[12rem] flex-1"
                          maxLength={MAX_TERM_DETAIL}
                          aria-label={`Requirement ${i + 1} detail`}
                        />
                        <Button
                          icon="pi pi-trash"
                          text
                          size="small"
                          severity="danger"
                          onClick={() => set('requirements', value.requirements.filter((_, j) => j !== i))}
                          aria-label={`Remove requirement ${i + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  label="Add requirement"
                  icon="pi pi-plus"
                  text
                  size="small"
                  className={value.requirements.length > 0 ? 'mt-2' : ''}
                  disabled={value.requirements.length >= MAX_REQUIREMENTS}
                  onClick={() => set('requirements', [...value.requirements, { title: '', detail: '' }])}
                />
                <ChipOffer
                  label="Rows most briefs need:"
                  names={offeredRequirementNames}
                  disabled={value.requirements.length >= MAX_REQUIREMENTS}
                  onPick={addRequirement}
                  title={(name) => `Add a ${name} row`}
                />
                {/* The chips are names and cost nothing; the draft is the model
                    reading the brief, the kind of work and the skills above for
                    the rows this brief actually needs. */}
                {features?.requirements && (
                  <AiRequirementsDraft
                    form={form}
                    existing={value.requirements.map((r) => r.title)}
                    room={MAX_REQUIREMENTS - value.requirements.filter((r) => !blankRequirement(r)).length}
                    onAdd={addRequirements}
                  />
                )}
              </div>
            </Panel>

            {/* How it pays — the first term of the deal, and the one the
                award, the milestones and the review box below all read. */}
            <Panel
              title="How it pays"
              help={<HelpIcon topic="opportunity.kind" label="How the opportunity pays" />}
              intro="Frozen at publish with the rest of the terms — freelancers decide whether to apply on it."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {KIND_OPTIONS.map((o) => {
                  const chosen = value.kind === o.value;
                  return (
                    <button
                      type="button"
                      key={o.value}
                      aria-pressed={chosen}
                      onClick={() => chooseKind(o.value)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        chosen
                          ? 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)]'
                          : 'border-[var(--surface-border)] bg-[var(--surface-card)] hover:border-[var(--primary-color)]'
                      }`}
                    >
                      <i className={`pi ${o.icon} text-xl text-[var(--primary-color)]`} aria-hidden />
                      <p className="mt-2 font-medium">{o.title}</p>
                      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">{o.detail}</p>
                    </button>
                  );
                })}
              </div>
            </Panel>

            {/* How the work arrives — a term of the deal. It sits above the
                milestones because the checklist drafted below reads it: a
                milestone verifiable inside a repository is not one verifiable
                from a handed-in file. */}
            <Panel
              title="How work is handed in"
              help={<HelpIcon topic="opportunity.delivery" label="How work is handed in" />}
              intro="Frozen at publish with the rest of the terms — entrants decide whether to enter on it."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {DELIVERY_OPTIONS.map((o) => {
                  const chosen = value.delivery === o.value;
                  return (
                    <button
                      type="button"
                      key={o.value}
                      aria-pressed={chosen}
                      onClick={() => {
                        set('delivery', o.value);
                        // Only a repository carries a compose file to build from.
                        if (!usesRepo(o.value)) set('requiresCompose', false);
                      }}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        chosen
                          ? 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)]'
                          : 'border-[var(--surface-border)] bg-[var(--surface-card)] hover:border-[var(--primary-color)]'
                      }`}
                    >
                      <i className={`pi ${o.icon} text-xl text-[var(--primary-color)]`} aria-hidden />
                      <p className="mt-2 font-medium">{o.title}</p>
                      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">{o.detail}</p>
                    </button>
                  );
                })}
              </div>

              {/* A running program has a compose file, and the build host proves
                  each claim builds from it. The tick follows the delivery: it is
                  greyed until a repository is part of the deal — and it is not
                  here at all while builds are off. */}
              {composeOffered && (
                <div className="mt-4 flex items-start gap-2">
                  <Checkbox
                    inputId="requires-compose"
                    checked={value.requiresCompose}
                    disabled={!value.delivery || !usesRepo(value.delivery)}
                    onChange={(e) => set('requiresCompose', e.checked ?? false)}
                  />
                  <label htmlFor="requires-compose" className="text-sm">
                    <span className="font-medium">Entries must run with Docker Compose</span>
                    <HelpIcon topic="opportunity.requiresCompose" label="Entries must run with Docker Compose" />
                    <span className="block text-[var(--text-color-secondary)]">
                      Every milestone claim is built from the repository&apos;s compose file, and the board shows
                      whether it built. For work you should be able to run — not a library, a tool or a design.
                    </span>
                  </label>
                </div>
              )}
            </Panel>

            <Panel
              title="Award and dates"
              intro={
                byMilestone
                  ? "The job's total — what the milestones add up to — and the clock. Blank dates take the portal's defaults at publish."
                  : "The fixed award and the clock. Blank dates take the portal's defaults at publish."
              }
            >
              {/* Two by two: the award and the day it starts, then the two dates
                  that close it. */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="c-award" className="font-medium">
                    {byMilestone ? 'Total (USD)' : 'Award (USD)'}
                    <HelpIcon topic="opportunity.awardAmount" label="Award amount" />
                  </label>
                  <InputNumber
                    inputId="c-award"
                    value={value.awardAmount}
                    onValueChange={(e) => set('awardAmount', e.value ?? null)}
                    mode="currency"
                    currency="USD"
                    locale="en-US"
                    maxFractionDigits={0}
                    className="mt-1 w-full"
                    inputClassName="w-full"
                    placeholder="$500"
                  />
                </div>
                <div>
                  <label htmlFor="c-starts" className="font-medium">
                    Competition start date (UTC)
                    <HelpIcon topic="opportunity.startsAt" label="The competition start date" />
                  </label>
                  <Calendar
                    inputId="c-starts"
                    value={value.startsAtUtc ? wallClock(value.startsAtUtc) : null}
                    onChange={(e) => set('startsAtUtc', dayIso(e.value))}
                    dateFormat="dd M yy"
                    minDate={wallClock(todayUtc())}
                    // A competition cannot start once it has ended. Absent until
                    // the client picks a deadline.
                    maxDate={value.deadlineUtc ? wallClock(value.deadlineUtc) : undefined}
                    placeholder="Blank = when you publish"
                    className="mt-1 w-full"
                    showButtonBar
                  />
                  {/* Information, not a gate: entry opens at publish either way. */}
                  <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
                    {startsAhead
                      ? 'Entry opens when you publish; the opportunity duration counts from this day.'
                      : 'Entry opens, and the opportunity duration counts, from the moment you publish.'}
                  </p>
                </div>
                <div>
                  <label htmlFor="c-deadline" className="font-medium">
                    Deadline (UTC)
                    <HelpIcon topic="opportunity.deadline" label="Deadline" />
                  </label>
                  <Calendar
                    inputId="c-deadline"
                    value={value.deadlineUtc ? wallClock(value.deadlineUtc) : null}
                    onChange={(e) => set('deadlineUtc', iso(e.value))}
                    showTime
                    hourFormat="24"
                    dateFormat="dd M yy"
                    // A day of opportunity at least, counted from the start.
                    minDate={wallClock(begins + DAY_MS)}
                    placeholder={`Blank = ${defaultDays} days from the start`}
                    className="mt-1 w-full"
                    showButtonBar
                  />
                  {/* The opportunity duration, start to deadline — the check a client
                      would make by eye, in the publish gate's own arithmetic. */}
                  <p
                    className={`mt-1 text-xs ${
                      runsMs !== null && runsMs < DAY_MS
                        ? 'font-medium text-amber-600 dark:text-amber-500'
                        : 'text-[var(--text-color-secondary)]'
                    }`}
                    aria-live="polite"
                  >
                    {runsMs === null
                      ? `Opportunity duration: ${defaultDays} days, the portal default.`
                      : runsMs < DAY_MS
                        ? 'Opportunity duration is under a day — the deadline must be at least 24 hours after the start.'
                        : `Opportunity duration: ${durationLabel(runsMs)}.`}
                  </p>
                </div>
                <div>
                  <label htmlFor="c-entry-close" className="font-medium">
                    Last joining date (UTC)
                    <HelpIcon topic="opportunity.entryClose" label="The last joining date" />
                  </label>
                  <Calendar
                    inputId="c-entry-close"
                    value={value.entryCloseUtc ? wallClock(value.entryCloseUtc) : null}
                    onChange={(e) => set('entryCloseUtc', iso(e.value))}
                    showTime
                    hourFormat="24"
                    dateFormat="dd M yy"
                    // Entry opens at publish, so the joining date may fall before the start.
                    minDate={wallClock(Date.now() + HOUR_MS)}
                    // The deadline is the ceiling: entry cannot close after the
                    // opportunity itself ends. Absent until the client picks one.
                    maxDate={value.deadlineUtc ? wallClock(value.deadlineUtc) : undefined}
                    placeholder="Blank = open to the deadline"
                    className="mt-1 w-full"
                    showButtonBar
                  />
                </div>
              </div>
              {/* Under the four fields, full width: three figures with their
                  reasons, read off everything above this panel and the clock
                  beside the award — never the award itself. */}
              {features?.award && (
                <AiAwardDraft
                  award={award}
                  amount={value.awardAmount}
                  byMilestone={byMilestone}
                  onUse={(amount) => set('awardAmount', amount)}
                />
              )}
            </Panel>

            <Panel
              title="Milestones"
              help={<HelpIcon topic="opportunity.milestones" label="Milestones" />}
              intro={
                byMilestone ? (
                  <>
                    The steps the freelancer you hire works through, in order. Each is handed in, approved and
                    paid its amount before the next one opens
                    <HelpIcon topic="opportunity.milestoneAmounts" label="Milestone amounts" />; a date says
                    when you expect it
                    <HelpIcon topic="opportunity.milestoneDates" label="Milestone dates" />.
                  </>
                ) : (
                  <>
                    The checklist every entrant builds against — it becomes their progress board. Give one a
                    date and the board tells a claim on time from a claim behind
                    <HelpIcon topic="opportunity.milestoneDates" label="Milestone dates" />; give each a share of
                    the work and entrants know which steps carry it
                    <HelpIcon topic="opportunity.milestoneShares" label="Milestone shares" />.
                  </>
                )
              }
              aside={
                byMilestone ? (
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      amountsWhole ? 'text-[var(--text-color-secondary)]' : 'text-amber-600 dark:text-amber-500'
                    }`}
                    aria-live="polite"
                  >
                    {usd(allocated)} of {usd(total)} allocated
                  </span>
                ) : sharesStated > 0 ? (
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      sharesWhole ? 'text-[var(--text-color-secondary)]' : 'text-amber-600 dark:text-amber-500'
                    }`}
                    aria-live="polite"
                  >
                    {sharesStated < titledMilestones.length
                      ? `${sharesStated} of ${titledMilestones.length} shares set · ${sharesTotal}%`
                      : `Shares add up to ${sharesTotal}%`}
                  </span>
                ) : undefined
              }
            >
              <div>
                <div className="flex flex-col gap-2">
                  {value.milestones.map((m, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-start gap-2 rounded-lg border border-[var(--surface-border)] p-3"
                    >
                      <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] text-xs font-bold">
                        {i + 1}
                      </span>
                      {/* A floor, so on a phone the buttons wrap under the inputs
                          rather than squeezing them to a third of the row. */}
                      <div className="min-w-[14rem] flex-1">
                        <InputText
                          value={m.title}
                          onChange={(e) => setMilestone(i, { title: e.target.value })}
                          placeholder="Milestone title"
                          className="w-full"
                          maxLength={200}
                          aria-label={`Milestone ${i + 1} title`}
                        />
                        <InputText
                          value={m.description}
                          onChange={(e) => setMilestone(i, { description: e.target.value })}
                          placeholder="What finished looks like (optional)"
                          className="mt-2 w-full"
                          aria-label={`Milestone ${i + 1} description`}
                        />
                        {/* Optional, per milestone. A checklist with no dates behaves
                            exactly as it always has — done or not done. */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label
                            htmlFor={`c-m-due-${i}`}
                            className="text-sm text-[var(--text-color-secondary)]"
                          >
                            Due by
                          </label>
                          <Calendar
                            inputId={`c-m-due-${i}`}
                            value={m.dueUtc ? wallClock(m.dueUtc) : null}
                            onChange={(e) => setMilestone(i, { dueUtc: iso(e.value) })}
                            showTime
                            hourFormat="24"
                            dateFormat="dd M yy"
                            maxDate={value.deadlineUtc ? wallClock(value.deadlineUtc) : undefined}
                            placeholder="No date"
                            className="min-w-[11rem] flex-1"
                            showButtonBar
                          />
                        </div>
                      </div>
                      {/* The share, at the row's top right — where the page shows it;
                          paid by milestone, what it pays in the same place. */}
                      {byMilestone ? (
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <InputNumber
                            inputId={`c-m-amount-${i}`}
                            value={m.amount ?? null}
                            onValueChange={(e) => setMilestone(i, { amount: e.value ?? null })}
                            mode="currency"
                            currency="USD"
                            locale="en-US"
                            min={0}
                            maxFractionDigits={2}
                            placeholder="$0"
                            className="w-28"
                            inputClassName="w-full text-right"
                            aria-label={`Milestone ${i + 1} amount`}
                          />
                          <label
                            htmlFor={`c-m-amount-${i}`}
                            className="text-xs text-[var(--text-color-secondary)]"
                          >
                            pays
                          </label>
                        </div>
                      ) : (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <InputNumber
                          inputId={`c-m-share-${i}`}
                          value={m.weightPercent ?? null}
                          onValueChange={(e) => setMilestone(i, { weightPercent: e.value ?? null })}
                          min={1}
                          max={100}
                          suffix="%"
                          placeholder="—%"
                          className="w-20"
                          inputClassName="w-full text-right"
                          aria-label={`Milestone ${i + 1} share of the work`}
                        />
                        <label
                          htmlFor={`c-m-share-${i}`}
                          className="text-xs text-[var(--text-color-secondary)]"
                        >
                          share
                        </label>
                      </div>
                      )}
                      <div className="flex shrink-0 gap-1">
                        <Button
                          icon="pi pi-arrow-up"
                          text
                          size="small"
                          disabled={i === 0}
                          onClick={() => moveMilestone(i, -1)}
                          aria-label={`Move milestone ${i + 1} up`}
                        />
                        <Button
                          icon="pi pi-arrow-down"
                          text
                          size="small"
                          disabled={i === value.milestones.length - 1}
                          onClick={() => moveMilestone(i, 1)}
                          aria-label={`Move milestone ${i + 1} down`}
                        />
                        <Button
                          icon="pi pi-trash"
                          text
                          size="small"
                          severity="danger"
                          onClick={() =>
                            set(
                              'milestones',
                              value.milestones.filter((_, j) => j !== i),
                            )
                          }
                          aria-label={`Remove milestone ${i + 1}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Button
                    label="Add milestone"
                    icon="pi pi-plus"
                    text
                    size="small"
                    onClick={() =>
                      set('milestones', [
                        ...value.milestones,
                        { title: '', description: '', dueUtc: null, weightPercent: null, amount: null },
                      ])
                    }
                  />
                  {byMilestone ? (
                    // The total in whole dollars over the titled milestones.
                    <Button
                      label="Split the total evenly"
                      icon="pi pi-dollar"
                      text
                      size="small"
                      disabled={titledMilestones.length === 0 || total < 1}
                      title={total < 1 ? 'Set the total above first.' : undefined}
                      onClick={splitAmountsEvenly}
                    />
                  ) : (
                    <>
                      {/* A hundred over the titled milestones, whole numbers, the
                          remainder to the first — and a way back to no shares at all. */}
                      <Button
                        label="Split shares evenly"
                        icon="pi pi-percentage"
                        text
                        size="small"
                        disabled={titledMilestones.length === 0}
                        onClick={splitSharesEvenly}
                      />
                      {sharesStated > 0 && (
                        <Button label="Clear shares" icon="pi pi-times" text size="small" onClick={clearShares} />
                      )}
                    </>
                  )}
                </div>
                {byMilestone && titledMilestones.length > 0 && !amountsWhole && (
                  <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
                    To publish, every milestone needs an amount and together they must be the total
                    {total > 0 ? ` of ${usd(total)}` : ' — set it above'}.
                  </p>
                )}
                {!byMilestone && sharesStated > 0 && !sharesWhole && (
                  <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
                    To publish, every milestone needs a share and the shares must add up to 100% — or
                    leave every share blank.
                  </p>
                )}
                {/* Drafted from the brief and every term above this list —
                    dated and shared by the form's own arithmetic, and pulled
                    into the rows above with a second press. */}
                {features?.milestones && (
                  <AiMilestonesDraft form={form} plan={planDraft} onUse={useDraftMilestones} />
                )}
              </div>
            </Panel>

            {/* ------------------------------------------------------ evaluation
                The rubric: what the work is scored on and how many points each
                line carries. Shown, not computed — the client still chooses. */}
            <Panel
              title="Evaluation"
              help={<HelpIcon topic="opportunity.rubric" label="The scoring rubric" />}
              intro="How the work is scored: a name, its points, and how it is judged. The opportunity page adds the points up and tells entrants the total. Optional."
              aside={
                rubricTotal > 0 ? (
                  <span className="text-sm font-medium tabular-nums text-[var(--text-color-secondary)]" aria-live="polite">
                    {rubricTotal}-point rubric
                  </span>
                ) : undefined
              }
            >
              <div>
                {value.criteria.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {value.criteria.map((c, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-start gap-2 rounded-lg border border-[var(--surface-border)] p-2"
                      >
                        <InputNumber
                          value={c.points}
                          onValueChange={(e) => setCriterion(i, { points: e.value ?? null })}
                          min={1}
                          max={100}
                          suffix=" pts"
                          placeholder="pts"
                          className="w-24"
                          inputClassName="w-full text-right"
                          aria-label={`Criterion ${i + 1} points`}
                        />
                        <div className="min-w-[14rem] flex-1">
                          <InputText
                            value={c.title}
                            onChange={(e) => setCriterion(i, { title: e.target.value })}
                            placeholder="Functionality"
                            className="w-full"
                            maxLength={MAX_TERM_TITLE}
                            aria-label={`Criterion ${i + 1} name`}
                          />
                          <InputText
                            value={c.description}
                            onChange={(e) => setCriterion(i, { description: e.target.value })}
                            placeholder="How it is judged (optional)"
                            className="mt-2 w-full"
                            maxLength={MAX_TERM_DETAIL}
                            aria-label={`Criterion ${i + 1} description`}
                          />
                        </div>
                        <Button
                          icon="pi pi-trash"
                          text
                          size="small"
                          severity="danger"
                          onClick={() => set('criteria', value.criteria.filter((_, j) => j !== i))}
                          aria-label={`Remove criterion ${i + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${value.criteria.length > 0 ? 'mt-2' : ''}`}>
                  <Button
                    label="Add criterion"
                    icon="pi pi-plus"
                    text
                    size="small"
                    disabled={value.criteria.length >= MAX_CRITERIA}
                    onClick={() =>
                      set('criteria', [...value.criteria, { points: null, title: '', description: '' }])
                    }
                  />
                  <Button
                    label="Use the standard rubric"
                    icon="pi pi-list-check"
                    text
                    size="small"
                    onClick={useStandardRubric}
                    title="Functionality 35, craft 25, UX 20, timeliness 10, documentation 10"
                  />
                </div>
                {/* The standard rubric costs nothing; the draft is the model
                    weighting the lines by what this brief, its requirements and
                    its milestones say matters. */}
                {features?.criteria && <AiCriteriaDraft form={form} onUse={useDraftCriteria} />}
              </div>
            </Panel>

            <Panel
              title="Search listing"
              help={
                <span className="ml-2 text-sm font-normal text-[var(--text-color-secondary)]">
                  (optional)
                </span>
              }
              intro="What search engines show for the public page. Blank falls back to the title."
            >
              <div>
                <InputText
                  value={value.metaTitle}
                  onChange={(e) => set('metaTitle', e.target.value)}
                  placeholder="Search result title"
                  className="w-full"
                  maxLength={80}
                  aria-label="Search result title"
                />
                <InputTextarea
                  value={value.metaDescription}
                  onChange={(e) => set('metaDescription', e.target.value)}
                  placeholder="One or two sentences shown under the title in search results"
                  rows={2}
                  className="mt-2 w-full"
                  maxLength={200}
                  aria-label="Search result description"
                />
                {features?.seo && (
                  <AiSeoDraft
                    form={form}
                    onApply={(title, description) =>
                      setValue((prev) => ({ ...prev, metaTitle: title, metaDescription: description }))
                    }
                  />
                )}
              </div>
            </Panel>
          </div>
        </TabPanel>
        <TabPanel header="Preview" leftIcon="pi pi-eye mr-2">
          <OpportunityPreview value={value} />
        </TabPanel>
      </TabView>

      {error && !verifyNeeded && <Message severity="error" text={error} className="w-full" />}
      {error && verifyNeeded && (
        <Message
          severity="warn"
          className="w-full justify-start"
          content={
            <span className="text-sm">
              <i className="pi pi-id-card mr-2" aria-hidden />
              {error}{' '}
              <Link href={verifyPath(typeof window === 'undefined' ? null : window.location.pathname)} className="font-medium">
                Verify now
              </Link>
              {' — your draft is saved.'}
            </span>
          }
        />
      )}

      {/* Wraps on narrow screens rather than pushing Cancel off the edge. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--surface-border)] pt-4">
        <Button
          label="Save draft"
          icon="pi pi-save"
          outlined
          loading={busy === 'save'}
          onClick={saveDraft}
        />
        <div className="flex items-center">
          <Button
            label={busy === 'check' ? `Checking the ${byMilestone ? 'total' : 'award'}…` : 'Publish'}
            icon="pi pi-send"
            loading={busy === 'publish' || busy === 'check'}
            disabled={busy !== null}
            onClick={() => void publish()}
          />
          <HelpIcon topic="opportunity.publish" label="Publishing" />
        </div>
        {/* A way out that is not the browser's back button: unsaved typing
            is dropped, which is what cancelling a form means. */}
        <Link href="/client/opportunities" className="no-underline" title="Back to My opportunities without saving">
          <Button label="Cancel" text severity="secondary" />
        </Link>
        <p className="ml-auto hidden text-sm text-[var(--text-color-secondary)] sm:block">
          Drafts are private until you publish.
        </p>
      </div>
    </div>
  );
}
