'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import Avatar from '@/components/Avatar';
import BrandMark from '@/components/BrandMark';
import MaintenanceBanner from '@/components/MaintenanceBanner';
import NotificationBell from '@/components/NotificationBell';
import SideNav, { isHere, navItemsFor, navLinkClass, navRowLabel } from '@/components/SideNav';
import ThemeControls from '@/components/ThemeControls';
import { brandingQuery, PORTAL_NAME } from '@/lib/api';
import { meQuery, postJson } from '@/lib/opportunities';
import { legalLinks } from '@/lib/terms';

/**
 * The one navigation bar. What it offers depends on who is signed in:
 * everyone signed in gets their dashboard, clients also see "Post an opportunity",
 * freelancers "My Opportunities", the admin operations, users and settings, and everyone
 * else sign in / join.
 */
export default function SiteHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useQuery(meQuery);
  const { data: publicInfo } = useQuery(brandingQuery);
  // The configured name, from the one read the root layout makes and seeds
  // this query with: the server's HTML and the hydrating client draw the
  // same name, and a portal renamed in Settings is renamed in every header
  // at once. Each page used to hand the name in as a prop, and every page
  // that had not read branding handed in the stock name — so the header
  // said "Winners Portal" on a portal called something else until the query
  // landed. The stock name is the fallback for a read that failed, and is
  // one constant now rather than a literal on each page.
  const name = publicInfo?.portalName ?? PORTAL_NAME;
  // The page menus, once: the row below the brand on a phone and the side
  // rail from md up draw from the same list, so nothing is reachable from
  // one and missing from the other.
  const pathname = usePathname();
  const items = navItemsFor(me?.role, legalLinks(publicInfo));

  const signOut = async () => {
    await postJson('/api/auth/logout');
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    router.push('/');
    router.refresh();
  };

  return (
    <header className="border-b border-[var(--surface-border)] bg-[var(--surface-card)]">
      {/* Below md the page menus take a row of their own under the brand
          and the account controls — on one row everything would only fit
          by wrapping the portal name mid-phrase and pushing Sign out off
          the edge. From md up that row hides and the side rail carries
          the same menus. */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
        {/* Phones only: from md up the brand heads the side rail. */}
        <Link href="/" className="flex items-center gap-2 no-underline md:hidden">
          <BrandMark imgClassName="h-7 w-auto max-w-[9rem]" iconClassName="text-xl" />
          <span className="whitespace-nowrap text-lg font-semibold text-[var(--text-color)]">{name}</span>
        </Link>

        <nav aria-label="Pages" className="order-last flex basis-full items-center gap-1 overflow-x-auto text-sm md:hidden">
          {items.map((item) => {
            const here = isHere(pathname, item);
            return (
              <Link key={item.href} href={item.href} aria-current={here ? 'page' : undefined} className={navLinkClass(here)}>
                <i className={item.icon} aria-hidden />
                {navRowLabel(item)}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeControls />
          {isLoading ? null : me ? (
            <>
              {/* The inbox — what happened, with the unread count on the
                  bell every mail app taught — and behind it the switches
                  for what arrives there. */}
              <NotificationBell />
              {me.role === 'client' && (
                // Hidden on a phone: with the theme controls and Sign out it
                // overran the width, and My opportunities carries the same button.
                <Link href="/client/opportunities/new" className="hidden no-underline sm:block">
                  <Button label="Post an opportunity" icon="pi pi-plus" size="small" className="whitespace-nowrap" />
                </Link>
              )}
              {/* The face and the name are the way to the profile; on a
                  phone only the face fits, and it is enough. */}
              <Link href="/profile" className="flex items-center gap-2 no-underline" aria-label="Your profile">
                <Avatar name={me.displayName} url={me.avatarUrl} size="sm" />
                <span className="hidden text-sm text-[var(--text-color-secondary)] sm:inline">
                  {me.displayName}
                </span>
              </Link>
              <Button
                label="Sign out"
                size="small"
                text
                className="whitespace-nowrap"
                onClick={signOut}
                aria-label="Sign out"
              />
            </>
          ) : (
            <>
              <Link href="/login" className="no-underline">
                <Button label="Sign in" size="small" text />
              </Link>
              <Link href="/register" className="no-underline">
                <Button label="Join" size="small" outlined />
              </Link>
            </>
          )}
        </div>
      </div>
      <MaintenanceBanner />
      <SideNav items={items} name={name} />
    </header>
  );
}
