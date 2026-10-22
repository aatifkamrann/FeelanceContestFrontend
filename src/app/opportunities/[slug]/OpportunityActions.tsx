'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import Fold from '@/components/Fold';
import HelpIcon from '@/components/HelpIcon';
import { openChat } from '@/lib/chat';
import RateExperience from '@/components/RateExperience';
import PreviewPanel from '@/components/PreviewPanel';
import { EntryDigestPanel, SpamScanPanel } from '@/components/ReviewAiTools';
import { EntryFileGallery, EntryUploads } from '@/components/EntryFiles';
import { StandingBadge, StandingBreakdown } from '@/components/StandingBadge';
import {
  EntrantNote,
  StandingNotesPanel,
  useStandingNotes,
  type EntrantStandingNote,
} from '@/components/StandingNotes';
import { brandingQuery, PORTAL_NAME, apiFetch, apiUrl } from '@/lib/api';
import { decideApplication, statusLabel as applicationStatusLabel } from '@/lib/applications';
import ApplicationsPanel from './ApplicationsPanel';
import {
  aiStatusQuery,
  closesIn,
  count,
  matchLabel,
  meQuery,
  postJson,
  relativeTime,
  starScore,
  usesRepo,
  usesUpload,
  type OpportunityDelivery,
  type OpportunityDetail,
  type OpportunityEntrant,
  type OpportunityFitResult,
} from '@/lib/opportunities';

/**
 * The action box on an opportunity page. The server renders the page once for
 * the viewer; this component re-fetches with the viewer's cookie to learn
 * whether they own the opportunity, already entered it, or have a winner to
 * announce. Everything role-specific on this page lives here.
 */
