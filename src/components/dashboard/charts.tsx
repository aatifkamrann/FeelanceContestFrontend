'use client';

import { useMemo, useRef } from 'react';
import { Chart } from 'primereact/chart';
import { FigureLink } from '@/components/dashboard/kit';
import { alpha, useChartTheme, type ChartTokens } from '@/lib/chartTheme';
import { shortDay, type DashSeries, type DashSplit } from '@/lib/dashboard';

/**
 * The chart layer. Two shapes cover everything on these screens: a daily
 * activity line, and a split doughnut.
 *
 * Every colour comes from useChartTheme, so a chart re-paints when the viewer
 * switches mode or picks a different accent — no literal hex anywhere below.
 * Until the tokens resolve (first paint, before the theme stylesheet is
 * measurable) the chart renders as an empty box of the same height, so the
 * grid never jumps.
 */

const HEIGHT = 'h-64';

function Frame({ children }: { children: React.ReactNode }) {
  return <div className={`relative ${HEIGHT}`}>{children}</div>;
}

// ------------------------------------------------------------- activity

/** The point a pointer is on, if any, hit-tested within each point's hit radius. */
type PointChart = {
  getElementsAtEventForMode: (
    e: Event,
    mode: string,
    options: { intersect: boolean },
    final: boolean,
  ) => { datasetIndex: number; index: number }[];
  canvas: HTMLCanvasElement;
};

/**
 * `links` holds one link-maker per series, in the series' order: given a day
 * ("2026-09-12") it says where that series' point for the day opens — in a
 * new tab, like every dashboard link — and null leaves a series' points
 * inert. A point of nothing opens nothing.
 */
export function ActivityChart({
  data,
  links,
}: {
  data: DashSeries;
  links?: (((day: string) => string) | null)[];
}) {
  const t = useChartTheme();
  const clickable = !!links?.some(Boolean);

  // Read at click time, as SplitChart's are, so a view's new array each
  // render does not redraw the chart.
  const hrefOf = (series: number, index: number): string | null =>
    (data.series[series]?.points[index] ?? 0) > 0 ? (links?.[series]?.(data.labels[index]) ?? null) : null;
  const hrefRef = useRef(hrefOf);
  hrefRef.current = hrefOf;

  const { chartData, options } = useMemo(() => {
    if (!t) return { chartData: null, options: null };
    // The points are drawn only on hover, so each takes the pointer within a
    // few pixels; where two series meet, the first that opens something wins.
    const pointAt = (e: Event, chart: PointChart) =>
      chart
        .getElementsAtEventForMode(e, 'nearest', { intersect: true }, false)
        .map((p) => hrefRef.current(p.datasetIndex, p.index))
        .find(Boolean) ?? null;
    const options = baseOptions(t, {
      ...(clickable && {
        onHover: (e: Event, _active: unknown, chart: PointChart) => {
          chart.canvas.style.cursor = pointAt(e, chart) ? 'pointer' : '';
        },
        onClick: (e: Event, _active: unknown, chart: PointChart) => {
          const href = pointAt(e, chart);
          if (href) window.open(href, '_blank', 'noopener');
        },
      }),
      scales: {
        x: {
          grid: { display: false },
          border: { color: t.grid },
          ticks: { color: t.muted, maxTicksLimit: 7, autoSkip: true, maxRotation: 0, font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: t.grid, drawTicks: false },
          border: { display: false },
          ticks: { color: t.muted, precision: 0, maxTicksLimit: 5, padding: 8, font: { size: 11 } },
        },
      },
    });
    // The tooltip is the one place a hidden point can say it opens something.
    if (clickable) {
      Object.assign(options.plugins.tooltip, {
        footerColor: '#d1d5db',
        footerFont: { size: 11, weight: 'normal' },
        callbacks: { footer: () => 'Click a point to open that day' },
      });
    }
    return {
      chartData: {
        labels: data.labels.map(shortDay),
        datasets: data.series.map((s, i) => {
          const color = t.series[i % t.series.length];
          return {
            label: s.name,
            data: s.points,
            borderColor: color,
            backgroundColor: alpha(color, t.isDark ? 0.18 : 0.12),
            // A single-series chart reads better filled; several filled areas
            // just occlude each other, so only the first one gets a fill.
            fill: i === 0,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBorderWidth: 2,
            pointHoverBackgroundColor: t.surface,
            pointHoverBorderColor: color,
            pointHitRadius: 8,
          };
        }),
      },
      options,
    };
  }, [data, t, clickable]);

  return <Frame>{chartData && <Chart type="line" data={chartData} options={options} className="h-full" />}</Frame>;
}

// ---------------------------------------------------------------- split

