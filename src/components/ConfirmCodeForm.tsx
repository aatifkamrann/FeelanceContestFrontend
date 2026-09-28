'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import HelpIcon from '@/components/HelpIcon';
import { brandingQuery } from '@/lib/api';
import { ApiError, postJson, type CodeSentTo } from '@/lib/opportunities';

/**
 * The one form an unconfirmed account can use: the six digits from the
 * email or the text, and a way to get a fresh pair. Shared between the
 * join card, where it is the second step, and the gate that meets a
 * returning account that never finished — so the two never drift.
 *
 * It says where the codes went, masked, because "check your email" is
 * useless to somebody who mistyped their address: the mask is enough to
 * spot that, and not enough to copy over a shoulder.
 *
 * A portal with no SMS gateway never texted anybody, so nothing here names
 * a phone: not the sentence above the box, not the help behind the label.
 */
export const VERIFY_TITLE = 'Verify Your Account';

/**
 * The line under that title. Both halves of the market have to verify, and
 * a client told that verification is what lets freelancers apply has been
 * told something true about somebody else.
 */
export const verifyLede = (role?: string): string =>
  role === 'client'
    ? 'Only verified clients can post opportunities across the network.'
    : 'Only verified freelancers can apply to opportunities across the network.';

/** "15:00" — a whole number of seconds as minutes and seconds. */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ConfirmCodeForm({
  sentTo,
  phoneFailed = false,
  role,
  onConfirmed,
}: {
  sentTo: CodeSentTo;
  /** A text was tried and the gateway refused it — say so, once. */
  phoneFailed?: boolean;
  /** Which side of the market this account is, for the line under the title. */
  role?: string;
  onConfirmed: () => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [where, setWhere] = useState(sentTo);
  const [textFailed, setTextFailed] = useState(phoneFailed);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data: branding } = useQuery(brandingQuery);
  const canText = branding?.phoneCodes ?? false;
  // Seconds until another send is allowed; the API holds the same minute.
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // The code's own clock, counted from the moment it dies rather than down
  // from fifteen: a tab left in the background, or an account that comes
  // back a week later, then still reads the truth. Null until mounted, so
  // the server and the browser render the same thing.
  const expiresAt = where.expiresAtUtc ? new Date(where.expiresAtUtc).getTime() : null;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (expiresAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  const left = expiresAt === null || now === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const expired = left === 0;

  // The code checks itself when its sixth digit lands, once per code: a
  // wrong one then waits for an edit rather than spending the five tries
  // the pair gets. Confirm stays for whatever the box missed.
  const input = useRef<HTMLInputElement>(null);
  const autoTried = useRef('');

  const check = async (value: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await postJson('/api/auth/confirm', { code: value });
      // Everything the page under this may have asked for answered 403
      // until now; all of it is worth asking again.
      await queryClient.invalidateQueries();
      await onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The code could not be checked.');
      setBusy(false);
      // Selected, so the next digits typed replace the wrong ones.
      input.current?.focus();
      input.current?.select();
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void check(code);
  };

  // Digits only, whatever arrives: a pasted "123 456", or the whole line
  // "Your code is 123456", reads as the six digits it carries.
  const type = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy && !expired && digits !== autoTried.current) {
      autoTried.current = digits;
      void check(digits);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await postJson<{ sentTo: CodeSentTo; phoneFailed: boolean }>('/api/auth/resend-code');
      // The new expiry rides in with it, so the counter below restarts on
      // the fresh code rather than on the moment this button was pressed.
      setWhere(res.sentTo);
      setTextFailed(res.phoneFailed);
      setCode('');
      autoTried.current = '';
      setWait(60);
      setNotice('A new code is on its way. The old one no longer works.');
    } catch (err) {
      // 429 carries how long to wait; the message already says it.
      if (err instanceof ApiError && err.status === 429) setWait(60);
      setError(err instanceof Error ? err.message : 'A new code could not be sent.');
    } finally {
      setResending(false);
    }
  };

  const places = [where.email, where.phone].filter((p): p is string => !!p);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-[var(--text-color-secondary)]">
        {places.length === 0
          ? 'No code is standing right now — send one below.'
          : `We sent a code to ${places.join(' and to ')}. ${places.length > 1 ? 'Enter either one' : 'Enter it below'}.`}
      </p>
      {textFailed && (
        <Message
          severity="warn"
          className="w-full justify-start"
          text="The text could not be sent, so only the emailed code is on its way."
        />
      )}
      <div>
        <label htmlFor="confirm-code" className="text-sm font-medium">
          Code
          <HelpIcon topic={canText ? 'register.code' : 'register.emailCode'} label="About the code" />
        </label>
        {/* No maxLength: the browser would cut a pasted line before the
            digits in it are read. */}
        <InputText
          id="confirm-code"
          ref={input}
          value={code}
          onChange={(e) => type(e.target.value)}
          className="mt-1 w-full text-center text-xl tracking-[0.4em]"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          readOnly={busy}
          required
          autoFocus
        />
        {left !== null &&
          (expired ? (
            <p className="mt-2 text-sm font-medium text-red-500">
              This code has expired — send a new one below.
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
              Code expires in{' '}
              <span className="font-medium tabular-nums text-[var(--text-color)]">{clock(left)}</span>
            </p>
          ))}
      </div>
      {error && <Message severity="error" text={error} className="w-full justify-start" />}
      {notice && <Message severity="success" text={notice} className="w-full justify-start" />}
      <Button
        type="submit"
        label={busy ? 'Checking…' : 'Confirm'}
        loading={busy}
        disabled={busy || expired || code.length !== 6}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-color-secondary)]">
        <span>Nothing arrived? Check spam first.</span>
        <Button
          type="button"
          label={wait > 0 ? `Send a new code (${wait}s)` : 'Send a new code'}
          text
          size="small"
          loading={resending}
          disabled={wait > 0 || busy}
          onClick={resend}
        />
      </div>
    </form>
  );
}
