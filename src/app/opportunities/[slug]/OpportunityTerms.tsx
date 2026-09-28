import OpportunityFacts from '@/components/OpportunityFacts';
import HelpIcon from '@/components/HelpIcon';
import {
  timelineWeeks,
  utcMoment,
  type OpportunityCriterion,
  type OpportunityFitResult,
  type OpportunityMilestone,
  type OpportunityRequirement,
} from '@/lib/opportunities';

/**
 * The terms beside the brief, as the opportunity page's tabs show them:
 * requirements, milestones, evaluation and eligibility. Free of hooks, so
 * the server-rendered page can build the tab bodies from the fetched
 * opportunity and hand them to the client-side tab strip already rendered.
 */

/** One rounded panel inside a tab — a heading and its rows, so two lists on one tab read as two. */
export function TermsPanel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-ground)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The Requirements tab: the technical table, then the required skills as the chips the card wears. */
export function RequirementsTab({
  requirements,
  skills,
  requiresCompose = false,
}: {
  requirements: OpportunityRequirement[];
  skills: string[];
  /** Entries must run with Docker Compose — stated with the technical table, where an entrant reads the rules. */
  requiresCompose?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TermsPanel title="Technical requirements">
        {requiresCompose && (
          <p className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-ground)] p-3 text-sm">
            <i className="pi pi-box mt-0.5 text-[var(--primary-color)]" aria-hidden />
            <span>
              <span className="font-medium">Entries must run with Docker Compose.</span> Keep a{' '}
              <code>compose.yaml</code> at the root of your repository: every milestone you claim is built from
              it, and the board shows whether it built. A failed build still counts as the claim, but lowers your
              standing until the next one builds. The client can run a built milestone, and your final version
              after the deadline: put the test logins and what to try in a <code>PREVIEW.md</code> beside it, and
              if more than one service publishes a port, name the one to open there with a line{' '}
              <code>Service: web</code>.
            </span>
          </p>
        )}
        {requirements.length === 0 ? (
          <p className="text-sm text-[var(--text-color-secondary)]">
            The client set no technical requirements — the brief is the whole specification.
          </p>
        ) : (
          <dl className="grid grid-cols-[minmax(6rem,max-content)_1fr] gap-x-6 gap-y-2 text-sm">
            {requirements.map((r, i) => (
              // A fragment per row: the grid lays the pair out as one line.
              <div key={i} className="contents">
                <dt className="font-medium">{r.title}</dt>
                <dd className="m-0 text-[var(--text-color-secondary)]">{r.detail}</dd>
              </div>
            ))}
          </dl>
        )}
      </TermsPanel>
      <TermsPanel title="Required skills">
        {skills.length === 0 ? (
          <p className="text-sm text-[var(--text-color-secondary)]">
            No required skills — any member may enter.
          </p>
        ) : (
          <OpportunityFacts categoryLabel={null} subcategoryLabel={null} skills={skills} minMeritScore={0} />
        )}
      </TermsPanel>
    </div>
  );
}

/**
 * The Milestones tab: one highlighted box per milestone, its share of the
 * work at the top right where the checklist states shares.
 */
export function MilestonesTab({ milestones, dated }: { milestones: OpportunityMilestone[]; dated: boolean }) {
  const shared = milestones.some((m) => m.weightPercent != null);
  return (
    <>
      <p className="text-sm text-[var(--text-color-secondary)]">
        This list becomes every entrant&apos;s progress board.
        {shared && ' The percentage is each milestone’s share of the work.'}
      </p>
      <ol className="mt-3 flex flex-col gap-3">
        {milestones.map((m, i) => (
          <li
            key={i}
            className="relative flex gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-ground)] p-4"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-color)] text-xs font-bold text-[var(--primary-color-text)]">
              {i + 1}
            </span>
            <div className={m.weightPercent != null ? 'min-w-0 flex-1 pr-14' : 'min-w-0 flex-1'}>
              <p className="font-medium">{m.title}</p>
              {m.description && (
                <p className="text-sm text-[var(--text-color-secondary)]">{m.description}</p>
              )}
              {/* The date closes every box, so the eye finds it in the same
                  place on each — and a milestone without one says so
                  rather than leaving the line off. */}
              <p className="mt-0.5 text-sm text-[var(--text-color-secondary)]">
                <i className="pi pi-calendar mr-1" aria-hidden />
                {m.dueUtc ? `Due by ${utcMoment(m.dueUtc)}` : 'No due date'}
              </p>
            </div>
            {m.weightPercent != null && (
              <span
                className="absolute right-3 top-3 rounded-full bg-[color-mix(in_srgb,var(--primary-color)_12%,transparent)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--primary-color)]"
                title={`${m.weightPercent}% of the work`}
              >
                {m.weightPercent}%
              </span>
            )}
          </li>
        ))}
      </ol>
      {dated && (
        <p className="mt-4 border-t border-[var(--surface-border)] pt-3 text-sm text-[var(--text-color-secondary)]">
          A milestone claimed on or before its date counts as on time; after it, late. The board is
          ordered by that.
          <HelpIcon topic="opportunity.standing" label="How the board is ordered" />
        </p>
      )}
    </>
  );
}

