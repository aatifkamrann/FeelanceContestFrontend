'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Message } from 'primereact/message';
import { ProgressBar } from 'primereact/progressbar';
import { Tag } from 'primereact/tag';
import DatabaseConnectionForm from '@/components/DatabaseConnectionForm';
import DatabaseTestResult from '@/components/DatabaseTestResult';
import HelpIcon from '@/components/HelpIcon';
import SiteHeader from '@/components/SiteHeader';
import { Panel } from '@/components/dashboard/kit';
import { ApiError, meQuery, relativeTime } from '@/lib/opportunities';
import {
  databaseQuery,
  fieldsFrom,
  isMoveRunning,
  moveQuery,
  phaseLabel,
  sameFields,
  saveConnection,
  startMove,
  testDatabase,
  type DatabaseConnection,
  type DatabaseConnectionFields,
  type DatabaseTest,
} from '@/lib/database';
import { apiFetch } from '@/lib/api';

/**
 * Where the portal's data is, and the two ways to change it: save an edited
 * connection onto this portal's own data (a new password, a new host, a
 * restored copy), or move everything into an empty database — the heaviest
 * thing an administrator can do from a browser: the portal pauses, every
 * table is copied, the choice is written beside the keys, and the API
 * restarts on the new database. Either way the page tests first, asks, and
 * then reports each phase until the health probe answers again.
 */
export default function DatabasePage() {
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const admin = me?.role === 'admin';
  const { data, isLoading, isError, refetch } = useQuery({ ...databaseQuery, enabled: admin });

  return (
    <>
      <SiteHeader />
      <ConfirmDialog />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {meLoading || (admin && isLoading) ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
        ) : !admin ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Administrators only.</p>
        ) : isError || !data ? (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <p className="font-medium">The database status could not be read</p>
            <Button label="Try again" className="mt-4" outlined onClick={() => void refetch()} />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <h1 className="text-2xl font-bold">Database</h1>
            <Panel title="Where the portal is">
              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-[var(--text-color-secondary)]">Database</dt>
                <dd className="m-0 font-medium">{data.providerLabel}</dd>
                <dt className="text-[var(--text-color-secondary)]">Server</dt>
                <dd className="m-0 font-mono text-xs">
                  {data.server} / {data.database}
                </dd>
                <dt className="text-[var(--text-color-secondary)]">Version</dt>
                <dd className="m-0">{data.serverVersion ?? '—'}</dd>
                <dt className="text-[var(--text-color-secondary)]">Chosen by</dt>
                <dd className="m-0">
                  {data.source === 'override'
                    ? `the connection saved here, in ${data.overridePath} — it wins over ConnectionStrings__Db`
                    : 'the environment (DATABASE__PROVIDER and ConnectionStrings__Db)'}
                </dd>
              </dl>
              {data.restartPending && (
                <Message
                  severity="warn"
                  className="mt-4 w-full justify-start"
                  content={
                    <span className="text-sm">
                      <Tag value="Restart pending" severity="warning" icon="pi pi-refresh" className="mr-2" />Another database
                      or connection is recorded and the API has not come back up on it yet. Restart the API service; it
                      reads {data.overridePath} at startup.
                    </span>
                  }
                />
              )}
            </Panel>
            <ConnectionPanel current={data.connection} running={isMoveRunning(data.move.phase) || data.move.phase === 'restarting'} />
          </div>
        )}
      </main>
    </>
  );
}

function ConnectionPanel({ current, running: initiallyRunning }: { current: DatabaseConnection; running: boolean }) {
  const queryClient = useQueryClient();
  // Starts from where the portal is: a new password is one field, a move to
  // a new database on the same server a change of name, and a blank
  // password keeps the login's while the server and user stay the same.
  const [fields, setFields] = useState<DatabaseConnectionFields>(() => fieldsFrom(current));
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ forFields: DatabaseConnectionFields; result: DatabaseTest } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(initiallyRunning);
  const { data: move } = useQuery({
    ...moveQuery,
    enabled: watching,
    refetchInterval: (q) => (q.state.data && !isMoveRunning(q.state.data.phase) && q.state.data.phase !== 'restarting' ? false : 1000),
    retry: false,
  });

  const runTest = async () => {
    setTesting(true);
    setError(null);
    setTest(null);
    try {
      const result = await testDatabase(fields);
      setTest({ forFields: fields, result });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The API could not be reached.');
    } finally {
      setTesting(false);
    }
  };

  const tested = test !== null && sameFields(test.forFields, fields) && test.result.problem === null;
  const action = tested ? test!.result.action : null;

  const confirmSave = () => {
    const there = test?.result.target;
    const here = test?.result.current;
    confirmDialog({
      header: 'Save this connection and restart?',
      message:
        'The portal pauses for a moment, the connection is saved beside the data-protection keys, and the API restarts ' +
        'on it — about half a minute.' +
        (there && here
          ? ` That database holds ${there.accounts} accounts and ${there.opportunities} opportunities; the one in use holds ${here.accounts} and ${here.opportunities}.`
          : '') +
        ' Nothing is copied or deleted.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Save and restart',
      rejectLabel: 'Not now',
      accept: async () => {
        setError(null);
        try {
          await saveConnection(fields);
          setWatching(true);
          await queryClient.invalidateQueries({ queryKey: moveQuery.queryKey });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'The API could not be reached.');
        }
      },
    });
  };

  const confirmMove = () =>
    confirmDialog({
      header: 'Move the portal to this database?',
      message:
        'The portal pauses — every write is refused until it is back — and every table is copied to the new database. ' +
        'The choice is then recorded beside the data-protection keys and the API restarts on it, which takes about half ' +
        'a minute. The old database is left as it was; nothing is deleted.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Move now',
      rejectLabel: 'Not now',
      accept: async () => {
        setError(null);
        try {
          await startMove(fields);
          setWatching(true);
          await queryClient.invalidateQueries({ queryKey: moveQuery.queryKey });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'The API could not be reached.');
        }
      },
    });

  return (
    <Panel title="Connection" help="admin.database.connection">
      {watching && move ? (
        <MoveProgress move={move} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--text-color-secondary)]">
            Where the portal reaches its database. Edit it for a new password or a new host, or point it at an empty
            database — SQL Server 2022 or later with Full-Text Search, or PostgreSQL — to move everything there. The test
            says which it is: this portal&apos;s data is saved onto, an empty database is moved into.
          </p>
          <DatabaseConnectionForm value={fields} onChange={setFields} current={current} idPrefix="move" />
          {test && <DatabaseTestResult provider={test.forFields.provider} result={test.result} />}
          {error && <Message severity="error" className="w-full justify-start" text={error} />}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              label="Test connection"
              icon="pi pi-bolt"
              outlined
              loading={testing}
              disabled={!fields.server.trim() || !fields.database.trim()}
              onClick={() => void runTest()}
            />
            <HelpIcon topic="admin.database.test" label="What the test checks" />
            {action === 'move' ? (
              <Button label="Move data here" icon="pi pi-arrow-right-arrow-left" severity="warning" onClick={confirmMove} />
            ) : (
              <Button
                label="Save and restart"
                icon="pi pi-save"
                severity="warning"
                disabled={action !== 'switch'}
                title={
                  action === 'switch'
                    ? undefined
                    : 'Test the connection first; saving starts only from a passing test of exactly these fields.'
                }
                onClick={confirmSave}
              />
            )}
            <HelpIcon topic="admin.database.move" label="What a move does" />
          </div>
        </div>
      )}
    </Panel>
  );
}

