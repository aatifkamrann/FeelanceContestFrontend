'use client';

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import Avatar from '@/components/Avatar';
import HelpIcon from '@/components/HelpIcon';
import SiteHeader from '@/components/SiteHeader';
import { starScore } from '@/lib/opportunities';
import type { LeaderboardOption } from '@/lib/leaderboard';
import {
  AVAILABILITY_OPTIONS,
  EXPERIENCE_FLOORS,
  FILTER_KEYS,
  MERIT_FLOORS,
  WIN_FLOORS,
  boardLink,
  hasFilters,
  talentQuery,
  type FilterOption,
  type Talent,
  type TalentCard,
  type TalentFilters,
} from '@/lib/talent';

/*
 * The public Talent page: four panels of four cards over the same members
 * as the leaderboard — the highest merit scores, the fastest climbing, the
 * leader of each kind of work, and the most reliable — narrowed by six
 * filters that live in the address. The API fills the panels; this screen
 * shows what it was sent. Every figure on a card is one the portal
 * recorded, and the filters only narrow: nothing a member wrote about
 * themselves moves them up a panel. A card opens the member's profile,
 * which stays members-only.
 */

const SECONDARY = 'text-[var(--text-color-secondary)]';

/** A panel's colour: the tag by its heading and the badge on each of its cards, readable on both grounds. */
const TONES = {
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
} as const;

type Tone = keyof typeof TONES;

