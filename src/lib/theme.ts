/**
 * The app's theme engine — ported from BookingApp's useTheme. Two independent
 * axes, shared app-wide as a module singleton:
 *
 *   • mode   : 'system' | 'light' | 'dark'   (drives `html[data-theme]` and
 *              which parameterized lara stylesheet is loaded)
 *   • accent : any `#RRGGBB` colour, or null → the portal default
 *   • status : one badge colour per opportunity status, or the stock set
 *
 * Both persist to localStorage for instant, offline-correct application; the
 * accent is mirrored to the server per-user (lib/themeSync) so the look
 * follows the user across devices. Mode is deliberately per-device.
 *
 * Best practices carried over from the reference implementation:
 *   1. Design tokens — the copy-themes script parameterizes the lara CSS to
 *      var(--wp-accent-*) references, so hover/active/focus states follow an
 *      accent change instead of keeping baked-in hex.
 *   2. `prefers-color-scheme` as the 'system' default, followed live.
 *   3. `color-scheme` kept in sync so native controls/scrollbars match.
 *   4. No-FOUC: the root layout applies mode + the cached accent CSS inline
 *      before the bundle loads.
 *   5. A single accent generates a full 50–900 ramp with lara's own tint and
 *      shade scales, so the stock accent reproduces the stock ramp exactly.
 *   6. WCAG contrast-aware foreground: text on the accent is auto black or
 *      white by luminance, per mode — legible on ANY colour.
 *   7. `<meta name="theme-color">` tracks the mode for mobile browser chrome.
 *   8. Cross-tab sync via the `storage` event.
 *   9. Status colours (success/danger/warn) are deliberately NOT derived
 *      from the accent.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

const MODE_KEY = 'wp.theme.mode';
const LEGACY_MODE_KEY = 'wp.theme'; // the pre-accent build stored 'light'|'dark' here
const ACCENT_KEY = 'wp.theme.accent';
const ACCENT_CSS_KEY = 'wp.theme.accentCss'; // pre-rendered override, injected pre-paint
const STATUS_KEY = 'wp.theme.status'; // the viewer's badge colours, {status: '#RRGGBB'}
const STATUS_CSS_KEY = 'wp.theme.statusCss'; // pre-rendered override, injected pre-paint

/** The stock accent — lara-teal's own base. Choosing it equals the stock look. */
export const STOCK_ACCENT = '#14B8A6';

/**
 * The registry default of branding.accentColor. While the admin leaves it
 * untouched the portal renders the stock stylesheet rather than a
 * regenerated ramp of this value.
 */
export const STOCK_BRANDING_ACCENT = '#0f766e';

/** Curated, well-separated accent presets (same set as BookingApp). A custom colour is also allowed. */
export const ACCENT_PRESETS: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Blue', value: '#2563EB' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Sky', value: '#0EA5E9' },
  { name: 'Emerald', value: '#10B981' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Slate', value: '#64748B' },
];

// --- status badge colours -------------------------------------------------

/** The opportunity statuses a badge can wear, in the order the picker lists them. */
export const STATUS_KEYS = ['draft', 'open', 'reviewing', 'awarded', 'cancelled'] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];
export type StatusColours = Record<StatusKey, string>;

/**
 * The stock badge colours: grey for a draft nobody else can see, green for
 * an opportunity taking entries, amber for a review waiting on the client, blue
 * for one with a winner, red for one that ended without. globals.css
 * declares the same values, so the stock look needs no override injected —
 * keep the two in step.
 */
export const STATUS_DEFAULTS: StatusColours = {
  draft: '#64748B',
  open: '#047857',
  reviewing: '#F59E0B',
  awarded: '#2563EB',
  cancelled: '#E11D48',
};

export const STATUS_LABELS: Record<StatusKey, string> = {
  draft: 'Draft',
  open: 'Open',
  reviewing: 'Reviewing',
  awarded: 'Awarded',
  cancelled: 'Cancelled',
};

