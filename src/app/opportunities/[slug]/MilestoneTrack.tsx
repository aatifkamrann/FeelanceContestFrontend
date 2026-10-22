'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { SelectButton } from 'primereact/selectbutton';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import Avatar from '@/components/Avatar';
import HelpIcon from '@/components/HelpIcon';
import { apiFetch } from '@/lib/api';
import {
  PAY_STATE_LABEL,
  formatAward,
  meQuery,
  postJson,
  relativeTime,
  usesRepo,
  usesUpload,
  type MilestonePayState,
  type MilestonePayment,
  type MilestoneReview,
  type OpportunityDetail,
} from '@/lib/opportunities';

/**
 * The progress board of an opportunity paid by milestone: one hired
 * freelancer, so the board is their milestones in order, one card each,
 * rather than a row in a matrix. Each card carries where the milestone
 * stands, what it pays, how it was handed in, every review it had — the
 * remarks and the advice for the milestones ahead — and the actions of
 * whoever is looking: the client (or an administrator for them) approves
 * or asks for changes with remarks, the client marks paid, the freelancer
 * hands a sent-back milestone in again. Everyone else reads the states;
 * the words are between the two parties.
 *
 * The page renders this with the opportunity as the server fetched it for
 * the viewer; the same query the rail uses refreshes it after an action,
 * and the live watch in the heading nudges it when the other side acts.
 */
