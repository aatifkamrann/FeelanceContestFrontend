'use client';

import { Checkbox } from 'primereact/checkbox';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import HelpIcon from '@/components/HelpIcon';
import { PROVIDERS, type DatabaseConnection, type DatabaseConnectionFields } from '@/lib/database';

const AUTHENTICATION = [
  { label: 'SQL login', value: 'sql' },
  { label: 'Windows', value: 'windows' },
];

/** An address that carries no port: a named pipe, shared memory, LocalDB, or several PostgreSQL hosts. */
const portFixed = (f: DatabaseConnectionFields) =>
  /^(np|lpc):/i.test(f.server.trim()) ||
  /^\(localdb\)/i.test(f.server.trim()) ||
  (f.provider === 'postgres' && f.server.includes(','));

/**
 * A database connection as fields — the setup wizard's connect and move
 * steps and Admin → Database — so nobody types a connection string. With
 * `current`, the running connection, a blank password keeps the one in use
 * while the server and the user stay the same (the API holds the same rule).
 */
export default function DatabaseConnectionForm({
  value,
  onChange,
  current,
  disabled,
  idPrefix = 'db',
}: {
  value: DatabaseConnectionFields;
  onChange: (next: DatabaseConnectionFields) => void;
  current?: DatabaseConnection | null;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const set = (patch: Partial<DatabaseConnectionFields>) => onChange({ ...value, ...patch });
  const sqlServer = value.provider === 'sqlserver';
  const windows = sqlServer && value.authentication === 'windows';
  const noPort = portFixed(value);
  const sameAsCurrent =
    !!current &&
    current.provider === value.provider &&
    current.server.trim().toLowerCase() === value.server.trim().toLowerCase() &&
    current.port === value.port;
  const keepsPassword =
    sameAsCurrent && current!.passwordSet && current!.authentication === 'sql' && current!.userId === value.userId.trim();
  const advanced = sameAsCurrent ? current!.advanced : null;
  const id = (name: string) => `${idPrefix}-${name}`;
  const field = 'flex flex-col gap-1';
  const label = 'flex items-center gap-1 text-sm font-medium';

  return (
    <div className="flex flex-col gap-4">
      <div className={field}>
        <span className={label}>Database</span>
        <SelectButton
          value={value.provider}
          options={PROVIDERS}
          disabled={disabled}
          onChange={(e) => {
            if (!e.value || e.value === value.provider) return;
            // The other kind of database starts from its own defaults: no
            // port carried over, and Windows sign-in is SQL Server's alone.
            set({ provider: e.value, port: null, authentication: 'sql' });
          }}
          allowEmpty={false}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className={field}>
          <label className={label} htmlFor={id('server')}>
            Server <HelpIcon topic="database.connection.server" label="Server" />
          </label>
          <InputText
            id={id('server')}
            value={value.server}
            onChange={(e) => set({ server: e.target.value })}
            placeholder={sqlServer ? 'localhost, db.example.com or HOST\\SQLEXPRESS' : 'localhost or db.example.com'}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={field}>
          <label className={label} htmlFor={id('port')}>
            Port <HelpIcon topic="database.connection.port" label="Port" />
          </label>
          <InputText
            id={id('port')}
            value={value.port?.toString() ?? ''}
            inputMode="numeric"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
              set({ port: digits ? Number(digits) : null });
            }}
            placeholder={noPort ? 'none' : sqlServer ? '1433' : '5432'}
            disabled={disabled || noPort}
          />
        </div>
      </div>

      <div className={field}>
        <label className={label} htmlFor={id('database')}>
          Database name
        </label>
        <InputText
          id={id('database')}
          value={value.database}
          onChange={(e) => set({ database: e.target.value })}
          placeholder="winnersportal"
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {sqlServer && (
        <div className={field}>
          <span className={label}>
            Authentication <HelpIcon topic="database.connection.authentication" label="Authentication" />
          </span>
          {advanced ? (
            <p className="m-0 text-sm">
              <Tag value={advanced} severity="info" className="mr-2" />
              kept as it is — these fields cannot change this sign-in method.
            </p>
          ) : (
            <SelectButton
              value={value.authentication}
              options={AUTHENTICATION}
              disabled={disabled}
              onChange={(e) => {
                if (e.value) set({ authentication: e.value });
              }}
              allowEmpty={false}
            />
          )}
        </div>
      )}

      {windows ? (
        <p className="m-0 text-sm text-[var(--text-color-secondary)]">
          Signs in as the Windows account the API runs as — yours under Visual Studio or <code>dotnet run</code>, the
          service&apos;s account under the Windows service. That account needs a login on the server.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={field}>
            <label className={label} htmlFor={id('user')}>
              {sqlServer ? 'User ID' : 'User'}
            </label>
            <InputText
              id={id('user')}
              value={value.userId}
              onChange={(e) => set({ userId: e.target.value })}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className={field}>
            <label className={label} htmlFor={id('password')}>
              Password
            </label>
            <Password
              inputId={id('password')}
              value={value.password}
              onChange={(e) => set({ password: e.target.value })}
              placeholder={keepsPassword ? 'Leave blank to keep the current password' : undefined}
              feedback={false}
              toggleMask
              autoComplete="new-password"
              disabled={disabled}
              className="w-full"
              inputClassName="w-full"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <Checkbox
            inputId={id('encrypt')}
            checked={value.encrypt}
            onChange={(e) => set({ encrypt: e.checked ?? false })}
            disabled={disabled}
          />
          <label htmlFor={id('encrypt')} className="text-sm">
            <span className="font-medium">Encrypt</span>
            <HelpIcon topic="database.connection.encrypt" label="Encrypt" />
          </label>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            inputId={id('trust')}
            checked={value.trustServerCertificate}
            onChange={(e) => set({ trustServerCertificate: e.checked ?? false })}
            disabled={disabled || !value.encrypt}
          />
          <label htmlFor={id('trust')} className="text-sm">
            <span className="font-medium">Trust Server Certificate</span>
            <HelpIcon topic="database.connection.trustServerCertificate" label="Trust Server Certificate" />
          </label>
        </div>
      </div>
    </div>
  );
}
