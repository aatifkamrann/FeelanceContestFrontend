'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { Sidebar } from 'primereact/sidebar';
import { TabPanel, TabView } from 'primereact/tabview';
import { Tag } from 'primereact/tag';
import Avatar from '@/components/Avatar';
import HelpIcon from '@/components/HelpIcon';
import ProfileView from '@/components/profile/ProfileView';
import { commitmentLabel, statusLabel, type ApplicationReviewRow } from '@/lib/applications';
import { relativeTime } from '@/lib/opportunities';
import { profileQuery } from '@/lib/profile';

/**
 * The client's review box: every application to compete, those still to
 * decide first. Each row is who applied, the figures at the moment they
 * applied and the portal's evaluation in a line; the whole of it — what
 * they wrote and attached, the evaluation's reasons, and the applicant's
 * profile beside it — opens over the whole screen, as an account
 * does on the Users screen, because the column this box sits in is too
 * narrow to read an application in. Two buttons, in the row and along
 * the foot of the panel: select, which makes the entry, and not
 * selected, which tells them. An answer can be changed while the opportunity
 * is open — a turned-down applicant selected after all, a selection
 * taken back before work arrives — and a selected applicant can be
 * removed from the opportunity from here too, through the same form the
 * board uses. An administrator sees the same box on somebody else's
 * opportunity.
 *
 * Once the opportunity moves to review the box stays, to read: `decisionsOpen`
 * is false, so no answer can change (the API refuses it), an application
 * nobody answered says so, and removal is still offered because review is
 * where a copied entry shows up.
 */
export default function ApplicationsPanel(props: PanelProps) {
  const { rows, error, decisionsOpen = true } = props;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const pending = rows.filter((r) => r.application.status === 'under_review').length;
  return (
    <div className="mt-4 border-t border-[var(--surface-border)] pt-3">
      <p className="text-sm font-medium">
        Applications
        {pending > 0 && decisionsOpen && (
          <span className="ml-2 rounded-full bg-[var(--primary-color)] px-2 py-0.5 text-xs text-[var(--primary-color-text)]">
            {pending} to decide
          </span>
        )}
        <HelpIcon topic="application.decide" label="Deciding an application" />
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
          {decisionsOpen
            ? 'No applications yet. Freelancers apply from the opportunity page; you select who competes.'
            : 'Nobody applied to this opportunity.'}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((r) => {
            const a = r.application;
            const tag = statusTag(r, decisionsOpen);
            return (
              <li key={a.id} className="rounded-lg border border-[var(--surface-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded text-left text-sm font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
                    onClick={() => setSheet({ id: a.id, tab: PROFILE_TAB })}
                    title={`Read ${r.applicant.displayName}'s profile`}
                  >
                    <Avatar name={r.applicant.displayName} url={r.applicant.avatarUrl} size="xs" />
                    {r.applicant.displayName}
                  </button>
                  <Tag value={tag.value} severity={tag.severity} />
                </div>
                {r.applicant.headline && (
                  <p className="mt-0.5 text-xs text-[var(--text-color-secondary)]">{r.applicant.headline}</p>
                )}
                <Figures row={r} className="mt-1.5 text-xs" />
                {a.evaluation.note && <EvaluationNote note={a.evaluation.note} className="mt-1.5" />}
                <div className="mt-1 flex flex-wrap gap-x-1">
                  <Button
                    label="Read the application"
                    icon="pi pi-file"
                    size="small"
                    text
                    className="!px-1"
                    onClick={() => setSheet({ id: a.id, tab: APPLICATION_TAB })}
                  />
                  <Button
                    label="View profile"
                    icon="pi pi-user"
                    size="small"
                    text
                    className="!px-1"
                    onClick={() => setSheet({ id: a.id, tab: PROFILE_TAB })}
                  />
                </div>
                {/* The removal form lives in one place at a time: the panel's
                    while this application is open in it, the row's otherwise. */}
                <Decision {...props} row={r} withRemove={sheet?.id !== a.id} />
              </li>
            );
          })}
        </ul>
      )}
      {error && <Message severity="error" text={error} className="mt-2 w-full" />}
      <ApplicationSheet {...props} sheet={sheet} onSheet={setSheet} />
    </div>
  );
}

