'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { SelectButton } from 'primereact/selectbutton';
import Avatar from '@/components/Avatar';
import BuildMark from '@/components/BuildMark';
import HelpIcon from '@/components/HelpIcon';
import { EntryFileGallery } from '@/components/EntryFiles';
import { StandingBadge } from '@/components/StandingBadge';
import { apiFetch } from '@/lib/api';
import {
  CLAIM_REVIEW_LABEL,
  count,
  meQuery,
  postJson,
  relativeTime,
  usesRepo,
  usesUpload,
  utcMoment,
  type BuildCell,
  type ClaimReviewCell,
  type ClaimReviewState,
  type EntrantStanding,
  type MilestoneState,
  type OpportunityDetail,
  type OpportunityEntrant,
} from '@/lib/opportunities';
import { ChangesNoteCount, MAX_TEXT, MIN_NOTE, ReviewLine, changesNoteHint, changesNoteShortBy } from './MilestoneTrack';

/**
 * The competitive board: one row per entrant, one column per milestone —
 * the milestone named in its heading, every claim a chip read against the
 * milestone's date — best standing first. The entrant column stays put
 * while a long checklist scrolls sideways, and a line above counts what
 * the matrix shows.
 *
 * Each claim can be reviewed. The client (or an administrator for them)
 * selects a claimed cell to read the files tagged with that milestone and
 * approve it or ask for changes, with remarks and advice; an entrant reads
 * the reviews of their own row, and a track of their milestones under the
 * matrix says where each one stands. Nobody reads another entrant's
 * reviews. The page renders this with the opportunity as the server fetched
 * it for the viewer; the rail's query refreshes it after a review.
 */
