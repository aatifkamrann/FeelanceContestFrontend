/**
 * Bridges the local theme engine (lib/theme) to the per-user server copy
 * (`GET/PUT /api/auth/theme`), so the user's ACCENT and BADGE COLOURS follow
 * them across devices — ported from BookingApp's useThemeSync.
 *
 * Light/dark mode is deliberately excluded: it's a per-device preference,
 * kept only in localStorage by the engine.
 *
 *  - `loadServerTheme()` pulls the saved colours after sign-in/boot and
 *    applies them locally WITHOUT echoing them back (no write loop).
 *  - `queueThemeSave()` persists a user-initiated change, debounced so
 *    dragging a colour picker doesn't spray PUTs. It reads the engine's
 *    state when it fires, so the last of a burst is what gets saved.
 *
 * Both are called only for signed-in users — the caller knows the session
 * (cookie auth), so the gate lives there rather than here.
 */
import { applyServerAccent, applyServerStatus, getThemeState } from './theme';
import { apiFetch } from '@/lib/api';

export async function loadServerTheme(): Promise<void> {
  try {
    const res = await apiFetch('/api/auth/theme');
    if (!res.ok) return; // signed out or unreachable — the local cached colours stay
    const theme: { color: string | null; status: Record<string, string> | null } = await res.json();
    applyServerAccent(theme.color);
    applyServerStatus(theme.status);
  } catch {
    /* offline — the local (cached) colours stay in effect */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function queueThemeSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { accent, statusColours } = getThemeState();
    void apiFetch('/api/auth/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        color: accent,
        status: Object.keys(statusColours).length ? statusColours : null,
      }),
    }).catch(() => {
      /* best-effort; the local copy is already applied + cached */
    });
  }, 500);
}
