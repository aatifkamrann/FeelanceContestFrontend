'use client';

import { useQuery } from '@tanstack/react-query';
import { brandingQuery } from '@/lib/api';

/** The file public/favicon.svg holds, at the stock accent — the icon when branding is away. */
const STOCK = '/favicon.svg';

/** Only a hex colour is ever painted into the markup below. */
const HEX = /^#[0-9a-f]{3,8}$/i;

/**
 * The stock trophy at the portal's own accent, as a data URL. Same artwork
 * as public/favicon.svg — that file is the copy for a portal whose branding
 * could not be read, this is the copy that matches a re-coloured portal.
 */
function stockAt(accent: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="${accent}"/>` +
    `<path fill="#fff" d="M9 6h14v3h3v3c0 3-2 5-5 5.5A6 6 0 0 1 17.5 21v3H21v2H11v-2h3.5v-3A6 6 0 0 1 11 17.5C8 17 6 15 6 12V9h3V6zm-1 5v1c0 1.6 1 2.8 2.4 3.3A9 9 0 0 1 9 11H8zm16 0h-1a9 9 0 0 1-1.4 4.3C23 14.8 24 13.6 24 12v-1z"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * The tab icon, in its own order of precedence: the icon uploaded for this
 * job, else the logo standing in, else the trophy — which wears the portal's
 * accent, so a re-coloured portal is not announced by a stock-teal tab. The
 * API resolves the first two into iconUrl; this only chooses between that
 * and the trophy.
 *
 * The one icon link on the page, rendered here rather than declared in the
 * layout's metadata: React hoists it into the head and keeps it in step
 * with branding, and the server draws it from the branding the layout
 * seeded, so the first paint already has the right one. (Rewriting the
 * metadata's link by hand did not hold — React put its own back beside it,
 * and the stock one, being last, won.)
 */
export default function Favicon() {
  const { data } = useQuery(brandingQuery);

  if (data?.iconUrl) {
    // The type is the browser's to work out: an upload may be any of five kinds.
    return <link rel="icon" href={data.iconUrl} />;
  }
  const accent = data?.accentColor?.trim();
  const href = accent && HEX.test(accent) ? stockAt(accent) : STOCK;
  return <link rel="icon" href={href} type="image/svg+xml" />;
}
