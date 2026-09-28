import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  // The same data-theme attribute the theme switcher stamps and the
  // PrimeReact stylesheet swap follows — one dark-mode switch, not two.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: { extend: {} },
} satisfies Config;
