'use client';

import { useEffect, useRef, useState } from 'react';
import { Steps } from 'primereact/steps';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { SelectButton } from 'primereact/selectbutton';
import { ProgressBar } from 'primereact/progressbar';
import AccentPicker from '@/components/AccentPicker';
import DatabaseConnectionForm from '@/components/DatabaseConnectionForm';
import DatabaseTestResult from '@/components/DatabaseTestResult';
import HelpIcon from '@/components/HelpIcon';
import JwtRules from '@/components/JwtRules';
import PasswordRules from '@/components/PasswordRules';
import { passwordAcceptable } from '@/lib/password';
import { JWT_DEFAULTS, JWT_KEYS, jwtProblem, newSigningKey } from '@/lib/jwt';
import { PORTAL_NAME, apiFetch } from '@/lib/api';
import {
  PROVIDERS,
  blankFields,
  connectPhaseLabel,
  connectSetupDatabase,
  fieldsFrom,
  isMoveRunning,
  phaseLabel,
  sameFields,
  testSetupConnection,
  testSetupDatabase,
  type DatabaseConnection,
  type DatabaseConnectionFields,
  type DatabaseMove,
  type DatabaseTest,
  type SetupConnecting,
} from '@/lib/database';

type DatabaseInfo = { provider: string; providerLabel: string; server: string; database: string };
type Defaults = {
  values: Record<string, string | null>;
  /** Keys whose value comes from the deployment's environment. Still editable: what the wizard saves wins. */
  fromEnvironment: string[];
  /** The database the API is on; null while it has none. */
  database: DatabaseInfo | null;
  /** The API has no database yet: the wizard starts by connecting one. */
  needsDatabase?: boolean;
  connection?: DatabaseConnection | null;
};

type StepId = 'access' | 'connection' | 'admin' | 'branding' | 'email' | 'jwt' | 'database' | 'finish';

const LABELS: Record<StepId, string> = {
  access: 'Access',
  connection: 'Connection',
  admin: 'Administrator',
  branding: 'Branding',
  email: 'Email',
  jwt: 'JWT',
  database: 'Database',
  finish: 'Finish',
};

/**
 * The steps in order. An API with no database starts with Connection, and
 * then has no Database step — the database was just chosen; an API that
 * already has one ends with the offer to move it.
 */
const stepsFor = (connectFirst: boolean): StepId[] =>
  connectFirst
    ? ['access', 'connection', 'admin', 'branding', 'email', 'jwt', 'finish']
    : ['access', 'admin', 'branding', 'email', 'jwt', 'database', 'finish'];

