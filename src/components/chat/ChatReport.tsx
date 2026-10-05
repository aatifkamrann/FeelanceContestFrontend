'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { RadioButton } from 'primereact/radiobutton';
import HelpIcon from '@/components/HelpIcon';
import {
  chatKeys,
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  reportThread,
  type ChatThread,
  type ReportReason,
} from '@/lib/chat';

/**
 * The flag at the top of a conversation: reports it for review. One open
 * report per member — while theirs is being reviewed the flag says so
 * instead — and nothing to report until something has been said. The
 * other side is never told.
 */
export default function ChatReport({ thread }: { thread: ChatThread }) {
  const [open, setOpen] = useState(false);
  const reported = thread.reportedAtUtc;
  const nothingSaid = !thread.last;

  const title = reported
    ? `You reported this conversation on ${new Date(reported).toLocaleDateString()}; it is being reviewed.`
    : nothingSaid
      ? 'Nothing has been said here yet.'
      : 'Report this conversation';

  return (
    <>
      <Button
        icon={reported ? 'pi pi-flag-fill' : 'pi pi-flag'}
        text
        rounded
        size="small"
        severity={reported ? 'danger' : 'secondary'}
        aria-label={reported ? 'Reported — being reviewed' : 'Report this conversation'}
        title={title}
        disabled={!!reported || nothingSaid}
        onClick={() => setOpen(true)}
      />
      {open && <ReportDialog thread={thread} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportDialog({ thread, onClose }: { thread: ChatThread; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const send = useMutation({
    mutationFn: () => reportThread(thread.entryId, reason!, details),
    onSuccess: () => {
      setDone(true);
      setError(null);
      queryClient.invalidateQueries({ queryKey: chatKeys.thread(thread.entryId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.threads });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'The report was not sent.'),
  });

  const needsWords = reason === 'other' && !details.trim();
  const footer = done ? (
    <Button label="Close" onClick={onClose} autoFocus />
  ) : (
    <div className="flex justify-end gap-2">
      <Button label="Cancel" text onClick={onClose} />
      <Button
        label="Report"
        icon="pi pi-flag"
        severity="danger"
        loading={send.isPending}
        disabled={!reason || needsWords}
        onClick={() => send.mutate()}
      />
    </div>
  );

  return (
    <Dialog
      visible
      onHide={onClose}
      header={
        <span className="flex items-center gap-1">
          Report this conversation
          <HelpIcon topic="chat.report" label="Reporting a conversation" />
        </span>
      }
      footer={footer}
      style={{ width: 'min(30rem, calc(100vw - 2rem))' }}
      modal
      dismissableMask={!send.isPending}
    >
      {done ? (
        <div className="flex gap-3">
          <i className="pi pi-check-circle mt-0.5 text-xl text-green-600" aria-hidden />
          <p className="m-0 text-sm">
            Reported. The portal will review this conversation, and you will be emailed once it has been.{' '}
            {thread.other.displayName} is not told.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-[var(--text-color-secondary)]">
            Your conversation with {thread.other.displayName} about “{thread.opportunity.title}” will be reviewed.{' '}
            {thread.other.displayName} is not told you reported it.
          </p>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-sm font-medium">What is wrong?</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r.key} className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioButton
                  inputId={`report-${r.key}`}
                  name="report-reason"
                  value={r.key}
                  checked={reason === r.key}
                  onChange={() => setReason(r.key)}
                />
                {r.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1">
            <label htmlFor="report-details" className="text-sm font-medium">
              In your own words {reason === 'other' ? '' : <span className="font-normal text-[var(--text-color-secondary)]">(optional)</span>}
            </label>
            <InputTextarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              autoResize
              maxLength={REPORT_DETAILS_MAX}
              placeholder="What happened, and which messages"
              className="text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="m-0 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
