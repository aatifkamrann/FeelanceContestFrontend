import { keepPreviousData } from '@tanstack/react-query';
import type { LeaderboardOption } from '@/lib/leaderboard';
import { AVAILABILITIES, type Availability, type Merit } from '@/lib/profile';
import { apiFetch } from '@/lib/api';

/**
 * The public Talent page — GET /api/public/talent. Four panels of four
 * cards over the same members as the leaderboard, narrowed by six filters.
 * The API decides who fills each panel; this module names the filters the
 * page offers and fetches the page they select.
 */

/** One member as a card: what every panel shows about them. */
export type TalentCard = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** The professional title, as the profile's headline. */
  headline: string | null;
  merit: number;
  band: Merit['band'];
  /** The portal has verified their work: an opportunity won here, or a rating from a client. */
  verified: boolean;
  /** Star average, null before the first rating. */
  rating: number | null;
  ratingCount: number;
  /** Dated milestones met on time as a percentage, null before any dated milestone was faced. */
  delivery: number | null;
  deliveryOf: number;
  wins: number;
  /** The merit score's movement over the trend window; null with no earlier day to compare with. */
  trend: number | null;
  /** The kind of work a Category Leader leads, and its label; null on every other panel. */
  category: string | null;
  categoryLabel: string | null;
};

/** The six filters, as the address carries them; null is "any". */
export type TalentFilters = {
  category: string | null;
  region: string | null;
  merit: string | null;
  availability: string | null;
  experience: string | null;
  wins: string | null;
};

export const FILTER_KEYS = ['category', 'region', 'merit', 'availability', 'experience', 'wins'] as const;

export type Talent = {
  /** The filters as the API read them — an unknown value reads as "any". */
  filters: {
    category: string | null;
    region: string | null;
    merit: number | null;
    availability: Availability | null;
    experience: number | null;
    wins: number | null;
  };
  /** How many members the filters keep, of how many the page could list. */
  matched: number;
  total: number;
  trendDays: number;
  asOfUtc: string;
  top: TalentCard[];
  rising: TalentCard[];
  leaders: TalentCard[];
  champions: TalentCard[];
  regions: LeaderboardOption[];
  categories: LeaderboardOption[];
};

export type FilterOption = { key: string; label: string };

/** The floors of the merit score's bands — the API accepts exactly these. */
export const MERIT_FLOORS: FilterOption[] = [
  { key: '75', label: '75 and above · proven' },
  { key: '50', label: '50 and above · established' },
  { key: '25', label: '25 and above · building' },
];

/** When a member said they can start; "unavailable" is a fact about a member, not a filter anyone asks for. */
export const AVAILABILITY_OPTIONS: FilterOption[] = AVAILABILITIES.filter((a) => a.value !== 'unavailable').map(
  (a) => ({ key: a.value, label: a.label }),
);

export const EXPERIENCE_FLOORS: FilterOption[] = [1, 3, 5, 10].map((n) => ({
  key: String(n),
  label: `${n}+ years`,
}));

export const WIN_FLOORS: FilterOption[] = [1, 3, 5, 10].map((n) => ({
  key: String(n),
  label: n === 1 ? '1 win or more' : `${n} wins or more`,
}));

export function emptyFilters(): TalentFilters {
  return { category: null, region: null, merit: null, availability: null, experience: null, wins: null };
}

export function hasFilters(f: TalentFilters): boolean {
  return FILTER_KEYS.some((k) => f[k]);
}

export function talentQuery(f: TalentFilters) {
  const qs = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) qs.set(k, f[k] as string);
  const s = qs.toString();
  return {
    queryKey: ['public', 'talent', ...FILTER_KEYS.map((k) => f[k])] as const,
    queryFn: async (): Promise<Talent> => {
      const res = await apiFetch(`/api/public/talent${s ? `?${s}` : ''}`);
      if (!res.ok) throw new Error(`Talent unavailable (${res.status})`);
      return (await res.json()) as Talent;
    },
    staleTime: 60_000,
    // Changing a filter keeps the last page on screen until the next one
    // lands, rather than flashing a skeleton between them.
    placeholderData: keepPreviousData,
  };
}

/**
 * Where a panel's "View all" goes: the leaderboard on the board closest to
 * it, carrying a kind of work or a region the filters chose where the board
 * can show one. The other filters have no board, so the board is wider than
 * the panel — which "View all" promises.
 */
export function boardLink(
  panel: 'top' | 'rising' | 'leaders' | 'champions',
  f: TalentFilters,
): string {
  const q = new URLSearchParams();
  if (panel === 'rising') q.set('tab', 'rising');
  else if (panel === 'leaders' || f.category) q.set('tab', 'category');
  else if (f.region) q.set('tab', 'regional');
  if (panel === 'champions') q.set('by', 'delivery');
  if (q.get('tab') === 'category' && f.category) q.set('category', f.category);
  if (q.get('tab') === 'regional' && f.region) q.set('region', f.region);
  const s = q.toString();
  return s ? `/leaderboard?${s}` : '/leaderboard';
}
