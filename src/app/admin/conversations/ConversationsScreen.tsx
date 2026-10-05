'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Tag } from 'primereact/tag';
import Avatar from '@/components/Avatar';
import HelpIcon from '@/components/HelpIcon';
import SiteHeader from '@/components/SiteHeader';
import {
  adminChatKeys,
  fetchAdminConversation,
  fetchAdminConversations,
  resolveReports,
  type AdminConversation,
  type AdminConversations,
  type AdminConversationPage,
  type AdminLine,
  type AdminReport,
} from '@/lib/chat';
import { meQuery, relativeTime } from '@/lib/opportunities';

/**
 * Admin → Conversations: every conversation between a client and an
 * entrant, for moderation. The list says who, about what, how many lines
 * and when — never what was said; opening one reads it, and every page
 * opened is a row in the activity log. Reading only: nothing is marked
 * read, nobody is told, nothing can be written — the one thing an
 * administrator changes here is a member's report, marked reviewed.
 * `?member=<id>` (from Users) narrows to one member, `?reported=1` (from the
 * dashboard) to conversations with a report still open, `?thread=<entry>`
 * (from the report email) opens one.
 */
export default function ConversationsScreen() {
  const router = useRouter();
  const me = useQuery(meQuery);
  const isAdmin = me.data?.role === 'admin';

  useEffect(() => {
    if (me.data === null) router.replace('/login?next=/admin/conversations');
  }, [me.data, router]);

  if (me.isLoading || me.data === null) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <i className="pi pi-spinner pi-spin text-3xl" />
      </main>
    );
  }
  if (!isAdmin) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">Conversations are read by portal administrators</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Your own conversations are on the Messages page.
            </p>
            <Link href="/messages" className="no-underline">
              <Button label="Messages" className="mt-4" />
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="p-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            Conversations
            <HelpIcon topic="admin.conversations" label="Conversations" />
          </h1>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            What clients and entrants say to each other, for moderation. Read-only: opening one marks nothing read
            and tells nobody, and every opening is recorded in Activity.
          </p>
          <Suspense fallback={null}>
            <Panes />
          </Suspense>
        </div>
      </main>
    </>
  );
}

