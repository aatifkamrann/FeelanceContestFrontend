import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import Providers from './providers';
import { getBranding, getMe, PORTAL_NAME, rememberApiPublic } from '@/lib/api';
// globals.css declares the cascade layer order (tailwind-base, primereact,
// tailwind-utilities) and is bundled into <head>. The Prime theme itself is
// NOT imported here any more — it loads through the swappable <link> below,
// and its own `@layer primereact` slots into the order globals.css already
// declared, so Tailwind's preflight still never outranks the theme.
import './globals.css';

// The portal's face. lara ships Inter, which every dashboard on earth also
// ships; Instrument Sans is as legible at 15px and reads as a product
// rather than a template. Downloaded once at build time and served from
// the web bundle — nothing is fetched from Google when a page loads.
const sans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--wp-font',
});

/**
 * Every tab title in the portal, from one place. A page gives its own half
 * — "Dashboard", "Sign in" — and the template puts the portal's configured
 * name after it, so renaming the portal in Settings renames every tab
 * rather than leaving the stock name in the one place nobody thinks to
 * look. A page that names nothing gets the portal's name alone, and the
 * three the template cannot reach spell it out through lib/metadata.ts.
 *
 * The name is read here for the same reason the layout below reads it: it
 * is what the operator called this portal, and the API is the only place
 * that knows. Unreachable, or never set, and it falls back to the stock
 * name — the same word the header falls back to, so the tab and the page
 * cannot disagree.
 */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  const name = branding?.portalName ?? PORTAL_NAME;
  return {
    title: { default: name, template: `%s — ${name}` },
    description: 'Opportunity-based software delivery — fixed award, one private repo per entrant.',
    // No icons here: components/Favicon.tsx renders the one icon link,
    // from the same branding, so there is never a second one to outrank it.
  };
}

/**
 * Applies the viewer's theme before first paint: mode (their explicit choice,
 * else the OS preference) and the cached per-user accent override CSS that
 * lib/theme.ts computed on their last visit. Runs synchronously right after
 * the theme <link>, so neither a dark-mode visitor nor a re-coloured portal
 * ever flashes the stock light look. The stamped data-theme attribute is
 * also what Tailwind's `dark:` variant keys off — one switch, not two that
 * disagree. Kept tiny and dependency-free on purpose.
 */
const themeInit = `(function(){try{
var m=localStorage.getItem('wp.theme.mode')||localStorage.getItem('wp.theme');
var dark=m==='dark'||((!m||m==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.theme=dark?'dark':'light';
document.documentElement.style.colorScheme=dark?'dark':'light';
if(dark){document.getElementById('app-theme').href='/themes/dark.css';}
var css=localStorage.getItem('wp.theme.accentCss');
if(css){var s=document.createElement('style');s.id='app-accent';document.head.appendChild(s);s.textContent=css;}
var sc=localStorage.getItem('wp.theme.statusCss');
if(sc){var t=document.createElement('style');t.id='app-status';document.head.appendChild(t);t.textContent=sc;}
// The side rail (components/SideNav.tsx): pages without a header render
// none — nor does the landing page at the root (p is ''), which draws a
// header of its own — and a fold remembered on this device applies before
// the first paint rather than after hydration, so the content never jumps.
var p=location.pathname.split('/')[1];
if(['','login','register','forgot-password','reset-password','setup'].indexOf(p)<0){
document.documentElement.classList.add('wp-rail');
if(localStorage.getItem('wp.rail')==='collapsed'){document.documentElement.classList.add('wp-rail-collapsed');}
}
}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Branding and the signed-in account are read here, once per request,
  // and handed to the query cache in Providers: the name, the logo and the
  // menus every page's header draws are then in the HTML the server sends
  // and in the cache the client hydrates from, so the two cannot disagree.
  // Before this the server rendered a page's stock name and a visitor's
  // menus while the client, whose fetches had often landed before the
  // header hydrated, rendered the configured name and the account's — a
  // hydration mismatch on every such page, and a header that flashed from
  // one to the other on every load. The account rides the request's own
  // cookie, as the opportunity page's read does. Either is null when the API
  // is unreachable, and the account for a visitor; the header then draws
  // its fallbacks on both sides alike.
  const cookie = (await headers()).get('cookie') ?? undefined;
  const [branding, me] = await Promise.all([getBranding(), getMe(cookie)]);
  // Where the browser reaches the API when it is not this origin (the
  // two-site layout), from the portal's own settings: stamped on the page
  // for lib/api's apiPublic, and remembered for links rendered here.
  const api = rememberApiPublic(branding?.apiUrl) || undefined;
  return (
    // suppressHydrationWarning: the inline script legitimately mutates
    // data-theme and the link href before React hydrates.
    <html lang="en" className={sans.variable} data-api={api} suppressHydrationWarning>
      <body>
        {/* Both themes are copied to public/themes by scripts/copy-themes.mjs;
            the init script and the switcher swap this link's href at runtime.
            The link deliberately lives inside dangerouslySetInnerHTML: React
            never diffs inside it, so the pre-hydration href swap cannot cause
            a hydration mismatch. A React-owned <link> here made React 19
            "repair" the swap by inserting a second, light stylesheet and
            dropping the data-theme attribute. */}
        <span
          dangerouslySetInnerHTML={{
            __html: '<link id="app-theme" rel="stylesheet" href="/themes/light.css">',
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <Providers branding={branding} me={me}>{children}</Providers>
      </body>
    </html>
  );
}
