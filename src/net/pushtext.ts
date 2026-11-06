import { CATALOGS, msg, type Locale } from '../i18n/i18n';

/** The notification when a public tournament opens, as the service worker shows it (public/push-sw.js). */
const TITLE = msg('A public tournament is open');
const BODY = msg('Hosts are gathering in the lobby. Fly with them.');

/** What a push carries: the notification's text in the Host's language and the page it opens. */
export interface PushText {
  title: string;
  body: string;
  url: string;
}

/** The notification in a language (the one the Host played in when it subscribed). */
export function pushText(locale: Locale): PushText {
  const say = (text: string) => (locale === 'en' ? text : (CATALOGS[locale][text] ?? text));
  return { title: say(TITLE), body: say(BODY), url: '/#tournaments' };
}
