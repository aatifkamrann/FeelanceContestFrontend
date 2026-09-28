'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Password } from 'primereact/password';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { InputSwitch } from 'primereact/inputswitch';
import { Dropdown } from 'primereact/dropdown';
import AccentPicker from '@/components/AccentPicker';
import HelpIcon from '@/components/HelpIcon';
import JwtRules from '@/components/JwtRules';
import LogoUpload from '@/components/LogoUpload';
import SiteHeader from '@/components/SiteHeader';
import { relativeTime, utcMoment } from '@/lib/opportunities';
import { JWT_KEYS, newSigningKey } from '@/lib/jwt';
import { apiFetch } from '@/lib/api';

type Setting = {
  key: string;
  label: string;
  isSecret: boolean;
  isBoolean: boolean;
  isMultiline: boolean;
  /** Present when the setting is a choice: the screen offers these and the API refuses anything else. */
  choices?: { value: string; label: string }[] | null;
  locked: boolean;
  envVar: string | null;
  value: string | null;
  hasValue: boolean;
  default: string | null;
  helpTopic: string | null;
};

/** The last test run on a setup, as the API keeps it for every administrator. */
type SetupTest = {
  ok: boolean;
  detail: string;
  testedAt: string;
  testedBy: string | null;
  /** A value of the setup has changed since, so this answer no longer speaks for what is saved. */
  changed: boolean;
};

/** One setup of a connection as the API reads it back: its fields keyed for this setup. */
type SetupDto = {
  id: string;
  name: string;
  enabled: boolean;
  /** An environment variable sets one of its values, so only the deployment can remove it. */
  locked: boolean;
  settings: Setting[];
  /** What still lives in it ("12 files"), which stops it being removed. */
  inUse?: string | null;
  /** Null until it has been tested. */
  lastTest?: SetupTest | null;
};

type Group = {
  name: string;
  label: string;
  /** The group's own fields — for a connection with setups, the ones that govern all of them. */
  settings: Setting[];
  listKey?: string | null;
  setups?: SetupDto[] | null;
  /** The fields a setup added here starts from, keyed as the main setup's. */
  template?: Setting[] | null;
};

/** A setup as the list keeps it — what the screen sends back under the group's list key. */
type SetupEntry = { id: string; name: string; enabled: boolean };

const MAIN_ID = 'main';
const MAX_SETUPS = 10;

/** The key one field of a setup is kept under: the main key itself for the main setup. */
const fieldKey = (key: string, setupId: string) =>
  setupId === MAIN_ID ? key : key.replace(/^([^.]+)\./, `$1.${setupId}.`);

/** The main key a setup's field stands for — `phone.s1a2b3c4d.provider` → `phone.provider`. */
const mainKey = (key: string) => key.replace(/^([^.]+)\.s[0-9a-f]{8}\./, '$1.');

const newSetupId = () => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return 's' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * What each connection calls a setup, and what being the active one means
 * for it. Only one setup of a connection is active at a time; switching one
 * on switches the others off. For GitHub and storage an inactive setup still
 * serves what already lives in it.
 */
const SETUP_WORDS: Record<string, { noun: string; add: string; intro: string; across: string }> = {
  github: {
    noun: 'GitHub App',
    add: 'Add a GitHub App',
    intro:
      'One App is active at a time: new entrant repositories are made through it. A repository already made stays with the App for its organization, active or not.',
    across: '',
  },
  storage: {
    noun: 'Store',
    add: 'Add a store',
    intro:
      'One store is active at a time: new files go to it. Every file is read back from the store it went to, so making another store active never strands what is in this one.',
    across: '',
  },
  email: {
    noun: 'Email setup',
    add: 'Add an email setup',
    intro:
      'One setup is active at a time: every email goes through it — an SMTP server, or Mailgun or Brevo over their HTTPS APIs.',
    across: '',
  },
  phone: {
    noun: 'SMS gateway',
    add: 'Add an SMS gateway',
    intro: 'One gateway is active at a time: every confirmation code is texted through it.',
    across: '',
  },
  ai: {
    noun: 'AI provider',
    add: 'Add an AI provider',
    intro: 'One provider is active at a time: every AI call goes to it.',
    across: 'Switches and limits',
  },
  identity: {
    noun: 'Verification provider',
    add: 'Add a verification provider',
    intro: 'One provider is active at a time: every member who verifies goes through it. Verdicts already recorded stay recorded.',
    across: 'Which doors ask',
  },
  preview: {
    noun: 'Build host',
    add: 'Add a build host',
    intro:
      'One host is active at a time: every claimed milestone of an opportunity that requires Docker Compose is built on it, and with a preview address set, run there for whoever may open it. A build already handed to a host finishes there.',
    across: '',
  },
};

/**
 * The three fields that only mean anything once the operator has chosen to
 * write the gateway request themselves — a named provider brings its own
 * address and body, and these would only mislead beside it.
 */
const CUSTOM_PHONE_FIELDS = ['phone.gatewayUrl', 'phone.gatewayAuthHeader', 'phone.gatewayBody'];

/**
 * The fields each way of sending email reads (Email/EmailProviders.cs keeps
 * the same lists). A setup shows the ones its choice reads and hides the
 * rest — kept, not cleared, so switching back needs nothing retyped. A field
 * in none of these, the choice itself and the From address, always shows.
 */