/** The slice a pointer is over, if any — hit-tested exactly, not the nearest slice. */
type HitChart = {
  getElementsAtEventForMode: (e: Event, mode: string, options: { intersect: boolean }, final: boolean) => { index: number }[];
  canvas: HTMLCanvasElement;
};

/**
 * A doughnut with the total in the middle. `tones` names a semantic colour
 * per slice — status is not brand colour, so "failed" stays red under any
 * accent; `accent` slices follow the viewer's palette.
 *
 * The legend is the page's, not the canvas's: each slice's label and count
 * as a line of text, so the counts are read without hovering. With `links`
 * each slice opens the list it counts — its legend line and the slice itself
 * alike, in a new tab like every dashboard link — and `totalHref` makes the
 * total in the middle open all of them. A slice of nothing opens nothing.
 */
export function SplitChart({
  split,
  tones,
  centerLabel,
  links,
  totalHref,
}: {
  split: DashSplit;
  tones: (keyof Pick<
    ChartTokens,
    'accent' | 'accentSoft' | 'accentDeep' | 'ok' | 'warn' | 'danger' | 'neutral' | 'neutralSoft'
  >)[];
  centerLabel: string;
  /** One per slice, in the split's order; null where a slice has nowhere to go. */
  links?: (string | null)[];
  totalHref?: string;
}) {
  const t = useChartTheme();
  const total = split.values.reduce((a, b) => a + b, 0);
  const hrefOf = (i: number) => (split.values[i] > 0 ? links?.[i] ?? null : null);

  // Read at click time rather than built into the options: a view hands a
  // new array every render, and new options would redraw the chart each time.
  const hrefRef = useRef(hrefOf);
  hrefRef.current = hrefOf;

  const { chartData, options } = useMemo(() => {
    if (!t) return { chartData: null, options: null };
    const colors = split.labels.map((_, i) => t[tones[i % tones.length]]);
    const sliceAt = (e: Event, chart: HitChart) => chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false)[0];
    return {
      chartData: {
        labels: split.labels,
        datasets: [
          {
            data: split.values,
            backgroundColor: colors,
            hoverBackgroundColor: colors,
            borderColor: t.surface,
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: baseOptions(t, {
        cutout: '68%',
        // The pointer says which slices open something.
        onHover: (e: Event, _active: unknown, chart: HitChart) => {
          const hit = sliceAt(e, chart);
          chart.canvas.style.cursor = hit && hrefRef.current(hit.index) ? 'pointer' : '';
        },
        onClick: (e: Event, _active: unknown, chart: HitChart) => {
          const hit = sliceAt(e, chart);
          const href = hit ? hrefRef.current(hit.index) : null;
          if (href) window.open(href, '_blank', 'noopener');
        },
        plugins: { legend: { display: false } },
      }),
    };
  }, [split, tones, t]);

  return (
    <div>
      <div className="relative h-52">
        {chartData && <Chart type="doughnut" data={chartData} options={options} className="h-full" />}
        {/* The centre reads as part of the chart but is plain DOM — it stays
            selectable, scales with the type ramp, and needs no plugin. Only
            the total takes the pointer, so the ring around it still does. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <p className="text-2xl font-semibold tabular-nums text-[var(--text-color)]">
            <span className="pointer-events-auto">
              <FigureLink href={total > 0 ? totalHref : null}>{total}</FigureLink>
            </span>
          </p>
          <p className="text-xs text-[var(--text-color-secondary)]">{centerLabel}</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs">
        {split.labels.map((label, i) => (
          <li key={label} className="flex items-center gap-1.5 text-[var(--text-color-secondary)]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: t ? t[tones[i % tones.length]] : 'var(--surface-border)' }}
              aria-hidden
            />
            <FigureLink href={hrefOf(i)} className="group">
              {label}{' '}
              <span className="font-medium tabular-nums text-[var(--text-color)] group-hover:text-[var(--primary-color)]">
                {split.values[i]}
              </span>
            </FigureLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------- shared

function baseOptions(t: ChartTokens, extra: Record<string, unknown>) {
  const { plugins: extraPlugins, ...rest } = extra as { plugins?: Record<string, unknown> };
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    animation: { duration: 400 },
    plugins: {
      legend: {
        position: 'top' as const,
        align: 'end' as const,
        labels: {
          color: t.muted,
          usePointStyle: true,
          pointStyle: 'circle' as const,
          boxWidth: 8,
          padding: 16,
          font: { size: 11 },
        },
      },
      tooltip: {
        backgroundColor: t.isDark ? 'rgba(17, 24, 39, 0.96)' : 'rgba(17, 24, 39, 0.92)',
        titleColor: '#f9fafb',
        bodyColor: '#e5e7eb',
        borderColor: alpha(t.border, 0.6),
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        usePointStyle: true,
        boxPadding: 4,
      },
      ...extraPlugins,
    },
    ...rest,
  };
}
