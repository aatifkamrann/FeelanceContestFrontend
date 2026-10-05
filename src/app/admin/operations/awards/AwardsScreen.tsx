'use client';

import Link from 'next/link';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { RankTable } from '@/components/dashboard/kit';
import { restartHandover, type AdminHandoverRow } from '@/lib/admin';
import { formatAward, relativeTime } from '@/lib/opportunities';
import OperationsFrame, { CARD, Cards, STRETCHED, useOperations } from '../OperationsFrame';

/**
 * Operations › Awards: every award's paper trail from announcement to the
 * repository landing with its new owner, and the button that restarts a
 * transfer that stalled. A card opens its opportunity from anywhere on it;
 * only the button acts.
 */
export default function AwardsScreen() {
  const ops = useOperations();
  const all = ops.data?.handovers ?? [];
  const rows = all.filter((h) =>
    ops.matches(h.opportunityTitle, h.winner, h.client, h.clientGithubLogin, h.repoFullName, handoverWord(h), h.note),
  );
  const empty = ops.searching ? ops.noneMatch : 'No awards yet.';

  const restartAction = (h: AdminHandoverRow) =>
    h.canRestart ? (
      <Button
        label="Restart"
        icon="pi pi-sync"
        size="small"
        outlined
        loading={ops.busyId === h.id}
        disabled={ops.busyId !== null}
        onClick={() =>
          void ops.act(h.id, () => restartHandover(h.id),
            `Transfer restarted — it goes to GitHub on the next sweep, and ${h.client} is emailed to accept it once it does.`)
        }
      />
    ) : (
      <span className="text-xs text-[var(--text-color-secondary)]">
        {h.handover === 'verified' ? 'done' : 'awaiting payment'}
      </span>
    );

  return (
    <OperationsFrame
      ops={ops}
      path="/admin/operations/awards"
      title="Award handovers"
      help="admin.handovers"
      intro="Each award from announcement to the repository landing with its new owner, and the button that restarts a stalled transfer."
      search="Search opportunities, winners, clients, repositories, stages"
      shown={rows.length}
      total={all.length}
      noun={['award', 'awards']}
    >
      {() =>
        ops.view === 'cards' ? (
          <Cards
            empty={empty}
            items={rows.map((h) => (
              <li key={h.id} className="flex">
                <article className={`group relative transition-colors hover:border-[var(--primary-color)] ${CARD}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 font-semibold leading-snug">
                      <Link href={`/opportunities/${h.opportunitySlug}`} className={STRETCHED}>
                        {h.opportunityTitle}
                      </Link>
                    </h3>
                    <HandoverTag h={h} />
                  </div>
                  <p className="mt-1 text-sm">
                    {h.winner}
                    <i className="pi pi-arrow-right mx-1 text-xs text-[var(--text-color-secondary)]" aria-hidden />
                    {h.client}
                  </p>
                  {h.repoFullName && (
                    <p className="text-xs text-[var(--text-color-secondary)] [overflow-wrap:anywhere]">{h.repoFullName}</p>
                  )}
                  <p className="mt-2 text-lg font-bold tabular-nums text-[var(--primary-color)]">
                    {formatAward(h.amount, h.currency)}
                  </p>
                  <div className="mt-2">
                    <Trail h={h} />
                  </div>
                  <div className="relative z-10 mt-auto flex justify-end pt-3">{restartAction(h)}</div>
                </article>
              </li>
            ))}
          />
        ) : (
          <RankTable
            empty={empty}
            columns={[
              { key: 'opportunity', label: 'Opportunity' },
              { key: 'deal', label: 'Winner → client' },
              { key: 'amount', label: 'Award', align: 'right' },
              { key: 'trail', label: 'Paper trail' },
              { key: 'status', label: 'Handover' },
              { key: 'action', label: 'Restart', help: 'admin.restartHandover' },
            ]}
            rows={rows.map((h) => ({
              opportunity: (
                <Link href={`/opportunities/${h.opportunitySlug}`} className="whitespace-nowrap text-[var(--text-color)] underline-offset-2">
                  {h.opportunityTitle}
                </Link>
              ),
              deal: (
                <span className="whitespace-nowrap">
                  {h.winner}
                  <i className="pi pi-arrow-right mx-1 text-xs text-[var(--text-color-secondary)]" aria-hidden />
                  {h.client}
                  {h.repoFullName && (
                    <span className="ml-1 block text-xs text-[var(--text-color-secondary)]">
                      {h.repoFullName}
                    </span>
                  )}
                </span>
              ),
              amount: formatAward(h.amount, h.currency),
              trail: <Trail h={h} />,
              status: <HandoverTag h={h} />,
              action: restartAction(h),
            }))}
          />
        )
      }
    </OperationsFrame>
  );
}

/** The four stamps in order — what happened reads left to right, gaps included. */
function Trail({ h }: { h: AdminHandoverRow }) {
  const stamps: { label: string; at: string | null }[] = [
    { label: 'announced', at: h.announcedAtUtc },
    { label: 'paid', at: h.paidAtUtc },
    { label: 'transfer requested', at: h.transferRequestedAtUtc },
    { label: 'verified', at: h.handoverVerifiedAtUtc },
  ];
  return (
    // A floor on the width: with the name columns on one line each, the
    // table would otherwise squeeze this one to a word per line.
    <span className="flex min-w-[16rem] flex-wrap gap-x-2 text-xs">
      {stamps.map((s) => (
        <span
          key={s.label}
          className={`whitespace-nowrap ${s.at ? 'text-[var(--text-color)]' : 'text-[var(--text-color-secondary)] opacity-60'}`}
          title={s.at ?? undefined}
        >
          <i
            className={`pi ${s.at ? 'pi-check-circle' : 'pi-circle'} mr-0.5 text-[0.65rem]`}
            aria-hidden
          />
          {s.label}
          {s.at && <span className="text-[var(--text-color-secondary)]"> {relativeTime(s.at)}</span>}
        </span>
      ))}
      {h.note && (
        <span className="block w-full text-[var(--text-color-secondary)]" title={h.note}>
          {h.note}
        </span>
      )}
    </span>
  );
}

/** The word the handover tag shows, so a search for it finds the row. */
function handoverWord(h: AdminHandoverRow): string {
  if (!h.paidAtUtc) return 'awaiting payment';
  if (h.handover === 'verified') return 'verified';
  if (h.handover === 'requested') return 'requested';
  return 'not started';
}

function HandoverTag({ h }: { h: AdminHandoverRow }) {
  const word = handoverWord(h);
  const severity = word === 'awaiting payment' ? 'info' : word === 'verified' ? 'success' : word === 'requested' ? 'warning' : 'danger';
  return <Tag value={word} severity={severity} />;
}
