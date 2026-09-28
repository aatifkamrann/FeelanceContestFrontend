// Builds the two runtime theme stylesheets from PrimeReact's lara-teal pair,
// PARAMETERIZED: every literal of the primary colour family is rewritten to
// var(--wp-accent-*, <original>), so a runtime accent change re-colours the
// whole theme — hover, active, focus and highlight states included. This is
// the classic-theme equivalent of BookingApp's rule that primary tokens must
// be references, never baked hex: a literal gets frozen into the stylesheet,
// so a later accent change would leave hover states painting the old colour.
//
// With no --wp-accent-* set, every var() falls back to its original literal,
// so the stock teal look is pixel-identical. Fonts are shared (one copy) so
// switching modes never re-downloads Inter.
//
// Runs on predev/prebuild — the output always matches the installed package.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const SRC = 'node_modules/primereact/resources/themes';
const OUT = 'public/themes';

/**
 * Literal → variable name, per mode. The literals are lara-teal's own values
 * (verified against the installed package by the assertions below):
 *  - accent      the primary colour (light: teal-500, dark: teal-400)
 *  - accent-deep the darker hover/highlight partner (light only)
 *  - accent-faint the focus-ring tint (light only)
 *  - accent-NNN  the theme's --primary-NNN ramp
 *  - accent-aNN  alpha washes of the accent (focus rings, hover washes)
 */