export default function MilestoneTrack({
  slug,
  initial,
}: {
  slug: string;
  initial: OpportunityDetail;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data } = useQuery({
    queryKey: ['opportunity', slug],
    queryFn: async () => {
      const res = await apiFetch(`/api/opportunities/${encodeURIComponent(slug)}`);
      if (!res.ok) return null;
      return (await res.json()) as OpportunityDetail;
    },
    enabled: !!me,
  });
  const o = data ?? initial;
  const award = o.award;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewDraft | null>(null);

  if (!award?.payments) return null;
  const payments = award.payments;
  const currency = o.currency;
  const money = (n: number | null) => (n == null ? '' : formatAward(n, currency));

  // Who is looking, and so what the cards offer. Actions only while the
  // job is live: once paid in full, or cancelled, the board is a record.
  const live = o.status === 'awarded' && !award.paidAtUtc;
  const reviewer = live && (o.isOwner || o.isAdmin);
  const payer = live && o.isOwner;
  const hired = live && award.viewerIsWinner;
  const byAdmin = o.isAdmin && !o.isOwner;
  const repo = usesRepo(o.delivery);
  const upload = usesUpload(o.delivery);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['opportunity', slug] });
    router.refresh();
  };

  const act = async (id: string, path: 'approve' | 'changes' | 'paid' | 'resubmit', body?: unknown) => {
    setBusy(`${id}:${path}`);
    setError(null);
    try {
      await postJson(`/api/checkpoints/${id}/${path}`, body);
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const openCount = payments.filter((p) => p.state !== 'paid').length;
  const markPaid = (p: MilestonePayment) => {
    const last = openCount === 1;
    confirmDialog({
      tagKey: 'milestone-track',
      header: `Mark milestone ${p.number} paid`,
      message:
        `Confirm only once ${money(p.amount) || 'its amount'} has actually gone to ${award.winnerName} — this is the ` +
        'record both of you point to later, and marking it paid approves the milestone too. ' +
        (last
          ? repo
            ? 'It is the last one: the award is complete and the repository transfers to your connected GitHub account.'
            : 'It is the last one: the award is complete.'
          : `Milestone ${p.number + 1} opens for them the moment you do.`),
      acceptLabel: 'I have paid it',
      rejectLabel: 'Not yet',
      accept: () => void act(p.checkpointId!, 'paid'),
    });
  };

  const paidCount = payments.filter((p) => p.state === 'paid').length;
  const current = payments.find((p) => p.state !== 'paid' && p.state !== 'locked');
  // The hired freelancer is the one entrant the board lists, where it lists any.
  const avatarUrl = o.entrants.find((e) => e.displayName === award.winnerName)?.avatarUrl ?? null;

  return (
    <div className="mt-4">
      <ConfirmDialog tagKey="milestone-track" />

      {/* The whole job in one line, and the track under it: a segment per
          milestone in its state's colour, so five or fifteen read at a glance. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="m-0 flex items-center gap-2 text-sm">
          <Avatar name={award.winnerName} url={avatarUrl} size="xs" />
          <span className="font-medium">{award.winnerName}</span>
          <span className="text-[var(--text-color-secondary)]">
            · {paidCount} of {payments.length} milestones paid
            {current && ` · now on milestone ${current.number}`}
          </span>
        </p>
        <p className="m-0 text-sm tabular-nums text-[var(--text-color-secondary)]" aria-live="polite">
          <span className="font-semibold text-[var(--text-color)]">{money(award.amountPaid ?? 0)}</span> of{' '}
          {money(o.awardAmount)} paid
          {(award.amountOwed ?? 0) > 0 && (
            <>
              {' · '}
              <span className="font-medium text-amber-600 dark:text-amber-500">{money(award.amountOwed)} approved and due</span>
            </>
          )}
        </p>
      </div>
      <ol className="m-0 mt-2 flex list-none gap-1 p-0" aria-label="Milestones in order, coloured by state">
        {payments.map((p) => (
          <li
            key={p.number}
            className={`h-2 flex-1 rounded-full ${TONE[p.state].bar}`}
            title={`Milestone ${p.number}: ${PAY_STATE_LABEL[p.state]}`}
            aria-label={`Milestone ${p.number}: ${PAY_STATE_LABEL[p.state]}`}
          />
        ))}
      </ol>

      <ol className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {payments.map((p, i) => {
          const m = o.milestones[i];
          const tone = TONE[p.state];
          const waitingOnClient = p.state === 'submitted' || p.state === 'approved';
          const reviews = p.reviews ?? [];
          const latest = reviews.length > 0 ? reviews[reviews.length - 1] : null;
          const earlier = reviews.slice(0, -1);
          return (
            <li
              key={p.number}
              className={`flex flex-col gap-2.5 rounded-xl border p-4 ${tone.card} ${
                current?.number === p.number ? 'ring-2 ring-[color:color-mix(in_srgb,var(--primary-color)_40%,transparent)]' : ''
              }`}
              aria-current={current?.number === p.number ? 'step' : undefined}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone.badge}`}
                  aria-hidden
                >
                  {p.state === 'paid' ? <i className="pi pi-check text-xs" /> : p.number}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-semibold leading-tight [overflow-wrap:anywhere]">
                    <span className="sr-only">Milestone {p.number}: </span>
                    {m?.title ?? `Milestone ${p.number}`}
                  </p>
                  <p className="m-0 mt-1 text-xs text-[var(--text-color-secondary)]">{whenLine(p, m?.dueUtc ?? null)}</p>
                </div>
                {p.amount != null && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{money(p.amount)}</span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone.chip}`}>
                  <i className={`pi ${tone.icon} text-[11px]`} aria-hidden />
                  {PAY_STATE_LABEL[p.state]}
                </span>
                {p.ref && (
                  <span className="truncate text-xs text-[var(--text-color-secondary)]" title={`Handed in as ${p.ref}`}>
                    <i className="pi pi-tag mr-1 text-[11px]" aria-hidden />
                    {p.ref}
                  </span>
                )}
              </div>

              {m?.description && (
                <p className="m-0 line-clamp-2 text-xs text-[var(--text-color-secondary)]" title={m.description}>
                  {m.description}
                </p>
              )}

              {/* The record: the latest review in full, the earlier rounds folded. */}
              {latest && <ReviewLine review={latest} clientName={o.clientName} />}
              {earlier.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--text-color-secondary)]">
                    {earlier.length === 1 ? 'One earlier review' : `${earlier.length} earlier reviews`}
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {earlier.map((r, k) => (
                      <ReviewLine key={k} review={r} clientName={o.clientName} />
                    ))}
                  </div>
                </details>
              )}

              {/* The client's answers — or an administrator's, bar paying. */}
              {reviewer && p.checkpointId && waitingOnClient && (
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--surface-border)] pt-2.5">
                  {p.state === 'submitted' && (
                    <>
                      <Button
                        label="Approve"
                        icon="pi pi-check"
                        size="small"
                        disabled={!!busy}
                        onClick={() => setReview({ id: p.checkpointId!, number: p.number, title: m?.title ?? '', decision: 'approve' })}
                      />
                      <Button
                        label="Ask for changes"
                        icon="pi pi-replay"
                        size="small"
                        outlined
                        severity="secondary"
                        disabled={!!busy}
                        onClick={() => setReview({ id: p.checkpointId!, number: p.number, title: m?.title ?? '', decision: 'changes' })}
                      />
                    </>
                  )}
                  {payer && (
                    <Button
                      label="Mark paid"
                      icon="pi pi-wallet"
                      size="small"
                      outlined={p.state !== 'approved'}
                      loading={busy === `${p.checkpointId}:paid`}
                      disabled={!!busy}
                      onClick={() => markPaid(p)}
                    />
                  )}
                  {i === 0 && <HelpIcon topic="opportunity.milestoneReview" label="Reviewing a milestone" />}
                </div>
              )}

              {/* The freelancer's side: what to do with the one that is theirs to move. */}
              {hired && p.state === 'open' && (
                <p className="m-0 mt-auto border-t border-[var(--surface-border)] pt-2.5 text-sm text-[var(--text-color-secondary)]">
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
              {hired && p.state === 'changes_requested' && p.checkpointId && (
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--surface-border)] pt-2.5">
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
              {hired && p.state === 'submitted' && (
                <p className="m-0 mt-auto border-t border-[var(--surface-border)] pt-2.5 text-sm text-[var(--text-color-secondary)]">
                  <i className="pi pi-clock mr-1" aria-hidden />
                  Waiting for the client&rsquo;s review.
                </p>
              )}
              {hired && p.state === 'approved' && (
                <p className="m-0 mt-auto border-t border-[var(--surface-border)] pt-2.5 text-sm text-[var(--text-color-secondary)]">
                  Approved — the client pays you directly and marks it paid here, which opens the next one.
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {error && <Message severity="error" text={error} className="mt-3 w-full" />}

      <ReviewDialog
        draft={review}
        clientName={o.clientName}
        freelancerName={award.winnerName}
        byAdmin={byAdmin}
        busy={!!busy}
        onClose={() => setReview(null)}
        onSend={async (draft, note, advice) => {
          const ok = await act(draft.id, draft.decision === 'approve' ? 'approve' : 'changes', {
            note: note.trim() || null,
            advice: advice.trim() || null,
          });
          if (ok) setReview(null);
        }}
      />
    </div>
  );
}

type ReviewDraft = { id: string; number: number; title: string; decision: 'approve' | 'changes' };

export const MIN_NOTE = 10;
export const MAX_TEXT = 1000;

/** How many characters a request for changes still lacks, counted as the server counts them: trimmed. */
export function changesNoteShortBy(note: string): number {
  return Math.max(0, MIN_NOTE - note.trim().length);
}

/** The send button's hover hint while a request for changes is too short to send. */
export function changesNoteHint(note: string): string {
  const left = changesNoteShortBy(note);
  return `Say what should change in at least ${MIN_NOTE} characters — ${left} more to go.`;
}

/**
 * The count under "What should change?": how far the words are from being
 * sendable, then how much room is left — so a greyed-out send button is never
 * a mystery.
 */
export function ChangesNoteCount({ id, note }: { id: string; note: string }) {
  const left = changesNoteShortBy(note);
  return (
    <p
      id={id}
      aria-live="polite"
      className={`m-0 mt-1 text-xs tabular-nums ${left > 0 ? 'text-[var(--text-color-secondary)]' : 'text-green-700 dark:text-green-400'}`}
    >
      {left > 0
        ? `${left} more ${left === 1 ? 'character' : 'characters'} to send it back`
        : `Ready to send · ${note.trim().length} of ${MAX_TEXT} characters`}
    </p>
  );
}

/**
 * One review, written: the decision first, then the remarks and — where the
 * reviewer gave any — the advice for the milestones ahead. Both are typed
 * here, so the freelancer gets the direction with the verdict, in one
 * email and on one card.
 */
function ReviewDialog({
  draft,
  clientName,
  freelancerName,
  byAdmin,
  busy,
  onClose,
  onSend,
}: {
  draft: ReviewDraft | null;
  clientName: string;
  freelancerName: string;
  byAdmin: boolean;
  busy: boolean;
  onClose: () => void;
  onSend: (draft: ReviewDraft, note: string, advice: string) => Promise<void>;
}) {
  const [decision, setDecision] = useState<'approve' | 'changes'>('approve');
  const [note, setNote] = useState('');
  const [advice, setAdvice] = useState('');
  // The draft arriving resets the form to the button that opened it.
  const [seen, setSeen] = useState<ReviewDraft | null>(null);
  if (draft && draft !== seen) {
    setSeen(draft);
    setDecision(draft.decision);
    setNote('');
    setAdvice('');
  }
  const approving = decision === 'approve';
  const noteShort = !approving && changesNoteShortBy(note) > 0;

  return (
    <Dialog
      header={draft ? `Review milestone ${draft.number}${draft.title ? ` — ${draft.title}` : ''}` : ''}
      visible={!!draft}
      onHide={onClose}
      className="w-[36rem] max-w-[95vw]"
      footer={
        <div className="flex justify-end gap-2">
          <Button label="Cancel" text disabled={busy} onClick={onClose} />
          <Button
            label={approving ? `Approve milestone ${draft?.number ?? ''}` : 'Send back for changes'}
            icon={approving ? 'pi pi-check' : 'pi pi-replay'}
            severity={approving ? undefined : 'danger'}
            disabled={noteShort || busy}
            tooltip={noteShort && !busy ? changesNoteHint(note) : undefined}
            tooltipOptions={{ position: 'top', showOnDisabled: true }}
            loading={busy}
            onClick={() => draft && void onSend({ ...draft, decision }, note, advice)}
          />
        </div>
      }
    >
      <SelectButton
        value={decision}
        onChange={(e) => e.value && setDecision(e.value)}
        allowEmpty={false}
        options={[
          { label: 'Approve', value: 'approve', icon: 'pi pi-check' },
          { label: 'Ask for changes', value: 'changes', icon: 'pi pi-replay' },
        ]}
        itemTemplate={(opt: { label: string; icon: string }) => (
          <span className="flex items-center gap-2">
            <i className={opt.icon} aria-hidden />
            {opt.label}
          </span>
        )}
        aria-label="Decision"
      />
      <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
        {approving
          ? `The work is accepted and its payment is due${byAdmin ? ` from ${clientName}` : ''}. ${freelancerName} is emailed your words.`
          : `${freelancerName} is emailed your words and hands the milestone in again when it is done. It is not paid until it is approved.`}
      </p>

      <label htmlFor="review-note" className="mt-4 block text-sm font-medium">
        {approving ? 'Remarks' : 'What should change?'}{' '}
        <span className="font-normal text-[var(--text-color-secondary)]">
          {approving ? 'Optional — what was good, what to keep doing' : `At least ${MIN_NOTE} characters, a sentence they can act on`}
        </span>
      </label>
      <InputTextarea
        id="review-note"
        rows={4}
        maxLength={MAX_TEXT}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-1 w-full"
        aria-describedby={approving ? undefined : 'review-note-count'}
        autoFocus
      />
      {!approving && <ChangesNoteCount id="review-note-count" note={note} />}

      <label htmlFor="review-advice" className="mt-3 block text-sm font-medium">
        Advice for the milestones ahead{' '}
        <span className="font-normal text-[var(--text-color-secondary)]">Optional — direction, not a verdict on this one</span>
      </label>
      <InputTextarea
        id="review-advice"
        rows={3}
        maxLength={MAX_TEXT}
        value={advice}
        onChange={(e) => setAdvice(e.target.value)}
        className="mt-1 w-full"
      />

      {byAdmin && (
        <Message
          severity="info"
          className="mt-3 w-full"
          text={`You are reviewing for ${clientName}: the board says so, and they are emailed your decision. Marking it paid stays theirs.`}
        />
      )}
    </Dialog>
  );
}

/** One decision as the card shows it: who, when, the remarks, the advice. */
export function ReviewLine({ review: r, clientName }: { review: MilestoneReview; clientName: string }) {
  const approved = r.decision === 'approved';
  return (
    <div
      className={`rounded-r-md border-l-2 py-1 pl-2.5 text-sm ${
        approved ? 'border-green-600 bg-green-500/5' : 'border-red-400 bg-red-500/5'
      }`}
    >
      <p className="m-0 text-xs text-[var(--text-color-secondary)]">
        <i
          className={`pi mr-1 ${approved ? 'pi-check-circle text-green-700 dark:text-green-400' : 'pi-replay text-red-600 dark:text-red-400'}`}
          aria-hidden
        />
        {approved ? 'Approved' : 'Changes asked for'} by{' '}
        {r.onBehalf ? `an administrator for ${clientName}` : clientName} · {relativeTime(r.atUtc)}
      </p>
      {r.note && <p className="m-0 mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{r.note}</p>}
      {r.advice && (
        <p className="m-0 mt-1 whitespace-pre-line [overflow-wrap:anywhere]">
          <i className="pi pi-compass mr-1 text-xs text-[var(--primary-color)]" aria-hidden />
          <span className="font-medium">For the milestones ahead: </span>
          {r.advice}
        </p>
      )}
    </div>
  );
}

/** The card's second line: the step the milestone last took, or its date while it waits. */
function whenLine(p: MilestonePayment, dueUtc: string | null): string {
  const due = dueUtc
    ? `Due ${new Date(dueUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    : '';
  if (p.paidAtUtc) return `Paid ${relativeTime(p.paidAtUtc)}`;
  if (p.approvedAtUtc) return `Approved ${relativeTime(p.approvedAtUtc)}`;
  if (p.changesRequestedAtUtc && p.state === 'changes_requested') return `Sent back ${relativeTime(p.changesRequestedAtUtc)}`;
  if (p.submittedAtUtc && p.state !== 'open' && p.state !== 'locked') return `Handed in ${relativeTime(p.submittedAtUtc)}`;
  return due || (p.state === 'locked' ? 'Opens once the one before is paid' : 'In progress');
}

/** How each state wears its card, its badge, its chip and its segment of the track. */
const TONE: Record<MilestonePayState, { card: string; badge: string; chip: string; icon: string; bar: string }> = {
  paid: {
    card: 'border-green-600/40 bg-green-500/5',
    badge: 'bg-green-600 text-white',
    chip: 'border-green-600/40 text-green-700 dark:text-green-400',
    icon: 'pi-check-circle',
    bar: 'bg-green-600',
  },
  approved: {
    card: 'border-amber-500/60 bg-amber-500/5',
    badge: 'bg-amber-500 text-white',
    chip: 'border-amber-500/60 text-amber-700 dark:text-amber-400',
    icon: 'pi-wallet',
    bar: 'bg-amber-500',
  },
  submitted: {
    card: 'border-amber-500/60 bg-amber-500/5',
    badge: 'bg-amber-500 text-white',
    chip: 'border-amber-500/60 text-amber-700 dark:text-amber-400',
    icon: 'pi-inbox',
    bar: 'bg-amber-400',
  },
  changes_requested: {
    card: 'border-red-400/60 bg-red-500/5',
    badge: 'bg-red-500 text-white',
    chip: 'border-red-400/60 text-red-700 dark:text-red-400',
    icon: 'pi-replay',
    bar: 'bg-red-400',
  },
  open: {
    card: 'border-[var(--surface-border)] bg-[var(--surface-card)]',
    badge: 'bg-[var(--primary-color)] text-white',
    chip: 'border-[var(--primary-color)] text-[var(--primary-color)]',
    icon: 'pi-spin pi-spinner',
    bar: 'bg-[var(--primary-color)]',
  },
  locked: {
    card: 'border-[var(--surface-border)] bg-[var(--surface-card)] opacity-70',
    badge: 'bg-[var(--surface-hover)] text-[var(--text-color-secondary)]',
    chip: 'border-[var(--surface-border)] text-[var(--text-color-secondary)]',
    icon: 'pi-lock',
    bar: 'bg-[var(--surface-border)]',
  },
};
