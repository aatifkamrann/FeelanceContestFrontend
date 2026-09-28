'use client';

import { useQuery } from '@tanstack/react-query';
import SiteHeader from '@/components/SiteHeader';
import OpportunityEditor from '@/components/OpportunityEditor';
import NotAClient from '@/components/NotAClient';
import { meQuery } from '@/lib/opportunities';

export default function NewOpportunityPage() {
  const { data: me, isLoading } = useQuery(meQuery);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Post an opportunity</h1>
        {/* The API takes a draft from a client only; better told here than
            after the brief has been written. */}
        {isLoading ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
        ) : me?.role !== 'client' ? (
          <div className="mt-6">
            <NotAClient
              me={me}
              next="/client/opportunities/new"
              title="Sign in to post an opportunity"
              detail="A brief, a fixed award and a milestone list, kept as a private draft until you publish. Posting needs a client account."
            />
          </div>
        ) : (
          <>
            <p className="mt-2 text-[var(--text-color-secondary)]">
              One fixed award, open entry, and you review the code before paying. Save as a
              draft as often as you like — nothing is public until you publish.
            </p>
            <div className="mt-8">
              <OpportunityEditor />
            </div>
          </>
        )}
      </main>
    </>
  );
}
