'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { Message } from 'primereact/message';
import AuthShell from '@/components/AuthShell';
import { ApiError, meQuery, postJson } from '@/lib/opportunities';

/**
 * Where to go after signing in. A page that needs a session sends people
 * here with `?next=`; only a path on this portal counts — anything carrying
 * a host (`//evil.example`, `https://…`) is dropped, so the sign-in page can
 * never be turned into a redirect to somewhere else.
 */
function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  // With nowhere named, the list of opportunities — where signing in has always
  // led, before the landing page took the portal's front door.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/opportunities';
}

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  // A wrong password is the one error this form gives no detail on, so the
  // most common cause of one is worth naming while it is still being typed.
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Sent here by Revoke all sessions: the administrator who pressed it is
  // signed out with everyone else, and should see that it worked.
  const [revoked, setRevoked] = useState(false);
  useEffect(() => {
    setRevoked(new URLSearchParams(window.location.search).get('revoked') === '1');
  }, []);

  // Signed in already: there is nothing to sign in to, so the visitor goes
  // where the page that sent them wanted, or home. The form itself signs
  // people in, and while it is busy the submit handler decides where they
  // go, not this.
  const { data: me } = useQuery(meQuery);
  const alreadySignedIn = busy ? null : me;
  useEffect(() => {
    if (alreadySignedIn) router.replace(safeNext());
  }, [alreadySignedIn, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/auth/login', { email, password, rememberMe });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.push(safeNext());
      router.refresh();
    } catch (err) {
      // Only a 401 means the credentials were wrong. Anything else — the
      // API down, the network gone — must not be blamed on the password.
      setError(
        err instanceof ApiError
          ? err.status === 401
            ? 'Wrong email or password.'
            : err.message
          : 'Could not reach the portal. Check your connection and try again.',
      );
      setBusy(false);
    }
  };

  if (alreadySignedIn) {
    return (
      <AuthShell title="You're already signed in">
        <p className="mt-6 text-sm text-[var(--text-color-secondary)]">
          Signed in as {alreadySignedIn.displayName}. To use a different account, sign out first.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in">
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {revoked && (
          <Message
            severity="info"
            text="Every session was revoked, this one included. Sign in again."
            className="w-full justify-start"
          />
        )}
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <InputText
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full"
            required
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Password
            inputId="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
            onBlur={() => setCapsLock(false)}
            feedback={false}
            toggleMask
            autoComplete="current-password"
            inputClassName="w-full"
            className="mt-1 w-full"
            required
          />
          {capsLock && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400" role="status">
              <i className="pi pi-exclamation-triangle mr-1" aria-hidden />
              Caps Lock is on.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
          <label
            htmlFor="remember"
            className="flex cursor-pointer items-center gap-2"
            title="Stay signed in on this device after the browser closes. Leave it off on a shared machine."
          >
            <Checkbox
              inputId="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(!!e.checked)}
            />
            Keep me signed in
          </label>
          <Link href="/forgot-password" className="ml-auto text-[var(--primary-color)]">
            Forgot your password?
          </Link>
        </div>
        {error && <Message severity="error" text={error} className="w-full" />}
        <Button type="submit" label="Sign in" loading={busy} />
      </form>
      <p className="mt-4 text-sm text-[var(--text-color-secondary)]">
        New here?{' '}
        <Link href="/register" className="text-[var(--primary-color)]">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
