'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import SiteHeader from '@/components/SiteHeader';
import { DashboardSkeleton, Panel, RankTable } from '@/components/dashboard/kit';
import {
  clearSlowQueries,
  operationsQuery,
  replayDelivery,
  restartHandover,
  retryProvision,
  type AdminDeliveryRow,
  type AdminHandoverRow,
  type AdminProvisionRow,
  type AdminSlowQueries,
  type AdminSlowQueryRow,
} from '@/lib/admin';
import { formatAward, meQuery, relativeTime } from '@/lib/opportunities';

type View = 'cards' | 'list';
const VIEW_OPTIONS = [
  { icon: 'pi pi-th-large', value: 'cards', label: 'Cards' },
  { icon: 'pi pi-list', value: 'list', label: 'List' },
];
/** The console's layout on this device, apart from every other page's. */
const VIEW_KEY = 'wp.operations.view';

/**
 * The stretched link a card opens its opportunity by: the title's link is laid
 * over the whole card, and the one button inside sits above it. A link
 * cannot hold a button, so the card itself cannot be the link.
 */
const STRETCHED =
  "text-[var(--text-color)] no-underline outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] group-hover:text-[var(--primary-color)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--primary-color)]";
const CARD = 'flex w-full flex-col rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-4';
const CARD_GRID = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';

/**
 * The operations console. The dashboard says what is stuck; this screen is
 * where the operator unsticks it — retry a failed repository, restart a
 * handover, replay a webhook delivery. Every action restarts machinery that
 * already exists, so each carries help explaining exactly what re-runs and
 * what deliberately does not. Below them, the database queries that ran
 * slower than the API's threshold, the costliest in all first: the evidence
 * a query is worth tuning.
 *
 * One search narrows all four panels as it is typed, and the panels show
 * as tables or as cards. A repository or handover card opens its opportunity
 * from anywhere on it; a delivery has no page of its own, and its only
 * action re-runs a webhook, so on its card only the button acts.
 */
