'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import {
  formKey,
  postJson,
  relativeTime,
  type AiArtifact,
  type OpportunityFormSnapshot,
  type FormFeature,
} from '@/lib/opportunities';
import { apiFetch } from '@/lib/api';

/**
 * One AI draft's lifecycle from the browser's side. A request only queues a
 * background job, so this hook POSTs, then polls the matching GET until the
 * draft lands (or fails, or is skipped). Nothing here ever blocks a page —
 * the panels simply appear when the worker is done.
 */
export function useAiDraft(url: string) {
  const [artifact, setArtifact] = useState<AiArtifact | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollsLeft = useRef(0);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const poll = useCallback(async () => {
    const res = await apiFetch(url);
    if (!res.ok) return;
    const next = (await res.json()) as AiArtifact;
    setArtifact(next);
    if (next.status === 'pending' && pollsLeft.current-- > 0) {
      timer.current = setTimeout(() => void poll(), 2500);
    }
  }, [url]);

  // Show an existing draft on mount — a digest asked for yesterday is still
  // the digest, until the input changes and someone re-asks.
  useEffect(() => {
    pollsLeft.current = 0;
    void poll();
    return stop;
  }, [poll]);

  const request = async () => {
    setRequesting(true);
    setError(null);
    stop();
    try {
      const queued = await postJson<AiArtifact>(url);
      setArtifact(queued);
      pollsLeft.current = 48; // ~2 minutes of patience, then the GET on next visit
      timer.current = setTimeout(() => void poll(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request failed.');
    } finally {
      setRequesting(false);
    }
  };

  return { artifact, request, requesting, error };
}


/** Below this much text there is nothing worth a call; the API refuses it too. */
export const MIN_TEXT_TO_READ = 30;

/** One draft read from the form on screen, answered inside the request. */
export type FormDraft<T> = {
  output: T;
  provider: string | null;
  completedAtUtc: string | null;
  /** True when the API answered from its hour-long memory of this same form, so no call was spent. */
  cached?: boolean;
};

/**
 * The other half of the AI layer from the browser: the tools that read the
 * opportunity form rather than a stored opportunity. No queue and no polling —
 * there is no artifact to poll, because there may not even be an opportunity
 * yet. The request carries the whole form and comes back with the draft,
 * which is what lets these work while an opportunity is being posted; which
 * parts of the form a tool actually reads is FORM_READS, the sections
 * above the one it fills.
 *
 * It also holds the guard the server used to: `read` is true while the
 * parts this tool reads are the parts the current draft answers, so a
 * second press on an unchanged form cannot buy the same answer twice —
 * and an edit below the section it fills does not wake it either.
 */
export function useFormDraft<T>(feature: FormFeature, form: OpportunityFormSnapshot) {
  const [draft, setDraft] = useState<FormDraft<T> | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The measure the API uses too: the title and the brief, which every
  // tool reads and which come first on the form.
  const tooThin = (form.title.trim() + form.briefMarkdown.trim()).length < MIN_TEXT_TO_READ;
  const key = formKey(feature, form);
  const read = answered === key;

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<FormDraft<T>>(`/api/opportunities/ai/${feature}`, form);
      setDraft(res);
      setAnswered(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The draft could not be read.');
    } finally {
      setBusy(false);
    }
  };

  return { draft, output: draft?.output ?? null, ask, busy, error, tooThin, read };
}

/** The two things worth saying around a form draft that is not an error. */
export function AiFormNotes({ tooThin, stale }: { tooThin: boolean; stale: boolean }) {
  if (tooThin) {
    return (
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        Write the title and a few lines of the brief first.
      </p>
    );
  }
  if (!stale) return null;
  return (
    <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
      Something it read has changed since — ask again for a fresh answer.
    </p>
  );
}

/**
 * The one control every form tool is asked with: the same words, the same
 * icon and the same quiet states, so the client learns it once. It is
 * quiet while there is nothing to read and while the answer on screen is
 * already the answer to the form as it stands — a press then would spend
 * a call for the same words.
 */
export function SuggestButton({
  label = 'Suggest from the brief',
  icon = 'pi pi-sparkles',
  busy,
  tooThin,
  read,
  onAsk,
  help,
}: {
  label?: string;
  icon?: string;
  busy: boolean;
  tooThin: boolean;
  read: boolean;
  onAsk: () => void;
  help: React.ReactNode;
}) {
  return (
    <div className="flex items-center">
      <Button
        type="button"
        label={label}
        icon={icon}
        size="small"
        text
        loading={busy}
        disabled={busy || tooThin || read}
        onClick={onAsk}
      />
      {help}
    </div>
  );
}

/**
 * Every AI draft says so, and says who wrote it — provenance is part of the
 * feature. The API names it by the portal's own name (Branding → Portal name,
 * Ai/AiBrand.cs), never
 * the vendor behind it; "local" is work that never left the server.
 */
export function AiProvenance({
  artifact,
}: {
  artifact: Pick<AiArtifact, 'provider' | 'completedAtUtc'>;
}) {
  return (
    <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
      <i className="pi pi-sparkles mr-1" aria-hidden />
      AI draft
      {artifact.provider && artifact.provider !== 'local' && ` · ${artifact.provider}`}
      {artifact.completedAtUtc && ` · ${relativeTime(artifact.completedAtUtc)}`}
      {' — a starting point, not a verdict.'}
    </p>
  );
}

/**
 * Whether one AI suggestion is folded open. A suggestion arrives open — it
 * is what the member asked for — and folds away once they have acted on it
 * (used, edited, applied, or turned down), so the form they are filling is
 * what fills the screen again. It stays one click from being read again.
 * `key` is what makes a suggestion a new one: when it changes, the panel
 * opens again and forgets what was done with the last.
 */
export function useSuggestionFold(key: unknown) {
  const [expanded, setExpanded] = useState(true);
  const [taken, setTaken] = useState<string | null>(null);
  useEffect(() => {
    setExpanded(true);
    setTaken(null);
  }, [key]);
  return {
    expanded,
    /** What was done with it, for the folded header: "Used", "Applied", "Kept yours". */
    taken,
    toggle: () => setExpanded((v) => !v),
    open: () => setExpanded(true),
    /** Acted on: fold it and say how. */
    done: (word: string) => {
      setTaken(word);
      setExpanded(false);
    },
  };
}

export type SuggestionFold = ReturnType<typeof useSuggestionFold>;

/**
 * Every AI suggestion in the portal sits in one of these: a header that
 * says what it is and folds it, and the suggestion under it. Open by
 * default; `fold.done(...)` closes it once the suggestion has been used.
 * Nothing interactive goes in the header — it is one button.
 */
export function AiSuggestionPanel({
  title,
  fold,
  children,
  className,
}: {
  title: string;
  fold: SuggestionFold;
  children: React.ReactNode;
  className?: string;
}) {
  const bodyId = useId();
  return (
    <section
      className={`mt-2 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] text-sm${className ? ' ' + className : ''}`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-medium text-[var(--text-color)] hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary-color)]"
        aria-expanded={fold.expanded}
        aria-controls={bodyId}
        onClick={fold.toggle}
      >
        <i className="pi pi-sparkles text-[var(--primary-color)]" aria-hidden />
        <span className="flex-1">{title}</span>
        {!fold.expanded && fold.taken && (
          <span className="text-xs font-normal text-green-700 dark:text-green-400">
            <i className="pi pi-check mr-1 text-[0.65rem]" aria-hidden />
            {fold.taken}
          </span>
        )}
        <i
          className={`pi ${fold.expanded ? 'pi-chevron-up' : 'pi-chevron-down'} text-xs text-[var(--text-color-secondary)]`}
          aria-hidden
        />
        <span className="sr-only">{fold.expanded ? 'Hide' : 'Show'}</span>
      </button>
      <div id={bodyId} hidden={!fold.expanded} className="px-3 pb-3">
        {children}
      </div>
    </section>
  );
}

