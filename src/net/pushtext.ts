import { CATALOGS, msg, type Locale } from '../i18n/i18n';

/** The highest number of open public tournaments a Host can ask to be told of (see functions/push.ts). */
export const MAX_FROM = 3;

/** The notification when a public tournament opens, as the service worker shows it (public/push-sw.js). */
const ONE = msg('A public tournament is open');
const MANY = msg('{n} public tournaments are open');
const BODY = msg('Hosts are gathering in the lobby. Fly with them.');

/** What a push carries: the notification's text in the Host's language and the page it opens. */
export interface PushText {
  title: string;
  body: string;
  url: string;
}

/** The notification in a language (the one the Host played in when it subscribed), with how many public tournaments are open. */
export function pushText(locale: Locale, open: number): PushText {
  const say = (text: string) => (locale === 'en' ? text : (CATALOGS[locale][text] ?? text));
  return { title: open > 1 ? say(MANY).replace('{n}', String(open)) : say(ONE), body: say(BODY), url: '/#tournaments' };
}
