import type { Locale } from '../i18n/i18n';

/**
 * The notification when a public tournament opens, on the browser's side: subscribing and
 * unsubscribing through the service worker (public/push-sw.js) and the function /push
 * (functions/push.ts), and the lead browser's word that its public tournament is open.
 * Nothing is sent before the Host asks for notifications; the browser keeps the subscription
 * itself (PushManager), the game keeps nothing of it.
 */

/** The service worker that shows the notifications. */
const WORKER = '/push-sw.js';
/** A lead browser says its tournament is open again this often (ms); see OPEN_HEARTBEAT in functions/push.ts. */
const HEARTBEAT_MS = 120_000;

const post = (body: unknown) => fetch('/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Whether this browser can take pushes at all. */
export const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;

/** The server's VAPID key, or null while the push is not set up there (or cannot be reached). */
export async function pushKey(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const answer = await fetch('/push');
    if (!answer.ok) return null;
    const { key } = (await answer.json()) as { key?: unknown };
    return typeof key === 'string' && /^[\w-]{80,100}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** The subscription this browser holds, if any. */
async function current(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(WORKER);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Whether this browser is subscribed. */
export async function subscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    return (await current()) !== null;
  } catch {
    return false;
  }
}

function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Asks for notifications and subscribes; false when the Host or the browser says no, or the server refuses. */
export async function subscribe(key: string, locale: Locale): Promise<boolean> {
  try {
    if ((await Notification.requestPermission()) !== 'granted') return false;
    const registration = await navigator.serviceWorker.register(WORKER);
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const answer = await post({ subscribe: subscription.toJSON(), locale });
    if (answer.ok) return true;
    await subscription.unsubscribe();
    return false;
  } catch {
    return false;
  }
}

/** Ends the subscription, here and on the server. */
export async function unsubscribe(): Promise<void> {
  try {
    const subscription = await current();
    if (!subscription) return;
    await post({ unsubscribe: subscription.endpoint }).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // nothing held, nothing to end
  }
}

/** The lead browser's word that its public tournament is open: at once for a new room, then every HEARTBEAT_MS. */
export class OpenBeat {
  private room = '';
  private at = -Infinity;

  /** Called while this browser announces `room` in the lobby (every frame is fine), with null once it stops. */
  beat(room: string | null, nowMs: number) {
    if (!room) {
      this.room = '';
      return;
    }
    if (room === this.room && nowMs - this.at < HEARTBEAT_MS) return;
    this.room = room;
    this.at = nowMs;
    void post({ open: room }).catch(() => undefined);
  }
}
