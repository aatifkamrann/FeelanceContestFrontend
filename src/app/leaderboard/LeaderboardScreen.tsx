'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { SelectButton } from 'primereact/selectbutton';
import { TabMenu } from 'primereact/tabmenu';
import Avatar from '@/components/Avatar';
import HelpIcon from '@/components/HelpIcon';
import SiteHeader from '@/components/SiteHeader';
import { starScore } from '@/lib/opportunities';
import {
  LIVE_EVERY_MS,
  RANK_BY,
  TABS,
  leaderboardQuery,
  rankByOf,
  tabNote,
  tabOf,
  type Leaderboard,
  type LeaderboardOption,
  type LeaderboardRow,
  type LeaderboardTab,
  type PodiumRow,
  type RankBy,
} from '@/lib/leaderboard';

/*
 * The public leaderboard: the freelancers leading the portal, as a table
 * on a wide screen and as cards on a phone. Five tabs choose who is on the
 * board and one switch chooses the figure that orders it; both live in the
 * address, so a board can be linked to. The API does the listing, the
 * ordering and the ranking — this screen only shows what it was sent, and
 * every figure on it is one the portal recorded rather than one a member
 * wrote. A row opens the member's profile, which stays members-only.
 */

const SECONDARY = 'text-[var(--text-color-secondary)]';

