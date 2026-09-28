'use client';

import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import HelpIcon from '@/components/HelpIcon';
import { AiDraftState, AiProvenance, AiSuggestionPanel, useAiDraft, useSuggestionFold } from '@/components/AiDraft';

type StandingNotesOutput = {
  summary: string | null;
  entrants: { entryId: string; note: string; check: string[] }[];
};

export type EntrantStandingNote = { note: string; check: string[] };

/**
 * One draft for the whole board, read in two places: the summary above the
 * entrant list, and each row's note inside its card. The hook holds the
 * artifact once; the panel and the rows both read from it.
 */
export function useStandingNotes(opportunityId: string) {
  const draft = useAiDraft(`/api/opportunities/${opportunityId}/ai/standing`);
  const output = draft.artifact?.status === 'done' ? (draft.artifact.output as StandingNotesOutput) : null;
  const byEntry = new Map<string, EntrantStandingNote>();
  for (const e of output?.entrants ?? []) byEntry.set(e.entryId, { note: e.note, check: e.check });
  return {
    ...draft,
    summary: output?.summary ?? null,
    hasNotes: output !== null,
    noteFor: (entryId: string | null) => (entryId ? (byEntry.get(entryId) ?? null) : null),
  };
}

/**
 * The request button and the board-wide summary. The notes themselves sit
 * in the entrant cards, beside the remove button they exist to inform —
 * and every one of them says it is a draft, not a decision.
 */
export function StandingNotesPanel({ notes }: { notes: ReturnType<typeof useStandingNotes> }) {
  const { artifact, request, requesting, error, summary, hasNotes } = notes;
  const fold = useSuggestionFold(artifact?.completedAtUtc ?? null);
  return (
    <div className="mt-3 rounded-lg border border-[var(--surface-border)] p-3">
      <div className="flex items-center">
        <Button
          label={hasNotes ? 'Redraft standing notes' : 'Draft standing notes'}
          icon="pi pi-sparkles"
          size="small"
          outlined
          loading={requesting || artifact?.status === 'pending'}
          onClick={() => void request()}
        />
        <HelpIcon topic="opportunity.aiStandingNotes" label="The standing notes" />
      </div>
      <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
        Puts each row&apos;s numbers into words and says what to open before deciding who stays.
        The scores and the order are the portal&apos;s own arithmetic.
      </p>
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
      {artifact && <AiDraftState artifact={artifact} />}
      {hasNotes && artifact && (
        <AiSuggestionPanel title="Standing notes" fold={fold}>
          <p>{summary ?? 'Each entrant’s note is in their card below.'}</p>
          <AiProvenance artifact={artifact} />
        </AiSuggestionPanel>
      )}
    </div>
  );
}

/** One row's note, under its standing, above its remove button. */
export function EntrantNote({ note }: { note: EntrantStandingNote | null }) {
  // Keyed on the words, not the object: the note is rebuilt on every render.
  const fold = useSuggestionFold(note?.note ?? null);
  if (!note) return null;
  return (
    <AiSuggestionPanel title="Standing note" fold={fold}>
      <p>{note.note}</p>
      {note.check.length > 0 && (
        <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
          Open: {note.check.join(' · ')}
        </p>
      )}
    </AiSuggestionPanel>
  );
}
