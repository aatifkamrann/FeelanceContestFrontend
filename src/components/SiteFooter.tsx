'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import BrandMark from '@/components/BrandMark';
import { navItemsFor } from '@/components/SideNav';
import { brandingQuery, PORTAL_LEDE, PORTAL_NAME } from '@/lib/api';
import { meQuery } from '@/lib/opportunities';
import { legalLinks } from '@/lib/terms';

type FooterLink = { href: string; label: string };

/**
 * The signed-out forms stand in a frame of their own (components/AuthShell.tsx)
 * with the brand already beside the card, so under them the footer is its
 * closing line alone: the year, the name and the legal links.
 */
const FORM_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

const linkClass =
  'rounded-sm text-[var(--text-color-secondary)] no-underline transition-colors hover:text-[var(--text-color)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]';

function LinkList({ label, links, className }: { label: string; links: FooterLink[]; className: string }) {
  return (
    <nav aria-label={label}>
      <ul className={`m-0 list-none p-0 ${className}`}>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={linkClass}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Column({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <p className="mb-3 mt-0 text-xs font-semibold uppercase tracking-wide text-[var(--text-color)]">{title}</p>
      <LinkList label={title} links={links} className="flex flex-col gap-2 text-sm" />
    </div>
  );
}

/**
 * The foot of every page: the brand and what the portal is, the public
 * pages and the account's own, and a last line with the year and whichever
 * legal documents the portal has published. Mounted once, by Providers,
 * under whatever the page drew, and pushed to the bottom of a short page
 * by the shell in globals.css (`.wp-shell`). Not on the first-run wizard,
 * which comes before there is a portal to link to, not on the landing
 * page, which has its own, and never on paper.
 */
export default function SiteFooter() {
  const pathname = usePathname();
  const { data: me } = useQuery(meQuery);
  const { data: branding } = useQuery(brandingQuery);

  // The landing page closes with a footer of its own (components/landing).
  if (pathname.startsWith('/setup') || pathname === '/') return null;

  const name = branding?.portalName ?? PORTAL_NAME;
  const legal = legalLinks(branding);
  const form = FORM_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const baseline = (
    <div
      className={`flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--text-color-secondary)] ${
        form ? 'justify-center' : 'justify-between'
      }`}
    >
      <p className="m-0">
        © {new Date().getFullYear()} {name}
      </p>
      {legal.length > 0 && <LinkList label="Legal" links={legal} className="flex flex-wrap gap-x-5 gap-y-1" />}
    </div>
  );

  if (form) {
    return <footer className="px-4 pb-6 print:hidden">{baseline}</footer>;
  }

  // The same three public pages the rail opens with, from the same list.
  const explore = navItemsFor(null);
  const account: FooterLink[] = me
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/profile', label: 'Profile' },
        { href: '/notifications', label: 'Notifications' },
      ]
    : [
        { href: '/login', label: 'Sign in' },
        { href: '/register', label: 'Join' },
      ];

  return (
    <footer className="border-t border-[var(--surface-border)] bg-[var(--surface-card)] print:hidden">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 py-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className={`inline-flex items-center gap-2 ${linkClass}`}>
              <BrandMark imgClassName="h-7 w-auto max-w-[9rem]" iconClassName="text-xl" />
              <span className="text-base font-semibold text-[var(--text-color)]">{name}</span>
            </Link>
            <p className="mb-0 mt-3 max-w-sm text-pretty text-sm leading-relaxed text-[var(--text-color-secondary)]">
              {PORTAL_LEDE}
            </p>
          </div>
          <Column title="Explore" links={explore} />
          <Column title="Account" links={account} />
        </div>
        <div className="border-t border-[var(--surface-border)] py-5">{baseline}</div>
      </div>
    </footer>
  );
}
