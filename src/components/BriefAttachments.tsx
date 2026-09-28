'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import FilePreviews from '@/components/FilePreviews';
import HelpIcon from '@/components/HelpIcon';
import { deleteJson, postJson, putFile, type OpportunityAttachment } from '@/lib/opportunities';
import { apiFetch } from '@/lib/api';

/**
 * The draft editor's attachment manager. Each file shows as the opportunity page
 * will show it (FilePreviews), with a remove button beside its download. The
 * upload is two calls: reserve a slot with the API, then PUT the bytes to
 * it — the API writes them to storage and lists the file in one go.
 */
export default function BriefAttachments({ opportunityId }: { opportunityId: string }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null); // filename mid-upload, or 'delete'
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['attachments', opportunityId],
    queryFn: async (): Promise<OpportunityAttachment[]> => {
      const res = await apiFetch(`/api/opportunities/${opportunityId}/attachments`);
      if (!res.ok) throw new Error(`Attachments failed: ${res.status}`);
      return ((await res.json()) as { items: OpportunityAttachment[] }).items;
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attachments', opportunityId] });

  const upload = async (file: File) => {
    setBusy(file.name);
    setError(null);
    try {
      const reserved = await postJson<{ id: string }>(
        `/api/opportunities/${opportunityId}/attachments`,
        { fileName: file.name, contentType: file.type || null, sizeBytes: file.size },
      );
      await putFile(`/api/attachments/${reserved.id}/content`, file);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (attachment: OpportunityAttachment) => {
    setBusy('delete');
    setError(null);
    try {
      await deleteJson(`/api/attachments/${attachment.id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <p className="font-medium">
        Attachments
        <HelpIcon topic="opportunity.attachments" label="Brief attachments" />
      </p>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        Logo masters, sample data, mockups — what the words of the brief cannot carry.
        Locked at publish, like the brief itself.
      </p>

      {data && data.length > 0 && (
        <FilePreviews
          files={data}
          source="attachments"
          action={(a) => (
            <Button
              icon="pi pi-trash"
              text
              size="small"
              severity="danger"
              className="!h-7 !w-7 !p-0"
              disabled={busy !== null}
              onClick={() => remove(a)}
              aria-label={`Remove ${a.fileName}`}
              title={`Remove ${a.fileName}`}
            />
          )}
        />
      )}

      {error && <Message severity="error" text={error} className="mt-2 w-full" />}

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
        label={busy && busy !== 'delete' ? `Uploading ${busy}…` : 'Attach a file'}
        icon="pi pi-upload"
        text
        size="small"
        className="mt-2"
        loading={busy !== null && busy !== 'delete'}
        disabled={busy !== null}
        onClick={() => fileInput.current?.click()}
      />
    </div>
  );
}
