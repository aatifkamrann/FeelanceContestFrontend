'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import BrandMark from '@/components/BrandMark';
import { brandingQuery, apiFetch } from '@/lib/api';
import { formatBytes } from '@/lib/opportunities';

const ACCEPT = 'image/png,image/svg+xml,image/jpeg,image/webp,image/gif';

/**
 * One brand image on the Settings screen's branding group. There are two
 * rows: the logo, which outranks the Logo URL field below it, and the tab
 * icon, which outranks the logo — a wordmark that reads beside the portal
 * name is a smear at 16px, so a portal with a wide logo wants a square mark
 * of its own. Either takes effect the moment it lands: no save button,
 * because the file is the change. Removing one falls back a step.
 */
export default function LogoUpload({ slot }: { slot: 'logo' | 'icon' }) {
  const queryClient = useQueryClient();
  const { data: branding } = useQuery(brandingQuery);
  const fileInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const isIcon = slot === 'icon';
  const uploaded = isIcon ? branding?.iconUploaded : branding?.logoUploaded;
  const noun = isIcon ? 'tab icon' : 'logo';

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['public', 'branding'] });

  const upload = async (file: File) => {
    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await apiFetch(`/api/settings/${slot}`, { method: 'POST', body });
      const data = (await res.json().catch(() => null)) as { error?: string; bytes?: number } | null;
      if (!res.ok) throw new Error(data?.error ?? `The API answered ${res.status}.`);
      setResult({ ok: true, detail: `${file.name} is the ${noun} now (${formatBytes(data?.bytes ?? file.size)}).` });
      await refresh();
    } catch (err) {
      setResult({ ok: false, detail: err instanceof Error ? err.message : 'The upload failed.' });
    } finally {
      setBusy(false);
      // So choosing the same file again counts as a change.
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch(`/api/settings/${slot}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(`The API answered ${res.status}.`);
      setResult({
        ok: true,
        detail: isIcon
          ? 'The tab icon is gone; the logo stands in, or the trophy when there is no logo either.'
          : 'The upload is gone; the Logo URL shows instead, or the trophy when that is empty too.',
      });
      await refresh();
    } catch (err) {
      setResult({ ok: false, detail: err instanceof Error ? err.message : 'The upload could not be removed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--surface-border)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[var(--surface-border)] bg-[var(--surface-ground)]"
          title={`How the ${noun} shows right now`}
        >
          {/* Both previews at one size. A true 16px preview is too small to
              judge on a modern display, and with nothing uploaded the tab
              really does show this same trophy — shrinking one of them only
              read as a rendering fault. */}
          <BrandMark use={slot} imgClassName="max-h-10 max-w-10" iconClassName="text-2xl" />
        </span>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-label={`Choose a ${noun} file`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          label={isIcon ? 'Upload tab icon' : 'Upload logo'}
          icon="pi pi-upload"
          size="small"
          outlined
          loading={busy}
          // One width for both, so the two rows line up instead of starting
          // their explanations at different places.
          className="min-w-[10.5rem] justify-center"
          onClick={() => fileInput.current?.click()}
        />
        {uploaded && (
          <Button
            label="Remove"
            icon="pi pi-times"
            size="small"
            text
            severity="danger"
            disabled={busy}
            onClick={() => void remove()}
          />
        )}
        <span className="min-w-[16rem] flex-1 text-sm text-[var(--text-color-secondary)]">
          {isIcon ? (
            <>
              The icon in the browser tab, square and legible at 16 pixels.{' '}
              {uploaded
                ? 'Remove it and the logo stands in.'
                : 'With none, the logo stands in — upload one here if your logo is a wide wordmark.'}
            </>
          ) : (
            <>
              PNG, SVG, JPEG, WebP or GIF, up to 512 KB.{' '}
              {uploaded
                ? 'The upload outranks the Logo URL below; remove it to fall back.'
                : 'An upload outranks the Logo URL below; with neither, the trophy stands in.'}
            </>
          )}
        </span>
      </div>
      {result && (
        <Message
          severity={result.ok ? 'success' : 'error'}
          text={result.detail}
          className="mt-2 w-full justify-start"
        />
      )}
    </div>
  );
}
