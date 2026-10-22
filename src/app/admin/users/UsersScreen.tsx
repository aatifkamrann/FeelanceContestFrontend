'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Password } from 'primereact/password';
import { SelectButton } from 'primereact/selectbutton';
import { Sidebar } from 'primereact/sidebar';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import HelpIcon from '@/components/HelpIcon';
import PasswordRules from '@/components/PasswordRules';
import SiteHeader from '@/components/SiteHeader';
import { Panel } from '@/components/dashboard/kit';
import {
  createUser,
  deleteUser,
  fetchIdentityProofAgain,
  identityDocumentUrl,
  identityProofQuery,
  lockUser,
  sendUserResetLink,
  setUserPassword,
  unlockUser,
  resetVerification,
  updateUser,
  usersQuery,
  type AdminUser,
} from '@/lib/admin';
import { relativeTime } from '@/lib/opportunities';
import { dayParam, linkParams } from '@/lib/links';
import { passwordAcceptable } from '@/lib/password';
import { apiFetch } from '@/lib/api';

type Me = { id: string; email: string; displayName: string; role: string };

async function fetchMe(): Promise<Me | null> {
  const res = await apiFetch('/api/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`API answered ${res.status}`);
  return res.json();
}

/** "3 entries", "1 entry" — nouns whose plural is not an s. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const ROLE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Clients', value: 'client' },
  { label: 'Freelancers', value: 'freelancer' },
  { label: 'Admins', value: 'admin' },
];

type View = 'cards' | 'list';
const VIEW_OPTIONS = [
  { icon: 'pi pi-th-large', value: 'cards', label: 'Cards' },
  { icon: 'pi pi-list', value: 'list', label: 'List' },
];
/** The accounts' layout on this device, apart from every other page's. */
const VIEW_KEY = 'wp.admin-users.view';

/**
 * The three account types, said in terms of what the person will be able to
 * do — the role word alone is the thing an administrator picks wrong. Same
 * order as the filter above, with the powerful one last and marked.
 */
const NEW_USER_TYPES = [
  {
    value: 'freelancer',
    title: 'Freelancer',
    detail: 'Enters opportunities, builds in a private repo, is paid if they win.',
    icon: 'pi-code',
  },
  {
    value: 'client',
    title: 'Client',
    detail: 'Posts briefs with a fixed award, reviews code, pays the winner.',
    icon: 'pi-briefcase',
  },
  {
    value: 'admin',
    title: 'Administrator',
    detail: 'Every opportunity, account and setting on this portal.',
    icon: 'pi-shield',
  },
];

// Roles are kinds, not states: none of them is red. Red is kept for the one
// state that is — a locked account.
function roleSeverity(role: string): 'info' | 'success' | 'warning' {
  return role === 'admin' ? 'warning' : role === 'client' ? 'info' : 'success';
}

/**
 * The Users screen: every account on the portal down the side, and the
 * chosen one's controls on the other — profile, lock, password, and the
 * danger zone. Administrators only, gated the way Settings is.
 */
export default function UsersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const users = useQuery({ ...usersQuery, enabled: me.data?.role === 'admin' });

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // When the accounts shown joined: the last so many days, or a day or a
  // run of days; null for whenever.
  const [joined, setJoined] = useState<{ days: number } | { from: Date; to: Date } | null>(null);

  // A link can open the screen narrowed, or on one account — the
  // dashboard's People tile, its tables and its signups chart do:
  // ?role=client, ?joined=30 (days) or ?joined=2026-09-12 (a day, or two for
  // a run), ?user=<account id>. Read once; the filters are the reader's after.
  useEffect(() => {
    const p = linkParams();
    const role = p.get('role');
    if (role && ROLE_FILTERS.some((r) => r.value === role)) setRoleFilter(role);
    const within = p.get('joined') ?? '';
    const days = /^\d+$/.test(within) ? Number(within) : 0;
    const range = days > 0 ? null : dayParam(p, 'joined');
    if (days > 0) setJoined({ days });
    else if (range) setJoined({ from: range[0], to: range[1] });
    const user = p.get('user');
    if (user) setSelectedId(user);
  }, []);
  // The new-account form takes the same pane an account's controls use:
  // one thing at a time on the right, so a half-typed new account and a
  // half-typed correction to an existing one can never both be open.
  const [creating, setCreating] = useState(false);

  // The layout is a per-device preference: cards across the page with the
  // controls coming in from the side (the default), or the list beside the
  // controls. Read after mount, so the first render agrees with the server's.
  const [view, setView] = useState<View>('cards');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === 'list' || saved === 'cards') setView(saved);
    } catch {
      /* private mode, or storage blocked */
    }
  }, []);
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* fine — it just will not be remembered */
    }
  };

  // Signed out: the sign-in page brings you back here afterwards.
  useEffect(() => {
    if (me.data === null) router.replace('/login?next=/admin/users');
  }, [me.data, router]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const select = (id: string) => {
    setSelectedId(id);
    setCreating(false);
    // Below the two-column width the editor sits under the list; bring it up rather than
    // leaving the person to guess that something changed off-screen.
    if (view === 'list' && window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

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
            <p className="mt-3 font-medium">Users are managed by portal administrators</p>
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
  if (me.isError || users.isError) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-3xl p-6">
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
            <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
            <p className="mt-3 font-medium">Users could not be loaded</p>
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Nothing has changed — this screen only reads them. Is the API up?
            </p>
            <Button
              label="Try again"
              className="mt-4"
              outlined
              onClick={() => {
                void me.refetch();
                void users.refetch();
              }}
            />
          </div>
        </main>
      </>
    );
  }

  const all = users.data ?? [];
  const needle = q.trim().toLowerCase();
  // Days as the dashboard counts them, in this browser's zone: "30 days" is
  // today and the 29 before it, from midnight; a day runs to its last moment.
  const joinedWithin = ((): [number, number] | null => {
    if (joined === null) return null;
    const start = new Date('days' in joined ? Date.now() : joined.from);
    start.setHours(0, 0, 0, 0);
    if ('days' in joined) {
      start.setDate(start.getDate() - (joined.days - 1));
      return [start.getTime(), Infinity];
    }
    const end = new Date(joined.to);
    end.setHours(23, 59, 59, 999);
    return [start.getTime(), end.getTime()];
  })();
  const shown = all.filter(
    (u) =>
      (roleFilter === 'all' || u.role === roleFilter) &&
      (joinedWithin === null ||
        (new Date(u.createdAtUtc).getTime() >= joinedWithin[0] &&
          new Date(u.createdAtUtc).getTime() <= joinedWithin[1])) &&
      (needle === '' || u.displayName.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)),
  );
  const selected = all.find((u) => u.id === selectedId) ?? null;

  // One search and one role filter serve both layouts, so switching keeps
  // what was typed; the accounts narrow as the box is typed in.
  const searchBox = (className: string) => (
    <IconField iconPosition="left" className={className}>
      <InputIcon className="pi pi-search" />
      <InputText
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name or email"
        aria-label="Search users"
        className="w-full !pl-10"
      />
    </IconField>
  );
  // In the side list the four share its width equally; beside the search
  // each keeps its own, so no label is cut when the row runs short.
  const roleButtons = (className: string, buttonClassName: string) => (
    <SelectButton
      value={roleFilter}
      options={ROLE_FILTERS}
      onChange={(e) => e.value && setRoleFilter(e.value as string)}
      allowEmpty={false}
      aria-label="Filter by role"
      // Four buttons on one row, even on a phone: the stock padding
      // pushed "Admins" onto a line of its own at 375px.
      className={className}
      pt={{ button: { className: buttonClassName } }}
    />
  );
  // The one filter with no control of its own: it arrives in a link, and
  // stays in view until it is taken off.
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const joinedLabel =
    joined === null
      ? null
      : 'days' in joined
        ? `Joined in the last ${joined.days} day${joined.days === 1 ? '' : 's'}`
        : joined.from.toDateString() === joined.to.toDateString()
          ? `Joined ${day(joined.from)}`
          : `Joined ${day(joined.from)} – ${day(joined.to)}`;
  const joinedChip = joinedLabel ? (
    <Button
      type="button"
      label={joinedLabel}
      icon="pi pi-times"
      iconPos="right"
      size="small"
      rounded
      outlined
      aria-label={`${joinedLabel} — show accounts whenever they joined`}
      onClick={() => setJoined(null)}
      className="self-start"
    />
  ) : null;
  const tally =
    shown.length === all.length
      ? plural(all.length, 'account', 'accounts')
      : `${shown.length} of ${plural(all.length, 'account', 'accounts')}`;
  const nobody = all.length === 0 ? 'No accounts yet.' : 'Nobody matches that.';

  const editor = creating ? (
    <NewUserPanel
      notify={(severity, summary, detail) => toast.current?.show({ severity, summary, detail, life: 8000 })}
      onCancel={() => setCreating(false)}
      onCreated={(id) => {
        setCreating(false);
        void refresh();
        // Straight to the new account's own controls: the next
        // thing an administrator wants is usually right there.
        setSelectedId(id);
      }}
    />
  ) : selected ? (
    <UserEditor
      key={selected.id}
      user={selected}
      notify={(severity, summary, detail) => toast.current?.show({ severity, summary, detail, life: 6000 })}
      onChanged={() => void refresh()}
      onGone={() => {
        setSelectedId(null);
        void refresh();
      }}
    />
  ) : null;

  return (
    <>
      <SiteHeader />
      <main className="p-6">
        <Toast ref={toast} />
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold">Users</h1>
              <p className="text-[var(--text-color-secondary)]">
                Signed in as {me.data?.displayName}. Every account on the portal; add one, or choose one
                to lock it, get the person back in, correct their details, or remove them.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SelectButton
                value={view}
                onChange={(e) => e.value && chooseView(e.value as View)}
                options={VIEW_OPTIONS}
                optionLabel="label"
                itemTemplate={(o: (typeof VIEW_OPTIONS)[number]) => (
                  <i className={o.icon} aria-hidden title={o.label} />
                )}
                allowEmpty={false}
                aria-label="Layout"
              />
              <Button
                label="Add account"
                icon="pi pi-user-plus"
                onClick={() => {
                  setCreating(true);
                  setSelectedId(null);
                  if (view === 'list' && window.matchMedia('(max-width: 1023px)').matches) {
                    requestAnimationFrame(() =>
                      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                    );
                  }
                }}
              />
            </div>
          </div>

          {view === 'cards' ? (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-3">
                {searchBox('min-w-[14rem] flex-1')}
                {/* Its own width beside the search: when both do not fit, the
                    search takes the line above rather than cutting a label. */}
                {roleButtons('flex shrink-0', '!px-3')}
                {joinedChip}
              </div>
              {users.isLoading ? (
                <div className="p-10 text-center">
                  <i className="pi pi-spinner pi-spin text-2xl" />
                </div>
              ) : shown.length === 0 ? (
                <p className="mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center text-sm text-[var(--text-color-secondary)]">
                  {nobody}
                </p>
              ) : (
                <ul role="list" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map((u) => (
                    <li key={u.id} className="flex">
                      <AccountCard user={u} current={u.id === selectedId} onChoose={() => select(u.id)} />
                    </li>
                  ))}
                </ul>
              )}
              {users.data && <p className="mt-3 text-xs text-[var(--text-color-secondary)]">{tally}</p>}
              {/* The chosen card's controls come in from the side rather
                  than pushing the cards down the page; closing it is
                  choosing nothing, as in the list. */}
              <Sidebar
                visible={editor !== null}
                position="right"
                onHide={() => {
                  setSelectedId(null);
                  setCreating(false);
                }}
                header={<span className="text-lg font-semibold">{creating ? 'Add account' : 'Account'}</span>}
                ariaCloseLabel="Close"
                className="!w-full md:!w-[42rem]"
              >
                {editor}
              </Sidebar>
            </>
          ) : (
            <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
              <aside className="min-w-0 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] lg:sticky lg:top-4">
                <div className="flex flex-col gap-2 border-b border-[var(--surface-border)] p-3">
                  {searchBox('')}
                  {roleButtons('flex', 'flex-1 !px-3')}
                  {joinedChip}
                </div>
                {users.isLoading ? (
                  <div className="p-6 text-center">
                    <i className="pi pi-spinner pi-spin text-2xl" />
                  </div>
                ) : shown.length === 0 ? (
                  <p className="p-6 text-center text-sm text-[var(--text-color-secondary)]">{nobody}</p>
                ) : (
                  <ul role="list" className="max-h-[60vh] overflow-y-auto lg:max-h-[70vh]">
                    {shown.map((u) => {
                      const current = u.id === selectedId;
                      return (
                        <li key={u.id} className="border-b border-[var(--surface-border)] last:border-0">
                          <button
                            type="button"
                            aria-current={current ? 'true' : undefined}
                            onClick={() => select(u.id)}
                            className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                              current
                                ? 'bg-[color-mix(in_srgb,var(--primary-color)_10%,transparent)]'
                                : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <Avatar name={u.displayName} url={u.avatarUrl} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="[overflow-wrap:anywhere] font-medium text-[var(--text-color)]">
                                {u.displayName}
                                {u.isYou && (
                                  <span className="ml-1 text-xs text-[var(--text-color-secondary)]">(you)</span>
                                )}
                              </p>
                              <p className="[overflow-wrap:anywhere] text-xs text-[var(--text-color-secondary)]">
                                {u.email}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <AccountTags user={u} />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {users.data && (
                  <p className="border-t border-[var(--surface-border)] px-4 py-2 text-xs text-[var(--text-color-secondary)]">
                    {tally}
                  </p>
                )}
              </aside>

              <div ref={editorRef} className="min-w-0 scroll-mt-4">
                {editor ?? (
                  <div className="rounded-xl border border-dashed border-[var(--surface-border)] p-10 text-center">
                    <i className="pi pi-user text-3xl text-[var(--text-color-secondary)]" aria-hidden />
                    <p className="mt-3 font-medium">Choose an account</p>
                    <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                      Its profile, lock, password and danger zone appear here — or add a new one.
                    </p>
                    <Button
                      label="Add account"
                      icon="pi pi-user-plus"
                      size="small"
                      outlined
                      className="mt-4"
                      onClick={() => setCreating(true)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * The tags an account wears wherever it is listed: its role, a lock, and
 * — for an account nobody has claimed — whether its invitation still works.
 */
function AccountTags({ user: u }: { user: AdminUser }) {
  return (
    <>
      <Tag value={u.role} severity={roleSeverity(u.role)} />
      {u.lockedAtUtc && <Tag value="locked" icon="pi pi-lock" severity="danger" />}
      {u.identityVerified && <Tag value="verified" icon="pi pi-verified" severity="success" />}
      {/* An account nobody has claimed. The live link
          is a normal in-flight invitation; a spent one
          is a door that needs another sent. */}
      {!u.passwordSet &&
        (u.resetPending ? (
          <Tag value="invited" icon="pi pi-send" severity="info" />
        ) : (
          <Tag value="invite expired" icon="pi pi-clock" severity="warning" />
        ))}
    </>
  );
}

/** What an account has done here, in the words the account's own header uses. */
function activity(u: AdminUser): string {
  return u.role === 'client'
    ? `${plural(u.opportunities, 'opportunity', 'opportunities')} posted`
    : u.role === 'freelancer'
      ? `${plural(u.entries, 'entry', 'entries')}, ${u.awardsWon} won`
      : 'administrator';
}

/**
 * One account as a card. The whole card is the button that opens its
 * controls; it says what the list row says, plus when the person joined
 * and what they have done on the portal.
 */
function AccountCard({ user: u, current, onChoose }: { user: AdminUser; current: boolean; onChoose: () => void }) {
  return (
    <button
      type="button"
      aria-current={current ? 'true' : undefined}
      onClick={onChoose}
      className={`flex w-full flex-col rounded-xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)] ${
        current
          ? 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_10%,transparent)]'
          : 'border-[var(--surface-border)] bg-[var(--surface-card)] hover:border-[var(--primary-color)]'
      }`}
    >
      <div className="flex w-full items-start gap-3">
        <Avatar name={u.displayName} url={u.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="[overflow-wrap:anywhere] font-semibold text-[var(--text-color)]">
            {u.displayName}
            {u.isYou && <span className="ml-1 text-xs font-normal text-[var(--text-color-secondary)]">(you)</span>}
          </p>
          <p className="[overflow-wrap:anywhere] text-xs text-[var(--text-color-secondary)]">{u.email}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--text-color-secondary)]">
        Joined {relativeTime(u.createdAtUtc)} · {activity(u)}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
        <AccountTags user={u} />
      </div>
    </button>
  );
}

type Severity = 'success' | 'info' | 'warn' | 'error';

/**
 * A new account, made for somebody who is not here to make it themselves.
 *
 * Two things are decided here that no later screen can undo: the type, which
 * the account keeps for life, and how the person first gets in. Both are put
 * to the administrator as what will happen rather than as fields — the
 * submit button says which of the two doors it is about to open.
 */
function NewUserPanel({
  notify,
  onCancel,
  onCreated,
}: {
  notify: (severity: Severity, summary: string, detail: string) => void;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [role, setRole] = useState('freelancer');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Blank is the invitation path, so an empty box is a choice, not an
  // omission — but a half-typed password is neither, and is caught here
  // rather than by the API after the account name has been typed twice.
  const invite = password === '';
  const nameOk = displayName.trim().length >= 2 && displayName.trim().length <= 80;
  const emailOk = email.trim().includes('@');
  const passwordOk = invite || passwordAcceptable(password);
  const blocker = !nameOk
    ? 'A display name of 2–80 characters'
    : !emailOk
      ? 'An email address'
      : !passwordOk
        ? 'A password that meets the rules, or none at all'
        : !invite && confirmPassword !== password
          ? 'The passwords do not match'
          : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await createUser({
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        role,
        password,
      });
      notify(
        'success',
        made.invited ? 'Invitation sent' : 'Account created',
        made.invited
          ? `${made.user.displayName} has a week to choose a password from the link emailed to ${made.user.email}.`
          : `${made.user.displayName} can sign in as a ${made.user.role} with the password you set. Pass it on, and tell them to change it.`,
      );
      onCreated(made.user.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The account could not be created.');
      setBusy(false);
    }
  };

  return (
    <Panel title="New account">
      <div className="flex flex-col gap-5">
        <fieldset className="min-w-0">
          <legend className="text-sm font-medium">
            Account type
            <HelpIcon topic="admin.newUser.type" label="Choosing an account type" />
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {NEW_USER_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setRole(t.value)}
                aria-pressed={role === t.value}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  role === t.value
                    ? 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_10%,transparent)]'
                    : 'border-[var(--surface-border)] hover:border-[var(--primary-color)]'
                }`}
              >
                <i className={`pi ${t.icon} text-[var(--primary-color)]`} aria-hidden />
                <p className="mt-1 text-sm font-medium">{t.title}</p>
                <p className="mt-1 text-xs text-[var(--text-color-secondary)]">{t.detail}</p>
              </button>
            ))}
          </div>
          {/* Said at the moment it is chosen, not in help nobody opens. */}
          {role === 'admin' && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-500">
              <i className="pi pi-exclamation-triangle mr-1 text-xs" aria-hidden />
              An administrator can change every opportunity, account and setting here — including yours.
            </p>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="new-user-name">
              Display name
            </label>
            <InputText
              id="new-user-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How they are named on the portal"
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="new-user-email">
              Email
            </label>
            <InputText
              id="new-user-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              type="email"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="new-user-password">
            How they get in
            <HelpIcon topic="admin.newUser.password" label="Invitation or password" />
          </label>
          <Password
            inputId="new-user-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            feedback={false}
            toggleMask
            placeholder="Leave blank to email an invitation"
            inputClassName="w-full"
            className="w-full"
            autoComplete="new-password"
            aria-describedby="new-user-password-rules"
          />
          {!invite && <PasswordRules password={password} id="new-user-password-rules" />}
          <p className="text-sm text-[var(--text-color-secondary)]">
            {invite
              ? 'They will be emailed a link that sets their first password. It lasts a week, and nobody — you included — ever sees what they choose.'
              : 'You will know this password until they change it. Use this when the portal has no email configured, or they cannot reach their inbox.'}
          </p>
        </div>

        {!invite && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="new-user-confirm">
              Confirm password
            </label>
            <Password
              inputId="new-user-confirm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              feedback={false}
              toggleMask
              inputClassName="w-full"
              className="w-full"
              autoComplete="new-password"
            />
            {confirmPassword !== '' && confirmPassword !== password && (
              <p className="text-xs text-red-500">Both boxes have to say the same thing.</p>
            )}
          </div>
        )}

        {error && <Message severity="error" text={error} className="w-full" />}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            label={blocker ?? (invite ? 'Create and send invitation' : 'Create account')}
            icon={invite ? 'pi pi-send' : 'pi pi-user-plus'}
            loading={busy}
            disabled={blocker !== null || busy}
            onClick={() => void submit()}
          />
          <Button label="Cancel" text severity="secondary" disabled={busy} onClick={onCancel} />
        </div>
        <p className="text-sm text-[var(--text-color-secondary)]">
          They accept the portal&apos;s terms themselves, the first time they sign in — this screen does
          not do it on their behalf.
        </p>
      </div>
    </Panel>
  );
}

const STATUS_SEVERITY: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'secondary'> = {
  approved: 'success',
  declined: 'danger',
  in_review: 'warning',
  pending: 'info',
};

/**
 * The member's identity verification as an administrator reads it: the
 * verdict, what the provider read off the document, the stored copies of
 * the document and selfie images, and the provider's whole decision. Shown
 * once a verification exists; hidden for a member who never started one.
 * Only administrators see any of it, and every image opened is a row in
 * Activity.
 */
function IdentityPanel({
  user,
  busy,
  run,
}: {
  user: AdminUser;
  busy: string | null;
  run: (name: string, action: () => Promise<string>) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const proof = useQuery(identityProofQuery(user.id));
  const record = proof.data ?? null;
  if (!record && !user.identityVerified) return null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'identity', user.id] });

  return (
    <Panel title="Identity" help="admin.resetVerification">
      <div className="flex flex-col gap-4">
        {record ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Tag
                value={record.status.replace('_', ' ')}
                severity={STATUS_SEVERITY[record.status] ?? 'secondary'}
              />
              <span className="text-[var(--text-color-secondary)]">
                {record.decidedAtUtc
                  ? `Decided ${relativeTime(record.decidedAtUtc)}`
                  : `Started ${relativeTime(record.startedAtUtc)}`}
                {record.note && ` · ${record.note}`}
              </span>
            </div>
            <p className="m-0 font-mono text-[11px] text-[var(--text-color-secondary)] [overflow-wrap:anywhere]">
              {record.provider} session {record.sessionId}
            </p>

            {record.proofPending && (
              <Message
                severity="info"
                className="w-full justify-start"
                text={`Copying the decision and its images from ${record.provider}…`}
              />
            )}
            {record.proofError && (
              <Message severity="warn" className="w-full justify-start" text={record.proofError} />
            )}

            {record.facts.length > 0 && (
              <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {record.facts.map((f) => (
                  <div key={f.label} className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-[var(--text-color-secondary)]">{f.label}</dt>
                    <dd className="m-0 [overflow-wrap:anywhere]">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {record.documents.length > 0 && (
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
                {record.documents.map((d) => (
                  <li key={d.id} className="min-w-0">
                    <a
                      href={identityDocumentUrl(d.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden rounded-lg border border-[var(--surface-border)] bg-[var(--surface-ground)] no-underline"
                      title={`Open ${d.label}`}
                    >
                      {d.contentType.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived link; nothing to optimise
                        <img
                          src={identityDocumentUrl(d.id)}
                          alt={d.label}
                          loading="lazy"
                          className="block h-28 w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-28 items-center justify-center text-[var(--text-color-secondary)]">
                          <i className="pi pi-file-pdf text-2xl" aria-hidden />
                        </span>
                      )}
                    </a>
                    <span className="mt-1 block text-xs [overflow-wrap:anywhere]">{d.label}</span>
                    <span className="block text-[11px] tabular-nums text-[var(--text-color-secondary)]">
                      {(d.sizeBytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KB
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {record.decision ? (
              <details className="rounded-lg border border-[var(--surface-border)]">
                <summary className="cursor-pointer px-3 py-2 text-sm">
                  Full decision from {record.provider}
                  {record.decisionReadAtUtc && (
                    <span className="text-[var(--text-color-secondary)]"> · read {relativeTime(record.decisionReadAtUtc)}</span>
                  )}
                </summary>
                <pre className="m-0 max-h-[28rem] overflow-auto whitespace-pre-wrap border-t border-[var(--surface-border)] px-3 py-2 font-mono text-xs [overflow-wrap:anywhere]">
                  {record.decision}
                </pre>
              </details>
            ) : (
              !record.proofPending && (
                <p className="m-0 text-sm text-[var(--text-color-secondary)]">
                  No decision has been read for this verification yet.
                </p>
              )
            )}
          </>
        ) : (
          <p className="m-0 text-sm text-[var(--text-color-secondary)]">
            {proof.isLoading ? 'Loading the verification…' : 'The verification could not be loaded.'}
          </p>
        )}

        <p className="m-0 text-xs text-[var(--text-color-secondary)]">
          Only administrators see this. Opening an image is recorded in Activity. Taking the verification back
          shuts the doors that ask for it — publishing, applying, payment details reaching clients — until a new
          one passes, and deletes the stored images; nothing else they own changes.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          {record && (
            <Button
              label="Fetch again"
              icon="pi pi-refresh"
              size="small"
              text
              loading={busy === 'identity-fetch'}
              disabled={busy !== null || record.proofPending}
              onClick={() =>
                void run('identity-fetch', async () => {
                  await fetchIdentityProofAgain(user.id);
                  await refresh();
                  return `The decision and images for ${user.displayName} are being fetched again.`;
                })
              }
            />
          )}
          {user.identityVerified && (
            <Button
              label="Take verification back"
              icon="pi pi-undo"
              size="small"
              outlined
              severity="warning"
              loading={busy === 'reset-verification'}
              disabled={busy !== null}
              onClick={() =>
                void run('reset-verification', async () => {
                  await resetVerification(user.id);
                  await refresh();
                  return `${user.displayName} will be asked to verify again.`;
                })
              }
            />
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * One account's controls. Keyed by the account id from the parent, so
 * switching accounts starts every field and checkbox afresh — a half-typed
 * name or a ticked "I understand" never carries over to somebody else.
 */
function UserEditor({
  user,
  notify,
  onChanged,
  onGone,
}: {
  user: AdminUser;
  notify: (severity: Severity, summary: string, detail: string) => void;
  onChanged: () => void;
  onGone: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [lockReason, setLockReason] = useState(user.lockReason ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const profileDirty = displayName.trim() !== user.displayName || email.trim().toLowerCase() !== user.email;
  const profileValid = displayName.trim().length >= 2 && displayName.trim().length <= 80 && email.includes('@');
  const locked = user.lockedAtUtc !== null;
  const noTrace = user.opportunities === 0 && user.entries === 0 && user.ratings === 0;

  const run = async (name: string, action: () => Promise<string>) => {
    setBusy(name);
    try {
      const detail = await action();
      notify('success', 'Done', detail);
      onChanged();
    } catch (e) {
      notify('error', 'Not done', e instanceof Error ? e.message : 'The action failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-3 [overflow-wrap:anywhere] text-lg font-semibold">
            <Avatar name={user.displayName} url={user.avatarUrl} size="md" />
            {user.displayName}
          </h2>
          <Tag value={user.role} severity={roleSeverity(user.role)} />
          {locked && <Tag value="locked" icon="pi pi-lock" severity="danger" />}
          {user.identityVerified && <Tag value="verified" icon="pi pi-verified" severity="success" />}
          {user.isYou && <Tag value="you" severity="secondary" />}
        </div>
        <p className="[overflow-wrap:anywhere] text-sm text-[var(--text-color-secondary)]">{user.email}</p>
        <p className="mt-2 text-xs text-[var(--text-color-secondary)]">
          Joined {relativeTime(user.createdAtUtc)}
          {user.githubLogin && (
            <>
              {' · '}
              <i className="pi pi-github text-xs" aria-hidden /> {user.githubLogin}
            </>
          )}
          {' · '}
          {user.role === 'client'
            ? `${plural(user.opportunities, 'opportunity', 'opportunities')} posted`
            : user.role === 'freelancer'
              ? `${plural(user.entries, 'entry', 'entries')}, ${user.awardsWon} won`
              : 'administrator'}
          {user.ratings > 0 && ` · ${plural(user.ratings, 'rating', 'ratings')}`}
          {' · '}
          <Link href={`/admin/activity?user=${user.id}`}>Activity</Link>
          {user.role !== 'admin' && (
            <>
              {' · '}
              <Link href={`/admin/conversations?member=${user.id}`}>Conversations</Link>
            </>
          )}
          {' · '}
          {/* The page members read, with what only an administrator sees on
              it; the only way to a locked member's or a client's, which no
              list links to. A new tab keeps this screen's selection. */}
          <Link href={`/profile/${user.id}`} target="_blank" rel="noreferrer">
            View profile <i className="pi pi-external-link text-[0.65rem]" aria-hidden />
          </Link>
        </p>
      </div>

      <Panel title="Profile">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="user-name">
              Display name
            </label>
            <InputText
              id="user-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="user-email">
              Email
            </label>
            <InputText
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
            />
            <span className="text-xs text-[var(--text-color-secondary)]">
              Where their notifications and reset links go. They sign in with it.
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {profileDirty && (
              <Button
                label="Discard"
                icon="pi pi-times"
                text
                severity="secondary"
                size="small"
                disabled={busy !== null}
                onClick={() => {
                  setDisplayName(user.displayName);
                  setEmail(user.email);
                }}
              />
            )}
            <Button
              label="Save changes"
              icon="pi pi-save"
              size="small"
              disabled={!profileDirty || !profileValid || busy !== null}
              loading={busy === 'profile'}
              onClick={() =>
                void run('profile', async () => {
                  const saved = await updateUser(user.id, { displayName: displayName.trim(), email: email.trim() });
                  return `${saved.displayName} is now ${saved.email}.`;
                })
              }
            />
          </div>
        </div>
      </Panel>

      <IdentityPanel user={user} busy={busy} run={run} />

      <Panel title="Access" help="admin.lockUser">
        {locked ? (
          <div className="flex flex-col gap-3">
            <Message
              severity="warn"
              className="w-full justify-start"
              content={
                <span className="text-sm">
                  <i className="pi pi-lock mr-2" aria-hidden />
                  Locked {relativeTime(user.lockedAtUtc)}. They are signed out everywhere and cannot sign in.
                  {user.lockReason && (
                    <>
                      {' '}
                      Your note: <em>{user.lockReason}</em>
                    </>
                  )}
                </span>
              }
            />
            <div className="flex justify-end">
              <Button
                label="Unlock account"
                icon="pi pi-lock-open"
                size="small"
                outlined
                loading={busy === 'unlock'}
                disabled={busy !== null}
                onClick={() =>
                  void run('unlock', async () => {
                    await unlockUser(user.id);
                    return `${user.displayName} can sign in again.`;
                  })
                }
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--text-color-secondary)]">
              A lock ends every session at once and refuses the next sign-in. Nothing they own changes,
              and unlocking undoes all of it.
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="lock-reason">
                Reason <span className="font-normal text-[var(--text-color-secondary)]">(a note to yourself; optional)</span>
              </label>
              <InputText
                id="lock-reason"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                maxLength={200}
                disabled={user.isYou}
                className="w-full"
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {user.isYou && (
                <span className="text-xs text-[var(--text-color-secondary)]">You cannot lock your own account.</span>
              )}
              <Button
                label="Lock account"
                icon="pi pi-lock"
                size="small"
                severity="warning"
                outlined
                loading={busy === 'lock'}
                disabled={busy !== null || user.isYou}
                onClick={() =>
                  void run('lock', async () => {
                    await lockUser(user.id, lockReason);
                    return `${user.displayName} is locked out.`;
                  })
                }
              />
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Password" help="admin.resetPassword">
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-[var(--surface-border)] p-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* An account that never held a password is being invited,
                  not reset — same button, and the API picks the wording
                  and the window so this screen cannot promise the wrong one. */}
              <Button
                label={user.passwordSet ? 'Send reset link' : 'Send invitation again'}
                icon="pi pi-envelope"
                size="small"
                outlined
                loading={busy === 'link'}
                disabled={busy !== null || locked}
                onClick={() =>
                  void run('link', async () => {
                    const sent = await sendUserResetLink(user.id);
                    return sent.invited
                      ? `An invitation is on its way to ${sent.sentTo}; it lasts a week.`
                      : `A one-hour link is on its way to ${sent.sentTo}.`;
                  })
                }
              />
              <span className="text-sm text-[var(--text-color-secondary)]">
                {user.passwordSet
                  ? `Emails ${user.email} the same one-hour, single-use link the forgot-password form sends.`
                  : `This account has never had a password. Emails ${user.email} a fresh invitation, good for a week.`}
                {user.resetPending && ' A link sent earlier is still live; this replaces it.'}
                {locked && ' Unlock the account first.'}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="new-password">
              Set a new password
            </label>
            <Password
              inputId="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              feedback={false}
              toggleMask
              className="w-full"
              inputClassName="w-full"
              autoComplete="new-password"
              aria-describedby="new-password-rules"
            />
            <PasswordRules password={password} id="new-password-rules" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="new-password-confirm">
              Confirm password
            </label>
            <Password
              inputId="new-password-confirm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              feedback={false}
              toggleMask
              className="w-full"
              inputClassName="w-full"
              autoComplete="new-password"
            />
            {confirmPassword !== '' && confirmPassword !== password && (
              <p className="text-xs text-red-500">Both boxes have to say the same thing.</p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div>
              <Button
                label="Set password"
                icon="pi pi-key"
                size="small"
                outlined
                loading={busy === 'password'}
                disabled={busy !== null || !passwordAcceptable(password) || confirmPassword !== password}
                onClick={() =>
                  void run('password', async () => {
                    await setUserPassword(user.id, password);
                    setPassword('');
                    setConfirmPassword('');
                    return `${user.displayName}'s password is set. Every session they had is signed out.`;
                  })
                }
              />
            </div>
            <span className="text-xs text-[var(--text-color-secondary)]">
              For a portal without email, or a person who cannot reach their inbox. Hand it over out of band and ask
              them to change it.
            </span>
          </div>
        </div>
      </Panel>

      <Panel title="Danger zone" help="admin.deleteUser" className="!border-red-500/40">
        {user.isYou ? (
          <p className="text-sm text-[var(--text-color-secondary)]">
            You cannot delete your own account. Another administrator can.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {noTrace ? (
                <>
                  Nothing on the portal refers to this account. Deleting removes it completely — there is no undo.
                </>
              ) : (
                <>
                  This account has{' '}
                  {[
                    user.opportunities > 0 && plural(user.opportunities, 'opportunity', 'opportunities'),
                    user.entries > 0 && plural(user.entries, 'entry', 'entries'),
                    user.awardsWon > 0 && `${plural(user.awardsWon, 'award', 'awards')} won`,
                    user.ratings > 0 && plural(user.ratings, 'rating', 'ratings'),
                  ]
                    .filter(Boolean)
                    .join(', ')}{' '}
                  on record. Those stay, credited to “Deleted member”; the person&apos;s name, email, phone,
                  password, GitHub link, devices and payment details are wiped, their profile is closed and no
                  longer readable anywhere on the portal, and they can never sign in again. There is no undo.
                </>
              )}
            </p>
            {(user.liveOpportunities > 0 || user.activeEntries > 0) && (
              <Message
                severity="warn"
                className="w-full justify-start"
                text={[
                  user.liveOpportunities > 0 &&
                    `${plural(user.liveOpportunities, 'live opportunity', 'live opportunities')} will be cancelled and every entrant told why.`,
                  user.activeEntries > 0 &&
                    `${plural(user.activeEntries, 'active entry', 'active entries')} will be withdrawn.`,
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            )}
            <div className="flex items-start gap-2">
              <Checkbox
                inputId={`understood-${user.id}`}
                checked={understood}
                onChange={(e) => setUnderstood(!!e.checked)}
                disabled={busy !== null}
              />
              <label htmlFor={`understood-${user.id}`} className="text-sm">
                I understand. Delete this user.
              </label>
            </div>
            <div className="flex justify-end">
              <Button
                label="Delete user"
                icon="pi pi-trash"
                size="small"
                severity="danger"
                loading={busy === 'delete'}
                disabled={busy !== null || !understood}
                onClick={() => {
                  setBusy('delete');
                  deleteUser(user.id)
                    .then((r) => {
                      notify(
                        'success',
                        r.outcome === 'deleted' ? 'Account removed' : 'Account erased',
                        r.outcome === 'deleted'
                          ? `${user.displayName} is gone.`
                          : `${user.displayName} is now “Deleted member” on their records.` +
                              (r.opportunitiesCancelled ? ` ${plural(r.opportunitiesCancelled, 'opportunity', 'opportunities')} cancelled.` : '') +
                              (r.entriesWithdrawn ? ` ${plural(r.entriesWithdrawn, 'entry', 'entries')} withdrawn.` : ''),
                      );
                      onGone();
                    })
                    .catch((e: unknown) => {
                      notify('error', 'Not deleted', e instanceof Error ? e.message : 'The action failed.');
                      setBusy(null);
                    });
                }}
              />
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