type PanelProps = {
  rows: ApplicationReviewRow[];
  busy: boolean;
  error: string | null;
  onDecide: (applicationId: string, decision: 'selected' | 'not_selected', name: string) => void;
  /** The board's removal form, for a selected applicant's entry. */
  renderRemove?: (entryId: string, name: string) => React.ReactNode;
  byAdmin?: boolean;
  /** False once the opportunity has left open: the rows are read, not decided. */
  decisionsOpen?: boolean;
};

const APPLICATION_TAB = 0;
const PROFILE_TAB = 1;

/** Which application the full-screen panel holds, and which of its two tabs is showing. */
type Sheet = { id: string; tab: number };

/**
 * One application over the whole screen, as an account opens on the
 * Users screen, in a column kept to reading width: what they wrote
 * beside who they are, a tab each, with the answer buttons along the
 * foot so the decision is made where the reading was done. Previous and
 * next walk the box's own order — those still to decide first — without
 * closing it.
 */
function ApplicationSheet({ sheet, onSheet, ...props }: PanelProps & { sheet: Sheet | null; onSheet: (s: Sheet | null) => void }) {
  const { rows, error, decisionsOpen = true } = props;
  const index = sheet ? rows.findIndex((r) => r.application.id === sheet.id) : -1;
  const row = index >= 0 ? rows[index] : null;
  const go = (i: number) => sheet && onSheet({ id: rows[i].application.id, tab: sheet.tab });
  const tag = row ? statusTag(row, decisionsOpen) : null;

  return (
    <Sidebar
      visible={row !== null}
      position="right"
      fullScreen
      onHide={() => onSheet(null)}
      ariaCloseLabel="Close"
      header={
        row && (
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={row.applicant.displayName} url={row.applicant.avatarUrl} size="sm" />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{row.applicant.displayName}</span>
                {tag && <Tag value={tag.value} severity={tag.severity} />}
              </span>
              {row.applicant.headline && (
                <span className="block truncate text-sm font-normal text-[var(--text-color-secondary)]">
                  {row.applicant.headline}
                </span>
              )}
            </span>
          </span>
        )
      }
      icons={
        row &&
        rows.length > 1 && (
          <span className="mr-1 flex items-center gap-0.5">
            <Button
              icon="pi pi-chevron-left"
              text
              rounded
              severity="secondary"
              disabled={index === 0}
              onClick={() => go(index - 1)}
              aria-label="Previous application"
              tooltip="Previous application"
              tooltipOptions={{ position: 'bottom' }}
            />
            <span className="px-1 text-xs tabular-nums text-[var(--text-color-secondary)]">
              {index + 1} of {rows.length}
            </span>
            <Button
              icon="pi pi-chevron-right"
              text
              rounded
              severity="secondary"
              disabled={index === rows.length - 1}
              onClick={() => go(index + 1)}
              aria-label="Next application"
              tooltip="Next application"
              tooltipOptions={{ position: 'bottom' }}
            />
          </span>
        )
      }
    >
      {row && sheet && (
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col">
          <TabView
            activeIndex={sheet.tab}
            onTabChange={(e) => onSheet({ id: sheet.id, tab: e.index })}
            className="flex-1"
          >
            <TabPanel header="Application" leftIcon="pi pi-file mr-2">
              <ApplicationBody row={row} />
            </TabPanel>
            <TabPanel header="Profile" leftIcon="pi pi-user mr-2">
              <ApplicantProfile userId={row.applicant.userId} />
            </TabPanel>
          </TabView>
          {/* Pinned to the panel's very foot: -bottom-5 cancels the
              scrolling area's own bottom padding, which would otherwise
              show the text scrolling past underneath. */}
          <div className="sticky -bottom-5 z-10 mt-4 border-t border-[var(--surface-border)] bg-[var(--surface-overlay)] pb-5 pt-2">
            <Decision {...props} row={row} withRemove />
            {error && <Message severity="error" text={error} className="mt-2 w-full" />}
          </div>
        </div>
      )}
    </Sidebar>
  );
}

