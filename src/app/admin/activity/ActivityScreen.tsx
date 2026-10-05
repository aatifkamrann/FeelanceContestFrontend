'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { InputText } from 'primereact/inputtext';
import { Paginator, type PaginatorPageChangeEvent } from 'primereact/paginator';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import Avatar from '@/components/Avatar';
import HelpIcon from '@/components/HelpIcon';
import SiteHeader from '@/components/SiteHeader';
import {
  activityAiModelsQuery,
  activityExchangeQuery,
  activityQuery,
  browserOf,
  EXTERNAL_SERVICES,
  serviceLabel,
  usersQuery,
  type ActivityFilters,
  type ActivityKind,
  type ActivityRange,
  type ActivityRow,
  type ActivityWho,
  type ExternalService,
} from '@/lib/admin';
import { meQuery, relativeTime } from '@/lib/opportunities';

const KINDS: { label: string; value: ActivityKind }[] = [
  { label: 'Everything', value: 'all' },
  { label: 'Pages', value: 'visit' },
  { label: 'Actions', value: 'action' },
  { label: 'Third-party', value: 'external' },
];

const WHO: { label: string; value: ActivityWho }[] = [
  { label: 'Everyone', value: 'all' },
  { label: 'Members', value: 'members' },
  { label: 'Visitors', value: 'visitors' },
];

const RANGES: { label: string; value: ActivityRange }[] = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: 'All time', value: 'all' },
];

const PAGE_SIZE = 50;
const ANY = 'any';

function roleSeverity(role: string): 'info' | 'success' | 'warning' {
  return role === 'admin' ? 'warning' : role === 'client' ? 'info' : 'success';
}

/** "14:32:07, 15 Sep 2026" — the exact moment, for the tooltip and the small print. */
function exactTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Admin → Activity: who did what, when, and on which page — every member's
 * actions and every visitor's browsing, newest first, a page at a time —
 * and every call the portal made to a third-party API, which opens to show
 * what was sent and what came back. Reading only; nothing here changes
 * anything. Administrators only, gated the way Users and Settings are.
 */
