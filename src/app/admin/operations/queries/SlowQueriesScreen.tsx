'use client';

import Link from 'next/link';
import { Button } from 'primereact/button';
import { RankTable } from '@/components/dashboard/kit';
import { clearSlowQueries, type AdminSlowQueries, type AdminSlowQueryRow } from '@/lib/admin';
import { relativeTime } from '@/lib/opportunities';
import OperationsFrame, { CARD, Cards, many, useOperations } from '../OperationsFrame';

/**
 * Operations › Slow queries: the database commands that ran slower than the
 * API's threshold, the costliest in all first — the evidence a query is
 * worth tuning — and the button that starts the tally again.
 */
export default function SlowQueriesScreen() {
  const ops = useOperations();
  const all = ops.data?.slowQueries.items ?? [];
  const rows = all.filter((s) => ops.matches(s.sql, sourceWord(s.source), s.lastDuring, sqlHeadline(s.sql)));

  return (
    <OperationsFrame
      ops={ops}
      path="/admin/operations/queries"
      title="Slow queries"
      help="admin.slowQueries"
      intro="Database commands that took longer than the threshold, one row per query in the code, the costliest in all first."
      search="Search tables, SQL, requests, sources"
      shown={rows.length}
      total={all.length}
      noun={['slow query', 'slow queries']}
      actions={
        all.length > 0 && (
          <Button
            label="Clear"
            icon="pi pi-eraser"
            size="small"
            text
            loading={ops.busyId === 'slow-queries'}
            disabled={ops.busyId !== null}
            onClick={() =>
              void ops.act('slow-queries', clearSlowQueries,
                'The slow-query tally starts again from now. The API log keeps the lines already written.')
            }
          />
        )
      }
    >
      {({ slowQueries: slow }) => (
        <>
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
          {ops.view === 'cards' ? (
            <Cards
              empty={slowEmpty(slow, ops.searching ? ops.noneMatch : null)}
              items={rows.map((s) => (
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
              empty={slowEmpty(slow, ops.searching ? ops.noneMatch : null)}
              columns={[
                { key: 'query', label: 'Query' },
                { key: 'runs', label: 'Runs', align: 'right' },
                { key: 'total', label: 'Total', align: 'right' },
                { key: 'average', label: 'Average', align: 'right' },
                { key: 'slowest', label: 'Slowest', align: 'right' },
                { key: 'last', label: 'Last run' },
              ]}
              rows={rows.map((s) => ({
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
        </>
      )}
    </OperationsFrame>
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

/** The page's empty line: off, nothing slow yet, or nothing matching the search. */
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
