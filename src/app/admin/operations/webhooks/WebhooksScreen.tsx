'use client';

import { Button } from 'primereact/button';
import { RankTable } from '@/components/dashboard/kit';
import { replayDelivery, type AdminDeliveryRow } from '@/lib/admin';
import { relativeTime } from '@/lib/opportunities';
import OperationsFrame, { CARD, Cards, useOperations } from '../OperationsFrame';

const EMPTY =
  'No deliveries recorded yet — GitHub has not reached this portal. Check the webhook URL and secret under Settings, GitHub.';

/**
 * Operations › Webhooks: the deliveries GitHub and the identity provider
 * sent, what each one did, and the button that runs one again. A delivery
 * has no page of its own, so its card is not a link — a stray click must
 * never replay one.
 */
export default function WebhooksScreen() {
  const ops = useOperations();
  const all = ops.data?.deliveries ?? [];
  const rows = all.filter((d) => ops.matches(d.event, d.action, d.repoFullName, d.handledNote, d.deliveryId));
  const empty = ops.searching ? ops.noneMatch : EMPTY;

  const replayAction = (d: AdminDeliveryRow) => (
    <Button
      label="Replay"
      icon="pi pi-play"
      size="small"
      text
      loading={ops.busyId === d.id}
      disabled={ops.busyId !== null}
      onClick={() => void ops.act(d.id, () => replayDelivery(d.id), 'Delivery replayed — the note shows what it did.')}
    />
  );

  return (
    <OperationsFrame
      ops={ops}
      path="/admin/operations/webhooks"
      title="Webhook deliveries"
      help="dashboard.webhooks"
      intro="What GitHub and the identity provider sent this portal, what each delivery did, and the button that runs one again."
      search="Search events, repositories, notes, delivery ids"
      shown={rows.length}
      total={all.length}
      noun={['delivery', 'deliveries']}
    >
      {() =>
        ops.view === 'cards' ? (
          <Cards
            empty={empty}
            items={rows.map((d) => (
              <li key={d.id} className="flex">
                <article className={CARD}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">
                      {d.event}
                      {d.action ? `.${d.action}` : ''}
                    </p>
                    <span className="whitespace-nowrap text-xs text-[var(--text-color-secondary)]">
                      {relativeTime(d.receivedAtUtc)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm [overflow-wrap:anywhere]">{d.repoFullName ?? (d.source === 'identity' ? 'identity provider' : '—')}</p>
                  <p className="mt-2 text-xs text-[var(--text-color-secondary)]">{d.handledNote ?? '—'}</p>
                  <div className="mt-auto flex justify-end pt-3">{replayAction(d)}</div>
                </article>
              </li>
            ))}
          />
        ) : (
          <RankTable
            empty={empty}
            columns={[
              { key: 'received', label: 'Received' },
              { key: 'event', label: 'Event' },
              { key: 'repo', label: 'Repository' },
              { key: 'note', label: 'Handled' },
              { key: 'action', label: 'Replay', help: 'admin.replayDelivery' },
            ]}
            rows={rows.map((d) => ({
              received: (
                <span className="whitespace-nowrap text-xs text-[var(--text-color-secondary)]">
                  {relativeTime(d.receivedAtUtc)}
                </span>
              ),
              event: (
                <span className="font-mono text-xs">
                  {d.event}
                  {d.action ? `.${d.action}` : ''}
                </span>
              ),
              repo: (
                <span className="whitespace-nowrap text-xs">{d.repoFullName ? d.repoFullName.split('/')[1] : d.source === 'identity' ? 'identity provider' : '—'}</span>
              ),
              note: (
                <span
                  className="block max-w-[24rem] truncate text-xs text-[var(--text-color-secondary)]"
                  title={d.handledNote ?? undefined}
                >
                  {d.handledNote ?? '—'}
                </span>
              ),
              action: replayAction(d),
            }))}
          />
        )
      }
    </OperationsFrame>
  );
}
