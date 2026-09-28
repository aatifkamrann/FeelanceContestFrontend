'use client';

import { Button } from 'primereact/button';

/**
 * The pieces every step is built from: the three-line heading, the row of
 * figures the opportunity page wears, a bordered panel in one of five tones,
 * a line with a mark in front of it, a meter, and the Back / Continue row.
 */

export function StepHeading({
  eyebrow,
  title,
  lede,
  help,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  help?: React.ReactNode;
}) {
  return (
    <header>
      {eyebrow && (
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--primary-color)]">{eyebrow}</p>
      )}
      <h1 className="mt-1 text-2xl font-bold [text-wrap:balance]">
        {title}
        {help}
      </h1>
      {lede && <p className="mt-2 max-w-2xl text-[var(--text-color-secondary)]">{lede}</p>}
    </header>
  );
}

const COLS: Record<number, string> = {
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
};

/** The opportunity in figures — the same box the opportunity page puts over the brief. */
export function Figures({
  items,
  className = '',
}: {
  items: { value: string; label: string; title?: string; accent?: boolean }[];
  className?: string;
}) {
  const cols = COLS[items.length] ?? 'sm:grid-cols-3';
  return (
    <div
      role="group"
      aria-label="The opportunity in figures"
      className={`grid grid-cols-2 gap-4 rounded-xl border border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)] p-4 ${cols} sm:gap-0 sm:divide-x sm:divide-[var(--surface-border)] sm:[&>*+*]:pl-4 ${className}`}
    >
      {items.map((f) => (
        <div key={f.label} title={f.title} aria-label={`${f.label}: ${f.title ?? f.value}`}>
          <p className={`text-2xl font-bold leading-tight tabular-nums ${f.accent ? 'text-[var(--primary-color)]' : ''}`}>
            {f.value}
          </p>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-[var(--text-color-secondary)]">{f.label}</p>
        </div>
      ))}
    </div>
  );
}

export type Tone = 'plain' | 'accent' | 'good' | 'warn' | 'bad';

const TONES: Record<Tone, string> = {
  plain: 'border-[var(--surface-border)] bg-[var(--surface-card)]',
  accent: 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)]',
  good: 'border-green-600/40 bg-green-500/5',
  warn: 'border-amber-400/70 bg-amber-100/70 dark:border-amber-500/50 dark:bg-amber-500/10',
  bad: 'border-red-500/60 bg-red-500/5',
};

export function Panel({
  title,
  tone = 'plain',
  className = '',
  children,
}: {
  title?: React.ReactNode;
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border p-4 ${TONES[tone]} ${className}`}>
      {title && <h2 className="font-semibold">{title}</h2>}
      <div className={title ? 'mt-2' : ''}>{children}</div>
    </section>
  );
}

export type Mark = 'ok' | 'warn' | 'no' | 'todo' | 'current';

const MARKS: Record<Mark, { icon: string; colour: string; word: string }> = {
  ok: { icon: 'pi-check', colour: 'text-green-700 dark:text-green-400', word: 'met' },
  warn: { icon: 'pi-exclamation-triangle', colour: 'text-amber-600 dark:text-amber-400', word: 'worth noting' },
  no: { icon: 'pi-times', colour: 'text-red-600 dark:text-red-400', word: 'not met' },
  todo: { icon: 'pi-circle', colour: 'text-[var(--text-color-secondary)]', word: 'to come' },
  current: { icon: 'pi-circle-fill', colour: 'text-[var(--primary-color)]', word: 'in progress' },
};

/** One line with a mark in front: a tick, a warning, a cross, or a circle that is empty or filled. */
export function Line({
  mark,
  children,
  className = '',
}: {
  mark: Mark;
  children: React.ReactNode;
  className?: string;
}) {
  const m = MARKS[mark];
  return (
    <li className={`flex items-start gap-2.5 ${className}`}>
      <i className={`pi ${m.icon} mt-1 text-sm ${m.colour}`} aria-label={m.word} />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function Lines({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <ul className={`flex flex-col gap-1.5 text-sm ${className}`}>{children}</ul>;
}

/** A line's bar wears the band its own number would: strong, good, or the amber of a line to work on. */
export function meterColour(score: number | null): string {
  if (score === null) return 'bg-transparent';
  if (score >= 80) return 'bg-green-600 dark:bg-green-400';
  if (score >= 60) return 'bg-[var(--primary-color)]';
  return 'bg-amber-500';
}

export function Meter({ score, label }: { score: number | null; label: string }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-border)]"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score ?? 0}
      aria-valuetext={score === null ? 'not read yet' : `${score} out of 100`}
    >
      <div className={`h-full rounded-full ${meterColour(score)}`} style={{ width: `${score ?? 0}%` }} />
    </div>
  );
}

/** The row under every step: the way back, and the way on. */
export function StepNav({
  onBack,
  onNext,
  backLabel = 'Back',
  nextLabel = 'Continue',
  nextIcon = 'pi pi-arrow-right',
  nextDisabled = false,
  busy = false,
  note,
}: {
  onBack: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextIcon?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  /** Why the way on is shut, said beside the button rather than left to be guessed. */
  note?: string | null;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--surface-border)] pt-5">
      <Button type="button" label={backLabel} icon="pi pi-arrow-left" outlined onClick={onBack} disabled={busy} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {note && <span className="text-sm text-[var(--text-color-secondary)]">{note}</span>}
        <Button
          type="button"
          label={nextLabel}
          icon={nextIcon}
          iconPos="right"
          onClick={onNext}
          disabled={nextDisabled || busy}
          loading={busy}
        />
      </div>
    </div>
  );
}
