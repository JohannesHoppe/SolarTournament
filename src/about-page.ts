import { initLocale, translatePage } from './i18n/i18n';
import { shareCorner } from './share';

/** The page that says what the game is (about.html), in the Host's language. */

initLocale();
translatePage();
shareCorner('about');
