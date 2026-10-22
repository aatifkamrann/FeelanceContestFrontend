'use client';

import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import HelpIcon from '@/components/HelpIcon';
import {
  AiFormNotes,
  AiProvenance,
  AiSuggestionPanel,
  SuggestButton,
  useFormDraft,
  useSuggestionFold,
  type FormDraftState,
} from '@/components/AiDraft';
import type { EditorCriterion, EditorMilestone, EditorRequirement, EditorValue } from '@/components/OpportunityEditor';
import {
  AWARD_TIERS,
  awardPlace,
  usedTier,
  utcMoment,
  type AwardSuggestion,
  type AwardTier,
  type OpportunityCategoryDef,
  type OpportunityFormSnapshot,
} from '@/lib/opportunities';

type CoachOutput = { flags: { severity: 'info' | 'warn'; issue: string; suggestion: string | null }[] };
type MilestonesOutput = { milestones: { title: string; description: string | null; amount?: number | null }[] };
type RequirementsOutput = { requirements: { title: string; detail: string }[] };
type CriteriaOutput = { criteria: { title: string; points: number; description: string | null }[] };
type SeoOutput = { title: string; description: string };
type CategoryOutput = {
  category: string;
  subcategory: string | null;
  because: string | null;
  confident: boolean;
};

/**
 * The drafting help on the opportunity form, one tool per section it fills.
 * The form is a funnel — the title, the brief, then every section below
 * drafted from what sits above it — and each tool here is handed the form
 * as it stands (FORM_READS in lib/opportunities.ts says which parts it reads),
 * saved or not, so they work while an opportunity is being posted, before
 * there is anything stored to read. None of them saves anything, and
 * none of them fills a field: the client takes a draft with a second
 * press or ignores it.
 */

const DAY_MS = 86_400_000;

/**
 * How long the opportunity runs in whole days, as the award suggestion reads
 * it: from the start day — today where it is blank or gone by, the way
 * publish settles it — to the deadline. Counted from the day rather than the
 * moment, so it holds still while the form sits open. Null while the
 * deadline is blank: the API reads the portal's default.
 */
function durationDays(value: EditorValue): number | null {
  if (!value.deadlineUtc) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = Math.max(today, value.startsAtUtc ? Date.parse(value.startsAtUtc) : today);
  const days = Math.round((Date.parse(value.deadlineUtc) - start) / DAY_MS);
  return days >= 1 ? days : null;
}

/**
 * The form as the tools receive it: the fields they may read, no dates but
 * the duration in days, and money only paid by milestone — the total the
 * milestone draft splits. The award suggestion reads neither the award nor
 * that total: the client's own figure is what it is weighed against.
 */
export function toSnapshot(value: EditorValue): OpportunityFormSnapshot {
  return {
    title: value.title,
    briefMarkdown: value.briefMarkdown,
    category: value.category,
    subcategory: value.subcategory,
    skills: value.skills,
    requirements: value.requirements.map((r) => ({ title: r.title, detail: r.detail })),
    delivery: value.delivery,
    requiresCompose: value.requiresCompose,
    milestones: value.milestones.map((m) => ({ title: m.title, description: m.description })),
    criteria: value.criteria.map((c) => ({ points: c.points, title: c.title, description: c.description })),
    kind: value.kind,
    awardAmount: value.kind === 'milestones' ? value.awardAmount : null,
    durationDays: durationDays(value),
    minMeritScore: value.minMeritScore || null,
    draftId: value.id ?? null,
  };
}

