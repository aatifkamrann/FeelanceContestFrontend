import { ordinal, standingLabel, type StandingBand, type StandingPart } from '@/lib/opportunities';

/**
 * The standing score as it reads in a row: the number out of 100, the
 * place, and the one-word reading. Plain markup, no PrimeReact — it renders
 * inside the server-rendered board as well as the client-side rail.
 */
export function StandingBadge({
  score,
  band,
  rank,
  of,
  size = 'sm',
}: {
  score: number;
  band: StandingBand;
  rank?: number | null;
  of?: number | null;
  size?: 'sm' | 'md';
}) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${size === 'md' ? 'text-base' : 'text-sm'}`}>
      <span className="font-semibold tabular-nums text-[var(--text-color)]">{score}</span>
      <BandPill band={band} />
      {rank != null && of != null && (
        <span className="text-xs text-[var(--text-color-secondary)]">
          {ordinal(rank)} of {of}
        </span>
      )}
    </span>
  );
}

/** The reading alone. Never red-for-new: "too early" wears no colour at all. */
export function BandPill({ band }: { band: StandingBand }) {
  const tone = {
    on_track: 'border-green-600/40 bg-green-500/10 text-green-700 dark:text-green-400',
    behind: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    at_risk: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
    too_early: 'border-[var(--surface-border)] text-[var(--text-color-secondary)]',
  }[band];
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {standingLabel(band)}
    </span>
  );
}

/**
 * The arithmetic, folded shut: what each part earned out of what it could,
 * and why. A part the portal cannot read yet says so instead of scoring a
 * zero — the whole point of showing the sums is that they can be argued with.
 */
export function StandingBreakdown({
  parts,
  score,
  nextStep,
  open = false,
}: {
  parts: StandingPart[];
  score: number;
  nextStep?: string | null;
  open?: boolean;
}) {
  const available = parts.reduce((sum, p) => sum + p.available, 0);
  const earned = parts.reduce((sum, p) => sum + p.earned, 0);
  return (
    <details className="mt-1 text-xs" open={open}>
      <summary className="cursor-pointer select-none text-[var(--text-color-secondary)] hover:text-[var(--text-color)]">
        Why {score}? — {earned} of {available} readable points
      </summary>
      <ul className="mt-1.5 flex flex-col gap-1 border-l-2 border-[var(--surface-border)] pl-2">
        {parts.map((p) => (
          <li key={p.key} className="flex flex-col">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-[var(--text-color)]">{p.label}</span>
              <span className="shrink-0 tabular-nums text-[var(--text-color-secondary)]">
                {p.available === 0 ? 'not readable yet' : `${p.earned} / ${p.available}`}
              </span>
            </span>
            <span className="text-[var(--text-color-secondary)]">{p.detail}</span>
          </li>
        ))}
      </ul>
      {nextStep && (
        <p className="mt-1.5 text-[var(--text-color)]">
          <i className="pi pi-arrow-up-right mr-1 text-[var(--primary-color)]" aria-hidden />
          {nextStep}
        </p>
      )}
    </details>
  );
}
