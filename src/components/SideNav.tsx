'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tooltip } from 'primereact/tooltip';
import BrandMark from '@/components/BrandMark';
import type { LegalLink } from '@/lib/terms';

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  /**
   * The section this menu sits under, where it has one — "Reports" —
   * rendered as a heading over the run of menus that share it in the rail,
   * and as a prefix on the phone row, where a heading has no room.
   */
  group?: string;
};

/** localStorage: 'collapsed' when the rail is folded to its icons. */
export const RAIL_KEY = 'wp.rail';

/**
 * The page menus for whoever is signed in — the one list that both the
 * header row (phones) and the rail (wider screens) draw from, so a page
 * can never be reachable from one and missing from the other. `legal` is
 * whichever of the terms and the privacy policy the portal has published
 * (lib/terms.ts `legalLinks`).
 */
export function navItemsFor(role: string | null | undefined, legal: LegalLink[] = []): NavItem[] {
  const items: NavItem[] = [
    // The list itself, not the landing page: the brand above the menus is
    // the way home, and "Opportunities" is where the opportunities are.
    { href: '/opportunities', label: 'Opportunities', icon: 'pi pi-compass' },
    // Public like the feed: who is leading here is part of the case for joining.
    { href: '/leaderboard', label: 'Leaderboard', icon: 'pi pi-trophy' },
    { href: '/talent', label: 'Talent', icon: 'pi pi-users' },
  ];
  // A visitor deciding whether to join is the one who reads these, so
  // their rail carries them. A member accepted them at the join form, and
  // the footer keeps them to hand without lengthening a working menu.
  if (!role) items.push(...legal.map((link) => ({ ...link, group: 'Legal' })));
  if (role) items.push({ href: '/dashboard', label: 'Dashboard', icon: 'pi pi-th-large' });
  if (role === 'client') items.push({ href: '/client/opportunities', label: 'My opportunities', icon: 'pi pi-briefcase' });
  if (role === 'freelancer') items.push({ href: '/entries', label: 'My Opportunities', icon: 'pi pi-flag' });
  // Everyone with an account has one; a freelancer's is the one clients read.
  if (role) items.push({ href: '/profile', label: 'Profile', icon: 'pi pi-id-card' });
  if (role === 'admin') {
    items.push(
      { href: '/admin/operations', label: 'Operations', icon: 'pi pi-wrench' },
      { href: '/admin/users', label: 'Users', icon: 'pi pi-users' },
      { href: '/admin/activity', label: 'Activity', icon: 'pi pi-history' },
      { href: '/admin/database', label: 'Database', icon: 'pi pi-database' },
      { href: '/admin/settings', label: 'Settings', icon: 'pi pi-cog' },
    );
  }
  // Reports for every account: an administrator's cover the portal, a
  // client's what they posted, a freelancer's what they applied to or entered.
  if (role) {
    items.push(
      { href: '/reports/opportunities', label: 'Opportunities', icon: 'pi pi-table', group: 'Reports' },
      { href: '/reports/applications', label: 'Applications', icon: 'pi pi-inbox', group: 'Reports' },
      { href: '/reports/entries', label: 'Entries', icon: 'pi pi-list-check', group: 'Reports' },
    );
  }
  return items;
}

/** What the phone row calls a menu: its section first where it has one, so two "Opportunities" cannot read alike. */
export function navRowLabel(item: NavItem): string {
  return item.group ? `${item.group} › ${item.label}` : item.label;
}

/** Whether the current path belongs to this menu — an opportunity page is "Opportunities", a draft "My opportunities". */
export function isHere(pathname: string, item: NavItem): boolean {
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

/**
 * One look for a menu wherever it appears: the page you are on (or a page
 * that belongs to it) is bold and tinted with the accent; the rest are
 * quiet until hovered.
 */
export function navLinkClass(here: boolean): string {
  return `flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm no-underline transition-colors ${
    here
      ? 'bg-[var(--primary-color)]/10 font-semibold text-[var(--primary-color)]'
      : 'text-[var(--text-color-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-color)]'
  }`;
}

/**
 * The side rail: the page menus down the left edge on screens wide enough
 * for one, folding to a column of icons. The fold is remembered per device
 * (like light/dark mode and the dashboard panels — how one person lays out
 * their screen is not a fact about the account) and applied before first
 * paint by the layout's inline script through a class on <html>; the CSS in
 * globals.css keys off that class, so the width never jumps on load. React
 * only mirrors it, for the toggle and the tooltips.
 */
export default function SideNav({ items, name }: { items: NavItem[]; name: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    // Pages without a header (sign in, setup) render no rail, and the body
    // must not keep a rail's worth of padding after navigating to one.
    html.classList.add('wp-rail');
    setCollapsed(html.classList.contains('wp-rail-collapsed'));
    return () => html.classList.remove('wp-rail');
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.classList.toggle('wp-rail-collapsed', next);
    try {
      if (next) localStorage.setItem(RAIL_KEY, 'collapsed');
      else localStorage.removeItem(RAIL_KEY);
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <aside
      aria-label="Pages"
      className="wp-rail fixed inset-y-0 left-0 z-20 hidden w-[var(--wp-rail-w)] flex-col border-r border-[var(--surface-border)] bg-[var(--surface-card)] md:flex"
    >
      {/* Folded, the icon is all there is — the label follows the pointer. */}
      {collapsed && <Tooltip target=".wp-rail-item" position="right" showDelay={150} />}
      {/* The brand at the head of the rail, folded to its mark alone, with
          a rule between it and the menus. From md up this is the only
          place the brand appears; the header keeps it for phones. */}
      <Link
        href="/"
        data-pr-tooltip={name}
        className="wp-rail-item wp-rail-brand flex items-center gap-2 px-3 py-3 no-underline"
      >
        <BrandMark imgClassName="h-8 w-auto max-w-[10rem]" iconClassName="text-2xl" />
        <span className="wp-rail-label truncate text-base font-semibold text-[var(--text-color)]">{name}</span>
      </Link>
      <hr className="mx-2 border-0 border-t border-[var(--surface-border)]" />
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2 pt-3">
        {items.map((item, i) => {
          const here = isHere(pathname, item);
          // A section heading over the first menu of each run that shares
          // one; folded, a rule stands in for it.
          const heads = item.group && item.group !== items[i - 1]?.group;
          return (
            <div key={item.href} className="contents">
              {heads && (
                <>
                  <hr className="mx-2 mt-2 border-0 border-t border-[var(--surface-border)]" />
                  <p className="wp-rail-label mb-0 mt-1 px-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]">
                    {item.group}
                  </p>
                </>
              )}
              <Link
                href={item.href}
                aria-current={here ? 'page' : undefined}
                data-pr-tooltip={navRowLabel(item)}
                className={`wp-rail-item ${navLinkClass(here)}`}
              >
                <i className={`${item.icon} shrink-0 text-base`} aria-hidden />
                <span className="wp-rail-label truncate">{item.label}</span>
              </Link>
            </div>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
        data-pr-tooltip="Expand the menu"
        className="wp-rail-item m-2 flex items-center gap-3 rounded-md border-0 bg-transparent px-3 py-2 text-sm text-[var(--text-color-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-color)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
      >
        <i className={`pi ${collapsed ? 'pi-angle-double-right' : 'pi-angle-double-left'} shrink-0`} aria-hidden />
        <span className="wp-rail-label">Collapse</span>
      </button>
    </aside>
  );
}