export default function LeaderboardScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = tabOf(params.get('tab'));
  const by = rankByOf(params.get('by'));
  const region = params.get('region');
  const category = params.get('category');

  const { data, dataUpdatedAt, isLoading, isError, isFetching, refetch } = useQuery(
    leaderboardQuery({ tab, by, region, category }),
  );

  // The address is the state. Defaults are left out of it, so the plain
  // /leaderboard is the global board by merit and a link stays short.
  const go = useCallback(
    (next: Partial<{ tab: LeaderboardTab; by: RankBy; region: string | null; category: string | null }>) => {
      const merged = { tab, by, region, category, ...next };
      const q = new URLSearchParams();
      if (merged.tab !== 'global') q.set('tab', merged.tab);
      if (merged.by !== 'merit') q.set('by', merged.by);
      if (merged.region) q.set('region', merged.region);
      if (merged.category) q.set('category', merged.category);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [tab, by, region, category, pathname, router],
  );

  const activeIndex = TABS.findIndex((t) => t.key === tab);
  const ranked = RANK_BY.find((r) => r.key === by) ?? RANK_BY[0];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <Live updatedAt={dataUpdatedAt} fetching={isFetching} />
          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight [text-wrap:balance]">Performance Has a Rank.</h1>
              <p className={`mt-2 max-w-2xl text-base ${SECONDARY}`}>
                Explore the professionals leading the network by quality, reliability and proven delivery.
              </p>
            </div>
            <Link
              href="/talent"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-2 text-sm font-medium text-[var(--primary-color)] no-underline transition-colors hover:bg-[var(--surface-hover)]"
            >
              <i className="pi pi-users" aria-hidden />
              Explore the Talent Network
              <i className="pi pi-arrow-right text-xs" aria-hidden />
            </Link>
          </div>
        </header>

        {/* Who is on the board. */}
        <div className="flex items-center gap-1">
          <TabMenu
            model={TABS.map((t) => ({ label: t.label, icon: t.icon }))}
            activeIndex={activeIndex < 0 ? 0 : activeIndex}
            onTabChange={(e) => go({ tab: TABS[e.index]?.key ?? 'global' })}
            className="min-w-0 flex-1"
            aria-label="Board"
          />
          <HelpIcon topic="leaderboard.tabs" />
        </div>

        {/* The tab's top three by merit, whatever orders the table below. */}
        {data && data.podium.length > 0 && <Podium rows={data.podium} />}

        {/* What orders it, and — where the tab needs one — which region or kind of work. */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center text-sm ${SECONDARY}`}>
            Rank by
            <HelpIcon topic="leaderboard.rankBy" />
          </span>
          <SelectButton
            value={by}
            options={RANK_BY}
            optionLabel="label"
            optionValue="key"
            allowEmpty={false}
            onChange={(e) => e.value && go({ by: e.value as RankBy })}
            aria-label="Rank by"
          />
          {tab === 'regional' && (
            <Picker
              value={data?.region ?? region}
              options={data?.regions ?? []}
              placeholder="Region"
              onChange={(key) => go({ region: key })}
            />
          )}
          {tab === 'category' && (
            <Picker
              value={data?.category ?? category}
              options={data?.categories ?? []}
              placeholder="Kind of work"
              onChange={(key) => go({ category: key })}
            />
          )}
          {data && (
            <p className={`text-sm sm:ml-auto ${SECONDARY}`} aria-live="polite">
              {tabNote(data)}
            </p>
          )}
        </div>

        <section className="mt-4" aria-busy={isFetching}>
          {isLoading ? (
            <Skeleton />
          ) : isError || !data ? (
            <Empty icon="pi-exclamation-triangle" title="The leaderboard could not be loaded">
              <p className={`mt-1 text-sm ${SECONDARY}`}>Nothing here changes anything — this page only reads.</p>
              <Button label="Try again" className="mt-4" outlined onClick={() => void refetch()} />
            </Empty>
          ) : data.rows.length === 0 ? (
            <Empty icon="pi-trophy" title="Nobody on this board yet">
              <p className={`mt-1 text-sm ${SECONDARY}`}>{tabNote(data)}</p>
            </Empty>
          ) : (
            <>
              <BoardTable data={data} ranked={ranked} />
              <BoardCards data={data} ranked={ranked} />
              <p className={`mt-3 text-xs ${SECONDARY}`}>
                Showing {data.rows.length} of {data.total}. Ranks are read live and refreshed every{' '}
                {Math.round(LIVE_EVERY_MS / 1000)} seconds while this page is open; the trend compares today&apos;s
                score with the one recorded up to {data.trendDays} days ago.
              </p>
            </>
          )}
        </section>
      </main>
    </>
  );
}

// -------------------------------------------------------------------- live

/**
 * The wall clock, once a second, so "updated 12s ago" and the bar to the
 * next read move. Nought until mounted, so the server's render and the
 * first client render say the same thing and hydration has nothing to
 * disagree about.
 */
function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * The strip over the heading: a green pulse, RANKINGS · UPDATED LIVE, how
 * long since the board was last read, and a thin bar filling towards the
 * next read — the board as a progress board. The pulse holds still where
 * motion is unwelcome.
 */
function Live({ updatedAt, fetching }: { updatedAt: number; fetching: boolean }) {
  const now = useNow();
  const mounted = now > 0;
  const since = mounted && updatedAt ? Math.max(0, Math.floor((now - updatedAt) / 1000)) : null;
  const progress = mounted && updatedAt ? Math.min(100, ((now - updatedAt) / LIVE_EVERY_MS) * 100) : 0;
  return (
    <div>
      <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wider ${SECONDARY}`}>
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
        </span>
        <span>
          Rankings · <span className="text-green-700 dark:text-green-400">Updated live</span>
        </span>
        <span className="font-normal normal-case tracking-normal" aria-live="polite">
          {!mounted ? '' : fetching ? '· reading now' : since == null ? '' : since < 2 ? '· updated just now' : `· updated ${since}s ago`}
        </span>
      </p>
      <div
        className="mt-2 h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--surface-border)]"
        role="progressbar"
        aria-label="Time until the next read of the board"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div
          className="h-full rounded-full bg-green-500 transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ podium

/** Gold, silver, bronze by place on the podium — a tie for first still hands out three medals. */
const MEDALS = [
  { emoji: '🥇', word: 'Gold', top: 'border-t-amber-400', place: 'text-amber-600 dark:text-amber-400' },
  { emoji: '🥈', word: 'Silver', top: 'border-t-slate-400', place: 'text-slate-500 dark:text-slate-300' },
  { emoji: '🥉', word: 'Bronze', top: 'border-t-orange-700', place: 'text-orange-700 dark:text-orange-400' },
];

/**
 * The three cards over the table: place and medal, face and name with the
 * title under it, and the merit score. One line from tablet width up, a
 * column on a phone. A card lifts on hover where motion is welcome and
 * opens the profile.
 */
function Podium({ rows }: { rows: PodiumRow[] }) {
  return (
    <ol className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Top three by merit score">
      {rows.map((r, i) => {
        const medal = MEDALS[Math.min(i, MEDALS.length - 1)];
        return (
          <li key={r.userId}>
            <Link
              href={`/profile/${r.userId}`}
              className={`group block rounded-2xl border border-[var(--surface-border)] border-t-4 ${medal.top} bg-[var(--surface-card)] p-4 text-[var(--text-color)] no-underline shadow-sm transition duration-200 hover:shadow-lg motion-safe:hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-lg font-bold tabular-nums ${medal.place}`}>
                  {r.rank == null ? '—' : `#${r.rank}`}
                </span>
                <span
                  className="text-2xl leading-none transition-transform duration-200 motion-safe:group-hover:scale-125"
                  aria-hidden
                >
                  {medal.emoji}
                </span>
                <span className="sr-only">{medal.word}</span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Avatar name={r.name} url={r.avatarUrl} size="md" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className={`block truncate text-xs ${SECONDARY}`}>{r.headline ?? 'No title yet'}</span>
                </span>
              </div>
              <hr className="my-3 border-0 border-t border-[var(--surface-border)]" />
              <p className="flex items-baseline gap-2" title={`Merit score ${r.merit} — ${r.band}`}>
                <span className="text-2xl font-bold tabular-nums text-[var(--primary-color)]">{r.merit}</span>
                <span className={`text-sm ${SECONDARY}`}>MeritScore</span>
              </p>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------- controls

function Picker({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string | null;
  options: LeaderboardOption[];
  placeholder: string;
  onChange: (key: string) => void;
}) {
  return (
    <Dropdown
      value={value}
      options={options}
      optionLabel="label"
      optionValue="key"
      placeholder={placeholder}
      itemTemplate={(o: LeaderboardOption) => (
        <span className="flex items-center justify-between gap-4">
          {o.label}
          <span className={`text-xs tabular-nums ${SECONDARY}`}>{o.count}</span>
        </span>
      )}
      onChange={(e) => e.value && onChange(e.value as string)}
      className="min-w-[12rem]"
      aria-label={placeholder}
    />
  );
}

// ------------------------------------------------------------------ table

type Ranked = (typeof RANK_BY)[number];

function BoardTable({ data, ranked }: { data: Leaderboard; ranked: Ranked }) {
  const router = useRouter();
  const head = (key: RankBy, label: string, topic?: string, align: 'left' | 'right' = 'right') => {
    const on = ranked.key === key;
    return (
      <th
        scope="col"
        aria-sort={on ? 'descending' : undefined}
        className={`whitespace-nowrap px-4 py-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${
          on ? 'text-[var(--primary-color)]' : ''
        }`}
      >
        <span className="inline-flex items-center gap-1">
          {on && <i className="pi pi-sort-amount-down text-xs" aria-hidden />}
          {label}
          {topic && <HelpIcon topic={topic} />}
        </span>
      </th>
    );
  };
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] md:block">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Freelancers ranked by {ranked.label}
        </caption>
        <thead>
          <tr className={`text-xs uppercase tracking-wide ${SECONDARY}`}>
            <th scope="col" className="w-20 px-4 py-3 text-left font-medium">
              Rank
            </th>
            {/* Takes whatever width the figures leave, so a long title truncates rather than widening the table. */}
            <th scope="col" className="w-full px-4 py-3 text-left font-medium">
              Freelancer
            </th>
            {head('merit', 'MeritScore')}
            {head('rating', 'Rating')}
            {head('delivery', 'Delivery', 'leaderboard.delivery')}
            {head('wins', 'Wins')}
            <th scope="col" className="px-4 py-3 text-right font-medium">
              <span className="inline-flex items-center gap-1">
                Trend
                <HelpIcon topic="leaderboard.trend" />
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr
              key={r.userId}
              onClick={() => router.push(`/profile/${r.userId}`)}
              className="cursor-pointer border-t border-[var(--surface-border)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <td className="px-4 py-3">
                <RankBadge rank={r.rank} />
              </td>
              <td className="w-full max-w-0 px-4 py-3">
                <Who row={r} />
              </td>
              <td className="px-4 py-3 text-right">
                <MeritCell row={r} />
              </td>
              <td className="px-4 py-3 text-right">
                <RatingCell row={r} />
              </td>
              <td className="px-4 py-3 text-right">
                <DeliveryCell row={r} />
              </td>
              <td className="px-4 py-3 text-right font-medium tabular-nums">{r.wins}</td>
              <td className="px-4 py-3 text-right">
                <Trend value={r.trend} days={data.trendDays} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ cards

function BoardCards({ data, ranked }: { data: Leaderboard; ranked: Ranked }) {
  return (
    <ul className="flex flex-col gap-3 md:hidden" aria-label={`Freelancers ranked by ${ranked.label}`}>
      {data.rows.map((r) => (
        <li
          key={r.userId}
          className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4"
        >
          <div className="flex items-center gap-3">
            <RankBadge rank={r.rank} />
            <div className="min-w-0 flex-1">
              <Who row={r} />
            </div>
            <Trend value={r.trend} days={data.trendDays} />
          </div>
          <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-[var(--surface-border)] pt-3 text-center">
            <Figure label="MeritScore" on={ranked.key === 'merit'}>
              <MeritCell row={r} compact />
            </Figure>
            <Figure label="Rating" on={ranked.key === 'rating'}>
              <RatingCell row={r} />
            </Figure>
            <Figure label="Delivery" on={ranked.key === 'delivery'}>
              <DeliveryCell row={r} />
            </Figure>
            <Figure label="Wins" on={ranked.key === 'wins'}>
              <span className="font-medium tabular-nums">{r.wins}</span>
            </Figure>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Figure({ label, on, children }: { label: string; on: boolean; children: React.ReactNode }) {
  return (
    <div>
      <dt className={`text-[0.65rem] uppercase tracking-wide ${on ? 'font-semibold text-[var(--primary-color)]' : SECONDARY}`}>
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ cells

/** The place. The first three wear a medal; the rest are a number; no figure, no place. */
function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <Dash why="Unranked: this figure has not been read for them yet" />;
  const medal =
    rank === 1
      ? 'bg-amber-400/25 text-amber-800 ring-amber-500/60 dark:text-amber-300'
      : rank === 2
        ? 'bg-slate-400/25 text-slate-700 ring-slate-400/70 dark:text-slate-200'
        : rank === 3
          ? 'bg-orange-700/15 text-orange-800 ring-orange-700/50 dark:text-orange-300'
          : null;
  if (!medal) return <span className={`font-semibold tabular-nums ${SECONDARY}`}>#{rank}</span>;
  return (
    <span
      className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full px-1.5 text-sm font-bold tabular-nums ring-1 ${medal}`}
    >
      #{rank}
    </span>
  );
}

/** The face, the name, and under it the title and where they are. A real link, for the keyboard. */
function Who({ row }: { row: LeaderboardRow }) {
  const line = [row.headline, row.location].filter(Boolean).join(' – ');
  return (
    <Link
      href={`/profile/${row.userId}`}
      className="flex min-w-0 items-center gap-3 text-[var(--text-color)] no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      <Avatar name={row.name} url={row.avatarUrl} size="md" />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{row.name}</span>
        <span className={`block truncate text-xs ${SECONDARY}`}>{line || 'No title yet'}</span>
      </span>
    </Link>
  );
}

function MeritCell({ row, compact = false }: { row: LeaderboardRow; compact?: boolean }) {
  return (
    <span title={`Merit score ${row.merit} — ${row.band}`}>
      <span className={`font-bold tabular-nums text-[var(--primary-color)] ${compact ? '' : 'text-base'}`}>
        {row.merit}
      </span>
      {!compact && <span className={`block text-xs ${SECONDARY}`}>{row.band}</span>}
    </span>
  );
}

function RatingCell({ row }: { row: LeaderboardRow }) {
  if (row.rating == null) return <Dash why="No rating yet" />;
  return (
    <span className="whitespace-nowrap">
      <span className="font-medium tabular-nums">{starScore(row.rating)}</span>{' '}
      <span className={`text-xs tabular-nums ${SECONDARY}`}>({row.ratingCount})</span>
    </span>
  );
}

function DeliveryCell({ row }: { row: LeaderboardRow }) {
  if (row.delivery == null) return <Dash why="No dated milestone faced yet" />;
  return (
    <span className="whitespace-nowrap">
      <span className="font-medium tabular-nums">{row.delivery}%</span>{' '}
      <span className={`text-xs tabular-nums ${SECONDARY}`}>of {row.deliveryOf}</span>
    </span>
  );
}

/** A figure the portal has not read: a dash that says why, never a nought. */
function Dash({ why }: { why: string }) {
  return (
    <span className={SECONDARY} title={why} aria-label={why}>
      —
    </span>
  );
}

/** The merit score's movement: green up, red down, quiet for unchanged, "new" with no earlier day. */
function Trend({ value, days }: { value: number | null; days: number }) {
  if (value == null) {
    return (
      <span className={`text-xs ${SECONDARY}`} title={`No earlier score within the last ${days} days`}>
        new
      </span>
    );
  }
  if (value === 0) {
    return (
      <span className={`inline-flex items-center gap-1 tabular-nums ${SECONDARY}`} title="Unchanged">
        <i className="pi pi-minus text-xs" aria-hidden />0
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
        up ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      }`}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(value)} in the last ${days} days`}
    >
      <i className={`pi ${up ? 'pi-arrow-up' : 'pi-arrow-down'} text-xs`} aria-hidden />
      <span className="sr-only">{up ? 'up' : 'down'}</span>
      {Math.abs(value)}
    </span>
  );
}

// ------------------------------------------------------------------ states

function Empty({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
      <i className={`pi ${icon} text-3xl ${SECONDARY}`} aria-hidden />
      <p className="mt-3 font-medium">{title}</p>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4"
      aria-hidden
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 py-2">
          <span className="h-8 w-8 rounded-full bg-[var(--surface-hover)]" />
          <span className="h-12 w-12 rounded-full bg-[var(--surface-hover)]" />
          <span className="h-4 flex-1 rounded bg-[var(--surface-hover)]" />
          <span className="h-4 w-16 rounded bg-[var(--surface-hover)]" />
          <span className="h-4 w-16 rounded bg-[var(--surface-hover)]" />
        </div>
      ))}
    </div>
  );
}