/**
 * A drafted paragraph and the three things to do with it — take it, take
 * it and keep typing, or keep your own. All three fold the panel; the
 * words stay readable under the header until a fresh draft replaces them.
 */
export function TextSuggestion({
  text,
  provenance,
  fold,
  onUse,
  onEdit,
}: {
  text: string;
  provenance: Pick<AiArtifact, 'provider' | 'completedAtUtc'>;
  fold: SuggestionFold;
  onUse: (text: string) => void;
  onEdit: (text: string) => void;
}) {
  return (
    <>
      <p className="whitespace-pre-line text-[var(--text-color)]">{text}</p>
      <AiProvenance artifact={provenance} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          label="Use suggestion"
          icon="pi pi-check"
          size="small"
          onClick={() => {
            onUse(text);
            fold.done('Used');
          }}
        />
        <Button
          type="button"
          label="Edit"
          icon="pi pi-pencil"
          size="small"
          outlined
          onClick={() => {
            onEdit(text);
            fold.done('Used, editing');
          }}
        />
        <Button
          type="button"
          label="Keep mine"
          size="small"
          text
          severity="secondary"
          onClick={() => fold.done('Kept yours')}
        />
      </div>
    </>
  );
}

/** The pending / failed / skipped states, worded once. */
export function AiDraftState({ artifact }: { artifact: AiArtifact }) {
  if (artifact.status === 'pending') {
    return (
      <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
        <i className="pi pi-spinner pi-spin mr-1" aria-hidden />
        Drafting in the background — this appears when it is ready.
      </p>
    );
  }
  if (artifact.status === 'failed' || artifact.status === 'skipped') {
    return (
      <p className="mt-2 text-sm text-amber-600">
        <i className="pi pi-info-circle wp-note-icon wp-keep-tone mr-1" aria-hidden />
        {artifact.note ?? 'The draft did not run.'}
      </p>
    );
  }
  return null;
}
