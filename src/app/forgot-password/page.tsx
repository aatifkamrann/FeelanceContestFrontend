'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import AuthShell from '@/components/AuthShell';
import { ApiError, postJson } from '@/lib/opportunities';

/**
 * Takes an address and says the same thing whether or not an account exists
 * for it. The API answers 204 either way, so neither this page nor the
 * request behind it can be used to find out who is registered.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the portal. Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Forgot your password?">
      {sent ? (
        <>
          <Message
            severity="success"
            className="mt-6 w-full justify-start"
            text={`If an account exists for ${email}, an email with a reset link is on its way. The link works once, for the next hour.`}
          />
          <p className="mt-4 text-sm text-[var(--text-color-secondary)]">
            Nothing arrived? Check spam first, then{' '}
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-[var(--primary-color)] hover:underline"
            >
              try again
            </button>{' '}
            in a minute.
          </p>
        </>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <p className="text-sm text-[var(--text-color-secondary)]">
            Enter the address you signed up with. The portal emails a link to choose a new
            password.
          </p>
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
          {error && <Message severity="error" text={error} className="w-full" />}
          <Button type="submit" label="Email me a reset link" loading={busy} />
        </form>
      )}

      <p className="mt-4 text-sm text-[var(--text-color-secondary)]">
        <Link href="/login" className="text-[var(--primary-color)]">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
