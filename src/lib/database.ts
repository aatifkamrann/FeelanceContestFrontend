import { postJson } from '@/lib/opportunities';
import { apiFetch } from '@/lib/api';

/** The database the portal is on, and how it came to be chosen. */
export type DatabaseStatus = {
  /** postgres | sqlserver */
  provider: string;
  providerLabel: string;
  /** override (the file beside the keys: the setup page, this page or a move wrote it) | environment */
  source: string;
  server: string;
  database: string;
  serverVersion: string | null;
  /** A move has recorded another database and the process has not come back up on it yet. */
  restartPending: boolean;
  overridePath: string;
  /** The running connection as the form shows it; never its password. */
  connection: DatabaseConnection;
  move: DatabaseMove;
};

/** A connection read back for the form: its fields, never its password. */
export type DatabaseConnection = {
  /** postgres | sqlserver */
  provider: string;
  server: string;
  /** null: the provider's usual port, or a named instance's own */
  port: number | null;
  database: string;
  /** sql | windows */
  authentication: string;
  userId: string;
  /** A password is in use; a blank one in the form keeps it. */
  passwordSet: boolean;
  encrypt: boolean;
  trustServerCertificate: boolean;
  /** The address takes no port (named pipe, shared memory, LocalDB, several PostgreSQL hosts). */
  portFixed: boolean;
  /** A sign-in method the fields do not cover, kept as it is. */
  advanced: string | null;
};

/** What the form sends: the fields, and a password only when one was typed. */
export type DatabaseConnectionFields = {
  provider: string;
  server: string;
  port: number | null;
  database: string;
  authentication: string;
  userId: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
};

/** The form's starting values from a connection read back — the password always starts blank. */
export const fieldsFrom = (c: DatabaseConnection): DatabaseConnectionFields => ({
  provider: c.provider,
  server: c.server,
  port: c.port,
  database: c.database,
  authentication: c.authentication,
  userId: c.userId,
  password: '',
  encrypt: c.encrypt,
  trustServerCertificate: c.trustServerCertificate,
});

/** An empty form for a provider: this machine, the portal's own database name, a SQL login, encrypted. */
export const blankFields = (provider: string): DatabaseConnectionFields => ({
  provider,
  server: 'localhost',
  port: null,
  database: 'winnersportal',
  authentication: 'sql',
  userId: '',
  password: '',
  encrypt: true,
  trustServerCertificate: false,
});

/** Two forms say the same thing — what "tested" is measured against. */
export const sameFields = (a: DatabaseConnectionFields, b: DatabaseConnectionFields) =>
  JSON.stringify(a) === JSON.stringify(b);

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

/** What a database held when it was asked, for comparing a copy with the original. */
export type DatabaseFreshness = { accounts: number; opportunities: number; latestActivityUtc: string | null };

/** What a tested database is, and what the asking screen may do with it. */
export type DatabaseTest = {
  reachable: boolean;
  serverVersion: string | null;
  versionOk: boolean;
  fullTextOk: boolean;
  databaseExists: boolean;
  empty: boolean;
  /** The portal's tables, with rows in them. */
  holdsPortal: boolean;
  /** Its secret settings open with this portal's keys; null when nothing could say. */
  samePortal: boolean | null;
  /** connect | switch | move — what may be done next; null when nothing. */
  action: string | null;
  problem: string | null;
  /** A caution beside the action (an older copy, missing keys). */
  warning: string | null;
  target: DatabaseFreshness | null;
  current: DatabaseFreshness | null;
};

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

export const testDatabase = (target: DatabaseConnectionFields) => postJson<DatabaseTest>('/api/admin/database/test', target);

export const startMove = (target: DatabaseConnectionFields) => postJson<DatabaseMove>('/api/admin/database/move', target);

/** Saves an edited connection onto this portal's own data; the API restarts on it. */
export const saveConnection = (target: DatabaseConnectionFields) =>
  postJson<DatabaseMove>('/api/admin/database/connection', target);

/** The wizard's test, before there is an administrator: the same probe, behind the setup token. */
export const testSetupDatabase = async (token: string, target: DatabaseConnectionFields): Promise<DatabaseTest> => {
  const res = await apiFetch('/api/setup/database/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Setup-Token': token },
    body: JSON.stringify(target),
  });
  const data = (await res.json().catch(() => ({}))) as DatabaseTest & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `The API answered ${res.status}.`);
  return data;
};

/** The connect step's test, while the API has no database: the same probe, asked what a first connection may use. */
export const testSetupConnection = (token: string, target: DatabaseConnectionFields) =>
  setupPost<DatabaseTest>('/api/setup/connection/test', token, target);

/** The connect itself: answered at once, then followed through the setup status while the tables are made. */
export const connectSetupDatabase = (token: string, target: DatabaseConnectionFields) =>
  setupPost<SetupConnecting>('/api/setup/connection', token, target);

async function setupPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Setup-Token': token },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new Error('That setup token is not valid any more. The current one is in the API logs.');
  if (!res.ok) throw new Error(data.error ?? `The API answered ${res.status}.`);
  return data;
}

/** A first connect as the setup page follows it. */
export type SetupConnecting = {
  /** checking | preparing | recording | starting | failed */
  phase: string;
  server: string;
  database: string;
  error: string | null;
};

/** What each connect phase reads as. */
export function connectPhaseLabel(phase: string): string {
  switch (phase) {
    case 'checking':
      return 'Checking the server';
    case 'preparing':
      return 'Creating the tables';
    case 'recording':
      return 'Saving the connection';
    case 'starting':
      return 'Starting the portal on it';
    case 'failed':
      return 'Failed';
    default:
      return 'Connecting';
  }
}

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
