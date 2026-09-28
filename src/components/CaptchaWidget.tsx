'use client';

import { useEffect, useRef } from 'react';

/**
 * A Cloudflare Turnstile challenge. Rendered only when the operator has
 * configured the key pair (the site key arrives via /api/public/branding),
 * so a portal without captcha never loads a third-party script at all.
 *
 * Explicit rendering rather than the implicit class scan, because these
 * forms mount client-side after the script may already have run its scan.
 * Tokens expire after a few minutes; the expiry callback clears ours so the
 * submit button falls back to "complete the challenge" instead of sending a
 * dead token the server would reject anyway.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')));
      if (window.turnstile) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Turnstile failed to load')));
    document.head.appendChild(script);
  });
}

export default function CaptchaWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  // The callback identity changes per render; the widget must not re-mount
  // for that, so it reads the latest through a ref.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;

    void loadScript()
      .then(() => {
        if (cancelled || !host.current || !window.turnstile) return;
        widgetId = window.turnstile.render(host.current, {
          sitekey: siteKey,
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        // The server will refuse without a token; nothing useful to render here.
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={host} className="min-h-[65px]" />;
}
