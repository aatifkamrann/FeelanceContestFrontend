import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Markdown from 'react-markdown';
import { getBranding, getMe, PORTAL_NAME } from '@/lib/api';
import {
  count,
  fetchOpportunity,
  formatAward,
  deadlineLabel,
  joiningLabel,
  startsLabel,
  startedAt,
  opportunityDuration,
  timelineFrom,
  pulseState,
  relativeTime,
  starScore,
  usesRepo,
  usesUpload,
  utcDay,
  utcMoment,
  type BuildCell,
  type EntrantStanding,
  type MilestoneState,
} from '@/lib/opportunities';
import SiteHeader from '@/components/SiteHeader';
import HelpIcon from '@/components/HelpIcon';
import Fold from '@/components/Fold';
import OpportunityFacts from '@/components/OpportunityFacts';
import FilePreviews from '@/components/FilePreviews';
import OpportunityFigures from '@/components/OpportunityFigures';
import LivePulse from '@/components/LivePulse';
import MatchRing from '@/components/MatchRing';
import ApplicationsLine from '@/components/ApplicationsLine';
import OpportunityActions from './OpportunityActions';
import OpportunityTabs from './OpportunityTabs';
import { EligibilityTab, EvaluationTab, MilestonesTab, RequirementsTab } from './OpportunityTerms';
import LiveOpportunity from '@/components/LiveOpportunity';
import BuildMark from '@/components/BuildMark';
import { StandingBadge } from '@/components/StandingBadge';

export const dynamic = 'force-dynamic';

/** The request's cookie header, verbatim, for the API to read the session from. */
async function viewerCookie(): Promise<string | undefined> {
  return (await headers()).get('cookie') ?? undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opportunity = await fetchOpportunity(slug, await viewerCookie());
  if (!opportunity) return {};
  // The client's saved metadata wins; the generated line is only the fallback.
  const award = `${formatAward(opportunity.awardAmount, opportunity.currency)} fixed-award opportunity`;
  // The portal's name is the root layout's title template to add, not this
  // page's to spell: a renamed portal renames this tab with the rest.
  return {
    title: opportunity.metaTitle ?? opportunity.title,
    description: opportunity.metaDescription ?? award,
  };
}

