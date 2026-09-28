'use client';

import Link from 'next/link';
import { Button } from 'primereact/button';
import type { Me } from '@/lib/opportunities';

/**
 * The box a page for clients shows to everyone else. Signed out, it says
 * what the page is and sends the visitor to sign in with a way back here;
 * signed in as a freelancer or administrator, it points at where their own
 * work lives instead of telling them to sign in again.
 */
export default function NotAClient({
  me,
  next,
  title,
  detail,
}: {
  me: Me | null | undefined;
  /** The path to come back to after signing in. */
  next: string;
  /** What a signed-out visitor is told the page is. */
  title: string;
  detail: string;
}) {
  if (!me) {
    return (
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
        <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
        <p className="mt-3 font-medium">{title}</p>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">{detail}</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="no-underline">
          <Button label="Sign in" className="mt-4" />
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
      <p className="font-medium">This page is for client accounts</p>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        {me.role === 'freelancer'
          ? 'Your entries are under My Opportunities.'
          : 'Opportunities across the portal are on the dashboard.'}
      </p>
      <Link href={me.role === 'freelancer' ? '/entries' : '/dashboard'} className="no-underline">
        <Button label={me.role === 'freelancer' ? 'My Opportunities' : 'Dashboard'} className="mt-4" />
      </Link>
    </div>
  );
}
