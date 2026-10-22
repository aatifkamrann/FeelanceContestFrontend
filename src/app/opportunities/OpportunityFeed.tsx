'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import { Dropdown } from 'primereact/dropdown';
import { ToggleButton } from 'primereact/togglebutton';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import Avatar from '@/components/Avatar';
import StatusTag from '@/components/StatusTag';
import AwardTimeline from '@/components/AwardTimeline';
import OpportunityFacts from '@/components/OpportunityFacts';
import HelpIcon from '@/components/HelpIcon';
import LivePulse from '@/components/LivePulse';
import MatchRing from '@/components/MatchRing';
import ApplicationsLine from '@/components/ApplicationsLine';
import {
  fetchFeed,
  aiStatusQuery,
  meQuery,
  categoriesQuery,
  offered,
  opportunityStatsQuery,
  fitLabel,
  compactAward,
  deadlineLabel,
  starScore,
  count,
  deliveryLabel,
  pulseState,
  timelineFrom,
  type OpportunityCard,
  type OpportunityFeed as Feed,
  type OpportunityFitResult,
  type MyEntry,
} from '@/lib/opportunities';
import { feedFiltersOf, feedHref, feedListKey, type FeedFilters } from '@/lib/feed';
import { notificationsQuery } from '@/lib/notifications';
import { apiFetch } from '@/lib/api';

const STATUS_OPTIONS = [
  { label: 'Open for entry', value: 'open' },
  { label: 'All opportunities', value: 'all' },
];

type View = 'cards' | 'list';
const VIEW_OPTIONS = [
  { icon: 'pi pi-th-large', value: 'cards', label: 'Cards' },
  { icon: 'pi pi-list', value: 'list', label: 'List' },
];
const VIEW_KEY = 'wp.feed.view';
/** How long the box must sit still before what is in it is searched. */
const SEARCH_PAUSE_MS = 350;

/**
 * Opportunities — the feed: search (the tsvector on the API side, and the
 * title as typed), the status filter, kind-of-work filters, the "ending
 * soonest" and "high award" orders, and keyset "load more" — never offset
 * pages, per the blueprint's list rules. Two layouts over the same rows:
 * three columns of cards, or the one-per-line list. The three figures
 * beside the search are across everything open for entry, whatever the
 * filters say.
 *
 * The Recommended switch is the one thing here that knows the viewer: it
 * asks the API to judge every card against the signed-in freelancer's
 * profile, and the cards come back coloured — green fits, amber can enter
 * but is not their kind of work, red cannot enter and says why. It is a
 * reading, not a filter: nothing is hidden, because "this is not for you"
 * is worth seeing as much as "this is".
 *
 * Amber is the half of that a model answers, and a portal with AI off has
 * nobody to ask — so the legend below only promises the colours this
 * portal can actually produce. Green and red are arithmetic and always can.
 *
 * The address is the state (lib/feed.ts): the landing page's menus open
 * the list already narrowed — ending soonest, largest award, a category,
 * Recommended — and every filter changed here is written back, so a
 * narrowed list can be copied, reloaded or come back to. Only the search
 * box keeps a state of its own while it is being typed in.
 */
