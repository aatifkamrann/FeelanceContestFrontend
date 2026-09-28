'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Password } from 'primereact/password';
import { Message } from 'primereact/message';
import AuthShell from '@/components/AuthShell';
import PasswordRules from '@/components/PasswordRules';
import { ApiError, postJson } from '@/lib/opportunities';
import { passwordAcceptable } from '@/lib/password';

/**
 * The page the emailed link opens. The token arrives in the query string;
 * a good one plus an acceptable password signs the person in, so they land
 * on the portal rather than on a second form asking for what they just typed.
 */
function ResetForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <Message
        severity="warn"
        className="mt-6 w-full justify-start"
        text="This link is missing its token — a mail client may have cut it short. Request a new one below."
      />
    );
  }

  // Named on the button rather than found out by submitting, the way the
  // join form does it — and the same five requirements, because the API
  // holds one rule for both.
  const blocker = !passwordAcceptable(password)
    ? 'Finish the password'
    : password !== confirm
      ? 'The passwords do not match'
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/auth/reset-password', { token, password });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.push('/opportunities');
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the portal. Check your connection and try again.',
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      <div>
        <label htmlFor="password" className="text-sm font-medium">
          New password
        </label>
        <Password
          inputId="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          feedback={false}
          toggleMask
          autoComplete="new-password"
          inputClassName="w-full"
          className="mt-1 w-full"
          aria-describedby="reset-password-rules"
          required
          autoFocus
        />
        <PasswordRules password={password} id="reset-password-rules" />
      </div>
      <div>
        <label htmlFor="confirm" className="text-sm font-medium">
          Confirm password
        </label>
        <Password
          inputId="confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          feedback={false}
          toggleMask
          autoComplete="new-password"
          inputClassName="w-full"
          className="mt-1 w-full"
          required
        />
        {confirm !== '' && confirm !== password && (
          <p className="mt-1 text-xs text-red-500">Both boxes have to say the same thing.</p>
        )}
      </div>
      {error && <Message severity="error" text={error} className="w-full" />}
      <Button
        type="submit"
        label={blocker ?? 'Set password and sign in'}
        loading={busy}
        disabled={blocker !== null}
      />
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      {/* useSearchParams needs a Suspense boundary, or Next refuses to
          prerender the page at build time. */}
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
      <p className="mt-4 text-sm text-[var(--text-color-secondary)]">
        Link expired?{' '}
        <Link href="/forgot-password" className="text-[var(--primary-color)]">
          Request a new one
        </Link>
      </p>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        <Link href="/login" className="text-[var(--primary-color)]">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