// --- colour maths ---------------------------------------------------------

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex([r, g, b]: [number, number, number]): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const tint = (rgb: [number, number, number], w: number): [number, number, number] =>
  [rgb[0] + (255 - rgb[0]) * w, rgb[1] + (255 - rgb[1]) * w, rgb[2] + (255 - rgb[2]) * w];

const shade = (rgb: [number, number, number], w: number): [number, number, number] =>
  [rgb[0] * (1 - w), rgb[1] * (1 - w), rgb[2] * (1 - w)];

/**
 * The 50–900 ramp for an accent, using the exact tint/shade scales lara's own
 * teal ramp was generated with (reverse-engineered and asserted against the
 * shipped values): tints .95/.76/.57/.38/.19 toward white, shades
 * .15/.30/.45/.60 toward black.
 */
export function palette(accent: string): Record<number, string> {
  const base = toRgb(accent);
  return {
    50: toHex(tint(base, 0.95)),
    100: toHex(tint(base, 0.76)),
    200: toHex(tint(base, 0.57)),
    300: toHex(tint(base, 0.38)),
    400: toHex(tint(base, 0.19)),
    500: accent.toLowerCase(),
    600: toHex(shade(base, 0.15)),
    700: toHex(shade(base, 0.3)),
    800: toHex(shade(base, 0.45)),
    900: toHex(shade(base, 0.6)),
  };
}

function relativeLuminance(hex: string): number {
  const linear = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two hex colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** The readable foreground (near-black or white) for text sitting on `bg`. */
export function contrastForeground(bg: string): string {
  const white = '#ffffff';
  const black = '#0b1120';
  return contrastRatio(bg, white) >= contrastRatio(bg, black) ? white : black;
}

// --- state ----------------------------------------------------------------

type ThemeState = {
  mode: ThemeMode;
  /** The user's explicit accent, or null. */
  accent: string | null;
  /** The portal's branding default, applied when the user chose nothing. */
  defaultAccent: string | null;
  isDark: boolean;
  effectiveAccent: string;
  /** The viewer's explicit badge colours — only the statuses they changed. */
  statusColours: Partial<StatusColours>;
  /** Every status's badge colour: the viewer's choice over the stock one. */
  effectiveStatus: StatusColours;
};

let mode: ThemeMode = 'system';
let accent: string | null = null;
let defaultAccent: string | null = null;
let statusColours: Partial<StatusColours> = {};

const listeners = new Set<() => void>();
let snapshot: ThemeState = compute();

function compute(): ThemeState {
  return {
    mode,
    accent,
    defaultAccent,
    isDark: mode === 'system' ? systemPrefersDark() : mode === 'dark',
    effectiveAccent: accent ?? defaultAccent ?? STOCK_ACCENT,
    statusColours,
    effectiveStatus: { ...STATUS_DEFAULTS, ...statusColours },
  };
}

function notify(): void {
  snapshot = compute();
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getThemeState(): ThemeState {
  return snapshot;
}

function media(): MediaQueryList | null {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
}

function systemPrefersDark(): boolean {
  return media()?.matches ?? false;
}

function storedMode(): ThemeMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY) ?? localStorage.getItem(LEGACY_MODE_KEY);
    return v === 'system' || v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function storedAccent(): string | null {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null;
  } catch {
    return null;
  }
}

function storedStatus(): Partial<StatusColours> {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    return raw ? sanitizeStatus(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Keeps only known statuses carrying a valid #RRGGBB, uppercased — from storage or the server. */
export function sanitizeStatus(input: unknown): Partial<StatusColours> {
  const out: Partial<StatusColours> = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of STATUS_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) out[key] = v.toUpperCase();
  }
  return out;
}

// --- applying to the DOM --------------------------------------------------

