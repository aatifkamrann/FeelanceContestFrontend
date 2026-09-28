'use client';

import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import HelpIcon from '@/components/HelpIcon';
import { AiDraftState, AiProvenance, AiSuggestionPanel, useAiDraft, useSuggestionFold } from '@/components/AiDraft';

type SpamOutput = {
  scanned: number;
  flags: { entryId: string; entrant: string; reasons: string[] }[];
};

type DigestOutput = {
  summary: string;
  stack: string[];
  milestoneCoverage: string | null;
  quality: string | null;
  reviewFocus: string[];
};

/**
 * The client's review aids. Both are drafts beside the code, never verdicts:
 * the scan points at entries worth a second look, the digest shortens the
 * reading — and the announce button stays exactly where it was, unranked.
 */
export function SpamScanPanel({ opportunityId }: { opportunityId: string }) {
  const { artifact, request, requesting, error } = useAiDraft(
    `/api/opportunities/${opportunityId}/ai/spam`,
  );
  const output = artifact?.status === 'done' ? (artifact.output as SpamOutput) : null;
  const fold = useSuggestionFold(artifact?.completedAtUtc ?? null);

  return (
    <div className="mt-3 rounded-lg border border-[var(--surface-border)] p-3">
      <div className="flex items-center">
        <Button
          label="Scan for low-effort & copied entries"
          icon="pi pi-shield"
          size="small"
          outlined
          loading={requesting || artifact?.status === 'pending'}
          onClick={() => void request()}
        />
        <HelpIcon topic="opportunity.aiSpamScan" label="The spam & duplicate scan" />
      </div>
      <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
        Runs on this server only — nothing goes to a model provider.
      </p>
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {artifact && <AiDraftState artifact={artifact} />}
      {output && artifact && (
        <AiSuggestionPanel
          title={output.flags.length === 0 ? 'Scan: nothing flagged' : `Scan: ${output.flags.length} worth a second look`}
          fold={fold}
        >
          {output.flags.length === 0 ? (
            <p className="text-green-700 dark:text-green-400">
              <i className="pi pi-check-circle mr-1" aria-hidden />
              Scanned {output.scanned} {output.scanned === 1 ? 'entry' : 'entries'} — nothing flagged.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {output.flags.map((f) => (
                <li key={f.entryId} className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
                  <p className="font-medium">
                    <i className="pi pi-exclamation-triangle mr-1 text-amber-600" aria-hidden />
                    {f.entrant}
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-[var(--text-color-secondary)]">
                    {f.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <AiProvenance artifact={artifact} />
        </AiSuggestionPanel>
      )}
    </div>
  );
}

/** One entry's drafted reading aid, unfolding inside its card. */
export function EntryDigestPanel({ entryId, showHelp }: { entryId: string; showHelp: boolean }) {
  const { artifact, request, requesting, error } = useAiDraft(`/api/entries/${entryId}/ai/digest`);
  const output = artifact?.status === 'done' ? (artifact.output as DigestOutput) : null;
  const fold = useSuggestionFold(artifact?.completedAtUtc ?? null);

  return (
    <div className="mt-2">
      {!output && (
        <span className="flex items-center">
          <Button
            label="Digest"
            icon="pi pi-sparkles"
            size="small"
            text
            loading={requesting || artifact?.status === 'pending'}
            onClick={() => void request()}
          />
          {showHelp && <HelpIcon topic="entry.aiDigest" label="The review digest" />}
        </span>
      )}
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {artifact && <AiDraftState artifact={artifact} />}
      {output && (
        <AiSuggestionPanel title="Review digest" fold={fold}>
          <p>{output.summary}</p>
          {output.stack.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {output.stack.map((s, i) => (
                <Tag key={i} value={s} severity="secondary" />
              ))}
            </p>
          )}
          {output.milestoneCoverage && (
            <p className="mt-1 text-[var(--text-color-secondary)]">{output.milestoneCoverage}</p>
          )}
          {output.quality && (
            <p className="mt-1 text-[var(--text-color-secondary)]">{output.quality}</p>
          )}
          {output.reviewFocus.length > 0 && (
            <>
              <p className="mt-1 font-medium">Start reading at:</p>
              <ul className="list-disc pl-5 text-[var(--text-color-secondary)]">
                {output.reviewFocus.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}
          {artifact && <AiProvenance artifact={artifact} />}
          <span className="flex items-center">
            <Button
              label="Redraft"
              icon="pi pi-refresh"
              size="small"
              text
              loading={requesting}
              onClick={() => void request()}
            />
            {showHelp && <HelpIcon topic="entry.aiDigest" label="The review digest" />}
          </span>
        </AiSuggestionPanel>
      )}
    </div>
  );
}
