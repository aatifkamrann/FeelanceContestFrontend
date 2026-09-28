'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import BrandMark from '@/components/BrandMark';
import { brandingQuery, PORTAL_LEDE, PORTAL_NAME } from '@/lib/api';

/**
 * The frame every signed-out form shares — sign in, join, forgot, reset — so
 * they read as one product rather than four cards on four blank pages. A
 * brand panel says what the portal is, in the words the home page uses; the
 * form sits beside it on a desktop and below a one-line version on a phone.
 * The accent-washed ground behind it is the portal's own, painted by the
 * body for every screen. Styles live in globals.css under `.auth-*`.
 */
const POINTS = [
  { icon: 'pi-lock', text: 'One private repository per entrant' },
  { icon: 'pi-flag', text: 'Milestones claimed by pushing code' },
  { icon: 'pi-eye', text: 'The client reviews the code before anyone is paid' },
];

export default function AuthShell({
  title,
  wide = false,
  aside,
  children,
}: {
  title: string;
  /** The join form carries role cards and needs the wider card. */
  wide?: boolean;
  /**
   * Replaces the lede and the three points in the brand column — the join
   * form puts its own checklist there. The brand name above it stays
   * whatever is given: it is the way back out of a form.
   */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { data: branding } = useQuery(brandingQuery);
  const portalName = branding?.portalName ?? PORTAL_NAME;

  return (
    <main className="auth-shell">
      <div className="auth-layout">
        <section className="auth-brand">
          <Link href="/" className="auth-brand-name no-underline">
            <BrandMark imgClassName="h-9 w-auto max-w-[10rem]" iconClassName="" />
            <span>{portalName}</span>
          </Link>
          {aside ?? (
            <>
              <p className="auth-brand-lede">{PORTAL_LEDE}</p>
              <ul className="auth-brand-points">
                {POINTS.map((p) => (
                  <li key={p.text}>
                    <i className={`pi ${p.icon}`} aria-hidden />
                    {p.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className={`auth-card${wide ? ' auth-card-wide' : ''}`} aria-labelledby="auth-title">
          <h1 id="auth-title" className="text-xl font-semibold">
            {title}
          </h1>
          {children}
        </section>
      </div>
    </main>
  );
}
