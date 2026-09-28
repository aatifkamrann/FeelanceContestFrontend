import type { Metadata } from 'next';
import { getBranding, PORTAL_NAME } from '@/lib/api';

/**
 * A tab title with the portal's configured name after it, spelled out in
 * full rather than left to the root layout's title template.
 *
 * Nearly every page gives its own half — `title: 'Dashboard'` — and the
 * template in app/layout.tsx adds the name. Two kinds of page are out of
 * that template's reach, and they are the ones that call this:
 *
 *  - the page of the segment that defines the template. The root layout's
 *    template applies to its children, never to app/page.tsx beside it,
 *    which gets the bare default instead — the portal's name alone, which
 *    is what the landing page wants, and why it does not call this.
 *  - a page under a layout that set a plain string title. That string
 *    replaces the root's whole title object for its subtree, template and
 *    all, so a deeper page has nothing left to inherit.
 *
 * The read is the same one the root layout makes for its own metadata,
 * memoised per request, and falls back the same way when the API is down.
 */
export async function brandedTitle(page: string): Promise<Metadata> {
  const branding = await getBranding();
  return { title: { absolute: `${page} — ${branding?.portalName ?? PORTAL_NAME}` } };
}
