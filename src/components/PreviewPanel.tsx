'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import HelpIcon from '@/components/HelpIcon';
import { apiFetch, apiUrl } from '@/lib/api';
import { postJson, relativeTime, type PreviewState } from '@/lib/opportunities';

/**
 * A running copy of an entrant's app, from the portal's side: start it, open
 * it in a new tab, stop it. `id` is the checkpoint's (a claimed milestone)
 * or the entry's (the final version). Nothing here talks to the build host:
 * a start or a stop is a row the portal's worker carries there, so the panel
 * asks again every few seconds while one is on its way.
 *
 * Open preview is a plain link to the API, which checks who is asking and
 * redirects to the preview's own address with a one-time ticket — the
 * preview's host never sees the portal's sign-in.
 */
export default function PreviewPanel({
  id,
  startLabel = 'Start preview',
  title,
  helpTopic,
  className,
}: {
  id: string;
  /** A heading inside the box, where the panel stands alone on a page. */
  title?: string;
  /** "Start preview" for a milestone, "Run final" for the final version. */
  startLabel?: string;
  /** The help topic beside the button, on the first row only. */
  helpTopic?: string;
  className?: string;
}) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/previews/${encodeURIComponent(id)}`);
      if (res.status === 401 || res.status === 404) {
        setProblem('Only the entrant, the opportunity’s client and administrators can run a preview.');
        return null;
      }
      if (!res.ok) {
        setProblem(`The preview could not be read (${res.status}).`);
        return null;
      }
      const next: PreviewState = await res.json();
      setPreview(next);
      setProblem(null);
      return next;
    } catch {
      setProblem('The preview could not be read — check your connection and try again.');
      return null;
    }
  }, [id]);

  // Quick while something is on its way, slow while it runs (the idle stop
  // happens on the host), not at all once it is down.
  const waiting = preview?.status === 'pending' || preview?.status === 'starting' || preview?.stopping;
  const running = preview?.status === 'running' && !preview.stopping;
  useEffect(() => {
    void load();
  }, [load]);
  // Every answer is a new object, so each one arms the next look.
  useEffect(() => {
    if (!waiting && !running) return;
    const timer = setTimeout(() => void load(), waiting ? 4000 : 30000);
    return () => clearTimeout(timer);
  }, [preview, waiting, running, load]);

  const act = async (how: 'start' | 'stop') => {
    setBusy(true);
    setError(null);
    try {
      if (how === 'start') {
        setPreview(await postJson<PreviewState>(`/api/previews/${encodeURIComponent(id)}`));
      } else {
        const res = await apiFetch(`/api/previews/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`The preview could not be stopped (${res.status}).`);
        setPreview(await res.json());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  if (problem) return <p className={`text-sm text-[var(--text-color-secondary)] ${className ?? ''}`}>{problem}</p>;
  if (!preview) return null;

  return (
    <section
      className={`rounded-lg border border-[var(--surface-border)] p-3 text-sm ${className ?? ''}`}
      aria-label={preview.kind === 'final' ? 'Preview of the final version' : `Preview of milestone ${preview.milestoneNumber}`}
    >
      {title && <p className="mb-2 font-medium">{title}</p>}
      {running ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={apiUrl(`/api/previews/${encodeURIComponent(id)}/open`)}
              target="_blank"
              rel="noopener noreferrer"
              className="p-button p-button-sm no-underline"
            >
              <i className="pi pi-external-link mr-2" aria-hidden />
              Open preview
            </a>
            <Button label="Stop" icon="pi pi-stop" size="small" text severity="secondary" disabled={busy} onClick={() => void act('stop')} />
            {helpTopic && <HelpIcon topic={helpTopic} label="Previews" />}
          </div>
          <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
            Running{preview.commit && <> commit {preview.commit}</>}
            {preview.address && <> at {preview.address}</>}. It stops after {preview.idleMinutes} minutes without a visit
            {preview.lastSeenAtUtc && <>; last opened {relativeTime(preview.lastSeenAtUtc)}</>}.
          </p>
          {preview.notes && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]">
                {preview.viewerIsEntrant ? 'From your PREVIEW.md' : 'From the entrant’s PREVIEW.md'}
              </p>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-ground)] p-3 font-sans text-sm">
                {preview.notes}
              </pre>
            </>
          )}
        </>
      ) : waiting ? (
        <p className="text-[var(--text-color-secondary)]">
          <i className="pi pi-spin pi-spinner mr-2" aria-hidden />
          {preview.stopping
            ? 'Stopping…'
            : preview.status === 'pending'
              ? 'Waiting for the build host to take it.'
              : preview.kind === 'final'
                ? 'Checking out the final version, building it and starting its containers.'
                : 'Checking out the commit and starting its containers.'}{' '}
          This refreshes on its own.
        </p>
      ) : (
        <>
          {preview.status === 'failed' && preview.error && (
            <p className="mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              The preview did not start: {preview.error}
            </p>
          )}
          {preview.status === 'stopped' && preview.stopReason && (
            <p className="mb-2 text-[var(--text-color-secondary)]">{preview.stopReason}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              label={preview.status === 'none' ? startLabel : `${startLabel} again`}
              icon="pi pi-play"
              size="small"
              outlined
              loading={busy}
              disabled={busy || !preview.canStart}
              onClick={() => void act('start')}
            />
            {helpTopic && <HelpIcon topic={helpTopic} label="Previews" />}
          </div>
          {!preview.canStart && preview.startProblem && (
            <p className="mt-1 text-xs text-[var(--text-color-secondary)]">{preview.startProblem}</p>
          )}
          {preview.status === 'failed' && preview.logTail && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-[var(--text-color-secondary)]">Last lines of the start log</summary>
              <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-ground)] p-2 text-xs">
                {preview.logTail}
              </pre>
            </details>
          )}
        </>
      )}
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
    </section>
  );
}