const MODES = {
  light: {
    theme: 'lara-light-teal',
    accent: '#14b8a6',
    onAccent: '#ffffff',
    // lara-light-teal ships its highlight surface as teal-700, the colour of
    // the highlight text, so a selected option, the current page and a
    // sorted column header each read as a blank teal block. Its generated
    // siblings share one template, and lara-light-blue paints those surfaces
    // blue-50 — which says which teal-700s were meant to be teal-50.
    repairFrom: { theme: 'lara-light-blue', surface: '#eff6ff', broken: '#0f766e', meant: '#f0fdfa' },
    map: {
      '#f0fdfa': '--wp-accent-50', // the highlight surface, once repaired
      '#14b8a6': '--wp-accent',
      '#0f766e': '--wp-accent-deep',
      '#0d9488': '--wp-accent-600', // the hover shade of every filled control
      '#99f6e4': '--wp-accent-faint',
      '#75f0e3': '--wp-accent-faint', // the button focus ring: lara's second teal-200
      '#f3fbfb': '--wp-accent-50',
      '#c7eeea': '--wp-accent-100',
      '#9ae0d9': '--wp-accent-200',
      '#6dd3c8': '--wp-accent-300',
      '#41c5b7': '--wp-accent-400',
      '#119c8d': '--wp-accent-600',
      '#0e8174': '--wp-accent-700',
      '#0b655b': '--wp-accent-800',
      '#084a42': '--wp-accent-900',
      'rgba(20, 184, 166, 0.04)': '--wp-accent-a04',
      'rgba(20, 184, 166, 0.16)': '--wp-accent-a16',
      'rgba(20, 184, 166, 0.24)': '--wp-accent-a24',
    },
  },
  dark: {
    theme: 'lara-dark-teal',
    accent: '#2dd4bf',
    onAccent: '#030712',
    map: {
      '#5eead4': '--wp-accent-deep', // the hover shade of every filled control
      '#99f6e4': '--wp-accent-200', // hover of a checked box or radio, and a pressed button
      '#2dd4bf': '--wp-accent',
      '#f5fdfc': '--wp-accent-50',
      '#cdf5f0': '--wp-accent-100',
      '#a5ede3': '--wp-accent-200',
      '#7de4d7': '--wp-accent-300',
      '#55dccb': '--wp-accent-400',
      '#26b4a2': '--wp-accent-600',
      '#209486': '--wp-accent-700',
      '#197569': '--wp-accent-800',
      '#12554c': '--wp-accent-900',
      'rgba(45, 212, 191, 0.04)': '--wp-accent-a04',
      'rgba(45, 212, 191, 0.16)': '--wp-accent-a16',
      'rgba(45, 212, 191, 0.2)': '--wp-accent-a20',
      'rgba(45, 212, 191, 0.24)': '--wp-accent-a24',
      'rgba(45, 212, 191, 0.3616)': '--wp-accent-a36',
      'rgba(45, 212, 191, 0.7)': '--wp-accent-a70',
    },
  },
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Puts back the highlight surface a theme lost: wherever the sibling has its
 * highlight surface and this theme has, on the otherwise identical line, the
 * broken literal, this theme gets the literal it meant. Line for line rather
 * than by selector, so nothing the two templates do not share is touched; a
 * theme that no longer lines up with its sibling fails the build, as a
 * changed palette does below.
 */
function repairHighlights(css, theme, { theme: sibling, surface, broken, meant }) {
  const mine = css.split('\n');
  const theirs = readFileSync(`${SRC}/${sibling}/theme.css`, 'utf8').split('\n');
  if (mine.length !== theirs.length) {
    throw new Error(`${theme}: no longer line for line with ${sibling} — check the highlight repair by hand.`);
  }
  let repaired = 0;
  for (let i = 0; i < mine.length; i++) {
    if (!theirs[i].includes(surface) || !mine[i].includes(broken)) continue;
    if (mine[i].replace(broken, surface) !== theirs[i]) continue;
    mine[i] = mine[i].replace(broken, meant);
    repaired++;
  }
  console.log(`themes: ${theme} highlight surfaces repaired from ${sibling}: ${repaired}`);
  return mine.join('\n');
}

/** Rules that paint their text in their own background colour — invisible text. */
function blankRules(css) {
  return css.split('}').filter((rule) => {
    const color = rule.match(/(?:^|[;{\s])color:\s*([^;]+);/);
    const background = rule.match(/background(?:-color)?:\s*([^;]+);/);
    if (!color || !background) return false;
    const value = color[1].trim();
    return value === background[1].trim() && value !== 'inherit' && value !== 'transparent';
  });
}

function transform(mode, { theme, accent, onAccent, map, repairFrom }) {
  let css = readFileSync(`${SRC}/${theme}/theme.css`, 'utf8');
  if (repairFrom) css = repairHighlights(css, theme, repairFrom);

  // A theme upgrade that changes the palette literals must fail the build
  // loudly, not ship a half-parameterized stylesheet.
  for (const literal of [accent, ...Object.keys(map)]) {
    if (!css.includes(literal)) {
      throw new Error(`${theme}: expected literal '${literal}' not found — lara changed; update the map.`);
    }
  }

  // Fonts are shared across modes and palettes.
  css = css.replaceAll('url("./fonts/', 'url("/themes/fonts/');

  // The on-accent text token itself.
  css = css.replace(
    new RegExp(`(--primary-color-text:\\s*)${escapeRegex(onAccent)}`),
    `$1var(--wp-accent-text, ${onAccent})`,
  );

  // Every family literal becomes a var with the literal as fallback.
  for (const [literal, name] of Object.entries(map)) {
    const boundary = literal.startsWith('#') ? '(?![0-9a-fA-F])' : '';
    css = css.replace(
      new RegExp(escapeRegex(literal) + boundary, 'gi'),
      `var(${name}, ${literal})`,
    );
  }

  // Rule-aware pass: where a rule paints the accent AND sets on-accent text
  // as a literal, the text follows the accent's computed contrast colour —
  // BookingApp's WCAG contrastColor, in classic-CSS form.
  css = css
    .split('}')
    .map((rule) =>
      rule.includes('var(--wp-accent')
        ? rule.replace(
            new RegExp(`(^|[;{\\s])color:\\s*${escapeRegex(onAccent)}(?![0-9a-fA-F])`, 'gi'),
            `$1color: var(--wp-accent-text, ${onAccent})`,
          )
        : rule,
    )
    .join('}');

  // Glyphs whose colour lives in a different rule than their accent surface,
  // so the pass above cannot see the pairing.
  css += `
/* winnersportal: on-accent glyphs whose colour rule is separate from the accent surface */
.p-checkbox .p-checkbox-box .p-checkbox-icon { color: var(--wp-accent-text, ${onAccent}); }
`;

  // What the repair exists for must not come back unseen.
  const blank = blankRules(css);
  if (blank.length) {
    throw new Error(
      `${theme}: ${blank.length} rules paint text in their own background, first: ${blank[0].split('{')[0].trim()}`,
    );
  }

  writeFileSync(`${OUT}/${mode}.css`, css);
  return css.length;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/fonts`, { recursive: true });
cpSync(`${SRC}/lara-light-teal/fonts`, `${OUT}/fonts`, { recursive: true });
for (const [mode, config] of Object.entries(MODES)) {
  const bytes = transform(mode, config);
  console.log(`themes: ${config.theme} -> ${OUT}/${mode}.css (${bytes} bytes, parameterized)`);
}
