'use client';

import Link from 'next/link';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { RankTable } from '@/components/dashboard/kit';
import { retryProvision, type AdminProvisionRow } from '@/lib/admin';
import { relativeTime } from '@/lib/opportunities';
import OperationsFrame, { CARD, Cards, STRETCHED, useOperations } from '../OperationsFrame';

const EMPTY = 'Nothing failing — every active entry has its repository, or is being retried quietly.';

/**
 * Operations › Repositories: entrants whose private repository could not be
 * made, and the button that queues the attempt again. A card opens its
 * opportunity from anywhere on it; only the button acts.
 */
export default function RepositoriesScreen() {
  const ops = useOperations();
  const all = ops.data?.provisioning ?? [];
  const rows = all.filter((p) => ops.matches(p.freelancer, p.githubUsername, p.opportunityTitle, p.status, p.note));
  const empty = ops.searching ? ops.noneMatch : EMPTY;

  const retryAction = (p: AdminProvisionRow) =>
    p.canRetry ? (
      <Button
        label="Retry"
        icon="pi pi-replay"
        size="small"
        outlined
        loading={ops.busyId === p.id}
        disabled={ops.busyId !== null}
        onClick={() =>
          void ops.act(p.id, () => retryProvision(p.id),
            `Provisioning for @${p.githubUsername} is queued again — the entrant is emailed when it succeeds.`)
        }
      />
    ) : (
      <span className="text-xs text-[var(--text-color-secondary)]">
        {p.status === 'failed' ? 'opportunity closed' : 'retrying itself'}
      </span>
    );

  return (
    <OperationsFrame
      ops={ops}
      path="/admin/operations/repositories"
      title="Repositories"
      help="dashboard.repoHealth"
      intro="Entrants whose private repository could not be made, and the button that tries again."
      search="Search entrants, GitHub names, opportunities, errors"
      shown={rows.length}
      total={all.length}
      noun={['repository', 'repositories']}
    >
      {() =>
        ops.view === 'cards' ? (
          <Cards
            empty={empty}
            items={rows.map((p) => (
              <li key={p.id} className="flex">
                <article className={`group relative transition-colors hover:border-[var(--primary-color)] ${CARD}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm [overflow-wrap:anywhere]">
                      <span className="font-semibold">{p.freelancer}</span>
                      <span className="ml-1 text-xs text-[var(--text-color-secondary)]">@{p.githubUsername}</span>
                    </p>
                    <ProvisionTag p={p} />
                  </div>
                  <h3 className="mt-2 font-semibold leading-snug">
                    <Link href={`/opportunities/${p.opportunitySlug}`} className={STRETCHED}>
                      {p.opportunityTitle}
                    </Link>
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
                    {p.attempts} attempt{p.attempts === 1 ? '' : 's'}
                    {p.lastAttemptAtUtc && ` · last ${relativeTime(p.lastAttemptAtUtc)}`}
                  </p>
                  {p.note && (
                    <p className="mt-2 line-clamp-3 text-xs text-[var(--text-color-secondary)]" title={p.note}>
                      {p.note}
                    </p>
                  )}
                  <div className="relative z-10 mt-auto flex justify-end pt-3">{retryAction(p)}</div>
                </article>
              </li>
            ))}
          />
        ) : (
          <RankTable
            empty={empty}
            columns={[
              { key: 'who', label: 'Entrant' },
              { key: 'opportunity', label: 'Opportunity' },
              { key: 'status', label: 'Status' },
              { key: 'attempts', label: 'Attempts', align: 'right' },
              { key: 'note', label: 'Last error' },
              { key: 'action', label: 'Retry', help: 'admin.retryProvision' },
            ]}
            rows={rows.map((p) => ({
              who: (
                <span className="whitespace-nowrap">
                  {p.freelancer}
                  <span className="ml-1 text-xs text-[var(--text-color-secondary)]">@{p.githubUsername}</span>
                </span>
              ),
              opportunity: (
                <Link href={`/opportunities/${p.opportunitySlug}`} className="whitespace-nowrap text-[var(--text-color)] underline-offset-2">
                  {p.opportunityTitle}
                </Link>
              ),
              status: <ProvisionTag p={p} />,
              attempts: p.attempts,
              note: (
                <span
                  className="block max-w-[22rem] truncate text-xs text-[var(--text-color-secondary)]"
                  title={p.note ?? undefined}
                >
                  {p.note ?? '—'}
                </span>
              ),
              action: retryAction(p),
            }))}
          />
        )
      }
    </OperationsFrame>
  );
}

function ProvisionTag({ p }: { p: AdminProvisionRow }) {
  return (
    <Tag value={p.status} severity={p.status === 'failed' ? 'danger' : p.status === 'pending' ? 'warning' : 'success'} />
  );
}
