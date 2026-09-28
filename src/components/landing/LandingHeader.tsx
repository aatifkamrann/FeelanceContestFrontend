'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Avatar from '@/components/Avatar';
import BrandMark from '@/components/BrandMark';
import MaintenanceBanner from '@/components/MaintenanceBanner';
import ThemeControls from '@/components/ThemeControls';
import { brandingQuery, PORTAL_NAME } from '@/lib/api';
import { meQuery } from '@/lib/opportunities';
import type { Menu } from './menus';

/**
 * The landing page's own header, in place of the portal's side rail: the
 * brand, three menus that open on hover or focus — every link in them lands
 * on its page already narrowed — the way to how it works, and sign in or
 * the account. Below the width the menus need, one button opens them all as
 * a sheet under the header.
 */
export default function LandingHeader({ menus }: { menus: Menu[] }) {
  const { data: me } = useQuery(meQuery);
  const { data: branding } = useQuery(brandingQuery);
  const name = branding?.portalName ?? PORTAL_NAME;
  const [sheet, setSheet] = useState(false);
  // A menu held open by the pointer resting on it, or by focus inside it,
  // is shut by Escape until the pointer or the focus leaves it.
  const [shut, setShut] = useState<string | null>(null);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  return (
    <header className="lp-header">
      <div className="lp-wrap lp-header-row">
        <Link href="/" className="lp-brand" aria-label={`${name} home`}>
          <BrandMark imgClassName="h-7 w-auto max-w-[9rem]" iconClassName="text-xl" />
          <span>{name}</span>
        </Link>

        <nav className="lp-nav" aria-label="Explore">
          {menus.map((menu) => (
            <div
              key={menu.key}
              className="lp-menu"
              data-shut={shut === menu.key ? '' : undefined}
              onMouseLeave={() => shut === menu.key && setShut(null)}
              onBlur={(e) => {
                if (shut === menu.key && !e.currentTarget.contains(e.relatedTarget as Node | null)) setShut(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShut(menu.key);
              }}
            >
              <Link href={menu.href} className="lp-top" aria-haspopup="true">
                {menu.label}
                <i className="pi pi-chevron-down lp-chev" aria-hidden />
              </Link>
              <div className="lp-drop">
                <div className="lp-drop-panel">
                  <div className="lp-drop-links">
                    {menu.links.map((link) => (
                      <Link key={link.href + link.label} href={link.href} className="lp-drop-item">
                        <span className="lp-tile">
                          <i className={`pi ${link.icon}`} aria-hidden />
                        </span>
                        <span>
                          <span className="lp-drop-label">{link.label}</span>
                          <span className="lp-drop-detail">{link.detail}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                  {menu.aside && (
                    <div className="lp-drop-aside">
                      <p className="lp-kicker">{menu.aside.title}</p>
                      {menu.aside.links.map((link) => (
                        <Link key={link.href} href={link.href}>
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          <Link href="/#how" className="lp-top">
            How It Works
          </Link>
        </nav>

        <div className="lp-header-end">
          {/* On a phone the name needs the room; the menu sheet carries these there. */}
          <div className="hidden sm:block">
            <ThemeControls />
          </div>
          {me ? (
            <>
              <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-sm">
                Dashboard
              </Link>
              <Link href="/profile" aria-label="Your profile" className="hidden sm:inline-flex">
                <Avatar name={me.displayName} url={me.avatarUrl} size="sm" />
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="lp-signin">
                Sign In
              </Link>
              <Link href="/register" className="lp-btn lp-btn-primary lp-btn-sm">
                <span className="md:hidden">Join</span>
                <span className="hidden md:inline">Join the Network</span>
              </Link>
            </>
          )}
          <button
            type="button"
            className="lp-burger"
            aria-expanded={sheet}
            aria-controls="lp-sheet"
            aria-label={sheet ? 'Close the menu' : 'Open the menu'}
            onClick={() => setSheet((s) => !s)}
          >
            <i className={`pi ${sheet ? 'pi-times' : 'pi-bars'}`} aria-hidden />
          </button>
        </div>
      </div>

      {sheet && (
        <div id="lp-sheet" className="lp-sheet">
          <div className="lp-wrap lp-sheet-inner">
            {menus.map((menu) => (
              <div key={menu.key} className="lp-sheet-group">
                <Link href={menu.href} className="lp-sheet-top" onClick={() => setSheet(false)}>
                  {menu.label}
                </Link>
                {menu.links.map((link) => (
                  <Link
                    key={link.href + link.label}
                    href={link.href}
                    className="lp-drop-item"
                    onClick={() => setSheet(false)}
                  >
                    <span className="lp-tile">
                      <i className={`pi ${link.icon}`} aria-hidden />
                    </span>
                    <span>
                      <span className="lp-drop-label">{link.label}</span>
                      <span className="lp-drop-detail">{link.detail}</span>
                    </span>
                  </Link>
                ))}
                {menu.aside && (
                  <>
                    <p className="lp-kicker" style={{ marginTop: 12 }}>
                      {menu.aside.title}
                    </p>
                    <div className="lp-chips">
                      {menu.aside.links.map((link) => (
                        <Link key={link.href} href={link.href} className="lp-chip" onClick={() => setSheet(false)}>
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
            <div className="lp-sheet-group">
              <Link href="/#how" className="lp-sheet-top" onClick={() => setSheet(false)}>
                How It Works
              </Link>
            </div>
            <div className="lp-sheet-theme">
              <ThemeControls />
            </div>
            {!me && (
              <div className="lp-sheet-auth">
                <Link href="/login" className="lp-btn lp-btn-quiet lp-btn-sm">
                  Sign In
                </Link>
                <Link href="/register" className="lp-btn lp-btn-primary lp-btn-sm">
                  Join the Network
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
      <MaintenanceBanner />
    </header>
  );
}
