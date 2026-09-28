'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import HelpIcon from '@/components/HelpIcon';
import { percent } from '@/lib/dashboard';
import type { DashAttention, DashFeedItem, DashMoney } from '@/lib/dashboard';
import { formatAward, relativeTime } from '@/lib/opportunities';

/**
 * The dashboard's building blocks. Everything here is presentational — the
 * role views decide what goes in which slot, so a panel means the same thing
 * on all three screens and the layout stays on one grid.
 *
 * Colour discipline: brand colour comes from the theme's `--primary-*`
 * variables, so every fill follows the viewer's accent. Status colour does
 * not — "failed" is red whatever accent someone picked, because the two are
 * different jobs.
 */

// ---------------------------------------------------------------- links

/**
 * Every link on the dashboard opens in a new tab: the dashboard is the page
 * being read, and what a figure opens is looked at beside it, so coming back
 * costs neither a reload nor the place on the page.
 */
export const NEW_TAB = { target: '_blank', rel: 'noopener' } as const;

/** What a screen reader hears after a new-tab link's own words; nothing on screen says it. */
export function NewTabHint() {
  return <span className="sr-only"> (opens in a new tab)</span>;
}

/**
 * A figure that opens what it counts — a tile's "3 clients", a table's wins,
 * an award total. A dotted underline at rest, so it reads as a link among
 * plain figures, and the accent on hover. It sits above a tile's own
 * stretched link, so the part and the whole can each be opened. With no
 * href it is the figure alone.
 */
export function FigureLink({
  href,
  title,
  className = '',
  children,
}: {
  href?: string | null;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!href) return <>{children}</>;
  return (
    <Link
      href={href}
      {...NEW_TAB}
      title={title}
      className={`relative z-10 rounded-sm text-inherit underline decoration-dotted decoration-1 underline-offset-4 transition-colors hover:text-[var(--primary-color)] hover:decoration-solid focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)] ${className}`}
    >
      {children}
      <NewTabHint />
    </Link>
  );
}

// ---------------------------------------------------------------- panel

