/**
 * What kind of work an opportunity is, and who it is for — the category, the
 * skills an entrant must list, the merit floor, whether the work has to
 * run with Docker Compose. One row of plain chips,
 * identical on the card, the page and the draft editor's preview, and free
 * of hooks so the server-rendered page can use it as well as the
 * client-side feed.
 */
export default function OpportunityFacts({
  categoryLabel,
  subcategoryLabel,
  skills,
  minMeritScore,
  requiresCompose = false,
  compact = false,
  className = '',
}: {
  categoryLabel: string | null;
  subcategoryLabel: string | null;
  skills: string[];
  minMeritScore: number;
  /** Entries must run with Docker Compose — a term an entrant reads before opening the brief. */
  requiresCompose?: boolean;
  /** On a card: the first three skills and a count for the rest. */
  compact?: boolean;
  className?: string;
}) {
  const shown = compact ? skills.slice(0, 3) : skills;
  const more = skills.length - shown.length;
  if (!categoryLabel && skills.length === 0 && minMeritScore <= 0 && !requiresCompose) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-xs ${className}`}>
      {categoryLabel && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--primary-color)_12%,transparent)] px-2 py-0.5 font-medium text-[var(--text-color)]"
          title="Category"
        >
          <i className="pi pi-tag text-[0.7rem] text-[var(--primary-color)]" aria-hidden />
          {categoryLabel}
          {subcategoryLabel && (
            <>
              <span className="text-[var(--text-color-secondary)]" aria-hidden>
                ›
              </span>
              {subcategoryLabel}
            </>
          )}
        </span>
      )}
      {/* The merit floor is the one term an entrant cannot fix in an
          afternoon, so it stands apart from the skills. */}
      {minMeritScore > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-[var(--surface-border)] px-2 py-0.5 font-medium"
          title={`Entrants need a merit score of at least ${minMeritScore}`}
        >
          <i className="pi pi-star-fill text-[0.7rem] text-amber-500" aria-hidden />
          Merit {minMeritScore}+
        </span>
      )}
      {requiresCompose && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-[var(--surface-border)] px-2 py-0.5 font-medium"
          title="Entries must run with Docker Compose: every milestone claim is built, and the board shows whether it built"
        >
          <i className="pi pi-box text-[0.7rem] text-[var(--primary-color)]" aria-hidden />
          Runs with Docker
        </span>
      )}
      {shown.map((s) => (
        <span
          key={s}
          className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-hover)] px-2 py-0.5 text-[var(--text-color-secondary)]"
          title="Required skill"
        >
          {s}
        </span>
      ))}
      {more > 0 && (
        <span className="text-[var(--text-color-secondary)]" title={skills.slice(3).join(', ')}>
          +{more} more
        </span>
      )}
    </div>
  );
}