export default function BoardMatrix({
  slug,
  initial,
  dated,
  activityHeading,
}: {
  slug: string;
  initial: OpportunityDetail;
  dated: boolean;
  activityHeading: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data } = useQuery({
    queryKey: ['opportunity', slug],
    queryFn: async () => {
      const res = await apiFetch(`/api/opportunities/${encodeURIComponent(slug)}`);
      if (!res.ok) return null;
      return (await res.json()) as OpportunityDetail;
    },
    enabled: !!me,
  });
  const o = data ?? initial;
  const milestones = o.milestones;
  const entrants = o.entrants;
  const upload = usesUpload(o.delivery);
  const repo = usesRepo(o.delivery);

  // Who reviews: the client, or an administrator for them, while entries
  // run and while the client reads them. Whose row is theirs: an entrant
  // receives reviews on their own row alone, so a row carrying them, seen
  // by anyone who is not a reviewer, is the viewer's.
  const moderator = o.isOwner || o.isAdmin;
  const reviewer = moderator && o.kind === 'competitive' && (o.status === 'open' || o.status === 'reviewing');
  const byAdmin = o.isAdmin && !o.isOwner;
  const mine = moderator ? null : (entrants.find((e) => e.reviews) ?? null);

  const [open, setOpen] = useState<{ entrant: OpportunityEntrant; index: number } | null>(null);
  // The dialog follows the data: after a review it shows the new round.
  const openEntrant = open ? (entrants.find((e) => e.userId === open.entrant.userId) ?? open.entrant) : null;

  const stateOf = (e: OpportunityEntrant, i: number): MilestoneState =>
    e.milestoneStates?.[i] ?? (e.milestonesDone?.includes(i + 1) ? 'claimed' : 'open');
  const cells = entrants.flatMap((e) => milestones.map((_, i) => stateOf(e, i)));
  const claimed = cells.filter((s) => s === 'on_time' || s === 'late' || s === 'claimed').length;
  const overdue = cells.filter((s) => s === 'overdue').length;
  const waiting = reviewer
    ? entrants.flatMap((e) => e.reviews ?? []).filter((r) => r.state === 'unreviewed' || r.state === 'updated').length
    : 0;
  const showsReviews = entrants.some((e) => e.reviews);

  return (
    <>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-color-secondary)]">
        <span>
          <i className="pi pi-users mr-1" aria-hidden />
          {count(entrants.length, 'entrant')}
        </span>
        <span>
          <i className="pi pi-list-check mr-1" aria-hidden />
          {count(milestones.length, 'milestone')}
        </span>
        <span>
          <i className="pi pi-check-circle mr-1 text-[var(--primary-color)]" aria-hidden />
          <span className="font-medium text-[var(--text-color)] tabular-nums">{claimed}</span> of {cells.length} claimed
        </span>
        {overdue > 0 && (
          <span className="font-medium text-red-600 dark:text-red-400">
            <i className="pi pi-exclamation-circle mr-1" aria-hidden />
            {overdue} overdue
          </span>
        )}
        {waiting > 0 && (
          <span className="font-medium text-[var(--primary-color)]">
            <i className="pi pi-inbox mr-1" aria-hidden />
            {waiting} waiting for your review — select a claim to review it
          </span>
        )}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-[var(--text-color-secondary)]">
              <th scope="col" className="sticky left-0 z-10 bg-[var(--surface-card)] pb-2 pr-4 align-bottom font-medium">
                Entrant
              </th>
              {milestones.map((m, i) => (
                <th
                  key={i}
                  scope="col"
                  className="px-1.5 pb-2 text-center align-bottom font-medium"
                  title={m.dueUtc ? `${m.title} — due by ${utcMoment(m.dueUtc)}` : m.title}
                >
                  <span className="inline-flex items-center justify-center rounded-full bg-[var(--surface-hover)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--text-color)]">
                    m{i + 1}
                  </span>
                  <span className="mx-auto mt-1 block max-w-[8.5rem] truncate text-xs font-medium text-[var(--text-color)]">
                    {m.title}
                  </span>
                  {m.dueUtc && (
                    <span className="block text-[11px] font-normal">
                      due{' '}
                      {new Date(m.dueUtc).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </span>
                  )}
                </th>
              ))}
              <th scope="col" className="pb-2 pl-4 text-right align-bottom font-medium whitespace-nowrap">
                Standing
                <HelpIcon topic="opportunity.standingScore" label="The standing score" />
              </th>
              {upload && (
                <th scope="col" className="pb-2 pl-4 text-right align-bottom font-medium">
                  Files
                </th>
              )}
              <th scope="col" className="pb-2 pl-4 text-right align-bottom font-medium whitespace-nowrap">
                {activityHeading}
              </th>
            </tr>
          </thead>
          <tbody>
            {entrants.map((e, row) => (
              <tr
                key={row}
                className={`border-t border-[var(--surface-border)] ${
                  mine && e.userId === mine.userId ? 'bg-[color-mix(in_srgb,var(--primary-color)_5%,transparent)]' : ''
                }`}
              >
                <td className="sticky left-0 z-10 bg-[var(--surface-card)] py-2.5 pr-4 font-medium">
                  <Link
                    href={`/profile/${e.userId}`}
                    className="flex items-center gap-2 text-[var(--text-color)] no-underline hover:text-[var(--primary-color)]"
                  >
                    <Avatar name={e.displayName} url={e.avatarUrl} size="xs" />
                    <span className="truncate">{e.displayName}</span>
                  </Link>
                </td>
                {milestones.map((m, i) => (
                  <td key={i} className="px-1.5 py-2.5 text-center">
                    <BoardCell
                      n={i + 1}
                      who={e.displayName}
                      state={stateOf(e, i)}
                      dueUtc={m.dueUtc}
                      build={e.builds?.[i]}
                      review={e.reviews?.[i]}
                      reviewer={reviewer}
                      onOpen={() => setOpen({ entrant: e, index: i })}
                    />
                  </td>
                ))}
                <td className="py-2.5 pl-4 text-right whitespace-nowrap">
                  {/* The score the row is placed by, and its reading. */}
                  {e.standingScore !== null && e.standingBand ? (
                    <StandingBadge score={e.standingScore} band={e.standingBand} />
                  ) : (
                    <span className="text-[var(--text-color-secondary)]">—</span>
                  )}
                  {/* The on-time counts under the number: the biggest part
                      of it, and what a person reads. */}
                  {dated && e.standing && (
                    <div className="mt-0.5 text-xs">
                      <Standing standing={e.standing} />
                    </div>
                  )}
                </td>
                {upload && (
                  <td className="py-2.5 pl-4 text-right tabular-nums text-[var(--text-color-secondary)]">
                    {e.filesUploaded ?? '—'}
                  </td>
                )}
                <td className="py-2.5 pl-4 text-right whitespace-nowrap text-[var(--text-color-secondary)]">
                  {e.lastPushAtUtc ? relativeTime(e.lastPushAtUtc) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* What the chips mean, in the colours they wear. */}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-color-secondary)]">
        <span>
          <i className="pi pi-check-circle mr-1 text-[var(--primary-color)]" aria-hidden />
          {dated ? 'claimed on time' : 'claimed'}
        </span>
        {dated && (
          <>
            <span>
              <i className="pi pi-clock mr-1 text-amber-600 dark:text-amber-500" aria-hidden />
              claimed late
            </span>
            <span>
              <i className="pi pi-exclamation-circle mr-1 text-red-600 dark:text-red-400" aria-hidden />
              overdue
            </span>
          </>
        )}
        <span>
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--surface-border)] align-middle" aria-hidden />
          not claimed yet
        </span>
        {showsReviews && (
          <>
            <span className="text-green-700 dark:text-green-400">
              <i className="pi pi-thumbs-up mr-1" aria-hidden />
              approved
            </span>
            <span className="text-red-600 dark:text-red-400">
              <i className="pi pi-replay mr-1" aria-hidden />
              changes asked for
            </span>
            <span className="text-[var(--primary-color)]">
              <i className="pi pi-refresh mr-1" aria-hidden />
              updated since
            </span>
            <HelpIcon topic="opportunity.claimReview" label="Reviewing a claimed milestone" />
          </>
        )}
      </p>

      {/* The entrant's own track: every milestone, where it stands, and what the client said. */}
      {mine?.reviews && (
        <YourMilestones
          entrant={mine}
          o={o}
          stateOf={(i) => stateOf(mine, i)}
          repo={repo}
          upload={upload}
          onOpen={(i) => setOpen({ entrant: mine, index: i })}
        />
      )}

      <ClaimDialog
        o={o}
        entrant={openEntrant}
        index={open?.index ?? 0}
        claim={openEntrant ? stateOf(openEntrant, open!.index) : 'open'}
        reviewer={reviewer}
        byAdmin={byAdmin}
        repo={repo}
        upload={upload}
        onClose={() => setOpen(null)}
        onReviewed={async () => {
          await queryClient.invalidateQueries({ queryKey: ['opportunity', slug] });
          router.refresh();
        }}
      />
    </>
  );
}

