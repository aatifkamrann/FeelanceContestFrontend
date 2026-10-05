import { Message } from 'primereact/message';
import type { DatabaseTest } from '@/lib/database';

/** What each action reads as once the test has passed. */
const READY: Record<string, string> = {
  connect: 'Ready to connect.',
  switch: 'This portal’s data is there — ready to save.',
  move: 'Empty — ready to move.',
};

/**
 * A tested database in a few lines — the same facts the API read — under the
 * setup wizard's connect and move steps and Admin → Database alike, ending
 * with what may be done with it, or why not.
 */
export default function DatabaseTestResult({ provider, result }: { provider: string; result: DatabaseTest }) {
  const line = (ok: boolean, text: string) => (
    <li className="flex items-start gap-2">
      <i
        className={`pi mt-0.5 ${ok ? 'pi-check text-green-700 dark:text-green-400' : 'pi-times text-red-600 dark:text-red-400'}`}
        aria-hidden
      />
      <span>{text}</span>
    </li>
  );
  const holds = !result.databaseExists
    ? `The database does not exist yet — ${result.action === 'connect' ? 'connecting' : 'the move'} creates it`
    : result.empty
      ? 'Empty, or only the portal’s own empty tables'
      : result.holdsPortal
        ? `Holds ${result.samePortal === false ? 'another portal’s' : 'the portal’s'} data` +
          (result.target ? ` — ${result.target.accounts} accounts, ${result.target.opportunities} opportunities` : '')
        : 'Holds tables that are not the portal’s';
  return (
    <div className="rounded-lg border border-[var(--surface-border)] p-3 text-sm">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {line(result.reachable, result.reachable ? `Reachable — ${result.serverVersion ?? 'version not read'}` : 'Not reachable')}
        {result.reachable &&
          provider === 'sqlserver' &&
          line(result.versionOk, result.versionOk ? 'SQL Server 2022 or later' : 'Older than SQL Server 2022')}
        {result.reachable &&
          provider === 'sqlserver' &&
          line(result.fullTextOk, result.fullTextOk ? 'Full-Text Search installed' : 'Full-Text Search not installed')}
        {result.reachable && line(result.action !== null, holds)}
      </ul>
      {result.problem ? (
        <Message severity="error" className="mt-3 w-full justify-start" text={result.problem} />
      ) : (
        <>
          {result.warning && <Message severity="warn" className="mt-3 w-full justify-start" text={result.warning} />}
          <p className="mb-0 mt-3 font-medium text-green-700 dark:text-green-400">
            {(result.action && READY[result.action]) ?? 'Ready.'}
          </p>
        </>
      )}
    </div>
  );
}
