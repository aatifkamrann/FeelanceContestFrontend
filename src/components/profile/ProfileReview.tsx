'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AiProvenance, AiSuggestionPanel, useSuggestionFold } from '@/components/AiDraft';
import HelpIcon from '@/components/HelpIcon';
import PortalNote from '@/components/PortalNote';
import { aiStatusQuery, type AiArtifact } from '@/lib/opportunities';
import type { MemberProfile, ProfileReviewOutput, Strength } from '@/lib/profile';
import { apiFetch } from '@/lib/api';

/**
 * Step eight of joining: the member's own page read back to them. The
 * heading, the checklist of the seven steps before this one, and what
 * would make more of the open opportunities theirs — all above the page
 * itself, and none of it on anybody else's copy of that page. A client's
 * preview gets the heading alone: the checklist is the freelancer's steps,
 * and the review reads a freelancer against opportunities they could enter.
 */
export default function ProfileReview({ profile }: { profile: MemberProfile }) {
  const freelancer = profile.role === 'freelancer';
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold">Your Network Profile</h2>
      {freelancer && profile.strength && <StrengthCard strength={profile.strength} />}
      {freelancer && <ImprovementsNote profile={profile} />}
    </div>
  );
}

/**
 * The seven steps with a tick each — the join rail, read back off what
 * was saved. It is a checklist and not the merit score: one project ticks
 * Portfolio here, and the breakdown further down is where more of them
 * count.
 */
function StrengthCard({ strength }: { strength: Strength }) {
  return (
    <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-6">
      <h3 className="text-lg font-semibold">
        Profile Strength
        <HelpIcon topic="profile.strength" label="What counts as done" />
      </h3>
      <p className="mt-2 text-3xl font-bold tabular-nums">{strength.percent}%</p>
      <ul className="mt-4 flex max-w-sm flex-col gap-2 text-sm">
        {strength.steps.map((step) => (
          <li key={step.label} className="flex items-center justify-between gap-6" title={step.detail}>
            <span className={step.done ? '' : 'text-[var(--text-color-secondary)]'}>{step.label}</span>
            {step.done ? (
              <i
                className="pi pi-check font-bold text-green-700 dark:text-green-400"
                role="img"
                aria-label="done"
              />
            ) : (
              <i className="pi pi-circle text-[var(--text-color-secondary)]" role="img" aria-label="not yet" />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The review as the API hands it over: the live lines with the live
 * figures, already worded — by the model where its answer has words for a
 * line, by the portal otherwise — so the box never waits for anything.
 */
type Review = Omit<AiArtifact, 'output'> & {
  output: ProfileReviewOutput;
  /** How many opportunities the figures are a share of; none means nothing to measure. */
  openOpportunities: number;
  /** Whether any of the words are the model's rather than the portal's own. */
  worded: boolean;
  /** The words answer an older profile than this one; the figures never do. */
  stale?: boolean;
};

/**
 * Reads the review, and keeps reading while the model's words are on
 * their way. The GET is what queues them — there is no button — so the
 * lines are on the page from the first answer and the wording swaps in a
 * few seconds later. `savedAt` is a dependency on purpose: a save is a new
 * profile, and a new profile is a new reading.
 */
function useProfileReview(enabled: boolean, savedAt: string | null) {
  const [review, setReview] = useState<Review | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let gone = false;
    let polls = 48; // ~2 minutes of patience, then whatever the next visit finds
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const res = await apiFetch('/api/profile/ai/review');
      if (gone || !res.ok) return;
      const next = (await res.json()) as Review;
      if (gone) return;
      setReview(next);
      if (next.status === 'pending' && polls-- > 0) timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => {
      gone = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, savedAt]);
  return review;
}

/**
 * The portal, under its own name, saying what the profile is strongest for
 * and what would make more of the open opportunities this member's to enter.
 * Each line's figure is the portal's arithmetic — the share of the open
 * opportunities that change would newly open — and the model only puts the
 * line into words. Absent where the feature is off.
 */
function ImprovementsNote({ profile }: { profile: MemberProfile }) {
  const { data: aiStatus } = useQuery(aiStatusQuery);
  const enabled = !!aiStatus?.features.review;
  const review = useProfileReview(enabled, profile.updatedAtUtc);
  // A saved profile is a new reading, and opens the panel again; the polls
  // that swap the model's words in are the same reading and leave it be.
  const fold = useSuggestionFold(profile.updatedAtUtc);
  if (!enabled || !review || !review.output) return null;

  const { strongFor, improvements } = review.output;
  // The model names the kind of work; until it has, the member's own
  // primary category is the next best truth.
  const kind = strongFor ?? profile.primaryCategory?.label.toLowerCase() ?? 'the work you have listed';

  return (
    <PortalNote>
      <p className="font-semibold text-[var(--text-color)]">
        Your profile is strong for {kind} opportunities.
        <HelpIcon topic="profile.review" label="How the figures are worked out" />
      </p>
      <AiSuggestionPanel
        title={improvements.length === 0 ? 'Recommended improvements' : `Recommended improvements (${improvements.length})`}
        fold={fold}
      >
        {improvements.length === 0 ? (
          <p>
            {review.openOpportunities === 0
              ? 'There are no open opportunities to measure against right now.'
              : 'No single change would open more of the current opportunities to you.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {improvements.map((item) => (
              <li key={item.id}>
                <p className="font-medium text-green-700 dark:text-green-400">+{item.gain}% Match Potential</p>
                <p className="text-[var(--text-color)]">{item.text}</p>
              </li>
            ))}
          </ul>
        )}
        {review.stale && (
          <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
            <i className="pi pi-history mr-1" aria-hidden />
            Worded for an earlier version of your profile — fresh words are on their way. The figures are current.
          </p>
        )}
        {/* The figures are never the model's; the words are, once it has
            answered, and only then is there anything to attribute. */}
        {review.worded && <AiProvenance artifact={review} />}
      </AiSuggestionPanel>
    </PortalNote>
  );
}
