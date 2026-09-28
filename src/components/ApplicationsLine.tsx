import { closesIn, pulseState, type PulseState } from '@/lib/opportunities';

/** The words' colour once an opportunity is not simply live: the pulse's orange, then its red. */
const TONE: Record<Exclude<PulseState, 'live'>, string> = {
  ending: 'text-orange-600 dark:text-orange-400',
  ended: 'text-red-600 dark:text-red-400',
};

/**
 * One line under an opportunity's description, the same on a card, a row and
 * the opportunity page: how many have applied at the left, and when
 * applications close at the right. The countdown reads the clock the
 * pulse reads — the last joining date, or the deadline where there is no
 * earlier one — so the two never disagree. While the opportunity is live the
 * time is bold; once it is ending or over, the words are bold in the
 * pulse's colour.
 *
 * No hooks, so a server page renders it as well as a client card. The
 * countdown is read at render and not ticked: it moves by the hour, and a
 * render and its hydration can straddle a minute, which is the one
 * difference the hydration warning is told to let pass.
 */
export default function ApplicationsLine({
  opportunity,
  className = '',
}: {
  opportunity: {
    status: string;
    applicationCount: number;
    deadlineUtc: string | null;
    entryCloseUtc?: string | null;
    entryOpen?: boolean;
  };
  className?: string;
}) {
  const state = pulseState(opportunity);
  const n = opportunity.applicationCount;
  const left = closesIn(opportunity.entryCloseUtc ?? opportunity.deadlineUtc);
  // Words in place of a countdown once there is nothing left to count.
  const words =
    opportunity.status === 'cancelled'
      ? 'cancelled'
      : opportunity.status !== 'open'
        ? 'closed'
        : !left || opportunity.entryOpen === false
          ? 'applications closed'
          : null;

  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm ${className}`}>
      <span className="text-[var(--text-color-secondary)]">
        <span className="font-semibold tabular-nums text-[var(--text-color)]">{n}</span>{' '}
        {n === 1 ? 'application' : 'applications'}
      </span>
      {/* A draft has no clock at all. */}
      {state !== null && (
        <span
          className={state === 'live' ? 'text-[var(--text-color-secondary)]' : `font-semibold ${TONE[state]}`}
          suppressHydrationWarning
        >
          {words ?? (
            <>
              closes{' '}
              <span
                className={`font-semibold tabular-nums ${state === 'live' ? 'text-[var(--text-color)]' : ''}`}
                suppressHydrationWarning
              >
                {left}
              </span>
            </>
          )}
        </span>
      )}
    </div>
  );
}
