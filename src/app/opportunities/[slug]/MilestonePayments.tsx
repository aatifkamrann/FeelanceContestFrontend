'use client';

import { useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { confirmDialog } from 'primereact/confirmdialog';
import HelpIcon from '@/components/HelpIcon';
import {
  PAY_STATE_LABEL,
  postJson,
  relativeTime,
  usesRepo,
  usesUpload,
  type MilestonePayState,
  type OpportunityDetail,
} from '@/lib/opportunities';

/** How each state wears its tag: done green, waiting on the client amber, the rest quiet. */
const SEVERITY: Record<MilestonePayState, 'success' | 'warning' | 'info' | 'secondary' | 'danger'> = {
  paid: 'success',
  approved: 'warning',
  submitted: 'warning',
  changes_requested: 'danger',
  open: 'info',
  locked: 'secondary',
};

const MIN_NOTE = 10;

/**
 * An opportunity paid by milestone, after the hire: every milestone in
 * order with what it pays and where it stands. The client approves a
 * milestone handed in, sends it back with what to change, and marks it
 * paid once the money has gone — which is what opens the next one. The
 * hired freelancer hands a sent-back milestone in again. Everyone else
 * reads the record: the payments are as public as a competitive award's
 * paid line.
 */
export default function MilestonePayments({
  opportunity,
  role,
  onChanged,
}: {
  opportunity: OpportunityDetail;
  role: 'owner' | 'hired' | 'viewer';
  onChanged: () => Promise<void>;
}) {
  const award = opportunity.award;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<{ id: string; number: number } | null>(null);
  const [note, setNote] = useState('');
  if (!award?.payments) return null;

  const money = (n: number | null) =>
    n == null
      ? ''
      : `${opportunity.currency === 'USD' ? '$' : `${opportunity.currency} `}${n.toLocaleString('en-US', {
          maximumFractionDigits: 2,
        })}`;
  const repo = usesRepo(opportunity.delivery);
  const upload = usesUpload(opportunity.delivery);

  const act = async (id: string, path: 'approve' | 'paid' | 'resubmit' | 'changes', body?: unknown) => {
    setBusy(`${id}:${path}`);
    setError(null);
    try {
      await postJson(`/api/checkpoints/${id}/${path}`, body);
      await onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const markPaid = (id: string, number: number, amount: number | null, last: boolean) =>
    confirmDialog({
      header: `Mark milestone ${number} paid`,
      message:
        `Confirm only once ${money(amount) || 'its amount'} has actually gone to ${award.winnerName} — this is the ` +
        'record both of you point to later, and marking it paid approves the milestone too. ' +
        (last
          ? repo
            ? 'It is the last one: the award is complete and the repository transfers to your connected GitHub account.'
            : 'It is the last one: the award is complete.'
          : `Milestone ${number + 1} opens for them the moment you do.`),
      acceptLabel: 'I have paid it',
      rejectLabel: 'Not yet',
      accept: () => void act(id, 'paid'),
    });

  const openCount = award.payments.filter((p) => p.state !== 'paid').length;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="m-0 text-sm font-medium">
          Milestones
          <HelpIcon topic="opportunity.milestonePayments" label="Milestone payments" />
        </p>
        <p className="m-0 text-sm tabular-nums text-[var(--text-color-secondary)]" aria-live="polite">
          {money(award.amountPaid)} of {money(opportunity.awardAmount)} paid
          {(award.amountOwed ?? 0) > 0 && ` · ${money(award.amountOwed)} approved and due`}
        </p>
      </div>
      <ol className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {award.payments.map((p, i) => {
          const m = opportunity.milestones[i];
          const last = openCount === 1 && p.state !== 'paid';
          const waiting = p.state === 'submitted' || p.state === 'approved';
          return (
            <li
              key={p.number}
              className={`rounded-lg border p-3 ${
                role === 'owner' && waiting
                  ? 'border-amber-500/60 bg-amber-500/5'
                  : 'border-[var(--surface-border)] bg-[var(--surface-card)]'
              }`}
            >
              <div className="flex flex-wrap items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] text-xs font-bold">
                  {p.number}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-medium">{m?.title ?? `Milestone ${p.number}`}</p>
                  <p className="m-0 text-xs text-[var(--text-color-secondary)]">
                    {p.paidAtUtc
                      ? `Paid ${relativeTime(p.paidAtUtc)}`
                      : p.approvedAtUtc
                        ? `Approved ${relativeTime(p.approvedAtUtc)}`
                        : p.submittedAtUtc && p.state !== 'open'
                          ? `Handed in ${relativeTime(p.submittedAtUtc)}${p.ref ? ` · ${p.ref}` : ''}`
                          : m?.dueUtc
                            ? `Due ${new Date(m.dueUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                            : ''}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{money(p.amount)}</span>
                <Tag value={PAY_STATE_LABEL[p.state]} severity={SEVERITY[p.state]} rounded className="shrink-0" />
              </div>

              {p.state === 'changes_requested' && p.changesNote && (
                <blockquote
                  className="m-0 mt-2 whitespace-pre-line border-l-2 border-red-400 pl-2 text-sm [overflow-wrap:anywhere]"
                  aria-label="The changes asked for"
                >
                  {p.changesNote}
                </blockquote>
              )}

              {/* The client's answers to a milestone handed in. */}
              {role === 'owner' && p.checkpointId && waiting && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.state === 'submitted' && (
                    <Button
                      label="Approve"
                      icon="pi pi-check"
                      size="small"
                      outlined
                      loading={busy === `${p.checkpointId}:approve`}
                      disabled={!!busy}
                      onClick={() => void act(p.checkpointId!, 'approve')}
                    />
                  )}
                  <Button
                    label="Mark paid"
                    icon="pi pi-wallet"
                    size="small"
                    loading={busy === `${p.checkpointId}:paid`}
                    disabled={!!busy}
                    onClick={() => markPaid(p.checkpointId!, p.number, p.amount, last)}
                  />
                  {p.state === 'submitted' && (
                    <Button
                      label="Ask for changes"
                      icon="pi pi-replay"
                      size="small"
                      text
                      severity="secondary"
                      disabled={!!busy}
                      onClick={() => {
                        setNote('');
                        setChanging({ id: p.checkpointId!, number: p.number });
                      }}
                    />
                  )}
                </div>
              )}

              {/* The freelancer's side: what to do with the one that is theirs to move. */}
              {role === 'hired' && p.state === 'open' && (
                <p className="m-0 mt-2 text-sm text-[var(--text-color-secondary)]">
                  <i className="pi pi-arrow-right mr-1" aria-hidden />
                  Yours to hand in now:{' '}
                  {[
                    repo && `push a tag m${p.number} or open a pull request from a branch named m${p.number}-…`,
                    upload && `upload a file tagged with milestone ${p.number}`,
                  ]
                    .filter(Boolean)
                    .join(', or ')}
                  .
                </p>
              )}
              {role === 'hired' && p.state === 'changes_requested' && p.checkpointId && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    label="Hand in again"
                    icon="pi pi-send"
                    size="small"
                    loading={busy === `${p.checkpointId}:resubmit`}
                    disabled={!!busy}
                    onClick={() => void act(p.checkpointId!, 'resubmit')}
                  />
                  <span className="text-xs text-[var(--text-color-secondary)]">
                    {repo && upload
                      ? 'Once the changes are in the repository or uploaded — a new tag or tagged file does the same.'
                      : repo
                        ? 'Once the changes are in the repository — or push a new tag, which does the same.'
                        : 'Once the corrected file is uploaded — or upload it tagged with this milestone, which does the same.'}
                  </span>
                </div>
              )}
              {role === 'hired' && p.state === 'submitted' && (
                <p className="m-0 mt-2 text-sm text-[var(--text-color-secondary)]">
                  Waiting for the client to review it.
                </p>
              )}
              {role === 'hired' && p.state === 'approved' && (
                <p className="m-0 mt-2 text-sm text-[var(--text-color-secondary)]">
                  Approved — the client pays you directly and marks it paid here, which opens the next one.
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {error && <Message severity="error" text={error} className="mt-2 w-full" />}

      <Dialog
        header={changing ? `Ask for changes to milestone ${changing.number}` : ''}
        visible={!!changing}
        onHide={() => setChanging(null)}
        className="w-[32rem] max-w-[95vw]"
        footer={
          <div className="flex justify-end gap-2">
            <Button label="Cancel" text onClick={() => setChanging(null)} />
            <Button
              label="Send the request"
              icon="pi pi-send"
              disabled={note.trim().length < MIN_NOTE || !!busy}
              loading={!!changing && busy === `${changing.id}:changes`}
              onClick={async () => {
                if (!changing) return;
                if (await act(changing.id, 'changes', { note: note.trim() })) setChanging(null);
              }}
            />
          </div>
        }
      >
        <label htmlFor="changes-note" className="text-sm">
          What should change? {award.winnerName} is emailed this, word for word, and hands the milestone in
          again when it is done. It is not paid until you approve it.
        </label>
        <InputTextarea
          id="changes-note"
          rows={5}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-2 w-full"
          autoFocus
        />
      </Dialog>
    </div>
  );
}
