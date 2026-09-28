'use client';

import { useEffect, useState } from 'react';
import { subscribe } from './theme';

/**
 * Chart colours, resolved from the live theme rather than hard-coded.
 *
 * The portal's accent is per-user and its mode is per-device, so a literal
 * series colour would be wrong for somebody: an amber accent beside a teal
 * line, or a navy line invisible on a dark ground. Everything below is read
 * from the stylesheet that is actually applied, which means charts follow a
 * palette change and a light/dark switch for free.
 *
 * Status colours are deliberately NOT derived from the accent. "Failed" must
 * read as failed whatever colour the viewer picked, so ok/warn/danger are
 * fixed per mode — semantic colour is a different job from brand colour.
 */
export type ChartTokens = {
  isDark: boolean;
  /** The accent itself — the primary series, and every progress fill. */
  accent: string;
  accentSoft: string;
  accentDeep: string;
  /** Categorical series that stay distinguishable under any accent. */
  series: string[];
  text: string;
  muted: string;
  grid: string;
  surface: string;
  border: string;
  ok: string;
  warn: string;
  danger: string;
  neutral: string;
  /** A quieter grey beside neutral, for an outcome that must still read apart from it. */
  neutralSoft: string;
};

/**
 * Reads a CSS custom property by letting the browser resolve it.
 *
 * getPropertyValue on a custom property can hand back the unsubstituted
 * `var(--wp-accent, #14b8a6)` token stream; painting it on a real element and
 * reading back `color` always yields a resolved rgb(). One element, one style
 * recalc per token, and no parsing of fallback chains.
 */
function readVars(names: string[]): string[] {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;opacity:0;pointer-events:none';
  document.body.appendChild(probe);
  const out = names.map((name) => {
    probe.style.color = '';
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color || 'rgb(107, 114, 128)';
  });
  probe.remove();
  return out;
}

function toRgb(color: string): [number, number, number] {
  const m = color.match(/-?\d+(\.\d+)?/g);
  if (!m || m.length < 3) return [107, 114, 128];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/** Same colour, given alpha — for area fills and hover washes. */
export function alpha(color: string, a: number): string {
  const [r, g, b] = toRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToCss(h: number, s: number, l: number): string {
  return `hsl(${((h % 360) + 360) % 360} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/**
 * A companion hue for a second or third series: the accent rotated around the
 * wheel, with saturation and lightness pinned to a band that reads on both
 * grounds. Rotating rather than picking fixed hues means the set can never
 * collide with the accent the user chose.
 */
function companion(accent: string, degrees: number, isDark: boolean): string {
  const [h, s] = rgbToHsl(toRgb(accent));
  const saturation = Math.min(0.72, Math.max(0.42, s));
  return hslToCss(h + degrees, saturation, isDark ? 0.62 : 0.46);
}

function compute(): ChartTokens {
  const isDark = document.documentElement.dataset.theme === 'dark';
  const [accent, accentSoft, accentDeep, text, muted, border, surface] = readVars([
    '--primary-color',
    isDark ? '--primary-300' : '--primary-400',
    isDark ? '--primary-500' : '--primary-700',
    '--text-color',
    '--text-color-secondary',
    '--surface-border',
    '--surface-card',
  ]);

  return {
    isDark,
    accent,
    accentSoft,
    accentDeep,
    series: [accent, companion(accent, 150, isDark), companion(accent, 255, isDark)],
    text,
    muted,
    grid: alpha(border, isDark ? 0.55 : 0.9),
    surface,
    border,
    ok: isDark ? '#4ade80' : '#16a34a',
    warn: isDark ? '#fbbf24' : '#d97706',
    danger: isDark ? '#f87171' : '#dc2626',
    neutral: isDark ? '#64748b' : '#94a3b8',
    neutralSoft: isDark ? '#334155' : '#cbd5e1',
  };
}

/**
 * The tokens, recomputed whenever the mode or accent changes.
 *
 * The re-read is staggered on purpose: switching mode swaps the theme
 * stylesheet's href, and the new sheet is not necessarily parsed by the time
 * the subscriber fires — probing too early returns the previous theme's
 * colours. Three cheap reads settle it without polling.
 */
export function useChartTheme(): ChartTokens | null {
  const [tokens, setTokens] = useState<ChartTokens | null>(null);

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const refresh = () => {
      if (!alive) return;
      requestAnimationFrame(() => alive && setTokens(compute()));
      timers.push(setTimeout(() => alive && setTokens(compute()), 150));
      timers.push(setTimeout(() => alive && setTokens(compute()), 500));
    };

    refresh();
    const unsubscribe = subscribe(refresh);
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      unsubscribe();
    };
  }, []);

  return tokens;
}
