import { linkTo } from './links';

/**
 * The Opportunities list's address. What the list is narrowed to and in
 * what order lives in it, so a link can open the list already filtered —
 * the landing page's menus, "View Similar Opportunities" — and a filtered
 * list can be copied, reloaded or come back to. Only what differs from the
 * plain list is written: /opportunities alone is everything open for entry.
 */
export const FEED_PATH = '/opportunities';

/** "ending" puts the soonest deadline first and drops what has ended; "award" the largest award. */
export type FeedSort = 'ending' | 'award';

export type FeedFilters = {
  /** The search, trimmed; empty for none. */
  q: string;
  /** Open for entry (the default), or every opportunity, closed ones too. */
  status: 'open' | 'all';
  category: string | null;
  /** Only with a category: a subcategory belongs to one. */
  subcategory: string | null;
  sort: FeedSort | null;
  /** Colour the cards by how well each fits the signed-in freelancer. */
  recommended: boolean;
};

/** The filters an address carries; anything it does not know reads as the default. */
export function feedFiltersOf(get: (key: string) => string | null | undefined): FeedFilters {
  const category = get('category')?.trim() || null;
  const sort = get('sort');
  return {
    q: get('q')?.trim() ?? '',
    status: get('status') === 'all' ? 'all' : 'open',
    category,
    subcategory: (category && get('subcategory')?.trim()) || null,
    sort: sort === 'ending' || sort === 'award' ? sort : null,
    recommended: get('recommended') === '1',
  };
}

/** The list's address, narrowed to these filters; the ones left out are the defaults. */
export function feedHref(f: Partial<FeedFilters> = {}): string {
  return linkTo(FEED_PATH, {
    q: f.q || null,
    status: f.status === 'all' ? 'all' : null,
    category: f.category ?? null,
    subcategory: (f.category && f.subcategory) || null,
    sort: f.sort ?? null,
    recommended: f.recommended ? '1' : null,
  });
}

/**
 * Which list these filters fetch, as one string. Recommended is not in it:
 * it colours the cards the list already holds rather than choosing them.
 */
export function feedListKey(f: FeedFilters): string {
  return [f.q, f.status, f.category ?? '', f.subcategory ?? '', f.sort ?? ''].join('|');
}
