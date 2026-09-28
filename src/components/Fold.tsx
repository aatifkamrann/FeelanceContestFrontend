'use client';

import { useEffect, useId, useState } from 'react';

/**
 * A card that folds from its heading. The same contract as the dashboard's
 * Panel — the fold is remembered per card, per device, because how one
 * person lays out their screen is not a fact about the account — but for
 * pages whose headings carry more than a word: a live badge, a count, a
 * help icon. The title is the control; `extra` sits beside it, outside the
 * button, so a help icon opens help and not the fold.
 *
 * Starts at its default so the server render and the first client render
 * agree; the remembered state applies right after mount. Only a fold
 * against its own default is stored, so changing a default moves every
 * card that was left alone. Folded content is unmounted, not hidden —
 * anything that must keep running while folded (the live watch on the
 * board) belongs in `extra`.
 *
 * `foldable={false}` makes it a plain card: open, with nothing to press and
 * nothing remembered. The profile's guided setup shows one section at a
 * time, and a step that could be folded shut would be a blank page.
 */
export default function Fold({
  id,
  title,
  extra,
  defaultOpen = true,
  foldable = true,
  className = '',
  headingClassName = 'text-lg font-semibold',
  bodyClassName = '',
  children,
}: {
  /** Stable per page — the key the fold is remembered under. */
  id: string;
  title: React.ReactNode;
  extra?: React.ReactNode;
  /** False where the heading is the point and the body is what you come for — a long form's sections. */
  defaultOpen?: boolean;
  /** False for a card that is always open and has no fold control. */
  foldable?: boolean;
  className?: string;
  headingClassName?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const storageKey = `wp.fold.${id}`;
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (!foldable) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'closed') setOpen(false);
      else if (saved === 'open') setOpen(true);
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, foldable]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      if (next === defaultOpen) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, next ? 'open' : 'closed');
    } catch {
      /* storage unavailable */
    }
  };

  if (!foldable)
    return (
      <section
        className={`rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] ${className}`}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className={headingClassName}>{title}</h2>
          {extra}
        </div>
        <div className={bodyClassName}>{children}</div>
      </section>
    );

  return (
    <section
      className={`rounded-xl border border-[var(--surface-border)] bg-[var(--surface-card)] ${className}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
          className="flex min-w-0 items-center gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
        >
          <i
            className={`pi pi-chevron-down text-xs text-[var(--text-color-secondary)] transition-transform ${open ? '' : '-rotate-90'}`}
            aria-hidden
          />
          <h2 className={headingClassName}>{title}</h2>
        </button>
        {extra}
      </div>
      {open && (
        <div id={bodyId} className={bodyClassName}>
          {children}
        </div>
      )}
    </section>
  );
}
