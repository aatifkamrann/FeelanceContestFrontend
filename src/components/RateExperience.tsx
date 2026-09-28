'use client';

import { useState } from 'react';
import { Button } from 'primereact/button';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { Rating } from 'primereact/rating';
import HelpIcon from '@/components/HelpIcon';
import { putJson } from '@/lib/opportunities';

/**
 * The rating form both sides of a paid award share — the winner scores the
 * client, the client scores the winner. Who is being rated is derived by the
 * server from who is asking; this form only ever says how it went.
 *
 * A saved rating collapses to its display state with an edit affordance:
 * a score is an opinion, and opinions get to change.
 */
export default function RateExperience({
  awardId,
  aboutName,
  existing,
  onSaved,
}: {
  awardId: string;
  aboutName: string;
  existing: { stars: number; comment: string | null } | null;
  onSaved: () => Promise<void>;
}) {
  const [saved, setSaved] = useState(existing);
  const [editing, setEditing] = useState(existing === null);
  const [stars, setStars] = useState<number | null>(existing?.stars ?? null);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stars) return;
    setBusy(true);
    setError(null);
    try {
      const result = await putJson<{ stars: number; comment: string | null }>(
        `/api/awards/${awardId}/rating`,
        { stars, comment: comment.trim() || null },
      );
      setSaved(result);
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving the rating failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!editing && saved) {
    return (
      <div className="mt-4 rounded-lg border border-[var(--surface-border)] p-3">
        <p className="text-sm font-medium">Your rating of {aboutName}</p>
        <Rating value={saved.stars} readOnly cancel={false} className="mt-1" />
        {saved.comment && (
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">“{saved.comment}”</p>
        )}
        <Button
          label="Edit rating"
          size="small"
          text
          className="mt-1 !px-0"
          onClick={() => setEditing(true)}
        />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mt-4 rounded-lg border border-[var(--surface-border)] p-3">
      <p className="text-sm font-medium">
        How was working with {aboutName}?
        <HelpIcon topic="rating.stars" label="What the stars mean" />
      </p>
      <Rating
        value={stars ?? undefined}
        onChange={(e) => setStars(e.value ?? null)}
        cancel={false}
        className="mt-2"
      />
      <div className="mt-3">
        <label htmlFor={`rate-comment-${awardId}`} className="text-sm font-medium">
          Comment{' '}
          <span className="font-normal text-[var(--text-color-secondary)]">(public, optional)</span>
          <HelpIcon topic="rating.comment" label="The public comment" />
        </label>
        <InputTextarea
          id={`rate-comment-${awardId}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={600}
          placeholder="e.g. paid the same day, clear brief"
          className="mt-1 w-full"
        />
      </div>
      {error && <Message severity="error" text={error} className="mt-2 w-full" />}
      <div className="mt-3 flex items-center gap-2">
        <Button
          type="submit"
          label={saved ? 'Update rating' : 'Publish rating'}
          size="small"
          loading={busy}
          disabled={!stars}
        />
        {saved && (
          <Button
            type="button"
            label="Cancel"
            size="small"
            text
            onClick={() => {
              setEditing(false);
              setStars(saved.stars);
              setComment(saved.comment ?? '');
            }}
          />
        )}
      </div>
    </form>
  );
}