const EMAIL_FIELDS: Record<string, string[]> = {
  smtp: ['email.smtpHost', 'email.smtpPort', 'email.smtpUser', 'email.smtpPassword'],
  mailgun: ['email.apiKey', 'email.mailgunDomain', 'email.mailgunRegion'],
  brevo: ['email.apiKey'],
};
const EMAIL_PROVIDER_FIELDS = new Set(Object.values(EMAIL_FIELDS).flat());

/** Whether an email setup sending through `provider` reads this field; any other group's fields always show. */
const emailFieldShown = (key: string, provider: string | null) =>
  !EMAIL_PROVIDER_FIELDS.has(key) ||
  (EMAIL_FIELDS[provider?.trim().toLowerCase() || 'smtp'] ?? []).includes(key);

type Me = { email: string; displayName: string; role: string };

async function fetchMe(): Promise<Me | null> {
  const res = await apiFetch('/api/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  return res.json();
}

async function fetchSettings(): Promise<Group[]> {
  const res = await apiFetch('/api/settings');
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  const body = (await res.json()) as { groups: Group[] };
  return body.groups;
}

/** What the running API does with Redis, and whether the saved settings differ from what it started with. */
type RedisStatus = {
  active: boolean;
  connected: boolean;
  endpoints: string | null;
  onButUnusable: boolean;
  restartPending: boolean;
};
async function fetchRedisStatus(): Promise<RedisStatus> {
  const res = await apiFetch('/api/settings/redis-status');
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  return res.json();
}

/** Whether the JWT settings as saved are not yet what the running API signs with. */
async function fetchJwtStatus(): Promise<{ restartPending: boolean }> {
  const res = await apiFetch('/api/settings/jwt-status');
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  return res.json();
}

/**
 * How each connection proves one setup, against its saved values:
 *  - GitHub: the whole credential chain — PEM parse, app JWT, installation on
 *    the org, repo administration — by creating, reading back, and deleting a
 *    scratch repository. A mis-pasted key fails here in ten seconds instead of
 *    at the first entrant's missing repository. The transfer token is checked
 *    against the same repository, since GitHub will not transfer as the App.
 *  - Storage: upload, read back through a signed URL, delete — the exact path
 *    every attachment takes, since uploads reach the store through the API —
 *    and a refusal of a public URL on http under a page on https.
 *  - Email: the wizard's line, honoured — a real email to the administrator
 *    standing right there, through the same connection, sender and template
 *    as every notification.
 *  - Phone: one real text with a real code in it, to a number the
 *    administrator types; the gateway's own words come back on failure.
 *  - AI: one tiny round-trip through the provider, key and model. It spends
 *    and counts one call, and works with the master switch still off.
 */
const TESTS: Record<string, { path: string; label: string; icon: string; says: string; number?: boolean }> = {
  github: {
    path: 'test-github',
    label: 'Test GitHub',
    icon: 'pi pi-github',
    says: 'Creates, reads back, and deletes a scratch repository in this setup’s organization, and checks the transfer token can hand a winner’s repository over.',
  },
  storage: {
    path: 'test-storage',
    label: 'Test storage',
    icon: 'pi pi-cloud-upload',
    says: 'Uploads, reads back through a signed URL and deletes a test file from the server — the path every upload takes. A browser must still reach the Public base URL to download and preview.',
  },
  email: {
    path: 'test-email',
    label: 'Send test email',
    icon: 'pi pi-envelope',
    says: 'Sends a real email to your own address through this setup — if it arrives, notifications will too.',
  },
  phone: {
    path: 'test-phone',
    label: 'Send test text',
    icon: 'pi pi-mobile',
    says: 'Texts a real code to that number through this gateway — what a new member will see.',
    number: true,
  },
  ai: {
    path: 'test-ai',
    label: 'Test provider',
    icon: 'pi pi-sparkles',
    says: 'One tiny round-trip through this provider, key, and model — it spends (and counts) one call. Works with the master switch still off.',
  },
  identity: {
    path: 'test-identity',
    label: 'Test Didit',
    icon: 'pi pi-id-card',
    says: 'Asks the provider for a session that does not exist: a good key is told so, a bad key is refused. Nothing is opened and nothing is billed. Works with the master switch still off.',
  },
  preview: {
    path: 'test-preview',
    label: 'Test build host',
    icon: 'pi pi-server',
    says: 'Asks the agent for its health — Docker, Compose, free disk, whether a build is running, and with a preview address set, whether the host serves previews under the same name. A wrong token is refused. Nothing is built or run.',
  },
};

/** "Passed 3h ago by admin@example.com" — who last tested a setup, and how it went. */
const testedLine = (last: SetupTest) =>
  `${last.ok ? 'Passed' : 'Failed'} ${relativeTime(last.testedAt)}${last.testedBy ? ` by ${last.testedBy}` : ''}`;

/**
 * The connection status on a setup's card, folded or not: its last test as
 * the API keeps it, so it reads the same after a reload and for every
 * administrator. A value saved differently since the test is a state of its
 * own — the old answer, good or bad, no longer speaks for the setup.
 */
function SetupTestBadge({ last, testing }: { last?: SetupTest | null; testing: boolean }) {
  if (testing) return <Tag value="Testing…" severity="info" icon="pi pi-spin pi-spinner" />;
  if (!last)
    return (
      <Tag
        value="Not tested"
        severity="secondary"
        icon="pi pi-minus-circle"
        title="No test has been run on this setup yet — press Test to run one."
      />
    );
  if (last.changed)
    return (
      <Tag
        value="Changed since test"
        severity="warning"
        icon="pi pi-refresh"
        title={`${testedLine(last)}, but a value has changed since — test it again.`}
      />
    );
  return last.ok ? (
    <Tag value="Connected" severity="success" icon="pi pi-check-circle" title={`${testedLine(last)}: ${last.detail}`} />
  ) : (
    <Tag value="Connection failed" severity="danger" icon="pi pi-times-circle" title={`${testedLine(last)}: ${last.detail}`} />
  );
}

/** A setup's test on this visit: whichever of its two Test buttons ran it, and what it answered. */
type TestRun = {
  testing: boolean;
  /** The number a text test goes to. */
  to: string;
  /**
   * `kept`: the API recorded it as the setup's last test. One it did not —
   * the AI call ceiling, a test that could not run — is only shown here.
   */
  result: { ok: boolean; detail: string; kept: boolean } | null;
};

const IDLE_RUN: TestRun = { testing: false, to: '', result: null };

/** One setup's proof, run against what is saved — a setup not saved yet has nothing to test. */
function SetupTestRow({
  kind,
  numberId,
  saved,
  dirty,
  last,
  run,
  onTo,
  onRun,
}: {
  kind: string;
  /** The number field's id, so the Test button in the card header can put the cursor in it. */
  numberId: string;
  saved: boolean;
  dirty: boolean;
  last?: SetupTest | null;
  /** Held by the screen, so the header's Test button and badge share it. */
  run: TestRun;
  onTo: (to: string) => void;
  onRun: () => void;
}) {
  const test = TESTS[kind];
  if (!test) return null;
  const { testing, to, result } = run;

  // This visit's answer, in full (a text test's says which number to check),
  // until a save changes the setup under it; after that, or on a fresh visit,
  // the last test the API kept.
  const shown = result && (!result.kept || !last?.changed) ? result : null;

  return (
    <div className="rounded-lg border border-[var(--surface-border)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        {test.number && (
          <InputText
            id={numberId}
            value={to}
            onChange={(e) => onTo(e.target.value)}
            placeholder="+92 300 1234567"
            className="p-inputtext-sm w-48"
            aria-label="Number to text"
          />
        )}
        <Button
          label={test.label}
          icon={test.icon}
          size="small"
          outlined
          loading={testing}
          disabled={!saved || testing || (test.number && to.trim().length === 0)}
          onClick={onRun}
        />
        <span className="text-sm text-[var(--text-color-secondary)]">
          {saved ? test.says : 'Save this setup first — the test uses saved values.'}
          {saved && dirty && ' Save your changes first — the test uses saved values.'}
        </span>
      </div>
      {shown ? (
        <Message
          severity={shown.ok ? 'success' : 'error'}
          text={shown.detail}
          className="mt-2 w-full justify-start"
        />
      ) : (
        last && (
          <Message
            severity={last.changed ? 'warn' : last.ok ? 'success' : 'error'}
            text={
              `Last test, ${utcMoment(last.testedAt)}${last.testedBy ? ` by ${last.testedBy}` : ''}: ${last.detail}` +
              (last.changed ? ' A value has been saved differently since — test again.' : '')
            }
            className="mt-2 w-full justify-start"
          />
        )
      )}
    </div>
  );
}

