import { CATALOGS, msg, type Locale } from '../i18n/i18n';

/** The highest number of open public tournaments a Host can ask to be told of (see functions/push.ts). */
export const MAX_FROM = 3;

/** The notification when a public tournament opens, as the service worker shows it (public/push-sw.js). */
const ONE = msg('A public tournament is open');
const MANY = msg('{n} public tournaments are open');
const BODY = msg('Hosts are gathering in the lobby. Fly with them.');
/** The notification's buttons that pause it (see snoozeUntil), and the list's. */
export const PAUSE_HOUR = msg('Quiet for an hour');
export const PAUSE_MORNING = msg('Quiet until tomorrow morning');

/** How long a pause lasts: an hour, or until MORNING o'clock on the device's own clock, today if that is still ahead, else tomorrow. */
export type Pause = 'hour' | 'morning';
const MORNING = 8;

/** When a pause of `pause` begun at `nowMs` (ms since 1970) ends (s since 1970); public/push-sw.js reckons it alike for its buttons. */
export function snoozeUntil(pause: Pause, nowMs: number): number {
  if (pause === 'hour') return Math.floor(nowMs / 1000) + 3600;
  const morning = new Date(nowMs);
  morning.setHours(MORNING, 0, 0, 0);
  if (morning.getTime() <= nowMs) morning.setDate(morning.getDate() + 1);
  return Math.floor(morning.getTime() / 1000);
}

/** What a push carries: the notification's text in the Host's language, the page it opens, and its buttons (where the browser shows buttons). */
export interface PushText {
  title: string;
  body: string;
  url: string;
  actions: { action: Pause; title: string }[];
}

/** The notification in a language (the one the Host played in when it subscribed), with how many public tournaments are open. */
export function pushText(locale: Locale, open: number): PushText {
  const say = (text: string) => (locale === 'en' ? text : (CATALOGS[locale][text] ?? text));
  return { title: open > 1 ? say(MANY).replace('{n}', String(open)) : say(ONE), body: say(BODY), url: '/#tournaments', actions: [{ action: 'hour', title: say(PAUSE_HOUR) }, { action: 'morning', title: say(PAUSE_MORNING) }] };
}
