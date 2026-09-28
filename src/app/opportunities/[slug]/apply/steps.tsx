'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { verifyPath } from '@/lib/identity';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { RadioButton } from 'primereact/radiobutton';
import { Slider } from 'primereact/slider';
import { AiSuggestionPanel, TextSuggestion, useSuggestionFold, type FormDraft } from '@/components/AiDraft';
import CaptchaWidget from '@/components/CaptchaWidget';
import HelpIcon from '@/components/HelpIcon';
import PortalNote from '@/components/PortalNote';
import ChipPicker from '@/components/profile/ChipPicker';
import SummaryNote from '@/components/profile/SummaryNote';
import {
  COMMITMENTS,
  MAX_APPROACH,
  MIN_APPROACH,
  RELEVANT_FROM,
  commitmentLabel,
  type ApplyContext,
} from '@/lib/applications';
import { formatAward, matchLabel, postJson, utcDay, type OpportunityFitFactor } from '@/lib/opportunities';
import { draftFrom, type MemberProfile } from '@/lib/profile';
import { GITHUB_USERNAME, type Draft } from './draft';
import { Figures, Line, Lines, Meter, Panel, StepHeading, StepNav } from './kit';

/** What every step is handed: the read, the draft, one setter, and the two ways out. */
export type StepProps = {
  ctx: ApplyContext;
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  portal: string;
  onBack: () => void;
  onNext: () => void;
};

// ------------------------------------------------------- 1 · opportunity

export function OpportunityStep({ ctx, onBack, onNext }: StepProps) {
  const c = ctx.opportunity;
  return (
    <div>
      <StepHeading
        eyebrow="Apply for Competition"
        title={c.title}
        help={<HelpIcon topic="apply.how" label="How applying works" />}
      />
      <Figures
        className="mt-5"
        items={[
          { value: formatAward(c.awardAmount, c.currency), label: 'Guaranteed', title: 'The fixed award, paid to the winner', accent: true },
          { value: c.weeks ? `${c.weeks} wk` : '—', label: 'To deliver', title: c.weeks ? `${c.weeks} weeks from the start to the deadline` : 'No deadline set' },
          { value: 'Fixed Price', label: 'Type', title: 'One fixed award, paid to the one winner' },
          { value: String(c.entrantCount), label: 'Competitors', title: 'Freelancers selected to compete' },
          { value: String(c.applicationCount), label: 'Submitted', title: 'Applications submitted for this opportunity' },
        ]}
      />
      <Panel className="mt-5" title="How this competition works">
        <Lines>
          <Line mark="ok">Multiple qualified freelancers may participate</Line>
          <Line mark="ok">All competitors work against the same requirements</Line>
          <Line mark="ok">Submission quality, timeline adherence and scope completion determine the winner</Line>
          <Line mark="ok">One qualifying freelancer receives the guaranteed reward</Line>
        </Lines>
      </Panel>
      <StepNav onBack={onBack} onNext={onNext} backLabel="Back to the opportunity" />
    </div>
  );
}

// ------------------------------------------------------------- 2 · match

/** The words under each card: what the line was read against. */
function factorNote(f: OpportunityFitFactor, ctx: ApplyContext): string {
  switch (f.key) {
    case 'skills':
      return ctx.opportunity.skills.length > 0 ? ctx.opportunity.skills.join(' · ') : 'No skills named';
    case 'projects':
      return ctx.opportunity.categoryLabel ?? 'Past work that fits the brief';
    case 'record':
      return 'Milestones claimed on time';
    default:
      return ctx.opportunity.weeks ? `Against a ${ctx.opportunity.weeks}-week timeline` : 'Against the timeline';
  }
}

