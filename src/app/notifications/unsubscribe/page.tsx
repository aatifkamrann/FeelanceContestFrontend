'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import SiteHeader from '@/components/SiteHeader';
import { ApiError } from '@/lib/opportunities';
import { notificationsQuery, unsubscribeByToken } from '@/lib/notifications';

/**
 * The one click at the foot of every opted-in email. The token in the
 * link is the proof, so this works signed out; it stops email and only
 * email, and says where the rest is controlled. A link scanner that
 * fetches the page runs no script, so it cannot unsubscribe anyone.
 */
export default function UnsubscribePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Suspense fallback={null}>
          <Unsubscribe />
        </Suspense>
      </main>
    </>
  );
}

type State = 'working' | 'done' | 'invalid' | 'failed';

function Unsubscribe() {
  const token = useSearchParams().get('token');
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>('working');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }
    let cancelled = false;
    setState('working');
    unsubscribeByToken(token)
      .then(() => {
        if (cancelled) return;
        setState('done');
        // If this browser is signed in, its Notifications page is now stale.
        void queryClient.invalidateQueries({ queryKey: notificationsQuery.queryKey });
      })
      .catch((e) => {
        if (!cancelled) setState(e instanceof ApiError && e.status === 400 ? 'invalid' : 'failed');
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt, queryClient]);

  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
      {state === 'working' ? (
        <>
          <i className="pi pi-spin pi-spinner text-3xl text-[var(--text-color-secondary)]" aria-hidden />
          <p className="mt-3 font-medium">Turning email notifications off…</p>
        </>
      ) : state === 'done' ? (
        <>
          <i className="pi pi-check-circle text-3xl text-green-600" aria-hidden />
          <p className="mt-3 font-medium">Email notifications are off</p>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            No more opportunity emails will come from this portal. Push notifications on any device you
            turned them on stay on; both are yours to change under Notifications.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/notifications" className="no-underline">
              <Button label="Notifications" icon="pi pi-bell" outlined />
            </Link>
            <Link href="/opportunities" className="no-underline">
              <Button label="Browse opportunities" text />
            </Link>
          </div>
        </>
      ) : state === 'invalid' ? (
        <>
          <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
          <p className="mt-3 font-medium">This link is not valid</p>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            It may have been cut short by your email client. Sign in and turn email off under
            Notifications instead.
          </p>
          <Link href="/login?next=%2Fnotifications" className="no-underline">
            <Button label="Sign in" className="mt-4" />
          </Link>
        </>
      ) : (
        <>
          <i className="pi pi-exclamation-triangle text-3xl text-amber-500" aria-hidden />
          <p className="mt-3 font-medium">The portal could not be reached</p>
          <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
            Nothing has changed yet. Try again in a moment.
          </p>
          <Button label="Try again" className="mt-4" outlined onClick={() => setAttempt((n) => n + 1)} />
        </>
      )}
    </div>
  );
}
