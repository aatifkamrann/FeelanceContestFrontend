'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import BrandMark from '@/components/BrandMark';
import { brandingQuery, PORTAL_LEDE, PORTAL_NAME } from '@/lib/api';
import { meQuery } from '@/lib/opportunities';
import { legalLinks } from '@/lib/terms';
import type { Menu } from './menus';

/**
 * The landing page's foot, dark like the call above it: the brand, a column
 * per menu with the same narrowed links the header opens, the account's
 * own, and a closing line with the year and whichever legal documents the
 * portal has published.
 */
export default function LandingFooter({ menus }: { menus: Menu[] }) {
  const { data: me } = useQuery(meQuery);
  const { data: branding } = useQuery(brandingQuery);
  const name = branding?.portalName ?? PORTAL_NAME;
  const legal = legalLinks(branding);
  const account = me
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/profile', label: 'Profile' },
        { href: '/notifications', label: 'Notifications' },
      ]
    : [
        { href: '/login', label: 'Sign In' },
        { href: '/register', label: 'Join the Network' },
        { href: '/#how', label: 'How It Works' },
      ];

  return (
    <footer className="lp-night lp-footer">
      <div className="lp-wrap">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <Link href="/">
              <BrandMark imgClassName="h-7 w-auto max-w-[9rem]" iconClassName="text-xl" />
              {name}
            </Link>
            <p>{PORTAL_LEDE} Opportunities are earned, not chased.</p>
          </div>
          {menus.map((menu) => (
            <nav key={menu.key} aria-label={menu.label}>
              <p className="lp-footer-title">{menu.label}</p>
              <ul>
                {menu.links.slice(0, 4).map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <nav aria-label="Account">
            <p className="lp-footer-title">Account</p>
            <ul>
              {account.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="lp-footer-base">
          <span>
            © {new Date().getFullYear()} {name}. Merit is earned, not marketed.
          </span>
          {legal.length > 0 && (
            <nav aria-label="Legal">
              <ul>
                {legal.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}
