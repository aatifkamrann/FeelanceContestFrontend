'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import SiteHeader from '@/components/SiteHeader';
import ProfileView from '@/components/profile/ProfileView';
import { meQuery } from '@/lib/opportunities';
import { profileQuery } from '@/lib/profile';

/**
 * Somebody else's profile. Members-only, which the opportunity page an
 * entrant list sits on no longer is: a portfolio is part of what an
 * entrant brings to a brief, and that is a conversation between members
 * rather than a public directory of people.
 */
export default function MemberProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const { data, isLoading } = useQuery({ ...profileQuery(userId), enabled: !!me });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {meLoading || isLoading ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
        ) : !me ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">Members can read each other&apos;s profiles</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Sign in to see what this member has built and how their opportunities went.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link
                href={`/login?next=${encodeURIComponent(`/profile/${userId}`)}`}
                className="no-underline"
              >
                <Button label="Sign in" icon="pi pi-sign-in" />
              </Link>
              <Link href="/register" className="no-underline">
                <Button label="Create an account" icon="pi pi-user-plus" outlined />
              </Link>
            </div>
          </div>
        ) : !data ? (
          <div className="py-12 text-center">
            <p className="text-[var(--text-color-secondary)]">
              No such member — the account may have been deleted.
            </p>
            <Link href="/opportunities" className="no-underline">
              <Button label="Browse opportunities" className="mt-4" outlined />
            </Link>
          </div>
        ) : (
          <>
            {data.own && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-hover)] p-3">
                <p className="text-sm">This is your own profile, as other members read it.</p>
                <Link href="/profile" className="ml-auto no-underline">
                  <Button label="Edit" icon="pi pi-pencil" size="small" outlined />
                </Link>
              </div>
            )}
            <ProfileView profile={data} />
          </>
        )}
      </main>
    </>
  );
}
