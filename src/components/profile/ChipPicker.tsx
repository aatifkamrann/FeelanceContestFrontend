'use client';

/**
 * A short closed list picked from by pressing — any number of them, in any
 * order, with the list's own order kept. Chips rather than a dropdown
 * because every answer is in view at once and a client's "short and long,
 * not medium" is one press each; and real buttons rather than styled spans
 * so the keyboard and a screen reader get the same list, with each one's
 * state read out as pressed or not.
 */
export default function ChipPicker<K extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: K; label: string; hint: string }[];
  value: K[];
  onChange: (next: K[]) => void;
}) {
  const toggle = (key: K) =>
    onChange(
      value.includes(key)
        ? value.filter((k) => k !== key)
        : // The list's order, not the order pressed: the API stores it that
          // way too, so what the form shows is what comes back.
          options.map((o) => o.value).filter((k) => k === key || value.includes(k)),
    );

  return (
    <div role="group" aria-label={label}>
      <p className="font-medium">{label}</p>
      {hint && <p className="mt-1 text-sm text-[var(--text-color-secondary)]">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              type="button"
              key={o.value}
              aria-pressed={on}
              title={o.hint}
              onClick={() => toggle(o.value)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                on
                  ? 'border-[var(--primary-color)] bg-[var(--primary-color)] text-[var(--primary-color-text)]'
                  : 'border-[var(--surface-border)] hover:border-[var(--primary-color)]'
              }`}
            >
              {on && <i className="pi pi-check mr-1 text-xs" aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