/**
 * Where the legal text ends up, so the administrator can read it the way
 * an entrant does: the public /terms page, the signup checkbox, and the
 * acceptance prompt a raised version puts in front of every signed-in user.
 */
function TermsRow() {
  return (
    <div className="rounded-lg border border-[var(--surface-border)] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/terms" target="_blank" className="no-underline">
          <Button label="View published terms" icon="pi pi-external-link" size="small" outlined />
        </Link>
        <span className="text-sm text-[var(--text-color-secondary)]">
          New accounts accept them at signup. Raising the version asks every signed-in user again,
          and until they accept, nothing of theirs saves. Leave the text empty and nobody is asked.
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link href="/privacy" target="_blank" className="no-underline">
          <Button label="View privacy policy" icon="pi pi-external-link" size="small" outlined />
        </Link>
        <span className="text-sm text-[var(--text-color-secondary)]">
          Linked beside the terms on the join form. Unversioned — nobody is asked to accept it
          again — so an edit is live the moment it saves. Leave it empty and the link is not shown.
        </span>
      </div>
    </div>
  );
}

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  // key → new value; null = clear. Only dirty keys are sent. A connection's
  // list of setups is one of them: its list key, holding the list as JSON.
  const [dirty, setDirty] = useState<Record<string, string | null>>({});
  // Which setup cards are unfolded, keyed "group:id" — every connection has
  // a "main". A card nobody has touched follows the default in the render
  // (open when it is the only one, or new).
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Each setup's test on this visit, keyed the same way: held here rather
  // than in the card, so the Test button in the header and the one inside
  // are one test, and a folded card still knows it is running.
  const [runs, setRuns] = useState<Record<string, TestRun>>({});

  const router = useRouter();
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    enabled: me.data?.role === 'admin',
  });

  // Signed out: the sign-in page is one screen for the whole portal, not
  // one per admin page — it brings you back here afterwards.
  useEffect(() => {
    if (me.data === null) router.replace('/login?next=/admin/settings');
  }, [me.data, router]);

  const save = useMutation({
    mutationFn: async (updates: Record<string, string | null>) => {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      if (res.status === 204) return;
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `The API answered ${res.status}.`);
    },
    onSuccess: () => {
      setDirty({});
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      void queryClient.invalidateQueries({ queryKey: ['jwt-status'] });
      void queryClient.invalidateQueries({ queryKey: ['redis-status'] });
      // A raised terms version is owed by the administrator too; refreshing
      // identity raises the prompt at once instead of at the next reload.
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      // The name, the accent on the tab icon and the rest of the public
      // branding redraw now, not at the next reload.
      void queryClient.invalidateQueries({ queryKey: ['public', 'branding'] });
      toast.current?.show({ severity: 'success', summary: 'Saved', detail: 'Settings updated.' });
    },
    onError: (err: Error) => {
      toast.current?.show({ severity: 'error', summary: 'Not saved', detail: err.message, life: 8000 });
    },
  });

  const jwtStatus = useQuery({
    queryKey: ['jwt-status'],
    queryFn: fetchJwtStatus,
    enabled: me.data?.role === 'admin',
  });
  const redisStatus = useQuery({
    queryKey: ['redis-status'],
    queryFn: fetchRedisStatus,
    enabled: me.data?.role === 'admin',
  });

  // Every session ends, this one with them: the answer clears this browser's
  // cookie, so the sign-in page is the only place left to go.
  const revoke = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/settings/revoke-sessions', { method: 'POST' });
      if (res.ok) return;
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `The API answered ${res.status}.`);
    },
    onSuccess: () => {
      window.location.href = '/login?next=/admin/settings&revoked=1';
    },
    onError: (err: Error) => {
      toast.current?.show({ severity: 'error', summary: 'Sessions not revoked', detail: err.message, life: 8000 });
    },
  });

  const confirmRevoke = () =>
    confirmDialog({
      header: 'Revoke all sessions?',
      icon: 'pi pi-exclamation-triangle',
      message:
        'Everyone signed in — in a browser or through an app — is signed out now and must sign in again. ' +
        'That includes you: this page goes to the sign-in form.',
      acceptLabel: 'Revoke All',
      rejectLabel: 'Cancel',
      acceptClassName: 'p-button-danger',
      defaultFocus: 'reject',
      accept: () => revoke.mutate(),
    });

  // Still loading, or signed out and on the way to the sign-in page.
  if (me.isLoading || me.data === null) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <i className="pi pi-spinner pi-spin text-3xl" />
      </main>
    );
  }
  if (me.data && me.data.role !== 'admin') {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
            <p className="mt-3 font-medium">Settings are for portal administrators</p>
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
  if (me.isError || settings.isError) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
            <p className="mt-3 font-medium">Settings could not be loaded</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Nothing has changed — this screen only reads them. Is the API up?
            </p>
            <Button
              label="Try again"
              className="mt-4"
              outlined
              onClick={() => {
                void me.refetch();
                void settings.refetch();
              }}
            />
          </div>
        </main>
      </>
    );
  }

  const dirtyCount = Object.keys(dirty).length;

  // Reflect an unsaved toggle immediately, so flipping the master switch
  // greys its group out before you press save.
  const allSettings =
    settings.data?.flatMap((g) => [...g.settings, ...(g.setups ?? []).flatMap((s) => s.settings)]) ?? [];
  const aiEnabledSetting = allSettings.find((s) => s.key === 'ai.enabled');
  const aiEnabled =
    ('ai.enabled' in dirty ? dirty['ai.enabled'] : aiEnabledSetting?.value) === 'true';
  const identityEnabledSetting = allSettings.find((s) => s.key === 'identity.enabled');
  const identityEnabled =
    ('identity.enabled' in dirty ? dirty['identity.enabled'] : identityEnabledSetting?.value) === 'true';
  const redisEnabledSetting = allSettings.find((s) => s.key === 'redis.enabled');
  const redisEnabled =
    ('redis.enabled' in dirty ? dirty['redis.enabled'] : redisEnabledSetting?.value) === 'true';
  // The two groups with a master switch: while it is off, the rest of the
  // group is shown as the inert thing it is.
  const governedOff = (group: string, key: string) =>
    (group === 'ai' && key !== 'ai.enabled' && !aiEnabled) ||
    (group === 'identity' && key !== 'identity.enabled' && !identityEnabled) ||
    (group === 'redis' && key !== 'redis.enabled' && !redisEnabled);

  // Dirty means *different*, not merely touched: toggling a switch back to
  // where it started should clear it, so save never writes a no-op audit row.
  // Secrets are exempt — their stored value is never sent to the browser, so
  // there is nothing to compare against.
  const setValue = (key: string, value: string | null) =>
    setDirty((d) => {
      const original = allSettings.find((s) => s.key === key);
      if (original && !original.isSecret && (original.value ?? '') === (value ?? '')) {
        const { [key]: _dropped, ...rest } = d;
        return rest;
      }
      return { ...d, [key]: value };
    });
  const revert = (key: string) =>
    setDirty((d) => {
      const { [key]: _, ...rest } = d;
      return rest;
    });
  const valueOf = (s: Setting) => (s.key in dirty ? dirty[s.key] : s.value);

  // ------------------------------------------------------------ setups

  const patchRun = (key: string, change: Partial<TestRun>) =>
    setRuns((r) => ({ ...r, [key]: { ...(r[key] ?? IDLE_RUN), ...change } }));

  // A test runs against what is saved and the API keeps its answer, so the
  // settings are read again — for the badge — before the answer shows. Run
  // from the header of a folded card, the answer also comes as a toast:
  // there is nowhere else on screen for it.
  const runTest = async (kind: string, setupId: string, name: string, to: string, announce: boolean) => {
    const test = TESTS[kind];
    const key = `${kind}:${setupId}`;
    patchRun(key, { testing: true, result: null });
    let result: NonNullable<TestRun['result']>;
    try {
      const res = await apiFetch(`/api/settings/${test.path}?setup=${encodeURIComponent(setupId)}`, {
        method: 'POST',
        ...(test.number
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) }
          : {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        detail?: string;
        error?: string;
        last?: SetupTest | null;
      };
      if (!res.ok) throw new Error(data.error ?? `The API answered ${res.status}.`);
      if (data.last) await queryClient.invalidateQueries({ queryKey: ['settings'] });
      result = { ok: !!data.ok, detail: data.detail ?? '', kept: !!data.last };
    } catch (err) {
      result = { ok: false, detail: err instanceof Error ? err.message : 'The test could not run.', kept: false };
    }
    patchRun(key, { testing: false, result });
    if (announce)
      toast.current?.show({
        severity: result.ok ? 'success' : 'error',
        summary: `${name.trim() || 'This setup'}: ${result.ok ? 'test passed' : 'test failed'}`,
        detail: result.detail,
        life: result.ok ? 6000 : 10000,
      });
  };

  const savedList = (group: Group): SetupEntry[] =>
    (group.setups ?? []).map(({ id, name, enabled }) => ({ id, name, enabled }));
  const listOf = (group: Group): SetupEntry[] => {
    const pending = group.listKey ? dirty[group.listKey] : undefined;
    return typeof pending === 'string' ? (JSON.parse(pending) as SetupEntry[]) : savedList(group);
  };
  // The list is dirty only while it differs from what was saved, like any field.
  const setList = (group: Group, next: SetupEntry[], dropKeys: string[] = []) =>
    setDirty((d) => {
      const rest = Object.fromEntries(
        Object.entries(d).filter(([k]) => k !== group.listKey && !dropKeys.includes(k)),
      );
      return JSON.stringify(next) === JSON.stringify(savedList(group))
        ? rest
        : { ...rest, [group.listKey!]: JSON.stringify(next) };
    });
  // A setup's fields as the screen edits them: saved ones as read back, a new
  // one from the template, keyed for its id.
  const fieldsOf = (group: Group, id: string): Setting[] =>
    group.setups?.find((s) => s.id === id)?.settings ??
    (group.template ?? []).map((t) => ({ ...t, key: fieldKey(t.key, id) }));

  // `action`: a button beside a one-line box — the signing key's Generate.
  const renderField = (s: Setting, governed: boolean, action?: ReactNode) => {
    const isDirty = s.key in dirty;
    const shown = isDirty ? dirty[s.key] ?? '' : s.value ?? '';
    const disabled = s.locked || governed;
    return (
      <div className={`flex flex-col gap-1 ${governed ? 'opacity-60' : ''}`} key={s.key}>
        <label className="text-sm font-medium" htmlFor={s.key}>
          {s.label}
          {s.helpTopic && <HelpIcon topic={s.helpTopic} label={s.label} />}{' '}
          {s.locked && (
            <Tag value={s.envVar ?? 'env'} severity="info" className="ml-1" title="Set by environment variable — edit the deployment, not this form." />
          )}
          {s.isSecret && !s.locked && (
            <Tag value={s.hasValue ? 'set' : 'not set'} severity={s.hasValue ? 'success' : 'warning'} className="ml-1" />
          )}
          {isDirty && <Tag value="unsaved" severity="danger" className="ml-1" />}
        </label>
        {s.choices?.length ? (
          <div className="flex items-center gap-2">
            <Dropdown
              inputId={s.key}
              value={shown}
              options={s.choices}
              optionLabel="label"
              optionValue="value"
              onChange={(e) => setValue(s.key, e.value as string)}
              disabled={disabled}
              className="min-w-0 flex-1"
            />
            {isDirty && <Button icon="pi pi-undo" text title="Revert" onClick={() => revert(s.key)} />}
          </div>
        ) : s.isBoolean ? (
          <div className="flex items-center gap-3">
            <InputSwitch
              inputId={s.key}
              checked={shown === 'true'}
              onChange={(e) => setValue(s.key, e.value ? 'true' : 'false')}
              disabled={disabled}
            />
            <span className="text-sm text-[var(--text-color-secondary)]">{shown === 'true' ? 'On' : 'Off'}</span>
            {isDirty && <Button icon="pi pi-undo" text title="Revert" onClick={() => revert(s.key)} />}
          </div>
        ) : s.isSecret ? (
          <div className="flex items-center gap-2">
            <Password
              inputId={s.key}
              value={isDirty ? dirty[s.key] ?? '' : ''}
              onChange={(e) => setValue(s.key, e.target.value)}
              placeholder={s.hasValue ? 'Type to replace' : 'Not set'}
              feedback={false}
              toggleMask
              disabled={disabled}
              className="min-w-0 flex-1"
              inputClassName="w-full"
            />
            {action}
            {s.hasValue && !disabled && s.key !== JWT_KEYS.signingKey && (
              <Button icon="pi pi-times" severity="danger" text title="Clear this secret" onClick={() => setValue(s.key, null)} />
            )}
            {isDirty && <Button icon="pi pi-undo" text title="Revert" onClick={() => revert(s.key)} />}
          </div>
        ) : s.key === 'branding.accentColor' ? (
          <div className="flex items-center gap-2">
            <AccentPicker
              id={s.key}
              value={shown}
              onChange={(hex) => setValue(s.key, hex)}
              defaultValue={s.default}
              disabled={disabled}
            />
            {isDirty && <Button icon="pi pi-undo" text title="Revert" onClick={() => revert(s.key)} />}
          </div>
        ) : s.isMultiline ? (
          <div className="flex items-start gap-2">
            <InputTextarea
              id={s.key}
              value={shown}
              onChange={(e) => setValue(s.key, e.target.value)}
              disabled={disabled}
              rows={12}
              className="min-w-0 flex-1 resize-y font-mono text-sm"
            />
            {isDirty && <Button icon="pi pi-undo" text title="Revert" onClick={() => revert(s.key)} />}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <InputText
              id={s.key}
              value={shown}
              onChange={(e) => setValue(s.key, e.target.value)}
              disabled={disabled}
              className="min-w-0 flex-1"
            />
            {action}
            {isDirty && <Button icon="pi pi-undo" text title="Revert" onClick={() => revert(s.key)} />}
          </div>
        )}
      </div>
    );
  };

  const renderSetups = (group: Group) => {
    const words = SETUP_WORDS[group.name];
    const list = listOf(group);
    const saved = group.setups ?? [];
    const removed = saved.filter((s) => !list.some((e) => e.id === s.id));
    const active = list.find((e) => e.enabled);

    const rename = (id: string, name: string) =>
      setList(group, list.map((e) => (e.id === id ? { ...e, name } : e)));
    // One active at a time: switching a setup on switches every other off.
    const activate = (id: string, on: boolean) =>
      setList(group, list.map((e) => ({ ...e, enabled: e.id === id ? on : on ? false : e.enabled })));
    const remove = (id: string) =>
      setList(
        group,
        list.filter((e) => e.id !== id),
        fieldsOf(group, id).map((f) => f.key),
      );
    // Brought back as it was saved — but inactive, if another setup has been
    // made active since.
    const restore = (setup: SetupDto) => {
      const at = Math.min(saved.findIndex((s) => s.id === setup.id), list.length);
      const next = [...list];
      next.splice(at, 0, { id: setup.id, name: setup.name, enabled: setup.enabled && !active });
      setList(group, next);
    };
    const add = () => {
      const id = newSetupId();
      let n = list.length + 1;
      while (list.some((e) => e.name.toLowerCase() === `${words.noun} ${n}`.toLowerCase())) n++;
      setList(group, [...list, { id, name: `${words.noun} ${n}`, enabled: false }]);
      setOpen((o) => ({ ...o, [`${group.name}:${id}`]: true }));
    };

    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm text-[var(--text-color-secondary)]">
          {words.intro}{' '}
          {group.listKey && <HelpIcon topic={`settings.${group.listKey}`} label={`${group.label} setups`} />}
        </p>

        {list.map((entry) => {
          const dto = saved.find((s) => s.id === entry.id);
          const isNew = !dto;
          const fields = fieldsOf(group, entry.id);
          const fieldsDirty = fields.some((f) => f.key in dirty);
          const entryDirty = isNew || dto.name !== entry.name || dto.enabled !== entry.enabled;
          const cardKey = `${group.name}:${entry.id}`;
          const isOpen = open[cardKey] ?? (list.length === 1 || isNew);
          const nameMissing = entry.name.trim().length === 0;
          const test = TESTS[group.name];
          const run = runs[cardKey] ?? IDLE_RUN;
          const numberId = `test-to-${group.name}-${entry.id}`;
          // A text needs a number, and the number field is inside the card:
          // with none typed, the header's Test opens the card and waits there.
          const needsNumber = !!test?.number && run.to.trim().length === 0;
          const testFromHeader = () => {
            if (needsNumber) {
              setOpen((o) => ({ ...o, [cardKey]: true }));
              setTimeout(() => document.getElementById(numberId)?.focus(), 0);
              return;
            }
            void runTest(group.name, entry.id, entry.name, run.to, !isOpen);
          };
          // The phone's custom request fields grey out as soon as this
          // setup's provider changes, rather than after the save.
          const provider = fields.find((f) => mainKey(f.key) === 'phone.provider');
          const phoneProvider = provider ? valueOf(provider) : null;
          // An email setup shows only what its way of sending reads, and
          // changes with the choice before the save, like the phone's.
          const sendThrough = fields.find((f) => mainKey(f.key) === 'email.provider');
          const emailProvider = sendThrough ? valueOf(sendThrough) : null;
          const cannotRemove = dto?.locked
            ? 'An environment variable sets one of its values — remove it from the deployment first.'
            : dto?.inUse
              ? `Holds ${dto.inUse} — leave it inactive instead; what is there stays reachable.`
              : null;

          return (
            <section
              key={entry.id}
              className={`rounded-lg border ${entry.enabled ? 'border-[var(--surface-border)]' : 'border-dashed border-[var(--surface-border)]'} bg-[var(--surface-card)]`}
              aria-label={`${words.noun}: ${entry.name || 'unnamed'}`}
            >
              <div className="flex flex-wrap items-center gap-2 p-2">
                <Button
                  icon={isOpen ? 'pi pi-chevron-down' : 'pi pi-chevron-right'}
                  text
                  rounded
                  size="small"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? 'Fold this setup' : 'Unfold this setup'}
                  onClick={() => setOpen((o) => ({ ...o, [cardKey]: !isOpen }))}
                />
                <InputText
                  value={entry.name}
                  onChange={(e) => rename(entry.id, e.target.value)}
                  maxLength={60}
                  aria-label="Setup name"
                  className={`p-inputtext-sm w-44 min-w-0 font-medium ${nameMissing ? 'p-invalid' : ''}`}
                />
                <Tag
                  value={entry.enabled ? 'Active' : 'Inactive'}
                  severity={entry.enabled ? 'success' : 'secondary'}
                  title={entry.enabled ? 'The setup this section uses.' : 'Takes no new work.'}
                />
                {test && (
                  <>
                    <SetupTestBadge last={dto?.lastTest} testing={run.testing} />
                    <Button
                      label="Test"
                      icon={test.icon}
                      size="small"
                      outlined
                      loading={run.testing}
                      disabled={isNew || run.testing}
                      aria-label={`${test.label}: ${entry.name || 'this setup'}`}
                      title={
                        isNew
                          ? 'Save this setup first — the test uses saved values.'
                          : needsNumber
                            ? 'Opens this setup to type the number to text.'
                            : test.says +
                              (entryDirty || fieldsDirty ? ' It tests the saved values — save your changes first.' : '')
                      }
                      onClick={testFromHeader}
                    />
                  </>
                )}
                {dto?.inUse && <Tag value={dto.inUse} severity="warning" icon="pi pi-inbox" />}
                {dto?.locked && <Tag value="environment" severity="info" title="Some values are set by environment variables." />}
                {(entryDirty || fieldsDirty) && <Tag value={isNew ? 'new, unsaved' : 'unsaved'} severity="danger" />}

                <div className="ml-auto flex items-center gap-1">
                  <InputSwitch
                    checked={entry.enabled}
                    onChange={(e) => activate(entry.id, !!e.value)}
                    aria-label={`${entry.name || 'This setup'} is the active setup`}
                    tooltip={entry.enabled ? undefined : 'Make this the active setup — the others switch off'}
                    tooltipOptions={{ position: 'top' }}
                  />
                  <Button
                    icon="pi pi-trash"
                    text
                    rounded
                    size="small"
                    severity="danger"
                    disabled={!!cannotRemove}
                    aria-label="Remove this setup"
                    title={cannotRemove ?? (isNew ? 'Remove this setup' : 'Remove this setup when you save — its saved values and secrets go with it')}
                    onClick={() => remove(entry.id)}
                  />
                </div>
              </div>
              {nameMissing && (
                <p className="m-0 px-3 pb-2 text-sm text-red-500">Give this setup a name — it is how the log and the tests refer to it.</p>
              )}
              {isOpen && (
                <div className="flex flex-col gap-5 border-t border-[var(--surface-border)] p-3">
                  <SetupTestRow
                    kind={group.name}
                    numberId={numberId}
                    saved={!isNew}
                    dirty={entryDirty || fieldsDirty}
                    last={dto?.lastTest}
                    run={run}
                    onTo={(to) => patchRun(cardKey, { to })}
                    onRun={() => void runTest(group.name, entry.id, entry.name, run.to, false)}
                  />
                  {fields
                    .filter((s) => emailFieldShown(mainKey(s.key), emailProvider))
                    .map((s) =>
                      renderField(s, CUSTOM_PHONE_FIELDS.includes(mainKey(s.key)) && phoneProvider !== 'custom'),
                    )}
                </div>
              )}
            </section>
          );
        })}

        {list.length === 0 && (
          <Message
            severity="warn"
            className="w-full justify-start"
            text={`No ${words.noun.toLowerCase()} is set up, so nothing here runs. Add one below.`}
          />
        )}
        {list.length > 0 && !active && (
          <Message
            severity="warn"
            className="w-full justify-start"
            text="No setup is active, so nothing here runs until one is switched on."
          />
        )}

        {removed.map((setup) => (
          <div
            key={setup.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-red-400/60 p-3 text-sm"
          >
            <i className="pi pi-trash text-red-500" aria-hidden />
            <span>
              <strong>{setup.name}</strong> will be removed when you save, with its saved values and secrets.
            </span>
            <Button label="Undo" icon="pi pi-undo" size="small" text onClick={() => restore(setup)} />
          </div>
        ))}

        <div>
          <Button
            label={words.add}
            icon="pi pi-plus"
            size="small"
            outlined
            disabled={list.length >= MAX_SETUPS}
            title={list.length >= MAX_SETUPS ? `A connection can have at most ${MAX_SETUPS} setups.` : undefined}
            onClick={add}
          />
        </div>
      </div>
    );
  };

  // The Redis group binds at startup like JWT: what this process is doing
  // with Redis now, and whether what is saved is waiting for a restart.
  const renderRedisNote = () => {
    const status = redisStatus.data;
    const now = !status
      ? null
      : status.onButUnusable
        ? 'The running API was started with Redis on but no usable address, and runs as if it were off.'
        : status.active
          ? `The running API uses Redis at ${status.endpoints}${status.connected ? '' : ' — not connected right now'}.`
          : 'The running API does not use Redis; one API process needs none.';
    return (
      <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-[var(--text-color-secondary)]">
        These bind at server startup, so changes here take effect after the next restart.
        {now && <span>{now}</span>}
        {status?.restartPending && (
          <Tag
            value="Restart pending"
            severity="warning"
            icon="pi pi-refresh"
            title="Saved values here differ from what the running API started with. Restart the API to apply them."
          />
        )}
      </p>
    );
  };

  // The JWT group: the fields in pairs, the key with its Generate, the rules
  // they live by, and — past a rule — the one action that ends every session.
  const renderJwt = (group: Group) => {
    const field = (key: string) => group.settings.find((s) => s.key === key);
    const shown = (key: string, action?: ReactNode) => {
      const s = field(key);
      return s ? renderField(s, false, action) : null;
    };
    const signingKey = field(JWT_KEYS.signingKey);
    return (
      <div className="flex flex-col gap-5">
        <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-[var(--text-color-secondary)]">
          These bind at server startup, so changes here take effect after the next restart.
          {jwtStatus.data?.restartPending && (
            <Tag
              value="Restart pending"
              severity="warning"
              icon="pi pi-refresh"
              title="Saved values here differ from what the running API signs and checks tokens with. Restart the API to apply them."
            />
          )}
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {shown(JWT_KEYS.issuer)}
          {shown(JWT_KEYS.audience)}
        </div>
        <div className="flex flex-col gap-1">
          {shown(
            JWT_KEYS.signingKey,
            <Button
              label="Generate"
              icon="pi pi-key"
              size="small"
              outlined
              disabled={!signingKey || signingKey.locked}
              title="Make a new random key in this browser. Nothing changes until you save and restart."
              onClick={() => setValue(JWT_KEYS.signingKey, newSigningKey())}
            />,
          )}
          {JWT_KEYS.signingKey in dirty && (
            <p className="m-0 text-sm text-amber-600">
              A new key is ready. Save it, then restart the API — everybody, you included, signs in again after the
              restart.
            </p>
          )}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {shown(JWT_KEYS.accessMinutes)}
          {shown(JWT_KEYS.refreshDays)}
        </div>
        <JwtRules />

        <section className="flex flex-col gap-2 border-t border-[var(--surface-border)] pt-4" aria-labelledby="sessions-heading">
          <h3 id="sessions-heading" className="m-0 text-base font-semibold">
            Sessions
          </h3>
          <p className="m-0 text-sm text-[var(--text-color-secondary)]">
            Revoke every active session. Everyone, you included, must sign in again — at once, not when a token runs
            out. Use after a security incident or a credential rotation.
          </p>
          <div>
            <Button
              label="Revoke all sessions"
              icon="pi pi-sign-out"
              severity="danger"
              outlined
              size="small"
              loading={revoke.isPending}
              onClick={confirmRevoke}
            />
          </div>
        </section>
      </div>
    );
  };

  const namesMissing = (settings.data ?? []).some((g) => g.listKey && listOf(g).some((e) => !e.name.trim()));

  return (
    <>
      <SiteHeader />
      <main className="p-6">
        <Toast ref={toast} />
        <ConfirmDialog />
        <div className="mx-auto max-w-3xl">
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-[var(--text-color-secondary)]">
              Signed in as {me.data?.displayName}. Locked values come from
              environment variables; secrets are stored encrypted and never
              shown back.
            </p>
          </div>

          <div className="mt-6">
            {settings.isLoading && <i className="pi pi-spinner pi-spin text-2xl" />}
            {settings.data && (
              <Accordion multiple activeIndex={[0]}>
                {settings.data.map((group) => {
                  const hasSetups = !!group.listKey && !!SETUP_WORDS[group.name];
                  const across = hasSetups ? SETUP_WORDS[group.name].across : '';
                  return (
                    <AccordionTab key={group.name} header={group.label}>
                      <div className="flex flex-col gap-5">
                        {group.name === 'ai' && !aiEnabled && (
                          <Message
                            severity="info"
                            className="w-full justify-start"
                            text="AI automation is off. Nothing below runs and no data leaves this server until you turn it on."
                          />
                        )}
                        {group.name === 'identity' && !identityEnabled && (
                          <Message
                            severity="info"
                            className="w-full justify-start"
                            text="Identity verification is off. Nobody is asked to verify and every door below stands open until you turn it on."
                          />
                        )}
                        {group.name === 'branding' && (
                          <>
                            <LogoUpload slot="logo" />
                            <LogoUpload slot="icon" />
                          </>
                        )}
                        {group.name === 'legal' && <TermsRow />}
                        {hasSetups && renderSetups(group)}
                        {hasSetups && group.settings.length > 0 && (
                          <h3 className="m-0 mt-2 border-t border-[var(--surface-border)] pt-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-color-secondary)]">
                            {across}
                          </h3>
                        )}
                        {group.name === 'redis' && renderRedisNote()}
                        {group.name === 'jwt'
                          ? renderJwt(group)
                          : group.settings.map((s) =>
                              // The master switch governs the rest of its group, so
                              // show that in the UI rather than leaving fields that
                              // look live but cannot run.
                              renderField(s, governedOff(group.name, s.key)),
                            )}
                      </div>
                    </AccordionTab>
                  );
                })}
              </Accordion>
            )}
          </div>

          {/* A toolbar, not a lone floating button: with a solid card behind
              it, a field scrolling underneath is covered by something that
              reads as a bar rather than half-hidden by a button. */}
          <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-4 py-3 shadow-lg">
            {namesMissing && (
              <span className="mr-auto text-sm text-red-500">Every setup needs a name before saving.</span>
            )}
            {dirtyCount > 0 && (
              <Button
                label="Discard changes"
                icon="pi pi-times"
                text
                severity="secondary"
                disabled={save.isPending}
                onClick={() => setDirty({})}
              />
            )}
            <Button
              label={dirtyCount === 0 ? 'No changes' : `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`}
              icon="pi pi-save"
              disabled={dirtyCount === 0 || save.isPending || namesMissing}
              loading={save.isPending}
              onClick={() => save.mutate(dirty)}
            />
          </div>
        </div>
      </main>
    </>
  );
}
