'use client';

import { useEffect, useState } from 'react';

export type FlowStage = { label: string; detail: string };

/** How long each stage holds before the next lights up. */
const STAGE_MS = 2000;

/**
 * One opportunity's life beside the headline, lit a stage at a time and round
 * again — published, matched, entered, delivered, reviewed, paid, and the
 * merit score that follows. The copy beside it owns the play button, so
 * the state lives with whoever renders both; a reader who asked for less
 * motion sees every stage lit and nothing moving.
 */
export function useFlow(stages: number) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setStill(media.matches);
    read();
    media.addEventListener('change', read);
    return () => media.removeEventListener('change', read);
  }, []);

  useEffect(() => {
    if (!playing || still) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % stages), STAGE_MS);
    return () => clearInterval(timer);
  }, [playing, still, stages]);

  return {
    step: still ? stages - 1 : step,
    playing: playing && !still,
    still,
    toggle: () => {
      // Pressed again after a pause, it starts from the top, so the whole
      // story plays through rather than resuming mid-sentence.
      if (!playing) setStep(0);
      setPlaying((p) => !p);
    },
  };
}

export default function HeroFlow({ stages, step }: { stages: FlowStage[]; step: number }) {
  const last = stages.length - 1;
  return (
    <div className="lp-flow">
      <span className="lp-flow-track" aria-hidden />
      <span
        className="lp-flow-fill"
        aria-hidden
        style={{ height: `calc((100% - 56px) * ${last > 0 ? step / last : 0})` }}
      />
      <ol aria-label="How one opportunity runs">
        {stages.map((s, i) => {
          const done = i <= step;
          const now = i === step;
          return (
            <li
              key={s.label}
              className={`lp-step${done ? ' is-done' : ''}${now ? ' is-now' : ''}`}
              aria-current={now ? 'step' : undefined}
            >
              <span className="lp-step-num">{i + 1}</span>
              <span className="lp-step-text">
                <span className="lp-step-label">{s.label}</span>
                <span className="lp-step-detail">{s.detail}</span>
              </span>
              {now && <span className="lp-live-dot" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
