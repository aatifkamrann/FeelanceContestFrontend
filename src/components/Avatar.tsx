'use client';

/**
 * The face beside a name, wherever one is shown. A picture where the
 * member set one, their initial otherwise — the fallback the entrant list
 * always drew, now in one place so every list draws the same one. The
 * image carries no alt text of its own because the name is always
 * rendered beside it; a screen reader hears the name once.
 */
export default function Avatar({
  name,
  url,
  size = 'sm',
  className = '',
}: {
  name: string;
  /** Versioned by the API, so a browser keeps it until it changes. */
  url: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims = {
    xs: 'h-6 w-6 text-xs',
    sm: 'h-8 w-8 text-sm',
    md: 'h-12 w-12 text-lg',
    lg: 'h-20 w-20 text-2xl',
  }[size];
  if (url) {
    return (
      <img src={url} alt="" className={`${dims} shrink-0 rounded-full object-cover ${className}`} />
    );
  }
  const initial = (name.trim().slice(0, 1) || '?').toUpperCase();
  return (
    <span
      aria-hidden
      className={`${dims} inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] font-semibold ${className}`}
    >
      {initial}
    </span>
  );
}