/**
 * The Evaluation tab: the sentence that names the total, then the rubric's
 * lines. The analysis is named after the portal — "automated Winners Portal
 * AI analysis" — because that is what the AI review here is called.
 */
export function EvaluationTab({ criteria, portalName }: { criteria: OpportunityCriterion[]; portalName: string }) {
  const total = criteria.reduce((sum, c) => sum + c.points, 0);
  if (criteria.length === 0)
    return (
      <p className="text-sm text-[var(--text-color-secondary)]">
        The client set no scoring rubric. The winner is chosen by the client after reading every
        entry, with the AI review as one input.
      </p>
    );
  return (
    <TermsPanel
      title="Scoring rubric"
      aside={<span className="text-sm tabular-nums text-[var(--text-color-secondary)]">{total} points</span>}
    >
      <p className="text-sm text-[var(--text-color-secondary)]">
        Submissions are scored on a {total}-point rubric combining automated {portalName} AI
        analysis with the client&apos;s review. The highest composite score wins.
      </p>
      <ol className="mt-3 flex flex-col divide-y divide-[var(--surface-border)]">
        {criteria.map((c, i) => (
          <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-x-4 py-2.5 first:pt-0 last:pb-0">
            <span className="whitespace-nowrap font-semibold tabular-nums text-[var(--primary-color)]">
              {c.points} pts
            </span>
            <div className="min-w-0">
              <p className="font-medium">{c.title}</p>
              {c.description && (
                <p className="text-sm text-[var(--text-color-secondary)]">{c.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </TermsPanel>
  );
}

/**
 * The Eligibility tab: the door, in five lines. Two of them are this
 * opportunity's own terms — the merit floor and the category — and the
 * timeline is its dates; the other two are the portal's rules for every
 * opportunity. A freelancer's own fit marks the lines the door checks.
 */
export function EligibilityTab({
  minMeritScore,
  categoryLabel,
  timelineFromUtc,
  deadlineUtc,
  fit,
}: {
  minMeritScore: number;
  categoryLabel: string | null;
  /** Where the timeline counts from — the start of the work, so the weeks match the card's figure. */
  timelineFromUtc: string | null;
  deadlineUtc: string | null;
  fit: OpportunityFitResult | null;
}) {
  const weeks = timelineWeeks(timelineFromUtc, deadlineUtc);
  const rows: { title: string; detail: string; met: boolean | null; note?: string }[] = [
    {
      title: 'Merit score',
      detail:
        minMeritScore > 0
          ? `Minimum ${minMeritScore} required to enter this opportunity`
          : 'No minimum — the client set no merit floor',
      met: fit ? fit.meritOk : null,
      note: fit && minMeritScore > 0 ? `yours is ${fit.meritScore}` : undefined,
    },
    {
      title: 'Verification',
      detail: 'A confirmed account, and the required skills listed on your profile',
      met: fit ? fit.skillsOk : null,
      note:
        fit && !fit.skillsOk && fit.missingSkills.length > 0
          ? `missing ${fit.missingSkills.join(', ')}`
          : undefined,
    },
    {
      title: 'Category rank',
      detail: categoryLabel
        ? `Top 500 in ${categoryLabel} (primary category) preferred`
        : 'A rank in the opportunity’s category preferred',
      met: null,
    },
    {
      title: 'Availability',
      detail: weeks
        ? `Must confirm availability for the full ${weeks}-week timeline`
        : 'Must confirm availability for the full timeline',
      met: null,
    },
    {
      title: 'Standing',
      detail: 'No active disputes or policy violations',
      met: null,
    },
  ];
  return (
    <TermsPanel title="Eligibility criteria">
      <ul className="flex flex-col gap-2.5 text-sm">
        {rows.map((r) => (
          <li key={r.title} className="flex items-start gap-2.5">
            {/* A tick for the rule; a cross only where the viewer's own
                fit says this door is shut to them. */}
            <i
              className={`pi mt-0.5 ${
                r.met === false
                  ? 'pi-times-circle text-red-600 dark:text-red-400'
                  : 'pi-check-circle text-[var(--primary-color)]'
              }`}
              aria-label={r.met === false ? 'not met' : r.met ? 'met' : undefined}
              aria-hidden={r.met === null}
            />
            <span className="min-w-0">
              <span className="font-medium">{r.title}</span>
              <span className="text-[var(--text-color-secondary)]"> — {r.detail}</span>
              {r.note && (
                <span className={r.met === false ? ' text-red-600 dark:text-red-400' : ' text-[var(--text-color-secondary)]'}>
                  {' '}
                  ({r.note})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </TermsPanel>
  );
}
