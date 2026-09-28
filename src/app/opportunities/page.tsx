import { apiBase } from '@/lib/api';
import type { OpportunityFeed as Feed } from '@/lib/opportunities';
import { feedFiltersOf, feedListKey, type FeedFilters } from '@/lib/feed';
import SiteHeader from '@/components/SiteHeader';
import OpportunityFeed from './OpportunityFeed';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Opportunities' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The list's first page for the filters in the address, fetched here so the
 * public list is in the HTML — narrowed already when a link narrowed it.
 * The viewer's own fit is not asked for: the server knows no viewer, and a
 * signed-in freelancer's copy is fetched by the page itself.
 */
async function getInitialFeed(f: FeedFilters): Promise<Feed> {
  const qs = new URLSearchParams();
  if (f.q) qs.set('q', f.q);
  qs.set('status', f.status);
  if (f.category) qs.set('category', f.category);
  if (f.subcategory) qs.set('subcategory', f.subcategory);
  if (f.sort) qs.set('sort', f.sort);
  try {
    const res = await fetch(`${apiBase()}/api/opportunities?${qs}`, { cache: 'no-store' });
    if (!res.ok) return { items: [], nextCursor: null };
    return (await res.json()) as Feed;
  } catch {
    return { items: [], nextCursor: null };
  }
}

/** Opportunities: every opportunity open for entry, or whatever the address narrows it to. */
export default async function OpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = feedFiltersOf((k) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  });
  const feed = await getInitialFeed(filters);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <OpportunityFeed initial={feed} initialFor={feedListKey(filters)} />
      </main>
    </>
  );
}
