'use client';

import { useRef } from 'react';
import { OverlayPanel } from 'primereact/overlaypanel';
import { InputText } from 'primereact/inputtext';
import { ACCENT_PRESETS } from '@/lib/theme';

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * The portal accent as a form field (setup wizard, Admin → Settings): the
 * topbar's palette — a round swatch of the current colour opening the preset
 * swatches, a custom picker and, when given, the portal default — beside a
 * box for typing an exact brand hex. Unlike the topbar it applies nothing
 * itself; the value goes wherever the form sends it.
 */
export default function AccentPicker({
  id,
  value,
  onChange,
  defaultValue,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (hex: string) => void;
  /** Offered as a "Default" button in the palette when it differs from the value. */
  defaultValue?: string | null;
  disabled?: boolean;
}) {
  const panel = useRef<OverlayPanel>(null);
  const valid = HEX.test(value);
  const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();
  const choose = (hex: string) => {
    onChange(hex);
    panel.current?.hide();
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Choose the accent colour, current ${valid ? value : 'not a colour'}`}
        disabled={disabled}
        onClick={(e) => panel.current?.toggle(e)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[var(--surface-border)] bg-[var(--surface-card)] px-2 text-[var(--text-color-secondary)] transition-colors enabled:hover:border-[var(--primary-color)] enabled:hover:text-[var(--text-color)] disabled:cursor-default disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
      >
        <span
          className="h-5 w-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/15%)]"
          // an unfinished hex shows as a hollow ring rather than a stale colour
          style={{ background: valid ? value : 'transparent' }}
        />
        <i className="pi pi-palette" aria-hidden />
      </button>
      <InputText
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="#0f766e"
        invalid={value !== '' && !valid}
        className="w-32 font-mono"
      />

      <OverlayPanel ref={panel}>
        <div className="flex w-64 flex-col gap-2">
          <span
            id={`${id}-palette`}
            className="text-xs font-semibold uppercase tracking-wide text-[var(--text-color-secondary)]"
          >
            Accent colour
          </span>
          <div role="radiogroup" aria-labelledby={`${id}-palette`} className="grid grid-cols-6 gap-1.5">
            {ACCENT_PRESETS.map((p) => {
              const checked = valid && same(value, p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={p.name}
                  title={p.name}
                  onClick={() => choose(p.value)}
                  style={{ background: p.value }}
                  className={`grid aspect-square place-items-center rounded-full text-white shadow-[inset_0_0_0_1px_rgb(0_0_0/15%)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)] focus-visible:ring-offset-2 ${
                    checked ? 'outline outline-2 outline-offset-2 outline-[var(--text-color)]' : ''
                  }`}
                >
                  {checked && <i className="pi pi-check text-[0.7rem] mix-blend-difference" aria-hidden />}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="relative inline-flex cursor-pointer items-center gap-1.5 text-sm text-[var(--text-color)]">
              <span
                className="h-4 w-4 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/15%)]"
                style={{ background: valid ? value : 'transparent' }}
              />
              <span>Custom…</span>
              {/* the native colour input sits invisibly over the label */}
              <input
                type="color"
                value={valid ? value.toLowerCase() : '#000000'}
                aria-label="Pick a custom accent colour"
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            {defaultValue && (
              <button
                type="button"
                disabled={same(value, defaultValue)}
                onClick={() => choose(defaultValue)}
                title={`The portal default, ${defaultValue}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-card)] px-2.5 py-1 text-sm text-[var(--text-color-secondary)] enabled:hover:text-[var(--text-color)] disabled:cursor-default disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-color)]"
              >
                <span
                  className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/15%)]"
                  style={{ background: defaultValue }}
                />
                Default
              </button>
            )}
          </div>
        </div>
      </OverlayPanel>
    </div>
  );
}
