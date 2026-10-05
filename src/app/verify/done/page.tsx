'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import SiteHeader from '@/components/SiteHeader';
import { ApiError } from '@/lib/opportunities';
import { refreshVerification, returnLabel, returnPath, verifyPath, type IdentityState } from '@/lib/identity';

/** How long an answer stays on screen before the browser goes back to where the verification was started. */
const RETURN_SECONDS = 6;

/**
 * Where the provider sends the member back. Its webhook usually beat them
 * here; where it did not, this page asks the provider for the verdict
 * itself, so a member who closed the provider's tab still sees an answer
 * — and the header's cue and every gated door read the same fact.
 *
 * Once there is an answer — passed, declined, or with a reviewer — the page
 * shows it for a few seconds and goes back to the page the verification was
 * started from, which the API kept with the session. The member can go at
 * once, or stay.
 */
export default function VerifyDonePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<IdentityState | null>(null);
  const [failed, setFailed] = useState<'signed-out' | 'unread' | null>(null);
  const [stay, setStay] = useState(false);
  const [left, setLeft] = useState(RETURN_SECONDS);
  // The API's way back first — it holds for any browser signed in as the
  // member. The address or this browser's copy only for a session started
  // before the API kept one.
  const fallback = typeof window === 'undefined' ? null : returnPath(window.location.search);
  const next = state?.returnTo ?? fallback;
  const answered = state?.status === 'approved' || state?.status === 'declined' || state?.status === 'in_review';
  const returning = answered && !!next && !stay;

  useEffect(() => {
    let cancelled = false;
    refreshVerification()
      .then(async (s) => {
        if (cancelled) return;
        setState(s);
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        await queryClient.invalidateQueries({ queryKey: ['identity'] });
        // An application's eligibility step reads the verdict too, and is
        // where the way back usually leads.
        await queryClient.invalidateQueries({ queryKey: ['apply'] });
      })
      .catch((err) => {
        if (!cancelled) setFailed(err instanceof ApiError && err.status === 401 ? 'signed-out' : 'unread');
      });
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  useEffect(() => {
    if (!returning || !next) return;
    if (left <= 0) {
      router.replace(next);
      return;
    }
    const tick = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(tick);
  }, [returning, next, left, router]);

  const goingBack = returning && next && (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1 text-sm text-[var(--text-color-secondary)]">
      <span aria-live="polite">
        Taking you {returnLabel(next).toLowerCase()} in {Math.max(left, 0)}s
      </span>
      <Button label="Stay on this page" text size="small" onClick={() => setStay(true)} />
    </div>
  );

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
          {failed === 'signed-out' ? (
            <>
              <i className="pi pi-desktop text-3xl text-[var(--text-color-secondary)]" aria-hidden />
              <p className="mt-3 font-medium">Finished on this device?</p>
              <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                This browser is not signed in, so it cannot show your answer. Go back to the browser you started
                the verification in — it moves on by itself — or sign in here to see it.
              </p>
              <Link href={`/login?next=${encodeURIComponent('/verify/done')}`} className="no-underline">
                <Button label="Sign in" icon="pi pi-sign-in" className="mt-4" outlined />
              </Link>
            </>
          ) : failed ? (
            <>
              <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
              <p className="mt-3 font-medium">Your answer could not be read just now</p>
              <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
                The provider&rsquo;s verdict reaches this portal on its own; check back in a minute, or open the
                verify page again.
              </p>
              <Link href={verifyPath(fallback)} className="no-underline">
                <Button label="Open the verify page" className="mt-4" outlined />
              </Link>
            </>
          ) : state === null ? (
            <p className="py-6 text-[var(--text-color-secondary)]">Reading the provider&rsquo;s answer…</p>
          ) : state.status === 'approved' ? (
            <>
              <i className="pi pi-verified text-5xl text-green-700 dark:text-green-400" role="img" aria-label="Verified" />
              <h1 className="mt-4 text-2xl font-bold">Your identity is verified</h1>
              <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                You will not be asked again. Your profile carries the mark from now on.
              </p>
              <Link href={next ?? '/'} className="no-underline">
                <Button label={next ? returnLabel(next) : 'Continue'} icon="pi pi-arrow-right" className="mt-5" />
              </Link>
              {goingBack}
            </>
          ) : state.status === 'in_review' ? (
            <>
              <i className="pi pi-clock text-5xl text-[var(--text-color-secondary)]" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold">The provider is reviewing it</h1>
              <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                A person at the provider is looking at your documents; that usually takes a few hours. You
                will get an email when it is decided, and the doors that asked for it open then.
              </p>
              <Link href={next ?? '/'} className="no-underline">
                <Button label={next ? returnLabel(next) : 'Continue'} className="mt-5" outlined />
              </Link>
              {goingBack}
            </>
          ) : state.status === 'declined' ? (
            <>
              <i className="pi pi-times-circle text-5xl text-red-600 dark:text-red-400" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold">The verification did not pass</h1>
              <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                {state.note ? `The provider says: ${state.note}. ` : ''}
                That is usually a photograph the provider could not read rather than anything about you. You
                can try again straight away, with the same or another document.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link href={verifyPath(next)} className="no-underline">
                  <Button label="Try again" icon="pi pi-refresh" />
                </Link>
                {next && (
                  <Link href={next} className="no-underline">
                    <Button label={returnLabel(next)} outlined />
                  </Link>
                )}
              </div>
              {goingBack}
            </>
          ) : (
            <>
              <i className="pi pi-hourglass text-5xl text-[var(--text-color-secondary)]" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold">Not finished yet</h1>
              <p className="mt-2 text-sm text-[var(--text-color-secondary)]">
                The provider has not recorded an answer for this session. If you closed its page early, you can
                pick up where you left off.
              </p>
              <Link href={verifyPath(next)} className="no-underline">
                <Button label="Continue verification" icon="pi pi-id-card" className="mt-5" />
              </Link>
            </>
          )}
        </div>
      </main>
    </>
  );
}