export default function OpportunityActions({
  slug,
  status,
  deadlineUtc,
  delivery: deliveryProp,
}: {
  slug: string;
  status: string;
  deadlineUtc: string | null;
  /** From the server render, so the signed-out box can say how work arrives. */
  delivery: OpportunityDelivery;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: opportunity, isError: opportunityFailed } = useQuery({
    queryKey: ['opportunity', slug],
    queryFn: async () => {
      const res = await apiFetch(`/api/opportunities/${encodeURIComponent(slug)}`);
      if (!res.ok) return null;
      return (await res.json()) as OpportunityDetail;
    },
    enabled: !!me,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The entry whose removal form is open, if any. */
  const [removing, setRemoving] = useState<string | null>(null);
  const { data: publicInfo } = useQuery(brandingQuery);
  // The clock behind "Applications close in", ticking by the minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const deadlinePassed = deadlineUtc !== null && new Date(deadlineUtc).getTime() <= Date.now();
  // The last joining date, which the client may have set ahead of the
  // deadline. The refetch below knows it; until that lands, the deadline
  // the page was rendered with is the best answer available.
  const open = status === 'open' && (opportunity ? opportunity.entryOpen : !deadlinePassed);
  // The cookie-bearing refetch knows what the server-rendered props cannot:
  // a deadline the worker has already acted on.
  const liveStatus = opportunity?.status ?? status;
  // How work arrives — every sentence below that would say "repo" asks first.
  const delivery = opportunity?.delivery ?? deliveryProp;
  const repo = usesRepo(delivery);
  const upload = usesUpload(delivery);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['opportunity', slug] });
    router.refresh(); // re-render the server-side entrant list and board
  };

  // Deciding an application: selecting makes the entry — by the door's
  // own rules, so the API can still refuse — and an answer can be changed
  // while the opportunity is open: a turned-down applicant selected after all,
  // or a selection taken back before their work arrives. Each asks first.
  const decide = (applicationId: string, decision: 'selected' | 'not_selected', name: string) => {
    const selecting = decision === 'selected';
    const from = opportunity?.applications?.find((r) => r.application.id === applicationId)?.application.status;
    const takingBack = !selecting && from === 'selected';
    // Paid by milestone, selecting is hiring: one person, and the job is filled.
    if (opportunity?.kind === 'milestones' && (selecting || takingBack)) {
      confirmDialog({
        header: selecting ? `Hire ${name}` : 'Take back the hire',
        message: selecting
          ? `${name} is hired for the whole job, paid milestone by milestone` +
            `${repo ? ', and a private repository is set up for them that you can read as it grows' : ''}. ` +
            'Everyone else still waiting is told the job was filled. You can take the hire back only before their work arrives.'
          : `${name} is no longer hired${repo ? ', the repository made for them is archived,' : ''} and they are told. ` +
            'The opportunity opens again for you to hire someone else. This works only before their work arrives.',
        acceptLabel: selecting ? `Hire ${name}` : 'Take back the hire',
        rejectLabel: selecting ? 'Keep reviewing' : 'Keep them hired',
        accept: async () => {
          setBusy(true);
          setError(null);
          try {
            await decideApplication(applicationId, decision);
            await refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'The decision could not be saved.');
          } finally {
            setBusy(false);
          }
        },
      });
      return;
    }
    confirmDialog({
      header: selecting
        ? from === 'not_selected'
          ? 'Select this applicant after all'
          : 'Select this applicant'
        : takingBack
          ? 'Take back this selection'
          : 'Turn this application down',
      message: selecting
        ? `${name} joins the opportunity as an entrant${repo ? ', and a private repository is set up for them' : ''}. ` +
          'They are emailed the terms. You can take the selection back until their work arrives.'
        : takingBack
          ? `${name} stops being an entrant: they leave the board${repo ? ', the repository made for them is archived,' : ''} ` +
            'and they are told the selection was taken back. This works only before their work arrives — after that, use Remove from opportunity.'
          : `${name} is told their application was not selected — and that it is not held against them. ` +
            'They cannot apply to this opportunity again, but you can still select them while it is open.',
      acceptLabel: selecting ? `Select ${name}` : takingBack ? 'Take back selection' : 'Not selected',
      rejectLabel: takingBack ? 'Keep them in' : 'Keep reviewing',
      accept: async () => {
        setBusy(true);
        setError(null);
        try {
          await decideApplication(applicationId, decision);
          await refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'The decision could not be saved.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  // Withdrawing is final — the application reads Withdrawn and the opportunity
  // cannot be applied to again — so it asks first, and says so.
  const withdraw = () => {
    const entry = opportunity?.viewerEntry;
    if (!entry) return;
    // Read when the dialog accepts rather than held in state: the dialog
    // renders its message once, and the reason is optional.
    let reason = '';
    confirmDialog({
      header: 'Withdraw from this opportunity',
      message: (
        <div className="flex max-w-[32rem] flex-col gap-3">
          <p className="m-0">
            Your entry leaves the board and stops counting
            {repo ? ', and your repository is archived — not deleted' : '; your files stay yours'}. Withdrawing is
            final: you cannot apply to this opportunity again.
          </p>
          <label htmlFor="withdraw-reason" className="flex flex-col gap-0.5">
            <span className="font-medium">
              Why are you withdrawing?{' '}
              <span className="font-normal text-[var(--text-color-secondary)]">Optional</span>
            </span>
            <span className="text-sm text-[var(--text-color-secondary)]">
              The client sees this under your application, and so do the portal&rsquo;s administrators.
            </span>
          </label>
          <InputTextarea
            id="withdraw-reason"
            rows={3}
            maxLength={500}
            onChange={(e) => {
              reason = e.target.value;
            }}
          />
        </div>
      ),
      acceptLabel: 'Withdraw entry',
      rejectLabel: 'Stay in',
      accept: async () => {
        setBusy(true);
        setError(null);
        try {
          const why = reason.trim();
          await postJson(`/api/entries/${entry.id}/withdraw`, why ? { reason: why } : undefined);
          await refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Withdrawal failed.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const announce = (entryId: string, name: string) => {
    confirmDialog({
      header: 'Announce the winner',
      message:
        `${name} wins this opportunity. The result is published to everyone, ` +
        (repo ? 'the losing repositories are archived, ' : 'every entrant is told, ') +
        'and this cannot be re-run. ' +
        (repo
          ? 'Nothing transfers yet — the repository moves only after you mark the award paid.'
          : 'The files stay where they are; the award is settled when you mark it paid.'),
      acceptLabel: `Announce ${name} as winner`,
      rejectLabel: 'Not yet',
      accept: async () => {
        if (!opportunity) return;
        setBusy(true);
        setError(null);
        try {
          await postJson(`/api/opportunities/${opportunity.id}/award`, { entryId });
          await refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Announcing failed.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  // Takes one entrant off the opportunity. Not a confirmDialog: this one needs a
  // reason typed, and the reason is the point — it reaches the entrant word
  // for word and is the only account they get.
  const removeEntrant = async (entryId: string, reason: string) => {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/entries/${entryId}/remove`, { reason });
      setRemoving(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Removing the entrant failed.');
    } finally {
      setBusy(false);
    }
  };

  // The review fallback: the API packages the frozen final tag on first ask
  // and answers with a five-minute signed URL; the browser takes it from there.
  const downloadZip = async (entryId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<{ url: string }>(`/api/entries/${entryId}/zip`);
      window.location.assign(result.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Packaging the ZIP failed.');
    } finally {
      setBusy(false);
    }
  };

  const markPaid = () => {
    const award = opportunity?.award;
    if (!award?.id) return;
    confirmDialog({
      header: repo ? 'Mark paid & hand over' : 'Mark paid',
      message:
        `Confirm only if the money has actually moved — this is the record both sides ` +
        `point to later. ` +
        (repo
          ? `The winning repository immediately transfers to ` +
            `${me?.githubLogin ? `@${me.githubLogin}` : 'your connected GitHub account'}; ` +
            `there is no undo that returns it.`
          : `The winner's files are already yours to download; nothing else moves.`),
      acceptLabel: repo ? 'I have paid — transfer the repo' : 'I have paid',
      rejectLabel: 'Cancel',
      accept: async () => {
        setBusy(true);
        setError(null);
        try {
          await postJson(`/api/awards/${award.id}/paid`);
          await refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Marking paid failed.');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  // The one exit that is not a winner. The reason is required because it is
  // sent, word for word, to every entrant who staked work on the brief.
  const cancelOpportunity = async (reason: string) => {
    if (!opportunity) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/opportunities/${opportunity.id}/cancel`, { reason });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancelling failed.');
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------- variants
  // A visitor reads the whole page — the brief, its terms and the board are
  // what an opportunity is, and nobody can weigh joining a portal over a teaser
  // of them. This panel stands where the assessment and its Apply button
  // stand for a member, and names the two things a session is actually for:
  // entering, and opening the brief's attached files.
  if (!me) {
    const next = encodeURIComponent(`/opportunities/${slug}`);
    return (
      <Box
        title={
          <>
            <i className="pi pi-sign-in mr-2 text-[var(--primary-color)]" aria-hidden />
            {open ? 'Sign in to enter' : 'Entry is closed'}
          </>
        }
      >
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          {open ? (
            <>
              Everything on this page is open to read. Entering is for members: sign in as a
              freelancer to apply, and the brief&apos;s attached files open at the same time.{' '}
              {repo && upload
                ? 'You get a private repo and hand files in here; the client sees a milestone’s files once you claim it, and the rest of your work at the deadline.'
                : upload
                  ? 'You hand your files in on this page; the client sees a milestone’s files once you claim it, and the rest at the deadline. No GitHub account needed.'
                  : 'You get a private repo; the client only sees your code at the deadline.'}
            </>
          ) : (
            <>
              {entryClosedReason(liveStatus)} The page stays as it is — signing in opens the
              brief&apos;s attached files and every opportunity still taking entrants.
            </>
          )}
        </p>
        <div className="mt-4 flex gap-2">
          <Link href={`/login?next=${next}`} className="flex-1 no-underline">
            <Button label="Sign in" icon="pi pi-sign-in" className="w-full" />
          </Link>
          <Link href={`/register?next=${next}`} className="flex-1 no-underline">
            <Button label="Join" icon="pi pi-user-plus" outlined className="w-full" />
          </Link>
        </div>
        <p className="mt-2 text-center text-xs text-[var(--text-color-secondary)]">
          Joining is free, and either way brings you straight back to this opportunity.
        </p>
      </Box>
    );
  }

  // Until the viewer's own reading of the opportunity lands, nothing below
  // can tell an owner from any other client — the fall-through would greet
  // the owner with "Only freelancer accounts can enter". A quiet placeholder
  // instead; a failed read (null, or an error) still falls through as before.
  if (opportunity === undefined && !opportunityFailed) {
    return (
      <Box>
        <div className="flex flex-col gap-2" role="status" aria-label="Loading">
          <span className="h-4 w-2/5 animate-pulse rounded bg-[var(--surface-hover)]" />
          <span className="h-3 w-full animate-pulse rounded bg-[var(--surface-hover)]" />
          <span className="h-3 w-4/5 animate-pulse rounded bg-[var(--surface-hover)]" />
        </div>
      </Box>
    );
  }

  if (opportunity?.isOwner) {
    return (
      <>
        <ConfirmDialog />
        <OwnerBox
          opportunity={opportunity}
          status={liveStatus}
          me={me}
          busy={busy}
          error={error}
          onAnnounce={announce}
          onMarkPaid={markPaid}
          removing={removing}
          onStartRemove={setRemoving}
          onRemoveEntrant={removeEntrant}
          onDownloadZip={downloadZip}
          onRefresh={refresh}
          onCancelOpportunity={cancelOpportunity}
          onDecide={decide}
        />
      </>
    );
  }

  // An administrator on somebody else's opportunity. One power, not the owner's
  // set: they can take an entrant off, and that is all this box offers.
  if (opportunity?.isAdmin && (liveStatus === 'open' || liveStatus === 'reviewing')) {
    return (
      <>
        <ConfirmDialog />
        <AdminBox
          opportunity={opportunity}
          busy={busy}
          error={error}
          removing={removing}
          onStartRemove={setRemoving}
          onRemoveEntrant={removeEntrant}
          onDecide={decide}
        />
      </>
    );
  }

  if (me.role !== 'freelancer') {
    return (
      <Box>
        <p className="text-sm text-[var(--text-color-secondary)]">
          Only freelancer accounts can enter opportunities.
        </p>
      </Box>
    );
  }

  // The winner's rail: payment status from their side of the deal, and —
  // once paid — the rating form. This outranks the generic "you're in" box.
  if (opportunity?.award?.viewerIsWinner && opportunity.kind === 'milestones') {
    const award = opportunity.award;
    return (
      <>
        <ConfirmDialog />
        <Box
          title={
            <>
              <i className="pi pi-briefcase mr-2 text-[var(--primary-color)]" aria-hidden />
              You are hired for this job
            </>
          }
        >
          {award.paidAtUtc ? (
            <p className="mt-1 text-sm text-green-700 dark:text-green-400">
              <i className="pi pi-check-circle mr-1" aria-hidden />
              Paid in full{' '}
              {new Date(award.paidAtUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Work through the milestones in order on the Progress board above. Each one you hand in is reviewed
              there — with the client&rsquo;s remarks, and any advice for the ones ahead — and the client pays you
              its amount directly before the next one opens{repo ? '; the repository transfers to them after the last' : ''}.
              They read where to pay you from Payout Setup on{' '}
              <Link href="/profile" className="text-[var(--primary-color)]">
                your profile
              </Link>
              .
            </p>
          )}
          {opportunity.viewerEntry && (
            <Button
              label={`Message ${opportunity.clientName}`}
              icon="pi pi-comments"
              outlined
              size="small"
              className="mt-2"
              onClick={() => openChat(opportunity.viewerEntry!.id)}
            />
          )}
          {upload && opportunity.viewerEntry && (
            <EntryUploads
              entryId={opportunity.viewerEntry.id}
              files={opportunity.viewerEntry.files}
              milestones={opportunity.milestones}
              uploadProblem={opportunity.viewerEntry.uploadProblem}
              onChanged={refresh}
              byMilestone
            />
          )}
          {award.canRate && award.id && (
            <RateExperience
              awardId={award.id}
              aboutName={opportunity.clientName}
              existing={award.myRating}
              onSaved={refresh}
            />
          )}
          {error && <Message severity="error" text={error} className="mt-3 w-full" />}
        </Box>
      </>
    );
  }

  if (opportunity?.award?.viewerIsWinner) {
    const award = opportunity.award;
    return (
      <Box
        title={
          <>
          <i className="pi pi-trophy mr-2 text-[var(--primary-color)]" aria-hidden />
          You won this opportunity
        </>
        }
      >
        {award.paidAtUtc ? (
          <p className="mt-1 text-sm text-green-700 dark:text-green-400">
            <i className="pi pi-check-circle mr-1" aria-hidden />
            Payment confirmed{' '}
            {new Date(award.paidAtUtc).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </p>
        ) : (
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            The client pays you directly, then confirms it here
            {repo ? ' — that confirmation starts your repository’s transfer to them' : ''}. If
            nothing arrives, the unpaid award stays on this page for everyone to see.
          </p>
        )}
        {/* Until payment starts the repository's move to the client — the
            build host clones it from the portal's organisation. */}
        {!award.paidAtUtc && opportunity.viewerEntry && opportunity.viewerEntry.finalPreview !== null && (
          <PreviewPanel
            id={opportunity.viewerEntry.id}
            title="Your final version"
            startLabel="Run final"
            helpTopic="preview.runFinal"
            className="mt-3"
          />
        )}
        {award.canRate && award.id && (
          <RateExperience
            awardId={award.id}
            aboutName={opportunity.clientName}
            existing={award.myRating}
            onSaved={refresh}
          />
        )}
      </Box>
    );
  }

  if (opportunity?.viewerEntry) {
    const entry = opportunity?.viewerEntry;
    return (
      <>
      <ConfirmDialog />
      <Box>
        {/* The winner's rail returned above, so an awarded opportunity here
            means the award went to somebody else, and a cancelled one means
            there is nothing to be in. "You're in" would be a stale cheer
            either way; say what happened. */}
        {liveStatus === 'awarded' ? (
          <p className="font-semibold">
            <i className="pi pi-flag mr-2 text-[var(--text-color-secondary)]" aria-hidden />
            Not selected this time
          </p>
        ) : liveStatus === 'cancelled' ? (
          <p className="font-semibold">
            <i className="pi pi-ban mr-2 text-[var(--text-color-secondary)]" aria-hidden />
            Your entry is void
          </p>
        ) : (
          <p className="font-semibold text-green-700 dark:text-green-400">
            <i className="pi pi-check-circle mr-2" aria-hidden />
            You&apos;re in
          </p>
        )}

        {liveStatus === 'awarded' && (
          <Message
            severity="info"
            className="mt-3 w-full"
            text={`The award went to ${opportunity?.award?.winnerName ?? 'another entrant'}. ${
              repo
                ? 'Your repository is archived and read-only — everything in it stays yours, so clone what you want to keep.'
                : 'Your files stay yours — download anything you want to keep.'
            }`}
          />
        )}

        {liveStatus === 'cancelled' && (
          <Message
            severity="warn"
            className="mt-3 w-full"
            text={`The client cancelled this opportunity. ${
              repo
                ? 'Your repository is archived and read-only — everything in it stays yours, so clone what you want to keep.'
                : 'Your files stay yours — download anything you want to keep.'
            }`}
          />
        )}

        {!repo ? null : entry && entry.provisionStatus === 'provisioned' && entry.repoFullName ? (
          <div className="mt-3 rounded-lg border border-[var(--surface-border)] p-3">
            <p className="text-sm font-medium">
              <i className="pi pi-github mr-1" aria-hidden />
              Your private repo
            </p>
            <a
              href={`https://github.com/${entry.repoFullName}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block [overflow-wrap:anywhere] text-sm text-[var(--primary-color)]"
            >
              {entry.repoFullName}
            </a>
            {/* The claim hint only while claims count: from the deadline the
                entry is frozen and a pushed tag is ignored, and once the
                opportunity is decided the repo is archived. */}
            {liveStatus === 'open' && (
              <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                Claim milestones from inside it:{' '}
                <code className="text-xs">git tag m1 && git push origin m1</code>
                <HelpIcon topic="entry.claimMilestone" label="Claiming milestones" />
              </p>
            )}
            {opportunity && (
              <p className="mt-2 text-sm">
                {entry.milestonesDone.length} of {count(opportunity.milestones.length, 'milestone')} claimed
              </p>
            )}
          </div>
        ) : entry && entry.provisionStatus === 'failed' ? (
          <Message
            severity="warn"
            className="mt-3 w-full"
            text="Your repository could not be created — the operator has been notified and it will be retried."
          />
        ) : (
          // "Being prepared" would be a dead promise on a cancelled opportunity —
          // the worker only provisions entries whose opportunity is still open.
          entry &&
          liveStatus !== 'cancelled' && (
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Entered as <code>{entry.githubUsername}</code>. Your private repository is
              being prepared — the invitation lands on that GitHub account.
            </p>
          )
        )}

        {/* Their final version, run as the client runs it from the review
            list — once the deadline has frozen it. */}
        {entry.finalPreview !== null && (
          <PreviewPanel
            id={entry.id}
            title="Your final version"
            startLabel="Run final"
            helpTopic="preview.runFinal"
            className="mt-3"
          />
        )}

        {/* The upload half: the entrant's own files, until the deadline
            freezes them. Refetching the opportunity is how the list updates —
            the same query the board's live nudge invalidates. */}
        {upload && entry && opportunity && (
          <EntryUploads
            entryId={entry.id}
            files={entry.files}
            milestones={opportunity.milestones}
            uploadProblem={entry.uploadProblem}
            onChanged={refresh}
          />
        )}

        {/* Where they stand, with the sums and the one step that moves it
            most — the entrant's side of the number the client reads. */}
        {entry?.standing && (liveStatus === 'open' || liveStatus === 'reviewing') && (
          <div className="mt-3 rounded-lg border border-[var(--surface-border)] p-3">
            <p className="text-sm font-medium">
              Your standing
              <HelpIcon topic="opportunity.standingScore" label="The standing score" />
            </p>
            <div className="mt-1">
              <StandingBadge
                score={entry.standing.score}
                band={entry.standing.band}
                rank={entry.standing.rank}
                of={entry.standing.of}
                size="md"
              />
            </div>
            <StandingBreakdown
              parts={entry.standing.parts}
              score={entry.standing.score}
              nextStep={entry.standing.nextStep}
            />
          </div>
        )}

        {error && <Message severity="error" text={error} className="mt-3 w-full" />}
        {/* The conversation with the client, in the dock at the corner:
            open while the entry is, readable after. */}
        <div className="mt-4 flex items-center">
          <Button
            label="Message the client"
            icon="pi pi-comments"
            outlined
            size="small"
            onClick={() => openChat(entry.id)}
          />
          <HelpIcon topic="chat.messages" label="Messages" />
        </div>
        {open && (
          <div className="mt-3 flex items-center">
            <Button
              label="Withdraw entry"
              severity="danger"
              outlined
              size="small"
              loading={busy}
              onClick={withdraw}
            />
            <HelpIcon topic="entry.withdraw" label="Withdrawing an entry" />
          </div>
        )}
      </Box>
      </>
    );
  }

  // An application on file: where it stands, and the way to its page.
  // "Not selected" outlives the opportunity's own state — it is the answer.
  if (opportunity?.viewerApplication) {
    const app = opportunity.viewerApplication;
    // Still under review on an opportunity that has moved on: nobody will answer it now.
    const closed = app.status === 'under_review' && liveStatus !== 'open';
    const tone =
      app.status === 'selected'
        ? 'text-green-700 dark:text-green-400'
        : app.status === 'removed'
          ? 'text-red-600 dark:text-red-400'
          : app.status === 'under_review' && !closed
            ? 'text-[var(--primary-color)]'
            : 'text-[var(--text-color-secondary)]';
    const icon =
      app.status === 'selected'
        ? 'pi-check-circle'
        : app.status === 'not_selected'
          ? 'pi-flag'
          : app.status === 'removed'
            ? 'pi-ban'
            : app.status === 'withdrawn'
              ? 'pi-sign-out'
              : closed
                ? 'pi-lock'
                : 'pi-clock';
    return (
      <Box>
        <p className={`font-semibold ${tone}`}>
          <i className={`pi mr-2 ${icon}`} aria-hidden />
          Application: {closed ? 'Not decided' : applicationStatusLabel(app.status)}
          <HelpIcon topic="apply.status" label="What happens next" />
        </p>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          {closed
            ? 'The opportunity closed before the client decided on it, so nothing more happens to it. It is not held against you.'
            : app.status === 'under_review'
              ? `Applied ${relativeTime(app.submittedAtUtc)}. The client reads it and selects who competes; you are emailed either way.`
              : app.status === 'selected'
                ? 'Selected to compete — your entry is on this page.'
                : app.status === 'removed'
                  ? 'You were removed from this opportunity. The reason is in your email and on My Opportunities.'
                  : app.status === 'withdrawn'
                    ? 'You withdrew from this opportunity, and a withdrawal is final. Every other opportunity is unaffected.'
                    : 'The client did not select your application this time. It is not held against you.'}
        </p>
        <Link href={`/opportunities/${encodeURIComponent(slug)}/apply`} className="no-underline">
          <Button label="See your application" icon="pi pi-file" outlined size="small" className="mt-3" />
        </Link>
      </Box>
    );
  }

  if (!open) {
    return (
      <Box title="Entry is closed">
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">{entryClosedReason(liveStatus)}</p>
      </Box>
    );
  }

  if (opportunity?.entriesFull) {
    return (
      <Box title="This opportunity is full">
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          The portal caps entries at {opportunity.maxEntries} per opportunity and all slots are
          taken. A withdrawal frees a slot, so it is worth checking back.
        </p>
      </Box>
    );
  }

  // The client's own terms for who may enter, judged against this viewer's
  // profile by the API — the same judgement the browse page colours cards
  // by and the entry door refuses on, so none of the three can disagree.
  // A blocked viewer gets the reasons and the way to fix them, not a form
  // that would fail on submit.
  const viewerFit = opportunity?.viewerFit ?? null;
  if (viewerFit && !viewerFit.canEnter) {
    return (
      <Box title="Not open to you yet">
        <div className="mt-2 rounded-lg border border-red-500/60 bg-red-500/5 p-3 text-sm">
          <p className="font-medium">
            <i className="pi pi-ban mr-1 text-red-600 dark:text-red-400" aria-hidden />
            The client set terms your profile does not meet.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {viewerFit.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-sm text-[var(--text-color-secondary)]">
          {!viewerFit.skillsOk && 'A skill you have but never listed is one line on your profile. '}
          {!viewerFit.meritOk &&
            'The merit score moves with what you write about yourself and what you finish here — the profile page shows every point of it. '}
          Come back once it does; the page checks again each time it loads.
        </p>
        <Link href="/profile" className="no-underline">
          <Button label="Open your profile" icon="pi pi-user" outlined size="small" className="mt-3" />
        </Link>
      </Box>
    );
  }

  // The assessment: the portal's reading of this person against this
  // brief, the same number as the ring on the card, with the four lines
  // behind it and one sentence for the weakest — so what to strengthen is
  // said before the application is begun. The application itself is eight
  // steps on a page of its own; this box is the door to it.
  const portalName = publicInfo?.portalName ?? PORTAL_NAME;
  const closing = closesIn(opportunity?.entryCloseUtc ?? deadlineUtc, now);
  const competing = opportunity?.entrantCount ?? 0;
  const applied = opportunity?.applicationCount ?? 0;
  const slotsLeft = opportunity?.maxEntries ? Math.max(0, opportunity.maxEntries - competing) : null;
  return (
    <Box>
      {viewerFit ? (
        <>
          <header className={`-mx-5 -mt-5 rounded-t-xl px-5 py-4 ${BAND_BG[viewerFit.matchBand]}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-color-secondary)]">
              {portalName} assessment
            </p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="text-3xl font-bold tabular-nums">{viewerFit.match}%</span>
              <span className="text-lg font-semibold">Match</span>
              <span className={`text-sm font-medium ${BAND_TEXT[viewerFit.matchBand]}`}>
                {matchLabel(viewerFit.matchBand)}
              </span>
              <HelpIcon topic="opportunity.match" label="How the match is worked out" />
            </p>
          </header>
          <section className="mt-4">
            <h3 className="text-sm font-semibold">Why you match</h3>
            <ul className="mt-2 flex flex-col gap-3">
              {viewerFit.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{f.label}</span>
                    <span className="font-semibold tabular-nums">{f.score ?? '—'}</span>
                  </div>
                  {/* The bar under each line is the number drawn: full at 100, empty where the portal has nothing to read yet. */}
                  <div
                    className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-border)]"
                    role="meter"
                    aria-label={f.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={f.score ?? 0}
                    aria-valuetext={f.score === null ? 'not read yet' : `${f.score} out of 100`}
                  >
                    <div
                      className={`h-full rounded-full ${barColour(f.score)}`}
                      style={{ width: `${f.score ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-color-secondary)]">{f.detail}</p>
                </li>
              ))}
            </ul>
          </section>
          {/* One sentence for the weakest line — amber where there is one,
              and a quieter green line where every line reads strong, so
              the section is always in the same place. */}
          <section
            className={`mt-4 rounded-lg border p-3 text-sm ${
              viewerFit.risk
                ? 'border-amber-400/70 bg-amber-100/70 dark:border-amber-500/50 dark:bg-amber-500/10'
                : 'border-green-600/40 bg-green-500/5'
            }`}
          >
            <h3 className="text-sm font-semibold">
              <i
                className={`pi mr-1 ${
                  viewerFit.risk
                    ? 'pi-exclamation-triangle text-amber-600 dark:text-amber-400'
                    : 'pi-check-circle text-green-700 dark:text-green-400'
                }`}
                aria-hidden
              />
              Potential risk
            </h3>
            <p className="mt-1">
              {viewerFit.risk ?? 'None worth a sentence — every line above reads strong.'}
            </p>
          </section>
        </>
      ) : (
        <h2 className="font-semibold">Apply for this competition</h2>
      )}
      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[var(--surface-border)] pt-3 text-sm">
        <span className="text-[var(--text-color-secondary)]">Applications close in</span>
        <span className="font-semibold tabular-nums">{closing ?? 'Closing now'}</span>
      </div>
      <Link href={`/opportunities/${encodeURIComponent(slug)}/apply`} className="no-underline">
        <Button label="Apply for competition" icon="pi pi-flag" className="mt-4 w-full" />
      </Link>
      <p className="mt-2 text-center text-xs text-[var(--text-color-secondary)]">
        Eight steps: your match, your eligibility, your profile, your approach, your past work, your
        availability — then the client selects who competes.
        <HelpIcon topic="apply.how" label="How applying works" />
      </p>
      <p className="mt-3 text-center text-sm text-[var(--text-color-secondary)]">
        {applied === 0
          ? 'No one has applied yet — you would be first.'
          : `${count(applied, 'application')} submitted`}
        {competing > 0 && ` · ${count(competing, 'freelancer')} competing`}
        {slotsLeft !== null && ` · ${slotsLeft} of ${opportunity?.maxEntries} slots left`}
      </p>
    </Box>
  );
}

/**
 * Why nobody can join any more, in one sentence — the same sentence for a
 * member and for a visitor, so the two rails cannot drift apart.
 */
function entryClosedReason(status: string): string {
  return status === 'awarded'
    ? 'This opportunity has its winner.'
    : status === 'cancelled'
      ? 'The client called this opportunity off before choosing a winner.'
      : status === 'open'
        ? 'The client set a last joining date ahead of the deadline, and it has passed. ' +
          'The entrants already in build on — follow the board to see how it goes.'
        : 'The deadline has passed and the opportunity is with the client for review.';
}

/** The tint behind the assessment heading — the ring's colour, as a ground. */
const BAND_BG: Record<OpportunityFitResult['matchBand'], string> = {
  strong: 'bg-green-500/10',
  good: 'bg-[color-mix(in_srgb,var(--primary-color)_12%,transparent)]',
  moderate: 'bg-amber-500/10',
  outside: 'bg-red-500/10',
};
const BAND_TEXT: Record<OpportunityFitResult['matchBand'], string> = {
  strong: 'text-green-700 dark:text-green-400',
  good: 'text-[var(--primary-color)]',
  moderate: 'text-amber-600 dark:text-amber-400',
  outside: 'text-red-600 dark:text-red-400',
};

/** A line's bar wears the band its own number would: strong, good, or the amber of a line to work on. */
function barColour(score: number | null): string {
  if (score === null) return 'bg-transparent';
  if (score >= 80) return 'bg-green-600 dark:bg-green-400';
  if (score >= 60) return 'bg-[var(--primary-color)]';
  return 'bg-amber-500';
}

/** Everything the opportunity owner sees in the rail, per lifecycle stage. */
function OwnerBox({
  opportunity,
  status,
  me,
  busy,
  error,
  onAnnounce,
  onMarkPaid,
  removing,
  onStartRemove,
  onRemoveEntrant,
  onDownloadZip,
  onRefresh,
  onCancelOpportunity,
  onDecide,
}: {
  opportunity: OpportunityDetail;
  status: string;
  me: { githubLogin: string | null };
  busy: boolean;
  error: string | null;
  onAnnounce: (entryId: string, name: string) => void;
  onMarkPaid: () => void;
  removing: string | null;
  onStartRemove: (entryId: string | null) => void;
  onRemoveEntrant: (entryId: string, reason: string) => Promise<void>;
  onDownloadZip: (entryId: string) => void;
  onRefresh: () => Promise<void>;
  onCancelOpportunity: (reason: string) => Promise<void>;
  onDecide: (applicationId: string, decision: 'selected' | 'not_selected', name: string) => void;
}) {
  const connected = !!me.githubLogin;
  const repo = usesRepo(opportunity.delivery);
  const upload = usesUpload(opportunity.delivery);
  // Connecting is only required — or possible — where the GitHub App
  // exists, and only where there is a repository to receive.
  const needsConnect = repo && opportunity.githubConfigured !== false && !connected;
  const award = opportunity.award;
  const winner = award?.winnerEntryId
    ? opportunity.entrants.find((e) => e.entryId === award.winnerEntryId)
    : undefined;
  // Which AI aids exist on this portal — switched-off features render nothing.
  const { data: aiStatus } = useQuery(aiStatusQuery);
  // One draft for the whole board; each card reads its own row out of it.
  const notes = useStandingNotes(opportunity.id);

  if (status === 'draft') {
    return (
      <Box title="Your opportunity">
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          Still a draft — only you can see it.
        </p>
        <Link href={`/client/opportunities/${opportunity.id}/edit`} className="no-underline">
          <Button label="Edit & publish" icon="pi pi-pencil" className="mt-4 w-full" />
        </Link>
      </Box>
    );
  }

  if (status === 'open') {
    return (
      <Box title="Your opportunity">
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          Published. The brief and terms are locked; entrants and their progress appear
          on the board as {repo && upload ? 'tags and files' : upload ? 'files' : 'tags'} land.
          {' '}Select a claimed milestone on the board to review it — approve it, or ask for changes with
          advice; only that entrant reads your words.
          {upload && ' A milestone’s files open to you once it is claimed; the rest when the deadline passes.'}
          {repo && ' The code opens when the deadline passes.'}
        </p>
        {/* Open entry means noise arrives with the signal — the scan is
            most useful while entries are still landing. */}
        {aiStatus?.features.spam && opportunity.entrants.length > 0 && (
          <SpamScanPanel opportunityId={opportunity.id} />
        )}
        {/* The reading notes: every row's numbers in words, drafted on
            request, read in the cards below beside the remove button. */}
        {aiStatus?.features.standing && opportunity.entrants.length > 0 && (
          <StandingNotesPanel notes={notes} />
        )}
        {/* The field is chosen here: every application, those still to
            decide first, and the two answers. */}
        {opportunity.applications && (
          <ApplicationsPanel
            rows={opportunity.applications}
            hiring={opportunity.kind === 'milestones'}
            busy={busy}
            error={error}
            onDecide={onDecide}
            renderRemove={(entryId, name) => (
              <RemovePanel
                entryId={entryId}
                name={name}
                busy={busy}
                error={removing === `application:${entryId}` ? error : null}
                open={removing === `application:${entryId}`}
                // Its own key: the board below holds the same entry, and only the form pressed opens.
                onOpen={(id) => onStartRemove(id && `application:${id}`)}
                onRemove={onRemoveEntrant}
                hasRepo={repo}
              />
            )}
          />
        )}
        {/* Where removal is most needed: open entry means noise arrives with
            the signal, and this is the list the scan above flags into. Best
            standing first, like the board. */}
        {opportunity.entrants.length > 0 && (
          <div className="mt-4 border-t border-[var(--surface-border)] pt-3">
            <p className="text-sm font-medium">
              Entrants
              <HelpIcon topic="entry.remove" label="Removing an entrant" />
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {opportunity.entrants.map((e, i) => (
                <li key={i} className="rounded-lg border border-[var(--surface-border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Avatar name={e.displayName} url={e.avatarUrl} size="xs" />
                      {e.displayName}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-[var(--text-color-secondary)]">
                      entered {relativeTime(e.enteredAtUtc)}
                      {e.entryId && <MessageEntrant entryId={e.entryId} name={e.displayName} />}
                    </span>
                  </div>
                  <EntrantStandingLine
                    entrant={e}
                    of={opportunity.entrants.length}
                    note={notes.noteFor(e.entryId)}
                    showHelp={i === 0}
                  />
                  <EntrantPastWork work={e.pastWork} />
                  {e.entryId && (
                    <RemovePanel
                      entryId={e.entryId}
                      name={e.displayName}
                      busy={busy}
                      error={removing === e.entryId ? error : null}
                      open={removing === e.entryId}
                      onOpen={onStartRemove}
                      onRemove={onRemoveEntrant}
                      hasRepo={repo}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {needsConnect && (
          <div className="mt-4 rounded-lg border border-[var(--surface-border)] p-3">
            <p className="text-sm font-medium">
              Connect GitHub before the deadline
              <HelpIcon topic="github.connect" label="Connecting GitHub" />
            </p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Review access and the winner&apos;s repository both go to your connected
              account.
            </p>
            <a href={apiUrl(`/api/github/connect?next=${encodeURIComponent(`/opportunities/${opportunity.slug}`)}`)} className="no-underline">
              <Button label="Connect GitHub" icon="pi pi-github" outlined size="small" className="mt-2 w-full" />
            </a>
          </div>
        )}
        <CancelPanel busy={busy} error={error} onCancel={onCancelOpportunity} />
      </Box>
    );
  }

  if (status === 'reviewing') {
    return (
      <Box title="Review & pick the winner">
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          {!repo
            ? 'Every entrant’s files are frozen as they stood at the deadline. Review them below, then announce.'
            : opportunity.githubConfigured === false
              ? `Compare the entrants below${upload ? ' — their files are open to you now —' : ''} and announce the winner.`
              : connected
                ? `Every repo is frozen at its final tag and @${me.githubLogin} has read access — review the code in GitHub${upload ? ' and the files below' : ''}, then announce here.`
                : `Every repo is frozen at its final tag. Connect GitHub to get read access to the code${upload ? '; the files are open to you below' : ''}.`}
          {' '}You can still review each claimed milestone on the board, with remarks and advice for the entrant.
        </p>

        {needsConnect && (
          <div className="mt-3">
            <a href={apiUrl(`/api/github/connect?next=${encodeURIComponent(`/opportunities/${opportunity.slug}`)}`)} className="no-underline">
              <Button label="Connect GitHub" icon="pi pi-github" className="w-full" />
            </a>
            <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
              Announcing stays locked until you connect — the winning repository needs
              somewhere to go.
              <HelpIcon topic="github.connect" label="Connecting GitHub" />
            </p>
          </div>
        )}

        {/* The local scan: flags for a human, never a rejection. */}
        {aiStatus?.features.spam && opportunity.entrants.length > 0 && (
          <SpamScanPanel opportunityId={opportunity.id} />
        )}
        {aiStatus?.features.standing && opportunity.entrants.length > 0 && (
          <StandingNotesPanel notes={notes} />
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {opportunity.entrants.map((e, i) => (
            <li key={i} className="rounded-lg border border-[var(--surface-border)] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Avatar name={e.displayName} url={e.avatarUrl} size="xs" />
                  {e.displayName}
                </p>
                <span className="flex items-center gap-1 text-xs text-[var(--text-color-secondary)]">
                  {e.milestonesDone?.length ?? 0}/{count(opportunity.milestones.length, 'milestone')}
                  {e.entryId && <MessageEntrant entryId={e.entryId} name={e.displayName} />}
                </span>
              </div>
              <EntrantStandingLine
                entrant={e}
                of={opportunity.entrants.length}
                note={notes.noteFor(e.entryId)}
                showHelp={i === 0}
              />
              <EntrantPastWork work={e.pastWork} />
              {(e.wins > 0 || e.ratingCount > 0) && (
                <p className="mt-0.5 text-xs text-[var(--text-color-secondary)]">
                  {e.wins > 0 && `${e.wins} win${e.wins === 1 ? '' : 's'}`}
                  {e.wins > 0 && e.ratingCount > 0 && ' · '}
                  {e.ratingCount > 0 && `${starScore(e.ratingAvg!)} from clients`}
                </p>
              )}
              {e.repoFullName && (
                <a
                  href={`https://github.com/${e.repoFullName}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block [overflow-wrap:anywhere] text-xs text-[var(--primary-color)]"
                >
                  {e.repoFullName}
                </a>
              )}
              {e.lastPushAtUtc && (
                <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
                  last {repo && upload ? 'activity' : upload ? 'upload' : 'push'}{' '}
                  {relativeTime(e.lastPushAtUtc)}
                </p>
              )}
              {/* The files, as they stood at the deadline — the whole of the
                  work on an upload opportunity, and this is where it is read. */}
              {upload && e.files && <EntryFileGallery files={e.files} showHelp={i === 0} />}
              {/* The product, beside the code: the final version run on the
                  build host, where the opportunity asked entries to run. */}
              {e.finalPreview !== null && e.entryId && (
                <PreviewPanel
                  id={e.entryId}
                  startLabel="Run final"
                  helpTopic={i === 0 ? 'preview.runFinal' : undefined}
                  className="mt-2"
                />
              )}
              {/* The reading aid, beside the code it is about. */}
              {repo && aiStatus?.features.digest && e.entryId && (
                <EntryDigestPanel entryId={e.entryId} showHelp={i === 0} />
              )}
              {e.entryId && (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Button
                    label="Announce as winner"
                    icon="pi pi-trophy"
                    size="small"
                    outlined
                    disabled={needsConnect || busy}
                    onClick={() => onAnnounce(e.entryId!, e.displayName)}
                  />
                  {i === 0 && <HelpIcon topic="award.announce" label="Announcing a winner" />}
                  {/* The no-GitHub review path: the frozen final tag as one file. */}
                  {repo && opportunity.storageConfigured && e.repoFullName && (
                    <span className="flex items-center">
                      <Button
                        label="ZIP"
                        icon="pi pi-download"
                        size="small"
                        text
                        disabled={busy}
                        onClick={() => onDownloadZip(e.entryId!)}
                      />
                      {i === 0 && <HelpIcon topic="entry.zipDownload" label="The entry as a ZIP" />}
                    </span>
                  )}
                </div>
              )}
              {/* Reading the code is where a copied or empty entry shows up,
                  so the way out of the shortlist sits beside the way in. */}
              {e.entryId && (
                <RemovePanel
                  entryId={e.entryId}
                  name={e.displayName}
                  busy={busy}
                  error={removing === e.entryId ? error : null}
                  open={removing === e.entryId}
                  onOpen={onStartRemove}
                  onRemove={onRemoveEntrant}
                  showHelp={i === 0}
                  hasRepo={repo}
                />
              )}
            </li>
          ))}
        </ul>
        {/* The field as it was chosen, kept for reading: who applied, what
            each was answered, and why anybody who withdrew left. Nothing in
            it can be decided now; a selected entrant can still be removed. */}
        {opportunity.applications && (
          <ApplicationsPanel
            rows={opportunity.applications}
            hiring={opportunity.kind === 'milestones'}
            busy={busy}
            error={null}
            onDecide={onDecide}
            decisionsOpen={false}
            renderRemove={(entryId, name) => (
              <RemovePanel
                entryId={entryId}
                name={name}
                busy={busy}
                error={removing === `application:${entryId}` ? error : null}
                open={removing === `application:${entryId}`}
                // Its own key: the list above holds the same entry, and only the form pressed opens.
                onOpen={(id) => onStartRemove(id && `application:${id}`)}
                onRemove={onRemoveEntrant}
                hasRepo={repo}
              />
            )}
          />
        )}
        {error && <Message severity="error" text={error} className="mt-3 w-full" />}
        {/* No usable entries is a real outcome — the honest exit is a
            cancellation with a reason, not an opportunity parked in review forever. */}
        <CancelPanel busy={busy} error={null} onCancel={onCancelOpportunity} />
      </Box>
    );
  }

  if (status === 'cancelled') {
    return (
      <Box
        title={
          <>
          <i className="pi pi-ban mr-2 text-[var(--text-color-secondary)]" aria-hidden />
          You cancelled this opportunity
          {opportunity.cancelledAtUtc &&
            ` on ${new Date(opportunity.cancelledAtUtc).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}`}
        </>
        }
      >
        {opportunity.cancelReason && (
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            Your reason, as every entrant received it: “{opportunity.cancelReason}”
          </p>
        )}
        <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
          {repo ? 'Entrant repositories are archived, the' : 'The'} entries are void, and the
          cancellation is part of your public record.
        </p>
      </Box>
    );
  }

  if (status === 'awarded' && award && opportunity.kind === 'milestones') {
    const hiredRow = opportunity.applications?.find(
      (r) => r.application.status === 'selected' && r.application.entryId === award.winnerEntryId,
    );
    const nothingHandedIn = (award.payments ?? []).every((p) => p.state === 'open' || p.state === 'locked');
    return (
      <Box
        title={
          <>
            <i className="pi pi-briefcase mr-2 text-[var(--primary-color)]" aria-hidden />
            {award.winnerName} is hired
          </>
        }
      >
        {award.winnerEntryId && (
          <Button
            label={`Message ${award.winnerName}`}
            icon="pi pi-comments"
            outlined
            size="small"
            className="mb-2 mt-1"
            onClick={() => openChat(award.winnerEntryId!)}
          />
        )}
        {!award.paidAtUtc && (
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            Each milestone they hand in waits on you on the Progress board above: approve it or ask for changes,
            with remarks and any advice for the milestones ahead; pay its amount directly, then mark it paid — the
            next one opens only then.
            {repo && connected && ' You can read the repository on GitHub as it grows.'}
            <HelpIcon topic="opportunity.milestonePayments" label="Milestone payments" />
          </p>
        )}
        {award.winnerUserId && !award.paidAtUtc && (
          <p className="mt-2 text-sm">
            <Link
              href={`/profile/${award.winnerUserId}#how-to-pay`}
              className="font-medium text-[var(--primary-color)] no-underline hover:underline"
            >
              <i className="pi pi-wallet mr-1" aria-hidden />
              How {award.winnerName} wants to be paid
            </Link>
            <span className="text-[var(--text-color-secondary)]"> — on their profile, shown to you now that you have hired them.</span>
          </p>
        )}
        {award.paidAtUtc && (
          <p className="mt-3 text-sm text-[var(--text-color-secondary)]">
            {award.handover === 'verified'
              ? 'Paid in full, and the repository is yours.'
              : award.handover === 'requested'
                ? `Paid in full. The repository's transfer to @${award.transferTargetLogin} is on its way — GitHub may hold it until you accept.`
                : award.handoverNote ?? 'Paid in full.'}
          </p>
        )}
        {upload && winner?.files && (
          <div className="mt-3 border-t border-[var(--surface-border)] pt-3">
            <p className="text-sm font-medium">{award.winnerName}&apos;s files</p>
            <EntryFileGallery files={winner.files} showHelp />
          </div>
        )}
        {/* Before any work arrives the hire can be taken back, and the job
            opens again; after, the way out is a cancellation. */}
        {!award.paidAtUtc && hiredRow && nothingHandedIn && (
          <Button
            label="Take back the hire"
            icon="pi pi-undo"
            size="small"
            text
            severity="secondary"
            className="mt-2"
            disabled={busy}
            onClick={() => onDecide(hiredRow.application.id, 'not_selected', award.winnerName)}
          />
        )}
        {award.canRate && award.id && (
          <RateExperience awardId={award.id} aboutName={award.winnerName} existing={award.myRating} onSaved={onRefresh} />
        )}
        {error && <Message severity="error" text={error} className="mt-3 w-full" />}
        {!award.paidAtUtc && <CancelPanel busy={busy} error={null} onCancel={onCancelOpportunity} />}
      </Box>
    );
  }

  if (status === 'awarded' && award) {
    return (
      <Box
        title={
          <>
          <i className="pi pi-trophy mr-2 text-[var(--primary-color)]" aria-hidden />
          {award.winnerName} won
        </>
        }
      >
        {/* The handover is talked through here, before and after payment. */}
        {award.winnerEntryId && (
          <Button
            label={`Message ${award.winnerName}`}
            icon="pi pi-comments"
            outlined
            size="small"
            className="mb-2 mt-1"
            onClick={() => openChat(award.winnerEntryId!)}
          />
        )}
        {!award.paidAtUtc ? (
          <>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Pay {award.winnerName} the agreed award, then confirm below
              {repo
                ? ' — payment is what triggers the repository handover.'
                : ' — the confirmation is the record both sides point to later.'}
            </p>
            {/* Where to send it. Of clients, only the one who announced
                the winner reads it, so this is the one place it is linked. */}
            {award.winnerUserId && (
              <p className="mt-2 text-sm">
                <Link
                  href={`/profile/${award.winnerUserId}#how-to-pay`}
                  className="font-medium text-[var(--primary-color)] no-underline hover:underline"
                >
                  <i className="pi pi-wallet mr-1" aria-hidden />
                  How {award.winnerName} wants to be paid
                </Link>
                <span className="text-[var(--text-color-secondary)]">
                  {' '}
                  — on their profile, shown to you now that you have announced them.
                </span>
              </p>
            )}
            <div className="mt-4 flex items-center">
              <Button
                label={repo ? 'Mark paid & transfer repo' : 'Mark paid'}
                icon="pi pi-check"
                loading={busy}
                onClick={onMarkPaid}
              />
              <HelpIcon topic="award.markPaid" label="Marking the award paid" />
            </div>
          </>
        ) : (
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <p>
              <Tag value="Paid" severity="success" rounded />{' '}
              <span className="text-[var(--text-color-secondary)]">
                {new Date(award.paidAtUtc).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </p>
            {award.handover === 'verified' ? (
              <p className="text-green-700 dark:text-green-400">
                <i className="pi pi-check-circle mr-1" aria-hidden />
                Repository handed over
                {award.winnerRepoFullName && (
                  <>
                    {' — '}
                    <a
                      href={`https://github.com/${award.winnerRepoFullName}`}
                      target="_blank"
                      rel="noreferrer"
                      className="[overflow-wrap:anywhere] text-[var(--primary-color)]"
                    >
                      {award.winnerRepoFullName}
                    </a>
                  </>
                )}
              </p>
            ) : award.handover === 'requested' && !award.transferRequestedAtUtc ? (
              // Paid, but the transfer has not reached GitHub — there is no
              // email to watch for yet, so the page does not promise one.
              <p className="text-[var(--text-color-secondary)]">
                <i className="pi pi-clock mr-1" aria-hidden />
                The transfer to <code>@{award.transferTargetLogin}</code> is queued and has
                not reached GitHub yet. Once it does, GitHub emails you to accept it; this
                page updates once the repository is really yours.
              </p>
            ) : award.handover === 'requested' ? (
              <p className="text-[var(--text-color-secondary)]">
                <i className="pi pi-sync mr-1" aria-hidden />
                Transfer requested to <code>@{award.transferTargetLogin}</code>. GitHub
                may hold it until you accept — watch for the email; this page updates
                once the repository is really yours.
              </p>
            ) : (
              <p className="text-[var(--text-color-secondary)]">
                {award.handoverNote ?? 'No repository transfer applies to this award.'}
              </p>
            )}
          </div>
        )}
        {/* The winning files — already the client's, from the deadline on. */}
        {upload && winner?.files && (
          <div className="mt-3 border-t border-[var(--surface-border)] pt-3">
            <p className="text-sm font-medium">{award.winnerName}&apos;s files</p>
            <EntryFileGallery files={winner.files} showHelp />
          </div>
        )}
        {/* The winning work as one file — the whole deliverable channel for a
            client who reviews without GitHub, a convenience for everyone else. */}
        {repo && opportunity.storageConfigured && award.winnerEntryId && (
          <div className="mt-3 flex items-center">
            <Button
              label="Download the work as a ZIP"
              icon="pi pi-download"
              size="small"
              outlined
              disabled={busy}
              onClick={() => onDownloadZip(award.winnerEntryId!)}
            />
            <HelpIcon topic="entry.zipDownload" label="The entry as a ZIP" />
          </div>
        )}
        {award.canRate && award.id && (
          <RateExperience
            awardId={award.id}
            aboutName={award.winnerName}
            existing={award.myRating}
            onSaved={onRefresh}
          />
        )}
        {error && <Message severity="error" text={error} className="mt-3 w-full" />}
      </Box>
    );
  }

  return (
    <Box title="Your opportunity">
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">Status: {status}.</p>
    </Box>
  );
}

/**
 * An administrator on somebody else's opportunity. One power, not the owner's
 * set: they can take an entrant off, and that is all this box offers — with
 * the same standing, breakdown and notes the owner reads before doing it.
 */
function AdminBox({
  opportunity,
  busy,
  error,
  removing,
  onStartRemove,
  onRemoveEntrant,
  onDecide,
}: {
  opportunity: OpportunityDetail;
  busy: boolean;
  error: string | null;
  removing: string | null;
  onStartRemove: (entryId: string | null) => void;
  onRemoveEntrant: (entryId: string, reason: string) => Promise<void>;
  onDecide: (applicationId: string, decision: 'selected' | 'not_selected', name: string) => void;
}) {
  const repo = usesRepo(opportunity.delivery);
  const upload = usesUpload(opportunity.delivery);
  const { data: aiStatus } = useQuery(aiStatusQuery);
  const notes = useStandingNotes(opportunity.id);

  return (
    <Box
      title={
        <>
        <i className="pi pi-shield mr-2 text-[var(--primary-color)]" aria-hidden />
        Administrator
      </>
      }
    >
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        This opportunity belongs to {opportunity.clientName}. You can decide its applications and take an
        entrant off it — announcing, cancelling and everything else stays theirs.
      </p>
      {opportunity.applications && (opportunity.status === 'open' || opportunity.status === 'reviewing') && (
        <ApplicationsPanel
          rows={opportunity.applications}
          hiring={opportunity.kind === 'milestones'}
          busy={busy}
          error={error}
          onDecide={onDecide}
          byAdmin
          decisionsOpen={opportunity.status === 'open'}
          renderRemove={(entryId, name) => (
            <RemovePanel
              entryId={entryId}
              name={name}
              busy={busy}
              error={removing === `application:${entryId}` ? error : null}
              open={removing === `application:${entryId}`}
              // Its own key: the board below holds the same entry, and only the form pressed opens.
              onOpen={(id) => onStartRemove(id && `application:${id}`)}
              onRemove={onRemoveEntrant}
              byAdmin
              hasRepo={repo}
            />
          )}
        />
      )}
      {aiStatus?.features.standing && opportunity.entrants.length > 0 && (
        <StandingNotesPanel notes={notes} />
      )}
      {opportunity.entrants.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--text-color-secondary)]">No entrants yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {opportunity.entrants.map((e, i) => (
            <li key={i} className="rounded-lg border border-[var(--surface-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Avatar name={e.displayName} url={e.avatarUrl} size="xs" />
                  {e.displayName}
                </span>
                <span className="text-xs text-[var(--text-color-secondary)]">
                  entered {relativeTime(e.enteredAtUtc)}
                </span>
              </div>
              <EntrantStandingLine
                entrant={e}
                of={opportunity.entrants.length}
                note={notes.noteFor(e.entryId)}
                showHelp={i === 0}
              />
              {/* Moderation reads the files too — an administrator opens
                  them at any time, deadline or not. */}
              {upload && e.files && <EntryFileGallery files={e.files} showHelp={i === 0} />}
              {e.entryId && (
                <RemovePanel
                  entryId={e.entryId}
                  name={e.displayName}
                  busy={busy}
                  error={removing === e.entryId ? error : null}
                  open={removing === e.entryId}
                  onOpen={onStartRemove}
                  onRemove={onRemoveEntrant}
                  showHelp={i === 0}
                  byAdmin
                  hasRepo={repo}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

/**
 * A card's standing: the number, the reading, the sums folded shut, and the
 * drafted note when one exists — everything a client reads before the
 * remove button underneath it. Nothing here when the board is hidden.
 */
/**
 * The entrant's own past work that fits this brief, and what came of it, for
 * the client weighing them. Self-reported, as everything on a profile is.
 */
function EntrantPastWork({ work }: { work: OpportunityEntrant['pastWork'] }) {
  if (!work) return null;
  return (
    <p className="mt-1.5 rounded-md bg-[var(--surface-hover)] px-2 py-1.5 text-xs text-[var(--text-color)]">
      <span className="text-[var(--text-color-secondary)]">
        <i className="pi pi-briefcase mr-1 text-xs" aria-hidden />
        Past work:{' '}
      </span>
      <span className="font-medium [overflow-wrap:anywhere]">{work.title}</span>
      <span className="mt-0.5 line-clamp-3 whitespace-pre-wrap [overflow-wrap:anywhere]">
        <span className="font-medium">Outcome: </span>
        {work.outcome}
      </span>
    </p>
  );
}

function EntrantStandingLine({
  entrant: e,
  of,
  note,
  showHelp,
}: {
  entrant: OpportunityEntrant;
  of: number;
  note: EntrantStandingNote | null;
  showHelp?: boolean;
}) {
  if (e.standingScore === null || !e.standingBand) return null;
  return (
    <div className="mt-1.5">
      <span className="flex items-center">
        <StandingBadge score={e.standingScore} band={e.standingBand} rank={e.standingRank} of={of} />
        {showHelp && <HelpIcon topic="opportunity.standingScore" label="The standing score" />}
      </span>
      {e.standingParts && <StandingBreakdown parts={e.standingParts} score={e.standingScore} />}
      <EntrantNote note={note} />
    </div>
  );
}

/**
 * The cancel control, folded shut by default — it is the rail's least-wanted
 * action. Opening it asks for the reason first because the reason IS the
 * action: it goes, word for word, to every entrant.
 */
function CancelPanel({
  busy,
  error,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onCancel: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!open) {
    return (
      <div className="mt-4 flex items-center border-t border-[var(--surface-border)] pt-3">
        <Button
          label="Cancel this opportunity"
          icon="pi pi-ban"
          severity="danger"
          text
          size="small"
          onClick={() => setOpen(true)}
        />
        <HelpIcon topic="opportunity.cancel" label="Cancelling an opportunity" />
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-[var(--surface-border)] pt-3">
      <p className="text-sm font-medium">
        Call the whole opportunity off
        <HelpIcon topic="opportunity.cancel" label="Cancelling an opportunity" />
      </p>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        Permanent, and part of your public record. Your reason below is emailed, word for
        word, to every entrant.
      </p>
      <InputTextarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Why this opportunity is being called off (at least 10 characters)"
        className="mt-2 w-full"
        autoFocus
      />
      {error && <Message severity="error" text={error} className="mt-2 w-full" />}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          label="Cancel the opportunity & tell entrants"
          icon="pi pi-ban"
          severity="danger"
          size="small"
          loading={busy}
          disabled={reason.trim().length < 10}
          onClick={() => onCancel(reason)}
        />
        <Button
          label="Keep it running"
          size="small"
          text
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setReason('');
          }}
        />
      </div>
    </div>
  );
}

/**
 * The rail's card. With a title it folds from it like every other panel on
 * the page — one fold, remembered per device, whichever state the card is
 * in — so the heading always stays in view and says where the controls
 * went. The cards with no title line stay plain.
 */
function Box({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) {
  if (title === undefined)
    return (
      <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-5">
        {children}
      </section>
    );
  return (
    <Fold id="opportunity-actions" className="p-5" headingClassName="font-semibold" title={title}>
      {children}
    </Fold>
  );
}

/**
 * Taking one entrant off the opportunity. A form rather than a confirm dialog,
 * because the reason is the substance: it is emailed to them word for word
 * and is the only account they will ever get. Everything the button does
 * that cannot be undone is stated before it is pressed.
 */
function RemovePanel({
  entryId,
  name,
  busy,
  error,
  open,
  onOpen,
  onRemove,
  showHelp,
  byAdmin,
  hasRepo,
}: {
  entryId: string;
  name: string;
  busy: boolean;
  error: string | null;
  open: boolean;
  onOpen: (entryId: string | null) => void;
  onRemove: (entryId: string, reason: string) => Promise<void>;
  showHelp?: boolean;
  /** An administrator acting over the client: the client is told as well. */
  byAdmin?: boolean;
  /** Whether this entry has a repository to archive; files simply stay theirs. */
  hasRepo: boolean;
}) {
  const [reason, setReason] = useState('');

  if (!open) {
    return (
      <div className="mt-2 flex items-center">
        <Button
          label="Remove from opportunity"
          icon="pi pi-user-minus"
          severity="danger"
          text
          size="small"
          disabled={busy}
          onClick={() => onOpen(entryId)}
        />
        {showHelp && <HelpIcon topic="entry.remove" label="Removing an entrant" />}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-red-500/40 p-3">
      <p className="text-sm font-medium">
        Remove {name} from this opportunity
        <HelpIcon topic="entry.remove" label="Removing an entrant" />
      </p>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        Permanent. They drop off the board, cannot enter again, and their reason below is
        emailed to them word for word{byAdmin && ', and to the client as well'}.{' '}
        {hasRepo
          ? 'Their repository is archived — read-only, never transferred, never deleted — and they keep read access for a week to clone it.'
          : 'Their files stay theirs — nothing is deleted.'}
      </p>
      <InputTextarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Why this entry is being removed (at least 10 characters)"
        className="mt-2 w-full"
        autoFocus
      />
      {error && <Message severity="error" text={error} className="mt-2 w-full" />}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          label="Remove & tell them"
          icon="pi pi-user-minus"
          severity="danger"
          size="small"
          loading={busy}
          disabled={reason.trim().length < 10}
          onClick={() => void onRemove(entryId, reason)}
        />
        <Button
          label="Keep them in"
          size="small"
          text
          severity="secondary"
          disabled={busy}
          onClick={() => {
            setReason('');
            onOpen(null);
          }}
        />
      </div>
    </div>
  );
}

/**
 * The conversation with one entrant, opened in the dock at the corner of
 * the page — the client's end of the line the entrant has as "Message
 * the client".
 */
function MessageEntrant({ entryId, name }: { entryId: string; name: string }) {
  return (
    <Button
      icon="pi pi-comments"
      text
      rounded
      size="small"
      aria-label={`Message ${name}`}
      tooltip={`Message ${name}`}
      tooltipOptions={{ position: 'top' }}
      onClick={() => openChat(entryId)}
    />
  );
}