export default function TalentScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters: TalentFilters = {
    category: params.get('category'),
    region: params.get('region'),
    merit: params.get('merit'),
    availability: params.get('availability'),
    experience: params.get('experience'),
    wins: params.get('wins'),
  };

  const { data, isLoading, isError, isFetching, refetch } = useQuery(talentQuery(filters));

  // A panel named in the address — the landing page's Talent menu links
  // straight to each — is scrolled to once the panels are on the page:
  // they arrive with the data, after the browser has looked for it.
  const loaded = !!data;
  useEffect(() => {
    if (!loaded) return;
    const id = window.location.hash.slice(1);
    if (id.startsWith('panel-')) document.getElementById(id)?.scrollIntoView({ block: 'start' });
  }, [loaded]);

  // The address is the state. Only set filters are in it, so the plain
  // /talent is the whole network and a link to a narrowed page stays short.
  const go = useCallback(
    (next: Partial<TalentFilters>) => {
      const q = new URLSearchParams();
      for (const k of FILTER_KEYS) {
        const v = k in next ? next[k] : params.get(k);
        if (v) q.set(k, v);
      }
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const filtered = hasFilters(filters);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <p className={`text-xs font-semibold uppercase tracking-wider ${SECONDARY}`}>The Talent Network</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight [text-wrap:balance]">
            Meet the Talent Moving the Network Forward.
          </h1>
          <p className={`mt-2 max-w-2xl text-base ${SECONDARY}`}>
            Professionals ranked by proven delivery, quality and consistency — not by how well they market
            themselves.
          </p>
        </header>

        {/* Six ways to narrow every panel at once. Category and Region offer only what has somebody on it. */}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
          <Filter
            placeholder="Category"
            value={filters.category}
            options={data?.categories ?? []}
            counted
            onChange={(v) => go({ category: v })}
          />
          <Filter
            placeholder="Region"
            value={filters.region}
            options={data?.regions ?? []}
            counted
            onChange={(v) => go({ region: v })}
          />
          <Filter placeholder="MeritScore" value={filters.merit} options={MERIT_FLOORS} onChange={(v) => go({ merit: v })} />
          <Filter
            placeholder="Availability"
            value={filters.availability}
            options={AVAILABILITY_OPTIONS}
            onChange={(v) => go({ availability: v })}
          />
          <Filter
            placeholder="Experience"
            value={filters.experience}
            options={EXPERIENCE_FLOORS}
            onChange={(v) => go({ experience: v })}
          />
          <Filter
            placeholder="Competition Wins"
            value={filters.wins}
            options={WIN_FLOORS}
            onChange={(v) => go({ wins: v })}
          />
          <HelpIcon topic="talent.filters" />
          {filtered && (
            <Button
              label="Clear filters"
              icon="pi pi-times"
              text
              size="small"
              onClick={() =>
                go({ category: null, region: null, merit: null, availability: null, experience: null, wins: null })
              }
            />
          )}
          {data && (
            <p className={`text-sm sm:ml-auto ${SECONDARY}`} aria-live="polite">
              {filtered ? `${data.matched} of ${data.total} members match.` : `${data.total} members.`}
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-col gap-10" aria-busy={isFetching}>
          {isLoading ? (
            <Skeleton />
          ) : isError || !data ? (
            <Empty icon="pi-exclamation-triangle" title="The talent network could not be loaded">
              <p className={`mt-1 text-sm ${SECONDARY}`}>Nothing here changes anything — this page only reads.</p>
              <Button label="Try again" className="mt-4" outlined onClick={() => void refetch()} />
            </Empty>
          ) : data.total === 0 ? (
            <Empty icon="pi-users" title="Nobody on the network yet">
              <p className={`mt-1 text-sm ${SECONDARY}`}>
                A member appears once their account is confirmed and their merit score is above nought.
              </p>
            </Empty>
          ) : (
            <>
              <Panel
                title="Top Talent"
                tag="Highest MeritScore"
                tone="blue"
                blurb="The highest-ranked professionals across the entire network, measured by overall MeritScore."
                href={boardLink('top', filters)}
                cards={data.top}
                badge={(c) => (
                  <Badge tone="blue" title={`Merit score ${c.merit} — ${c.band}`}>
                    <b className="tabular-nums">{c.merit}</b> Merit
                  </Badge>
                )}
                empty={filtered ? 'Nobody matches these filters.' : 'Nobody has a merit score yet.'}
                topic="talent.panels"
              />
              <Panel
                title="Rising Talent"
                tag="Fastest climbing"
                tone="green"
                blurb="Professionals whose ranking is accelerating fastest this month — the next leaders of the network."
                href={boardLink('rising', filters)}
                cards={data.rising}
                badge={(c) => (
                  <Badge tone="green" title={`Merit score up ${c.trend} in the last ${data.trendDays} days`}>
                    <i className="pi pi-arrow-up text-[0.7rem]" aria-hidden />
                    <span className="sr-only">up</span> <b className="tabular-nums">{c.trend}</b>
                  </Badge>
                )}
                empty={`No score has climbed in the last ${data.trendDays} days yet — a member needs an earlier day to compare with.`}
              />
              <Panel
                title="Category Leaders"
                tag="Ranked #1 in field"
                tone="purple"
                blurb="The top-ranked professional in each major category — the definitive specialist in their field."
                href={boardLink('leaders', filters)}
                cards={data.leaders}
                badge={(c) => (
                  <Badge tone="purple" title={`The top merit score among members who do ${c.categoryLabel ?? 'this kind of work'}`}>
                    <span className="truncate">{c.categoryLabel}</span> <b>#1</b>
                  </Badge>
                )}
                empty={
                  filtered
                    ? 'Nobody matching these filters has named a kind of work.'
                    : 'No member has named a kind of work on their profile yet.'
                }
              />
              <Panel
                title="Delivery Champions"
                tag="Most reliable"
                tone="amber"
                blurb="Professionals with the strongest on-time delivery records — proven, consistent reliability."
                href={boardLink('champions', filters)}
                cards={data.champions}
                badge={(c) => (
                  <Badge tone="amber" title={`${c.delivery}% of ${c.deliveryOf} dated milestones met on time`}>
                    <b className="tabular-nums">{c.delivery}%</b> On-Time
                  </Badge>
                )}
                empty={
                  filtered
                    ? 'Nobody matching these filters has faced a dated milestone yet.'
                    : 'Nobody has faced a dated milestone yet.'
                }
              />
              <p className={`inline-flex flex-wrap items-center gap-1 text-xs ${SECONDARY}`}>
                Every figure is one the portal recorded — a client&apos;s rating, an opportunity won, a milestone met
                on time. The filters narrow; they never order. A tick beside a name means the portal verified
                their work.
                <HelpIcon topic="talent.verified" />
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}

// ----------------------------------------------------------------- filters

function Filter({
  placeholder,
  value,
  options,
  counted = false,
  onChange,
}: {
  placeholder: string;
  value: string | null;
  options: (FilterOption | LeaderboardOption)[];
  counted?: boolean;
  onChange: (key: string | null) => void;
}) {
  return (
    <Dropdown
      value={value}
      options={options}
      optionLabel="label"
      optionValue="key"
      placeholder={placeholder}
      showClear={!!value}
      itemTemplate={
        counted
          ? (o: LeaderboardOption) => (
              <span className="flex items-center justify-between gap-4">
                {o.label}
                <span className={`text-xs tabular-nums ${SECONDARY}`}>{o.count}</span>
              </span>
            )
          : undefined
      }
      onChange={(e) => onChange((e.value as string | null | undefined) ?? null)}
      className={`min-w-[11rem] ${value ? 'border-[var(--primary-color)]' : ''}`}
      aria-label={placeholder}
    />
  );
}

// ------------------------------------------------------------------ panels

/** Heading, tag, blurb and "View all" over one row of four cards — or a quiet line where nobody fills it. */
function Panel({
  title,
  tag,
  tone,
  blurb,
  href,
  cards,
  badge,
  empty,
  topic,
}: {
  title: string;
  tag: string;
  tone: Tone;
  blurb: string;
  href: string;
  cards: TalentCard[];
  badge: (c: TalentCard) => React.ReactNode;
  empty: string;
  topic?: string;
}) {
  const id = `panel-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={id} className="text-xl font-bold tracking-tight">
          {title}
        </h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{tag}</span>
        {topic && <HelpIcon topic={topic} />}
        <Link
          href={href}
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-[var(--primary-color)] no-underline hover:underline"
        >
          View all <i className="pi pi-arrow-right text-xs" aria-hidden />
        </Link>
      </div>
      <p className={`mt-1 max-w-3xl text-sm ${SECONDARY}`}>{blurb}</p>
      {cards.length === 0 ? (
        <p
          className={`mt-4 rounded-2xl border border-dashed border-[var(--surface-border)] p-6 text-center text-sm ${SECONDARY}`}
        >
          {empty}
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={title}>
          {cards.map((c) => (
            <li key={`${c.category ?? ''}:${c.userId}`} className="min-w-0">
              <Card card={c} badge={badge(c)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The pill at a card's top right: the one figure the panel leads on, in the panel's colour. */
function Badge({ tone, title, children }: { tone: Tone; title: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex max-w-[60%] items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone]}`}
      title={title}
    >
      {children}
    </span>
  );
}

// ------------------------------------------------------------------- cards

/**
 * One member: the face and the panel's badge, the name with the tick where
 * the portal has verified their work, the title, and the three figures
 * every panel shares. Lifts on hover where motion is welcome; opens the
 * profile.
 */
function Card({ card, badge }: { card: TalentCard; badge: React.ReactNode }) {
  return (
    <Link
      href={`/profile/${card.userId}`}
      className="group flex h-full flex-col rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4 text-[var(--text-color)] no-underline shadow-sm transition duration-200 hover:shadow-lg motion-safe:hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
    >
      <div className="flex items-start justify-between gap-2">
        <Avatar name={card.name} url={card.avatarUrl} size="md" />
        {badge}
      </div>
      <p className="mt-3 flex min-w-0 items-center gap-1.5">
        <span className="truncate font-bold">{card.name}</span>
        {card.verified && (
          <>
            <i
              className="pi pi-verified shrink-0 text-[var(--primary-color)]"
              title="Verified: an opportunity won here, or a rating from a client"
              aria-hidden
            />
            <span className="sr-only">Verified</span>
          </>
        )}
      </p>
      <p className={`truncate text-sm ${SECONDARY}`}>{card.headline ?? 'No title yet'}</p>
      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-[var(--surface-border)] pt-3">
        <Figure label="Rating">
          {card.rating == null ? (
            <Dash why="No rating yet" />
          ) : (
            <span title={`${card.ratingCount} rating${card.ratingCount === 1 ? '' : 's'}`}>{starScore(card.rating)}</span>
          )}
        </Figure>
        <Figure label="Wins">{card.wins}</Figure>
        <Figure label="On-Time">
          {card.delivery == null ? (
            <Dash why="No dated milestone faced yet" />
          ) : (
            <span title={`of ${card.deliveryOf} dated milestone${card.deliveryOf === 1 ? '' : 's'}`}>{card.delivery}%</span>
          )}
        </Figure>
      </dl>
    </Link>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dd className="truncate text-base font-bold tabular-nums">{children}</dd>
      <dt className={`text-[0.65rem] uppercase tracking-wide ${SECONDARY}`}>{label}</dt>
    </div>
  );
}

/** A figure the portal has not read: a dash that says why, never a nought. */
function Dash({ why }: { why: string }) {
  return (
    <span className={`font-normal ${SECONDARY}`} title={why} aria-label={why}>
      —
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
    <div className="flex flex-col gap-10" aria-hidden>
      {Array.from({ length: 2 }, (_, p) => (
        <div key={p}>
          <div className="h-6 w-48 animate-pulse rounded bg-[var(--surface-hover)]" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4"
              >
                <div className="flex justify-between">
                  <span className="h-14 w-14 rounded-full bg-[var(--surface-hover)]" />
                  <span className="h-6 w-20 rounded-full bg-[var(--surface-hover)]" />
                </div>
                <span className="mt-3 block h-4 w-2/3 rounded bg-[var(--surface-hover)]" />
                <span className="mt-2 block h-3 w-1/2 rounded bg-[var(--surface-hover)]" />
                <span className="mt-4 block h-8 rounded bg-[var(--surface-hover)]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
