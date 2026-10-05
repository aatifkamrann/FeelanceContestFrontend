'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { termsQuery } from '@/lib/api';
import { meQuery, postJson, startFreshAt } from '@/lib/opportunities';
import { splitTermsTitle, STOCK_TERMS_TITLE } from '@/lib/terms';
import TermsText from './TermsText';

/**
 * The acceptance prompt. Mounted once, under the query provider, so it
 * appears on whatever page a signed-in person lands when the portal's
 * terms are newer than the version their account accepted — a raised
 * version, or an account older than the terms. It cannot be dismissed:
 * the API refuses their writes until they accept, so the only honest
 * choices are to accept or to sign out. Signed-out visitors never see it,
 * and neither does anyone on a portal without terms.
 */
export default function TermsGate() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const pending = !!me?.termsPending;
  const { data: terms } = useQuery({ ...termsQuery, enabled: pending });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pending) return null;

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/auth/accept-terms');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The acceptance could not be saved.');
    } finally {
      // The component outlives the dialog: it stays mounted rendering
      // nothing once accepted, and shows the dialog again at the next
      // raised version. A busy flag left set would greet that dialog with
      // two disabled buttons.
      setBusy(false);
    }
  };

  const signOut = async () => {
    await postJson('/api/auth/logout');
    startFreshAt('/');
  };

  const changed = me?.acceptedTermsVersion != null;
  // The document's own opening heading becomes the dialog's, shown once.
  const doc = terms?.markdown ? splitTermsTitle(terms.markdown) : null;
  const title = doc?.title ?? STOCK_TERMS_TITLE;

  return (
    <Dialog
      visible
      modal
      closable={false}
      closeOnEscape={false}
      draggable={false}
      resizable={false}
      blockScroll
      // Required by the type; nothing calls it — the only exits are the two buttons.
      onHide={() => undefined}
      header={terms?.version != null ? `${title} · version ${terms.version}` : title}
      style={{ width: 'min(46rem, calc(100vw - 2rem))' }}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button label="Sign out" text severity="secondary" onClick={signOut} disabled={busy} />
          <Button label="I accept" icon="pi pi-check" loading={busy} onClick={accept} />
        </div>
      }
    >
      <p className="text-sm text-[var(--text-color-secondary)]">
        {changed
          ? 'The terms have changed since you accepted them. Read the new version and accept it to keep using the portal.'
          : 'Read and accept the terms of service to keep using the portal.'}
      </p>
      <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-lg border border-[var(--surface-border)] p-4">
        {doc ? (
          <TermsText markdown={doc.body} />
        ) : (
          <i className="pi pi-spinner pi-spin" aria-label="Loading the terms" />
        )}
      </div>
      {error && <Message severity="error" text={error} className="mt-3 w-full justify-start" />}
    </Dialog>
  );
}
