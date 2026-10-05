'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import HelpIcon from '@/components/HelpIcon';
import SiteHeader from '@/components/SiteHeader';
import ChatConversation from '@/components/chat/ChatConversation';
import ChatThreadList, { ChatEmpty } from '@/components/chat/ChatThreadList';
import { threadsQuery } from '@/lib/chat';
import { meQuery, type Me } from '@/lib/opportunities';

/**
 * Every conversation with the whole of its history: the list on the left,
 * the open one on the right, sent and received alike. Reached from the
 * dock at the corner of every page and from the menu; `?thread=<entry>`
 * opens on one. On a phone the two halves take turns.
 */
export default function MessagesPage() {
  const { data: me, isLoading } = useQuery(meQuery);
  const eligible = !!me && (me.role === 'client' || me.role === 'freelancer');

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold">
          Messages
          <HelpIcon topic="chat.messages" label="Messages" />
        </h1>
        <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
          {me?.role === 'client'
            ? 'A private conversation with each entrant of your opportunities, kept beside the entry it is about.'
            : 'A private conversation with the client of each opportunity you entered, kept beside the entry it is about.'}
        </p>

        <div className="mt-6">
          {isLoading ? (
            <p className="py-12 text-center text-[var(--text-color-secondary)]">Loading…</p>
          ) : !me ? (
            <SignedOut />
          ) : !eligible ? (
            <p className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center text-sm text-[var(--text-color-secondary)]">
              Conversations are between a client and the entrants of their opportunities; an administrator has none
              of their own. {me.role === 'admin' && (
                <>
                  To read members&apos; conversations for moderation, open{' '}
                  <Link href="/admin/conversations">Conversations</Link>.
                </>
              )}
            </p>
          ) : (
            <Suspense fallback={null}>
              <Panes me={me} />
            </Suspense>
          )}
        </div>
      </main>
    </>
  );
}

function Panes({ me }: { me: Me }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get('thread');
  // The dock, mounted on every page, keeps the one socket that refreshes this list.
  const { data, isError } = useQuery(threadsQuery);

  const select = (entryId: string | null) => {
    router.replace(entryId ? `${pathname}?thread=${encodeURIComponent(entryId)}` : pathname, { scroll: false });
  };

  const threads = data?.items ?? [];
  return (
    <div
      className="grid overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] md:grid-cols-[20rem_1fr]"
      style={{ height: 'min(44rem, calc(100vh - 14rem))', minHeight: '28rem' }}
    >
      {/* The list: on a phone, only while nothing is open. */}
      <aside
        className={`min-h-0 flex-col overflow-y-auto border-[var(--surface-border)] md:flex md:border-r ${
          selected ? 'hidden' : 'flex'
        }`}
        aria-label="Conversations"
      >
        {isError ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-color-secondary)]">
            Your conversations could not be loaded.
          </p>
        ) : !data ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-color-secondary)]">Loading…</p>
        ) : threads.length === 0 ? (
          <ChatEmpty seat={me.role} />
        ) : (
          <ChatThreadList threads={threads} selected={selected} onSelect={select} />
        )}
      </aside>

      {/* The open conversation: on a phone, only while one is. */}
      <section className={`min-h-0 flex-col md:flex ${selected ? 'flex' : 'hidden'}`} aria-label="Conversation">
        {selected ? (
          <ChatConversation entryId={selected} onBack={() => select(null)} backOnPhoneOnly />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <i className="pi pi-comments text-4xl text-[var(--text-color-secondary)]" aria-hidden />
              <p className="mt-3 text-sm text-[var(--text-color-secondary)]">
                {threads.length === 0 ? 'Nothing to read yet.' : 'Pick a conversation to read it.'}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SignedOut() {
  return (
    <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] p-10 text-center">
      <i className="pi pi-lock text-3xl text-[var(--text-color-secondary)]" aria-hidden />
      <p className="mt-3 font-medium">Sign in to read your messages</p>
      <p className="mt-1 text-sm text-[var(--text-color-secondary)]">
        Conversations open between a client and the entrants of their opportunities.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link href="/login?next=%2Fmessages" className="no-underline">
          <Button label="Sign in" icon="pi pi-sign-in" />
        </Link>
        <Link href="/register?next=%2Fmessages" className="no-underline">
          <Button label="Create an account" icon="pi pi-user-plus" outlined />
        </Link>
      </div>
    </div>
  );
}
