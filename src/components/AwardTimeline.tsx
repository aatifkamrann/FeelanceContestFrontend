import { opportunityDuration, formatAward, timelineFigure, utcDay } from '@/lib/opportunities';

const LABEL = 'text-xs font-normal uppercase tracking-wide text-[var(--text-color-secondary)]';

/**
 * The two figures an opportunity card leads with: the award the winner is
 * guaranteed and how long the opportunity runs — "$5,000 Guaranteed",
 * "10 wk Timeline" — in the words of the opportunity page's figures box.
 * "inline" sits on one line over a card's title; "stacked" is the right-hand
 * column of a list row. The timeline is left out without a deadline.
 */
export default function AwardTimeline({
  awardAmount,
  currency,
  fromUtc,
  deadlineUtc,
  layout = 'inline',
  className = '',
}: {
  awardAmount: number;
  currency: string;
  /** Where the timeline counts from — timelineFrom(); null for now. */
  fromUtc: string | null;
  deadlineUtc: string | null;
  layout?: 'inline' | 'stacked';
  className?: string;
}) {
  const award = formatAward(awardAmount, currency);
  const timeline = timelineFigure(fromUtc, deadlineUtc);
  const runs = opportunityDuration(fromUtc ?? new Date().toISOString(), deadlineUtc);
  const timelineTitle =
    runs && deadlineUtc ? `Runs ${runs}, to the deadline on ${utcDay(deadlineUtc)}` : undefined;

  if (layout === 'stacked') {
    return (
      <div className={`flex gap-5 text-right ${className}`}>
        <div>
          <p className="text-xl font-bold text-[var(--primary-color)]">{award}</p>
          <p className={LABEL}>Guaranteed</p>
        </div>
        {timeline && (
          <div title={timelineTitle}>
            <p className="text-xl font-bold tabular-nums text-[var(--text-color)]">{timeline}</p>
            <p className={LABEL}>Timeline</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${className}`}>
      <p className="text-xl font-bold text-[var(--primary-color)]">
        {award}
        <span className={`ml-2 ${LABEL}`}>Guaranteed</span>
      </p>
      {timeline && (
        <p
          className="whitespace-nowrap text-base font-semibold tabular-nums text-[var(--text-color)]"
          title={timelineTitle}
        >
          {timeline}
          <span className={`ml-2 ${LABEL}`}>Timeline</span>
        </p>
      )}
    </div>
  );
}