export default function OpportunityFeed({ initial, initialFor }: { initial: Feed; initialFor: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = feedFiltersOf((k) => searchParams.get(k));
  const { q: submittedQ, status, category, subcategory, sort, recommended } = filters;
  const ending = sort === 'ending';
  const award = sort === 'award';
  // Replaced rather than pushed, as the leaderboard does: Back leaves the
  // list instead of stepping through every filter tried on the way.
  const go = useCallback(
    (next: Partial<FeedFilters>) => {
      const current = feedFiltersOf((k) => searchParams.get(k));
      router.replace(feedHref({ ...current, ...next }), { scroll: false });
    },
    [router, searchParams],
  );

  const [q, setQ] = useState(submittedQ);
  // The last search this box wrote to the address. Anything else arriving
  // there — a link, Back — is a search from outside, and the box follows it.
  const written = useRef(submittedQ);
  useEffect(() => {
    if (submittedQ === written.current) return;
    written.current = submittedQ;
    setQ(submittedQ);
  }, [submittedQ]);
  const runSearch = useCallback(
    (next: string) => {
      written.current = next;
      go({ q: next });
    },
    [go],
  );

  const [view, setView] = useState<View>('cards');
  // The pages "Load more" added, for the list they were loaded under: a
  // changed filter is a different list, and its pages start again. The
  // cursor is undefined until a page has been loaded, and null once the
  // last one has.
  const listKey = feedListKey(filters);
  const [more, setMore] = useState<{ key: string; items: OpportunityCard[]; cursor?: string | null }>({
    key: '',
    items: [],
  });
  const extra = more.key === listKey ? more.items : [];
  const [loadingMore, setLoadingMore] = useState(false);

  // The layout is a per-device preference, read after mount so the server
  // render and the first client render agree on three columns.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'cards') setView(saved);
    } catch {
      /* private mode, or storage blocked */
    }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* fine — it just will not be remembered */
    }
  };

  const { data: me } = useQuery(meQuery);
  const { data: aiStatus } = useQuery(aiStatusQuery);
  const { data: stats } = useQuery(opportunityStatsQuery);
  // Whether anything reads what kind of work a member does — see above.
  const readsWork = aiStatus?.features.recommended ?? false;
  const freelancer = me?.role === 'freelancer';
  // The switch only means something with a profile to judge against. The
  // fit itself is read for every signed-in freelancer — the ring on each
  // card is their match — and the switch decides whether the cards are
  // coloured by it and say why.
  const fit = recommended && freelancer;

  const { data: taxonomy } = useQuery(categoriesQuery);
  const categoryDef = taxonomy?.categories.find((c) => c.key === category) ?? null;
  // A retired kind is not offered, unless the address already asks for it.
  const categoryOptions = offered(taxonomy?.categories, category);
  const subcategoryOptions = offered(categoryDef?.subcategories, subcategory);
  // A key the taxonomy does not know — an old link, a hand-typed one — is
  // dropped rather than left filtering the feed to nothing; so is a
  // subcategory that is not one of its category's.
  useEffect(() => {
    if (!taxonomy || !category) return;
    const def = taxonomy.categories.find((c) => c.key === category);
    if (!def) go({ category: null, subcategory: null });
    else if (subcategory && !def.subcategories.some((s) => s.key === subcategory)) go({ subcategory: null });
  }, [taxonomy, category, subcategory, go]);

  const params = {
    q: submittedQ || undefined,
    status,
    category: category ?? undefined,
    subcategory: subcategory ?? undefined,
    sort: sort ?? undefined,
    fit: freelancer || undefined,
  };
  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['feed', listKey, freelancer],
    queryFn: () => fetchFeed(params),
    // The server read the same address, so its page is this list's first
    // until a filter moves away from it.
    initialData: listKey === initialFor ? initial : undefined,
    // The server's page knows no viewer: a freelancer keeps it on screen
    // and is fetched their own copy, rings and all, at once.
    initialDataUpdatedAt: freelancer ? 0 : undefined,
    // While a new search is on its way the last answer stays on screen,
    // so typing does not blank the list between words.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  // A freelancer scanning the feed should see at a glance which briefs
  // they are already in. The feed itself is public and knows no viewer,
  // so their own entries are joined in here; the query key is shared with
  // My Opportunities, so the two never disagree.
  const { data: myEntries } = useQuery({
    queryKey: ['my-entries'],
    queryFn: async (): Promise<MyEntry[]> => {
      const res = await apiFetch('/api/entries/mine');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: freelancer,
  });
  const mine = new Map<string, MyEntry>();
  for (const e of myEntries ?? []) if (e.status === 'active') mine.set(e.opportunity.slug, e);

  // The feed is where a freelancer comes looking for new opportunities; the
  // one who has not asked to be told about them is offered it here, once.
  const { data: notify } = useQuery({ ...notificationsQuery, enabled: freelancer });
  const offerHeadsUp = freelancer && notify != null && !notify.newOpportunities;

  // The list follows the box: once typing pauses, what is in the box is
  // the search, so a word is not fetched letter by letter. Enter runs it
  // at once, and a space added or trimmed is not a new search.
  useEffect(() => {
    const next = q.trim();
    if (next === submittedQ) return;
    const timer = setTimeout(() => runSearch(next), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [q, submittedQ, runSearch]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const next = q.trim();
    if (next === submittedQ) return;
    runSearch(next);
  };

  // Back to the full list in one press, whether the search was submitted
  // or only typed; the filters are their own controls and keep their values.
  const clear = () => {
    setQ('');
    runSearch('');
  };

  const items = [...(data?.items ?? []), ...extra];
  // Once "Load more" has run for this list, its cursor is the one to follow
  // — null included, which means the last page is on screen.
  const moreCursor = more.key === listKey ? more.cursor : undefined;
  const nextCursor = moreCursor !== undefined ? moreCursor : isPlaceholderData ? null : (data?.nextCursor ?? null);

  const loadMore = async () => {
    if (!nextCursor) return;
    const key = listKey;
    setLoadingMore(true);
    try {
      const page = await fetchFeed({ ...params, cursor: nextCursor });
      setMore((prev) => ({
        key,
        items: [...(prev.key === key ? prev.items : []), ...page.items],
        cursor: page.nextCursor,
      }));
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = !!category || ending || submittedQ !== '';

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        {/* The pulse a live card wears, over the whole list. */}
        <LivePulse state="live" prefix="Opportunity terminal" />
        <h1 className="mt-2 text-3xl font-bold">Opportunities</h1>
        <p className="mt-2 max-w-2xl text-[var(--text-color-secondary)]">
          Find where your skills have the strongest edge.
        </p>
        {offerHeadsUp && (
          <p className="mt-2 text-sm">
            <Link
              href="/notifications"
              className="text-[var(--primary-color)] no-underline hover:underline"
            >
              <i className="pi pi-bell mr-1" aria-hidden />
              Get told the moment an opportunity opens
            </Link>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={search} className="flex flex-1 items-center" role="search">
          <span className="relative flex-1">
            {/* No button: the list answers as the box is typed in. The
                glass turns while a search is on its way. */}
            <i
              className={
                'pi pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-color-secondary)] ' +
                (isFetching && (q || submittedQ) ? 'pi-spin pi-spinner' : 'pi-search')
              }
              aria-hidden
            />
            <InputText
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Opportunities"
              className={q || submittedQ ? 'w-full !pl-10 !pr-10' : 'w-full !pl-10'}
              aria-label="Search opportunities"
              enterKeyHint="search"
            />
            {(q || submittedQ) && (
              <Button
                type="button"
                icon="pi pi-times"
                aria-label="Clear search"
                text
                rounded
                size="small"
                className="wp-search-clear"
                onClick={clear}
              />
            )}
          </span>
        </form>
        {/* Across everything open for entry. The filters below do not move
            these: they are the state of the portal, not of the list. */}
        {stats && (
          <div role="group" aria-label="Across every open opportunity" className="flex items-center gap-6 sm:px-2">
            <Figure value={stats.open} label="Open" />
            <Figure value={compactAward(stats.rewards, stats.currency)} label="In Rewards" tone="blue" />
            <Figure value={stats.endingSoon} label="Ending Soon" tone="orange" />
          </div>
        )}
        <SelectButton
          value={view}
          onChange={(e) => e.value && chooseView(e.value as View)}
          options={VIEW_OPTIONS}
          optionLabel="label"
          itemTemplate={(o: (typeof VIEW_OPTIONS)[number]) => (
            <i className={o.icon} aria-hidden title={o.label} />
          )}
          allowEmpty={false}
          aria-label="Layout"
        />
      </div>

      {/* The filters: what state, what kind, what order, and — for a
          freelancer — whether to read the list against their profile. */}
      <div className="flex flex-wrap items-center gap-2">
        <SelectButton
          value={status}
          onChange={(e) => e.value && go({ status: e.value })}
          options={STATUS_OPTIONS}
          allowEmpty={false}
        />
        <Dropdown
          value={category}
          options={categoryOptions}
          optionLabel="label"
          optionValue="key"
          placeholder="Any category"
          showClear
          onChange={(e) => go({ category: e.value ?? null, subcategory: null })}
          className="min-w-[12rem]"
          aria-label="Category"
        />
        <Dropdown
          value={subcategory}
          options={subcategoryOptions}
          optionLabel="label"
          optionValue="key"
          placeholder={categoryDef ? 'Any subcategory' : 'Pick a category first'}
          showClear
          disabled={subcategoryOptions.length === 0}
          onChange={(e) => go({ subcategory: e.value ?? null })}
          className="min-w-[12rem]"
          aria-label="Subcategory"
        />
        <ToggleButton
          checked={ending}
          onChange={(e) => go({ sort: e.value ? 'ending' : null })}
          onLabel="Ending soonest"
          offLabel="Ending soonest"
          onIcon="pi pi-clock"
          offIcon="pi pi-clock"
          aria-label="Order by soonest deadline"
        />
        {/* Disabled rather than hidden for a visitor: the switch is a
            reason to sign in, and it says so. */}
        <span
          title={
            freelancer
              ? 'Colour every card by how well it fits your profile'
              : 'Sign in as a freelancer to see which opportunities fit your profile'
          }
        >
          <ToggleButton
            checked={fit}
            disabled={!freelancer}
            onChange={(e) => go({ recommended: e.value })}
            onLabel="Recommended"
            offLabel="Recommended"
            onIcon="pi pi-sparkles"
            offIcon="pi pi-sparkles"
            aria-label="Read the list against my profile"
          />
        </span>
        {/* One order or the other: the largest award first, or the soonest
            deadline. It reorders; nothing is hidden by it. */}
        <ToggleButton
          checked={award}
          onChange={(e) => go({ sort: e.value ? 'award' : null })}
          onLabel="High award"
          offLabel="High award"
          onIcon="pi pi-dollar"
          offIcon="pi pi-dollar"
          aria-label="Order by largest award"
        />
      </div>

      {freelancer && (
        <p className="text-sm text-[var(--text-color-secondary)]">
          The ring on each card is your match — how much of what the opportunity asks for your
          profile already has.
          <HelpIcon topic="opportunity.match" label="How the match is worked out" />
          {fit && (
            <>
              {' '}
              Each card is also coloured against your skills and merit score.{' '}
              <Legend colour="green" /> fits your profile.{' '}
              {readsWork && (
                <>
                  <Legend colour="amber" /> you can enter, but it is outside your usual work.{' '}
                </>
              )}
              <Legend colour="red" /> not open to you — the card says what is missing, and{' '}
              <Link href="/profile" className="text-[var(--primary-color)] hover:underline">
                your profile
              </Link>{' '}
              is where it is fixed.
            </>
          )}
        </p>
      )}

      {/* Arrived by a Recommended link — the landing page's menus offer
          one — with no freelancer's profile to read the list against. */}
      {recommended && !freelancer && (
        <p className="text-sm text-[var(--text-color-secondary)]">
          <i className="pi pi-sparkles mr-1 text-[var(--primary-color)]" aria-hidden />
          Recommended colours every card by how well it fits a freelancer&apos;s profile.{' '}
          {me ? (
            'It reads a freelancer account, so there is nothing to colour on this one.'
          ) : (
            <>
              <Link
                href={`/login?next=${encodeURIComponent(feedHref(filters))}`}
                className="text-[var(--primary-color)] hover:underline"
              >
                Sign in
              </Link>{' '}
              as a freelancer to see which opportunities fit you.
            </>
          )}
        </p>
      )}

      {isFetching && items.length === 0 ? (
        <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading opportunities…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
          <i className="pi pi-inbox text-3xl text-[var(--text-color-secondary)]" />
          <p className="mt-3 font-medium">No opportunities match</p>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            {filtered && status === 'open' ? (
              // The match may well exist and be closed; say so, and make the
              // wider search one press away rather than a filter to find.
              <>
                Nothing open for entry matches.{' '}
                <button
                  type="button"
                  onClick={() => go({ status: 'all' })}
                  className="text-[var(--primary-color)] hover:underline"
                >
                  Search all opportunities
                </button>{' '}
                to include closed ones, or widen the filters.
              </>
            ) : filtered ? (
              'Try a broader search, or clear a filter.'
            ) : status === 'open' ? (
              'Nothing is open for entry right now — check back soon.'
            ) : (
              'Nothing has been posted yet.'
            )}
          </p>
          {(submittedQ || category) && (
            <Button
              label="Clear filters"
              icon="pi pi-times"
              text
              size="small"
              className="mt-3"
              onClick={() => {
                setQ('');
                written.current = '';
                go({ q: '', category: null, subcategory: null });
              }}
            />
          )}
        </div>
      ) : view === 'cards' ? (
        <div
          className={'grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3' + (isPlaceholderData ? ' opacity-60' : '')}
          aria-busy={isPlaceholderData}
        >
          {items.map((c) => (
            <OpportunityCardView key={c.slug} opportunity={c} entry={mine.get(c.slug)} layout="card" verdicts={fit} />
          ))}
        </div>
      ) : (
        <div
          className={'flex flex-col gap-3 transition-opacity' + (isPlaceholderData ? ' opacity-60' : '')}
          aria-busy={isPlaceholderData}
        >
          {items.map((c) => (
            <OpportunityCardView key={c.slug} opportunity={c} entry={mine.get(c.slug)} layout="row" verdicts={fit} />
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="text-center">
          <Button
            label="Load more"
            icon="pi pi-chevron-down"
            text
            loading={loadingMore}
            onClick={loadMore}
          />
        </div>
      )}
    </div>
  );
}

/** One of the figures beside the search: the number over what it counts. */
/** A figure in the strip may wear a colour: the money reads blue, the deadlines orange, the count the plain text colour. */
const FIGURE_TONES = {
  plain: 'text-[var(--text-color)]',
  blue: 'text-blue-600 dark:text-blue-400',
  orange: 'text-orange-600 dark:text-orange-400',
} as const;

function Figure({
  value,
  label,
  tone = 'plain',
}: {
  value: number | string;
  label: string;
  tone?: keyof typeof FIGURE_TONES;
}) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold leading-tight tabular-nums ${FIGURE_TONES[tone]}`}>{value}</p>
      <p className="text-xs uppercase tracking-wide text-[var(--text-color-secondary)]">{label}</p>
    </div>
  );
}

function Legend({ colour }: { colour: 'green' | 'amber' | 'red' }) {
  const bg = { green: 'bg-green-600', amber: 'bg-amber-500', red: 'bg-red-600' }[colour];
  return (
    <span
      className={`mx-0.5 inline-block h-2.5 w-2.5 rounded-full align-middle ${bg}`}
      aria-label={colour}
      role="img"
    />
  );
}

/** The colour a fit wears — the outline of the card and the tint behind it. */
const FIT_CLASS: Record<OpportunityFitResult['verdict'], string> = {
  fit: 'border-green-600 bg-green-500/5 hover:border-green-700',
  outside: 'border-amber-500 bg-amber-500/5 hover:border-amber-600',
  blocked: 'border-red-500 bg-red-500/5 hover:border-red-600',
};

/** The verdict's mark: grey like every mark at the head of a line; the card's outline carries the colour. */
const FIT_ICON: Record<OpportunityFitResult['verdict'], string> = {
  fit: 'pi-check-circle',
  outside: 'pi-info-circle',
  blocked: 'pi-ban',
};

/** The verdict line on a coloured card, with the reasons under it. */
function FitLine({ fit }: { fit: OpportunityFitResult }) {
  return (
    <div className="mt-3 border-t border-[var(--surface-border)] pt-2 text-sm">
      <p className="font-medium">
        <i className={`pi ${FIT_ICON[fit.verdict]} wp-note-icon mr-1`} aria-hidden />
        {fitLabel(fit.verdict)}
      </p>
      {fit.reasons.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-[var(--text-color-secondary)]">
          {fit.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One opportunity, as a card in the grid or a row in the list — the same facts
 * in two shapes. The card leads with the award and clamps the title; the
 * row has the width to say everything on one line. Exported for the one
 * card on the welcome screen, which must be this card and not a copy.
 *
 * The top strip is the same in both: the viewer's match ring at the left
 * where there is a fit to draw, and the opportunity's clock at the right. The
 * colouring and the reasons under the brief come only where "verdicts"
 * asks for them — the Opportunities page's Recommended switch.
 */
export function OpportunityCardView({
  opportunity: c,
  entry,
  layout,
  verdicts = true,
  note,
}: {
  opportunity: OpportunityCard;
  entry?: MyEntry;
  layout: 'card' | 'row';
  verdicts?: boolean;
  /** Something of the reader's own above the footer: the welcome screen's past work that fits. */
  note?: React.ReactNode;
}) {
  const closing = deadlineLabel(c.deadlineUtc);
  const figures = {
    awardAmount: c.awardAmount,
    currency: c.currency,
    fromUtc: timelineFrom(c.startsAtUtc, c.publishedAtUtc),
    deadlineUtc: c.deadlineUtc,
  };
  const card = layout === 'card';
  const fitClass = verdicts && c.fit ? FIT_CLASS[c.fit.verdict] : 'border-[var(--surface-border)] bg-[var(--surface-card)] hover:border-[var(--primary-color)]';

  const strip = (
    <div className="mb-3 flex items-start justify-between gap-3">
      {c.fit ? <MatchRing fit={c.fit} /> : <span />}
      <LivePulse state={pulseState(c)} />
    </div>
  );

  const trustLine = (
    <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
      {/* The trust line: how this client's past promises went, before
          anyone opens the brief. A client with no rating and no paid
          award shows no score at all, not a label. Each fragment holds together on a narrow screen: the line
          breaks only after a separator, never inside a date. */}
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
        <Avatar name={c.clientName} url={c.clientAvatarUrl} size="xs" />
        by {c.clientName}
      </span>
      {c.clientRatingCount > 0 && (
        <>
          {' · '}
          <span className="whitespace-nowrap font-medium text-[var(--text-color)]">
            {starScore(c.clientRatingAvg!)}
          </span>
        </>
      )}
      {c.clientAwardsPaid > 0 && (
        <>
          {' · '}
          <span className="whitespace-nowrap">
            {c.clientAwardsPaid} award{c.clientAwardsPaid === 1 ? '' : 's'} paid
          </span>
        </>
      )}
      {c.publishedAtUtc && !card && (
        <>
          {' · '}
          <span className="whitespace-nowrap">
            posted{' '}
            {new Date(c.publishedAtUtc).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </>
      )}
    </p>
  );

  const entryTag =
    entry &&
    (entry.won ? (
      c.kind === 'milestones' ? (
        <Tag value="Hired" severity="success" icon="pi pi-briefcase" rounded />
      ) : (
        <Tag value="You won" severity="success" icon="pi pi-trophy" rounded />
      )
    ) : c.status === 'awarded' ? (
      <Tag
        value="Not selected"
        rounded
        style={{ background: 'var(--surface-border)', color: 'var(--text-color-secondary)' }}
      />
    ) : (
      <Tag value="Entered" severity="success" icon="pi pi-check" rounded />
    ));

  const footer = (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${card ? 'mt-auto pt-4' : 'mt-4'}`}>
      <StatusTag status={c.status} />
      {/* How it pays, where it is not the competition every card assumes. */}
      {c.kind === 'milestones' && (
        <Tag value="Paid by milestone" icon="pi pi-wallet" severity="info" rounded title="One freelancer is hired and paid milestone by milestone" />
      )}
      {entryTag}
      <span className="text-[var(--text-color-secondary)]">
        <i className="pi pi-users mr-1" aria-hidden />
        {card ? c.entrantCount : count(c.entrantCount, 'entrant')}
      </span>
      <span className="text-[var(--text-color-secondary)]">
        <i className="pi pi-list-check mr-1" aria-hidden />
        {card ? c.milestoneCount : count(c.milestoneCount, 'milestone')}
      </span>
      {/* How the work arrives, up front: an entrant with no GitHub
          account needs to know before opening a brief they cannot enter. */}
      <span className="text-[var(--text-color-secondary)]" title="How entrants hand work in">
        <i className={`pi ${c.delivery === 'upload' ? 'pi-upload' : 'pi-github'} mr-1`} aria-hidden />
        {card ? '' : deliveryLabel(c.delivery)}
      </span>
      {/* Open and building, but shut to newcomers — the one thing a
          browsing entrant needs before they click through. */}
      {c.status === 'open' && !c.entryOpen && (
        <Tag value="Entry closed" severity="warning" icon="pi pi-lock" rounded />
      )}
      {closing && (
        <span className="ml-auto font-medium text-[var(--text-color)]">
          <i className="pi pi-clock mr-1" aria-hidden />
          {closing}
        </span>
      )}
    </div>
  );

  if (card) {
    return (
      <Link href={`/opportunities/${c.slug}`} className="flex no-underline">
        <article className={`flex w-full flex-col rounded-xl border p-5 transition-colors ${fitClass}`}>
          {strip}
          <AwardTimeline {...figures} />
          <h2 className="mt-2 line-clamp-2 text-lg font-semibold leading-snug text-[var(--text-color)]">
            {c.title}
          </h2>
          {trustLine}
          <OpportunityFacts
            categoryLabel={c.categoryLabel}
            subcategoryLabel={c.subcategoryLabel}
            skills={c.skills}
            minMeritScore={c.minMeritScore}
            requiresCompose={c.requiresCompose}
            compact
            className="mt-3"
          />
          {c.excerpt && (
            <p className="mt-3 line-clamp-3 text-sm text-[var(--text-color-secondary)]">
              {c.excerpt}
            </p>
          )}
          <ApplicationsLine opportunity={c} className="mt-3" />
          {verdicts && c.fit && <FitLine fit={c.fit} />}
          {note}
          {footer}
        </article>
      </Link>
    );
  }

  return (
    <Link href={`/opportunities/${c.slug}`} className="no-underline">
      <article className={`rounded-xl border p-5 transition-colors ${fitClass}`}>
        {strip}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text-color)]">{c.title}</h2>
            {trustLine}
          </div>
          <AwardTimeline {...figures} layout="stacked" className="ml-auto" />
        </div>

        <OpportunityFacts
          categoryLabel={c.categoryLabel}
          subcategoryLabel={c.subcategoryLabel}
          skills={c.skills}
          minMeritScore={c.minMeritScore}
          requiresCompose={c.requiresCompose}
          className="mt-3"
        />

        {c.excerpt && (
          <p className="mt-3 line-clamp-2 text-sm text-[var(--text-color-secondary)]">
            {c.excerpt}
          </p>
        )}
        <ApplicationsLine opportunity={c} className="mt-3" />

        {verdicts && c.fit && <FitLine fit={c.fit} />}
        {note}
        {footer}
      </article>
    </Link>
  );
}
