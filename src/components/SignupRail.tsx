'use client';

/**
 * The steps between arriving here and being somebody a client will pick,
 * shown down the side of the join form so the account is visibly the first
 * of them rather than the whole thing. Steps one and two happen on this
 * page; the rest are the profile screen's own sections, in the order that
 * screen puts them, so the list is a map of where they are about to be sent
 * and not a promise the portal has to keep in step by hand.
 *
 * How many there are is counted from the list rather than written down
 * anywhere: a section that grows to hold four questions is one step, not
 * four, and "step 4 of 6" then says so without anybody editing a number.
 *
 * The column carries no heading of its own: the portal's name is already
 * above it, and a second title there only competed with the one on the
 * card. The line below is what the list is for.
 *
 * The profile screen's guided setup shows the same rail. There a step is
 * ticked because the saved profile says it is done, not because it lies
 * behind the one on screen, since a skipped step is still to do; and the
 * steps from `pickFrom` on are buttons that go straight to that step.
 */
export const RAIL_LEDE =
  "You're not just creating an account. You're building your professional standing in the network.";

type Step = { label: string; hint: string };

const STEPS: Step[] = [
  { label: 'Account', hint: 'Your name, how to reach you, and a password.' },
  { label: "Confirm it's you", hint: 'Six digits, sent to you.' },
  { label: 'Professional identity', hint: 'A picture, a professional title, and a few lines in your own words.' },
  {
    label: 'Expertise',
    hint: 'The work you do, what you are best at, and in which languages.',
  },
  { label: 'Portfolio', hint: 'Two or three things you would show a stranger, with the pictures.' },
  { label: 'Availability', hint: 'Whether you can start, how much of a week, and on what terms.' },
];

/**
 * The seventh differs by side of the market: a freelancer's is where an
 * award should go, a client's the brief that starts everything.
 */
const LAST: Record<string, Step> = {
  freelancer: { label: 'Payout Setup', hint: 'Where an award goes when you win one.' },
  client: { label: 'Your first brief', hint: 'A fixed award, and what done means.' },
};

/** And the eighth is the same for both: the page, read back. */
const REVIEW: Step = {
  label: 'Profile Review',
  hint: 'Your page as a client reads it, and what would make it stronger.',
};

export const signupSteps = (role: string): Step[] => [...STEPS, LAST[role] ?? LAST.freelancer, REVIEW];

export default function SignupRail({
  role,
  current,
  done,
  onPick,
  pickFrom = 1,
}: {
  role: string;
  current: number;
  /** Per step, whether it is done; left out, every step before the current one is. */
  done?: boolean[];
  /** Makes the steps from `pickFrom` on buttons that go to that step. */
  onPick?: (step: number) => void;
  pickFrom?: number;
}) {
  const steps = signupSteps(role);
  return (
    <>
      <p className="auth-brand-note">{RAIL_LEDE}</p>
      <p className="auth-steps-summary">
        Step {current} of {steps.length} — {steps[current - 1]?.label}
      </p>
      <ol className="auth-steps">
        {steps.map((step, i) => {
          const n = i + 1;
          const finished = done ? done[i] === true : n < current;
          const state = n === current ? 'current' : finished ? 'done' : 'todo';
          const label = <span className="auth-step-label">{step.label}</span>;
          return (
            <li key={step.label} className={`auth-step auth-step-${state}`} aria-current={state === 'current'}>
              <span className="auth-step-mark" aria-hidden>
                {state === 'done' ? <i className="pi pi-check" /> : n}
              </span>
              <span className="auth-step-text">
                {onPick && n >= pickFrom && n !== current ? (
                  <button type="button" className="auth-step-pick" onClick={() => onPick(n)}>
                    {label}
                  </button>
                ) : (
                  label
                )}
                {state === 'current' && <span className="auth-step-hint">{step.hint}</span>}
              </span>
              {state === 'done' && <span className="sr-only">done</span>}
            </li>
          );
        })}
      </ol>
    </>
  );
}