/**
 * One cell of the progress board, read against its milestone's date. A
 * milestone with no date shows only claimed or open — which is every cell on
 * every opportunity published before dates existed, and still the right answer
 * for exploratory work. Where the viewer may read its reviews, a claimed cell
 * is a button that opens them, with the latest decision marked under the chip.
 */
function BoardCell({
  n,
  who,
  state,
  dueUtc,
  build,
  review,
  reviewer,
  onOpen,
}: {
  n: number;
  /** Whose row: the cell's button names them, since every row has a milestone 1. */
  who: string;
  state: MilestoneState;
  dueUtc: string | null;
  /** The claim's build, on an opportunity that requires one — a second mark under the first. */
  build?: BuildCell;
  /** The claim's reviews, where the viewer may read them. */
  review?: ClaimReviewCell;
  reviewer: boolean;
  onOpen: () => void;
}) {
  const by = dueUtc ? ` (due ${utcMoment(dueUtc)})` : '';
  const shown = {
    on_time: {
      icon: 'pi-check-circle',
      className: 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_10%,transparent)] text-[var(--primary-color)]',
      word: 'On time',
      label: `milestone ${n} claimed on time${by}`,
    },
    late: {
      icon: 'pi-clock',
      className: 'border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400',
      word: 'Late',
      label: `milestone ${n} claimed late${by}`,
    },
    claimed: {
      icon: 'pi-check-circle',
      className: 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_10%,transparent)] text-[var(--primary-color)]',
      word: 'Done',
      label: `milestone ${n} claimed`,
    },
    overdue: {
      icon: 'pi-exclamation-circle',
      className: 'border-red-400/60 bg-red-500/10 text-red-700 dark:text-red-400',
      word: 'Overdue',
      label: `milestone ${n} overdue${by}`,
    },
  }[state as 'on_time' | 'late' | 'claimed' | 'overdue'];

  if (!shown)
    return (
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--surface-border)]"
        title={`Not claimed yet${by}`}
        role="img"
        aria-label={`milestone ${n} open${by}`}
      />
    );

  const chip = (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${shown.className}`}
      title={shown.label}
    >
      <i className={`pi ${shown.icon} text-[11px]`} aria-hidden />
      {shown.word}
    </span>
  );
  const readable = review && review.state !== 'unclaimed' && review.checkpointId;
  return (
    <span className="inline-flex flex-col items-center">
      {readable ? (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border-0 bg-transparent p-0.5 hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
          aria-label={`${who}, ${shown.label} — ${CLAIM_REVIEW_LABEL[review.state].toLowerCase()}; ${
            reviewer ? 'open to review' : 'open the review'
          }`}
        >
          {chip}
          <ReviewMark state={review.state} reviewer={reviewer} />
        </button>
      ) : (
        <span role="img" aria-label={shown.label}>
          {chip}
        </span>
      )}
      <BuildMark n={n} build={build} />
    </span>
  );
}

/** The latest decision under a claimed cell, in the colour it wears in the legend. */
function ReviewMark({ state, reviewer }: { state: ClaimReviewState; reviewer: boolean }) {
  const mark: Partial<Record<ClaimReviewState, { icon: string; word: string; className: string }>> = {
    approved: { icon: 'pi-thumbs-up', word: 'Approved', className: 'text-green-700 dark:text-green-400' },
    changes_requested: { icon: 'pi-replay', word: 'Changes', className: 'text-red-600 dark:text-red-400' },
    updated: { icon: 'pi-refresh', word: 'Updated', className: 'text-[var(--primary-color)]' },
    unreviewed: reviewer
      ? { icon: 'pi-pencil', word: 'Review', className: 'text-[var(--primary-color)] underline-offset-2 hover:underline' }
      : { icon: 'pi-clock', word: 'Not reviewed', className: 'text-[var(--text-color-secondary)]' },
  };
  const m = mark[state];
  if (!m) return null;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium ${m.className}`}>
      <i className={`pi ${m.icon} text-[10px]`} aria-hidden />
      {m.word}
    </span>
  );
}