export function MatchStep({ ctx, portal, onBack, onNext }: StepProps) {
  const fit = ctx.fit;
  if (!fit) {
    return (
      <div>
        <StepHeading eyebrow={`${portal} Match Analysis`} title="Your Opportunity Match" />
        <Panel className="mt-5" tone="warn">
          <p className="text-sm">There is no fit to read for this account — only a freelancer’s profile is matched.</p>
        </Panel>
        <StepNav onBack={onBack} onNext={onNext} />
      </div>
    );
  }
  const strong = fit.factors.filter((f) => f.score !== null && f.score >= 60);
  const scored = fit.factors.filter((f) => f.score !== null);
  const recommendation = !fit.canEnter
    ? { word: 'Strengthen your profile first', note: fit.reasons[0] ?? 'A term the client set is not met yet.' }
    : fit.match >= 60
      ? { word: 'Apply', note: 'Your profile reads well against this brief.' }
      : { word: 'Apply — and strengthen', note: 'You can apply; the lines below say what would raise the match.' };

  return (
    <div>
      <StepHeading
        eyebrow={`${portal} Match Analysis`}
        title="Your Opportunity Match"
        help={<HelpIcon topic="apply.match" label="How the match is worked out" />}
      />
      <Panel className="mt-5" tone="accent">
        <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
          <div className="text-center sm:border-r sm:border-[var(--surface-border)] sm:pr-5">
            <p className="text-5xl font-bold tabular-nums text-[var(--primary-color)]">{fit.match}%</p>
            <p className="mt-1 font-semibold">{matchLabel(fit.matchBand)}</p>
          </div>
          <div>
            <h2 className="font-semibold">Why you match</h2>
            <Lines className="mt-2">
              {strong.length === 0 && (
                <Line mark="todo">Nothing reads strong yet — the cards below say what would.</Line>
              )}
              {strong.map((f) => (
                <Line key={f.key} mark="ok">
                  {f.key === 'record' ? `${f.score}% on-time delivery` : f.label}
                </Line>
              ))}
              {fit.risk && (
                <Line mark="warn" className="mt-1">
                  {fit.risk}
                </Line>
              )}
            </Lines>
          </div>
        </div>
      </Panel>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {scored.map((f) => (
          <Panel key={f.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{f.label}</span>
              <span className="font-semibold tabular-nums">{f.score}%</span>
            </div>
            <div className="mt-2">
              <Meter score={f.score} label={f.label} />
            </div>
            <p className="mt-2 text-sm text-[var(--text-color-secondary)]" title={f.detail}>
              {factorNote(f, ctx)}
            </p>
          </Panel>
        ))}
        <Panel tone={fit.canEnter ? 'good' : 'warn'}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]">
            Recommendation
          </p>
          <p
            className={`mt-1 text-xl font-bold ${fit.canEnter ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}
          >
            {recommendation.word}
          </p>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">{recommendation.note}</p>
        </Panel>
      </div>
      <StepNav onBack={onBack} onNext={onNext} nextLabel="Continue Application" />
    </div>
  );
}

// ------------------------------------------------------- 3 · eligibility

/** This step's own address: the verify pages send a member back to it, not to the start. */
const eligibilityPath = (slug: string) => `/opportunities/${slug}/apply?step=3`;

export function EligibilityStep({ ctx, onBack, onNext }: StepProps) {
  const fit = ctx.fit;
  const e = ctx.eligibility;
  const c = ctx.opportunity;
  const missing = new Set(fit?.missingSkills ?? []);
  return (
    <div>
      <StepHeading
        eyebrow="Eligibility Confirmation"
        title="Competition Requirements"
        lede="The platform validates that your profile matches before you compete."
        help={<HelpIcon topic="apply.eligibility" label="What is checked" />}
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Panel title="Category">
          <Lines>
            {!c.categoryLabel ? (
              <Line mark="todo">The brief names no kind of work</Line>
            ) : fit === null || fit.categoryOk ? (
              <Line mark="ok">Qualified for {c.categoryLabel}</Line>
            ) : (
              <Line mark="warn">{c.categoryLabel} is not your usual work — you can still apply</Line>
            )}
            {c.minMeritScore > 0 ? (
              fit === null ? (
                <Line mark="todo">Merit score of {c.minMeritScore} required</Line>
              ) : fit.meritOk ? (
                <Line mark="ok">
                  Merit score {fit.meritScore} — the minimum of {c.minMeritScore} is met
                </Line>
              ) : (
                <Line mark="no">
                  Merit score {fit.meritScore} — the client requires {c.minMeritScore}
                </Line>
              )
            ) : (
              <Line mark="ok">No minimum merit score on this opportunity</Line>
            )}
          </Lines>
        </Panel>
        <Panel title="Skills">
          <Lines>
            {c.skills.length === 0 && <Line mark="ok">No required skills — the brief names none</Line>}
            {c.skills.map((s) => (
              <Line key={s} mark={missing.has(s) ? 'no' : 'ok'}>
                {s}
                {missing.has(s) && (
                  <span className="text-[var(--text-color-secondary)]"> — not on your profile</span>
                )}
              </Line>
            ))}
          </Lines>
        </Panel>
        <Panel title="Verification">
          <Lines>
            <Line mark={e.emailVerified ? 'ok' : 'todo'}>{e.emailVerified ? 'Email verified' : 'Email not verified'}</Line>
            <Line mark={e.phoneVerified ? 'ok' : 'todo'}>
              {e.phoneVerified ? 'Mobile verified' : 'Mobile not verified'}
              {!e.phoneVerified && <span className="text-[var(--text-color-secondary)]"> — optional</span>}
            </Line>
            {e.identityRequired && (
              <Line mark={e.identityVerified ? 'ok' : 'no'}>
                {e.identityVerified ? 'Identity verified' : 'Identity not verified'}
                {!e.identityVerified && (
                  <span className="text-[var(--text-color-secondary)]">
                    {' — '}
                    <Link href={verifyPath(eligibilityPath(c.slug))}>verify now</Link>, about two minutes
                  </span>
                )}
              </Line>
            )}
          </Lines>
        </Panel>
        <Panel title="Availability">
          <Lines>
            {!e.availabilitySet ? (
              <Line mark="warn">Say when you can start on your profile — you confirm hours on step 7</Line>
            ) : e.availabilityOk ? (
              <Line mark="ok">Available during project timeline</Line>
            ) : (
              <Line mark="warn">Your profile says you are not taking work on — update it before you commit</Line>
            )}
          </Lines>
        </Panel>
      </div>
      {e.canApply ? (
        <Panel className="mt-4" tone="good">
          <p className="font-semibold text-green-700 dark:text-green-400">
            <i className="pi pi-check mr-2" aria-hidden />
            All requirements satisfied — you are eligible to compete.
          </p>
        </Panel>
      ) : (
        <Panel className="mt-4" tone="bad">
          <p className="font-semibold text-red-700 dark:text-red-400">
            <i className="pi pi-times mr-2" aria-hidden />
            {e.problem ?? 'You cannot apply to this opportunity right now.'}
          </p>
          {e.identityRequired && !e.identityVerified ? (
            <Link href={verifyPath(eligibilityPath(c.slug))} className="no-underline">
              <Button label="Verify your identity" icon="pi pi-id-card" size="small" className="mt-3" />
            </Link>
          ) : (
            fit &&
            !fit.canEnter && (
              <Link href="/profile" className="no-underline">
                <Button label="Open your profile" icon="pi pi-user" outlined size="small" className="mt-3" />
              </Link>
            )
          )}
        </Panel>
      )}
      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel="Confirm Eligibility"
        nextIcon="pi pi-check"
        nextDisabled={!e.canApply}
        note={e.canApply ? null : 'Not eligible yet'}
      />
    </div>
  );
}

// ----------------------------------------------------------- 4 · profile

export function ProfileStep({
  ctx,
  draft,
  set,
  portal,
  onBack,
  onNext,
  profile,
  aiSummary,
}: StepProps & { profile: MemberProfile | null; aiSummary: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div>
      <StepHeading
        title="How You Present Yourself"
        lede="This replaces the traditional proposal. Your profile speaks for you."
        help={<HelpIcon topic="apply.summary" label="What this is for" />}
      />
      <Panel className="mt-5" title="Professional Summary">
        <p className="text-sm text-[var(--text-color-secondary)]">
          From your profile’s About. Edit it for this application — your profile is left as it is.
        </p>
        <InputTextarea
          ref={ref}
          value={draft.summary}
          onChange={(e) => set('summary', e.target.value)}
          rows={8}
          maxLength={2000}
          className="mt-3 w-full"
          aria-label="Professional summary"
          placeholder="What you build, who you build it for, and how you work."
        />
        {aiSummary && profile && (
          <SummaryNote
            className="mt-3"
            label={`✦ Improve with ${portal}`}
            draft={{ ...draftFrom(profile), bio: draft.summary }}
            onUse={(text) => set('summary', text)}
            onEdit={(text) => {
              set('summary', text);
              setTimeout(() => {
                const el = ref.current;
                if (!el) return;
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
              }, 0);
            }}
          />
        )}
      </Panel>
      <p className="mt-3 text-xs text-[var(--text-color-secondary)]">
        {ctx.opportunity.clientName} reads this beside your past work and your record here.
      </p>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ---------------------------------------------------------- 5 · approach

/**
 * The portal offering to draft the approach, the same way the summary's
 * note does: the offer and its button, then the draft open in a folding
 * panel with three things to do with it, any of which folds it away. One
 * call per text: the last answer is kept against what was in the box when
 * it was asked for.
 */
function ApproachNote({
  slug,
  text,
  portal,
  onUse,
  onEdit,
}: {
  slug: string;
  text: string;
  portal: string;
  onUse: (text: string) => void;
  onEdit: (text: string) => void;
}) {
  const [answer, setAnswer] = useState<{ key: string; draft: FormDraft<{ approach: string }> } | null>(null);
  // A new answer opens the panel; acting on it folds it.
  const fold = useSuggestionFold(answer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = text.trim();

  const generate = async () => {
    setError(null);
    if (answer?.key === key) {
      fold.open();
      return;
    }
    setBusy(true);
    try {
      const res = await postJson<FormDraft<{ approach: string }>>(
        `/api/opportunities/${encodeURIComponent(slug)}/ai/approach`,
        { draft: key.length > 0 ? key : null },
      );
      setAnswer({ key, draft: res });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The draft could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const showing = answer !== null && answer.key === key && fold.expanded;
  return (
    <PortalNote
      className="mt-3"
      actions={
        showing ? undefined : (
          <>
            <Button
              type="button"
              label={`✦ Generate Approach with ${portal}`}
              size="small"
              loading={busy}
              disabled={busy}
              onClick={() => void generate()}
            />
            <HelpIcon topic="apply.aiApproach" label="Drafting the approach" />
          </>
        )
      }
    >
      {answer === null ? (
        <p>
          {portal} can suggest development phases, risk areas and a technical strategy — you edit and
          approve before submitting.
        </p>
      ) : (
        <AiSuggestionPanel title="Suggested approach" fold={fold}>
          <TextSuggestion
            text={answer.draft.output.approach}
            provenance={answer.draft}
            fold={fold}
            onUse={onUse}
            onEdit={onEdit}
          />
        </AiSuggestionPanel>
      )}
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
    </PortalNote>
  );
}

export function ApproachStep({
  ctx,
  draft,
  set,
  portal,
  onBack,
  onNext,
  aiApproach,
}: StepProps & { aiApproach: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const length = draft.approach.trim().length;
  const ok = length >= MIN_APPROACH && length <= MAX_APPROACH;
  return (
    <div>
      <StepHeading
        eyebrow="Project Approach"
        title="How Would You Approach This Project?"
        lede="Competition is about execution. Outline your plan, architecture and delivery strategy."
        help={<HelpIcon topic="apply.approach" label="What to write" />}
      />
      <InputTextarea
        ref={ref}
        value={draft.approach}
        onChange={(e) => set('approach', e.target.value)}
        rows={10}
        maxLength={MAX_APPROACH}
        className="mt-5 w-full"
        aria-label="Your approach"
        placeholder="Explain your planned approach, architecture decisions and delivery strategy..."
      />
      <div className="mt-1 flex justify-between text-xs text-[var(--text-color-secondary)]">
        <span>
          Min {MIN_APPROACH} · Max {MAX_APPROACH}
        </span>
        <span className={`tabular-nums ${length > 0 && !ok ? 'text-amber-600 dark:text-amber-400' : ''}`}>
          {length} / {MAX_APPROACH}
        </span>
      </div>
      {aiApproach && (
        <ApproachNote
          slug={ctx.opportunity.slug}
          text={draft.approach}
          portal={portal}
          onUse={(text) => set('approach', text)}
          onEdit={(text) => {
            set('approach', text);
            setTimeout(() => {
              const el = ref.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(el.value.length, el.value.length);
            }, 0);
          }}
        />
      )}
      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!ok}
        note={ok ? null : length < MIN_APPROACH ? `${MIN_APPROACH - length} more characters` : 'Too long'}
      />
    </div>
  );
}

// --------------------------------------------------------- 6 · portfolio

export function PortfolioStep({ ctx, draft, set, portal, onBack, onNext }: StepProps) {
  const projects = ctx.profile.projects;
  const chosen = new Set(draft.projectIds);
  const toggle = (id: string) =>
    set('projectIds', chosen.has(id) ? draft.projectIds.filter((x) => x !== id) : [...draft.projectIds, id]);
  return (
    <div>
      <StepHeading
        eyebrow="Portfolio Selection"
        title="Attach Your Strongest Proof"
        lede={`${portal} ranks your portfolio by relevance. Select the projects that best support this competition.`}
        help={<HelpIcon topic="apply.portfolio" label="How relevance is read" />}
      />
      {projects.length === 0 ? (
        <Panel className="mt-5" tone="warn">
          <p className="text-sm">
            There is no past work on your profile yet. You can apply without any — the client then reads
            your approach alone — or add a project first.
          </p>
          <Link href="/profile" className="no-underline">
            <Button label="Add past work" icon="pi pi-briefcase" outlined size="small" className="mt-3" />
          </Link>
        </Panel>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {projects.map((p) => {
            const on = chosen.has(p.id);
            const relevant = (p.relevance ?? 0) >= RELEVANT_FROM;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(p.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    on
                      ? 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)]'
                      : relevant
                        ? 'border-[var(--primary-color)] bg-[var(--surface-card)]'
                        : 'border-[var(--surface-border)] bg-[var(--surface-card)] hover:border-[var(--primary-color)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        on
                          ? 'border-[var(--primary-color)] bg-[var(--primary-color)] text-[var(--primary-color-text)]'
                          : 'border-[var(--surface-border)] bg-[var(--surface-card)]'
                      }`}
                    >
                      {on && <i className="pi pi-check text-xs" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold [overflow-wrap:anywhere]">{p.title}</span>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            relevant
                              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                              : 'bg-[var(--surface-hover)] text-[var(--text-color-secondary)]'
                          }`}
                        >
                          {p.relevance === null ? 'Relevance —' : `${p.relevance}% Relevant`}
                        </span>
                      </span>
                      <span className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                        <span>
                          <span className="block font-medium">Role</span>
                          <span className="text-[var(--text-color-secondary)]">{p.role || '—'}</span>
                        </span>
                        <span>
                          <span className="block font-medium">Tech</span>
                          <span className="text-[var(--text-color-secondary)]">{p.tech || '—'}</span>
                        </span>
                        <span>
                          <span className="block font-medium">Outcome</span>
                          <span className="line-clamp-3 whitespace-pre-wrap text-[var(--text-color-secondary)]">
                            {p.outcome || '—'}
                          </span>
                        </span>
                      </span>
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-sm text-[var(--text-color-secondary)]">
        {draft.projectIds.length === 0
          ? 'No project selected.'
          : `${draft.projectIds.length} project${draft.projectIds.length === 1 ? '' : 's'} selected.`}
      </p>
      <StepNav onBack={onBack} onNext={onNext} />
    </div>
  );
}

// ------------------------------------------------------ 7 · availability

export function AvailabilityStep({ ctx, draft, set, onBack, onNext }: StepProps) {
  const c = ctx.opportunity;
  const confirmed = draft.dedicateTime && draft.onSchedule && draft.competitive && draft.originalWork;
  const githubOk = !c.needsGithubUsername || GITHUB_USERNAME.test(draft.githubUsername);
  const confirmations: { key: 'dedicateTime' | 'onSchedule' | 'competitive' | 'originalWork'; text: string }[] = [
    { key: 'dedicateTime', text: 'I can dedicate the required time' },
    { key: 'onSchedule', text: 'I can complete milestones on schedule' },
    { key: 'competitive', text: 'I understand this is a competitive project' },
    { key: 'originalWork', text: 'I agree to submit original work' },
  ];
  return (
    <div>
      <StepHeading
        eyebrow="Availability & Commitment"
        title="Confirm You Can Deliver"
        lede="This protects the competition from unreliable applicants."
        help={<HelpIcon topic="apply.availability" label="What is saved here" />}
      />
      <Figures
        className="mt-5"
        items={[
          { value: c.startsAtUtc ? utcDay(c.startsAtUtc) : '—', label: 'Starts', title: 'When the work starts' },
          { value: c.deadlineUtc ? utcDay(c.deadlineUtc) : '—', label: 'Final Delivery', title: 'The deadline' },
          { value: c.weeks ? `${c.weeks} wk` : '—', label: 'Duration', title: 'From the start to the deadline' },
        ]}
      />
      <Panel className="mt-5" title="I confirm">
        <ul className="flex flex-col gap-2">
          {confirmations.map((k) => (
            <li key={k.key} className="flex items-center gap-2">
              <Checkbox
                inputId={`confirm-${k.key}`}
                checked={draft[k.key]}
                onChange={(e) => set(k.key, !!e.checked)}
              />
              <label htmlFor={`confirm-${k.key}`} className="text-sm">
                {k.text}
              </label>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Panel>
          <fieldset>
            <legend className="font-semibold">Current Availability</legend>
            <div className="mt-2 flex flex-col gap-2">
              {COMMITMENTS.map((o) => (
                <div key={o.value} className="flex items-start gap-2">
                  <RadioButton
                    inputId={`commitment-${o.value}`}
                    name="commitment"
                    value={o.value}
                    checked={draft.commitment === o.value}
                    onChange={(e) => set('commitment', e.value)}
                  />
                  <label htmlFor={`commitment-${o.value}`} className="text-sm">
                    {o.label}
                    <span className="block text-xs text-[var(--text-color-secondary)]">{o.hint}</span>
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        </Panel>
        <Panel>
          <p id="apply-hours-label" className="font-semibold">
            Weekly Capacity
          </p>
          <Slider
            value={draft.hoursPerWeek}
            onChange={(e) => {
              const raw = Array.isArray(e.value) ? e.value[0] : e.value;
              set('hoursPerWeek', Math.min(80, Math.max(1, Math.round(raw))));
            }}
            min={1}
            max={80}
            step={1}
            pt={{ handle: { 'aria-labelledby': 'apply-hours-label' } }}
            className="mt-5 w-full"
          />
          <p className="mt-4 text-sm">
            <span className="text-2xl font-bold tabular-nums">{draft.hoursPerWeek}</span> hrs / week
          </p>
        </Panel>
      </div>
      <Panel className="mt-4">
        <ChipPicker
          label="Your competitive advantage"
          hint="What you would put beside your name on the client’s review row — pick what your profile supports."
          options={ctx.advantages.map((a) => ({ value: a.key, label: a.label, hint: a.label }))}
          value={draft.advantages}
          onChange={(next) => set('advantages', next)}
        />
      </Panel>
      {c.needsGithubUsername && (
        <Panel className="mt-4" title="Your repository">
          <label htmlFor="apply-gh-user" className="text-sm">
            GitHub username
            <HelpIcon topic="entry.githubUsername" label="GitHub username" />
          </label>
          <p className="text-xs text-[var(--text-color-secondary)]">
            Where the invitation to your private repository goes if you are selected.
          </p>
          <InputText
            id="apply-gh-user"
            value={draft.githubUsername}
            onChange={(e) => set('githubUsername', e.target.value)}
            placeholder="e.g. bilal-builds"
            className="mt-2 w-full sm:w-80"
            aria-invalid={draft.githubUsername.length > 0 && !githubOk}
          />
          {draft.githubUsername.length > 0 && !githubOk && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Letters, digits and single hyphens; up to 39 characters.
            </p>
          )}
        </Panel>
      )}
      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!confirmed || !githubOk}
        note={!confirmed ? 'Tick all four confirmations' : !githubOk ? 'A GitHub username is needed' : null}
      />
    </div>
  );
}

// ------------------------------------------------------------ 8 · review

export function ReviewStep({
  ctx,
  draft,
  onBack,
  onSubmit,
  busy,
  error,
  captchaSiteKey,
  onCaptcha,
  captchaToken,
}: Omit<StepProps, 'onNext' | 'set' | 'portal'> & {
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
  captchaSiteKey: string | null;
  onCaptcha: (token: string | null) => void;
  captchaToken: string | null;
}) {
  const c = ctx.opportunity;
  const fit = ctx.fit;
  const approachLength = draft.approach.trim().length;
  const checks = [
    { label: 'Profile complete', ok: draft.summary.trim().length > 0, blocking: false },
    { label: 'Requirements satisfied', ok: ctx.eligibility.canApply, blocking: true },
    { label: 'Portfolio attached', ok: draft.projectIds.length > 0, blocking: false },
    { label: 'Approach submitted', ok: approachLength >= MIN_APPROACH && approachLength <= MAX_APPROACH, blocking: true },
    { label: 'Availability confirmed', ok: draft.dedicateTime && draft.onSchedule && draft.hoursPerWeek >= 1, blocking: true },
    { label: 'Competition terms accepted', ok: draft.competitive && draft.originalWork, blocking: true },
  ];
  const githubOk = !c.needsGithubUsername || GITHUB_USERNAME.test(draft.githubUsername);
  const ready = checks.every((k) => k.ok || !k.blocking) && githubOk && (!captchaSiteKey || !!captchaToken);
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Competition', value: c.title },
    { label: 'Reward', value: formatAward(c.awardAmount, c.currency) },
    { label: 'Your Match', value: fit ? `${fit.match}%` : '—' },
    { label: 'MeritScore', value: fit ? String(fit.meritScore) : '—' },
    {
      label: 'Portfolio Submitted',
      value: `${draft.projectIds.length} ${draft.projectIds.length === 1 ? 'Project' : 'Projects'}`,
    },
    { label: 'Availability', value: `${draft.hoursPerWeek} hrs/week · ${commitmentLabel(draft.commitment)}` },
    { label: 'Expected Start', value: c.startsAtUtc ? utcDay(c.startsAtUtc) : 'On publishing' },
  ];
  if (c.needsGithubUsername) rows.push({ label: 'GitHub username', value: draft.githubUsername || '—' });

  return (
    <div>
      <StepHeading
        eyebrow="Final Review"
        title="Review Your Application"
        help={<HelpIcon topic="apply.review" label="What submitting does" />}
      />
      <Panel className="mt-5">
        <dl className="divide-y divide-[var(--surface-border)] text-sm">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[minmax(8rem,1fr)_2fr] gap-3 py-2.5">
              <dt className="text-[var(--text-color-secondary)]">{r.label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel className="mt-4" title="Final checklist">
        <Lines>
          {checks.map((k) => (
            <Line key={k.label} mark={k.ok ? 'ok' : k.blocking ? 'no' : 'todo'}>
              {k.label}
              {!k.ok && !k.blocking && (
                <span className="text-[var(--text-color-secondary)]"> — optional</span>
              )}
            </Line>
          ))}
        </Lines>
      </Panel>
      {captchaSiteKey && (
        <div className="mt-4">
          <CaptchaWidget siteKey={captchaSiteKey} onToken={onCaptcha} />
        </div>
      )}
      {error && <Message severity="error" text={error} className="mt-4 w-full" />}
      <StepNav
        onBack={onBack}
        onNext={onSubmit}
        nextLabel={captchaSiteKey && !captchaToken ? 'Complete the challenge above' : 'Submit Application'}
        nextIcon="pi pi-send"
        nextDisabled={!ready}
        busy={busy}
        note={ready ? 'Puts the application under review' : null}
      />
    </div>
  );
}
