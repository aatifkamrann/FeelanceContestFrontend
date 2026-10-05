'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { usePortalName } from '@/components/PortalNote';
import SiteHeader from '@/components/SiteHeader';
import { meQuery } from '@/lib/opportunities';
import { identityQuery, rememberReturn, returnLabel, safeNext, startProblem, startVerification } from '@/lib/identity';

/**
 * The step a shut door sends a member to: what verification is, who sees
 * what, and one button that hands them to the provider. The provider's
 * page does the work; this one only says what is about to happen and, on
 * the way back (/verify/done), what came of it. A member who arrives here
 * already verified is told so and sent on.
 */
export default function VerifyPage() {
  const { data: me, isLoading: meLoading } = useQuery(meQuery);
  const { data: identity, isLoading } = useQuery({ ...identityQuery, enabled: !!me });
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const portal = usePortalName();
  const next = typeof window === 'undefined' ? null : safeNext(window.location.search);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      // An unfinished session comes back as its own link, so a closed
      // tab picks up where it was left rather than starting over.
      const { url } = await startVerification(next);
      rememberReturn(next);
      window.location.href = url;
    } catch (err) {
      setError(startProblem(err));
      setBusy(false);
      // Refused because it was decided meanwhile: show where it stands now.
      void queryClient.invalidateQueries({ queryKey: ['identity'] });
    }
  };

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        {meLoading || (me && isLoading) ? (
          <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
        ) : !me ? (
          <Card icon="pi-lock" title="Sign in to verify your identity">
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Verification is tied to the account it is done from.
            </p>
            <Link href={`/login?next=${encodeURIComponent('/verify')}`} className="no-underline">
              <Button label="Sign in" icon="pi pi-sign-in" className="mt-4" />
            </Link>
          </Card>
        ) : !identity?.enabled ? (
          <Card icon="pi-info-circle" title="This portal is not verifying identities at the moment">
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              Nothing on your account is waiting on it.
            </p>
            <Link href={next ?? '/'} className="no-underline">
              <Button label="Continue" className="mt-4" outlined />
            </Link>
          </Card>
        ) : identity.status === 'approved' ? (
          <Card icon="pi-verified" title="Your identity is verified" tone="good">
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              You will not be asked again.
            </p>
            <Link href={next ?? '/'} className="no-underline">
              <Button label={next ? returnLabel(next) : 'Continue'} icon="pi pi-arrow-right" className="mt-4" />
            </Link>
          </Card>
        ) : identity.status === 'in_review' ? (
          <Card icon="pi-clock" title="The provider is reviewing your verification">
            <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
              A person at the provider is looking at it; that usually takes a few hours and sometimes a day.
              You will get an email when it is decided, and the doors that asked for it open then.
            </p>
            <Link href={next ?? '/'} className="no-underline">
              <Button label={next ? returnLabel(next) : 'Continue'} className="mt-4" outlined />
            </Link>
          </Card>
        ) : (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-8">
            <h1 className="text-2xl font-bold">Verify your identity</h1>
            <p className="mt-3">
              {me.role === 'client'
                ? `${portal} asks a client to verify who they are before their first opportunity goes live. A published opportunity is a promise of money to strangers; this is what lets an entrant stake a fortnight on it.`
                : `${portal} asks a freelancer to verify who they are before their first application, and shows how to pay you only to clients once you have. It is what says a profile is a person.`}
            </p>
            <h2 className="mt-6 text-base font-semibold">What happens</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
              <li>
                You are sent to the verification provider&rsquo;s page, where you photograph an identity document
                — a passport, a national ID card or a driving licence — and your face. About two minutes.
              </li>
              <li>The provider checks the document and that the face matches it, and sends you back here.</li>
              <li>
                Most answers are immediate. A few go to a person at the provider for review, and you get an
                email when it is decided.
              </li>
            </ul>
            <h2 className="mt-6 text-base font-semibold">What {portal} keeps</h2>
            <p className="mt-2 text-sm">
              The verdict, the provider&rsquo;s reference for it, and — as proof of the check — what the provider
              read off your document and copies of the document and selfie images. Only {portal}&rsquo;s
              administrators can see them, and they are deleted if your account is removed or your verification
              is taken back.
            </p>
            {identity.status === 'declined' && (
              <Message
                severity="warn"
                className="mt-6 w-full justify-start"
                text={
                  'Your last attempt was declined' +
                  (identity.note ? ` (${identity.note})` : '') +
                  '. That is usually a photograph the provider could not read — try again with better light, the whole document in frame, or another document.'
                }
              />
            )}
            {identity.status === 'pending' && (
              <Message
                severity="info"
                className="mt-6 w-full justify-start"
                text="You started a verification and have not finished it. Continuing picks it up where you left off, for as long as the provider keeps the session open."
              />
            )}
            {error && <Message severity="error" className="mt-6 w-full justify-start" text={error} />}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                label={identity.status === 'pending' ? 'Continue verification' : 'Start verification'}
                icon="pi pi-id-card"
                loading={busy}
                onClick={() => void start()}
              />
              <Link href={next ?? '/'} className="text-sm no-underline text-[var(--text-color-secondary)]">
                Not now
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function Card({
  icon,
  title,
  tone = 'plain',
  children,
}: {
  icon: string;
  title: string;
  tone?: 'plain' | 'good';
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
      <i
        className={`pi ${icon} text-3xl ${tone === 'good' ? 'text-green-700 dark:text-green-400' : 'text-[var(--text-color-secondary)]'}`}
        aria-hidden
      />
      <p className="mt-3 font-medium">{title}</p>
      {children}
    </div>
  );
}
