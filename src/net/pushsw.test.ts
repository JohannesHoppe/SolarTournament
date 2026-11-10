import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { snoozeUntil } from './pushtext';

type Listener = (event: Record<string, unknown>) => void;

/** The service worker public/push-sw.js run as a browser runs it: its listeners, what it posts and what it opens. */
function worker() {
  const listeners = new Map<string, Listener>();
  const posted: unknown[] = [];
  const opened: string[] = [];
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const self = {
    location: { origin: 'https://solartournament.games' },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: {
      pushManager: { getSubscription: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/1' }) },
      showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }),
    },
    clients: { openWindow: async (url: string) => void opened.push(url) },
  };
  const fetch = async (_url: string, init: { body: string }) => {
    posted.push(JSON.parse(init.body));
    return new Response('{}');
  };
  runInNewContext(readFileSync('public/push-sw.js', 'utf8'), { self, fetch, URL, Date, JSON });
  /** Dispatches an event; resolves once what it handed waitUntil is done. */
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let work: Promise<unknown> = Promise.resolve();
    listeners.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => (work = promise) });
    await work;
  };
  const click = (action: string, url = '/#tournaments') => dispatch('notificationclick', { action, notification: { close: () => undefined, data: { url } } });
  return { dispatch, click, posted, opened, shown };
}

afterEach(() => vi.useRealTimers());

describe('the service worker of the notifications', () => {
  it('pauses as the game reckons a pause, for an hour or until the morning', async () => {
    vi.useFakeTimers();
    for (const at of [Date.UTC(2026, 10, 10, 3, 0), Date.UTC(2026, 10, 10, 12, 30), Date.UTC(2026, 10, 10, 23, 59)]) {
      vi.setSystemTime(at);
      const { click, posted } = worker();
      await click('hour');
      await click('morning');
      expect(posted).toEqual([
        { snooze: 'https://fcm.googleapis.com/fcm/send/1', until: snoozeUntil('hour', at) },
        { snooze: 'https://fcm.googleapis.com/fcm/send/1', until: snoozeUntil('morning', at) },
      ]);
    }
  });

  it('shows what a push carries, and opens only a page of the game', async () => {
    const { dispatch, click, opened, shown } = worker();
    await dispatch('push', { data: { json: () => ({ title: '2 public tournaments are open', body: 'Join', url: '/#tournaments' }) } });
    await dispatch('push', { data: { json: () => JSON.parse('{oops') } });
    expect(shown.map((s) => s.title)).toEqual(['2 public tournaments are open', 'SolarTournament']);
    await click('');
    await click('', 'https://evil.example/');
    expect(opened).toEqual(['https://solartournament.games/#tournaments']);
  });
});
