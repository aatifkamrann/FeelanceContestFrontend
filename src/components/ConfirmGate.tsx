'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import ConfirmCodeForm, { VERIFY_TITLE, verifyLede } from '@/components/ConfirmCodeForm';
import { brandingQuery } from '@/lib/api';
import { meQuery, postJson } from '@/lib/opportunities';

/**
 * Meets an account that never entered its code — somebody who closed the
 * tab at the join form and signed in a week later. Mounted once beside the
 * terms gate, so it appears on whatever page they land; it cannot be
 * dismissed, because the API refuses everything but the code until one is
 * entered, and the only honest choices are to enter it or to sign out.
 *
 * The same title, the same line and the same form as the join card's second
 * step: somebody who left halfway through is finishing that step, not
 * meeting a different screen.
 *
 * Not on the join page itself: the card there carries the same form as its
 * second step, and two of them would be one too many.
 */
export default function ConfirmGate() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: branding } = useQuery(brandingQuery);

  if (!me?.confirmationPending || pathname === '/register') return null;

  const signOut = async () => {
    await postJson('/api/auth/logout');
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    router.push('/');
    router.refresh();
  };

  return (
    <Dialog
      visible
      modal
      closable={false}
      closeOnEscape={false}
      draggable={false}
      resizable={false}
      blockScroll
      onHide={() => undefined}
      header={VERIFY_TITLE}
      style={{ width: 'min(26rem, calc(100vw - 2rem))' }}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-[var(--text-color-secondary)]">
            Signed in as {me.email}
          </span>
          <Button label="Sign out" text size="small" severity="secondary" onClick={signOut} />
        </div>
      }
    >
      <p className="text-sm font-medium">{verifyLede(me.role)}</p>
      <p className="mb-4 mt-1 text-sm text-[var(--text-color-secondary)]">
        {branding?.phoneCodes
          ? 'Your account can do nothing until an email address or a phone number is confirmed — that is what makes every member here somebody who can be reached.'
          : 'Your account can do nothing until your email address is confirmed — that is what makes every member here somebody who can be reached.'}
      </p>
      <ConfirmCodeForm sentTo={me.codeSentTo} role={me.role} onConfirmed={() => router.refresh()} />
    </Dialog>
  );
}
