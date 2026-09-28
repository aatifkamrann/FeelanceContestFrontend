'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InputSwitch } from 'primereact/inputswitch';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import type { Me } from '@/lib/opportunities';
import {
  notificationsQuery,
  registerDevice,
  removeDevice,
  savePreferences,
  type NotificationPreferences,
  type PreferencesUpdate,
  type PushDevice,
} from '@/lib/notifications';
import {
  PushDeclined,
  currentSubscription,
  deviceLabel,
  pushSupport,
  sha256Hex,
  subscribe,
  subscriptionParts,
  unsubscribe,
  type PushSupport,
} from '@/lib/push';

type View = 'cards' | 'list';
const VIEW_OPTIONS = [
  { icon: 'pi pi-th-large', value: 'cards', label: 'Cards' },
  { icon: 'pi pi-list', value: 'list', label: 'List' },
];
/** The settings' layout on this device, apart from every other page's. */
const VIEW_KEY = 'wp.notifications.view';

/** One switch: a thing to hear about, or a way to hear it. */
type Setting = {
  id: string;
  label: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
};

/**
 * The signed-in half of the Notifications page: what to hear about, and
 * by which channel. Topics and email are account preferences, saved the
 * moment a switch moves; push is a property of this browser, so its switch
 * asks the browser first and registers the subscription it hands back.
 * Other browsers that subscribed are listed so they can be stopped from
 * here — a phone that was lost cannot turn itself off.
 *
 * A search narrows the switches and devices as it is typed, and the switches
 * show as rows or as cards. Either way the whole row or card is the switch's
 * label, so a click anywhere on it flips the switch. A device is not flipped
 * by a click: its only action removes it, so only its button does that.
 */