/**
 * An entrant's own milestones, one card each: where the claim stands
 * against its date, the client's latest review in full, the earlier rounds
 * folded, and what to do next. Their row of the matrix says the same in
 * marks; this is where they read it.
 */
function YourMilestones({
  entrant,
  o,
  stateOf,
  repo,
  upload,
  onOpen,
}: {
  entrant: OpportunityEntrant;
  o: OpportunityDetail;
  stateOf: (i: number) => MilestoneState;
  repo: boolean;
  upload: boolean;
  onOpen: (i: number) => void;
}) {
  const reviews = entrant.reviews ?? [];
  const live = o.status === 'open';
  const approved = reviews.filter((r) => r.state === 'approved').length;
  const toChange = reviews.filter((r) => r.state === 'changes_requested').length;
  const howToClaim = (n: number) =>
    [
      repo && `push a tag m${n} or open a pull request from a branch named m${n}-…`,
      upload && `upload a file tagged with milestone ${n}`,
    ]
      .filter(Boolean)
      .join(', or ');
  const howToUpdate = (n: number) =>
    [repo && 'push the changes to your repository', upload && `upload the corrected file tagged with milestone ${n}`]
      .filter(Boolean)
      .join(', or ');

  return (
    <section className="mt-6 border-t border-[var(--surface-border)] pt-4" aria-labelledby="your-milestones">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="your-milestones" className="m-0 text-base font-semibold">
          Your milestones
          <HelpIcon topic="opportunity.claimReview" label="Reviews of your milestones" />
        </h3>
        <p className="m-0 text-sm text-[var(--text-color-secondary)]">
          {approved} approved
          {toChange > 0 && (
            <>
              {' · '}
              <span className="font-medium text-red-600 dark:text-red-400">{toChange} to change</span>
            </>
          )}
          {' · '}only you see the client&rsquo;s reviews
        </p>
      </div>
      <ol className="m-0 mt-3 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {o.milestones.map((m, i) => {
          const cell = reviews[i];
          const claim = stateOf(i);
          const rounds = cell?.reviews ?? [];
          const latest = rounds.length > 0 ? rounds[rounds.length - 1] : null;
          const earlier = rounds.slice(0, -1);
          const state = cell?.state ?? 'unclaimed';
          const tone = CARD_TONE[state];
          return (
            <li key={i} className={`flex flex-col gap-2.5 rounded-xl border p-4 ${tone.card}`}>
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone.badge}`}
                  aria-hidden
                >
                  {state === 'approved' ? <i className="pi pi-check text-xs" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 font-semibold leading-tight [overflow-wrap:anywhere]">
                    <span className="sr-only">Milestone {i + 1}: </span>
                    {m.title}
                  </p>
                  <p className="m-0 mt-1 text-xs text-[var(--text-color-secondary)]">
                    {CLAIM_WORD[claim]}
                    {m.dueUtc &&
                      ` · due ${new Date(m.dueUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone.chip}`}
              >
                <i className={`pi ${tone.icon} text-[11px]`} aria-hidden />
                {CLAIM_REVIEW_LABEL[state]}
              </span>

              {latest && <ReviewLine review={latest} clientName={o.clientName} />}
              {earlier.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--text-color-secondary)]">
                    {earlier.length === 1 ? 'One earlier review' : `${earlier.length} earlier reviews`}
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {earlier.map((r, k) => (
                      <ReviewLine key={k} review={r} clientName={o.clientName} />
                    ))}
                  </div>
                </details>
              )}

              <p className="m-0 mt-auto border-t border-[var(--surface-border)] pt-2.5 text-sm text-[var(--text-color-secondary)]">
                {state === 'unclaimed' &&
                  (live ? (
                    <>
                      <i className="pi pi-arrow-right mr-1" aria-hidden />
                      Claim it: {howToClaim(i + 1)}.
                    </>
                  ) : (
                    'Not claimed before the deadline.'
                  ))}
                {state === 'unreviewed' && (
                  <>
                    <i className="pi pi-clock mr-1" aria-hidden />
                    Claimed. The client may review it here; a review is feedback and may not come.
                  </>
                )}
                {state === 'changes_requested' &&
                  (live ? (
                    <>
                      <i className="pi pi-arrow-right mr-1" aria-hidden />
                      Update it before the deadline: {howToUpdate(i + 1)}. The client sees it marked Updated.
                    </>
                  ) : (
                    'The deadline has passed; the work stands as handed in. Take the advice into the next one.'
                  ))}
                {state === 'updated' && (
                  <>
                    <i className="pi pi-refresh mr-1" aria-hidden />
                    Updated since the request — the client can review it again.
                  </>
                )}
                {state === 'approved' && (
                  <>
                    <i className="pi pi-thumbs-up mr-1" aria-hidden />
                    Approved: it meets the brief so far. The winner is still picked after the deadline.
                  </>
                )}
              </p>
              {cell?.checkpointId && upload && (
                <Button
                  label="Open the milestone"
                  icon="pi pi-external-link"
                  size="small"
                  text
                  className="-mt-1 self-start"
                  onClick={() => onOpen(i)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** A claim against its date, in a few words. */
const CLAIM_WORD: Record<MilestoneState, string> = {
  on_time: 'Claimed on time',
  late: 'Claimed late',
  claimed: 'Claimed',
  overdue: 'Overdue — not claimed by its date',
  open: 'Not claimed yet',
};

/** How each review state wears its card, badge and chip. */
const CARD_TONE: Record<ClaimReviewState, { card: string; badge: string; chip: string; icon: string }> = {
  approved: {
    card: 'border-green-600/40 bg-green-500/5',
    badge: 'bg-green-600 text-white',
    chip: 'border-green-600/40 text-green-700 dark:text-green-400',
    icon: 'pi-thumbs-up',
  },
  changes_requested: {
    card: 'border-red-400/60 bg-red-500/5',
    badge: 'bg-red-500 text-white',
    chip: 'border-red-400/60 text-red-700 dark:text-red-400',
    icon: 'pi-replay',
  },
  updated: {
    card: 'border-[var(--primary-color)] bg-[var(--surface-card)]',
    badge: 'bg-[var(--primary-color)] text-white',
    chip: 'border-[var(--primary-color)] text-[var(--primary-color)]',
    icon: 'pi-refresh',
  },
  unreviewed: {
    card: 'border-[var(--surface-border)] bg-[var(--surface-card)]',
    badge: 'bg-[var(--primary-color)] text-white',
    chip: 'border-[var(--surface-border)] text-[var(--text-color-secondary)]',
    icon: 'pi-clock',
  },
  unclaimed: {
    card: 'border-[var(--surface-border)] bg-[var(--surface-card)] opacity-80',
    badge: 'bg-[var(--surface-hover)] text-[var(--text-color-secondary)]',
    chip: 'border-[var(--surface-border)] text-[var(--text-color-secondary)]',
    icon: 'pi-circle',
  },
};

/**
 * One claim, opened: the milestone and whose claim it is, the files tagged
 * with it where the viewer may open them, every review so far — and, for
 * the client or an administrator, the form: approve, or ask for changes,
 * with remarks and advice for the milestones ahead.
 */
function ClaimDialog({
  o,
  entrant,
  index,
  claim,
  reviewer,
  byAdmin,
  repo,
  upload,
  onClose,
  onReviewed,
}: {
  o: OpportunityDetail;
  entrant: OpportunityEntrant | null;
  index: number;
  claim: MilestoneState;
  reviewer: boolean;
  byAdmin: boolean;
  repo: boolean;
  upload: boolean;
  onClose: () => void;
  onReviewed: () => Promise<void>;
}) {
  const [decision, setDecision] = useState<'approve' | 'changes'>('approve');
  const [note, setNote] = useState('');
  const [advice, setAdvice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A new claim opened resets the form.
  const key = entrant ? `${entrant.userId}:${index}` : null;
  const [seen, setSeen] = useState<string | null>(null);
  if (key !== seen) {
    setSeen(key);
    setDecision('approve');
    setNote('');
    setAdvice('');
    setError(null);
  }

  const m = o.milestones[index];
  const cell = entrant?.reviews?.[index];
  const rounds = [...(cell?.reviews ?? [])].reverse();
  const files = (entrant?.files ?? []).filter((f) => f.milestone === index + 1);
  const approving = decision === 'approve';
  const noteShort = !approving && changesNoteShortBy(note) > 0;
  const live = o.status === 'open';

  const send = async () => {
    if (!cell?.checkpointId) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/checkpoints/${cell.checkpointId}/review`, {
        decision,
        note: note.trim() || null,
        advice: advice.trim() || null,
      });
      await onReviewed();
      // Closed, as the paid-by-milestone form closes: the cell now carries
      // the decision, and a second click cannot send it twice.
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      header={entrant && m ? `Milestone ${index + 1} — ${m.title}` : ''}
      visible={!!entrant && !!m}
      onHide={onClose}
      className="w-[42rem] max-w-[95vw]"
      footer={
        reviewer ? (
          <div className="flex justify-end gap-2">
            <Button label="Close" text disabled={busy} onClick={onClose} />
            <Button
              label={approving ? `Approve milestone ${index + 1}` : 'Send back for changes'}
              icon={approving ? 'pi pi-check' : 'pi pi-replay'}
              severity={approving ? undefined : 'danger'}
              disabled={noteShort || busy || !cell?.checkpointId}
              tooltip={noteShort && !busy ? changesNoteHint(note) : undefined}
              tooltipOptions={{ position: 'top', showOnDisabled: true }}
              loading={busy}
              onClick={() => void send()}
            />
          </div>
        ) : (
          <div className="flex justify-end">
            <Button label="Close" text onClick={onClose} />
          </div>
        )
      }
    >
      {entrant && m && (
        <>
          <p className="m-0 flex flex-wrap items-center gap-2 text-sm">
            <Avatar name={entrant.displayName} url={entrant.avatarUrl} size="xs" />
            <span className="font-medium">{entrant.displayName}</span>
            <span className="text-[var(--text-color-secondary)]">
              · {CLAIM_WORD[claim]}
              {m.dueUtc && ` · due ${utcMoment(m.dueUtc)}`}
            </span>
          </p>
          {m.description && <p className="mt-2 text-sm text-[var(--text-color-secondary)]">{m.description}</p>}

          {/* What there is to read: the files tagged with the milestone, and
              where the code is — or when it opens. */}
          <div className="mt-3">
            {upload &&
              (entrant.files ? (
                files.length > 0 ? (
                  <EntryFileGallery files={files} showHelp />
                ) : (
                  <p className="m-0 text-sm text-[var(--text-color-secondary)]">
                    No file is tagged with milestone {index + 1}
                    {repo ? '; it was claimed from the repository.' : '.'}
                  </p>
                )
              ) : (
                <p className="m-0 text-sm text-[var(--text-color-secondary)]">
                  The files open once the milestone is claimed.
                </p>
              ))}
            {repo && (
              <p className="m-0 mt-2 text-sm text-[var(--text-color-secondary)]">
                <i className="pi pi-github mr-1" aria-hidden />
                {entrant.repoFullName && !live ? (
                  <>
                    Read the code in{' '}
                    <a href={`https://github.com/${entrant.repoFullName}`} target="_blank" rel="noreferrer">
                      {entrant.repoFullName}
                    </a>
                    , at the tag or pull request named m{index + 1}.
                  </>
                ) : reviewer && live ? (
                  `Claimed from the repository. Its code opens to you when the deadline passes${
                    entrant.builds?.[index] ? '; until then the milestone’s preview, on its cell, shows it running' : ''
                  }.`
                ) : (
                  `Claimed from the repository as m${index + 1}.`
                )}
              </p>
            )}
          </div>

          {/* The record, newest first. */}
          <h4 className="mb-0 mt-4 text-sm font-semibold">
            {rounds.length === 0 ? 'No review yet' : rounds.length === 1 ? 'The review' : `${rounds.length} reviews, newest first`}
          </h4>
          {rounds.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {rounds.map((r, k) => (
                <ReviewLine key={k} review={r} clientName={o.clientName} />
              ))}
            </div>
          )}
          {cell?.state === 'updated' && (
            <p className="m-0 mt-2 text-sm text-[var(--primary-color)]">
              <i className="pi pi-refresh mr-1" aria-hidden />
              {reviewer ? 'Updated since the request for changes — look again.' : 'Updated since the request — the client can review it again.'}
            </p>
          )}

          {reviewer && (
            <div className="mt-4 border-t border-[var(--surface-border)] pt-4">
              <SelectButton
                value={decision}
                onChange={(e) => e.value && setDecision(e.value)}
                allowEmpty={false}
                options={[
                  { label: 'Approve', value: 'approve', icon: 'pi pi-check' },
                  { label: 'Ask for changes', value: 'changes', icon: 'pi pi-replay' },
                ]}
                itemTemplate={(opt: { label: string; icon: string }) => (
                  <span className="flex items-center gap-2">
                    <i className={opt.icon} aria-hidden />
                    {opt.label}
                  </span>
                )}
                aria-label="Decision"
              />
              <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                {approving
                  ? `Says the milestone meets the brief so far. It pays nothing and does not pick the winner. ${entrant.displayName} is emailed your words; no other entrant sees them.`
                  : live
                    ? `${entrant.displayName} is emailed your words and can update the work before the deadline; the cell then reads Updated. No other entrant sees them.`
                    : `${entrant.displayName} is emailed your words. The deadline has passed, so the work stands — this is direction for what comes next.`}
              </p>

              <label htmlFor="claim-review-note" className="mt-4 block text-sm font-medium">
                {approving ? 'Remarks' : 'What should change?'}{' '}
                <span className="font-normal text-[var(--text-color-secondary)]">
                  {approving ? 'Optional — what was good, what to keep doing' : `At least ${MIN_NOTE} characters, a sentence they can act on`}
                </span>
              </label>
              <InputTextarea
                id="claim-review-note"
                rows={3}
                maxLength={MAX_TEXT}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full"
                aria-describedby={approving ? undefined : 'claim-review-note-count'}
              />
              {!approving && <ChangesNoteCount id="claim-review-note-count" note={note} />}
              <label htmlFor="claim-review-advice" className="mt-3 block text-sm font-medium">
                Advice for the milestones ahead{' '}
                <span className="font-normal text-[var(--text-color-secondary)]">Optional — direction, not a verdict on this one</span>
              </label>
              <InputTextarea
                id="claim-review-advice"
                rows={3}
                maxLength={MAX_TEXT}
                value={advice}
                onChange={(e) => setAdvice(e.target.value)}
                className="mt-1 w-full"
              />
              {byAdmin && (
                <Message
                  severity="info"
                  className="mt-3 w-full"
                  text={`You are reviewing for ${o.clientName}: the board says so, and they are emailed your decision. Picking the winner stays theirs.`}
                />
              )}
              {error && <Message severity="error" text={error} className="mt-3 w-full" />}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

/**
 * One entrant's row summarised — the counts the board is ordered by. Only
 * the parts that are non-zero: "3 on time" on a clean row, without two
 * zeroes beside it saying nothing.
 */
function Standing({ standing }: { standing: EntrantStanding }) {
  const parts = [
    standing.onTime > 0 && { text: `${standing.onTime} on time`, className: 'text-[var(--primary-color)]' },
    standing.late > 0 && { text: `${standing.late} late`, className: 'text-amber-600 dark:text-amber-500' },
    standing.overdue > 0 && { text: `${standing.overdue} overdue`, className: 'text-red-600 dark:text-red-400' },
  ].filter(Boolean) as { text: string; className: string }[];

  if (parts.length === 0)
    return <span className="text-[var(--text-color-secondary)]">not started</span>;
  return (
    <span className="font-medium">
      {parts.map((p, i) => (
        <span key={p.text} className={p.className}>
          {i > 0 && <span className="font-normal text-[var(--text-color-secondary)]"> · </span>}
          {p.text}
        </span>
      ))}
    </span>
  );
}
