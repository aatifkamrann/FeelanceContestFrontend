'use client';

import { useQuery } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import Avatar from '@/components/Avatar';
import OpportunityFacts from '@/components/OpportunityFacts';
import OpportunityFigures from '@/components/OpportunityFigures';
import FilePreviews from '@/components/FilePreviews';
import OpportunityTabs from '@/app/opportunities/[slug]/OpportunityTabs';
import {
  EligibilityTab,
  EvaluationTab,
  MilestonesTab,
  RequirementsTab,
} from '@/app/opportunities/[slug]/OpportunityTerms';
import { brandingQuery, PORTAL_NAME, apiFetch } from '@/lib/api';
import {
  categoriesQuery,
  opportunityDuration,
  deadlineLabel,
  meQuery,
  startsLabel,
  utcDay,
  utcMoment,
  type OpportunityAttachment,
} from '@/lib/opportunities';
import type { EditorValue } from '@/components/OpportunityEditor';

/**
 * The draft as an entrant will read it: the opportunity page's own main column,
 * built from the form's current values rather than from a saved opportunity, so
 * a client can check the brief before the publish that locks it.
 *
 * It is the page's components, not a copy of them — the figures box, the
 * facts chips, the tab strip and the four terms tabs are the ones
 * /opportunities/[slug] renders — so the preview cannot drift from the page it
 * promises. What it cannot show is what does not exist yet: the entrants,
 * the board, the client's payment record and the rail's apply panel.
 */