function applyMode(): void {
  const dark = mode === 'system' ? systemPrefersDark() : mode === 'dark';
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light'; // Tailwind's dark: reads this too
  root.style.colorScheme = dark ? 'dark' : 'light';

  const link = document.getElementById('app-theme');
  if (link instanceof HTMLLinkElement) link.href = `/themes/${dark ? 'dark' : 'light'}.css`;

  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = dark ? '#111827' : '#f9fafb'; // the lara surface grounds
}

/**
 * The :root override both parameterized stylesheets consume. One string
 * covers both modes, so flipping light⇄dark needs no accent recompute — the
 * per-mode blocks mirror how lara itself keys the primary tokens: 500-level
 * in light, 400-level in dark, alpha washes mixed from the mode's own level.
 */
export function buildAccentCss(hex: string): string {
  const ramp = palette(hex);
  const wash = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  const rampVars = Object.entries(ramp)
    .map(([k, v]) => `--wp-accent-${k}: ${v};`)
    .join(' ');
  return (
    `html[data-theme="light"]{` +
    `--wp-accent: ${ramp[500]}; --wp-accent-deep: ${ramp[700]}; --wp-accent-faint: ${ramp[200]}; ` +
    `--wp-accent-text: ${contrastForeground(ramp[500])}; ${rampVars} ` +
    `--wp-accent-a04: ${wash(ramp[500], 4)}; --wp-accent-a16: ${wash(ramp[500], 16)}; --wp-accent-a24: ${wash(ramp[500], 24)};}` +
    `html[data-theme="dark"]{` +
    `--wp-accent: ${ramp[400]}; --wp-accent-deep: ${ramp[300]}; --wp-accent-faint: ${ramp[700]}; ` +
    `--wp-accent-text: ${contrastForeground(ramp[400])}; ${rampVars} ` +
    `--wp-accent-a04: ${wash(ramp[400], 4)}; --wp-accent-a16: ${wash(ramp[400], 16)}; --wp-accent-a20: ${wash(ramp[400], 20)}; ` +
    `--wp-accent-a24: ${wash(ramp[400], 24)}; --wp-accent-a36: ${wash(ramp[400], 36)}; --wp-accent-a70: ${wash(ramp[400], 70)};}`
  );
}

function applyAccent(): void {
  const effective = accent ?? defaultAccent;
  let style = document.getElementById('app-accent') as HTMLStyleElement | null;

  if (!effective || effective.toUpperCase() === STOCK_ACCENT) {
    // Stock look: no override at all — the parameterized fallbacks ARE lara.
    style?.remove();
    try {
      localStorage.removeItem(ACCENT_CSS_KEY);
    } catch {
      /* storage unavailable */
    }
    return;
  }

  const css = buildAccentCss(effective);
  if (!style) {
    style = document.createElement('style');
    style.id = 'app-accent';
    document.head.appendChild(style);
  }
  style.textContent = css;
  try {
    // Cached so the layout's inline script re-applies it before next paint.
    localStorage.setItem(ACCENT_CSS_KEY, css);
  } catch {
    /* storage unavailable */
  }
}

/**
 * The :root override for the badge colours. Every status is written, not
 * only the changed ones, so one string is the whole answer and the text
 * colour on each badge is recomputed with it.
 */
export function buildStatusCss(colours: StatusColours): string {
  const vars = STATUS_KEYS.map(
    (k) => `--wp-status-${k}: ${colours[k]}; --wp-status-${k}-text: ${contrastForeground(colours[k])};`,
  ).join(' ');
  return `:root{${vars}}`;
}

function applyStatus(): void {
  let style = document.getElementById('app-status') as HTMLStyleElement | null;

  if (Object.keys(statusColours).length === 0) {
    // Stock look: globals.css already declares these values.
    style?.remove();
    try {
      localStorage.removeItem(STATUS_CSS_KEY);
    } catch {
      /* storage unavailable */
    }
    return;
  }

  const css = buildStatusCss({ ...STATUS_DEFAULTS, ...statusColours });
  if (!style) {
    style = document.createElement('style');
    style.id = 'app-status';
    document.head.appendChild(style);
  }
  style.textContent = css;
  try {
    // Cached so the layout's inline script re-applies it before next paint.
    localStorage.setItem(STATUS_CSS_KEY, css);
  } catch {
    /* storage unavailable */
  }
}