export default function SetupWizard({
  initialToken,
  apiDown,
}: {
  initialToken: string;
  apiDown: boolean;
}) {
  const [stepId, setStepId] = useState<StepId>('access');
  // Whether this API started with no database: its wizard connects one first.
  const [connectFirst, setConnectFirst] = useState(false);
  const steps = stepsFor(connectFirst);
  const index = steps.indexOf(stepId);
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(apiDown ? 'The API is unreachable right now.' : null);
  const [busy, setBusy] = useState(false);
  const [fromEnv, setFromEnv] = useState<string[]>([]);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // The name suggested to an operator who has not chosen one: the same
  // stock name every fallback in the portal uses, so there is one place
  // that word lives and one thing to change if it ever changes.
  const [portalName, setPortalName] = useState(PORTAL_NAME);
  const [publicUrl, setPublicUrl] = useState('http://localhost');
  // Blank unless the API is served from a hostname of its own.
  const [apiUrl, setApiUrl] = useState('');
  const [accentColor, setAccentColor] = useState('#0f766e');
  const [smtpHost, setSmtpHost] = useState('localhost');
  const [smtpPort, setSmtpPort] = useState('1025');
  const [fromAddress, setFromAddress] = useState('no-reply@winnersportal.local');
  const [jwtIssuer, setJwtIssuer] = useState(JWT_DEFAULTS.issuer);
  const [jwtAudience, setJwtAudience] = useState(JWT_DEFAULTS.audience);
  // Blank keeps the key the API made on its first start.
  const [jwtSigningKey, setJwtSigningKey] = useState('');
  const [jwtAccessMinutes, setJwtAccessMinutes] = useState(JWT_DEFAULTS.accessMinutes);
  const [jwtRefreshDays, setJwtRefreshDays] = useState(JWT_DEFAULTS.refreshDays);

  // The database step: the API is already on one; keeping it is the
  // ordinary choice, and moving runs the same move an administrator can
  // run later, on a portal that holds only this account.
  const [dbCurrent, setDbCurrent] = useState<DatabaseInfo | null>(null);
  const [dbChoice, setDbChoice] = useState<'keep' | 'move'>('keep');
  const [dbFields, setDbFields] = useState<DatabaseConnectionFields>(() => blankFields('postgres'));
  const [dbTesting, setDbTesting] = useState(false);
  const [dbTest, setDbTest] = useState<{ forFields: DatabaseConnectionFields; result: DatabaseTest } | null>(null);
  // Once Finish answered "moving": the move being followed, then the restart.
  const [moving, setMoving] = useState<DatabaseMove | null>(null);
  const [restart, setRestart] = useState<'none' | 'waiting' | 'failed'>('none');

  // The connection step, while the API has no database: the fields, their
  // test, and the connect being followed until the real API answers.
  const [connFields, setConnFields] = useState<DatabaseConnectionFields>(() => blankFields('sqlserver'));
  const [connTesting, setConnTesting] = useState(false);
  const [connTest, setConnTest] = useState<{ forFields: DatabaseConnectionFields; result: DatabaseTest } | null>(null);
  const [connecting, setConnecting] = useState<SetupConnecting | null>(null);

  const autoVerified = useRef(false);

  const isFromEnv = (key: string) => fromEnv.includes(key);

  /**
   * The token check and the prefill in one call. Null when the API said
   * no — the reason is on the page — or sent the operator elsewhere.
   */
  async function readDefaults(candidate: string, afterConnect = false): Promise<Defaults | null> {
    const res = await apiFetch('/api/setup/defaults', {
      headers: { 'X-Setup-Token': candidate },
      cache: 'no-store',
    });
    if (res.status === 401) {
      setError(
        afterConnect
          ? 'The database is connected, but the API came back with a new setup token — use the one in its log.'
          : 'That setup token is not valid. The current one is in the API logs.',
      );
      return null;
    }
    if (res.status === 404) {
      // Setup is complete on this database already — a portal's own data.
      window.location.href = '/';
      return null;
    }
    if (!res.ok) {
      setError(`The API answered ${res.status}.`);
      return null;
    }
    return (await res.json()) as Defaults;
  }

  async function verifyToken(candidate: string) {
    setBusy(true);
    setError(null);
    try {
      const defaults = await readDefaults(candidate);
      if (!defaults) return;
      if (defaults.needsDatabase) {
        setConnectFirst(true);
        if (defaults.connection) setConnFields(fieldsFrom(defaults.connection));
        setStepId('connection');
        return;
      }
      applyDefaults(defaults);
      setStepId('admin');
    } catch {
      setError('Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  /** The prefill, once the API is on a database. */
  function applyDefaults(defaults: Defaults) {
    setFromEnv(defaults.fromEnvironment ?? []);
    const v = defaults.values;
    if (v['branding.portalName']) setPortalName(v['branding.portalName']);
    if (v['branding.publicUrl']) setPublicUrl(v['branding.publicUrl']);
    if (v['branding.apiUrl']) setApiUrl(v['branding.apiUrl']);
    if (v['branding.accentColor']) setAccentColor(v['branding.accentColor']);
    if (v['email.smtpHost']) setSmtpHost(v['email.smtpHost']);
    if (v['email.smtpPort']) setSmtpPort(v['email.smtpPort']);
    if (v['email.fromAddress']) setFromAddress(v['email.fromAddress']);
    if (v[JWT_KEYS.issuer]) setJwtIssuer(v[JWT_KEYS.issuer]!);
    if (v[JWT_KEYS.audience]) setJwtAudience(v[JWT_KEYS.audience]!);
    if (v[JWT_KEYS.accessMinutes]) setJwtAccessMinutes(v[JWT_KEYS.accessMinutes]!);
    if (v[JWT_KEYS.refreshDays]) setJwtRefreshDays(v[JWT_KEYS.refreshDays]!);
    setDbCurrent(defaults.database);
    if (defaults.database)
      setDbFields(blankFields(defaults.database.provider === 'postgres' ? 'sqlserver' : 'postgres'));
  }

  const connTested =
    connTest !== null && sameFields(connTest.forFields, connFields) && connTest.result.action === 'connect';

  async function runConnTest() {
    setConnTesting(true);
    setError(null);
    setConnTest(null);
    try {
      const result = await testSetupConnection(token, connFields);
      setConnTest({ forFields: connFields, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the API.');
    } finally {
      setConnTesting(false);
    }
  }

  async function connect() {
    setError(null);
    try {
      setConnecting(await connectSetupDatabase(token, connFields));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the API.');
    }
  }

  // The connect runs in the API's background: the tables are made, the
  // connection saved, and the small connect-only API gives way to the real
  // one on the new database. Its status is followed through all of that —
  // a failed fetch is the moment between the two — until it no longer asks
  // for a database; then the prefill is read again, with the same token.
  useEffect(() => {
    if (!connecting || connecting.phase === 'failed') return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await apiFetch('/api/setup/status', { cache: 'no-store' });
        if (res.ok) {
          const status = (await res.json()) as { completed: boolean; needsDatabase?: boolean; connecting?: SetupConnecting | null };
          if (cancelled) return;
          if (status.completed) {
            window.location.href = '/';
            return;
          }
          if (!status.needsDatabase) {
            const defaults = await readDefaults(token, true);
            if (cancelled) return;
            if (defaults) {
              applyDefaults(defaults);
              setConnecting(null);
              setStepId('admin');
            }
            return;
          }
          if (status.connecting) {
            setConnecting(status.connecting);
            if (status.connecting.phase === 'failed') {
              setError(status.connecting.error ?? 'Connecting failed.');
              return;
            }
          }
        }
      } catch {
        /* between the connect-only API and the real one */
      }
      timer = window.setTimeout(() => void tick(), 1500);
    };
    timer = window.setTimeout(() => void tick(), 1000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [connecting !== null && connecting.phase !== 'failed']); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialToken && !autoVerified.current) {
      autoVerified.current = true;
      void verifyToken(initialToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function next() {
    setError(null);
    if (stepId === 'admin') {
      if (!displayName.trim()) return setError('A display name is required.');
      if (!email.includes('@')) return setError('A valid email is required.');
      if (!passwordAcceptable(password)) return setError('The password needs everything ticked below it.');
      if (password !== confirm) return setError('The passwords do not match.');
    }
    if (stepId === 'branding' && !portalName.trim()) return setError('The portal needs a name.');
    if (stepId === 'jwt') {
      for (const [key, value] of Object.entries(jwtValues())) {
        const problem = jwtProblem(key, value);
        if (problem) return setError(problem);
      }
    }
    if (stepId === 'database' && dbChoice === 'move' && !dbTested)
      return setError('Test the connection first — a move starts only from a passing test of exactly these fields.');
    setStepId(steps[index + 1]);
  }

  const dbTested = dbTest !== null && sameFields(dbTest.forFields, dbFields) && dbTest.result.problem === null;

  async function runDbTest() {
    setDbTesting(true);
    setError(null);
    setDbTest(null);
    try {
      const result = await testSetupDatabase(token, dbFields);
      setDbTest({ forFields: dbFields, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the API.');
    } finally {
      setDbTesting(false);
    }
  }

  // Finish answered "moving": follow the move, then the restart. The
  // move's own endpoint needs the admin cookie Finish just issued; the
  // setup status needs nothing, which is why it is what the restart is
  // watched through — the first answer after the API comes back sends
  // the operator to the page that says which database it came up on.
  useEffect(() => {
    if (!moving) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      if (cancelled) return;
      if (restart === 'waiting') {
        try {
          const res = await apiFetch('/api/setup/status', { cache: 'no-store' });
          if (res.ok) {
            await new Promise((r) => setTimeout(r, 4000)); // the old process answers until the moment it exits
            const again = await apiFetch('/api/setup/status', { cache: 'no-store' });
            if (again.ok && !cancelled) {
              window.location.href = '/admin/database';
              return;
            }
          }
        } catch {
          /* down — expected mid-restart */
        }
        timer = window.setTimeout(() => void tick(), 2000);
        return;
      }
      try {
        const res = await apiFetch('/api/admin/database/move', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const m = (await res.json()) as DatabaseMove;
        if (cancelled) return;
        setMoving(m);
        if (m.phase === 'restarting') setRestart('waiting');
        else if (m.phase === 'failed') setRestart('failed');
        else timer = window.setTimeout(() => void tick(), 1000);
      } catch {
        // Gone already — the process ended before this poll: treat as restarting.
        if (!cancelled) setRestart('waiting');
        timer = window.setTimeout(() => void tick(), 2000);
      }
    };
    timer = window.setTimeout(() => void tick(), 1000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [moving !== null, restart]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The JWT step as the API stores it; a blank key is left out, so the API keeps the one it has. */
  function jwtValues(): Record<string, string> {
    return {
      [JWT_KEYS.issuer]: jwtIssuer.trim(),
      [JWT_KEYS.audience]: jwtAudience.trim(),
      [JWT_KEYS.accessMinutes]: jwtAccessMinutes.trim(),
      [JWT_KEYS.refreshDays]: jwtRefreshDays.trim(),
      ...(jwtSigningKey.trim() ? { [JWT_KEYS.signingKey]: jwtSigningKey.trim() } : {}),
    };
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          admin: { email, password, displayName },
          settings: {
            'branding.portalName': portalName,
            'branding.publicUrl': publicUrl.trim().replace(/\/+$/, ''),
            'branding.apiUrl': apiUrl.trim().replace(/\/+$/, ''),
            'branding.accentColor': accentColor,
            'email.smtpHost': smtpHost,
            'email.smtpPort': smtpPort,
            'email.fromAddress': fromAddress,
            ...jwtValues(),
          },
          database: dbChoice === 'move' ? dbFields : null,
        }),
      });
      if (res.status === 204) {
        window.location.href = '/admin/settings';
        return;
      }
      if (res.status === 200) {
        // Setup is complete either way; the move may or may not have started.
        const finished = (await res.json()) as { moving: boolean; error: string | null };
        if (finished.moving) {
          setMoving({
            phase: 'checking', target: dbFields.provider, targetServer: null, targetDatabase: null, currentTable: null,
            tablesDone: 0, tablesTotal: 0, rowsCopied: 0, error: null, startedAtUtc: null, finishedAtUtc: null,
            startedBy: email, restartPending: false,
          });
          return;
        }
        setError(
          (finished.error ?? 'The move could not start.') +
            ' The portal is set up and still on its current database; move it later from Admin → Database.',
        );
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `Setup failed (${res.status}).`);
    } catch {
      setError('Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  const field = 'flex flex-col gap-1';
  const label = 'text-sm font-medium';

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-8">
        {/* Nothing has a name yet — this screen is what gives it one — so the
            portal is called what an unnamed portal is called everywhere else. */}
        <h1 className="text-2xl font-semibold text-center">Set up your {PORTAL_NAME}</h1>
        <p className="mt-1 text-center text-[var(--text-color-secondary)]">
          Runs once. Everything here is editable later in Admin → Settings.
        </p>

        <div className="mt-8">
          <Steps model={steps.map((s) => ({ label: LABELS[s] }))} activeIndex={index} readOnly />
        </div>

        {error && (
          <div className="mt-6">
            <Message severity="error" text={error} className="w-full" />
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4">
          {stepId === 'access' && (
            <>
              <p className="text-[var(--text-color-secondary)]">
                Paste the one-time setup token from the API logs (the line that
                starts with <code>First run:</code>).
              </p>
              <div className={field}>
                <label className={label} htmlFor="token">Setup token</label>
                <InputText
                  id="token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoFocus
                />
              </div>
            </>
          )}

          {stepId === 'connection' && (
            <>
              <div>
                <h2 className="m-0 flex items-center gap-1 text-lg font-semibold">
                  Connect the database
                  <HelpIcon topic="setup.connection" label="Connect the database" />
                </h2>
                <p className="m-0 mt-1 text-[var(--text-color-secondary)]">
                  The API has no database yet. Say where it is and test it; connecting creates the portal&apos;s tables
                  there and keeps the connection, encrypted, beside the API&apos;s keys.
                </p>
              </div>
              <DatabaseConnectionForm
                value={connFields}
                onChange={setConnFields}
                disabled={connecting !== null && connecting.phase !== 'failed'}
                idPrefix="setup-connect"
              />
              {connTest && <DatabaseTestResult provider={connTest.forFields.provider} result={connTest.result} />}
              {connecting && connecting.phase !== 'failed' ? (
                <p className="m-0 text-sm font-medium">
                  <i className="pi pi-spin pi-spinner mr-2" aria-hidden />
                  {connectPhaseLabel(connecting.phase)} — {connecting.server} / {connecting.database}. This page follows.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    label="Test connection"
                    icon="pi pi-bolt"
                    outlined
                    loading={connTesting}
                    disabled={!connFields.server.trim() || !connFields.database.trim()}
                    onClick={() => void runConnTest()}
                  />
                  <Button
                    label="Connect"
                    icon="pi pi-link"
                    disabled={!connTested}
                    title={connTested ? undefined : 'Test the connection first; connecting starts only from a passing test of exactly these fields.'}
                    onClick={() => void connect()}
                  />
                  <HelpIcon topic="admin.database.test" label="What the test checks" />
                </div>
              )}
            </>
          )}

          {stepId === 'admin' && (
            <>
              <div className={field}>
                <label className={label} htmlFor="displayName">Display name</label>
                <InputText id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
              </div>
              <div className={field}>
                <label className={label} htmlFor="email">Email</label>
                <InputText id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className={field}>
                <label className={label} htmlFor="password">Password</label>
                <Password
                  inputId="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  feedback={false}
                  toggleMask
                  autoComplete="new-password"
                  className="w-full"
                  inputClassName="w-full"
                  aria-describedby="password-rules"
                />
                <PasswordRules password={password} id="password-rules" />
              </div>
              <div className={field}>
                <label className={label} htmlFor="confirm">Confirm password</label>
                <Password
                  inputId="confirm"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  feedback={false}
                  toggleMask
                  autoComplete="new-password"
                  className="w-full"
                  inputClassName="w-full"
                />
                {confirm !== '' && confirm !== password && (
                  <p className="mt-1 text-xs text-red-500">Both boxes have to say the same thing.</p>
                )}
              </div>
            </>
          )}

          {stepId === 'branding' && (
            <>
              <div className={field}>
                <label className={label} htmlFor="portalName">Portal name</label>
                <InputText id="portalName" value={portalName} onChange={(e) => setPortalName(e.target.value)} autoFocus />
              </div>
              <div className={field}>
                <label className={label} htmlFor="publicUrl">
                  Web URL
                  <HelpIcon topic="settings.branding.publicUrl" label="Web URL" />{' '}
                  {isFromEnv('branding.publicUrl') && <Tag value="from environment" severity="info" className="ml-2" title="The deployment sets this. Change it here and your value wins." />}
                </label>
                <InputText id="publicUrl" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} />
              </div>
              <div className={field}>
                <label className={label} htmlFor="apiUrl">
                  API URL
                  <HelpIcon topic="settings.branding.apiUrl" label="API URL" />{' '}
                  {isFromEnv('branding.apiUrl') && <Tag value="from environment" severity="info" className="ml-2" title="The deployment sets this. Change it here and your value wins." />}
                </label>
                <InputText
                  id="apiUrl"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="blank — the pages' own address"
                 
                />
              </div>
              <div className={field}>
                <label className={label} htmlFor="accentColor">Accent color</label>
                <AccentPicker id="accentColor" value={accentColor} onChange={setAccentColor} defaultValue="#0f766e" />
              </div>
            </>
          )}

          {stepId === 'email' && (
            <>
              <p className="text-[var(--text-color-secondary)]">
                Where outbound email goes. The compose stack points this at
                Mailpit, which catches everything.
              </p>
              {(['email.smtpHost', 'email.smtpPort', 'email.fromAddress'] as const).map((key) => {
                const cfg = {
                  'email.smtpHost': { id: 'smtpHost', text: 'SMTP host', value: smtpHost, set: setSmtpHost },
                  'email.smtpPort': { id: 'smtpPort', text: 'SMTP port', value: smtpPort, set: setSmtpPort },
                  'email.fromAddress': { id: 'fromAddress', text: 'From address', value: fromAddress, set: setFromAddress },
                }[key];
                return (
                  <div className={field} key={key}>
                    <label className={label} htmlFor={cfg.id}>
                      {cfg.text}
                      <HelpIcon topic={`settings.${key}`} label={cfg.text} />{' '}
                      {isFromEnv(key) && <Tag value="from environment" severity="info" className="ml-2" title="The deployment sets this. Change it here and your value wins." />}
                    </label>
                    <InputText id={cfg.id} value={cfg.value} onChange={(e) => cfg.set(e.target.value)} />
                  </div>
                );
              })}
            </>
          )}

          {stepId === 'jwt' && (
            <>
              <div>
                <h2 className="m-0 text-lg font-semibold">JWT (token signing &amp; lifetimes)</h2>
                <p className="m-0 mt-1 text-[var(--text-color-secondary)]">
                  These bind at server startup, so changes here take effect after the next restart.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    [JWT_KEYS.issuer, 'jwtIssuer', 'Issuer', jwtIssuer, setJwtIssuer],
                    [JWT_KEYS.audience, 'jwtAudience', 'Audience', jwtAudience, setJwtAudience],
                  ] as const
                ).map(([key, id, text, value, set]) => (
                  <div className={field} key={key}>
                    <label className={label} htmlFor={id}>
                      {text}
                      <HelpIcon topic={`settings.${key}`} label={text} />{' '}
                      {isFromEnv(key) && <Tag value="from environment" severity="info" className="ml-2" title="The deployment sets this. Change it here and your value wins." />}
                    </label>
                    <InputText id={id} value={value} onChange={(e) => set(e.target.value)} />
                  </div>
                ))}
              </div>
              <div className={field}>
                <label className={label} htmlFor="jwtSigningKey">
                  Signing key (leave blank to keep current key)
                  <HelpIcon topic={`settings.${JWT_KEYS.signingKey}`} label="Signing key" />{' '}
                  {isFromEnv(JWT_KEYS.signingKey) && <Tag value="from environment" severity="info" className="ml-2" title="The deployment sets this. Change it here and your value wins." />}
                </label>
                <div className="flex items-center gap-2">
                  <Password
                    inputId="jwtSigningKey"
                    value={jwtSigningKey}
                    onChange={(e) => setJwtSigningKey(e.target.value)}
                    placeholder="Current key"
                    feedback={false}
                    toggleMask
                    className="min-w-0 flex-1"
                    inputClassName="w-full"
                  />
                  <Button
                    label="Generate"
                    icon="pi pi-key"
                    outlined
                    onClick={() => setJwtSigningKey(newSigningKey())}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    [JWT_KEYS.accessMinutes, 'jwtAccessMinutes', 'Access token lifetime (minutes)', jwtAccessMinutes, setJwtAccessMinutes],
                    [JWT_KEYS.refreshDays, 'jwtRefreshDays', 'Refresh token lifetime (days)', jwtRefreshDays, setJwtRefreshDays],
                  ] as const
                ).map(([key, id, text, value, set]) => (
                  <div className={field} key={key}>
                    <label className={label} htmlFor={id}>
                      {text}
                      <HelpIcon topic={`settings.${key}`} label={text} />{' '}
                      {isFromEnv(key) && <Tag value="from environment" severity="info" className="ml-2" title="The deployment sets this. Change it here and your value wins." />}
                    </label>
                    <InputText id={id} value={value} inputMode="numeric" onChange={(e) => set(e.target.value)} />
                  </div>
                ))}
              </div>
              <JwtRules />
            </>
          )}

          {stepId === 'database' && !moving && (
            <>
              <div>
                <h2 className="m-0 flex items-center gap-1 text-lg font-semibold">
                  Database
                  <HelpIcon topic="setup.database" label="Keep or move the database" />
                </h2>
                <p className="m-0 mt-1 text-[var(--text-color-secondary)]">
                  The portal is running on <strong>{dbCurrent?.providerLabel ?? 'its database'}</strong>
                  {dbCurrent && (
                    <>
                      {' '}at <code>{dbCurrent.server}</code> / <code>{dbCurrent.database}</code>
                    </>
                  )}
                  . Keep it, or move to another database now, before anybody else has used the portal.
                </p>
              </div>
              <SelectButton
                value={dbChoice}
                options={[
                  { label: `Keep ${dbCurrent?.providerLabel ?? 'this database'}`, value: 'keep' },
                  { label: 'Move to another database', value: 'move' },
                ]}
                onChange={(e) => {
                  if (e.value) setDbChoice(e.value);
                }}
                allowEmpty={false}
              />
              {dbChoice === 'move' && (
                <>
                  <DatabaseConnectionForm value={dbFields} onChange={setDbFields} idPrefix="setup-move" />
                  {dbTest && <DatabaseTestResult provider={dbTest.forFields.provider} result={dbTest.result} />}
                  <div className="flex items-center gap-2">
                    <Button
                      label="Test connection"
                      icon="pi pi-bolt"
                      outlined
                      loading={dbTesting}
                      disabled={!dbFields.server.trim() || !dbFields.database.trim()}
                      onClick={() => void runDbTest()}
                    />
                    <HelpIcon topic="admin.database.test" label="What the test checks" />
                  </div>
                </>
              )}
            </>
          )}

          {moving && (
            <div className="flex flex-col gap-3 text-sm">
              <p className="m-0 font-medium">
                <i className={`pi mr-2 ${restart === 'failed' ? 'pi-times-circle text-red-600' : 'pi-spin pi-spinner'}`} aria-hidden />
                {restart === 'waiting'
                  ? 'Restarting on the new database — about half a minute. This page follows.'
                  : restart === 'failed'
                    ? 'The move failed and nothing was kept.'
                    : `Moving the portal: ${phaseLabel(moving.phase).toLowerCase()}`}
              </p>
              {isMoveRunning(moving.phase) && moving.tablesTotal > 0 && (
                <>
                  <ProgressBar value={Math.round((moving.tablesDone / moving.tablesTotal) * 100)} showValue={false} style={{ height: '0.5rem' }} />
                  <p className="m-0 text-[var(--text-color-secondary)]">
                    {moving.tablesDone} of {moving.tablesTotal} tables{moving.currentTable && ` · ${moving.currentTable}`}
                  </p>
                </>
              )}
              {restart === 'failed' && (
                <Message
                  severity="error"
                  className="w-full justify-start"
                  content={
                    <span className="text-sm">
                      {moving.error} The portal is set up and still on {dbCurrent?.providerLabel ?? 'its database'}; you can
                      move it later from Admin → Database.{' '}
                      <a href="/admin/settings">Open the settings.</a>
                    </span>
                  }
                />
              )}
            </div>
          )}

          {stepId === 'finish' && !moving && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
              <dt className="font-medium">Database</dt>
              <dd>
                {connectFirst
                  ? `${PROVIDERS.find((p) => p.value === connFields.provider)?.label ?? connFields.provider} at ${connFields.server} / ${connFields.database}, connected`
                  : dbChoice === 'move'
                  ? `move to ${PROVIDERS.find((p) => p.value === dbFields.provider)?.label ?? dbFields.provider} at ${dbFields.server} / ${dbFields.database}, then restart`
                  : `keep ${dbCurrent?.providerLabel ?? 'the current database'}`}
              </dd>
              <dt className="font-medium">Administrator</dt>
              <dd>{displayName} &lt;{email}&gt;</dd>
              <dt className="font-medium">Portal name</dt>
              <dd>{portalName}</dd>
              <dt className="font-medium">Web URL</dt>
              <dd className="break-all">{publicUrl.trim().replace(/\/+$/, '') || 'not set'}</dd>
              <dt className="font-medium">API URL</dt>
              <dd className="break-all">{apiUrl.trim().replace(/\/+$/, '') || 'the same address'}</dd>
              <dt className="font-medium">Accent</dt>
              <dd className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 rounded" style={{ background: accentColor }} />
                {accentColor}
              </dd>
              <dt className="font-medium">Email</dt>
              <dd>{smtpHost}:{smtpPort} — from {fromAddress}</dd>
              <dt className="font-medium">JWT</dt>
              <dd className="break-all">
                {jwtIssuer.trim() || JWT_DEFAULTS.issuer} → {jwtAudience.trim() || JWT_DEFAULTS.audience}; access{' '}
                {jwtAccessMinutes.trim() || JWT_DEFAULTS.accessMinutes} min, refresh {jwtRefreshDays.trim() || JWT_DEFAULTS.refreshDays}{' '}
                days; {jwtSigningKey.trim() ? 'a new signing key, used after the next restart' : 'the current signing key'}
              </dd>
            </dl>
          )}
        </div>

        {!moving && (
          <div className="mt-8 flex justify-between">
            <Button
              label="Back"
              icon="pi pi-arrow-left"
              outlined
              // Nothing before the administrator goes back: the token is
              // checked and a connected database stays connected.
              disabled={stepId === 'access' || stepId === 'connection' || stepId === 'admin' || busy}
              onClick={() => setStepId(steps[index - 1])}
            />
            {stepId === 'access' && <Button label="Verify token" icon="pi pi-arrow-right" iconPos="right" loading={busy} onClick={() => void verifyToken(token)} />}
            {stepId !== 'access' && stepId !== 'connection' && stepId !== 'finish' && (
              <Button label="Next" icon="pi pi-arrow-right" iconPos="right" onClick={next} />
            )}
            {stepId === 'finish' && (
              <Button
                label={dbChoice === 'move' ? 'Finish setup and move' : 'Finish setup'}
                icon="pi pi-check"
                loading={busy}
                onClick={() => void finish()}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
