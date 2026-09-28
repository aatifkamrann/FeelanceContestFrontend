import { Message } from 'primereact/message';
import type { DatabaseTest } from '@/lib/database';

/**
 * A candidate database in four lines — the same four the API tests — under
 * the admin page's Move panel and the setup wizard's Database step alike.
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
        {result.reachable &&
          line(
            result.empty,
            !result.databaseExists
              ? 'The database does not exist yet — the move creates it'
              : result.empty
                ? 'Empty, or only the portal’s own empty tables'
                : 'Holds data already',
          )}
      </ul>
      {result.problem ? (
        <Message severity="error" className="mt-3 w-full justify-start" text={result.problem} />
      ) : (
        <p className="mb-0 mt-3 font-medium text-green-700 dark:text-green-400">Ready to move.</p>
      )}
    </div>
  );
}