export default function OpportunityPreview({ value }: { value: EditorValue }) {
  const { data: me } = useQuery(meQuery);
  const { data: branding } = useQuery(brandingQuery);
  const { data: taxonomy } = useQuery(categoriesQuery);
  // Saved attachments are the draft's own; an unsaved opportunity has none.
  // Same key as the editor's upload panel, so this reads that cache.
  const { data: attachments } = useQuery({
    enabled: !!value.id,
    queryKey: ['attachments', value.id],
    queryFn: async (): Promise<OpportunityAttachment[]> => {
      const res = await apiFetch(`/api/opportunities/${value.id}/attachments`);
      if (!res.ok) throw new Error(`Attachments failed: ${res.status}`);
      return ((await res.json()) as { items: OpportunityAttachment[] }).items;
    },
  });

  const portalName = branding?.portalName ?? PORTAL_NAME;
  const categoryDef = taxonomy?.categories.find((c) => c.key === value.category) ?? null;
  const subcategoryDef = categoryDef?.subcategories.find((s) => s.key === value.subcategory) ?? null;
  // A draft has no published date, so the timeline counts from its start
  // day — or from today, which is what publishing now would make it.
  const begun = value.startsAtUtc ?? null;
  const duration = opportunityDuration(begun, value.deadlineUtc);
  const starting = value.startsAtUtc ? startsLabel(value.startsAtUtc) : null;
  const milestones = value.milestones
    .filter((m) => m.title.trim() !== '')
    .map((m) => ({
      title: m.title,
      description: m.description.trim() === '' ? null : m.description,
      dueUtc: m.dueUtc ?? null,
      weightPercent: m.weightPercent ?? null,
      amount: value.kind === 'milestones' ? m.amount ?? null : null,
    }));
  const dated = milestones.some((m) => m.dueUtc);
  const requirements = value.requirements.filter((r) => r.title.trim() !== '' || r.detail.trim() !== '');
  const criteria = value.criteria
    .filter((c) => c.title.trim() !== '')
    .map((c) => ({
      points: c.points ?? 0,
      title: c.title,
      description: c.description.trim() === '' ? null : c.description,
    }));
  const skills = value.skills.map((s) => s.trim()).filter((s) => s !== '');

  return (
    <div>
      {/* The frame says what the reader is looking at, because everything
          inside it is dressed as the live page. */}
      <p className="rounded-xl border border-dashed border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_6%,transparent)] p-3 text-sm">
        <i className="pi pi-eye mr-2 text-[var(--primary-color)]" aria-hidden />
        The opportunity as an entrant will read it, typing and all — nothing here is saved or
        published. The board, the entrants and your payment record fill in once it is live.
      </p>

      <div className="mt-6">
        {value.category && categoryDef && (
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-color)]">
            {categoryDef.label}
            {subcategoryDef && (
              <span className="font-normal text-[var(--text-color-secondary)]">
                {' · '}
                {subcategoryDef.label}
              </span>
            )}
          </p>
        )}
        <h1 className="mt-1 text-3xl font-bold">
          {value.title.trim() === '' ? (
            <span className="text-[var(--text-color-secondary)]">Untitled opportunity</span>
          ) : (
            value.title
          )}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-color-secondary)]">
          <Avatar name={me?.displayName ?? 'You'} url={me?.avatarUrl ?? null} size="xs" />
          Opportunity by {me?.displayName ?? 'you'}
        </p>

        {/* Published is the state being previewed: what a reader of the
            live page sees, not the draft it is now. */}
        <OpportunityFigures
          awardAmount={value.awardAmount ?? 0}
          // The award box's own currency, which is the one the opportunity is
          // stored in.
          currency="USD"
          deadlineUtc={value.deadlineUtc}
          status="open"
          entrantCount={0}
          milestoneCount={milestones.length}
          className="mt-5"
        />
        {value.deadlineUtc && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-color-secondary)]">
            {begun && (
              <span>
                <i className="pi pi-calendar mr-1" aria-hidden />
                {starting ? `Starts ${utcDay(begun)} · ${starting}` : `Started ${utcDay(begun)}`}
                {duration && ` · runs ${duration}`}
              </span>
            )}
            <span>
              <i className="pi pi-clock mr-1" aria-hidden />
              Deadline {utcMoment(value.deadlineUtc)}
              {' · '}
              {deadlineLabel(value.deadlineUtc)}
            </span>
            {value.entryCloseUtc && value.entryCloseUtc !== value.deadlineUtc && (
              <span>
                <i className="pi pi-sign-in mr-1" aria-hidden />
                Entry closes · {utcMoment(value.entryCloseUtc)}
              </span>
            )}
          </p>
        )}

        <OpportunityFacts
          categoryLabel={null}
          subcategoryLabel={null}
          skills={skills}
          minMeritScore={value.minMeritScore ?? 0}
          requiresCompose={value.requiresCompose}
          className="mt-3"
        />

        <OpportunityTabs
          tabs={[
            {
              key: 'preview-overview',
              header: 'Overview',
              icon: 'pi-file',
              body: (
                <div className="prose-sm max-w-none [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-semibold [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0">
                  {value.briefMarkdown.trim() === '' ? (
                    <p className="text-sm text-[var(--text-color-secondary)]">
                      The brief is empty. It is the whole of what an entrant reads before
                      deciding, so this is the one box worth the most time.
                    </p>
                  ) : (
                    <Markdown components={{ h1: 'h3', h2: 'h3', h3: 'h4' }}>{value.briefMarkdown}</Markdown>
                  )}
                  {attachments && attachments.length > 0 && (
                    <div className="mt-5 border-t border-[var(--surface-border)] pt-4">
                      <h3 className="!mt-0 !text-sm font-semibold">Attached files</h3>
                      <FilePreviews files={attachments} source="attachments" />
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'preview-requirements',
              header: 'Requirements',
              icon: 'pi-wrench',
              count: requirements.length + skills.length,
              body: <RequirementsTab requirements={requirements} skills={skills} />,
            },
            {
              key: 'preview-milestones',
              header: 'Milestones',
              icon: 'pi-list-check',
              count: milestones.length,
              body:
                milestones.length === 0 ? (
                  <p className="text-sm text-[var(--text-color-secondary)]">
                    No milestones yet. Without them the board an entrant is judged on has no
                    columns, and publishing asks for at least one.
                  </p>
                ) : (
                  <MilestonesTab milestones={milestones} dated={dated} currency="USD" />
                ),
            },
            {
              key: 'preview-evaluation',
              header: 'Evaluation',
              icon: 'pi-chart-bar',
              body: <EvaluationTab criteria={criteria} portalName={portalName} />,
            },
            {
              key: 'preview-eligibility',
              header: 'Eligibility',
              icon: 'pi-verified',
              body: (
                <EligibilityTab
                  minMeritScore={value.minMeritScore ?? 0}
                  categoryLabel={categoryDef?.label ?? null}
                  timelineFromUtc={begun}
                  deadlineUtc={value.deadlineUtc}
                  fit={null}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
