'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OverlayPanel } from 'primereact/overlaypanel';
import { helpQuery, type HelpTopic } from '@/lib/help';

/**
 * The help affordance used across the portal. Give it a topic id and it
 * renders nothing at all when that topic has no content, so callers never
 * have to check first.
 *
 * Accessibility is the point of the extra markup here: it is a real button
 * with a descriptive label, it opens on keyboard activation as well as click,
 * and Escape closes it. A div with a hover tooltip would leave out exactly
 * the people who most need the explanation.
 */
export default function HelpIcon({ topic, label }: { topic: string; label?: string }) {
  const panel = useRef<OverlayPanel>(null);
  const [open, setOpen] = useState(false);
  const { data } = useQuery(helpQuery);
  const help: HelpTopic | undefined = data?.get(topic);

  if (!help) return null;

  const describes = label ?? help.short;

  return (
    <>
      <button
        type="button"
        onClick={(e) => panel.current?.toggle(e)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') panel.current?.hide();
        }}
        aria-label={`Help: ${describes}`}
        aria-expanded={open}
        title={help.short}
        className="wp-help-icon"
      >
        <i className="pi pi-question-circle" aria-hidden="true" />
      </button>

      <OverlayPanel
        ref={panel}
        dismissable
        showCloseIcon
        onShow={() => setOpen(true)}
        onHide={() => setOpen(false)}
        className="max-w-md"
      >
        <div className="flex flex-col gap-3 text-sm">
          {/* pr-7 keeps the headline clear of the close X in the corner. */}
          <p className="pr-7 font-medium">{help.short}</p>

          {help.detail
            ?.split('\n\n')
            .map((para, i) => (
              <p key={i} className="text-[var(--text-color-secondary)]">
                {para}
              </p>
            ))}

          {help.why && (
            <div className="rounded-md border-l-2 border-[var(--primary-color)] bg-[var(--surface-hover)] px-3 py-2">
              <p className="font-medium">Why it matters</p>
              <p className="mt-1 text-[var(--text-color-secondary)]">{help.why}</p>
            </div>
          )}

          {help.example && (
            <div>
              <p className="font-medium">Example</p>
              <code className="mt-1 block overflow-x-auto rounded bg-[var(--surface-ground)] px-2 py-1 text-xs">
                {help.example}
              </code>
            </div>
          )}

          {help.learnMoreUrl && (
            <a
              href={help.learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--primary-color)]"
            >
              Learn more <i className="pi pi-external-link text-xs" aria-hidden="true" />
            </a>
          )}
        </div>
      </OverlayPanel>
    </>
  );
}
