'use client';

import { useState } from 'react';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import {
  AiSuggestionPanel,
  MIN_TEXT_TO_READ,
  TextSuggestion,
  useSuggestionFold,
  type FormDraft,
} from '@/components/AiDraft';
import HelpIcon from '@/components/HelpIcon';
import PortalNote from '@/components/PortalNote';
import { postJson } from '@/lib/opportunities';
import type { ProfileDraft } from '@/lib/profile';

/**
 * The part of the form the model may read. Picked field by field rather
 * than spread from the draft, so the payment rows can never travel with
 * it — the API's request shape cannot carry them either, and the two
 * agree from opposite ends.
 */
function readable(d: ProfileDraft) {
  return {
    headline: d.headline,
    bio: d.bio,
    // Keys; the API turns them into the words a sentence would use. They
    // are part of the key this answer is kept under, so choosing a
    // different kind of work makes the next press a real one.
    primaryCategory: d.primaryCategory,
    secondaryCategories: d.secondaryCategories,
    workType: d.workType,
    location: d.location,
    yearsExperience: d.yearsExperience,
    hoursPerWeek: d.hoursPerWeek,
    skills: d.skills.filter((s) => s.name.trim() !== ''),
    languages: d.languages.filter((l) => l.name.trim() !== ''),
    // Only work its owner has said they may show publicly: this paragraph
    // is written for other people to read, and what the tick withholds from
    // the page it withholds from the model as well.
    projects: d.projects
      .filter((p) => p.title.trim() !== '' && p.mayShowPublicly)
      .map((p) => ({
        title: p.title,
        description: p.description,
        outcome: p.outcome,
        role: p.role,
        category: p.category,
        tech: p.tech,
        year: p.year,
      })),
  };
}

/** How much there is to read — the API declines below the same floor. */
function substance(d: ProfileDraft): number {
  const r = readable(d);
  return (
    r.headline.trim().length +
    r.bio.trim().length +
    r.skills.reduce((n, s) => n + s.name.trim().length, 0) +
    r.languages.reduce((n, l) => n + l.name.trim().length, 0) +
    r.projects.reduce(
      (n, p) =>
        n + p.title.trim().length + (p.description ?? '').trim().length + (p.outcome ?? '').trim().length,
      0,
    )
  );
}

/**
 * The portal offering to write the About from the rest of the form. The
 * offer and its button until there is a draft; then the draft, open in a
 * folding panel with three things to do with it. Nothing is applied until
 * the member chooses — "Use suggestion" and "Edit" both put the words in
 * the box above, "Keep mine" leaves it alone — and any of the three folds
 * the panel away and brings the button back.
 *
 * One call per draft: the last answer is kept against the form that
 * produced it, so pressing again on an unchanged form shows the same
 * draft without spending a second call.
 */
export default function SummaryNote({
  draft,
  onUse,
  onEdit,
  className,
  label = '✦ Generate Professional Summary',
}: {
  draft: ProfileDraft;
  /** Put the words in About You. */
  onUse: (text: string) => void;
  /** Put the words in About You and hand the cursor over. */
  onEdit: (text: string) => void;
  className?: string;
  /** The button's words: "Generate" on an empty About, "Improve" where the application already has one. */
  label?: string;
}) {
  const [answer, setAnswer] = useState<{ key: string; draft: FormDraft<{ summary: string }> } | null>(null);
  // Which answer is on screen: a new one opens the panel, acting on it folds it.
  const fold = useSuggestionFold(answer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = readable(draft);
  const key = JSON.stringify(body);
  const tooThin = substance(draft) < MIN_TEXT_TO_READ;

  const generate = async () => {
    setError(null);
    // The same form again: the answer it got is the answer it gets.
    if (answer?.key === key) {
      fold.open();
      return;
    }
    setBusy(true);
    try {
      const res = await postJson<FormDraft<{ summary: string }>>('/api/profile/ai/summary', body);
      setAnswer({ key, draft: res });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The draft could not be read.');
    } finally {
      setBusy(false);
    }
  };

  // The same form again only re-opens the answer it already has, so the
  // button is not offered while that answer is on show.
  const showing = answer !== null && answer.key === key && fold.expanded;

  return (
    <PortalNote
      className={className}
      actions={
        showing ? undefined : (
          <>
            <Button
              type="button"
              label={label}
              size="small"
              loading={busy}
              disabled={busy || tooThin}
              onClick={() => void generate()}
            />
            <HelpIcon topic="profile.aiSummary" label="Drafting your About" />
          </>
        )
      }
    >
      {answer === null ? (
        <p>
          I can draft a professional summary from the details you’ve provided. You stay in control — approve,
          edit, or keep your own.
        </p>
      ) : (
        <AiSuggestionPanel title="Suggested summary" fold={fold}>
          <TextSuggestion
            text={answer.draft.output.summary}
            provenance={answer.draft}
            fold={fold}
            onUse={onUse}
            onEdit={onEdit}
          />
        </AiSuggestionPanel>
      )}
      {tooThin && (
        <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
          Add a title, a few skills or a line about your work first.
        </p>
      )}
      {error && <Message severity="error" text={error} className="mt-2 w-full justify-start" />}
    </PortalNote>
  );
}
