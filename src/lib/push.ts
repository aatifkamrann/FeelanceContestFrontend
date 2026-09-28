/**
 * Web push from the browser's side: whether this browser can do it at all,
 * the service worker that receives, and the subscription the push service
 * hands back for the API to keep. Everything here is per device — a phone
 * and a laptop are two subscriptions — which is why the Notifications page
 * talks about "this device".
 */

import { apiPublic } from '@/lib/api';

export type PushSupport =
  /** Ready: secure context, the APIs exist, permission not refused. */
  | 'ok'
  /** Plain http on a non-localhost address — the browser refuses service workers there. */
  | 'insecure'
  /** No service worker or push API (an old or restricted browser). */
  | 'unsupported'
  /** The person blocked notifications for this site in the browser itself. */
  | 'denied';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

/** Thrown when the browser's permission prompt was dismissed or refused. */
export class PushDeclined extends Error {
  constructor() {
    super('Notifications were not allowed.');
    this.name = 'PushDeclined';
  }
}

/** This browser's subscription, if it holds one — without prompting for anything. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const support = pushSupport();
  if (support === 'insecure' || support === 'unsupported') return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

/**
 * Ask, register the worker, subscribe. A subscription made under a previous
 * key (the portal's pair changed) is dropped and remade, since the push
 * service would refuse messages signed with the new one.
 */
export async function subscribe(pushKey: string): Promise<PushSubscription> {
  if ((await Notification.requestPermission()) !== 'granted') throw new PushDeclined();
  // The worker has no page to read the API's address from, so it rides the
  // script's own URL; absent, the worker asks same-origin as the page does.
  const api = apiPublic();
  const registration = await navigator.serviceWorker.register(api ? `/sw.js?api=${encodeURIComponent(api)}` : '/sw.js');
  await navigator.serviceWorker.ready;
  const options = { userVisibleOnly: true, applicationServerKey: base64UrlToBytes(pushKey) };
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    if (sameKey(existing.options.applicationServerKey, options.applicationServerKey)) return existing;
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe(options);
}

export async function unsubscribe(): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription) await subscription.unsubscribe();
}

/** The parts the API keeps, in the base64url the subscription reports them in. */
export function subscriptionParts(subscription: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  };
}

/** SHA-256 hex of a string — how the page matches its own browser to the API's device list. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** "Chrome on Windows" — enough for a person to recognise a device in a list. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /SamsungBrowser\//.test(ua)
        ? 'Samsung Internet'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'this device';
  return `${browser} on ${os}`;
}

function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  // Backed by a plain ArrayBuffer, which is what the subscription API accepts.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array<ArrayBuffer>): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const bytes = new Uint8Array(a);
  return bytes.every((value, i) => value === b[i]);
}
