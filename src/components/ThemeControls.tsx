'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { OverlayPanel } from 'primereact/overlaypanel';
import { meQuery } from '@/lib/opportunities';
import {
  ACCENT_PRESETS,
  STATUS_KEYS,
  STATUS_LABELS,
  contrastForeground,
  getThemeState,
  initTheme,
  resetAccent,
  resetStatusColours,
  setAccent,
  setDefaultAccent,
  setMode,
  setStatusColour,
  subscribe,
  toggleMode,
  type StatusKey,
  type ThemeMode,
} from '@/lib/theme';
import { loadServerTheme, queueThemeSave } from '@/lib/themeSync';
import { apiFetch } from '@/lib/api';

const MODES: { key: ThemeMode; label: string; icon: string }[] = [
  { key: 'system', label: 'System', icon: 'pi pi-desktop' },
  { key: 'light', label: 'Light', icon: 'pi pi-sun' },
  { key: 'dark', label: 'Dark', icon: 'pi pi-moon' },
];

/**
 * The topbar theme control, ported from BookingApp's ThemeControls: a quick
 * light⇄dark toggle, then a colour popover where the user picks a preset OR
 * any custom accent, chooses System/Light/Dark explicitly, and resets to the
 * portal default. Every change applies instantly (local + CSS) and is
 * debounced-saved per-user so it follows them across devices.
 *
 * Accessibility: the swatches and mode buttons are real radio-group buttons
 * (keyboard reachable, aria-checked), and the trigger declares aria-haspopup.
 */
