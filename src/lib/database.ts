import { postJson } from '@/lib/opportunities';
import { apiFetch } from '@/lib/api';

/** The database the portal is on, and how it came to be chosen. */
export type DatabaseStatus = {
  /** postgres | sqlserver */
  provider: string;
  providerLabel: string;
  /** override (the file a move wrote) | environment | default (the development fallback) */
  source: string;
  server: string;
  database: string;
  serverVersion: string | null;
  /** A move has recorded another database and the process has not come back up on it yet. */
  restartPending: boolean;
  overridePath: string;
  move: DatabaseMove;
};

export type DatabaseMove = {
  /** idle | checking | pausing | preparing | copying | verifying | recording | restarting | failed */
  phase: string;
  target: string | null;
  targetServer: string | null;
  targetDatabase: string | null;
  currentTable: string | null;
  tablesDone: number;
  tablesTotal: number;
  rowsCopied: number;
  error: string | null;
  startedAtUtc: string | null;
  finishedAtUtc: string | null;
  startedBy: string | null;
  restartPending: boolean;
};

/** What a candidate database is, in the four facts a move needs. */
export type DatabaseTest = {
  reachable: boolean;
  serverVersion: string | null;
  versionOk: boolean;
  fullTextOk: boolean;
  databaseExists: boolean;
  empty: boolean;
  problem: string | null;
};

export type DatabaseTarget = { provider: string; connectionString: string };

export async function fetchDatabase(): Promise<DatabaseStatus> {
  const res = await apiFetch('/api/admin/database');
  if (!res.ok) throw new Error(`Database status failed (${res.status})`);
  return res.json();
}

export const databaseQuery = {
  queryKey: ['admin', 'database'] as const,
  queryFn: fetchDatabase,
  staleTime: 5_000,
};

export async function fetchMove(): Promise<DatabaseMove> {
  const res = await apiFetch('/api/admin/database/move');
  if (!res.ok) throw new Error(`Move status failed (${res.status})`);
  return res.json();
}

export const moveQuery = {
  queryKey: ['admin', 'database', 'move'] as const,
  queryFn: fetchMove,
};

export const isMoveRunning = (phase: string) => !['idle', 'failed', 'restarting'].includes(phase);

export const testDatabase = (target: DatabaseTarget) => postJson<DatabaseTest>('/api/admin/database/test', target);

export const startMove = (target: DatabaseTarget) => postJson<DatabaseMove>('/api/admin/database/move', target);

/** The wizard's test, before there is an administrator: the same probe, behind the setup token. */
export const testSetupDatabase = async (token: string, target: DatabaseTarget): Promise<DatabaseTest> => {
  const res = await apiFetch('/api/setup/database/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Setup-Token': token },
    body: JSON.stringify(target),
  });
  const data = (await res.json().catch(() => ({}))) as DatabaseTest & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `The API answered ${res.status}.`);
  return data;
};

export const PROVIDERS = [
  { value: 'sqlserver', label: 'SQL Server 2022+' },
  { value: 'postgres', label: 'PostgreSQL' },
];

/** What each phase reads as on the page. */
export function phaseLabel(phase: string): string {
  switch (phase) {
    case 'checking':
      return 'Checking the target';
    case 'pausing':
      return 'Pausing the portal';
    case 'preparing':
      return 'Creating the schema';
    case 'copying':
      return 'Copying tables';
    case 'verifying':
      return 'Verifying row counts';
    case 'recording':
      return 'Recording the choice';
    case 'restarting':
      return 'Restarting';
    case 'failed':
      return 'Failed';
    default:
      return 'Idle';
  }
}
