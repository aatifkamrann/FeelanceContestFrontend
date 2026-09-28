'use client';

import { useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import FilePreviews from '@/components/FilePreviews';
import HelpIcon from '@/components/HelpIcon';
import { deleteJson, postJson, putFile, relativeTime, type EntryFile } from '@/lib/opportunities';

/**
 * The upload half of delivery, both sides of it. `EntryUploads` is the
 * entrant's panel — hand files in, tag one to a milestone to claim it,
 * delete the ones that claimed nothing, all until the deadline freezes
 * them. `EntryFileGallery` is what a reviewer reads. Both show the files as
 * a brief's attachments show (FilePreviews): pictures, PDFs, players and
 * text in place, anything else a download, so the entrant sees each file
 * as the client will.
 *
 * The upload is two calls: reserve a slot with the API, then PUT the bytes
 * to it — the API writes them to storage and lists the file in one go.
 */

// ------------------------------------------------------------- entrant

export function EntryUploads({
  entryId,
  files,
  milestones,
  uploadProblem,
  onChanged,
}: {
  entryId: string;
  files: EntryFile[];
  milestones: { title: string }[];
  /** Why another file may not land now, or null while uploads are open. */
  uploadProblem: string | null;
  onChanged: () => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null); // filename mid-upload, or 'delete'
  const [error, setError] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<number | null>(null);

  // Milestones this entry has not claimed yet — the only ones a file can claim.
  const claimed = new Set(files.map((f) => f.milestone).filter((m): m is number => m !== null));
  const claimable = milestones
    .map((m, i) => ({ label: `m${i + 1} — ${m.title}`, value: i + 1 }))
    .filter((o) => !claimed.has(o.value));

  const upload = async (file: File) => {
    setBusy(file.name);
    setError(null);
    try {
      const reserved = await postJson<{ id: string }>(
        `/api/entries/${entryId}/submissions`,
        { fileName: file.name, contentType: file.type || null, sizeBytes: file.size, milestone },
      );
      await putFile(`/api/submissions/${reserved.id}/content`, file);
      setMilestone(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (file: EntryFile) => {
    setBusy('delete');
    setError(null);
    try {
      await deleteJson(`/api/submissions/${file.id}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusy(null);
    }
  };

  const open = uploadProblem === null;

  return (
    <div className="mt-3 rounded-lg border border-[var(--surface-border)] p-3">
      <p className="text-sm font-medium">
        <i className="pi pi-upload mr-1" aria-hidden />
        Your files
        <HelpIcon topic="entry.upload" label="Handing work in" />
      </p>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        {open
          ? 'Hand your work in here. Tag a file to a milestone to claim it on the board. Nobody but you opens these before the deadline.'
          : uploadProblem}
      </p>

      {files.length > 0 && (
        <FilePreviews
          files={files}
          source="submissions"
          narrow
          detail={(f) => (
            <>
              {relativeTime(f.uploadedAtUtc)}
              {f.milestone !== null && (
                <Tag value={`claimed m${f.milestone}`} icon="pi pi-check" severity="info" />
              )}
            </>
          )}
          action={
            open
              ? (f) => (
                  <Button
                    icon="pi pi-trash"
                    text
                    size="small"
                    severity="danger"
                    className="!h-7 !w-7 !p-0"
                    // A file that claimed a milestone stays — the board is the record.
                    disabled={busy !== null || f.milestone !== null}
                    title={
                      f.milestone !== null
                        ? `This file claimed m${f.milestone}; claims are not undone.`
                        : `Delete ${f.fileName}`
                    }
                    onClick={() => remove(f)}
                    aria-label={`Delete ${f.fileName}`}
                  />
                )
              : undefined
          }
        />
      )}

      {error && <Message severity="error" text={error} className="mt-2 w-full" />}

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button
            label={busy && busy !== 'delete' ? `Uploading ${busy}…` : 'Upload a file'}
            icon="pi pi-upload"
            size="small"
            loading={busy !== null && busy !== 'delete'}
            disabled={busy !== null}
            onClick={() => fileInput.current?.click()}
          />
          {claimable.length > 0 && (
            <Dropdown
              value={milestone}
              options={claimable}
              onChange={(e) => setMilestone(e.value ?? null)}
              placeholder="Claims no milestone"
              showClear
              className="text-sm"
              aria-label="Milestone this file claims"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ reviewer

export function EntryFileGallery({
  files,
  showHelp,
}: {
  files: EntryFile[];
  showHelp?: boolean;
}) {
  if (files.length === 0)
    return (
      <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
        No files were handed in.
      </p>
    );
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-[var(--text-color-secondary)]">
        {files.length} file{files.length === 1 ? '' : 's'} handed in
        {showHelp && <HelpIcon topic="entry.files" label="Reviewing the files" />}
      </p>
      <FilePreviews
        files={files}
        source="submissions"
        narrow
        detail={(f) => f.milestone !== null && <Tag value={`m${f.milestone}`} severity="info" />}
      />
    </div>
  );
}
