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
} from '@/components/AiDraft';
import type { EditorCriterion, EditorMilestone, EditorRequirement, EditorValue } from '@/components/OpportunityEditor';
import { utcMoment, type OpportunityCategoryDef, type OpportunityFormSnapshot } from '@/lib/opportunities';

type CoachOutput = { flags: { severity: 'info' | 'warn'; issue: string; suggestion: string | null }[] };
type MilestonesOutput = { milestones: { title: string; description: string | null }[] };
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

/** The form as the tools receive it: the fields they may read, nothing about money or dates. */
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
  /** The form's own arithmetic: a drafted list, dated and shared from the opportunity schedule. */
  plan: (drafted: { title: string; description: string }[]) => EditorMilestone[];
  onUse: (milestones: EditorMilestone[]) => void;
}) {
  const { draft, output, ask, busy, error, tooThin, read } = useFormDraft<MilestonesOutput>('milestones', form);

  // Dated and shared as the form would date and share them — computed on
  // every render, so a deadline changed after the draft was read is already
  // in the list below before anybody takes it.
  const planned = plan(
    (output?.milestones ?? []).map((m) => ({ title: m.title, description: m.description ?? '' })),
  );
  const dated = planned.some((m) => m.dueUtc);
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
                  {m.weightPercent}% of the work
                  {m.dueUtc && ` · due ${utcMoment(m.dueUtc)}`}
                </p>
              </li>
            ))}
          </ol>
          {/* Where the numbers came from, since the model did not write them:
              the schedule the client set further up this form. */}
          <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
            {dated
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
