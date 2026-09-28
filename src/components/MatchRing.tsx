import { matchLabel, type OpportunityFitResult } from '@/lib/opportunities';

/**
 * The match at the top of a card: how well this freelancer matches the
 * brief, drawn as a ring with the number in it, and the word for it
 * beside. It is the fit's own arithmetic (see Assessment on the API) — the
 * four lines the opportunity page's entry box shows, averaged with the skills
 * counting double, and nought for an opportunity outside their kind of work —
 * so a card's ring, the page's assessment and the reasons beside either
 * can never disagree.
 */
const RING: Record<OpportunityFitResult['matchBand'], string> = {
  strong: 'text-green-600 dark:text-green-400',
  good: 'text-[var(--primary-color)]',
  moderate: 'text-amber-500 dark:text-amber-400',
  outside: 'text-red-500 dark:text-red-400',
};

const R = 20;
const C = 2 * Math.PI * R;

export default function MatchRing({ fit, className }: { fit: OpportunityFitResult; className?: string }) {
  const pct = Math.max(0, Math.min(100, fit.match));
  const colour = RING[fit.matchBand];
  return (
    <div
      className={`flex items-center gap-2.5${className ? ' ' + className : ''}`}
      title={`${pct}% match — ${matchLabel(fit.matchBand)}`}
    >
      <svg
        viewBox="0 0 48 48"
        className={`h-12 w-12 shrink-0 ${colour}`}
        role="img"
        aria-label={`${pct} percent match`}
      >
        <circle cx="24" cy="24" r={R} fill="none" stroke="var(--surface-border)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(C * pct) / 100} ${C}`}
          transform="rotate(-90 24 24)"
        />
        <text
          x="24"
          y="24"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-[var(--text-color)] text-[13px] font-bold tabular-nums"
        >
          {pct}%
        </text>
      </svg>
      <div className="leading-tight">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-color-secondary)]">
          Match
        </p>
        <p className={`text-sm font-semibold ${colour}`}>{matchLabel(fit.matchBand)}</p>
      </div>
    </div>
  );
}
