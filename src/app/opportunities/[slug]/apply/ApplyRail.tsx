'use client';

import { usePortalName } from '@/components/PortalNote';

/**
 * The eight steps of applying, down the side of the wizard, the way the
 * join form's rail lists the steps of joining — the same classes, so the
 * two read as one product, and the same collapse to a single line on a
 * phone. Done is green, where you are is the accent, the rest is to come.
 */
export const APPLY_STEPS = [
  'Opportunity Review',
  'Match Analysis',
  'Eligibility',
  'Your Profile',
  'Approach',
  'Portfolio',
  'Availability',
  'Review & Submit',
];

export const RAIL_LEDE =
  'Your profile, experience and performance decide whether you qualify — not a proposal you hope someone reads.';

export default function ApplyRail({
  current,
  done,
}: {
  /** 1–8, or 9 once the application is filed and every step is done. */
  current: number;
  done: ReadonlySet<number>;
}) {
  const portal = usePortalName();
  const submitted = current > APPLY_STEPS.length;
  return (
    <div>
      <p className="text-lg font-semibold">{portal}</p>
      <p className="auth-brand-note mt-1">{RAIL_LEDE}</p>
      <p className="auth-steps-summary mt-3">
        {submitted
          ? 'Application submitted'
          : `Step ${current} of ${APPLY_STEPS.length} — ${APPLY_STEPS[current - 1]}`}
      </p>
      <ol className="auth-steps mt-4">
        {APPLY_STEPS.map((label, i) => {
          const n = i + 1;
          const state = submitted || done.has(n) ? 'done' : n === current ? 'current' : 'todo';
          return (
            <li key={label} className={`auth-step auth-step-${state}`} aria-current={state === 'current'}>
              <span className="auth-step-mark" aria-hidden>
                {state === 'done' ? <i className="pi pi-check" /> : n}
              </span>
              <span className="auth-step-text">
                <span className="auth-step-label">{label}</span>
              </span>
              {state === 'done' && <span className="sr-only">done</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