export default async function OpportunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // The whole page, for a visitor as much as for a member — the brief is
  // what an opportunity is, and nobody can judge whether to join over a teaser
  // of it. The fetch still rides the viewer's cookie for the parts that
  // are theirs; viewer-specific state (my entry, ownership) hydrates
  // client-side, and the rail asks a visitor to sign in.
  const cookie = await viewerCookie();
  const [opportunity, branding, viewer] = await Promise.all([
    fetchOpportunity(slug, cookie),
    getBranding(),
    // Only for the brief's files: their bytes are still behind the
    // sign-in, and a visitor must get their names rather than a preview
    // frame that would load the login page.
    getMe(cookie),
  ]);
  if (!opportunity) notFound();
  const portalName = branding?.portalName ?? PORTAL_NAME;

  const closing = deadlineLabel(opportunity.deadlineUtc);
  const joining = joiningLabel(opportunity.entryCloseUtc, opportunity.entryOpen);
  const starting = startsLabel(opportunity.startsAtUtc);
  const begun = startedAt(opportunity.startsAtUtc, opportunity.publishedAtUtc);
  const duration = opportunityDuration(begun, opportunity.deadlineUtc);
  const hasBoard = opportunity.showBoard && opportunity.entrants.length > 0 && opportunity.status !== 'draft';
  // Whether any milestone carries a date at all. Without one the board says
  // done or not done, exactly as it did before dates existed.
  const dated = opportunity.milestones.some((m) => m.dueUtc);
  // Once an opportunity is decided every entrant repository is archived (or
  // handed over) and every upload is frozen, so nothing can land: the board
  // is a record, not a feed.
  const decided = opportunity.status === 'awarded' || opportunity.status === 'cancelled';
  // The board's own words for how a claim arrives, by delivery.
  const repo = usesRepo(opportunity.delivery);
  const upload = usesUpload(opportunity.delivery);
  const claimedBy = repo && upload ? 'pushed tags and uploaded files' : upload ? 'uploaded files' : 'pushed tags';
  const liveFrom = repo && upload ? 'live from each repo and upload' : upload ? 'live as files land' : 'live from each private repo';
  const activityHeading = repo && upload ? 'Last activity' : upload ? 'Last upload' : 'Last push';

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* ------------------------------------------------ main column */}
          <div className="min-w-0 flex-1">
            {/* The page's top line: the opportunity's clock, in words, at the
                left; the viewer's match at the right. */}
            <div className="mb-3 flex items-start justify-between gap-3">
              <span>
                <LivePulse state={pulseState(opportunity)} prefix="Opportunity" />
              </span>
              {opportunity.viewerFit && <MatchRing fit={opportunity.viewerFit} />}
            </div>
            {/* What kind of work, over the title — the first word a reader
                sorts the page by; the finer kind rides after it. */}
            {opportunity.categoryLabel && (
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-color)]">
                {opportunity.categoryLabel}
                {opportunity.subcategoryLabel && (
                  <span className="font-normal text-[var(--text-color-secondary)]">
                    {' · '}
                    {opportunity.subcategoryLabel}
                  </span>
                )}
              </p>
            )}
            <h1 className="mt-1 text-3xl font-bold">{opportunity.title}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-color-secondary)]">
              <Avatar name={opportunity.clientName} url={opportunity.clientAvatarUrl} size="xs" />
              Opportunity by {opportunity.clientName}
            </p>

            {/* The cancellation notice — the page stays up because entrants
                hold links to it, and the notice is what those links owe them. */}
            {opportunity.status === 'cancelled' && (
              <div className="mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-hover)] p-4">
                <p className="font-semibold">
                  <i className="pi pi-ban mr-2 text-[var(--text-color-secondary)]" aria-hidden />
                  This opportunity was cancelled
                  {opportunity.cancelledAtUtc &&
                    ` on ${new Date(opportunity.cancelledAtUtc).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}`}
                </p>
                {opportunity.cancelReason && (
                  <p className="mt-1 text-sm">
                    The client&apos;s reason: <span className="italic">“{opportunity.cancelReason}”</span>
                  </p>
                )}
                <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                  Entries are void and no winner will be chosen. Every entrant keeps their own
                  work — repositories were archived, never transferred.
                </p>
              </div>
            )}

            {opportunity.award && (
              <div className="mt-4 rounded-xl border border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)] p-4">
                <div className="flex items-center gap-3">
                  <i className="pi pi-trophy text-2xl text-[var(--primary-color)]" aria-hidden />
                  <div>
                    <p className="font-semibold">Winner: {opportunity.award.winnerName}</p>
                    <p className="text-sm text-[var(--text-color-secondary)]">
                      Announced{' '}
                      {new Date(opportunity.award.announcedAtUtc).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {' · '}
                      {formatAward(opportunity.awardAmount, opportunity.currency)}
                      {' · '}
                      {/* Public on purpose: an award left unpaid is visible
                          to everyone who looks. */}
                      {opportunity.award.paidAtUtc ? (
                        <span className="font-medium text-green-700 dark:text-green-400">
                          paid{' '}
                          {new Date(opportunity.award.paidAtUtc).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      ) : (
                        <span className="font-medium text-amber-600">payment pending</span>
                      )}
                    </p>
                  </div>
                </div>
                {(opportunity.award.ratingOfClient || opportunity.award.ratingOfWinner) && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-[var(--surface-border)] pt-3 text-sm">
                    {opportunity.award.ratingOfClient && (
                      <PublicRating
                        rating={opportunity.award.ratingOfClient}
                        about={`working with ${opportunity.clientName}`}
                      />
                    )}
                    {opportunity.award.ratingOfWinner && (
                      <PublicRating
                        rating={opportunity.award.ratingOfWinner}
                        about={`working with ${opportunity.award.winnerName}`}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* The opportunity in four figures — the box the draft's preview wears too. */}
            <OpportunityFigures
              awardAmount={opportunity.awardAmount}
              currency={opportunity.currency}
              deadlineUtc={opportunity.deadlineUtc}
              status={opportunity.status}
              entrantCount={opportunity.entrantCount}
              maxEntries={opportunity.maxEntries}
              milestoneCount={opportunity.milestones.length}
              className="mt-5"
            />
            {/* The moments themselves, under the figures. A cancelled
                opportunity has no countdown — nothing closes any more. */}
            {opportunity.deadlineUtc && opportunity.status !== 'cancelled' && (
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-color-secondary)]">
                {/* The start, where the client set one — information, not a
                    gate: entry is open from publishing, and the start is where
                    the opportunity duration counts from. */}
                {opportunity.startsAtUtc && begun && (
                  <span>
                    <i className="pi pi-calendar mr-1" aria-hidden />
                    {starting ? `Starts ${utcDay(begun)} · ${starting}` : `Started ${utcDay(begun)}`}
                    {duration && ` · runs ${duration}`}
                  </span>
                )}
                <span>
                  <i className="pi pi-clock mr-1" aria-hidden />
                  Deadline {utcMoment(opportunity.deadlineUtc)}
                  {' · '}
                  {closing}
                </span>
                {/* Only where the two dates actually differ. An opportunity whose
                    entry runs to the deadline has nothing extra to say. */}
                {opportunity.entryClosesEarly && opportunity.entryCloseUtc && opportunity.status === 'open' && (
                  <span className={opportunity.entryOpen ? '' : 'font-medium text-amber-600 dark:text-amber-500'}>
                    <i className="pi pi-sign-in mr-1" aria-hidden />
                    {joining}
                    {' · '}
                    {utcMoment(opportunity.entryCloseUtc)}
                  </span>
                )}
              </p>
            )}

            {/* Who it is for — the terms the entry door checks. The kind of
                work is already over the title. */}
            <OpportunityFacts
              categoryLabel={null}
              subcategoryLabel={null}
              skills={opportunity.skills}
              minMeritScore={opportunity.minMeritScore}
              requiresCompose={opportunity.requiresCompose}
              className="mt-3"
            />

            {/* Open, building, and shut to newcomers — a state the status
                badge alone cannot show, and the one a visitor most needs
                explained before they look for a join button that is gone. */}
            {opportunity.status === 'open' && !opportunity.entryOpen && (
              <div className="mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-hover)] p-4 text-sm">
                <p className="font-semibold">
                  <i className="pi pi-lock mr-2 text-[var(--text-color-secondary)]" aria-hidden />
                  Entry closed{opportunity.entryCloseUtc && ` on ${utcMoment(opportunity.entryCloseUtc)}`}
                </p>
                <p className="mt-1 text-[var(--text-color-secondary)]">
                  The client set a last joining date ahead of the deadline. The{' '}
                  {count(opportunity.entrantCount, 'entrant')} already in build on until the deadline —
                  the board below stays live, and the award is still to be decided.
                </p>
              </div>
            )}

            {/* The checkpoint board — checkpoints pivoted: one row per
                entrant, one column per milestone, stamped by webhooks when a
                tag m1, m2… lands. Public by default; an operator can restrict
                it to the opportunity owner (features.publicMilestoneBoard). */}
            {hasBoard && (
              <Fold
                id="opportunity-board"
                className="mt-8 p-6"
                title="Progress board"
                extra={
                  <>
                    <span className="text-sm text-[var(--text-color-secondary)]">
                      {decided
                        ? `— milestones claimed by ${claimedBy} before the opportunity closed; the board is final`
                        : `— milestones claimed by ${claimedBy}, ${liveFrom}`}
                      , best standing first
                    </span>
                    {/* The pill promises movement a decided board cannot show.
                        The watch itself stays: a paid award still reaches the
                        page — and it sits in the heading so a folded board
                        keeps watching. */}
                    <LiveOpportunity slug={opportunity.slug} badge={!decided} />
                  </>
                }
              >
                {/* The daily AI note — drafted from exactly the rows below,
                    and labelled, because the board is the record and this is
                    only its readable retelling. */}
                {opportunity.narrative && (
                  <div className="mt-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-hover)] p-3 text-sm">
                    <p>
                      <i className="pi pi-sparkles mr-1 text-[var(--primary-color)]" aria-hidden />
                      {opportunity.narrative.text}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
                      AI-drafted daily note · {relativeTime(opportunity.narrative.atUtc)}
                      <HelpIcon topic="opportunity.progressNarrative" label="The daily board note" />
                    </p>
                  </div>
                )}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-[var(--text-color-secondary)]">
                        <th className="pb-2 pr-4 font-medium">Entrant</th>
                        {opportunity.milestones.map((m, i) => (
                          <th
                            key={i}
                            className="pb-2 text-center font-medium"
                            title={m.dueUtc ? `${m.title} — due by ${utcMoment(m.dueUtc)}` : m.title}
                          >
                            m{i + 1}
                            {m.dueUtc && (
                              <span className="block text-xs font-normal">
                                {new Date(m.dueUtc).toLocaleDateString('en-GB', {
                                  day: 'numeric',
                                  month: 'short',
                                  timeZone: 'UTC',
                                })}
                              </span>
                            )}
                          </th>
                        ))}
                        <th className="pb-2 pl-4 text-right font-medium whitespace-nowrap">
                          Standing
                          <HelpIcon topic="opportunity.standingScore" label="The standing score" />
                        </th>
                        {upload && <th className="pb-2 pl-4 text-right font-medium">Files</th>}
                        <th className="pb-2 pl-4 text-right font-medium">{activityHeading}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opportunity.entrants.map((e, row) => (
                        <tr key={row} className="border-t border-[var(--surface-border)]">
                          <td className="py-2 pr-4 font-medium">
                            <span className="flex items-center gap-2">
                              <Avatar name={e.displayName} url={e.avatarUrl} size="xs" />
                              {e.displayName}
                            </span>
                          </td>
                          {opportunity.milestones.map((m, i) => (
                            <td key={i} className="py-2 text-center">
                              <BoardCell
                                n={i + 1}
                                state={
                                  e.milestoneStates?.[i] ??
                                  (e.milestonesDone?.includes(i + 1) ? 'claimed' : 'open')
                                }
                                dueUtc={m.dueUtc}
                                build={e.builds?.[i]}
                              />
                            </td>
                          ))}
                          <td className="py-2 pl-4 text-right whitespace-nowrap">
                            {/* The score the row is placed by, and its reading. */}
                            {e.standingScore !== null && e.standingBand ? (
                              <StandingBadge score={e.standingScore} band={e.standingBand} />
                            ) : (
                              <span className="text-[var(--text-color-secondary)]">—</span>
                            )}
                            {/* The on-time counts under the number: the
                                biggest part of it, and what a person reads. */}
                            {dated && e.standing && (
                              <div className="mt-0.5 text-xs">
                                <Standing standing={e.standing} />
                              </div>
                            )}
                          </td>
                          {upload && (
                            <td className="py-2 pl-4 text-right text-[var(--text-color-secondary)]">
                              {e.filesUploaded ?? '—'}
                            </td>
                          )}
                          <td className="py-2 pl-4 text-right text-[var(--text-color-secondary)]">
                            {e.lastPushAtUtc ? relativeTime(e.lastPushAtUtc) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Fold>
            )}

            {/* The brief and the terms beside it — requirements, milestones,
                evaluation, eligibility — and the entrants: six tabs over one
                card, the brief first. */}
            <OpportunityTabs
              tabs={[
                {
                  key: 'overview',
                  header: 'Overview',
                  icon: 'pi-file',
                  body: (
                    <div className="prose-sm max-w-none [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:text-sm [&_h4]:font-semibold [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0">
                      {/* The document's headings sit one level under the page's. */}
                      <Markdown components={{ h1: 'h3', h2: 'h3', h3: 'h4' }}>{opportunity.briefMarkdown}</Markdown>
                      <ApplicationsLine
                        opportunity={opportunity}
                        className="mt-4 border-t border-[var(--surface-border)] pt-3"
                      />

                      {/* Brief files, previewed where the browser can show them
                          and a download otherwise. Both ride the cookie, then
                          redirect to a five-minute signed URL. */}
                      {opportunity.attachments.length > 0 && (
                        <div className="mt-5 border-t border-[var(--surface-border)] pt-4">
                          <h3 className="!mt-0 !text-sm font-semibold">Attached files</h3>
                          <FilePreviews
                            files={opportunity.attachments}
                            source="attachments"
                            locked={!viewer}
                          />
                          {!viewer && (
                            <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                              What is in them is for members: a click on one asks you to sign in
                              first, and brings you back here.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  // The technical table and the skills — the constraints,
                  // counted by the rows the client wrote.
                  key: 'requirements',
                  header: 'Requirements',
                  icon: 'pi-wrench',
                  count: opportunity.requirements.length + opportunity.skills.length,
                  body: (
                    <RequirementsTab
                      requirements={opportunity.requirements}
                      skills={opportunity.skills}
                      requiresCompose={opportunity.requiresCompose}
                    />
                  ),
                },
                {
                  key: 'milestones',
                  header: 'Milestones',
                  icon: 'pi-list-check',
                  count: opportunity.milestones.length,
                  body: <MilestonesTab milestones={opportunity.milestones} dated={dated} />,
                },
                {
                  key: 'evaluation',
                  header: 'Evaluation',
                  icon: 'pi-chart-bar',
                  body: <EvaluationTab criteria={opportunity.criteria} portalName={portalName} />,
                },
                {
                  key: 'eligibility',
                  header: 'Eligibility',
                  icon: 'pi-verified',
                  body: (
                    <EligibilityTab
                      minMeritScore={opportunity.minMeritScore}
                      categoryLabel={opportunity.categoryLabel}
                      timelineFromUtc={timelineFrom(opportunity.startsAtUtc, opportunity.publishedAtUtc)}
                      deadlineUtc={opportunity.deadlineUtc}
                      fit={opportunity.viewerFit}
                    />
                  ),
                },
                {
                  key: 'entrants',
                  header: 'Entrants',
                  icon: 'pi-users',
                  count: opportunity.entrantCount,
                  body: (
                    <>
                      {/* The public entrant list is deliberate — open entry means the
                          list and the count are how entrants judge their own odds. */}
                      {opportunity.entrants.length === 0 ? (
                        <p className="text-sm text-[var(--text-color-secondary)]">
                          No entrants yet — be the first.
                        </p>
                      ) : (
                        <ul className="grid gap-3 sm:grid-cols-2">
                          {opportunity.entrants.map((e, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <Avatar name={e.displayName} url={e.avatarUrl} size="sm" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium">
                                  {/* The name is the way into their portfolio; the
                                      score beside it says how much of one there is. */}
                                  <Link
                                    href={`/profile/${e.userId}`}
                                    className="text-[var(--text-color)] no-underline hover:text-[var(--primary-color)]"
                                  >
                                    {e.displayName}
                                  </Link>
                                  <span className="ml-2 text-xs font-normal text-[var(--text-color-secondary)]">
                                    merit {e.meritScore}
                                  </span>
                                  {(e.wins > 0 || e.ratingCount > 0) && (
                                    <span className="ml-2 text-xs font-normal text-[var(--text-color-secondary)]">
                                      {e.wins > 0 && `${e.wins} win${e.wins === 1 ? '' : 's'}`}
                                      {e.wins > 0 && e.ratingCount > 0 && ' · '}
                                      {e.ratingCount > 0 && starScore(e.ratingAvg!)}
                                    </span>
                                  )}
                                </p>
                                {e.headline && (
                                  <p className="text-xs text-[var(--text-color-secondary)]">{e.headline}</p>
                                )}
                                {e.note && (
                                  <p className="text-xs text-[var(--text-color-secondary)]">{e.note}</p>
                                )}
                                <p className="text-xs text-[var(--text-color-secondary)]">
                                  entered{' '}
                                  {new Date(e.enteredAtUtc).toLocaleDateString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                  })}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ),
                },
              ]}
            />
            {!hasBoard && opportunity.status !== 'draft' && <LiveOpportunity slug={opportunity.slug} />}
          </div>

          {/* ------------------------------------------------- right rail */}
          <aside className="w-full shrink-0 lg:w-80">
            <OpportunityActions
              slug={opportunity.slug}
              status={opportunity.status}
              deadlineUtc={opportunity.deadlineUtc}
              delivery={opportunity.delivery}
            />

            {/* The client's payment record — the counterweight to "no
                deposit, open entry". Everything here is derived from the
                portal's own award rows, never self-reported. */}
            <Fold
              id="opportunity-client"
              className="mt-4 p-5"
              headingClassName="font-semibold"
              title="About this client"
              extra={<HelpIcon topic="opportunity.clientTrackRecord" label="The client's track record" />}
            >
              <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                <Avatar name={opportunity.clientName} url={opportunity.clientAvatarUrl} size="sm" />
                {opportunity.clientName}
              </p>
              {opportunity.clientRecord.ratingCount > 0 && (
                <p className="mt-1 text-sm">
                  <span className="font-semibold text-[var(--primary-color)]">
                    {starScore(opportunity.clientRecord.ratingAvg!)}
                  </span>{' '}
                  <span className="text-[var(--text-color-secondary)]">
                    from {opportunity.clientRecord.ratingCount} winner
                    {opportunity.clientRecord.ratingCount === 1 ? '' : 's'}
                  </span>
                </p>
              )}
              {opportunity.clientRecord.awardsAnnounced === 0 ? (
                <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                  No completed awards yet — entrants here would be among the first. The
                  payment record starts with this opportunity.
                </p>
              ) : (
                <dl className="mt-3 flex flex-col gap-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-color-secondary)]">Opportunities posted</dt>
                    <dd className="font-medium">{opportunity.clientRecord.opportunitiesPosted}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--text-color-secondary)]">Awards paid</dt>
                    <dd className="font-medium">
                      {opportunity.clientRecord.awardsPaid} of {opportunity.clientRecord.awardsAnnounced}
                    </dd>
                  </div>
                  {opportunity.clientRecord.medianDaysToPay !== null && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--text-color-secondary)]">Typically pays in</dt>
                      <dd className="font-medium">
                        {opportunity.clientRecord.medianDaysToPay < 1
                          ? 'same day'
                          : `${Math.round(opportunity.clientRecord.medianDaysToPay)} day${
                              Math.round(opportunity.clientRecord.medianDaysToPay) === 1 ? '' : 's'
                            }`}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              {opportunity.clientRecord.oldestUnpaidDays !== null && (
                <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <i className="pi pi-exclamation-triangle mr-1 text-amber-600" aria-hidden />
                  {opportunity.clientRecord.awardsAnnounced - opportunity.clientRecord.awardsPaid} award
                  {opportunity.clientRecord.awardsAnnounced - opportunity.clientRecord.awardsPaid === 1
                    ? ''
                    : 's'}{' '}
                  awaiting payment — the oldest for {opportunity.clientRecord.oldestUnpaidDays} day
                  {opportunity.clientRecord.oldestUnpaidDays === 1 ? '' : 's'}.
                </p>
              )}
              {/* Cancellations sit beside the payment record because they are
                  the same promise, broken earlier — only cancellations that
                  cost entrants staked work are counted. */}
              {opportunity.clientRecord.opportunitiesCancelled > 0 && (
                <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                  <i className="pi pi-ban mr-1 text-amber-600" aria-hidden />
                  Cancelled {opportunity.clientRecord.opportunitiesCancelled} of{' '}
                  {opportunity.clientRecord.opportunitiesPosted} posted{' '}
                  {opportunity.clientRecord.opportunitiesPosted === 1 ? 'opportunity' : 'opportunities'} after entrants had
                  already joined.
                </p>
              )}
              {opportunity.clientRecord.reviews.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2 border-t border-[var(--surface-border)] pt-3">
                  {opportunity.clientRecord.reviews.map((r, i) => (
                    <li key={i} className="text-xs">
                      <span aria-label={`${r.stars} of 5 stars`} className="text-[var(--primary-color)]">
                        {starsText(r.stars)}
                      </span>{' '}
                      <span className="text-[var(--text-color)]">“{r.comment}”</span>
                      <span className="text-[var(--text-color-secondary)]">
                        {' '}
                        — {r.byName}, won “{r.opportunityTitle}”
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Fold>
          </aside>
        </div>
      </main>
    </>
  );
}

function starsText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

/** One party's public score of the other, under the winner banner. */
function PublicRating({
  rating,
  about,
}: {
  rating: { stars: number; comment: string | null; byName: string };
  about: string;
}) {
  return (
    <p>
      <span aria-label={`${rating.stars} of 5 stars`} className="text-[var(--primary-color)]">
        {starsText(rating.stars)}
      </span>{' '}
      <span className="text-[var(--text-color-secondary)]">
        {rating.byName} on {about}
      </span>
      {rating.comment && <span> — “{rating.comment}”</span>}
    </p>
  );
}

/**
 * One cell of the progress board, read against its milestone's date. A
 * milestone with no date shows only claimed or open — which is every cell on
 * every opportunity published before dates existed, and still the right answer
 * for exploratory work.
 */
function BoardCell({
  n,
  state,
  dueUtc,
  build,
}: {
  n: number;
  state: MilestoneState;
  dueUtc: string | null;
  /** The claim's build, on an opportunity that requires one — a second mark under the first. */
  build?: BuildCell;
}) {
  const by = dueUtc ? ` (due ${utcMoment(dueUtc)})` : '';
  const shown = {
    on_time: {
      icon: 'pi-check-circle',
      className: 'text-[var(--primary-color)]',
      label: `milestone ${n} claimed on time${by}`,
    },
    late: {
      icon: 'pi-clock',
      className: 'text-amber-600 dark:text-amber-500',
      label: `milestone ${n} claimed late${by}`,
    },
    claimed: {
      icon: 'pi-check-circle',
      className: 'text-[var(--primary-color)]',
      label: `milestone ${n} claimed`,
    },
    overdue: {
      icon: 'pi-exclamation-circle',
      className: 'text-red-600 dark:text-red-400',
      label: `milestone ${n} overdue${by}`,
    },
  }[state as 'on_time' | 'late' | 'claimed' | 'overdue'];

  if (!shown)
    return (
      <span className="text-[var(--surface-border)]" title={`Not claimed yet${by}`} aria-label={`milestone ${n} open${by}`}>
        ·
      </span>
    );
  return (
    <span className="inline-flex flex-col items-center">
      <i className={`pi ${shown.icon} ${shown.className}`} title={shown.label} aria-label={shown.label} />
      <BuildMark n={n} build={build} />
    </span>
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