/** Everything the applicant sent, at a width it can be read at. */
function ApplicationBody({ row }: { row: ApplicationReviewRow }) {
  const a = row.application;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Figures row={row} className="text-sm" />
        {a.evaluation.note && <EvaluationNote note={a.evaluation.note} className="mt-2 text-sm" />}
      </div>
      <Part title="Approach">
        <p className="max-w-prose whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{a.approach}</p>
      </Part>
      {a.summary && (
        <Part title="Professional summary">
          <p className="max-w-prose whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{a.summary}</p>
        </Part>
      )}
      {a.portfolio.length > 0 && (
        <Part title="Past work attached">
          <ul className="grid gap-2 sm:grid-cols-2">
            {a.portfolio.map((p, i) => (
              <li key={i} className="rounded-md border border-[var(--surface-border)] px-3 py-2">
                <span className="font-medium [overflow-wrap:anywhere]">{p.title}</span>
                {p.relevance !== null && (
                  <span className="ml-2 text-xs tabular-nums text-[var(--text-color-secondary)]">
                    {p.relevance}% relevant
                  </span>
                )}
                <span className="block text-sm text-[var(--text-color-secondary)]">
                  {[p.role, p.tech].filter(Boolean).join(' · ') || '—'}
                </span>
                {p.outcome && (
                  <span className="mt-1 block text-sm">
                    <span className="font-medium">Outcome: </span>
                    {p.outcome}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-[var(--text-color-secondary)]">
            The whole of each project, with its pictures and links, is on the Profile tab.
          </p>
        </Part>
      )}
      {a.advantages.length > 0 && (
        <Part title="Claimed advantages">
          <p className="flex flex-wrap gap-1.5">
            {a.advantages.map((label) => (
              <span
                key={label}
                className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-hover)] px-2.5 py-0.5 text-sm"
              >
                {label}
              </span>
            ))}
          </p>
        </Part>
      )}
      {(a.evaluation.strengths.length > 0 || a.evaluation.risks.length > 0) && (
        <Part title={`Evaluation · ${a.evaluation.band}`}>
          <ul className="flex max-w-prose flex-col gap-1.5 text-sm">
            {a.evaluation.strengths.map((l) => (
              <li key={l.id} className="flex gap-2">
                <i className="pi pi-check mt-1 text-green-700 dark:text-green-400" aria-hidden />
                <span>{l.text}</span>
              </li>
            ))}
            {a.evaluation.risks.map((l) => (
              <li key={l.id} className="flex gap-2">
                <i className="pi pi-exclamation-triangle mt-1 text-amber-600 dark:text-amber-400" aria-hidden />
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        </Part>
      )}
      {a.githubUsername && (
        <p className="text-sm text-[var(--text-color-secondary)]">
          Repository invitation goes to <code>{a.githubUsername}</code>.
        </p>
      )}
    </div>
  );
}

/**
 * The applicant's profile as any member reads it at /profile/{id} — the
 * same read, so what shows here is exactly what the portal would show
 * there — with the way to that page for a second screen.
 */
function ApplicantProfile({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery(profileQuery(userId));
  if (isLoading) return <p className="py-10 text-center text-[var(--text-color-secondary)]">Loading the profile…</p>;
  if (!data)
    return (
      <p className="py-10 text-center text-sm text-[var(--text-color-secondary)]">
        This profile could not be read — the account may have been removed.
      </p>
    );
  return (
    <div>
      <p className="mb-3 text-right text-sm">
        <Link href={`/profile/${userId}`} target="_blank" rel="noreferrer">
          Open in a new tab <i className="pi pi-external-link text-[0.65rem]" aria-hidden />
        </Link>
      </p>
      <ProfileView profile={data} />
    </div>
  );
}

/**
 * The answer, or what the answer was: Select and Not selected on an
 * application still to decide, and on one decided the change of mind
 * the opportunity still allows, and removal for a selected entrant.
 */
function Decision({
  row: r,
  busy,
  onDecide,
  renderRemove,
  byAdmin = false,
  decisionsOpen = true,
  withRemove,
}: PanelProps & { row: ApplicationReviewRow; withRemove: boolean }) {
  const a = r.application;
  if (a.status === 'under_review' && decisionsOpen)
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          label="Select"
          icon="pi pi-user-plus"
          size="small"
          loading={busy}
          disabled={busy}
          onClick={() => onDecide(a.id, 'selected', r.applicant.displayName)}
        />
        <Button
          label="Not selected"
          icon="pi pi-times"
          size="small"
          outlined
          severity="secondary"
          disabled={busy}
          onClick={() => onDecide(a.id, 'not_selected', r.applicant.displayName)}
        />
      </div>
    );
  return (
    <div className="mt-2">
      <p className="text-xs text-[var(--text-color-secondary)]">
        {a.status === 'selected'
          ? 'Selected'
          : a.status === 'removed'
            ? 'Removed from the opportunity'
            : a.status === 'withdrawn'
              ? 'Withdrew from the opportunity'
              : a.status === 'under_review'
                ? 'Not decided before the opportunity closed'
                : 'Turned down'}
        {a.decidedAtUtc && ` ${relativeTime(a.decidedAtUtc)}`}
        {byAdmin &&
          a.status !== 'withdrawn' &&
          a.status !== 'under_review' &&
          ' — decisions here are the client’s or an administrator’s'}
      </p>
      {a.status === 'withdrawn' && r.withdrawnReason && (
        <blockquote
          className="m-0 mt-1 max-w-prose whitespace-pre-line border-l-2 border-[var(--surface-border)] pl-2 text-sm [overflow-wrap:anywhere]"
          aria-label="Their reason for withdrawing"
        >
          {r.withdrawnReason}
        </blockquote>
      )}
      {/* The answer changed: a no becomes a yes, a yes is taken
          back while no work has arrived. A removal or a withdrawal is final. */}
      {a.status === 'selected' && decisionsOpen && (
        <Button
          label="Take back selection"
          icon="pi pi-undo"
          size="small"
          text
          severity="secondary"
          className="mt-1"
          disabled={busy}
          onClick={() => onDecide(a.id, 'not_selected', r.applicant.displayName)}
        />
      )}
      {a.status === 'not_selected' && decisionsOpen && (
        <Button
          label="Select after all"
          icon="pi pi-user-plus"
          size="small"
          text
          className="mt-1"
          disabled={busy}
          onClick={() => onDecide(a.id, 'selected', r.applicant.displayName)}
        />
      )}
      {withRemove && a.status === 'selected' && a.entryId && renderRemove?.(a.entryId, r.applicant.displayName)}
    </div>
  );
}

function statusTag(
  r: ApplicationReviewRow,
  decisionsOpen: boolean,
): { value: string; severity: 'success' | 'secondary' | 'danger' | 'warning' | 'info' } {
  const s = r.application.status;
  // Nobody will review it now: the opportunity closed first.
  if (s === 'under_review' && !decisionsOpen) return { value: 'Not decided', severity: 'secondary' };
  return {
    value: statusLabel(s),
    severity:
      s === 'selected'
        ? 'success'
        : s === 'not_selected'
          ? 'secondary'
          : s === 'removed'
            ? 'danger'
            : s === 'withdrawn'
              ? 'warning'
              : 'info',
  };
}

/** The figures at the moment they applied, in one line. */
function Figures({ row: { application: a }, className }: { row: ApplicationReviewRow; className?: string }) {
  return (
    <p className={`text-[var(--text-color-secondary)] ${className ?? ''}`}>
      <span className="font-semibold tabular-nums text-[var(--text-color)]">{a.match}%</span> match · merit{' '}
      {a.meritScore} · {a.hoursPerWeek} hrs/week ({commitmentLabel(a.commitment).toLowerCase()}) ·{' '}
      {a.portfolio.length} {a.portfolio.length === 1 ? 'project' : 'projects'} · applied{' '}
      {relativeTime(a.submittedAtUtc)}
    </p>
  );
}

function EvaluationNote({ note, className }: { note: string; className?: string }) {
  return (
    <p className={`rounded-md bg-[var(--surface-hover)] px-2 py-1.5 text-xs ${className ?? ''}`}>
      <i className="pi pi-sparkles mr-1 text-[var(--primary-color)]" aria-hidden />
      {note}
    </p>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
