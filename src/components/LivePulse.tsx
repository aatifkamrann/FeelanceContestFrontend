import type { PulseState } from '@/lib/opportunities';

/**
 * The pulse at the top right of a card or row: whether the opportunity is
 * still taking entries and building (live, green), about to stop
 * (ending, orange — within three days of its joining date, or of its
 * deadline where there is no earlier one), or over for anybody looking
 * at it now (ended, red). The dot pulses; the word says which.
 */
const PULSE: Record<PulseState, { dot: string; text: string; word: string }> = {
  live: { dot: 'bg-green-600', text: 'text-green-700 dark:text-green-400', word: 'Live' },
  ending: { dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', word: 'Ending' },
  ended: { dot: 'bg-red-600', text: 'text-red-600 dark:text-red-400', word: 'Ended' },
};

export default function LivePulse({
  state,
  prefix,
  className,
}: {
  state: PulseState | null;
  /** What it is that is live, before the word: "Opportunity · Live", "Opportunity terminal · Live". */
  prefix?: string;
  className?: string;
}) {
  if (!state) return null;
  const p = PULSE[state];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${p.text}${className ? ' ' + className : ''}`}
    >
      <span className={`h-2 w-2 rounded-full ${p.dot} motion-safe:animate-pulse`} aria-hidden />
      {prefix ? prefix + ' · ' + p.word : p.word}
    </span>
  );
}
