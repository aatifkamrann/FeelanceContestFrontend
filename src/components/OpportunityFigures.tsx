import { count, formatAward, timeLeftFigure, utcMoment } from '@/lib/opportunities';

/**
 * The opportunity in four figures, in one box over the brief: what the award
 * is, how long is left, how many are in, how many milestones there are.
 * Free of hooks, so the server-rendered page and the draft editor's
 * preview wear the same box.
 */
export default function OpportunityFigures({
  awardAmount,
  currency,
  deadlineUtc,
  status,
  entrantCount,
  maxEntries = null,
  milestoneCount,
  className = '',
}: {
  awardAmount: number;
  currency: string;
  deadlineUtc: string | null;
  status: string;
  entrantCount: number;
  /** The cap on entries, where the portal sets one — the slots read "3/10". */
  maxEntries?: number | null;
  milestoneCount: number;
  className?: string;
}) {
  // A cancelled opportunity has no clock: nothing closes any more.
  const cancelled = status === 'cancelled';
  const left = cancelled ? '' : timeLeftFigure(deadlineUtc);
  const timeline = cancelled || !deadlineUtc ? '—' : left || 'Closed';
  const timelineTitle = cancelled
    ? 'The opportunity was cancelled'
    : !deadlineUtc
      ? 'No deadline set'
      : left
        ? `Deadline ${utcMoment(deadlineUtc)}`
        : `The deadline passed on ${utcMoment(deadlineUtc)}`;
  const slots = maxEntries ? `${entrantCount}/${maxEntries}` : String(entrantCount);
  const slotsTitle = maxEntries
    ? `${count(entrantCount, 'entrant')} of ${maxEntries} places`
    : count(entrantCount, 'entrant');

  return (
    <div
      role="group"
      aria-label="The opportunity in figures"
      className={`grid grid-cols-2 gap-4 rounded-xl border border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)] p-4 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-[var(--surface-border)] sm:[&>*+*]:pl-4 ${className}`}
    >
      <Figure value={formatAward(awardAmount, currency)} label="Guaranteed" title="The fixed award, paid to the winner" accent />
      <Figure value={timeline} label="Timeline" title={timelineTitle} />
      <Figure value={slots} label="Slots" title={slotsTitle} />
      <Figure value={String(milestoneCount)} label="Milestones" title={count(milestoneCount, 'milestone')} />
    </div>
  );
}

function Figure({
  value,
  label,
  title,
  accent = false,
}: {
  value: string;
  label: string;
  /** The figure in words, for the pointer and the screen reader. */
  title: string;
  accent?: boolean;
}) {
  return (
    <div title={title} aria-label={`${label}: ${title}`}>
      <p
        className={`text-2xl font-bold leading-tight tabular-nums ${accent ? 'text-[var(--primary-color)]' : ''}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs uppercase tracking-wide text-[var(--text-color-secondary)]">{label}</p>
    </div>
  );
}
