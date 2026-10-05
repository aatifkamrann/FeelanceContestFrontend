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
   * The section this menu sits under, where it has one — "Operations",
   * "Reports" —
   * rendered as a heading over the run of menus that share it in the rail,
   * and as a prefix on the phone row, where a heading has no room.
   */
  group?: string;
};

/**
 * localStorage: 'open' once the viewer has unfolded the rail on this
 * device. Anything else, the key missing included, means folded to its
 * icons: the rail starts folded (since 30 September 2026), so an older
 * 'collapsed' reads as folded too.
 */
export const RAIL_KEY = 'wp.rail';

function railOpen(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === 'open';
  } catch {
    return false;
  }
}

/**
 * The sections whose heading folds the menus under it. They start folded,
 * so an administrator's rail opens on the pages used every day rather than
 * eight that are not; an unfold is remembered per device, as the rail's own
 * is. Legal is not among them: a visitor's two links are the reason it shows.
 */
const FOLDING = new Set(['Operations', 'Reports']);

/** localStorage: 'open' once the viewer has unfolded that section; missing means folded. */
const groupKey = (group: string) => `wp.rail.group.${group.toLowerCase()}`;

function groupsOpen(): Set<string> {
  const open = new Set<string>();
  try {
    for (const group of FOLDING) if (localStorage.getItem(groupKey(group)) === 'open') open.add(group);
  } catch {
    /* storage unavailable: every section folded */
  }
  return open;
}

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
  // The conversations between a client and their entrants: both seats.
  if (role === 'client' || role === 'freelancer') items.push({ href: '/messages', label: 'Messages', icon: 'pi pi-comments' });
  // Everyone with an account has one; a freelancer's is the one clients read.
  if (role) items.push({ href: '/profile', label: 'Profile', icon: 'pi pi-id-card' });
  if (role === 'admin') {
    items.push(
      { href: '/admin/users', label: 'Users', icon: 'pi pi-users' },
      { href: '/admin/activity', label: 'Activity', icon: 'pi pi-history' },
      // Members' conversations, read-only, for moderation.
      { href: '/admin/conversations', label: 'Conversations', icon: 'pi pi-comments' },
      { href: '/admin/database', label: 'Database', icon: 'pi pi-database' },
      { href: '/admin/settings', label: 'Settings', icon: 'pi pi-cog' },
      // Stuck machinery and the buttons that restart it, then what runs
      // slow and what the AI costs: a page each, as the reports are.
      { href: '/admin/operations/repositories', label: 'Repositories', icon: 'pi pi-github', group: 'Operations' },
      { href: '/admin/operations/awards', label: 'Awards', icon: 'pi pi-send', group: 'Operations' },
      { href: '/admin/operations/webhooks', label: 'Webhooks', icon: 'pi pi-bolt', group: 'Operations' },
      { href: '/admin/operations/queries', label: 'Slow queries', icon: 'pi pi-stopwatch', group: 'Operations' },
      { href: '/admin/operations/ai-usage', label: 'AI usage', icon: 'pi pi-sparkles', group: 'Operations' },
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
 * for one, folding to a column of icons. It starts folded, and an unfold
 * is remembered per device (like light/dark mode and the dashboard panels —
 * how one person lays out their screen is not a fact about the account).
 * The layout's inline script applies it before first paint through a class
 * on <html>; the CSS in globals.css keys off that class, so the width never
 * jumps on load. The effect below applies it again, because a page reached
 * by client-side navigation from one without a rail (the landing page, the
 * sign-in forms) was never seen by that script.
 */
export default function SideNav({ items, name }: { items: NavItem[]; name: string }) {
  const pathname = usePathname();
  // Folded is the default, so the server's HTML matches most viewers.
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    const html = document.documentElement;
    // Pages without a header (sign in, setup) render no rail, and the body
    // must not keep a rail's worth of padding after navigating to one.
    html.classList.add('wp-rail');
    const folded = !railOpen();
    html.classList.toggle('wp-rail-collapsed', folded);
    setCollapsed(folded);
    return () => html.classList.remove('wp-rail');
  }, []);

  // Folded is the default here too, so the server's HTML matches; a
  // remembered unfold applies after mount.
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  useEffect(() => setOpenGroups(groupsOpen()), []);

  const toggleGroup = (group: string) => {
    const next = new Set(openGroups);
    const opening = !next.has(group);
    if (opening) next.add(group);
    else next.delete(group);
    setOpenGroups(next);
    try {
      if (opening) localStorage.setItem(groupKey(group), 'open');
      else localStorage.removeItem(groupKey(group));
    } catch {
      /* storage unavailable */
    }
  };

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.documentElement.classList.toggle('wp-rail-collapsed', next);
    try {
      if (next) localStorage.removeItem(RAIL_KEY);
      else localStorage.setItem(RAIL_KEY, 'open');
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
          // one; with the rail folded, a rule stands in for it.
          const heads = item.group && item.group !== items[i - 1]?.group;
          const folds = !!item.group && FOLDING.has(item.group);
          const open = folds && openGroups.has(item.group!);
          // A folded section still shows the page you are on, so the rail
          // never loses track of where you are.
          const shown = !folds || open || here;
          return (
            <div key={item.href} className="contents">
              {heads && (
                <>
                  <hr className="mx-2 mt-2 border-0 border-t border-[var(--surface-border)]" />
                  {folds ? (
                    // Folded to icons, the chevron is the heading and its
                    // name follows the pointer.
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.group!)}
                      aria-expanded={open}
                      aria-label={item.group}
                      data-pr-tooltip={item.group}
                      className="wp-rail-item mt-1 flex items-center gap-2 rounded-md border-0 bg-transparent px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-color)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
                    >
                      <span className="wp-rail-label flex-1 text-left">{item.group}</span>
                      <i className={`pi ${open ? 'pi-chevron-down' : 'pi-chevron-right'} shrink-0 text-xs`} aria-hidden />
                    </button>
                  ) : (
                    <p className="wp-rail-label mb-0 mt-1 px-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]">
                      {item.group}
                    </p>
                  )}
                </>
              )}
              {shown && (
                <Link
                  href={item.href}
                  aria-current={here ? 'page' : undefined}
                  data-pr-tooltip={navRowLabel(item)}
                  className={`wp-rail-item ${navLinkClass(here)}`}
                >
                  <i className={`${item.icon} shrink-0 text-base`} aria-hidden />
                  <span className="wp-rail-label truncate">{item.label}</span>
                </Link>
              )}
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