export default function ThemeControls() {
  const { data: me } = useQuery(meQuery);
  const panel = useRef<OverlayPanel>(null);

  // null until mounted: the server cannot know the viewer's theme, so the
  // first client render must match what it sent, then correct itself.
  const [state, setState] = useState<ReturnType<typeof getThemeState> | null>(null);

  useEffect(() => {
    initTheme();
    setState(getThemeState());
    return subscribe(() => setState(getThemeState()));
  }, []);

  // The portal's branding accent is the default for everyone (anonymous
  // included); the signed-in user's own choice then overrides it.
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/public/branding')
      .then((r) => (r.ok ? r.json() : null))
      .then((branding: { accentColor?: string | null } | null) => {
        if (!cancelled) setDefaultAccent(branding?.accentColor ?? null);
      })
      .catch(() => {
        /* branding is cosmetic; the stock look is a fine fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pull the per-user accent once signed in (applied without echoing back).
  const userId = me?.id;
  useEffect(() => {
    if (userId) void loadServerTheme();
  }, [userId]);

  const sameColor = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

  // --- accent: per-user. Applied locally AND saved so it follows the user. ---
  const chooseAccent = (hex: string | null) => {
    if (hex === null) resetAccent();
    else setAccent(hex);
    if (me) queueThemeSave();
  };

  // --- status badges: per-user too — one colour per opportunity status. ---
  const chooseStatus = (key: StatusKey | null, hex?: string) => {
    if (key === null) resetStatusColours();
    else setStatusColour(key, hex ?? null);
    if (me) queueThemeSave();
  };

  if (!state) {
    // Placeholder with the same footprint, so the header doesn't shift.
    return <span className="inline-block h-9 w-[4.5rem]" aria-hidden />;
  }

  const { mode, accent, effectiveAccent, isDark, statusColours, effectiveStatus } = state;
  const hasCustomStatus = Object.keys(statusColours).length > 0;

  return (
    <div className="flex items-center gap-0.5">
      <Button
        icon={isDark ? 'pi pi-sun' : 'pi pi-moon'}
        text
        rounded
        severity="secondary"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={() => toggleMode()}
      />

      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Theme colour, current ${effectiveAccent}`}
        onClick={(e) => panel.current?.toggle(e)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--surface-border)] bg-[var(--surface-card)] px-2 text-[var(--text-color-secondary)] transition-colors hover:border-[var(--primary-color)] hover:text-[var(--text-color)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
      >
        <span
          className="h-4 w-4 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/15%)]"
          style={{ background: effectiveAccent }}
        />
        <i className="pi pi-palette" aria-hidden />
      </button>

      <OverlayPanel ref={panel}>
        <div className="flex w-64 flex-col gap-4">
          <section className="flex flex-col gap-2">
            <span
              id="theme-mode-label"
              className="text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]"
            >
              Mode
            </span>
            {/* per-device — applied + cached locally; never sent to the server */}
            <div
              role="radiogroup"
              aria-labelledby="theme-mode-label"
              className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-ground)] p-1"
            >
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.key}
                  onClick={() => setMode(m.key)}
                  className={`flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)] ${
                    mode === m.key
                      ? 'bg-[var(--primary-color)] text-[var(--primary-color-text)]'
                      : 'text-[var(--text-color-secondary)] hover:text-[var(--text-color)]'
                  }`}
                >
                  <i className={m.icon} aria-hidden />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <span
              id="theme-accent-label"
              className="text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]"
            >
              Accent colour
            </span>
            {/* per-user — applied locally AND saved so it follows the user */}
            <div role="radiogroup" aria-labelledby="theme-accent-label" className="grid grid-cols-6 gap-1.5">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={sameColor(effectiveAccent, p.value)}
                  aria-label={p.name}
                  title={p.name}
                  onClick={() => chooseAccent(p.value)}
                  style={{ background: p.value }}
                  className={`grid aspect-square place-items-center rounded-full text-white shadow-[inset_0_0_0_1px_rgb(0_0_0/15%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)] focus-visible:ring-offset-2 ${
                    sameColor(effectiveAccent, p.value)
                      ? 'outline outline-2 outline-offset-2 outline-[var(--text-color)]'
                      : ''
                  }`}
                >
                  {sameColor(effectiveAccent, p.value) && (
                    // readable tick regardless of the swatch colour
                    <i className="pi pi-check text-[0.7rem] mix-blend-difference" aria-hidden />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <label className="relative inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--text-color)]">
                <span
                  className="h-4 w-4 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/15%)]"
                  style={{ background: effectiveAccent }}
                />
                <span>Custom…</span>
                {/* the native colour input sits invisibly over the label */}
                <input
                  type="color"
                  value={effectiveAccent}
                  aria-label="Pick a custom accent colour"
                  onChange={(e) => chooseAccent(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <button
                type="button"
                disabled={accent === null}
                onClick={() => chooseAccent(null)}
                className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] px-2.5 py-1 text-sm text-[var(--text-color-secondary)] enabled:hover:text-[var(--text-color)] disabled:cursor-default disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
              >
                Reset
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <span
              id="theme-status-label"
              className="text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]"
            >
              Status badges
            </span>
            {/* per-user, like the accent — one colour per opportunity status, so
                every list sorts itself by colour the way this viewer reads it */}
            <ul aria-labelledby="theme-status-label" className="flex flex-col gap-1.5">
              {STATUS_KEYS.map((key) => (
                <li key={key} className="flex items-center justify-between gap-2">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                    style={{ background: effectiveStatus[key], color: contrastForeground(effectiveStatus[key]) }}
                  >
                    {STATUS_LABELS[key]}
                  </span>
                  <label className="relative inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--text-color-secondary)] hover:text-[var(--text-color)]">
                    <span
                      className="h-4 w-4 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/15%)]"
                      style={{ background: effectiveStatus[key] }}
                    />
                    <span>{statusColours[key] ? 'Custom' : 'Stock'}</span>
                    {/* the native colour input sits invisibly over the label */}
                    <input
                      type="color"
                      value={effectiveStatus[key]}
                      aria-label={`${STATUS_LABELS[key]} badge colour`}
                      onChange={(e) => chooseStatus(key, e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!hasCustomStatus}
                onClick={() => chooseStatus(null)}
                className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] px-2.5 py-1 text-sm text-[var(--text-color-secondary)] enabled:hover:text-[var(--text-color)] disabled:cursor-default disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
              >
                Reset
              </button>
            </div>
          </section>
        </div>
      </OverlayPanel>
    </div>
  );
}