export default function OperationsPage() {
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    ...operationsQuery,
    enabled: me?.role === 'admin',
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('list');

  // The layout is a per-device preference, read after mount so the server
  // render and the first client render agree.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'cards') setView(saved);
    } catch {
      /* private mode, or storage blocked */
    }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* fine — it just will not be remembered */
    }
  };

  const act = async (id: string, run: () => Promise<unknown>, doneMessage: string) => {
    setBusyId(id);
    setError(null);
    setDone(null);
    try {
      await run();
      setDone(doneMessage);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusyId(null);
    }
  };

  // Every word typed must appear somewhere in what a row is known by, in
  // any order, and part of a word counts. Everything is on the page, so
  // this is read on every keystroke with no request behind it.
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const matches = (...fields: (string | null | undefined)[]) => {
    if (!searching) return true;
    const known = fields.filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => known.includes(w));
  };
  const provisioning = (data?.provisioning ?? []).filter((p) =>
    matches(p.freelancer, p.githubUsername, p.opportunityTitle, p.status, p.note),
  );
  const handovers = (data?.handovers ?? []).filter((h) =>
    matches(h.opportunityTitle, h.winner, h.client, h.clientGithubLogin, h.repoFullName, handoverWord(h), h.note),
  );
  const deliveries = (data?.deliveries ?? []).filter((d) =>
    matches(d.event, d.action, d.repoFullName, d.handledNote, d.deliveryId),
  );
  const slow = data?.slowQueries;
  const slowQueries = (slow?.items ?? []).filter((s) => matches(s.sql, sourceWord(s.source), s.lastDuring, sqlHeadline(s.sql)));
  const noneMatch = `Nothing here matches “${q.trim()}”.`;
  // While searching, each panel's heading says how much of it is left.
  const tally = (shown: number, total: number) =>
    searching ? (
      <span className="text-xs tabular-nums text-[var(--text-color-secondary)]">
        {shown} of {total}
      </span>
    ) : undefined;

  const retryAction = (p: AdminProvisionRow) =>
    p.canRetry ? (
      <Button
        label="Retry"
        icon="pi pi-replay"
        size="small"
        outlined
        loading={busyId === p.id}
        disabled={busyId !== null}
        onClick={() =>
          void act(p.id, () => retryProvision(p.id),
            `Provisioning for @${p.githubUsername} is queued again — the entrant is emailed when it succeeds.`)
        }
      />
    ) : (
      <span className="text-xs text-[var(--text-color-secondary)]">
        {p.status === 'failed' ? 'opportunity closed' : 'retrying itself'}
      </span>
    );

  const restartAction = (h: AdminHandoverRow) =>
    h.canRestart ? (
      <Button
        label="Restart"
        icon="pi pi-sync"
        size="small"
        outlined
        loading={busyId === h.id}
        disabled={busyId !== null}
        onClick={() =>
          void act(h.id, () => restartHandover(h.id),
            `Transfer restarted — it goes to GitHub on the next sweep, and ${h.client} is emailed to accept it once it does.`)
        }
      />
    ) : (
      <span className="text-xs text-[var(--text-color-secondary)]">
        {h.handover === 'verified' ? 'done' : 'awaiting payment'}
      </span>
    );

  const replayAction = (d: AdminDeliveryRow) => (
    <Button
      label="Replay"
      icon="pi pi-play"
      size="small"
      text
      loading={busyId === d.id}
      disabled={busyId !== null}
      onClick={() => void act(d.id, () => replayDelivery(d.id), 'Delivery replayed — the note shows what it did.')}
    />
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Operations</h1>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Stuck machinery and the buttons that restart it — repositories, handovers, deliveries — and the slow queries.
            </p>
          </div>
          {data && (
            <div className="flex items-center gap-2">
              <SelectButton
                value={view}
                onChange={(e) => e.value && chooseView(e.value as View)}
                options={VIEW_OPTIONS}
                optionLabel="label"
                itemTemplate={(o: (typeof VIEW_OPTIONS)[number]) => (
                  <i className={o.icon} aria-hidden title={o.label} />
                )}
                allowEmpty={false}
                aria-label="Layout"
              />
              <Button
                label="Refresh"
                icon="pi pi-refresh"
                size="small"
                text
                loading={isFetching}
                onClick={() => void refetch()}
              />
            </div>
          )}
        </div>

        {error && <Message severity="error" text={error} className="mb-4 w-full justify-start" />}
        {done && !error && <Message severity="success" text={done} className="mb-4 w-full justify-start" />}

        {meLoading || (me?.role === 'admin' && isLoading) ? (
          <DashboardSkeleton />
        ) : me?.role !== 'admin' ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">This screen is for portal administrators</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              {me ? 'Your account does not have the admin role.' : 'Sign in with the admin account to continue.'}
            </p>
            {!me && (
              <Link href="/login?next=/admin/operations" className="no-underline">
                <Button label="Sign in" size="small" outlined className="mt-4" />
              </Link>
            )}
          </div>
        ) : isError || !data ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <p className="font-medium">The console could not load</p>
            <Button label="Try again" size="small" outlined className="mt-4" onClick={() => void refetch()} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* No button: all three panels narrow as the box is typed in. */}
            <form role="search" onSubmit={(e) => e.preventDefault()} className="flex items-center">
              <span className="relative flex-1">
                <i
                  className="pi pi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-color-secondary)]"
                  aria-hidden
                />
                <InputText
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search entrants, opportunities, repositories, events, queries"
                  className={q ? 'w-full !pl-10 !pr-10' : 'w-full !pl-10'}
                  aria-label="Search operations"
                  enterKeyHint="search"
                />
                {q && (
                  <Button
                    type="button"
                    icon="pi pi-times"
                    aria-label="Clear search"
                    text
                    rounded
                    size="small"
                    className="wp-search-clear"
                    onClick={() => setQ('')}
                  />
                )}
              </span>
            </form>
            <p className="sr-only" aria-live="polite">
              {searching
                ? `${many(provisioning.length, 'repository', 'repositories')}, ${many(handovers.length, 'handover', 'handovers')}, ${many(deliveries.length, 'delivery', 'deliveries')} and ${many(slowQueries.length, 'slow query', 'slow queries')} match`
                : ''}
            </p>

            <Panel
              id="repositories"
              title="Repositories"
              help="dashboard.repoHealth"
              action={tally(provisioning.length, data.provisioning.length)}
            >
              {view === 'cards' ? (
                <Cards
                  empty={searching ? noneMatch : 'Nothing failing — every active entry has its repository, or is being retried quietly.'}
                  items={provisioning.map((p) => (
                    <li key={p.id} className="flex">
                      <article className={`group relative transition-colors hover:border-[var(--primary-color)] ${CARD}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 text-sm [overflow-wrap:anywhere]">
                            <span className="font-semibold">{p.freelancer}</span>
                            <span className="ml-1 text-xs text-[var(--text-color-secondary)]">@{p.githubUsername}</span>
                          </p>
                          <ProvisionTag p={p} />
                        </div>
                        <h3 className="mt-2 font-semibold leading-snug">
                          <Link href={`/opportunities/${p.opportunitySlug}`} className={STRETCHED}>
                            {p.opportunityTitle}
                          </Link>
                        </h3>
                        <p className="mt-1 text-xs text-[var(--text-color-secondary)]">
                          {p.attempts} attempt{p.attempts === 1 ? '' : 's'}
                          {p.lastAttemptAtUtc && ` · last ${relativeTime(p.lastAttemptAtUtc)}`}
                        </p>
                        {p.note && (
                          <p className="mt-2 line-clamp-3 text-xs text-[var(--text-color-secondary)]" title={p.note}>
                            {p.note}
                          </p>
                        )}
                        <div className="relative z-10 mt-auto flex justify-end pt-3">{retryAction(p)}</div>
                      </article>
                    </li>
                  ))}
                />
              ) : (
                <RankTable
                  empty={searching ? noneMatch : 'Nothing failing — every active entry has its repository, or is being retried quietly.'}
                  columns={[
                    { key: 'who', label: 'Entrant' },
                    { key: 'opportunity', label: 'Opportunity' },
                    { key: 'status', label: 'Status' },
                    { key: 'attempts', label: 'Attempts', align: 'right' },
                    { key: 'note', label: 'Last error' },
                    { key: 'action', label: 'Retry', help: 'admin.retryProvision' },
                  ]}
                  rows={provisioning.map((p) => ({
                    who: (
                      <span className="whitespace-nowrap">
                        {p.freelancer}
                        <span className="ml-1 text-xs text-[var(--text-color-secondary)]">@{p.githubUsername}</span>
                      </span>
                    ),
                    opportunity: (
                      <Link href={`/opportunities/${p.opportunitySlug}`} className="whitespace-nowrap text-[var(--text-color)] underline-offset-2">
                        {p.opportunityTitle}
                      </Link>
                    ),
                    status: <ProvisionTag p={p} />,
                    attempts: p.attempts,
                    note: (
                      <span
                        className="block max-w-[22rem] truncate text-xs text-[var(--text-color-secondary)]"
                        title={p.note ?? undefined}
                      >
                        {p.note ?? '—'}
                      </span>
                    ),
                    action: retryAction(p),
                  }))}
                />
              )}
            </Panel>

            <Panel
              id="handovers"
              title="Award handovers"
              help="admin.handovers"
              action={tally(handovers.length, data.handovers.length)}
            >
              {view === 'cards' ? (
                <Cards
                  empty={searching ? noneMatch : 'No awards yet.'}
                  items={handovers.map((h) => (
                    <li key={h.id} className="flex">
                      <article className={`group relative transition-colors hover:border-[var(--primary-color)] ${CARD}`}>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 font-semibold leading-snug">
                            <Link href={`/opportunities/${h.opportunitySlug}`} className={STRETCHED}>
                              {h.opportunityTitle}
                            </Link>
                          </h3>
                          <HandoverTag h={h} />
                        </div>
                        <p className="mt-1 text-sm">
                          {h.winner}
                          <i className="pi pi-arrow-right mx-1 text-xs text-[var(--text-color-secondary)]" aria-hidden />
                          {h.client}
                        </p>
                        {h.repoFullName && (
                          <p className="text-xs text-[var(--text-color-secondary)] [overflow-wrap:anywhere]">{h.repoFullName}</p>
                        )}
                        <p className="mt-2 text-lg font-bold tabular-nums text-[var(--primary-color)]">
                          {formatAward(h.amount, h.currency)}
                        </p>
                        <div className="mt-2">
                          <Trail h={h} />
                        </div>
                        <div className="relative z-10 mt-auto flex justify-end pt-3">{restartAction(h)}</div>
                      </article>
                    </li>
                  ))}
                />
              ) : (
                <RankTable
                  empty={searching ? noneMatch : 'No awards yet.'}
                  columns={[
                    { key: 'opportunity', label: 'Opportunity' },
                    { key: 'deal', label: 'Winner → client' },
                    { key: 'amount', label: 'Award', align: 'right' },
                    { key: 'trail', label: 'Paper trail' },
                    { key: 'status', label: 'Handover' },
                    { key: 'action', label: 'Restart', help: 'admin.restartHandover' },
                  ]}
                  rows={handovers.map((h) => ({
                    opportunity: (
                      <Link href={`/opportunities/${h.opportunitySlug}`} className="whitespace-nowrap text-[var(--text-color)] underline-offset-2">
                        {h.opportunityTitle}
                      </Link>
                    ),
                    deal: (
                      <span className="whitespace-nowrap">
                        {h.winner}
                        <i className="pi pi-arrow-right mx-1 text-xs text-[var(--text-color-secondary)]" aria-hidden />
                        {h.client}
                        {h.repoFullName && (
                          <span className="ml-1 block text-xs text-[var(--text-color-secondary)]">
                            {h.repoFullName}
                          </span>
                        )}
                      </span>
                    ),
                    amount: formatAward(h.amount, h.currency),
                    trail: <Trail h={h} />,
                    status: <HandoverTag h={h} />,
                    action: restartAction(h),
                  }))}
                />
              )}
            </Panel>

            <Panel
              id="deliveries"
              title="Webhook deliveries"
              help="dashboard.webhooks"
              action={tally(deliveries.length, data.deliveries.length)}
            >
              {view === 'cards' ? (
                <Cards
                  empty={
                    searching
                      ? noneMatch
                      : 'No deliveries recorded yet — GitHub has not reached this portal. Check the webhook URL and secret under Settings, GitHub.'
                  }
                  items={deliveries.map((d) => (
                    // Not a link: a delivery has no page to open, and a stray
                    // click must never replay one.
                    <li key={d.id} className="flex">
                      <article className={CARD}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">
                            {d.event}
                            {d.action ? `.${d.action}` : ''}
                          </p>
                          <span className="whitespace-nowrap text-xs text-[var(--text-color-secondary)]">
                            {relativeTime(d.receivedAtUtc)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm [overflow-wrap:anywhere]">{d.repoFullName ?? (d.source === 'identity' ? 'identity provider' : '—')}</p>
                        <p className="mt-2 text-xs text-[var(--text-color-secondary)]">{d.handledNote ?? '—'}</p>
                        <div className="mt-auto flex justify-end pt-3">{replayAction(d)}</div>
                      </article>
                    </li>
                  ))}
                />
              ) : (
                <RankTable
                  empty={
                    searching
                      ? noneMatch
                      : 'No deliveries recorded yet — GitHub has not reached this portal. Check the webhook URL and secret under Settings, GitHub.'
                  }
                  columns={[
                    { key: 'received', label: 'Received' },
                    { key: 'event', label: 'Event' },
                    { key: 'repo', label: 'Repository' },
                    { key: 'note', label: 'Handled' },
                    { key: 'action', label: 'Replay', help: 'admin.replayDelivery' },
                  ]}
                  rows={deliveries.map((d) => ({
                    received: (
                      <span className="whitespace-nowrap text-xs text-[var(--text-color-secondary)]">
                        {relativeTime(d.receivedAtUtc)}
                      </span>
                    ),
                    event: (
                      <span className="font-mono text-xs">
                        {d.event}
                        {d.action ? `.${d.action}` : ''}
                      </span>
                    ),
                    repo: (
                      <span className="whitespace-nowrap text-xs">{d.repoFullName ? d.repoFullName.split('/')[1] : d.source === 'identity' ? 'identity provider' : '—'}</span>
                    ),
                    note: (
                      <span
                        className="block max-w-[24rem] truncate text-xs text-[var(--text-color-secondary)]"
                        title={d.handledNote ?? undefined}
                      >
                        {d.handledNote ?? '—'}
                      </span>
                    ),
                    action: replayAction(d),
                  }))}
                />
              )}
            </Panel>

            {slow && (
              <Panel
                id="slow-queries"
                title="Slow queries"
                help="admin.slowQueries"
                action={
                  <span className="flex items-center gap-2">
                    {tally(slowQueries.length, slow.items.length)}
                    {slow.items.length > 0 && (
                      <Button
                        label="Clear"
                        icon="pi pi-eraser"
                        size="small"
                        text
                        loading={busyId === 'slow-queries'}
                        disabled={busyId !== null}
                        onClick={() =>
                          void act('slow-queries', clearSlowQueries,
                            'The slow-query tally starts again from now. The API log keeps the lines already written.')
                        }
                      />
                    )}
                  </span>
                }
              >
                {/* With nothing to show, the empty line says all of this. */}
                {slow.thresholdMs !== null && slow.items.length > 0 && (
                  <p className="mb-3 text-xs text-[var(--text-color-secondary)]">
                    Commands that took {slow.thresholdMs} ms or longer, counted since {whenLabel(slow.sinceUtc)}.
                    {!slow.includesBackground && ' Background work is left out.'} The costliest in all come first.
                    The threshold{slow.includesBackground ? ' is' : ' and the switch for background work are'} under{' '}
                    <Link href="/admin/settings" className="text-[var(--primary-color)] underline-offset-2">
                      Settings
                    </Link>{' '}
                    → Limits &amp; maintenance.
                  </p>
                )}
                {view === 'cards' ? (
                  <Cards
                    empty={slowEmpty(slow, searching ? noneMatch : null)}
                    items={slowQueries.map((s) => (
                      <li key={s.sql} className="flex">
                        <article className={CARD}>
                          <div className="flex items-start justify-between gap-2">
                            <QueryName s={s} />
                            <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--text-color-secondary)]">
                              {many(s.count, 'run', 'runs')}
                            </span>
                          </div>
                          <p className="mt-2 text-lg font-bold tabular-nums text-[var(--primary-color)]">
                            {duration(s.totalMs)}
                            <span className="ml-1 text-xs font-normal text-[var(--text-color-secondary)]">in all</span>
                          </p>
                          <p className="text-xs tabular-nums text-[var(--text-color-secondary)]">
                            average {duration(s.averageMs)} · slowest {duration(s.maxMs)}
                          </p>
                          <p className="mt-2 text-xs text-[var(--text-color-secondary)]">Last run</p>
                          <LastRun s={s} />
                          <div className="mt-auto pt-3">
                            <SqlText sql={s.sql} />
                          </div>
                        </article>
                      </li>
                    ))}
                  />
                ) : (
                  <RankTable
                    empty={slowEmpty(slow, searching ? noneMatch : null)}
                    columns={[
                      { key: 'query', label: 'Query' },
                      { key: 'runs', label: 'Runs', align: 'right' },
                      { key: 'total', label: 'Total', align: 'right' },
                      { key: 'average', label: 'Average', align: 'right' },
                      { key: 'slowest', label: 'Slowest', align: 'right' },
                      { key: 'last', label: 'Last run' },
                    ]}
                    rows={slowQueries.map((s) => ({
                      query: (
                        <span className="block min-w-[14rem] max-w-[28rem]">
                          <QueryName s={s} />
                          <SqlText sql={s.sql} />
                        </span>
                      ),
                      runs: <span className="tabular-nums">{s.count}</span>,
                      total: <span className="whitespace-nowrap font-semibold tabular-nums">{duration(s.totalMs)}</span>,
                      average: <span className="whitespace-nowrap tabular-nums">{duration(s.averageMs)}</span>,
                      slowest: <span className="whitespace-nowrap tabular-nums">{duration(s.maxMs)}</span>,
                      last: (
                        <span className="block w-[11rem]">
                          <LastRun s={s} />
                        </span>
                      ),
                    }))}
                  />
                )}
              </Panel>
            )}
          </div>
        )}
      </main>
    </>
  );
}

/** "840 ms", "2.4 s", "31 s". */
function duration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
}

/** A moment as this browser writes dates and times. */
function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * What a query does and to which table, from its SQL: "SELECT from
 * Opportunities", "UPDATE EmailMessages". The table is the one named at the
 * statement's own level — EF puts counts and lookups in subqueries inside
 * the column list, and their tables are not what the statement is about.
 * With no table at that level (SELECT EXISTS (…)), the first one anywhere.
 * Both dialects' quoting are read, and schema-qualified names kept whole.
 */
function sqlHeadline(sql: string): string {
  const verb = (sql.trim().match(/^\w+/)?.[0] ?? 'SQL').toUpperCase();
  // A stored procedure call names the procedure, not a table.
  if (verb === 'EXEC' || verb === 'EXECUTE') {
    const proc = sql.trim().match(new RegExp(String.raw`^\w+\s+(${IDENT}(?:\.${IDENT})?)`, 'i'))?.[1];
    return proc ? `EXEC ${proc.replace(/["[\]]/g, '')}` : verb;
  }
  const name = mainTable(sql);
  if (!name) return verb;
  return verb === 'SELECT' || verb === 'DELETE' ? `${verb} from ${name}` : `${verb} ${name}`;
}

const IDENT = String.raw`(?:"[^"]+"|\[[^\]]+\]|\w+)`;
const SQL_TOKENS = new RegExp(String.raw`(\()|(\))|'(?:[^']|'')*'|\b(?:FROM|UPDATE|INTO)\s+(${IDENT}(?:\.${IDENT})?)`, 'gi');

function mainTable(sql: string): string | null {
  let depth = 0;
  let first: string | null = null;
  for (const m of sql.matchAll(SQL_TOKENS)) {
    if (m[1]) depth++;
    else if (m[2]) depth--;
    else if (m[3]) {
      const name = m[3].replace(/["[\]]/g, '');
      if (depth === 0) return name;
      first ??= name;
    }
  }
  return first;
}

/** What issued a command, in words: EF's names are for the log. */
const SOURCE_WORDS: Record<string, string> = {
  Query: 'query',
  LinqQuery: 'query',
  FromSqlQuery: 'hand-written query',
  SaveChanges: 'save',
  BulkUpdate: 'bulk update',
  BulkDelete: 'bulk delete',
  ExecuteUpdate: 'bulk update',
  ExecuteDelete: 'bulk delete',
  ValueGenerator: 'id generator',
  ExecuteSqlRaw: 'hand-written SQL',
  ExecuteSqlInterpolated: 'hand-written SQL',
  ExecuteSql: 'hand-written SQL',
  Migrations: 'migration',
  Dapper: 'stored procedure',
};
const sourceWord = (source: string) => SOURCE_WORDS[source] ?? source.toLowerCase();

/** The panel's empty line: off, nothing slow yet, or nothing matching the search. */
function slowEmpty(slow: AdminSlowQueries, noneMatch: string | null): string {
  if (slow.thresholdMs === null) return 'The slow-query log is off: its threshold is 0 under Settings → Limits & maintenance.';
  if (noneMatch) return noneMatch;
  const since = whenLabel(slow.sinceUtc);
  return slow.includesBackground
    ? `Nothing has taken ${slow.thresholdMs} ms or longer since ${since}.`
    : `Nothing a request ran has taken ${slow.thresholdMs} ms or longer since ${since}. Background work is left out.`;
}

/** A query's name, and what issued it. */
function QueryName({ s }: { s: AdminSlowQueryRow }) {
  return (
    <span className="block min-w-0">
      <span className="font-mono text-xs [overflow-wrap:anywhere]">{sqlHeadline(s.sql)}</span>
      <span className="ml-2 whitespace-nowrap text-xs text-[var(--text-color-secondary)]">{sourceWord(s.source)}</span>
    </span>
  );
}

/** The last time it ran: how long, how many rows and when, then what for. */
function LastRun({ s }: { s: AdminSlowQueryRow }) {
  return (
    <span className="block min-w-0 text-xs text-[var(--text-color-secondary)]">
      <span className="block whitespace-nowrap tabular-nums">
        <span className="text-[var(--text-color)]">{duration(s.lastMs)}</span>
        {s.lastRows !== null && ` · ${many(s.lastRows, 'row', 'rows')}`}
        {' · '}
        <span title={new Date(s.lastAtUtc).toLocaleString()}>{relativeTime(s.lastAtUtc)}</span>
      </span>
      <span className="block truncate font-mono" title={s.lastDuring}>
        {s.lastDuring}
      </span>
    </span>
  );
}

/** The whole statement, folded until asked for; placeholders, never values. */
function SqlText({ sql }: { sql: string }) {
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer select-none text-[var(--primary-color)]">SQL</summary>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--surface-border)] bg-[var(--surface-ground)] p-2 font-mono text-[0.7rem] leading-snug text-[var(--text-color)]">
        {sql}
      </pre>
    </details>
  );
}

/** "1 repository", "3 repositories" — nouns whose plural is not an s. */
function many(n: number, one: string, several: string): string {
  return `${n} ${n === 1 ? one : several}`;
}

/** A panel's rows as cards, or the panel's own empty line. */
function Cards({ items, empty }: { items: React.ReactNode[]; empty: string }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-color-secondary)]">{empty}</p>;
  }
  return (
    <ul role="list" className={CARD_GRID}>
      {items}
    </ul>
  );
}

function ProvisionTag({ p }: { p: AdminProvisionRow }) {
  return (
    <Tag value={p.status} severity={p.status === 'failed' ? 'danger' : p.status === 'pending' ? 'warning' : 'success'} />
  );
}

/** The four stamps in order — what happened reads left to right, gaps included. */
function Trail({ h }: { h: AdminHandoverRow }) {
  const stamps: { label: string; at: string | null }[] = [
    { label: 'announced', at: h.announcedAtUtc },
    { label: 'paid', at: h.paidAtUtc },
    { label: 'transfer requested', at: h.transferRequestedAtUtc },
    { label: 'verified', at: h.handoverVerifiedAtUtc },
  ];
  return (
    // A floor on the width: with the name columns on one line each, the
    // table would otherwise squeeze this one to a word per line.
    <span className="flex min-w-[16rem] flex-wrap gap-x-2 text-xs">
      {stamps.map((s) => (
        <span
          key={s.label}
          className={`whitespace-nowrap ${s.at ? 'text-[var(--text-color)]' : 'text-[var(--text-color-secondary)] opacity-60'}`}
          title={s.at ?? undefined}
        >
          <i
            className={`pi ${s.at ? 'pi-check-circle' : 'pi-circle'} mr-0.5 text-[0.65rem]`}
            aria-hidden
          />
          {s.label}
          {s.at && <span className="text-[var(--text-color-secondary)]"> {relativeTime(s.at)}</span>}
        </span>
      ))}
      {h.note && (
        <span className="block w-full text-[var(--text-color-secondary)]" title={h.note}>
          {h.note}
        </span>
      )}
    </span>
  );
}

/** The word the handover tag shows, so a search for it finds the row. */
function handoverWord(h: AdminHandoverRow): string {
  if (!h.paidAtUtc) return 'awaiting payment';
  if (h.handover === 'verified') return 'verified';
  if (h.handover === 'requested') return 'requested';
  return 'not started';
}

function HandoverTag({ h }: { h: AdminHandoverRow }) {
  const word = handoverWord(h);
  const severity = word === 'awaiting payment' ? 'info' : word === 'verified' ? 'success' : word === 'requested' ? 'warning' : 'danger';
  return <Tag value={word} severity={severity} />;
}
