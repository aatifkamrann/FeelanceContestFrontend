'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import HelpIcon from '@/components/HelpIcon';
import {
  applicationQuery,
  statusLabel,
  strengthRange,
  type ApplicationAdvice,
  type ApplicationOutcome,
  type ApplicationView,
  type ApplyContext,
} from '@/lib/applications';
import { usesRepo } from '@/lib/opportunities';
import { feedHref } from '@/lib/feed';
import { Line, Lines, Panel } from './kit';

/**
 * After the last step: the application is filed, and this is where it
 * stands. The pipeline and the portal's evaluation, with the model's words
 * as they land, then a panel that follows the decision: how the
 * application compares with the field while it is under review, the field
 * and the start once selected, and what to strengthen once not. Read again
 * every few seconds while the words are still coming, then left alone.
 */
export default function Submitted({
  slug,
  application: initial,
  opportunity,
  portal,
}: {
  slug: string;
  application: ApplicationView;
  opportunity: ApplyContext['opportunity'];
  portal: string;
}) {
  const { data } = useQuery({
    ...applicationQuery(initial.id),
    initialData: initial,
    refetchInterval: (query) => (query.state.data?.evaluation.status === 'pending' ? 2500 : false),
  });
  const a = data ?? initial;
  const ev = a.evaluation;
  // Under review on an opportunity that has moved on: nobody will answer it now.
  const closed = a.closedUndecided;
  const lede =
    a.status === 'selected'
      ? SELECTED_LEDE[a.outcome ?? 'open']
      : a.status === 'not_selected'
        ? 'The client did not select your application this time.'
        : a.status === 'removed'
          ? 'You were selected, then removed from the opportunity.'
          : a.status === 'withdrawn'
            ? 'You were selected, then withdrew from the opportunity.'
            : closed
              ? 'The opportunity closed before the client decided on your application.'
              : 'You are now under evaluation. Expected review within 24 hours.';
  const icon =
    a.status === 'removed'
      ? 'pi-ban text-red-600 dark:text-red-400'
      : a.status === 'selected' && a.outcome === 'won'
        ? 'pi-trophy text-[var(--primary-color)]'
        : a.status === 'not_selected' || (a.status === 'selected' && a.outcome === 'lost')
          ? 'pi-flag text-[var(--text-color-secondary)]'
          : a.status === 'selected' && a.outcome === 'cancelled'
            ? 'pi-ban text-[var(--text-color-secondary)]'
            : a.status === 'withdrawn'
              ? 'pi-sign-out text-[var(--text-color-secondary)]'
              : closed
                ? 'pi-lock text-[var(--text-color-secondary)]'
                : 'pi-check-circle text-green-700 dark:text-green-400';

  return (
    <div>
      <div className="text-center">
        <i
          className={`pi text-6xl ${icon}`}
          role="img"
          aria-label={closed ? 'Opportunity closed' : statusLabel(a.status)}
        />
        <h1 className="mt-4 text-3xl font-bold">
          {a.status !== 'under_review' ? statusLabel(a.status) : closed ? 'Opportunity Closed' : 'Application Submitted'}
        </h1>
        <p className="mt-2 text-[var(--text-color-secondary)]">
          {lede}
          <HelpIcon topic="apply.status" label="What happens next" />
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Panel title="Status">
          <Lines>
            {a.stages.map((s) => (
              <Line key={s.key} mark={s.state === 'done' ? 'ok' : s.state === 'current' ? 'current' : 'todo'}>
                {s.label}
              </Line>
            ))}
          </Lines>
        </Panel>

        <Panel tone="accent">
          <p className="portal-note-name">
            <span aria-hidden>✦</span> {portal}
            <HelpIcon topic="apply.evaluation" label="How this is read" />
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
            <span className="text-4xl font-bold tabular-nums text-[var(--primary-color)]">{ev.percent}%</span>
            {/* Green from a qualified match up; amber below it and outside their usual work. */}
            <span
              className={`font-semibold ${
                ev.percent >= 60 ? 'text-green-700 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {ev.band}
            </span>
          </p>
          {ev.strengths.length > 0 && (
            <>
              <p className="mt-3 text-sm font-semibold">Strengths</p>
              <Lines className="mt-1">
                {ev.strengths.map((l) => (
                  <Line key={l.id} mark="ok">
                    {l.text}
                  </Line>
                ))}
              </Lines>
            </>
          )}
          {ev.risks.length > 0 && (
            <>
              <p className="mt-3 text-sm font-semibold">Risks</p>
              <Lines className="mt-1">
                {ev.risks.map((l) => (
                  <Line key={l.id} mark="warn">
                    {l.text}
                  </Line>
                ))}
              </Lines>
            </>
          )}
          {ev.note && <p className="mt-3 text-sm">{ev.note}</p>}
          <p className="mt-3 text-xs text-[var(--text-color-secondary)]">
            {ev.status === 'pending' ? (
              <>
                <i className="pi pi-spinner pi-spin mr-1" aria-hidden />
                Putting the evaluation into words — the figures above are already final.
              </>
            ) : ev.worded ? (
              <>
                <i className="pi pi-sparkles mr-1" aria-hidden />
                Worded by AI{ev.provider && ev.provider !== 'local' ? ` · ${ev.provider}` : ''} — the figures
                are the portal’s own arithmetic.
              </>
            ) : (
              'The portal’s own reading — the figures are arithmetic over your profile and the brief.'
            )}
          </p>
        </Panel>

        {a.status === 'selected' ? (
          <SelectedPanel slug={slug} opportunity={opportunity} outcome={a.outcome ?? 'open'} />
        ) : a.status === 'not_selected' ? (
          <NotSelectedPanel advice={a.advice} category={opportunity.category} />
        ) : a.status === 'removed' ? (
          <RemovedPanel />
        ) : a.status === 'withdrawn' ? (
          <WithdrawnPanel category={opportunity.category} />
        ) : closed ? (
          <ClosedPanel category={opportunity.category} />
        ) : (
          <Panel title="Your application strength">
            <p
              className={`inline-block rounded-md px-2 py-0.5 text-sm font-semibold ${
                a.strongerThan !== null && a.strongerThan >= 50
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-[var(--surface-hover)]'
              }`}
            >
              {strengthRange(a.strongerThan)}
            </p>
            <p className="mt-2 text-sm">
              {a.strongerThan === null
                ? 'Nobody else has applied yet, so there is nobody to compare with.'
                : `Your application is stronger than ${a.strongerThan}% of applicants.`}
            </p>
            <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
              Compared by the match figure at the moment each applicant applied — {a.match}% for yours.
            </p>
          </Panel>
        )}

        <Panel title="What was sent">
          <dl className="text-sm">
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-[var(--text-color-secondary)]">Portfolio</dt>
              <dd className="font-medium">
                {a.portfolio.length} {a.portfolio.length === 1 ? 'project' : 'projects'}
              </dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-[var(--text-color-secondary)]">Availability</dt>
              <dd className="font-medium">{a.hoursPerWeek} hrs/week</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-[var(--text-color-secondary)]">MeritScore</dt>
              <dd className="font-medium tabular-nums">{a.meritScore}</dd>
            </div>
          </dl>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-[var(--primary-color)]">Read your approach</summary>
            <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{a.approach}</p>
          </details>
        </Panel>
      </div>

      {/* The decision's own panel carries the way on; these are the other ways. */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {a.status !== 'selected' && (
          <Link href={`/opportunities/${slug}`} className="no-underline">
            <Button label="Open the opportunity" icon="pi pi-flag" outlined={a.status !== 'under_review' || closed} />
          </Link>
        )}
        {a.status !== 'not_selected' && (
          <Link href="/opportunities" className="no-underline">
            <Button label="Browse opportunities" icon="pi pi-search" outlined />
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Removed: the one final answer. The reason is not repeated here — it was
 * emailed word for word and stays beside the entry on My Opportunities, with
 * how long the repository can still be cloned.
 */
function RemovedPanel() {
  return (
    <Panel tone="bad">
      <p className="text-lg font-bold">Removed from the competition</p>
      <p className="mt-2 text-sm">
        The client took your entry off this opportunity. Their reason was emailed to you word for word, and it stays
        on My Opportunities beside the entry, with how long you can still clone your work. Every other opportunity is
        unaffected.
      </p>
      <Link href="/entries" className="mt-4 inline-block no-underline">
        <Button label="Open My Opportunities" icon="pi pi-arrow-right" iconPos="right" outlined />
      </Link>
    </Panel>
  );
}

/** "September 15" — with the year only when it is not this one — in UTC, like every date on an opportunity. */
function startDay(iso: string): string {
  const at = new Date(iso);
  const thisYear = at.getUTCFullYear() === new Date().getUTCFullYear();
  return at.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

/** The line under "Selected", by how the competition went. */
const SELECTED_LEDE: Record<ApplicationOutcome, string> = {
  open: 'You were selected — you are in the opportunity.',
  reviewing: 'You were selected, and the competition is now in review.',
  won: 'You were selected, and your entry won.',
  lost: 'You were selected; the award went to another entrant.',
  cancelled: 'You were selected; the client then cancelled the opportunity.',
};

/**
 * Selected: what the selection came to. While the opportunity runs, how many
 * are in and when it starts, and the way to the opportunity page — where the
 * repository or the file list, the milestones and the board are. Once it
 * has moved on, how it went: in review, won, lost to another entrant, or
 * cancelled — never a "Congratulations!" left standing over an opportunity that
 * ended otherwise.
 */
function SelectedPanel({
  slug,
  opportunity,
  outcome,
}: {
  slug: string;
  opportunity: ApplyContext['opportunity'];
  outcome: ApplicationOutcome;
}) {
  const repo = usesRepo(opportunity.delivery);
  const keeps = repo
    ? 'Your repository is archived and read-only — everything in it stays yours.'
    : 'Your files stay yours.';
  if (outcome === 'reviewing')
    return (
      <Panel>
        <p className="text-lg font-bold">Competition in Review</p>
        <p className="mt-2 text-sm">
          The deadline has passed and your work is frozen as it stood. The client is reviewing every entry, and you
          are emailed the result either way.
        </p>
        <OpportunityButton slug={slug} />
      </Panel>
    );
  if (outcome === 'won')
    return (
      <Panel tone="good">
        <p className="text-lg font-bold">You Won!</p>
        <p className="mt-2 text-sm">
          The client chose your entry. They pay you directly, then confirm it on the opportunity page
          {repo ? ' — and that confirmation starts your repository’s transfer to them' : ''}.
        </p>
        <OpportunityButton slug={slug} severity="success" />
      </Panel>
    );
  if (outcome === 'lost')
    return (
      <Panel>
        <p className="text-lg font-bold">Competition Complete</p>
        <p className="mt-2 text-sm">The award went to another entrant. {keeps}</p>
        <SimilarButton category={opportunity.category} />
      </Panel>
    );
  if (outcome === 'cancelled')
    return (
      <Panel>
        <p className="text-lg font-bold">Competition Cancelled</p>
        <p className="mt-2 text-sm">
          The client cancelled this opportunity before choosing a winner, so your entry is void. {keeps} Their reason is
          on the opportunity page.
        </p>
        <SimilarButton category={opportunity.category} />
      </Panel>
    );

  const n = opportunity.entrantCount;
  const field =
    n > 1
      ? `You have been selected as one of ${n} competitors.`
      : n === 1
        ? 'You have been selected as the first competitor.'
        : 'You have been selected to compete.';
  const starts = opportunity.startsAtUtc;
  const when = !starts
    ? ''
    : new Date(starts).getTime() > Date.now()
      ? ` Competition begins ${startDay(starts)}.`
      : ` Competition began ${startDay(starts)}.`;
  return (
    <Panel tone="good">
      <p className="text-lg font-bold">Congratulations!</p>
      <p className="mt-2 text-sm">
        {field}
        {when}
      </p>
      <Link href={`/opportunities/${slug}`} className="mt-4 inline-block no-underline">
        <Button label="Enter Competition Workspace" icon="pi pi-arrow-right" iconPos="right" severity="success" />
      </Link>
    </Panel>
  );
}

/** The way back to the opportunity page, from a panel. */
function OpportunityButton({ slug, severity }: { slug: string; severity?: 'success' }) {
  return (
    <Link href={`/opportunities/${slug}`} className="mt-4 inline-block no-underline">
      <Button label="Open the Opportunity" icon="pi pi-arrow-right" iconPos="right" severity={severity} />
    </Link>
  );
}

/** Opportunities, filtered to the opportunity's kind of work where it has one. */
function SimilarButton({ category }: { category: string | null }) {
  return (
    <Link
      href={feedHref({ category })}
      className="mt-4 inline-block no-underline"
    >
      <Button label="View Similar Opportunities" icon="pi pi-arrow-right" iconPos="right" />
    </Link>
  );
}

/** Withdrawn: the entrant's own answer on this opportunity, and a final one. */
function WithdrawnPanel({ category }: { category: string | null }) {
  return (
    <Panel>
      <p className="text-lg font-bold">You Withdrew</p>
      <p className="mt-2 text-sm">
        You took your entry off this opportunity, so it no longer counts and its place is free. Withdrawing is final — a
        freelancer applies to an opportunity once — and every other opportunity is unaffected.
      </p>
      <SimilarButton category={category} />
    </Panel>
  );
}

/** Closed undecided: the opportunity ended before the client answered, which is not a no. */
function ClosedPanel({ category }: { category: string | null }) {
  return (
    <Panel>
      <p className="text-lg font-bold">Closed Before a Decision</p>
      <p className="mt-2 text-sm">
        The client did not decide on this application before the opportunity closed, so nothing more happens to it. It
        was not turned down, and it is not held against you.
      </p>
      <SimilarButton category={category} />
    </Panel>
  );
}

/**
 * Not selected: what held up and what to strengthen, as the API read them
 * off the evaluation, and the way to more opportunities of the same kind.
 */
function NotSelectedPanel({ advice, category }: { advice: ApplicationAdvice | null; category: string | null }) {
  const strong = advice?.strong ?? [];
  const improve = advice?.improve ?? [];
  return (
    <Panel>
      <p className="text-lg font-bold">
        Competition Selection Complete
        <HelpIcon topic="apply.advice" label="How this is read" />
      </p>
      <p className="mt-2 text-sm">
        You were not selected this time. Here is how to strengthen your next application.
      </p>
      {strong.length > 0 && (
        <>
          <p className="mt-3 text-sm font-semibold">Strong</p>
          <Lines className="mt-1">
            {strong.map((s) => (
              <Line key={s} mark="ok">
                {s}
              </Line>
            ))}
          </Lines>
        </>
      )}
      <p className="mt-3 text-sm font-semibold">Improve</p>
      {improve.length > 0 ? (
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm">
          {improve.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          Nothing in this application read weak — keep applying to opportunities like this one.
        </p>
      )}
      <Link
        href={feedHref({ category })}
        className="mt-4 inline-block no-underline"
      >
        <Button label="View Similar Opportunities" icon="pi pi-arrow-right" iconPos="right" />
      </Link>
    </Panel>
  );
}