export function Panel({
  id,
  title,
  help,
  action,
  className = '',
  bodyClassName = '',
  children,
}: {
  /**
   * An anchor for links: arriving with #id in the address opens the panel
   * and brings it into view, whatever fold was remembered — the dashboard's
   * health tiles open Operations this way.
   */
  id?: string;
  title: string;
  help?: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  // Every panel folds from its heading, and the fold is remembered per
  // panel, per device — like light/dark mode, how one person lays out
  // their screen is not a fact about the account. Starts open so the
  // server render and the first client render agree; the remembered
  // state applies right after mount.
  const storageKey = `wp.panel.${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const bodyId = useId();
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // A link to this panel wins over the remembered fold for this visit,
    // without changing what is remembered.
    if (id && window.location.hash === `#${id}`) {
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
      return;
    }
    try {
      if (localStorage.getItem(storageKey) === 'closed') setOpen(false);
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, id]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      if (next) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, 'closed');
    } catch {
      /* storage unavailable */
    }
  };

  // min-w-0: a grid track sizes itself to its content, and a chart's canvas
  // keeps the width it was last drawn at, so without it a narrowed window
  // leaves the track, the panel and the chart at their old width, off the
  // right edge of the page. Free to shrink, the panel follows the page and
  // the chart's observer sees its box change and redraws.
  return (
    <section
      id={id}
      className={`flex min-w-0 scroll-mt-4 flex-col rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] ${className}`}
    >
      <header
        className={`flex items-center gap-2 px-5 py-3 ${open ? 'border-b border-[var(--surface-border)]' : ''}`}
      >
        {/* The heading is the control; the help icon and the action slot
            stay outside it, so "All entries" opens the list, not the fold. */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
          className="flex min-w-0 items-center gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
        >
          <i
            className={`pi pi-chevron-down text-xs text-[var(--text-color-secondary)] transition-transform ${open ? '' : '-rotate-90'}`}
            aria-hidden
          />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]">
            {title}
          </h2>
        </button>
        {help && <HelpIcon topic={help} label={title} />}
        {/* The action keeps one line on a phone; the heading is the part
            that wraps. */}
        {action && <div className="ml-auto shrink-0 whitespace-nowrap">{action}</div>}
      </header>
      {open && (
        <div id={bodyId} className={`flex-1 px-5 py-4 ${bodyClassName}`}>
          {children}
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------------------- stat cards

const TONES = {
  accent: 'bg-[var(--primary-color)]/10 text-[var(--primary-color)]',
  ok: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
  neutral: 'bg-[var(--surface-hover)] text-[var(--text-color-secondary)]',
} as const;

export type Tone = keyof typeof TONES;

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  help,
  href,
}: {
  label: string;
  value: string | number;
  /** May hold FigureLinks: each opens its own part of what the tile counts. */
  sub?: React.ReactNode;
  icon: string;
  tone?: Tone;
  help?: string;
  href?: string;
}) {
  // With an href the whole tile opens it: the label's link is stretched over
  // the tile. A link cannot hold another link, so the tile is not one — the
  // sub-line's own links and the help icon sit above the stretch instead.
  return (
    <div
      className={`relative flex h-full items-start gap-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] p-4 transition-colors ${
        href ? 'hover:border-[var(--primary-color)]' : ''
      }`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}>
        <i className={`${icon} text-lg`} aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="flex items-center text-xs font-medium uppercase tracking-wide text-[var(--text-color-secondary)]">
          {href ? (
            <Link
              href={href}
              {...NEW_TAB}
              className="truncate rounded-sm text-inherit no-underline outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-[var(--primary-color)]"
            >
              {label}
              <NewTabHint />
            </Link>
          ) : (
            <span className="truncate">{label}</span>
          )}
          {help && (
            <span className="relative z-10 inline-flex">
              <HelpIcon topic={help} label={label} />
            </span>
          )}
        </div>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-[var(--text-color)]">{value}</p>
        {/* The subtitle wraps: four cards across a desktop leave each one
            about 190 px of text, and "3 per published opportunity on average"
            lost its last word there. */}
        {sub && <p className="mt-0.5 text-xs text-[var(--text-color-secondary)]">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * The headline numbers, in a panel of their own so they fold like everything
 * else: someone who lives in the charts can put the numbers away, and the
 * fold is remembered the same way. The tiles inside are one radius step
 * smaller than the panel, so the nesting reads as tiles in a tray.
 */
/**
 * The tiles. Four sit in one row on a desktop. Five would leave each too
 * narrow for its label, so they sit three over two, the lower two wider:
 * on a six-column track the first three span two each and the last two
 * span three; two across a tablet, the fifth taking the whole last row.
 */
export function StatGrid({
  title,
  help,
  columns = 4,
  children,
}: {
  title: string;
  help?: string;
  columns?: 4 | 5;
  children: React.ReactNode;
}) {
  const grid =
    columns === 5
      ? 'sm:grid-cols-2 lg:grid-cols-6 sm:[&>*:last-child]:col-span-2 lg:[&>*]:col-span-2 lg:[&>*:nth-child(n+4)]:col-span-3'
      : 'sm:grid-cols-2 xl:grid-cols-4';
  return (
    <Panel title={title} help={help}>
      <div className={`grid gap-4 ${grid}`}>{children}</div>
    </Panel>
  );
}

// ------------------------------------------------------------- progress

export function ProgressBar({ value, whole }: { value: number; whole: number }) {
  const pct = percent(value, whole);
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${value} of ${whole}`}
    >
      <div
        className="h-full rounded-full bg-[var(--primary-color)] transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ProgressRow({
  href,
  title,
  meta,
  claimed,
  possible,
  trailing,
}: {
  href: string;
  title: string;
  meta: string;
  claimed: number;
  possible: number;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      {...NEW_TAB}
      className="block rounded-lg px-2 py-2.5 no-underline transition-colors hover:bg-[var(--surface-hover)]"
    >
      <div className="flex items-baseline gap-3">
        {/* Two lines, not one: an opportunity title that lost its second half
            is not a title, and a phone is where it happens. */}
        <span className="line-clamp-2 min-w-0 flex-1 font-medium text-[var(--text-color)]">{title}</span>
        <span className="shrink-0 text-xs tabular-nums text-[var(--text-color-secondary)]">
          {claimed}/{possible} · {percent(claimed, possible)}%
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={claimed} whole={possible} />
      </div>
      {/* The trailing item (a repo name, often long) drops under the meta
          on a narrow screen and truncates rather than widening the page. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-color-secondary)]">
        <span className="truncate">{meta}</span>
        {trailing && <span className="ml-auto min-w-0 max-w-full truncate">{trailing}</span>}
      </div>
      <NewTabHint />
    </Link>
  );
}

// ------------------------------------------------------------ attention

const SEVERITY = {
  danger: { icon: 'pi pi-exclamation-circle', chip: 'text-red-600 dark:text-red-400 bg-red-500/10' },
  warn: { icon: 'pi pi-clock', chip: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  info: { icon: 'pi pi-info-circle', chip: 'text-sky-600 dark:text-sky-400 bg-sky-500/10' },
} as const;

/**
 * `empty` replaces the all-clear when the list is empty for another reason —
 * a search that matched nothing is not "nothing is waiting on you".
 */
export function AttentionList({ items, empty }: { items: DashAttention[]; empty?: string }) {
  if (items.length === 0) {
    if (empty) {
      return <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">{empty}</p>;
    }
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <i className="pi pi-check" aria-hidden />
        </span>
        <p className="mt-3 text-sm font-medium">Nothing is waiting on you</p>
        <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
          Deadlines, payments and repository problems all surface here first.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, i) => {
        const tone = SEVERITY[item.severity] ?? SEVERITY.info;
        const external = item.href?.startsWith('http');
        const inner = (
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone.chip}`}>
              <i className={`${tone.icon} text-sm`} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-color)]">{item.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-color-secondary)]">
                {item.detail}
              </p>
            </div>
            {/* Every one opens in a new tab, so the arrow says so. */}
            {item.href && (
              <i
                className={`pi ${external ? 'pi-external-link' : 'pi-arrow-up-right'} mt-1 text-xs text-[var(--text-color-secondary)]`}
                aria-hidden
              />
            )}
          </div>
        );

        return (
          <li key={`${item.kind}-${i}`}>
            {item.href ? (
              <Link
                href={item.href}
                {...NEW_TAB}
                className="block rounded-lg px-2 py-2 no-underline transition-colors hover:bg-[var(--surface-hover)]"
              >
                {inner}
                <NewTabHint />
              </Link>
            ) : (
              <div className="px-2 py-2">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ----------------------------------------------------------------- feed

export function ActivityFeed({ items, empty }: { items: DashFeedItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">{empty}</p>;
  }

  return (
    <ol className="flex flex-col">
      {items.map((item, i) => {
        const body = (
          <>
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary-color)]" aria-hidden />
            <div className="min-w-0 flex-1">
              {/* The milestone name is the end of the line and the point of
                  it; a second line keeps it where one line cut it off. */}
              <p className="line-clamp-2 text-sm text-[var(--text-color)]">{item.text}</p>
              <p className="text-xs text-[var(--text-color-secondary)]">
                {item.detail} · {relativeTime(item.atUtc)}
              </p>
            </div>
          </>
        );
        return (
          <li key={i} className="border-b border-[var(--surface-border)] last:border-0">
            {item.href ? (
              <Link
                href={item.href}
                {...NEW_TAB}
                className="flex items-start gap-3 px-2 py-2.5 no-underline transition-colors hover:bg-[var(--surface-hover)]"
              >
                {body}
                <NewTabHint />
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-2 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- money

/** Where a currency's award figures lead: every award, the paid ones, the unpaid ones. */
export type MoneyLinks = (currency: string) => { all?: string; paid?: string; unpaid?: string };

/**
 * Award value, split paid vs outstanding. Grouped by currency because an
 * opportunity carries its own — one summed number would add rupees to dollars.
 * With `links`, each figure opens the awards it adds up.
 */
export function MoneyPanel({
  money,
  unpaidLabel,
  links,
}: {
  money: DashMoney[];
  unpaidLabel: string;
  links?: MoneyLinks;
}) {
  if (money.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">
        No awards recorded yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {money.map((m) => {
        const to = links?.(m.currency) ?? {};
        return (
          <div key={m.currency}>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums text-[var(--text-color)]">
                <FigureLink href={to.all}>{formatAward(m.announced, m.currency)}</FigureLink>
              </span>
              <span className="text-xs text-[var(--text-color-secondary)]">
                <FigureLink href={to.all}>
                  {m.count} award{m.count === 1 ? '' : 's'}
                </FigureLink>
              </span>
            </div>

            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[var(--surface-hover)]">
              <div
                className="bg-emerald-500 transition-[width] duration-500"
                style={{ width: `${percent(m.paid, m.announced)}%` }}
              />
              <div
                className="bg-amber-500 transition-[width] duration-500"
                style={{ width: `${percent(m.outstanding, m.announced)}%` }}
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                <span className="text-[var(--text-color-secondary)]">Paid</span>
                <span className="tabular-nums font-medium">
                  <FigureLink href={m.paid > 0 ? to.paid : null}>{formatAward(m.paid, m.currency)}</FigureLink>
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                <span className="text-[var(--text-color-secondary)]">{unpaidLabel}</span>
                <span className="tabular-nums font-medium">
                  <FigureLink href={m.outstanding > 0 ? to.unpaid : null}>
                    {formatAward(m.outstanding, m.currency)}
                  </FigureLink>
                </span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ rank table

export function RankTable({
  columns,
  rows,
  empty,
}: {
  columns: { key: string; label: string; align?: 'left' | 'right'; help?: string }[];
  rows: Record<string, React.ReactNode>[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">{empty}</p>;
  }

  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[26rem] text-sm">
        <thead>
          <tr className="border-b border-[var(--surface-border)] text-left text-xs uppercase tracking-wide text-[var(--text-color-secondary)]">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`whitespace-nowrap px-2 pb-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}
              >
                {c.label}
                {c.help && <HelpIcon topic={c.help} label={c.label} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--surface-border)] last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-2.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------ card layouts

export type RankColumn = { key: string; label: string; align?: 'left' | 'right'; help?: string };

/**
 * A ProgressRow as a card, for the dashboard's card layout. The whole card is
 * the link, and the facts wrap rather than truncate, because a card has the
 * height a row does not.
 */
export function ProgressCard({
  href,
  title,
  meta,
  claimed,
  possible,
  trailing,
}: {
  href: string;
  title: string;
  meta: string;
  claimed: number;
  possible: number;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      {...NEW_TAB}
      className="flex h-full flex-col rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] p-4 no-underline transition-colors hover:border-[var(--primary-color)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
    >
      <span className="line-clamp-2 font-medium text-[var(--text-color)]">{title}</span>
      <div className="mt-3 flex items-baseline justify-between gap-2 text-xs tabular-nums text-[var(--text-color-secondary)]">
        <span>
          {claimed}/{possible} claimed
        </span>
        <span>{percent(claimed, possible)}%</span>
      </div>
      <div className="mt-1.5">
        <ProgressBar value={claimed} whole={possible} />
      </div>
      <p className="mt-2 text-xs text-[var(--text-color-secondary)]">{meta}</p>
      {trailing && <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-3 text-xs">{trailing}</div>}
      <NewTabHint />
    </Link>
  );
}

/**
 * A RankTable's rows as cards: the first column names the card and the rest
 * are figures under their labels. The card itself opens nothing; as in the
 * table, the name and each figure carry their own link where the view gives
 * one.
 */
export function RankCards({
  columns,
  rows,
  empty,
}: {
  columns: RankColumn[];
  rows: Record<string, React.ReactNode>[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">{empty}</p>;
  }
  const [head, ...rest] = columns;
  return (
    <ul role="list" className="grid gap-3 sm:grid-cols-2">
      {rows.map((row, i) => (
        <li key={i} className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] p-4">
          <p className="text-sm text-[var(--text-color)]">{row[head.key]}</p>
          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
            {rest.map((c) => (
              <div key={c.key} className="min-w-0">
                <dt className="truncate text-[0.65rem] uppercase tracking-wide text-[var(--text-color-secondary)]">
                  {c.label}
                </dt>
                <dd className="text-sm tabular-nums">{row[c.key]}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

/**
 * A panel heading's action while a search narrows the panel: how many of its
 * rows are left, beside whatever the heading already offers.
 */
export function tallyAction(
  searching: boolean,
  shown: number,
  total: number,
  existing?: React.ReactNode,
): React.ReactNode {
  // A panel with nothing in it has nothing to count down from.
  if (!searching || total === 0) return existing;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs tabular-nums text-[var(--text-color-secondary)]">
        {shown} of {total}
      </span>
      {existing}
    </span>
  );
}

// ------------------------------------------------------------- skeleton

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)]">
        <div className="h-11 border-b border-[var(--surface-border)]" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[5.5rem] animate-pulse rounded-lg border border-[var(--surface-border)] bg-[var(--surface-hover)]"
            />
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] lg:col-span-2" />
        <div className="h-72 animate-pulse rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)]" />
      </div>
    </div>
  );
}
