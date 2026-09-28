'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import SiteHeader from '@/components/SiteHeader';
import OpportunityEditor, { type EditorValue } from '@/components/OpportunityEditor';
import NotAClient from '@/components/NotAClient';
import { meQuery, statusLabel, type OpportunityDetail, type MyOpportunity } from '@/lib/opportunities';
import { apiFetch } from '@/lib/api';

/** What the edit URL resolves to: a draft to edit, or an opportunity that left
 *  the draft stage and whose terms are locked. */
type Loaded =
  | { kind: 'draft'; value: EditorValue }
  | { kind: 'locked'; slug: string; title: string; status: string };

/**
 * Edit a draft. The list endpoint maps id → slug (details are addressed by
 * slug), then the detail endpoint provides the full brief and milestones.
 */
export default function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // Only a client has drafts to edit; anyone else is told so instead of
  // being shown "not found" for a draft that may well exist.
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const { data, isLoading, error } = useQuery({
    enabled: me?.role === 'client',
    queryKey: ['edit-opportunity', id],
    queryFn: async (): Promise<Loaded | null> => {
      const mineRes = await apiFetch('/api/opportunities/mine');
      if (!mineRes.ok) return null;
      const mine: MyOpportunity[] = await mineRes.json();
      const summary = mine.find((c) => c.id === id);
      if (!summary) return null;
      // The API refuses to save anything but a draft; an old link to a
      // published opportunity should say so, not open an editor that cannot
      // save.
      if (summary.status !== 'draft')
        return { kind: 'locked', slug: summary.slug, title: summary.title, status: summary.status };

      const res = await apiFetch(`/api/opportunities/${encodeURIComponent(summary.slug)}`);
      if (!res.ok) return null;
      const detail: OpportunityDetail = await res.json();
      const value: EditorValue = {
        id: detail.id,
        title: detail.title,
        briefMarkdown: detail.briefMarkdown,
        awardAmount: detail.awardAmount,
        delivery: detail.delivery,
        requiresCompose: detail.requiresCompose,
        deadlineUtc: detail.deadlineUtc,
        // The detail endpoint resolves a blank joining date to the deadline;
        // the editor wants the client's own answer back, and blank is one.
        entryCloseUtc: detail.entryClosesEarly ? detail.entryCloseUtc : null,
        // Raw, as the client left it: blank is an answer too — "when I publish".
        startsAtUtc: detail.startsAtUtc,
        milestones: detail.milestones.map((m) => ({
          title: m.title,
          description: m.description ?? '',
          dueUtc: m.dueUtc,
          weightPercent: m.weightPercent,
        })),
        requirements: detail.requirements.map((r) => ({ title: r.title, detail: r.detail })),
        criteria: detail.criteria.map((c) => ({
          points: c.points,
          title: c.title,
          description: c.description ?? '',
        })),
        metaTitle: detail.metaTitle ?? '',
        metaDescription: detail.metaDescription ?? '',
        category: detail.category,
        subcategory: detail.subcategory,
        // Zero is "no minimum", and the form shows that as an empty box.
        minMeritScore: detail.minMeritScore || null,
        skills: detail.skills,
      };
      return { kind: 'draft', value };
    },
  });

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Edit draft</h1>
        {meLoading || isLoading ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
        ) : me?.role !== 'client' ? (
          <div className="mt-6">
            <NotAClient
              me={me}
              next={`/client/opportunities/${id}/edit`}
              title="Sign in to edit your draft"
              detail="A draft is private to the account that wrote it. Editing one needs that client account."
            />
          </div>
        ) : error || !data ? (
          <div className="mt-6">
            <p className="text-[var(--text-color-secondary)]">
              This draft wasn&apos;t found — it may belong to a different account.
            </p>
            <Link href="/client/opportunities" className="no-underline">
              <Button label="Back to My opportunities" className="mt-4" outlined />
            </Link>
          </div>
        ) : data.kind === 'locked' ? (
          <div className="mt-6">
            <p className="text-[var(--text-color-secondary)]">
              &ldquo;{data.title}&rdquo; is {statusLabel(data.status).toLowerCase()} — its brief,
              milestones, dates and award were locked when it was published, because
              entrants commit their time against them.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/opportunities/${data.slug}`} className="no-underline">
                <Button label="View the opportunity" icon="pi pi-arrow-right" iconPos="right" />
              </Link>
              <Link href="/client/opportunities" className="no-underline">
                <Button label="Back to My opportunities" outlined />
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <OpportunityEditor initial={data.value} />
          </div>
        )}
      </main>
    </>
  );
}
