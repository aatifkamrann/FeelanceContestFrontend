'use client';

import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import PreviewPanel from '@/components/PreviewPanel';
import { apiFetch, apiUrl } from '@/lib/api';
import { utcMoment } from '@/lib/opportunities';

/** What GET /api/checkpoints/{id}/build answers. */
type CheckpointBuild = {
  status: 'none' | 'pending' | 'building' | 'built' | 'failed';
  milestoneNumber: number;
  commit: string | null;
  startedAtUtc: string | null;
  finishedAtUtc: string | null;
  error: string | null;
  logTail: string | null;
  logAvailable: boolean;
};

const HEADLINE: Record<CheckpointBuild['status'], string> = {
  none: 'Nothing to build',
  pending: 'Build queued',
  building: 'Building…',
  built: 'Builds',
  failed: 'Build failed',
};

/**
 * The log behind a board mark: the verdict, why it failed, the last lines
 * the row keeps, and the whole log as a download when storage has it. The
 * API answers only the entrant, the opportunity's client and an administrator;
 * anybody else is told so rather than shown a bare error. While a build is
 * still running the dialog asks again every five seconds.
 */
export default function BuildLogDialog({ checkpointId, onHide }: { checkpointId: string; onHide: () => void }) {
  const [build, setBuild] = useState<CheckpointBuild | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const res = await apiFetch(`/api/checkpoints/${encodeURIComponent(checkpointId)}/build`);
        if (stopped) return;
        if (res.status === 401 || res.status === 404) {
          setProblem('Only the entrant, the opportunity’s client and administrators can read a build log.');
          return;
        }
        if (!res.ok) {
          setProblem(`The build could not be read (${res.status}).`);
          return;
        }
        const next: CheckpointBuild = await res.json();
        setBuild(next);
        if (next.status === 'pending' || next.status === 'building') timer = setTimeout(load, 5000);
      } catch {
        if (!stopped) setProblem('The build could not be read — check your connection and try again.');
      }
    };
    void load();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkpointId]);

  const title = build ? `Milestone ${build.milestoneNumber} · ${HEADLINE[build.status]}` : 'Build';
  return (
    <Dialog
      visible
      onHide={onHide}
      header={title}
      dismissableMask
      style={{ width: 'min(48rem, 95vw)' }}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[var(--text-color-secondary)]">
            {build?.commit && <>Commit {build.commit}</>}
            {build?.finishedAtUtc && <> · finished {utcMoment(build.finishedAtUtc)}</>}
            {!build?.finishedAtUtc && build?.startedAtUtc && <> · started {utcMoment(build.startedAtUtc)}</>}
          </span>
          <span className="flex gap-2">
            {build?.logAvailable && (
              <a
                href={apiUrl(`/api/checkpoints/${encodeURIComponent(checkpointId)}/build-log`)}
                className="p-button p-button-outlined p-button-sm no-underline"
              >
                <i className="pi pi-download mr-2" aria-hidden />
                Download full log
              </a>
            )}
            <Button label="Close" size="small" text onClick={onHide} />
          </span>
        </div>
      }
    >
      {problem ? (
        <p className="text-sm text-[var(--text-color-secondary)]">{problem}</p>
      ) : !build ? (
        <p className="text-sm text-[var(--text-color-secondary)]">
          <i className="pi pi-spin pi-spinner mr-2" aria-hidden />
          Reading the build…
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {build.status === 'failed' && build.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {build.error}
            </p>
          )}
          {build.status === 'built' && (
            <>
              <p className="text-sm text-[var(--text-color-secondary)]">
                The claimed commit built from its compose file on the build host. Run it to see the product
                as it stood at this milestone.
              </p>
              <PreviewPanel id={checkpointId} helpTopic="preview.start" />
            </>
          )}
          {(build.status === 'pending' || build.status === 'building') && (
            <p className="text-sm text-[var(--text-color-secondary)]">
              <i className="pi pi-spin pi-spinner mr-2" aria-hidden />
              {build.status === 'pending' ? 'Waiting for the build host to take it.' : 'The build host is building it now.'}{' '}
              This dialog refreshes on its own.
            </p>
          )}
          {build.logTail ? (
            <>
              <p className="text-xs uppercase tracking-wide text-[var(--text-color-secondary)]">Last lines of the log</p>
              <pre className="max-h-[50vh] overflow-auto rounded-lg border border-[var(--surface-border)] bg-[var(--surface-ground)] p-3 text-xs leading-relaxed">
                {build.logTail}
              </pre>
            </>
          ) : (
            build.status !== 'pending' &&
            build.status !== 'building' && (
              <p className="text-sm text-[var(--text-color-secondary)]">No log was kept for this build.</p>
            )
          )}
        </div>
      )}
    </Dialog>
  );
}
