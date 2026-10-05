'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { identityQuery, startProblem, startVerification } from '@/lib/identity';

/**
 * A verification started and left unfinished — the provider's tab closed,
 * the phone put down — waits on the profile until it is finished or the
 * provider lets the session lapse. The link is the provider's own page for
 * that session. Pressing it asks the API first, which checks with the
 * provider: a session still open comes back as the same link, one that
 * lapsed meanwhile is replaced by a fresh one rather than opening on the
 * provider's "expired" page. Without script the link still works.
 */
export default function IdentityResumeNotice({ role, returnTo }: { role: string; returnTo: string }) {
  const { data: identity } = useQuery(identityQuery);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!identity?.enabled || identity.status !== 'pending' || !identity.continueUrl) return null;

  const resume = async (e: React.MouseEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { url } = await startVerification(returnTo);
      window.location.href = url;
    } catch (err) {
      setError(startProblem(err));
      setBusy(false);
      void queryClient.invalidateQueries({ queryKey: ['identity'] });
    }
  };

  const holds = identity.required
    ? role === 'client'
      ? ' Until it is done, your first opportunity cannot be published.'
      : ' Until it is done, you cannot apply to opportunities.'
    : '';

  return (
    <div
      role="status"
      className="mt-6 rounded-xl border border-amber-400/70 bg-amber-100/70 p-4 dark:border-amber-500/50 dark:bg-amber-500/10"
    >
      <p className="font-semibold">
        <i className="pi pi-id-card mr-2 text-amber-600 dark:text-amber-400" aria-hidden />
        Your identity verification is not finished
      </p>
      <p className="mt-1 text-sm">
        You started it with the verification provider and left before the end. Pick up where you left off — the
        link below stays here until you finish or the provider closes the session.{holds}
      </p>
      <a href={identity.continueUrl} onClick={(e) => void resume(e)} className="no-underline">
        <Button
          label="Continue verification"
          icon="pi pi-arrow-right"
          iconPos="right"
          size="small"
          loading={busy}
          className="mt-3"
        />
      </a>
      {error && <Message severity="error" className="mt-3 w-full justify-start" text={error} />}
    </div>
  );
}
