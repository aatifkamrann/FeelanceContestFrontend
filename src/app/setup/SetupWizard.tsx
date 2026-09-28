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
import DatabaseTestResult from '@/components/DatabaseTestResult';
import HelpIcon from '@/components/HelpIcon';
import JwtRules from '@/components/JwtRules';
import PasswordRules from '@/components/PasswordRules';
import { passwordAcceptable } from '@/lib/password';
import { JWT_DEFAULTS, JWT_KEYS, jwtProblem, newSigningKey } from '@/lib/jwt';
import { PORTAL_NAME, apiFetch } from '@/lib/api';
import { PROVIDERS, isMoveRunning, phaseLabel, testSetupDatabase, type DatabaseMove, type DatabaseTest } from '@/lib/database';

type DatabaseInfo = { provider: string; providerLabel: string; server: string; database: string };
type Defaults = { values: Record<string, string | null>; locked: string[]; database: DatabaseInfo };

const STEPS = [
  { label: 'Access' },
  { label: 'Administrator' },
  { label: 'Branding' },
  { label: 'Email' },
  { label: 'JWT' },
  { label: 'Database' },
  { label: 'Finish' },
];

/** The database step's index — the one step that can end with the API restarting. */
const DATABASE = 5;

const FINISH = STEPS.length - 1;