function MoveProgress({ move }: { move: { phase: string; targetServer: string | null; targetDatabase: string | null; currentTable: string | null; tablesDone: number; tablesTotal: number; rowsCopied: number; error: string | null; startedAtUtc: string | null; startedBy: string | null } }) {
  const queryClient = useQueryClient();
  const [backUp, setBackUp] = useState<'waiting' | 'up' | null>(null);
  const restarting = move.phase === 'restarting';
  const timer = useRef<number | null>(null);

  // Past "restarting" the API goes away for half a minute; poll the health
  // probe until it answers, then read where the portal came back up.
  useEffect(() => {
    if (!restarting || backUp === 'up') return;
    setBackUp('waiting');
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await apiFetch('/api/health', { cache: 'no-store' });
        if (res.ok && !cancelled) {
          // Two clean answers a few seconds apart: the old process answers
          // until the moment it exits, and one reply may be its last.
          await new Promise((r) => setTimeout(r, 4000));
          const again = await apiFetch('/api/health', { cache: 'no-store' });
          if (again.ok && !cancelled) {
            setBackUp('up');
            await queryClient.invalidateQueries({ queryKey: databaseQuery.queryKey });
            await queryClient.invalidateQueries({ queryKey: moveQuery.queryKey });
            return;
          }
        }
      } catch {
        /* down — as expected mid-restart */
      }
      if (!cancelled) timer.current = window.setTimeout(() => void poll(), 2000);
    };
    timer.current = window.setTimeout(() => void poll(), 6000);
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [restarting, backUp, queryClient]);

  const pct = move.tablesTotal > 0 ? Math.round((move.tablesDone / move.tablesTotal) * 100) : 0;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="m-0">
        <Tag
          value={phaseLabel(move.phase)}
          severity={move.phase === 'failed' ? 'danger' : restarting ? 'success' : 'info'}
          icon={move.phase === 'failed' ? 'pi pi-times-circle' : restarting ? 'pi pi-refresh' : 'pi pi-spin pi-spinner'}
          className="mr-2"
        />
        {move.tablesTotal > 0 || isMoveRunning(move.phase) ? 'to' : 'on'} {move.targetServer} / {move.targetDatabase}
        {move.startedAtUtc && (
          <span className="text-[var(--text-color-secondary)]">
            {' '}
            · started {relativeTime(move.startedAtUtc)} by {move.startedBy}
          </span>
        )}
      </p>
      {(move.phase === 'copying' || move.phase === 'verifying') && (
        <>
          <ProgressBar value={pct} showValue={false} style={{ height: '0.5rem' }} />
          <p className="m-0 text-[var(--text-color-secondary)]">
            {move.tablesDone} of {move.tablesTotal} tables · {move.rowsCopied.toLocaleString()} rows
            {move.currentTable && ` · ${move.currentTable}`}
          </p>
        </>
      )}
      {restarting && (
        <Message
          severity={backUp === 'up' ? 'success' : 'info'}
          className="w-full justify-start"
          text={
            backUp === 'up'
              ? 'The API is back. The panel above says which database it came up on.'
              : (move.tablesTotal > 0
                  ? 'Every table is copied and the choice is recorded. '
                  : 'The connection is saved. ') +
                'The API is restarting on it — this takes about half a minute, and the page will say when it is back. ' +
                'If nothing restarts the API for you (Visual Studio, dotnet run), start it again.'
          }
        />
      )}
      {move.phase === 'failed' && (
        <Message
          severity="error"
          className="w-full justify-start"
          content={
            <span className="text-sm">
              <strong>The move failed and nothing was kept:</strong> {move.error} The portal is unpaused and still on
              its old database; reload this page to try again.
            </span>
          }
        />
      )}
    </div>
  );
}