/** The coach, under the brief: what in the form will be argued about later. */
export function AiCoach({ form }: { form: OpportunityFormSnapshot }) {
  const { draft, output, ask, busy, error, tooThin, read } = useFormDraft<CoachOutput>('coach', form);
  const fold = useSuggestionFold(draft);

  return (
    <div className="mt-2">
      <SuggestButton
        label="Coach this brief"
        icon="pi pi-comments"
        busy={busy}
        tooThin={tooThin}
        read={read}
        onAsk={() => void ask()}
        help={<HelpIcon topic="opportunity.aiCoach" label="The brief coach" />}
      />
      <AiFormNotes tooThin={tooThin} stale={draft !== null && !read} />
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {output && draft && (
        <AiSuggestionPanel
          title={output.flags.length === 0 ? 'Brief coach: nothing flagged' : `Brief coach: ${output.flags.length} to look at`}
          fold={fold}
        >
          {output.flags.length === 0 ? (
            <p className="text-green-700 dark:text-green-400">
              <i className="pi pi-check-circle mr-1" aria-hidden />
              Nothing flagged — the brief reads clean.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {output.flags.map((f, i) => (
                <li key={i} className="rounded-lg border border-[var(--surface-border)] p-2">
                  <Tag
                    value={f.severity === 'warn' ? 'worth fixing' : 'consider'}
                    severity={f.severity === 'warn' ? 'warning' : 'info'}
                    className="mr-2"
                  />
                  {f.issue}
                  {f.suggestion && (
                    <p className="mt-1 text-[var(--text-color-secondary)]">{f.suggestion}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <AiProvenance artifact={draft} />
        </AiSuggestionPanel>
      )}
    </div>
  );
}

/**
 * Which kind of work the brief describes, read by the model and offered
 * beside the picker. The client presses once and presses again to take it:
 * a suggestion that filled the fields by itself would be a decision, and
 * the category is how every entrant finds this opportunity.
 */
export function AiCategoryDraft({
  form,
  categories,
  current,
  onApply,
}: {
  form: OpportunityFormSnapshot;
  categories: OpportunityCategoryDef[];
  current: { category: string | null; subcategory: string | null };
  onApply: (category: string, subcategory: string | null) => void;
}) {
  const { draft, output, ask, busy, error, tooThin, read } = useFormDraft<CategoryOutput>('categorise', form);

  const category = categories.find((c) => c.key === output?.category) ?? null;
  const subcategory = category?.subcategories.find((s) => s.key === output?.subcategory) ?? null;
  const already =
    category !== null &&
    category.key === current.category &&
    (subcategory?.key ?? null) === current.subcategory;
  const fold = useSuggestionFold(draft);

  return (
    <div className="mt-2">
      <SuggestButton
        busy={busy}
        tooThin={tooThin}
        read={read}
        onAsk={() => void ask()}
        help={<HelpIcon topic="opportunity.aiCategory" label="Suggesting a category" />}
      />
      <AiFormNotes tooThin={tooThin} stale={draft !== null && !read} />
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {category && (
        <AiSuggestionPanel title="Suggested category" fold={fold}>
          <p>
            Reads like{' '}
            <strong>
              {category.label}
              {subcategory && ` › ${subcategory.label}`}
            </strong>
          </p>
          {output?.because && (
            <p className="text-[var(--text-color-secondary)]">— {output.because}</p>
          )}
          {output && !output.confident && (
            <p className="text-[var(--text-color-secondary)]">
              The brief is thin for this — worth a second look before you take it.
            </p>
          )}
          {already ? (
            <p className="mt-1 font-medium text-green-700 dark:text-green-400">
              <i className="pi pi-check mr-1" aria-hidden />
              That is what you have.
            </p>
          ) : (
            <Button
              label="Use it"
              icon="pi pi-arrow-up"
              size="small"
              text
              className="mt-1"
              onClick={() => {
                onApply(category.key, subcategory?.key ?? null);
                fold.done('Used');
              }}
            />
          )}
          {draft && <AiProvenance artifact={draft} />}
        </AiSuggestionPanel>
      )}
    </div>
  );
}

/**
 * The requirements table drafted from the brief, the kind of work and the
 * skills above it. Rows are added under what is there rather than
 * replacing it: a row the client already has is marked and left alone,
 * so a table half built from the chips is not thrown away.
 */
export function AiRequirementsDraft({
  form,
  existing,
  room,
  onAdd,
}: {
  form: OpportunityFormSnapshot;
  /** The row names already in the table. */
  existing: string[];
  /** How many rows the table can still take. */
  room: number;
  onAdd: (rows: EditorRequirement[]) => void;
}) {
  const { draft, output, ask, busy, error, tooThin, read } = useFormDraft<RequirementsOutput>('requirements', form);
  const fold = useSuggestionFold(draft);

  const have = new Set(existing.map((t) => t.trim().toLowerCase()));
  const rows = (output?.requirements ?? []).map((r) => ({ ...r, listed: have.has(r.title.trim().toLowerCase()) }));
  const fresh = rows.filter((r) => !r.listed).slice(0, Math.max(0, room));

  return (
    <div className="mt-2">
      <SuggestButton
        busy={busy}
        tooThin={tooThin}
        read={read}
        onAsk={() => void ask()}
        help={<HelpIcon topic="opportunity.aiRequirements" label="Drafting the requirements" />}
      />
      <AiFormNotes tooThin={tooThin} stale={draft !== null && !read} />
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {output && draft && (
        <AiSuggestionPanel title={`Suggested requirements (${rows.length})`} fold={fold}>
          <ul className="flex flex-col gap-1">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{r.title}</span>
                <span className="text-[var(--text-color-secondary)]">— {r.detail}</span>
                {r.listed && <Tag value="already listed" severity="secondary" />}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
            Only what the brief states or clearly implies. Every row stays editable below.
          </p>
          {fresh.length > 0 ? (
            <Button
              label={fresh.length === rows.length ? 'Add these rows' : `Add the ${fresh.length} not listed`}
              icon="pi pi-arrow-down"
              size="small"
              text
              className="mt-1"
              onClick={() => {
                onAdd(fresh.map(({ title, detail }) => ({ title, detail })));
                fold.done('Added');
              }}
            />
          ) : (
            <p className="mt-1 font-medium text-green-700 dark:text-green-400">
              <i className="pi pi-check mr-1" aria-hidden />
              {room <= 0 ? 'The table is full.' : 'Every row is already in your table.'}
            </p>
          )}
          <AiProvenance artifact={draft} />
        </AiSuggestionPanel>
      )}
    </div>
  );
}

/** The milestone checklist drafted from the brief and the terms above it; the client pulls it into the editable list. */
export function AiMilestonesDraft({
  form,
  plan,
  onUse,
}: {
  form: OpportunityFormSnapshot;
  /** The form's own arithmetic: a drafted list, dated and shared from the opportunity schedule — paid by milestone, its amounts fitted to the total. */
  plan: (drafted: { title: string; description: string; amount?: number | null }[]) => EditorMilestone[];
  onUse: (milestones: EditorMilestone[]) => void;
}) {
  const { draft, output, ask, busy, error, tooThin, read } = useFormDraft<MilestonesOutput>('milestones', form);

  // Dated and shared as the form would date and share them — computed on
  // every render, so a deadline changed after the draft was read is already
  // in the list below before anybody takes it.
  const planned = plan(
    (output?.milestones ?? []).map((m) => ({ title: m.title, description: m.description ?? '', amount: m.amount ?? null })),
  );
  const dated = planned.some((m) => m.dueUtc);
  const paidBy = form.kind === 'milestones';
  const priced = planned.some((m) => m.amount != null);
  const fold = useSuggestionFold(draft);

  return (
    <div className="mt-2">
      <SuggestButton
        busy={busy}
        tooThin={tooThin}
        read={read}
        onAsk={() => void ask()}
        help={<HelpIcon topic="opportunity.aiMilestones" label="Drafting milestones" />}
      />
      <AiFormNotes tooThin={tooThin} stale={draft !== null && !read} />
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {output && draft && (
        <AiSuggestionPanel title={`Suggested milestones (${planned.length})`} fold={fold}>
          <ol className="flex flex-col gap-2">
            {planned.map((m, i) => (
              <li key={i}>
                <p>
                  <span className="font-medium">
                    {i + 1}. {m.title}
                  </span>
                  {m.description && (
                    <span className="text-[var(--text-color-secondary)]"> — {m.description}</span>
                  )}
                </p>
                <p className="text-xs tabular-nums text-[var(--text-color-secondary)]">
                  {paidBy
                    ? m.amount != null
                      ? `pays $${m.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                      : 'no amount yet'
                    : `${m.weightPercent}% of the work`}
                  {m.dueUtc && ` · due ${utcMoment(m.dueUtc)}`}
                </p>
              </li>
            ))}
          </ol>
          {/* Where the numbers came from, since the model did not write them:
              the schedule the client set further up this form. */}
          <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
            {paidBy
              ? (priced
                  ? 'The amounts are the model’s split of your total by the work each step takes, fitted to add up to it exactly — a suggestion, not a price it knows. '
                  : 'Set the total under Award and dates and the steps come back with amounts. ') +
                (dated
                  ? 'Dates are spread evenly from the start to the deadline. All of it is yours to change above.'
                  : 'Set a deadline and the steps come back dated.')
              : dated
                ? 'Dates are spread evenly from the start to the deadline, the last step landing on it; shares are an even split. Both are yours to change above.'
                : 'Shares are an even split. Set a deadline under Award and dates and the steps come back dated.'}
          </p>
          <Button
            label="Use these — I&apos;ll edit them above"
            icon="pi pi-arrow-up"
            size="small"
            text
            className="mt-1"
            onClick={() => {
              onUse(planned);
              fold.done('Used');
            }}
          />
          <AiProvenance artifact={draft} />
        </AiSuggestionPanel>
      )}
    </div>
  );
}

/**
 * The scoring rubric drafted from the brief, the requirements and the
 * milestones above it. It replaces the table the way the standard rubric
 * does — the points only mean something as a set — so the editor warns
 * first where a rubric has been typed.
 */
export function AiCriteriaDraft({
  form,
  onUse,
}: {
  form: OpportunityFormSnapshot;
  onUse: (criteria: EditorCriterion[]) => void;
}) {
  const { draft, output, ask, busy, error, tooThin, read } = useFormDraft<CriteriaOutput>('criteria', form);
  const fold = useSuggestionFold(draft);
  const rows = output?.criteria ?? [];
  const total = rows.reduce((sum, c) => sum + c.points, 0);

  return (
    <div className="mt-2">
      <SuggestButton
        busy={busy}
        tooThin={tooThin}
        read={read}
        onAsk={() => void ask()}
        help={<HelpIcon topic="opportunity.aiCriteria" label="Drafting the rubric" />}
      />
      <AiFormNotes tooThin={tooThin} stale={draft !== null && !read} />
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {output && draft && (
        <AiSuggestionPanel title={`Suggested rubric (${total} points over ${rows.length})`} fold={fold}>
          <ol className="flex flex-col gap-1">
            {rows.map((c, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span className="w-14 shrink-0 text-right font-medium tabular-nums">{c.points} pts</span>
                <span className="font-medium">{c.title}</span>
                {c.description && (
                  <span className="text-[var(--text-color-secondary)]">— {c.description}</span>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
            Weighted by what the brief says matters most. Every line and its points stay yours to change above.
          </p>
          <Button
            label="Use this rubric — I&apos;ll edit it above"
            icon="pi pi-arrow-up"
            size="small"
            text
            className="mt-1"
            onClick={() => {
              onUse(rows.map((c) => ({ points: c.points, title: c.title, description: c.description ?? '' })));
              fold.done('Used');
            }}
          />
          <AiProvenance artifact={draft} />
        </AiSuggestionPanel>
      )}
    </div>
  );
}

/** The SEO drafter beside the metadata fields; applying only fills the inputs. */
export function AiSeoDraft({
  form,
  onApply,
}: {
  form: OpportunityFormSnapshot;
  onApply: (title: string, description: string) => void;
}) {
  const { draft, output, ask, busy, error, tooThin, read } = useFormDraft<SeoOutput>('seo', form);
  const fold = useSuggestionFold(draft);

  return (
    <div className="mt-2">
      <SuggestButton
        busy={busy}
        tooThin={tooThin}
        read={read}
        onAsk={() => void ask()}
        help={<HelpIcon topic="opportunity.aiSeo" label="Drafting search metadata" />}
      />
      <AiFormNotes tooThin={tooThin} stale={draft !== null && !read} />
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {output && (
        <AiSuggestionPanel title="Suggested search title and description" fold={fold}>
          <p className="font-medium">{output.title}</p>
          <p className="text-[var(--text-color-secondary)]">{output.description}</p>
          <Button
            label="Apply to the fields"
            icon="pi pi-arrow-up"
            size="small"
            text
            className="mt-1"
            onClick={() => {
              onApply(output.title, output.description);
              fold.done('Applied');
            }}
          />
          {draft && <AiProvenance artifact={draft} />}
        </AiSuggestionPanel>
      )}
    </div>
  );
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const TIER_LABEL: Record<AwardTier, string> = { low: 'Low', competitive: 'Competitive', attractive: 'Attractive' };
const TIER_TAG: Record<AwardTier, 'warning' | 'info' | 'success'> = {
  low: 'warning',
  competitive: 'info',
  attractive: 'success',
};

/** Where an award sits against a suggestion, in words, and how loudly to say it. */
export type AwardVerdict = {
  severity: 'warn' | 'info' | 'success';
  /** Where it sits. */
  text: string;
  /** Whether it is a suggested figure or the client's own. */
  used: string;
  /** Below the low end or at it: the publish dialog offers the way back to the field first. */
  low: boolean;
};

/**
 * An award placed against the suggestion, in the client's words — the
 * portal's arithmetic (awardPlace, usedTier), said the same way beside the
 * field and in the publish dialog. Null with no award to place.
 */
export function awardVerdict(amount: number | null, s: AwardSuggestion, byMilestone: boolean): AwardVerdict | null {
  const place = awardPlace(amount, s);
  if (place === null || amount == null) return null;
  const what = byMilestone ? 'total' : 'award';
  const entering = byMilestone ? 'applying for' : 'entering';
  const yours = `Your ${what} of ${usd(amount)}`;
  const text = {
    below: `${yours} is below the suggested low end of ${usd(s.low.amountUsd)} — for this brief, few freelancers may think it worth ${entering}.`,
    low: `${yours} sits at the low end of the suggestion — expect a smaller field.`,
    competitive: `${yours} is competitive for this brief — in line with what work like this usually pays.`,
    attractive: `${yours} is attractive for this brief — expect a strong field.`,
    above: `${yours} is above the attractive figure of ${usd(s.attractive.amountUsd)} — expect a strong field.`,
  }[place];
  const tier = usedTier(amount, s);
  return {
    severity: place === 'below' || place === 'low' ? 'warn' : place === 'competitive' ? 'info' : 'success',
    text,
    used: tier ? `It is the suggested ${tier} figure.` : 'It is your own figure — the suggestion was not used.',
    low: place === 'below' || place === 'low',
  };
}

/**
 * The award suggestion under Award (USD) — Total (USD) paid by milestone: a
 * line on what the work takes and three figures with what each buys, read
 * off the brief and the terms above the field, never off the client's own
 * figure. Where that figure sits among them is said beside them as the
 * client types, for nothing; the editor holds the hook, because Publish
 * checks the award against the same answer again.
 */
export function AiAwardDraft({
  award,
  amount,
  byMilestone,
  onUse,
}: {
  award: FormDraftState<AwardSuggestion>;
  /** The award as the field holds it. */
  amount: number | null;
  byMilestone: boolean;
  onUse: (amount: number) => void;
}) {
  const { draft, output, ask, busy, error, tooThin, read } = award;
  const fold = useSuggestionFold(draft);
  const verdict = output ? awardVerdict(amount, output, byMilestone) : null;
  const used = output ? usedTier(amount, output) : null;

  return (
    <div className="mt-2">
      <SuggestButton
        label={byMilestone ? 'Suggest a total' : 'Suggest an award'}
        busy={busy}
        tooThin={tooThin}
        read={read}
        onAsk={() => void ask()}
        help={<HelpIcon topic="opportunity.aiAward" label="Suggesting an award" />}
      />
      <AiFormNotes tooThin={tooThin} stale={draft !== null && !read} />
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {output && draft && (
        <AiSuggestionPanel title={byMilestone ? 'Suggested total' : 'Suggested award'} fold={fold}>
          <p className="text-[var(--text-color-secondary)]">{output.effort}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {AWARD_TIERS.map((t) => (
              <li
                key={t}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--surface-border)] p-2"
              >
                <Tag value={TIER_LABEL[t]} severity={TIER_TAG[t]} className="w-24 justify-center" />
                <span className="w-20 text-right font-semibold tabular-nums">{usd(output[t].amountUsd)}</span>
                {output[t].why && (
                  <span className="min-w-[12rem] flex-1 text-[var(--text-color-secondary)]">{output[t].why}</span>
                )}
                {used === t ? (
                  <span className="ml-auto text-xs font-medium text-green-700 dark:text-green-400">
                    <i className="pi pi-check mr-1 text-[0.65rem]" aria-hidden />
                    Yours
                  </span>
                ) : (
                  <Button
                    label={`Use ${usd(output[t].amountUsd)}`}
                    icon="pi pi-arrow-up"
                    size="small"
                    text
                    className="ml-auto"
                    onClick={() => {
                      onUse(output[t].amountUsd);
                      fold.done(`Used: ${t}`);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
          {verdict && (
            <p
              className={`mt-2 ${verdict.low ? 'font-medium text-amber-600 dark:text-amber-500' : 'text-[var(--text-color-secondary)]'}`}
              aria-live="polite"
            >
              {verdict.text}
            </p>
          )}
          {!output.confident && (
            <p className="mt-1 text-[var(--text-color-secondary)]">
              The brief is thin for pricing — worth a second look before you take a figure.
            </p>
          )}
          <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
            An estimate from what the form says, not a price the portal knows — your{' '}
            {byMilestone ? 'total' : 'award'} is yours to set. Publish checks it against these figures again.
          </p>
          <AiProvenance artifact={draft} />
        </AiSuggestionPanel>
      )}
    </div>
  );
}