export default function SetupWizard({
  initialToken,
  apiDown,
}: {
  initialToken: string;
  apiDown: boolean;
}) {
  const [step, setStep] = useState(0);
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(apiDown ? 'The API is unreachable right now.' : null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState<string[]>([]);

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
  const [dbProvider, setDbProvider] = useState('sqlserver');
  const [dbConnectionString, setDbConnectionString] = useState('');
  const [dbTesting, setDbTesting] = useState(false);
  const [dbTest, setDbTest] = useState<{ forString: string; result: DatabaseTest } | null>(null);
  // Once Finish answered "moving": the move being followed, then the restart.
  const [moving, setMoving] = useState<DatabaseMove | null>(null);
  const [restart, setRestart] = useState<'none' | 'waiting' | 'failed'>('none');

  const autoVerified = useRef(false);

  const isLocked = (key: string) => locked.includes(key);

  async function verifyToken(candidate: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/setup/defaults', {
        headers: { 'X-Setup-Token': candidate },
      });
      if (res.status === 401) {
        setError('That setup token is not valid. The current one is in the API logs.');
        return;
      }
      if (res.status === 404) {
        window.location.href = '/';
        return;
      }
      if (!res.ok) {
        setError(`The API answered ${res.status}.`);
        return;
      }
      const defaults = (await res.json()) as Defaults;
      setLocked(defaults.locked);
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
      setDbProvider(defaults.database.provider === 'postgres' ? 'sqlserver' : 'postgres');
      setStep(1);
    } catch {
      setError('Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialToken && !autoVerified.current) {
      autoVerified.current = true;
      void verifyToken(initialToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function next() {
    setError(null);
    if (step === 1) {
      if (!displayName.trim()) return setError('A display name is required.');
      if (!email.includes('@')) return setError('A valid email is required.');
      if (!passwordAcceptable(password)) return setError('The password needs everything ticked below it.');
      if (password !== confirm) return setError('The passwords do not match.');
    }
    if (step === 2 && !portalName.trim()) return setError('The portal needs a name.');
    if (step === 4) {
      for (const [key, value] of Object.entries(jwtValues())) {
        const problem = isLocked(key) ? null : jwtProblem(key, value);
        if (problem) return setError(problem);
      }
    }
    if (step === DATABASE && dbChoice === 'move' && !dbTested)
      return setError('Test the connection first — a move starts only from a passing test of this exact string.');
    setStep(step + 1);
  }

  const dbTested = dbTest !== null && dbTest.forString === dbConnectionString && dbTest.result.problem === null;

  async function runDbTest() {
    setDbTesting(true);
    setError(null);
    setDbTest(null);
    try {
      const result = await testSetupDatabase(token, { provider: dbProvider, connectionString: dbConnectionString });
      setDbTest({ forString: dbConnectionString, result });
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
          database: dbChoice === 'move' ? { provider: dbProvider, connectionString: dbConnectionString } : null,
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
            phase: 'checking', target: dbProvider, targetServer: null, targetDatabase: null, currentTable: null,
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
          <Steps model={STEPS} activeIndex={step} readOnly />
        </div>

        {error && (
          <div className="mt-6">
            <Message severity="error" text={error} className="w-full" />
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4">
          {step === 0 && (
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

          {step === 1 && (
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

          {step === 2 && (
            <>
              <div className={field}>
                <label className={label} htmlFor="portalName">Portal name</label>
                <InputText id="portalName" value={portalName} onChange={(e) => setPortalName(e.target.value)} autoFocus disabled={isLocked('branding.portalName')} />
              </div>
              <div className={field}>
                <label className={label} htmlFor="publicUrl">
                  Web URL
                  <HelpIcon topic="settings.branding.publicUrl" label="Web URL" />{' '}
                  {isLocked('branding.publicUrl') && <Tag value="set by environment" severity="info" className="ml-2" />}
                </label>
                <InputText id="publicUrl" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} disabled={isLocked('branding.publicUrl')} />
              </div>
              <div className={field}>
                <label className={label} htmlFor="apiUrl">
                  API URL
                  <HelpIcon topic="settings.branding.apiUrl" label="API URL" />{' '}
                  {isLocked('branding.apiUrl') && <Tag value="set by environment" severity="info" className="ml-2" />}
                </label>
                <InputText
                  id="apiUrl"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="blank — the pages' own address"
                  disabled={isLocked('branding.apiUrl')}
                />
              </div>
              <div className={field}>
                <label className={label} htmlFor="accentColor">Accent color</label>
                <AccentPicker id="accentColor" value={accentColor} onChange={setAccentColor} defaultValue="#0f766e" />
              </div>
            </>
          )}

          {step === 3 && (
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
                      {isLocked(key) && <Tag value="set by environment" severity="info" className="ml-2" />}
                    </label>
                    <InputText id={cfg.id} value={cfg.value} onChange={(e) => cfg.set(e.target.value)} disabled={isLocked(key)} />
                  </div>
                );
              })}
            </>
          )}

          {step === 4 && (
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
                      {isLocked(key) && <Tag value="set by environment" severity="info" className="ml-2" />}
                    </label>
                    <InputText id={id} value={value} onChange={(e) => set(e.target.value)} disabled={isLocked(key)} />
                  </div>
                ))}
              </div>
              <div className={field}>
                <label className={label} htmlFor="jwtSigningKey">
                  Signing key (leave blank to keep current key)
                  <HelpIcon topic={`settings.${JWT_KEYS.signingKey}`} label="Signing key" />{' '}
                  {isLocked(JWT_KEYS.signingKey) && <Tag value="set by environment" severity="info" className="ml-2" />}
                </label>
                <div className="flex items-center gap-2">
                  <Password
                    inputId="jwtSigningKey"
                    value={jwtSigningKey}
                    onChange={(e) => setJwtSigningKey(e.target.value)}
                    placeholder="Current key"
                    feedback={false}
                    toggleMask
                    disabled={isLocked(JWT_KEYS.signingKey)}
                    className="min-w-0 flex-1"
                    inputClassName="w-full"
                  />
                  <Button
                    label="Generate"
                    icon="pi pi-key"
                    outlined
                    disabled={isLocked(JWT_KEYS.signingKey)}
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
                      {isLocked(key) && <Tag value="set by environment" severity="info" className="ml-2" />}
                    </label>
                    <InputText id={id} value={value} inputMode="numeric" onChange={(e) => set(e.target.value)} disabled={isLocked(key)} />
                  </div>
                ))}
              </div>
              <JwtRules />
            </>
          )}

          {step === DATABASE && !moving && (
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
                  . Keep it, or move to the other database now, before anybody else has used the portal.
                </p>
              </div>
              <SelectButton
                value={dbChoice}
                options={[
                  { label: `Keep ${dbCurrent?.providerLabel ?? 'this database'}`, value: 'keep' },
                  { label: dbCurrent?.provider === 'postgres' ? 'Move to SQL Server' : 'Move to PostgreSQL', value: 'move' },
                ]}
                onChange={(e) => {
                  if (e.value) setDbChoice(e.value);
                }}
                allowEmpty={false}
              />
              {dbChoice === 'move' && (
                <>
                  <div className={field}>
                    <label className={label}>Database</label>
                    <SelectButton
                      value={dbProvider}
                      options={PROVIDERS}
                      onChange={(e) => {
                        if (e.value) {
                          setDbProvider(e.value);
                          setDbTest(null);
                        }
                      }}
                      allowEmpty={false}
                    />
                  </div>
                  <div className={field}>
                    <label className={label} htmlFor="dbConnectionString">
                      Connection string
                      <HelpIcon topic="admin.database.test" label="What a connection string needs" />
                    </label>
                    <Password
                      inputId="dbConnectionString"
                      value={dbConnectionString}
                      onChange={(e) => setDbConnectionString(e.target.value)}
                      feedback={false}
                      toggleMask
                      className="w-full"
                      inputClassName="w-full font-mono text-xs"
                      placeholder={
                        dbProvider === 'sqlserver'
                          ? 'Server=host,1433;Database=winnersportal;User Id=…;Password=…;TrustServerCertificate=True'
                          : 'Host=host;Port=5432;Database=winnersportal;Username=…;Password=…'
                      }
                    />
                  </div>
                  {dbTest && <DatabaseTestResult provider={dbProvider} result={dbTest.result} />}
                  <div>
                    <Button
                      label="Test"
                      icon="pi pi-bolt"
                      outlined
                      loading={dbTesting}
                      disabled={dbConnectionString.trim().length === 0}
                      onClick={() => void runDbTest()}
                    />
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

          {step === FINISH && !moving && (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
              <dt className="font-medium">Database</dt>
              <dd>
                {dbChoice === 'move'
                  ? `move to ${PROVIDERS.find((p) => p.value === dbProvider)?.label ?? dbProvider}, then restart`
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
              disabled={step === 0 || step === 1 || busy}
              onClick={() => setStep(step - 1)}
            />
            {step === 0 && <Button label="Verify token" icon="pi pi-arrow-right" iconPos="right" loading={busy} onClick={() => void verifyToken(token)} />}
            {step > 0 && step < FINISH && <Button label="Next" icon="pi pi-arrow-right" iconPos="right" onClick={next} />}
            {step === FINISH && (
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
