'use client';

import { Tag } from 'primereact/tag';
import HelpIcon from '@/components/HelpIcon';
import { bandSeverity, type Merit, type MeritPart } from '@/lib/profile';

/**
 * The merit score with its whole arithmetic on show. Every point has a line
 * and every line says what it was for — a score whose sums are hidden is one
 * nobody can argue with, and this one should be arguable.
 */
export default function MeritPanel({ merit, own }: { merit: Merit; own: boolean }) {
  const severity = bandSeverity(merit.band);
  return (
    <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">
          Merit score
          <HelpIcon topic="profile.merit" label="How the merit score works" />
        </h2>
        <span className="text-3xl font-bold text-[var(--primary-color)]">{merit.score}</span>
        <span className="text-[var(--text-color-secondary)]">of {merit.max}</span>
        {severity ? (
          <Tag value={merit.band} severity={severity} rounded />
        ) : (
          <Tag
            value={merit.band}
            rounded
            style={{ background: 'var(--surface-border)', color: 'var(--text-color-secondary)' }}
          />
        )}
      </div>
      <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
        {own
          ? 'What a client can lean on when they read about you. It keeps you out only of an opportunity whose client set a higher minimum, and it orders the leaderboard; it never picks a winner — the work you hand in does.'
          : 'What this member has said about themselves, and what the portal watched them do. It shuts a door only where an opportunity sets a minimum merit score, and it never picks a winner — the work they hand in does.'}
      </p>

      <Half
        title="Portfolio"
        note={`Self-reported, and capped at ${merit.portfolio.available} for that reason: anyone can type anything.`}
        earned={merit.portfolio.earned}
        available={merit.portfolio.available}
        parts={merit.portfolio.parts}
      />
      <Half
        title="Track record"
        note="Earned here, on rows this member cannot write."
        earned={merit.record.earned}
        available={merit.record.available}
        parts={merit.record.parts}
      />
    </section>
  );
}

function Half({
  title,
  note,
  earned,
  available,
  parts,
}: {
  title: string;
  note: string;
  earned: number;
  available: number;
  parts: MeritPart[];
}) {
  return (
    <div className="mt-5 border-t border-[var(--surface-border)] pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{title}</p>
        <p className="text-sm tabular-nums text-[var(--text-color-secondary)]">
          {earned} of {available}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-[var(--text-color-secondary)]">{note}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {parts.map((p) => {
          // Nothing available means the portal cannot offer this part to
          // anybody — a switched-off feature, not a gap in this person. It
          // says so instead of reading 0 / 0, and it is out of the totals
          // either side of it, so the half above still adds up.
          const offered = p.available > 0;
          return (
            <li key={p.label}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium">{p.label}</span>
                <span
                  className={`text-sm tabular-nums ${
                    !offered || p.earned === 0
                      ? 'text-[var(--text-color-secondary)]'
                      : p.earned === p.available
                        ? 'font-semibold text-[var(--primary-color)]'
                        : ''
                  }`}
                >
                  {offered ? `${p.earned} / ${p.available}` : 'not available on this portal'}
                </span>
              </div>
              {/* A bar, so a column of fractions reads as a shape at a glance. */}
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]"
                role="img"
                aria-label={offered ? `${p.earned} of ${p.available} points` : 'Not available on this portal'}
              >
                <div
                  className="h-full rounded-full bg-[var(--primary-color)]"
                  style={{ width: offered ? `${Math.round((100 * p.earned) / p.available)}%` : '0%' }}
                />
              </div>
              <p className="mt-1 text-xs text-[var(--text-color-secondary)]">{p.detail}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