function hydrateFromStorage(): void {
  mode = storedMode() ?? 'system';
  accent = storedAccent();
  statusColours = storedStatus();
  applyMode();
  applyAccent();
  applyStatus();
  notify();
}

let started = false;

/**
 * Call once from the theme control. Applies the persisted (or OS/default)
 * theme and starts following the OS + other tabs. Safe to call repeatedly.
 */
export function initTheme(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  hydrateFromStorage();

  // Follow the OS live while in 'system' mode.
  media()?.addEventListener('change', () => {
    if (mode === 'system') {
      applyMode();
      notify();
    }
  });

  // Mirror changes made in another tab.
  window.addEventListener('storage', (e) => {
    if (e.key === MODE_KEY || e.key === ACCENT_KEY || e.key === STATUS_KEY || e.key === LEGACY_MODE_KEY)
      hydrateFromStorage();
  });
}

// --- mutations ------------------------------------------------------------

export function setMode(next: ThemeMode): void {
  mode = next;
  try {
    localStorage.setItem(MODE_KEY, next);
    localStorage.removeItem(LEGACY_MODE_KEY);
  } catch {
    /* storage unavailable */
  }
  applyMode();
  notify();
}

/** Quick light⇄dark flip for the toolbar button; turns 'system' into an explicit choice. */
export function toggleMode(): void {
  setMode(getThemeState().isDark ? 'light' : 'dark');
}

/** Pass null to fall back to the portal default accent. */
export function setAccent(next: string | null): string | null {
  const normalized = next && /^#[0-9a-fA-F]{6}$/.test(next) ? next.toUpperCase() : null;
  accent = normalized;
  try {
    if (normalized) localStorage.setItem(ACCENT_KEY, normalized);
    else localStorage.removeItem(ACCENT_KEY);
  } catch {
    /* storage unavailable */
  }
  applyAccent();
  notify();
  return normalized;
}

export function resetAccent(): void {
  setAccent(null);
}

/**
 * Apply the server-loaded per-user accent without echoing it back (see
 * lib/themeSync). Mode is never touched — it is a per-device preference and
 * the server does not store it.
 */
export function applyServerAccent(color: string | null): void {
  setAccent(color);
}

/**
 * The portal's branding.accentColor, fetched at boot. Only applied while the
 * user has no accent of their own, and only when the admin actually changed
 * it from the registry default — an untouched setting keeps the stock look.
 */
export function setDefaultAccent(color: string | null): void {
  defaultAccent =
    color && /^#[0-9a-fA-F]{6}$/.test(color) && color.toLowerCase() !== STOCK_BRANDING_ACCENT
      ? color.toUpperCase()
      : null;
  applyAccent();
  notify();
}

/** One badge colour. Null, or the stock colour itself, returns that status to stock. */
export function setStatusColour(key: StatusKey, hex: string | null): void {
  const normalized = hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
  const next = { ...statusColours };
  if (normalized && normalized !== STATUS_DEFAULTS[key]) next[key] = normalized;
  else delete next[key];
  persistStatus(next);
}

export function resetStatusColours(): void {
  persistStatus({});
}

/** The server-loaded per-user badge colours, applied without echoing back (see lib/themeSync). */
export function applyServerStatus(colours: unknown): void {
  persistStatus(sanitizeStatus(colours));
}

function persistStatus(next: Partial<StatusColours>): void {
  statusColours = next;
  try {
    if (Object.keys(next).length) localStorage.setItem(STATUS_KEY, JSON.stringify(next));
    else localStorage.removeItem(STATUS_KEY);
  } catch {
    /* storage unavailable */
  }
  applyStatus();
  notify();
}
