import type { Branding } from '@/lib/api';

/**
 * A terms document nearly always opens with its own title line. Lifting a
 * leading "# Heading" out lets the /terms page and the acceptance prompt
 * show it once, as their heading, instead of once as the heading and again
 * as the first line of the body. Only a heading that is the very first
 * thing in the document counts; a document without one keeps the stock
 * heading, and its body is untouched.
 */
export function splitTermsTitle(markdown: string): { title: string | null; body: string } {
  const m = /^\s*#\s+(.+?)[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (!m) return { title: null, body: markdown };
  return { title: m[1], body: markdown.slice(m.index + m[0].length) };
}

export const STOCK_TERMS_TITLE = 'Terms of service';

export type LegalLink = { href: string; label: string; icon: string };

/**
 * The legal pages worth linking — the visitor's rail and the footer draw
 * from this one list. Each appears once it has text: the terms once they
 * carry a version, the privacy policy once one is written, so no link
 * opens on "this portal has not published…". The join form keeps the
 * same rule for the same two links.
 */
export function legalLinks(branding: Branding | null | undefined): LegalLink[] {
  const links: LegalLink[] = [];
  if (branding?.termsVersion != null) links.push({ href: '/terms', label: STOCK_TERMS_TITLE, icon: 'pi pi-file' });
  if (branding?.privacyPublished) links.push({ href: '/privacy', label: 'Privacy policy', icon: 'pi pi-shield' });
  return links;
}
