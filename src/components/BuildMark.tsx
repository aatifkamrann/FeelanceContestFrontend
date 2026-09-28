'use client';

import { useState } from 'react';
import type { BuildCell } from '@/lib/opportunities';
import BuildLogDialog from '@/components/BuildLogDialog';

/**
 * The second mark in a board cell, on an opportunity that requires Docker
 * Compose: whether the claimed commit built. Queued and building are
 * states in passing; built and failed are verdicts, and open the dialog
 * with the log behind them. A cell with nothing to build shows nothing.
 */
const MARKS: Record<Exclude<BuildCell['status'], 'none'>, { icon: string; className: string; word: string }> = {
  pending: { icon: 'pi-clock', className: 'text-[var(--text-color-secondary)]', word: 'build queued' },
  building: { icon: 'pi-spinner pi-spin', className: 'text-[var(--text-color-secondary)]', word: 'building…' },
  built: { icon: 'pi-check', className: 'text-green-600 dark:text-green-400', word: 'builds' },
  failed: { icon: 'pi-times-circle', className: 'text-red-600 dark:text-red-400', word: 'build failed' },
};

export default function BuildMark({ n, build }: { n: number; build: BuildCell | undefined }) {
  const [open, setOpen] = useState(false);
  if (!build || build.status === 'none') return null;
  const mark = MARKS[build.status];
  const live = build.preview === 'running';
  const label = `milestone ${n} ${mark.word}${live ? ', preview running' : ''}`;
  const icon = (
    <>
      <i className={`pi ${mark.icon} text-[0.8rem] ${mark.className}`} aria-hidden />
      {/* A preview up for this milestone: a second, smaller mark beside the verdict. */}
      {live && <i className="pi pi-play-circle ml-0.5 text-[0.7rem] text-[var(--primary-color)]" aria-hidden />}
    </>
  );

  // A verdict opens its log; a state in passing has none yet.
  if (!build.checkpointId || (build.status !== 'built' && build.status !== 'failed'))
    return (
      <span className="mt-0.5 block" title={label} aria-label={label}>
        {icon}
      </span>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-0.5 block w-full rounded hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
        title={`${label} — ${build.status === 'built' ? 'open the build log and the preview' : 'open the build log'}`}
        aria-label={`${label} — ${build.status === 'built' ? 'open the build log and the preview' : 'open the build log'}`}
      >
        {icon}
      </button>
      {open && <BuildLogDialog checkpointId={build.checkpointId} onHide={() => setOpen(false)} />}
    </>
  );
}
