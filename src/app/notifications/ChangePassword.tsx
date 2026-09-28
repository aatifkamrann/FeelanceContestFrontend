'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { Password } from 'primereact/password';
import PasswordRules from '@/components/PasswordRules';
import { ApiError, postJson } from '@/lib/opportunities';
import { notificationsQuery } from '@/lib/notifications';
import { passwordAcceptable } from '@/lib/password';

/**
 * The signed-in member's own password, beside their notification switches.
 * The same checklist and confirm box as joining, plus the current password:
 * a session left open on a shared machine should not be enough to take the
 * account. The API signs every other device out and keeps this one.
 */
export default function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The profile's Change password link lands here with #password. The
  // browser's own jump comes too early — the tab renders after the account
  // loads, and the switches above grow when theirs does — so the scroll waits
  // for the same query the switches wait for.
  const section = useRef<HTMLElement>(null);
  const { isPending } = useQuery(notificationsQuery);
  useEffect(() => {
    if (isPending || window.location.hash !== '#password') return;
    requestAnimationFrame(() => section.current?.scrollIntoView({ block: 'start' }));
  }, [isPending]);

  const blocker =
    current === ''
      ? 'Type your current password'
      : !passwordAcceptable(password)
        ? 'Finish the new password'
        : confirm !== password
          ? 'The passwords do not match'
          : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocker) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await postJson('/api/auth/change-password', { currentPassword: current, newPassword: password });
      setCurrent('');
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not reach the portal. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section ref={section} id="password" className="mt-6 scroll-mt-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] px-5 py-4">
      <h2 className="text-lg font-semibold">Password</h2>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        Changing it signs out every other device on this account. This one stays signed in.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="current-password" className="text-sm font-medium">
            Current password
          </label>
          <Password
            inputId="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setDone(false);
            }}
            feedback={false}
            toggleMask
            autoComplete="current-password"
            inputClassName="w-full"
            className="mt-1 w-full"
          />
        </div>
        <div>
          <label htmlFor="change-password" className="text-sm font-medium">
            New password
          </label>
          <Password
            inputId="change-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            feedback={false}
            toggleMask
            autoComplete="new-password"
            inputClassName="w-full"
            className="mt-1 w-full"
            aria-describedby="change-password-rules"
          />
          <PasswordRules password={password} id="change-password-rules" />
        </div>
        <div>
          <label htmlFor="change-password-confirm" className="text-sm font-medium">
            Confirm password
          </label>
          <Password
            inputId="change-password-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            feedback={false}
            toggleMask
            autoComplete="new-password"
            inputClassName="w-full"
            className="mt-1 w-full"
          />
          {confirm !== '' && confirm !== password && (
            <p className="mt-1 text-xs text-red-500">Both boxes have to say the same thing.</p>
          )}
        </div>
        {error && <Message severity="error" text={error} className="w-full" />}
        {done && (
          <Message
            severity="success"
            text="Password changed. Every other device was signed out."
            className="w-full"
          />
        )}
        <div>
          <Button
            type="submit"
            icon="pi pi-key"
            label={blocker ?? 'Change password'}
            loading={busy}
            disabled={blocker !== null}
          />
        </div>
      </form>
    </section>
  );
}
