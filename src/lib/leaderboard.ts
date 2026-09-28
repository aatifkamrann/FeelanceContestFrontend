import { keepPreviousData } from '@tanstack/react-query';
import type { Merit } from '@/lib/profile';
import { apiFetch } from '@/lib/api';

/**
 * The public leaderboard — GET /api/public/leaderboard. The API decides who
 * is on each board and in what order; this module only names the choices
 * the page offers and fetches the board they select.
 */

/** How often an open board asks for a fresh read. The API reads live; this is how live the page is. */
export const LIVE_EVERY_MS = 30_000;

export type LeaderboardTab = 'global' | 'regional' | 'category' | 'rising' | 'performance';

export type RankBy = 'merit' | 'rating' | 'delivery' | 'wins';

export type LeaderboardRow = {
  /**
   * Competition rank on the chosen figure — equals share one, the next takes
   * the place after them. Null where the figure has not been read for this
   * member (no rating yet, no dated milestone faced): sorted last, unranked.
   */
  rank: number | null;
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** The professional title, as the profile's headline. */
  headline: string | null;
  location: string | null;
  merit: number;
  band: Merit['band'];
  /** Star average, null before the first rating. */
  rating: number | null;
  ratingCount: number;
  /** Dated milestones met on time as a percentage, null before any dated milestone was faced. */
  delivery: number | null;
  deliveryOf: number;
  wins: number;
  /** The merit score's movement over the trend window; null with no earlier day to compare with. */
  trend: number | null;
  joinedAtUtc: string;
};

/** One of the tab's top three by merit score — the podium over the table, whatever orders it. */
export type PodiumRow = {
  rank: number | null;
  userId: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  merit: number;
  band: Merit['band'];
};

/** A region or a kind of work the picker offers, with how many it would list. */
export type LeaderboardOption = { key: string; label: string; count: number };

export type Leaderboard = {
  tab: LeaderboardTab;
  by: RankBy;
  /** The region shown — the one asked for, or the fullest when the tab needed one and none was asked. */
  region: string | null;
  category: string | null;
  trendDays: number;
  risingDays: number;
  asOfUtc: string;
  /** How many the board lists; rows carry at most the API's cap. */
  total: number;
  /** The tab's top three by merit, best first; fewer where the board has fewer. */
  podium: PodiumRow[];
  rows: LeaderboardRow[];
  regions: LeaderboardOption[];
  categories: LeaderboardOption[];
};

export const TABS: { key: LeaderboardTab; label: string; icon: string }[] = [
  { key: 'global', label: 'Global', icon: 'pi pi-globe' },
  { key: 'regional', label: 'Regional', icon: 'pi pi-map-marker' },
  { key: 'category', label: 'Category', icon: 'pi pi-tags' },
  { key: 'rising', label: 'Rising Talent', icon: 'pi pi-arrow-up-right' },
  { key: 'performance', label: 'Performance Leaders', icon: 'pi pi-star' },
];

export const RANK_BY: { key: RankBy; label: string; column: string }[] = [
  { key: 'merit', label: 'MeritScore', column: 'MeritScore' },
  { key: 'rating', label: 'Rating', column: 'Rating' },
  { key: 'delivery', label: 'Delivery', column: 'Delivery' },
  { key: 'wins', label: 'Competition Wins', column: 'Wins' },
];

/** The tab an address names; anything else is the global board, as the API reads it. */
export function tabOf(s: string | null | undefined): LeaderboardTab {
  const key = (s ?? '').trim().toLowerCase();
  return TABS.some((t) => t.key === key) ? (key as LeaderboardTab) : 'global';
}

/** The ordering an address names; anything else is the merit score. */
export function rankByOf(s: string | null | undefined): RankBy {
  const key = (s ?? '').trim().toLowerCase();
  return RANK_BY.some((r) => r.key === key) ? (key as RankBy) : 'merit';
}

export type LeaderboardParams = {
  tab: LeaderboardTab;
  by: RankBy;
  region: string | null;
  category: string | null;
};

export function leaderboardQuery(p: LeaderboardParams) {
  const qs = new URLSearchParams({ tab: p.tab, by: p.by });
  if (p.region) qs.set('region', p.region);
  if (p.category) qs.set('category', p.category);
  return {
    queryKey: ['public', 'leaderboard', p.tab, p.by, p.region, p.category] as const,
    queryFn: async (): Promise<Leaderboard> => {
      const res = await apiFetch(`/api/public/leaderboard?${qs.toString()}`);
      if (!res.ok) throw new Error(`Leaderboard unavailable (${res.status})`);
      return (await res.json()) as Leaderboard;
    },
    staleTime: LIVE_EVERY_MS,
    // A live board: asked again every half minute while the page is on
    // screen, and at once when it comes back into focus. Not while hidden.
    refetchInterval: LIVE_EVERY_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // Switching a tab or an ordering keeps the last board on screen until
    // the next one lands, rather than flashing a skeleton between them.
    placeholderData: keepPreviousData,
  };
}

/** Who is on the board being shown, in one line under the tabs. */
export function tabNote(data: Leaderboard): string {
  switch (data.tab) {
    case 'regional': {
      const label = data.regions.find((r) => r.key === data.region)?.label;
      return label
        ? `Members placed in ${label} by the time zone on their profile.`
        : 'No member has a time zone on their profile yet, so nobody is placed on a region.';
    }
    case 'category': {
      const label = data.categories.find((c) => c.key === data.category)?.label;
      return label
        ? `Members who do ${label}, as their primary or a secondary kind of work.`
        : 'No member has named a kind of work on their profile yet.';
    }
    case 'rising':
      return `Members who joined in the last ${data.risingDays} days.`;
    case 'performance':
      return 'Members a client has scored — an opportunity won or a rating given.';
    default:
      return 'Every freelancer with a merit score.';
  }
}