function Panes() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get('thread');
  const member = params.get('member');
  const reported = params.get('reported') === '1';

  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  // The search narrows as it is typed, a third of a second behind.
  useEffect(() => {
    const t = setTimeout(() => setNeedle(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const go = (next: { thread?: string | null; member?: string | null; reported?: boolean }) => {
    const p = new URLSearchParams();
    const m = next.member === undefined ? member : next.member;
    const t = next.thread === undefined ? selected : next.thread;
    const r = next.reported === undefined ? reported : next.reported;
    if (m) p.set('member', m);
    if (r) p.set('reported', '1');
    if (t) p.set('thread', t);
    const query = p.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const list = useInfiniteQuery({
    queryKey: adminChatKeys.list(needle, member, reported),
    queryFn: ({ pageParam }) => fetchAdminConversations(needle, member, reported, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: AdminConversations) => last.nextCursor,
    staleTime: 30_000,
  });
  const rows = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.items), [list.data]);

  // Whose conversations these are, when Users sent us here: the member's
  // name off any row they are in.
  const memberName = useMemo(() => {
    if (!member) return null;
    for (const r of rows) {
      if (r.client.id === member) return r.client.displayName;
      if (r.freelancer.id === member) return r.freelancer.displayName;
    }
    return null;
  }, [member, rows]);

  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <IconField iconPosition="left" className="w-full sm:w-80">
          <InputIcon className="pi pi-search" />
          <InputText
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Opportunity, name or email"
            aria-label="Search conversations"
            className="w-full"
          />
        </IconField>
        <Button
          label="Reported"
          icon={reported ? 'pi pi-flag-fill' : 'pi pi-flag'}
          size="small"
          severity="danger"
          outlined={!reported}
          aria-pressed={reported}
          title={reported ? 'Show every conversation' : 'Only conversations with a report still open'}
          onClick={() => go({ reported: !reported })}
        />
        {member && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--surface-border)] bg-[var(--surface-card)] py-1 pl-3 pr-1 text-sm">
            {memberName ? `${memberName}'s conversations` : "One member's conversations"}
            <Button
              icon="pi pi-times"
              text
              rounded
              size="small"
              aria-label="Show every member's conversations"
              onClick={() => go({ member: null })}
            />
          </span>
        )}
      </div>

      <div
        className="grid overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] md:grid-cols-[22rem_1fr]"
        style={{ height: 'min(46rem, calc(100vh - 15rem))', minHeight: '28rem' }}
      >
        {/* The list: on a phone, only while nothing is open. */}
        <aside
          className={`min-h-0 flex-col overflow-y-auto border-[var(--surface-border)] md:flex md:border-r ${
            selected ? 'hidden' : 'flex'
          }`}
          aria-label="Conversations"
        >
          {list.isError ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--text-color-secondary)]">
              {(list.error as Error).message}
            </p>
          ) : !list.data ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--text-color-secondary)]">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--text-color-secondary)]">
              {reported && !needle && !member
                ? 'No report is waiting.'
                : needle || member || reported
                  ? 'No conversation matches.'
                  : 'Nobody has said anything yet.'}
            </p>
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col p-0">
                {rows.map((r) => (
                  <Row key={r.entryId} row={r} active={r.entryId === selected} onSelect={() => go({ thread: r.entryId })} />
                ))}
              </ul>
              {list.hasNextPage && (
                <div className="py-2 text-center">
                  <Button
                    label="More conversations"
                    text
                    size="small"
                    loading={list.isFetchingNextPage}
                    onClick={() => list.fetchNextPage()}
                  />
                </div>
              )}
            </>
          )}
        </aside>

        {/* The open conversation: on a phone, only while one is. */}
        <section className={`min-h-0 flex-col md:flex ${selected ? 'flex' : 'hidden'}`} aria-label="Conversation">
          {selected ? (
            <Reader key={selected} entryId={selected} onBack={() => go({ thread: null })} />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <i className="pi pi-comments text-4xl text-[var(--text-color-secondary)]" aria-hidden />
                <p className="mt-3 text-sm text-[var(--text-color-secondary)]">
                  Pick a conversation to read it. Opening it is recorded in Activity.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Row({ row, active, onSelect }: { row: AdminConversation; active: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full flex-col gap-0.5 border-0 border-b border-solid border-[var(--surface-border)] px-3 py-2.5 text-left transition-colors ${
          active ? 'bg-[var(--highlight-bg)]' : 'bg-transparent hover:bg-[var(--surface-hover)]'
        }`}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {row.client.displayName} <span className="text-[var(--text-color-secondary)]">and</span>{' '}
            {row.freelancer.displayName}
          </span>
          {row.lastAtUtc && (
            <span className="shrink-0 text-[0.7rem] text-[var(--text-color-secondary)]">{relativeTime(row.lastAtUtc)}</span>
          )}
        </span>
        <span className="truncate text-xs text-[var(--text-color-secondary)]">{row.opportunity.title}</span>
        <span className="flex items-center gap-2 text-xs text-[var(--text-color-secondary)]">
          {row.messages.toLocaleString()} {row.messages === 1 ? 'message' : 'messages'}
          {row.lastFrom && <> · last from the {row.lastFrom === 'client' ? 'client' : 'entrant'}</>}
          {!row.open && <Tag value="Closed" severity="secondary" className="!px-1.5 !py-0 !text-[0.65rem]" />}
          {row.openReports > 0 && (
            <Tag
              value={`${row.openReports} reported`}
              icon="pi pi-flag-fill"
              severity="danger"
              className="!px-1.5 !py-0 !text-[0.65rem]"
            />
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * One conversation, read-only. Fetched once and on request only — every
 * page fetched is a row in the activity log, so nothing here refetches on
 * a timer or when the window regains focus.
 */
function Reader({ entryId, onBack }: { entryId: string; onBack: () => void }) {
  const query = useInfiniteQuery({
    queryKey: adminChatKeys.one(entryId),
    queryFn: ({ pageParam }) => fetchAdminConversation(entryId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: AdminConversationPage) => last.nextCursor,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const c = query.data?.pages[0]?.conversation;
  const reports = query.data?.pages[0]?.reports ?? [];
  // Pages come newest first, and so do the lines within a page.
  const lines = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items).slice().reverse(), [query.data]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-[var(--surface-border)] px-3 py-2">
        <Button icon="pi pi-arrow-left" text rounded size="small" aria-label="Back to conversations" onClick={onBack} className="md:!hidden" />
        {c ? (
          <div className="min-w-0 flex-1 leading-tight">
            <Link
              href={`/opportunities/${c.opportunity.slug}`}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm font-semibold no-underline hover:underline"
            >
              {c.opportunity.title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-color-secondary)]">
              <Party label="Client" party={c.client} />
              <Party label="Entrant" party={c.freelancer} />
              {!c.open && (
                <span>
                  Closed ·{' '}
                  {c.entryStatus !== 'active' ? `entry ${c.entryStatus}` : `opportunity ${c.opportunity.status}`}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 py-1 text-sm text-[var(--text-color-secondary)]">
            {query.isError ? (query.error as Error).message : 'Loading…'}
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <Link href={`/admin/activity?q=${entryId}`} className="text-xs" title="Every opening of this conversation in Activity">
            Who read this
          </Link>
          <Button
            icon="pi pi-refresh"
            text
            rounded
            size="small"
            aria-label="Read it again"
            tooltip="Read it again (recorded)"
            tooltipOptions={{ position: 'left' }}
            loading={query.isRefetching}
            onClick={() => query.refetch()}
          />
        </div>
      </div>

      <p className="m-0 border-b border-[var(--surface-border)] bg-[var(--surface-ground)] px-3 py-1.5 text-[0.7rem] text-[var(--text-color-secondary)]">
        <i className="pi pi-eye mr-1 text-[0.65rem]" aria-hidden />
        Read-only. Nothing is marked read, neither member is told, and this reading is recorded in Activity.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" aria-label="Messages">
        {reports.length > 0 && <Reports entryId={entryId} reports={reports} onResolved={() => query.refetch()} />}
        {query.hasNextPage && (
          <div className="mb-2 text-center">
            <Button
              label="Earlier messages"
              icon="pi pi-arrow-up"
              text
              size="small"
              loading={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            />
          </div>
        )}
        {c && lines.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--text-color-secondary)]">Nothing has been said here.</p>
        )}
        {c && (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {lines.map((m, i) => (
              <Line
                key={m.id}
                line={m}
                name={m.from === 'client' ? c.client.displayName : c.freelancer.displayName}
                first={i === 0 || lines[i - 1].from !== m.from}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/**
 * A conversation's reports, open ones first: who reported it, why, and in
 * their words; under the open ones, the note and the button that marks
 * them all reviewed. Reviewed ones say when, by whom and the note left.
 */
function Reports({ entryId, reports, onResolved }: { entryId: string; reports: AdminReport[]; onResolved: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const open = reports.filter((r) => !r.resolvedAtUtc);
  const resolve = useMutation({
    mutationFn: () => resolveReports(entryId, note),
    onSuccess: () => {
      setNote('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: adminChatKeys.all });
      onResolved();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'The reports were not marked reviewed.'),
  });

  return (
    <section
      aria-label="Reports"
      className={`mb-3 rounded-lg border p-3 text-sm ${
        open.length > 0 ? 'border-red-500/60 bg-red-500/5' : 'border-[var(--surface-border)]'
      }`}
    >
      <h2 className="m-0 flex items-center gap-1.5 text-sm font-semibold">
        <i className={`pi ${open.length > 0 ? 'pi-flag-fill text-red-600' : 'pi-flag'}`} aria-hidden />
        {open.length > 0
          ? `${open.length} open report${open.length === 1 ? '' : 's'}`
          : `${reports.length} report${reports.length === 1 ? '' : 's'}, all reviewed`}
      </h2>
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {reports.map((r) => (
          <li key={r.id} className={r.resolvedAtUtc ? 'opacity-75' : ''}>
            <div>
              <span className="font-medium">{r.reporterName}</span>{' '}
              <span className="text-[var(--text-color-secondary)]">
                ({r.from === 'client' ? 'client' : 'entrant'}) · {r.reasonLabel} ·{' '}
                <time dateTime={r.createdAtUtc} title={new Date(r.createdAtUtc).toLocaleString()}>
                  {relativeTime(r.createdAtUtc)}
                </time>
              </span>
            </div>
            {r.details && <p className="m-0 mt-0.5 whitespace-pre-wrap break-words">“{r.details}”</p>}
            {r.resolvedAtUtc && (
              <p className="m-0 mt-0.5 text-xs text-[var(--text-color-secondary)]">
                Reviewed {relativeTime(r.resolvedAtUtc)}
                {r.resolvedByName && <> by {r.resolvedByName}</>}
                {r.resolution && <>: {r.resolution}</>}
              </p>
            )}
          </li>
        ))}
      </ul>
      {open.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <InputTextarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            autoResize
            maxLength={500}
            placeholder="What you did, for the next administrator (optional)"
            aria-label="Review note"
            className="text-sm"
          />
          {error && (
            <p role="alert" className="m-0 text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              label="Mark reviewed"
              icon="pi pi-check"
              size="small"
              loading={resolve.isPending}
              onClick={() => resolve.mutate()}
            />
            <span className="text-xs text-[var(--text-color-secondary)]">
              Each reporter is emailed that it was reviewed — not what was done.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function Party({ label, party }: { label: string; party: AdminConversation['client'] }) {
  return (
    <Link
      href={`/profile/${party.id}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[var(--text-color-secondary)] no-underline hover:underline"
    >
      <Avatar name={party.displayName} url={party.avatarUrl} size="xs" />
      <span>
        {label}: <span className="text-[var(--text-color)]">{party.displayName}</span>
      </span>
    </Link>
  );
}

/** The client's lines on the right, the entrant's on the left, each group under its sender's name. */
function Line({ line, name, first }: { line: AdminLine; name: string; first: boolean }) {
  const client = line.from === 'client';
  const at = new Date(line.createdAtUtc);
  return (
    <li className={`flex flex-col ${client ? 'items-end' : 'items-start'} ${first ? 'mt-2' : ''}`}>
      {first && <span className="mb-0.5 px-1 text-[0.7rem] font-medium text-[var(--text-color-secondary)]">{name}</span>}
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
          client
            ? 'rounded-br-md bg-[var(--highlight-bg)] text-[var(--text-color)]'
            : 'rounded-bl-md bg-[var(--surface-100)] text-[var(--text-color)]'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{line.body}</div>
        <div className="mt-0.5 text-right text-[0.65rem] text-[var(--text-color-secondary)]">
          <time dateTime={line.createdAtUtc} title={at.toLocaleString()}>
            {at.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </time>
          {' · '}
          {line.readAtUtc ? (
            <span title={new Date(line.readAtUtc).toLocaleString()}>read</span>
          ) : (
            <span>unread</span>
          )}
        </div>
      </div>
    </li>
  );
}