export default function NotificationSettings({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery(notificationsQuery);

  // The switches answer instantly and the save follows; a refused save
  // puts the switch back and says so.
  const [prefs, setPrefs] = useState<PreferencesUpdate | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    if (data) setPrefs({ newOpportunities: data.newOpportunities, winners: data.winners, byEmail: data.byEmail });
  }, [data]);

  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('list');
  // The layout is a per-device preference, read after mount so the server
  // render and the first client render agree.
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

  const change = async (patch: Partial<PreferencesUpdate>) => {
    if (!prefs) return;
    const before = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaveError(null);
    try {
      await savePreferences(next);
      queryClient.setQueryData<NotificationPreferences | null>(notificationsQuery.queryKey, (old) =>
        old ? { ...old, ...next } : old,
      );
    } catch (e) {
      setPrefs(before);
      setSaveError(e instanceof Error ? e.message : 'The change could not be saved.');
    }
  };

  // ---- push on this device ------------------------------------------
  // null until mounted: the server cannot know what this browser can do.
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [thisHash, setThisHash] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  useEffect(() => {
    setSupport(pushSupport());
    let cancelled = false;
    currentSubscription()
      .then((subscription) => (subscription ? sha256Hex(subscription.endpoint) : null))
      .then((hash) => {
        if (!cancelled) setThisHash(hash);
      })
      .catch(() => {
        /* nothing to find — the switch shows off */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const devices = data?.devices ?? [];
  const thisDevice = thisHash ? devices.find((d) => d.endpointHash === thisHash) : undefined;
  const otherDevices = devices.filter((d) => d !== thisDevice);
  const pushOn = !!thisDevice;

  const togglePush = async (on: boolean) => {
    if (!data?.pushKey) return;
    setPushBusy(true);
    setPushError(null);
    try {
      if (on) {
        const parts = subscriptionParts(await subscribe(data.pushKey));
        await registerDevice({ ...parts, label: deviceLabel() });
        setThisHash(await sha256Hex(parts.endpoint));
      } else {
        await unsubscribe();
        if (thisDevice) await removeDevice(thisDevice.id);
        setThisHash(null);
      }
      await queryClient.invalidateQueries({ queryKey: notificationsQuery.queryKey });
    } catch (e) {
      setPushError(
        e instanceof PushDeclined
          ? 'The browser did not allow notifications. Try again and choose Allow — or, if you blocked them, allow this site in the browser’s settings first.'
          : e instanceof Error
            ? `Push could not be turned on here: ${e.message}`
            : 'Push could not be turned on here.',
      );
    } finally {
      // A refusal in the prompt shows up as "denied" from here on.
      setSupport(pushSupport());
      setPushBusy(false);
    }
  };

  const remove = async (device: PushDevice) => {
    setPushError(null);
    try {
      await removeDevice(device.id);
      await queryClient.invalidateQueries({ queryKey: notificationsQuery.queryKey });
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'The device could not be removed.');
    }
  };

  if (isLoading || (data && !prefs)) {
    return <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>;
  }
  if (isError || !data || !prefs) {
    return (
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
        <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
        <p className="mt-3 font-medium">Your notification settings could not be loaded</p>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          Nothing has changed — this page only reads them.
        </p>
        <Button label="Try again" className="mt-4" outlined onClick={() => void refetch()} />
      </div>
    );
  }

  const pushDetail =
    support === 'insecure'
      ? 'Push needs a secure (https) address. This portal is open over plain http, so the browser will not allow it here.'
      : support === 'unsupported'
        ? 'This browser cannot receive push notifications.'
        : support === 'denied'
          ? 'Notifications are blocked for this site in the browser. Allow them in the browser’s site settings, then come back.'
          : pushOn
            ? 'On. A notification arrives on this device even while the portal is closed.'
            : 'The browser asks once for permission; a notification then arrives even while the portal is closed.';

  const topics: Setting[] = [
    {
      id: 'notify-new-opportunities',
      label: 'An opportunity opens',
      detail: 'The brief, the award and the deadline, the moment a client publishes.',
      checked: prefs.newOpportunities,
      onChange: (v) => void change({ newOpportunities: v }),
    },
    {
      id: 'notify-winners',
      label: 'A winner is announced',
      detail: 'Who won, and what the award was.',
      checked: prefs.winners,
      onChange: (v) => void change({ winners: v }),
    },
  ];
  const channels: Setting[] = [
    {
      id: 'notify-email',
      label: 'Email',
      detail: `To ${me.email}. Every one of these emails carries a one-click way to stop them.`,
      checked: prefs.byEmail,
      onChange: (v) => void change({ byEmail: v }),
    },
    {
      id: 'notify-push',
      label: 'Push on this device',
      detail: pushDetail,
      checked: pushOn,
      disabled: support !== 'ok' || pushBusy || !data.pushKey,
      onChange: (v) => void togglePush(v),
    },
  ];

  // Every word typed must appear in a switch's name or description, or a
  // device's name, in any order; part of a word counts. The summary line
  // above stays whole — it is what will happen, not what was searched.
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const matches = (...fields: (string | null | undefined)[]) => {
    if (!searching) return true;
    const known = fields.filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => known.includes(w));
  };
  const shownTopics = topics.filter((s) => matches(s.label, s.detail));
  const shownChannels = channels.filter((s) => matches(s.label, s.detail));
  const shownDevices = otherDevices.filter((d) => matches(d.label ?? 'A browser', 'device push', addedOn(d)));
  const nothing = searching && shownTopics.length + shownChannels.length + shownDevices.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* No button: the settings narrow as the box is typed in. */}
        <form role="search" onSubmit={(e) => e.preventDefault()} className="flex min-w-[12rem] flex-1 items-center">
          <span className="relative flex-1">
            <i
              className="pi pi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-color-secondary)]"
              aria-hidden
            />
            <InputText
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search settings and devices"
              className={q ? 'w-full !pl-10 !pr-10' : 'w-full !pl-10'}
              aria-label="Search notification settings"
              enterKeyHint="search"
            />
            {q && (
              <Button
                type="button"
                icon="pi pi-times"
                aria-label="Clear search"
                text
                rounded
                size="small"
                className="wp-search-clear"
                onClick={() => setQ('')}
              />
            )}
          </span>
        </form>
        <SelectButton
          value={view}
          onChange={(e) => e.value && chooseView(e.value as View)}
          options={VIEW_OPTIONS}
          optionLabel="label"
          itemTemplate={(o: (typeof VIEW_OPTIONS)[number]) => <i className={o.icon} aria-hidden title={o.label} />}
          allowEmpty={false}
          aria-label="Layout"
        />
      </div>

      <p
        role="status"
        className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-5 py-4 text-sm text-[var(--text-color)]"
      >
        <i className="pi pi-bell mr-2 text-[var(--primary-color)]" aria-hidden />
        {summarise(prefs, pushOn, otherDevices.length)}
      </p>

      {nothing ? (
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
          <i className="pi pi-search text-3xl text-[var(--text-color-secondary)]" aria-hidden />
          <p className="mt-3 font-medium">No setting matches</p>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            Nothing here has &ldquo;{q.trim()}&rdquo; in its name or description.
          </p>
          <Button label="Clear search" icon="pi pi-times" text size="small" className="mt-3" onClick={() => setQ('')} />
        </div>
      ) : (
        <>
          {shownTopics.length > 0 && (
            <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-5 py-4">
              <h2 className="text-lg font-semibold">Tell me when</h2>
              <Settings items={shownTopics} view={view} />
            </section>
          )}

          {(shownChannels.length > 0 || shownDevices.length > 0) && (
            <section className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-5 py-4">
              <h2 className="text-lg font-semibold">Send it by</h2>
              {shownChannels.length > 0 && <Settings items={shownChannels} view={view} />}
              {shownDevices.length > 0 && (
                <div className="mt-2 border-t border-[var(--surface-border)] pt-4">
                  <h3 className="text-sm font-semibold">Other devices with push on</h3>
                  {view === 'cards' ? (
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                      {shownDevices.map((d) => (
                        <li
                          key={d.id}
                          className="flex flex-col rounded-lg border border-[var(--surface-border)] p-4 text-sm"
                        >
                          <span className="font-medium">{d.label ?? 'A browser'}</span>
                          <span className="text-xs text-[var(--text-color-secondary)]">added {addedOn(d)}</span>
                          <span className="mt-auto flex justify-end pt-2">
                            <Button label="Remove" size="small" text onClick={() => void remove(d)} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="mt-1">
                      {shownDevices.map((d) => (
                        <li key={d.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                          <span className="min-w-0">
                            {d.label ?? 'A browser'}
                            <span className="text-[var(--text-color-secondary)]">
                              {' · added '}
                              {addedOn(d)}
                            </span>
                          </span>
                          <Button label="Remove" size="small" text onClick={() => void remove(d)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {pushError && (
        <p role="alert" className="text-sm text-red-600">
          {pushError}
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-red-600">
          {saveError}
        </p>
      )}
    </div>
  );
}

/** "12 Sept" — when a device turned push on. */
function addedOn(d: PushDevice): string {
  return new Date(d.createdAtUtc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** One line that says what will actually happen — the check on four switches. */
function summarise(prefs: PreferencesUpdate, pushOn: boolean, otherDevices: number): string {
  const topics = [prefs.newOpportunities && 'an opportunity opens', prefs.winners && 'a winner is announced'].filter(
    (t): t is string => !!t,
  );
  const push = pushOn
    ? `a push on this device${otherDevices > 0 ? ' and others' : ''}`
    : otherDevices > 0
      ? `a push on ${otherDevices} other device${otherDevices === 1 ? '' : 's'}`
      : null;
  const channels = [prefs.byEmail && 'an email', push].filter((c): c is string => !!c);
  if (topics.length === 0) return 'Nothing is switched on yet. Choose what you want to hear about.';
  if (channels.length === 0) {
    return 'You have chosen what to hear about, but no way to hear it. Turn on email or push.';
  }
  return `You will get ${channels.join(' and ')} when ${topics.join(' or ')}.`;
}

/** A section's switches, as rows or as cards. */
function Settings({ items, view }: { items: Setting[]; view: View }) {
  if (view === 'cards') {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((s) => (
          <SettingCard key={s.id} {...s} />
        ))}
      </div>
    );
  }
  return (
    <div className="mt-1 divide-y divide-[var(--surface-border)]">
      {items.map((s) => (
        <Row key={s.id} {...s} />
      ))}
    </div>
  );
}

/**
 * One switch as a row. The whole row is the switch's label, so a click on
 * its words flips it exactly as a click on the switch does — one change,
 * saved the same way — and a disabled switch ignores both.
 */
function Row({ id, label, detail, checked, disabled = false, onChange }: Setting) {
  return (
    <label
      htmlFor={id}
      className={`-mx-2 flex items-start justify-between gap-4 rounded-lg px-2 py-4 transition-colors ${
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-[var(--surface-hover)]'
      }`}
    >
      <span className="min-w-0">
        <span className="block font-medium text-[var(--text-color)]">{label}</span>
        <span className="mt-0.5 block text-sm text-[var(--text-color-secondary)]">{detail}</span>
      </span>
      {/* shrink-0: beside a long description the flex row would squeeze the
          switch's track down to its knob. */}
      <InputSwitch
        inputId={id}
        className="shrink-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(!!e.value)}
        aria-label={label}
      />
    </label>
  );
}

/** One switch as a card: the same label-wrapped switch, with the state in its border. */
function SettingCard({ id, label, detail, checked, disabled = false, onChange }: Setting) {
  return (
    <label
      htmlFor={id}
      className={`flex h-full flex-col rounded-lg border p-4 transition-colors ${
        checked
          ? 'border-[var(--primary-color)] bg-[color-mix(in_srgb,var(--primary-color)_8%,transparent)]'
          : 'border-[var(--surface-border)]'
      } ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-[var(--primary-color)]'}`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-medium text-[var(--text-color)]">{label}</span>
        <InputSwitch
          inputId={id}
          className="shrink-0"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(!!e.value)}
          aria-label={label}
        />
      </span>
      <span className="mt-1 block text-sm text-[var(--text-color-secondary)]">{detail}</span>
    </label>
  );
}
