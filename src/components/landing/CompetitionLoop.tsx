'use client';

import { useEffect, useRef, useState } from 'react';

export type LoopStep = { icon: string; label: string; value: string; sub: string; desc: string };

/**
 * A colour per step, on the loop's dark ground in both themes: the mark,
 * its tile and border, and the glow behind the panel.
 */
const TONES = [
  { accent: '#6b9bff', rgb: '107 155 255' },
  { accent: '#a78bfa', rgb: '167 139 250' },
  { accent: '#f59e0b', rgb: '245 158 11' },
  { accent: '#38bdf8', rgb: '56 189 248' },
  { accent: '#c084fc', rgb: '192 132 252' },
  { accent: '#4ade80', rgb: '74 222 128' },
  { accent: '#fb923c', rgb: '251 146 60' },
  { accent: '#2dd4bf', rgb: '45 212 191' },
];

/**
 * The competition loop: one opportunity followed from the brief to the
 * leaderboard, a panel at a time, driven by the scroll. The section is five
 * screens tall and its stage sticks to the window while they pass, so each
 * stretch of scrolling is one panel. Screen readers get the whole loop as
 * a list instead of a stage that changes under them.
 */
export default function CompetitionLoop({ steps }: { steps: LoopStep[] }) {
  const track = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const panels = steps.length + 1;

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const el = track.current;
      if (!el) return;
      const range = el.offsetHeight - window.innerHeight;
      const p = range > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / range)) : 0;
      setProgress((prev) => (Math.abs(prev - p) > 0.004 ? p : prev));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const index = Math.min(panels - 1, Math.floor(progress * panels));
  const step = index > 0 ? steps[index - 1] : null;
  const tone = TONES[Math.max(0, index - 1) % TONES.length];

  return (
    <section id="how" ref={track} className="lp-loop" aria-labelledby="lp-loop-title">
      <div className="lp-loop-stage" aria-hidden>
        {step ? (
          <>
            <div
              className="lp-loop-glow"
              style={{ background: `radial-gradient(circle 500px at 50% 45%, rgb(${tone.rgb} / 0.14) 0%, transparent 60%)` }}
            />
            {/* Keyed by the panel, so each one arrives with its own entrance. */}
            <div key={index} className="lp-loop-panel">
              <div
                className="lp-loop-icon"
                style={{ color: tone.accent, background: `rgb(${tone.rgb} / 0.1)`, borderColor: `rgb(${tone.rgb} / 0.22)` }}
              >
                <i className={`pi ${step.icon}`} />
              </div>
              <p className="lp-loop-label" style={{ color: tone.accent }}>
                {step.label}
              </p>
              <p className="lp-loop-value">{step.value}</p>
              <p className="lp-loop-sub">{step.sub}</p>
              <p className="lp-loop-desc">{step.desc}</p>
            </div>
          </>
        ) : (
          <div key="intro" className="lp-loop-panel">
            <p className="lp-eyebrow" style={{ color: TONES[0].accent }}>
              The Competition Loop
            </p>
            <h2>From Opportunity to Recognition</h2>
            <p className="lp-loop-intro-copy">
              Scroll to follow one opportunity through its whole life on the portal.
            </p>
            <p className="lp-loop-hint">
              <i className="pi pi-arrow-down" />
              Keep scrolling
            </p>
          </div>
        )}
        <p className="lp-loop-counter">
          {String(index + 1).padStart(2, '0')} / {String(panels).padStart(2, '0')}
        </p>
        <div className="lp-loop-progress">
          <div className="lp-loop-fill" style={{ width: `${Math.round(progress * 100)}%`, background: tone.accent }} />
        </div>
      </div>
      <div className="sr-only">
        <h2 id="lp-loop-title">From Opportunity to Recognition</h2>
        <ol>
          {steps.map((s) => (
            <li key={s.label}>
              {s.label}: {s.value} {s.sub}. {s.desc}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