export default function ActivityScreen() {
  const router = useRouter();
  const me = useQuery(meQuery);
  const isAdmin = me.data?.role === 'admin';
  const users = useQuery({ ...usersQuery, enabled: isAdmin });

  const [q, setQ] = useState('');
  const [needle, setNeedle] = useState('');
  const [kind, setKind] = useState<ActivityKind>('all');
  const [service, setService] = useState<ExternalService | null>(null);
  // An AI call's row names its provider and model ("openai/gpt-5.5");
  // these narrow to one provider, or one exact provider and model.
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [who, setWho] = useState<ActivityWho>('all');
  const [range, setRange] = useState<ActivityRange>('7d');
  const [userId, setUserId] = useState<string | null>(null);
  const [visitor, setVisitor] = useState<string | null>(null);
  const [first, setFirst] = useState(0);

  // The Users screen links here with ?user=<id>, a conversation's "Who
  // read this" with ?q=<entry>; read once, on mount (window.location, not
  // useSearchParams — no Suspense boundary needed).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const u = params.get('user');
      if (u) {
        setUserId(u);
        setRange('all');
      }
      const words = params.get('q');
      if (words) {
        setQ(words);
        setNeedle(words.trim());
        setRange('all');
      }
    } catch {
      /* no window — nothing to read */
    }
  }, []);

  // The search box narrows as it is typed, a third of a second behind.
  useEffect(() => {
    const t = setTimeout(() => setNeedle(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Any change of filter starts again from the first page.
  useEffect(() => setFirst(0), [needle, kind, service, aiProvider, aiModel, who, range, userId, visitor]);

  const aiCalls = kind === 'external' && service === 'ai';
  const filters: ActivityFilters = useMemo(
    () => ({
      q: needle,
      kind,
      service: kind === 'external' ? service : null,
      aiProvider: aiCalls ? aiProvider : null,
      aiModel: aiCalls ? aiModel : null,
      who,
      range,
      userId,
      visitor,
      page: first / PAGE_SIZE + 1,
      size: PAGE_SIZE,
    }),
    [needle, kind, service, aiCalls, aiProvider, aiModel, who, range, userId, visitor, first],
  );
  const activity = useQuery({ ...activityQuery(filters), enabled: isAdmin });
  const aiModels = useQuery({ ...activityAiModelsQuery, enabled: isAdmin && aiCalls });

  // A row's model, pressed: every call made with it, whatever else was narrowed.
  const onlyModel = (id: string) => {
    setKind('external');
    setService('ai');
    setAiProvider(id.split('/')[0]);
    setAiModel(id);
  };

  useEffect(() => {
    if (me.data === null) router.replace('/login?next=/admin/activity');
  }, [me.data, router]);

  if (me.isLoading || me.data === null) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <i className="pi pi-spinner pi-spin text-3xl" />
      </main>
    );
  }
  if (me.data && !isAdmin) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">Activity is read by portal administrators</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              You are signed in as a {me.data.role}. Your own work is on the dashboard.
            </p>
            <Link href="/dashboard" className="no-underline">
              <Button label="Dashboard" className="mt-4" />
            </Link>
          </div>
        </main>
      </>
    );
  }
  if (me.isError || activity.isError) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
            <p className="mt-3 font-medium">Activity could not be loaded</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Nothing has changed — this screen only reads it. Is the API up?
            </p>
            <Button
              label="Try again"
              className="mt-4"
              outlined
              onClick={() => {
                void me.refetch();
                void activity.refetch();
              }}
            />
          </div>
        </main>
      </>
    );
  }

  const data = activity.data;
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  // A sentinel rather than null for "any": PrimeReact's Dropdown hands back
  // the whole option when its value is null, and the query then carried
  // "[object Object]" as the account.
  const accountOptions = [
    { label: 'Any account', value: ANY },
    ...(users.data ?? [])
      .slice()
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map((u) => ({ label: `${u.displayName} · ${u.email}`, value: u.id })),
  ];
  const serviceOptions = [
    { label: 'Any service', value: ANY },
    ...EXTERNAL_SERVICES.map((s) => ({ label: s.label, value: s.value })),
  ];
  // The providers the settings offer; the models, those the log's AI calls
  // were made with — the chosen provider's only, most recently used first.
  const providerOptions = [
    { label: 'Any provider', value: ANY },
    ...(aiModels.data?.providers ?? []).map((p) => ({ label: p.label, value: p.key })),
  ];
  const seenModels = (aiModels.data?.models ?? []).filter((m) => !aiProvider || m.provider === aiProvider);
  const modelOptions = [
    { label: 'Any model', value: ANY },
    ...seenModels.map((m) => ({
      label: `${m.model} · ${m.providerLabel} · ${m.calls.toLocaleString()} ${m.calls === 1 ? 'call' : 'calls'}`,
      value: m.id,
    })),
    // A model pressed on a row before the list has loaded still reads as itself.
    ...(aiModel && !seenModels.some((m) => m.id === aiModel) ? [{ label: aiModel, value: aiModel }] : []),
  ];
  const narrowed = kind !== 'all' || who !== 'all' || range !== 'all' || !!needle || !!userId || !!visitor;
  const tally =
    total === 0
      ? narrowed
        ? 'Nothing matches'
        : 'Nothing recorded'
      : `${(first + 1).toLocaleString()}–${Math.min(first + PAGE_SIZE, total).toLocaleString()} of ${total.toLocaleString()} ${total === 1 ? 'event' : 'events'}`;
  const nobody = narrowed
    ? 'Nothing matches those filters.'
    : 'Nothing has been recorded yet. Pages opened, actions taken and calls to other services appear here as they happen.';

  return (
    <>
      <SiteHeader />
      <main className="p-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-semibold">
                Activity
                <HelpIcon topic="admin.activity" />
              </h1>
              <p className="text-[var(--text-color-secondary)]">
                Who did what, when, and on which page — every member&rsquo;s actions, every visitor&rsquo;s
                browsing, and every call the portal made to another service, newest first. Reading only.
              </p>
            </div>
            <Button
              label="Refresh"
              icon={`pi ${activity.isFetching ? 'pi-spin pi-spinner' : 'pi-refresh'}`}
              outlined
              onClick={() => void activity.refetch()}
              disabled={activity.isFetching}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3">
            <IconField iconPosition="left" className="min-w-[14rem] flex-1">
              <InputIcon className="pi pi-search" />
              <InputText
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="A name, an email, a page, an action, an address"
                aria-label="Search activity"
                className="w-full !pl-10"
              />
            </IconField>
            <SelectButton
              value={kind}
              options={KINDS}
              onChange={(e) => e.value && setKind(e.value as ActivityKind)}
              allowEmpty={false}
              aria-label="Kind"
              className="flex shrink-0"
              pt={{ button: { className: '!px-3' } }}
            />
            <SelectButton
              value={who}
              options={WHO}
              onChange={(e) => e.value && setWho(e.value as ActivityWho)}
              allowEmpty={false}
              aria-label="Who"
              className="flex shrink-0"
              pt={{ button: { className: '!px-3' } }}
            />
            <SelectButton
              value={range}
              options={RANGES}
              onChange={(e) => e.value && setRange(e.value as ActivityRange)}
              allowEmpty={false}
              aria-label="When"
              className="flex shrink-0"
              pt={{ button: { className: '!px-3' } }}
            />
            {kind === 'external' && (
              <Dropdown
                value={service ?? ANY}
                options={serviceOptions}
                onChange={(e) => setService(e.value === ANY || !e.value ? null : (e.value as ExternalService))}
                placeholder="Any service"
                aria-label="Service"
                className="min-w-[12rem]"
              />
            )}
            {aiCalls && (
              <>
                <Dropdown
                  value={aiProvider ?? ANY}
                  options={providerOptions}
                  onChange={(e) => {
                    const next = e.value === ANY || !e.value ? null : (e.value as string);
                    setAiProvider(next);
                    // A model under another provider no longer fits.
                    if (next && aiModel && !aiModel.startsWith(`${next}/`)) setAiModel(null);
                  }}
                  placeholder="Any provider"
                  aria-label="AI provider"
                  className="min-w-[11rem]"
                />
                <Dropdown
                  value={aiModel ?? ANY}
                  options={modelOptions}
                  onChange={(e) => setAiModel(e.value === ANY || !e.value ? null : (e.value as string))}
                  placeholder="Any model"
                  aria-label="AI model"
                  className="min-w-[14rem]"
                />
              </>
            )}
            <Dropdown
              value={userId ?? ANY}
              options={accountOptions}
              onChange={(e) => setUserId(e.value === ANY || !e.value ? null : (e.value as string))}
              filter
              filterBy="label"
              placeholder="Any account"
              aria-label="Account"
              className="min-w-[16rem]"
            />
            {visitor && (
              <button
                type="button"
                className="wp-filter-chip"
                onClick={() => setVisitor(null)}
                aria-label={`Stop filtering by visitor ${visitor}`}
              >
                <i className="pi pi-user" aria-hidden />
                Visitor {visitor.slice(0, 8)}
                <i className="pi pi-times" aria-hidden />
              </button>
            )}
          </div>

          <p className="mt-4 text-sm text-[var(--text-color-secondary)]" aria-live="polite">
            {tally}
          </p>

          {activity.isLoading ? (
            <div className="p-10 text-center">
              <i className="pi pi-spinner pi-spin text-2xl" aria-hidden />
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center text-sm text-[var(--text-color-secondary)]">
              {nobody}
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)]">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--text-color-secondary)]">
                  <tr className="border-b border-[var(--surface-border)]">
                    <th scope="col" className="px-4 py-3 font-medium">When</th>
                    <th scope="col" className="px-4 py-3 font-medium">Who</th>
                    <th scope="col" className="px-4 py-3 font-medium">What</th>
                    <th scope="col" className="px-4 py-3 font-medium">Where</th>
                    <th scope="col" className="px-4 py-3 font-medium">From</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Row key={r.id} row={r} onVisitor={setVisitor} onUser={setUserId} onModel={onlyModel} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {total > PAGE_SIZE && (
            <Paginator
              first={first}
              rows={PAGE_SIZE}
              totalRecords={total}
              onPageChange={(e: PaginatorPageChangeEvent) => setFirst(e.first)}
              className="mt-3 !bg-transparent"
              template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink"
            />
          )}
        </div>
      </main>
    </>
  );
}

