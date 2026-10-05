'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { InputTextarea } from 'primereact/inputtextarea';
import Avatar from '@/components/Avatar';
import HelpIcon from '@/components/HelpIcon';
import ChatReport from '@/components/chat/ChatReport';
import {
  chatKeys,
  closedReason,
  fetchThread,
  markThreadRead,
  sendMessage,
  type ChatMessage,
  type ChatPage,
} from '@/lib/chat';

/**
 * One conversation: who it is with and about what, every line said so far
 * — oldest at the top, earlier pages on request — and the box to say
 * more. Opening it marks the other side's lines read; the flag in its
 * header reports it. Shared by the dock,
 * where `compact` folds the header to one line with a way back to the
 * list, and by the Messages page.
 */
export default function ChatConversation({
  entryId,
  compact = false,
  onBack,
  backOnPhoneOnly = false,
}: {
  entryId: string;
  compact?: boolean;
  onBack?: () => void;
  /** The Messages page shows the list beside the conversation from md up; the way back is for a phone. */
  backOnPhoneOnly?: boolean;
}) {
  const backClass = backOnPhoneOnly ? 'md:!hidden' : '';
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: chatKeys.thread(entryId),
    queryFn: ({ pageParam }) => fetchThread(entryId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ChatPage) => last.nextCursor,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const thread = query.data?.pages[0]?.thread;
  // Pages come newest first, and so do the lines within a page: the
  // reader wants oldest at the top and the newest under their eye.
  const lines = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.items).slice().reverse(),
    [query.data],
  );

  // The other side's unread lines are read the moment they are on screen.
  const unread = thread?.unread ?? 0;
  const read = useMutation({
    mutationFn: () => markThreadRead(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.threads });
      queryClient.invalidateQueries({ queryKey: chatKeys.thread(entryId) });
    },
  });
  const reading = useRef(false);
  useEffect(() => {
    if (unread > 0 && !reading.current) {
      reading.current = true;
      read.mutate(undefined, { onSettled: () => (reading.current = false) });
    }
    // read is stable enough; re-running on every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, entryId]);

  // The newest line stays in view: on first load and whenever one lands.
  const end = useRef<HTMLDivElement>(null);
  const lastId = lines[lines.length - 1]?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lastId, entryId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {thread ? (
        <ConversationHeader thread={thread} compact={compact} onBack={onBack} backClass={backClass} />
      ) : (
        <div className="border-b border-[var(--surface-border)] px-3 py-2 text-sm text-[var(--text-color-secondary)]">
          {onBack && <Button icon="pi pi-arrow-left" text rounded size="small" aria-label="Back to conversations" onClick={onBack} className={backClass} />}
          {query.isError ? (query.error as Error).message : 'Loading…'}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" role="log" aria-live="polite" aria-label="Messages">
        {query.hasNextPage && (
          <div className="mb-2 text-center">
            <Button
              label="Earlier messages"
              icon="pi pi-arrow-up"
              text
              size="small"
              loading={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            />
          </div>
        )}
        {thread && lines.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--text-color-secondary)]">
            {thread.canSend
              ? `Nothing said yet. Say hello to ${thread.other.displayName}.`
              : 'Nothing was said here.'}
          </p>
        )}
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {lines.map((m, i) => (
            <Line key={m.id} line={m} first={i === 0 || lines[i - 1].mine !== m.mine} />
          ))}
        </ol>
        <div ref={end} />
      </div>

      {thread && (thread.canSend ? (
        <Composer entryId={entryId} to={thread.other.displayName} />
      ) : (
        <p className="m-0 border-t border-[var(--surface-border)] px-3 py-2 text-xs text-[var(--text-color-secondary)]">
          <i className="pi pi-lock mr-1 text-[0.7rem]" aria-hidden />
          {closedReason(thread)} What was said stays here.
        </p>
      ))}
    </div>
  );
}

function ConversationHeader({
  thread,
  compact,
  onBack,
  backClass,
}: {
  thread: ChatPage['thread'];
  compact: boolean;
  onBack?: () => void;
  backClass: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--surface-border)] px-2 py-1.5">
      {onBack && (
        <Button icon="pi pi-arrow-left" text rounded size="small" aria-label="Back to conversations" onClick={onBack} className={backClass} />
      )}
      <Link href={`/profile/${thread.other.id}`} className="no-underline">
        <Avatar name={thread.other.displayName} url={thread.other.avatarUrl} size={compact ? 'xs' : 'sm'} />
      </Link>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold">{thread.other.displayName}</div>
        <Link
          href={`/opportunities/${thread.opportunity.slug}`}
          className="block truncate text-xs text-[var(--text-color-secondary)] no-underline hover:underline"
        >
          {thread.opportunity.title}
        </Link>
      </div>
      <ChatReport thread={thread} />
      {!compact && <HelpIcon topic="chat.messages" label="Messages" />}
    </div>
  );
}

function Line({ line, first }: { line: ChatMessage; first: boolean }) {
  const at = new Date(line.createdAtUtc);
  return (
    <li className={`flex ${line.mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-1.5' : ''}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
          line.mine
            ? 'rounded-br-md bg-[var(--primary-color)] text-[var(--primary-color-text)]'
            : 'rounded-bl-md bg-[var(--surface-100)] text-[var(--text-color)]'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{line.body}</div>
        <div
          className={`mt-0.5 text-right text-[0.65rem] ${line.mine ? 'opacity-80' : 'text-[var(--text-color-secondary)]'}`}
          title={at.toLocaleString()}
        >
          <time dateTime={line.createdAtUtc}>{stamp(at)}</time>
          {line.mine && (
            <i
              className={`pi ${line.readAtUtc ? 'pi-check-circle' : 'pi-check'} ml-1 text-[0.6rem]`}
              aria-label={line.readAtUtc ? 'Read' : 'Sent'}
              title={line.readAtUtc ? `Read ${new Date(line.readAtUtc).toLocaleString()}` : 'Sent'}
            />
          )}
        </div>
      </div>
    </li>
  );
}

/** Today's lines by time alone; older ones with the day. */
function stamp(at: Date): string {
  const now = new Date();
  const sameDay = at.toDateString() === now.toDateString();
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  const day = at.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(at.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
  return `${day}, ${time}`;
}

function Composer({ entryId, to }: { entryId: string; to: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const send = useMutation({
    mutationFn: (body: string) => sendMessage(entryId, body),
    onSuccess: () => {
      setText('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: chatKeys.thread(entryId) });
      queryClient.invalidateQueries({ queryKey: chatKeys.threads });
      box.current?.focus();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'The message was not sent.'),
  });

  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    send.mutate(body);
  };

  return (
    <form
      className="border-t border-[var(--surface-border)] px-2 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {error && (
        <p role="alert" className="mb-1 text-xs text-red-600">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <InputTextarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter makes a line.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          autoResize
          rows={1}
          maxLength={2000}
          placeholder={`Message ${to}`}
          aria-label={`Message ${to}`}
          className="max-h-32 min-h-0 flex-1 text-sm"
        />
        <Button
          type="submit"
          icon="pi pi-send"
          rounded
          aria-label="Send"
          tooltip="Send (Enter)"
          tooltipOptions={{ position: 'top' }}
          loading={send.isPending}
          disabled={!text.trim()}
        />
      </div>
    </form>
  );
}