function Row({
  row,
  onVisitor,
  onUser,
  onModel,
}: {
  row: ActivityRow;
  onVisitor: (visitor: string) => void;
  onUser: (userId: string) => void;
  /** An AI call's "provider/model", pressed. */
  onModel: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const visit = row.kind === 'visit';
  const call = row.kind === 'external';
  // A call that got no answer at all has no status; it failed as surely as a 500.
  const failed = row.status >= 400 || (call && row.status === 0);
  const exchangeId = `exchange-${row.id}`;
  return (
    <>
      <tr className={`align-top ${open ? '' : 'border-b border-[var(--surface-border)] last:border-b-0'}`}>
        <td className="whitespace-nowrap px-4 py-3">
          <time dateTime={row.atUtc} title={exactTime(row.atUtc)}>
            {relativeTime(row.atUtc)}
          </time>
          <div className="text-xs text-[var(--text-color-secondary)]">{exactTime(row.atUtc)}</div>
        </td>
        <td className="px-4 py-3">
          {row.user ? (
            <button
              type="button"
              onClick={() => onUser(row.user!.id)}
              title="Only this account"
              className="flex items-center gap-2 rounded-md border-0 bg-transparent p-0 text-left text-sm text-[var(--text-color)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
            >
              <Avatar name={row.user.displayName} url={row.user.avatarUrl} size="sm" />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1 font-medium">
                  {row.user.displayName}
                  <Tag value={row.user.role} severity={roleSeverity(row.user.role)} className="!text-[10px]" />
                  {row.user.erased && <Tag value="deleted" severity="secondary" className="!text-[10px]" />}
                </span>
                <span className="block [overflow-wrap:anywhere] text-xs text-[var(--text-color-secondary)]">
                  {row.user.email}
                </span>
              </span>
            </button>
          ) : row.userId ? (
            <span className="text-[var(--text-color-secondary)]">Removed account</span>
          ) : call && !row.visitor ? (
            // No request in flight when the call went out: one of the
            // portal's own background jobs made it.
            <span className="text-[var(--text-color-secondary)]" title="Made by a background job, not by a click">
              The portal
            </span>
          ) : (
            <span className="text-[var(--text-color-secondary)]">Visitor</span>
          )}
          {row.visitor && (
            <button
              type="button"
              onClick={() => onVisitor(row.visitor!)}
              title="Only this browser session"
              className="mt-1 block rounded-md border-0 bg-transparent p-0 font-mono text-[11px] text-[var(--text-color-secondary)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
            >
              session {row.visitor.slice(0, 8)}
            </button>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="flex flex-wrap items-center gap-2">
            <i
              className={`pi ${visit ? 'pi-eye' : call ? 'pi-arrow-right-arrow-left' : 'pi-bolt'} text-xs text-[var(--text-color-secondary)]`}
              aria-hidden
            />
            <span>{row.action}</span>
            {call && row.service && (
              <Tag value={serviceLabel(row.service) ?? row.service} severity="info" className="!text-[10px]" />
            )}
            {failed && (
              <Tag
                value={row.status === 0 ? 'no answer' : `failed · ${row.status}`}
                severity="danger"
                className="!text-[10px]"
              />
            )}
            {call && !failed && <span className="text-xs text-[var(--text-color-secondary)]">{row.status}</span>}
            {call && row.durationMs !== null && (
              <span className="text-xs tabular-nums text-[var(--text-color-secondary)]">
                {row.durationMs.toLocaleString()} ms
              </span>
            )}
          </span>
          {row.subject &&
            (call && row.service === 'ai' ? (
              // The vendor and model members never see: "openai/gpt-5.5".
              <button
                type="button"
                onClick={() => onModel(row.subject!)}
                title="Only calls with this provider and model"
                className="mt-0.5 block rounded-md border-0 bg-transparent p-0 text-left font-mono text-xs text-[var(--text-color-secondary)] [overflow-wrap:anywhere] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
              >
                {row.subject}
              </button>
            ) : (
              <div className="mt-0.5 [overflow-wrap:anywhere] font-mono text-xs text-[var(--text-color-secondary)]">
                {row.subject}
              </div>
            ))}
          {row.detail && (
            <blockquote
              className="m-0 mt-1.5 max-w-[28rem] whitespace-pre-line border-l-2 border-[var(--surface-border)] pl-2 text-xs [overflow-wrap:anywhere]"
              aria-label="Reason given"
            >
              {row.detail}
            </blockquote>
          )}
          {call && (
            <Button
              type="button"
              label={open ? 'Hide request and response' : 'Request and response'}
              icon={`pi ${open ? 'pi-chevron-up' : 'pi-chevron-down'}`}
              text
              size="small"
              className="mt-1 !px-0 !py-0.5 !text-xs"
              aria-expanded={open}
              aria-controls={exchangeId}
              onClick={() => setOpen((o) => !o)}
            />
          )}
        </td>
        <td className="px-4 py-3">
          {row.page ? (
            <Link href={row.page} className="[overflow-wrap:anywhere] text-sm">
              {row.page}
            </Link>
          ) : (
            <span className="text-[var(--text-color-secondary)]">—</span>
          )}
          {!visit && (
            <div className="mt-0.5 [overflow-wrap:anywhere] font-mono text-xs text-[var(--text-color-secondary)]">
              {row.method} {row.path}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-[var(--text-color-secondary)]">
          {call ? (
            // The portal made this call itself; the person's address and
            // browser belong to the request that set it off, if any.
            <div>Portal server</div>
          ) : (
            <>
              <div className="font-mono">{row.ip ?? '—'}</div>
              <div title={row.userAgent ?? undefined}>{browserOf(row.userAgent)}</div>
            </>
          )}
        </td>
      </tr>
      {call && open && (
        <tr id={exchangeId} className="border-b border-[var(--surface-border)] last:border-b-0">
          <td colSpan={5} className="px-4 pb-4 pt-0">
            <Exchange id={row.id} />
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * One third-party call, opened: what the portal sent on the left, what came
 * back on the right, each as the request or status line, the headers and
 * the body. Fetched when opened, not with the page — fifty bodies are a lot
 * to carry for rows nobody opens. Keys, tokens and codes were masked before
 * the row was written; "[redacted]" marks where.
 */
function Exchange({ id }: { id: number }) {
  const exchange = useQuery(activityExchangeQuery(id));
  if (exchange.isLoading) {
    return (
      <div className="p-4 text-center">
        <i className="pi pi-spinner pi-spin" aria-hidden />
      </div>
    );
  }
  if (exchange.isError || !exchange.data) {
    return (
      <p className="m-0 text-sm text-[var(--text-color-secondary)]">
        The call could not be loaded. It may have been swept by the retention setting — refresh the list.
      </p>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ExchangeText title="Request" text={exchange.data.request} />
      <ExchangeText title="Response" text={exchange.data.response} />
    </div>
  );
}

function ExchangeText({ title, text }: { title: string; text: string | null }) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-ground)]">
      <h3 className="m-0 border-b border-[var(--surface-border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]">
        {title}
      </h3>
      {text ? (
        <pre className="m-0 max-h-[28rem] overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs [overflow-wrap:anywhere]">
          {text}
        </pre>
      ) : (
        <p className="m-0 px-3 py-2 text-xs text-[var(--text-color-secondary)]">
          Not kept — cleared by the AI body retention or when the account was erased, or never recorded.
        </p>
      )}
    </section>
  );
}
