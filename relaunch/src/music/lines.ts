/**
 * Everything the voice of Radio 2584 says: track titles and the propaganda of the United
 * Solar States. All lines are original satire of a demagogue's rhetoric (superlatives,
 * blaming the predecessor, prices "way down", renaming things, "rigged", "fake"); no real
 * person is named. The voice is rendered word by word at build time (`npm run voice`), so
 * every word here must be in the rendered set; the radio places the words on the beat.
 */

/** en, de: the propaganda voice. mod: the radio host. sys: the flight computer, clear and calm. */
export type Language = 'en' | 'de' | 'mod' | 'sys';

/** Title words of the English flavors; a title is one word of each list. */
export const TITLE_FIRST = [
  'reactor', 'kessler', 'delta', 'clone', 'hull', 'plasma', 'vacuum', 'burn', 'sponsor', 'orbit', 'ion', 'tungsten',
  'flip', 'slingshot', 'perihelion', 'neon', 'golden', 'orange', 'rigged', 'tremendous', 'presidential', 'solar', 'dead', 'printed',
  'cheap', 'fake', 'record', 'victory', 'tariff', 'gravity', 'comet', 'asteroid',
];
export const TITLE_SECOND = [
  'pressure', 'overdrive', 'breach', 'protocol', 'ritual', 'machine', 'mantra', 'static', 'riot', 'pulse', 'damage', 'collapse',
  'engine', 'terror', 'massacre', 'dome', 'wall', 'ballroom', 'parade', 'hoax', 'dynasty', 'empire', 'factory', 'circus',
  'frenzy', 'decree', 'tribunal', 'dividend', 'sermon', 'stampede', 'meltdown', 'jackpot',
];

/** Title words of the motorik flavor: German, Kraftwerk-style compounds read as two words. */
export const TITLE_FIRST_DE = [
  'rakete', 'reaktor', 'klon', 'rotor', 'radar', 'rekord', 'roboter', 'raum', 'nacht', 'sonnen', 'strom', 'turnier',
];
export const TITLE_SECOND_DE = [
  'fabrik', 'strasse', 'rennen', 'rausch', 'zentrale', 'maschine', 'propaganda', 'reflex', 'signal', 'motor', 'ring', 'reise',
];

export const STATION_EN = 'radio twenty five eighty four';
export const NOW_PLAYING_EN = 'now playing';
export const STATION_DE = 'radio zwei fünf acht vier';
export const NOW_PLAYING_DE = 'es läuft';

/** The Orange President, his regime and his sponsors. */
export const PHRASES_EN = [
  'the golden age of the solar system begins right now',
  'impulse drive prices are way down. way down',
  'cloning is cheaper than ever. believe me',
  'the last president could not clone a sandwich',
  'we inherited a mess. a cosmic mess',
  'asteroid prices are down ninety four percent',
  'tariffs on mars. beautiful tariffs',
  'tariff is the most beautiful word in the galaxy',
  'fake gravity news. a total hoax',
  'the sun was rigged. everybody knows it',
  'record clone numbers. numbers nobody has ever seen',
  'the next arena will be the biggest arena ever built',
  'the biggest crowds in the history of crowds',
  'make the universe great again',
  'drill baby drill. on every moon',
  'we were a dead planet. now we are the hottest',
  'big strong miners. tears in their eyes',
  'they said sir. you saved the solar system',
  'many people are saying it',
  'nobody knew orbits could be so complicated',
  'i ended eight space wars. maybe nine',
  'where is my galactic peace prize',
  'a beautiful ballroom. on the moon',
  'third term. fourth term. two hundredth term',
  'very stable orbit. very stable genius',
  'the comet press is the enemy of the people',
  'my poll numbers are the highest in the universe',
  'the clones love me. tremendous clones',
  'when will i get credit for the stars',
  'kill five clones. get one free',
  'the sponsor wants your blood',
  'death is temporary. advertising is forever',
  'your body is a subscription',
  'no refunds on dead clones',
  'obey. consume. respawn',
  'this message was paid for by your next clone',
  'please watch the advertisement. your clone depends on it',
  'please die responsibly',
  'organ donation is mandatory. thank you for your organs',
  'the solar wall will be beautiful. mars will pay for it',
  'rockborn go home. home is the belt',
  'deportations at record speed',
  'the orange president thanks you for your clone',
  'united solar states. land of the free clone',
  'these are the greatest presidential games in history',
  'the ministry of defense is now the ministry of victory',
  'aliens are not people. cheer responsibly',
  'some say ninety five percent. i say more',
  'mars will pay for the tariff. gladly',
  'billions watching. trillions some say',
  'liquid gold under every asteroid',
  'the hottest system in the galaxy. nobody close',
  'a lot of people do not know that',
  'jupiter has a new name. a much better name',
  'the golden dome covers every planet',
  'a dome like nobody has ever seen',
  'the biggest ballroom in the milky way',
  'they say i can not run again. too bad',
  'trillions pouring in. from neptune',
  'fake news from the moon. sad',
  'witch hunt. the biggest witch hunt in space',
  'oxygen prices are way way down',
  'gravity is cheaper than ever',
  'the ratings are through the roof. through the atmosphere',
  'the best arena. the best clones. the best',
  'sleepy nebula ned signed with a robot pen',
  'low battery barnaby could not even find mars',
  'crooked comet carl let the sun go cold',
  'every planet says sir. thank you sir',
  'the decline of the galaxy is over',
  'peace through firepower. beautiful firepower',
  'i am one thousand years young. never been better',
  'my clone is the best clone. the most beautiful clone',
  'united solar states. bigger than ever before',
  'presidential games. the biggest crowds in history',
  'golden dome insurance. covered by the president',
  'liquid gold fuel. asteroid fresh. way down in price',
  'victory cola. the most beautiful word in thirst',
  'clone again today. cheaper than ever',
  'tariff bank. mars pays. you win',
  'ministry of victory. peace through explosions',
  'presidential gravity. accept no fake gravity',
];

/** German lines for the motorik flavor and now and then elsewhere: rolling R wherever possible. */
export const PHRASES_DE = [
  'rekord klone. rekord zahlen. rekord präsident',
  'achtung. klonfabrik',
  'brennen. bremsen. brennen',
  'der präsident ist zufrieden',
  'gehorchen. verbrauchen. wiedergeboren',
  'sterben ist pflicht. werbung ist kür',
  'turnier. turnier. turnier',
  'raumfahrt im rausch',
  'klon nummer neun. bitte zum startplatz',
  'die mauer wird groß. größer als die sonne',
  'strafzölle auf den mars. wunderschöne strafzölle',
  'treibstoffpreise. runter. runter. runter',
  'die sonne war manipuliert. alle sagen das',
  'das goldene zeitalter beginnt jetzt',
  'rakete. reaktor. rekord',
  'das goldene zeitalter des sonnensystems beginnt jetzt',
  'die arena ist größer als je zuvor. viel größer',
  'falsche schwerkraft. falsche nachrichten. traurig',
  'große starke bergarbeiter. tränen in den augen',
  'macht das universum wieder großartig',
  'die größte zuschauermenge der geschichte. garantiert',
  'der präsident regiert. der roboter rechnet',
  'tausend jahre präsident. und kein ende',
];

/**
 * The radio host: cynical, delighted by every death. A line may contain {name}; it is
 * spoken as the name of a bot, or as "pilot" for a human callsign (the subtitle shows it).
 */
export const HOST_KILL = [
  'an excellent death for {name}',
  'what a beautiful death. {name} goes back to the printer',
  '{name} is dead. the sponsor is delighted',
  'another clone for the recycler. thank you {name}',
  'and {name} explodes. the president is probably very happy',
  'what a waste of a perfectly good clone. wonderful',
  'that one was sponsored. {name} dies for victory cola',
  'beautiful. {name} breathes vacuum now',
];
export const HOST_ALIEN = [
  'the alien is dead. now our nation can grow again',
  'one less alien. the president thanks you',
  'the monster is dead. cheer for the united solar states',
];
export const HOST_ROCK = [
  'and {name} meets an asteroid. the rockborn send their regards',
  'a rock wins again. {name} goes back to the printer',
];
export const HOST_OPEN = ['radio twenty five eighty four. live from the arena', 'this is your host. the games continue'];

/** Bot callsigns the host can say; human callsigns become "pilot". */
export const HOST_NAMES = ['ingmar', 'nova', 'kessler', 'vega', 'orion', 'sputnik', 'halley', 'laika', 'pilot'];

/**
 * The flight computer reads out what the screen shows; people would rather listen than read.
 * The briefing opens the flight school with the story of the games.
 */
export const BRIEFING =
  'the year is twenty five eighty four. the united solar states rule the planets, and the orange president rules the united solar states. ' +
  'to keep his people quiet and entertained, his ministry of war stages the presidential games. ' +
  'you are one of the chosen pilots, and it is an honor to die for the president. ' +
  'your body stays safe while you fly a printed clone over a live link, and when the clone dies, the next one is already waiting in the printer. ' +
  'you will die again and again through your clones. that is your destiny now. ' +
  'training clones like this one are free, but in the tournament every new clone costs you an advertisement. ' +
  'make the great president happy. that is all that counts.';

/** Spoken versions of the flight school steps, in order (the screen shows the full text). */
export const SCHOOL_SPEECH = [
  BRIEFING,
  'welcome to flight school. training clones are free. enjoy it while it lasts.',
  'main drive. hold the drive until you fly fifty meters per second.',
  'let go of the drive. nothing slows you down out here. you keep drifting.',
  'to stop, your drive has to point into the flight direction. flip the ship.',
  'now burn until you are almost at rest. the orange cross marks the braking direction.',
  'maneuvering thrusters push you sideways. sidestep for a moment.',
  'a target drone. turn towards it and fire. three hits wreck any hull. a shot through the center hits the reactor.',
  'every shot heats your ship. in the shadow of an asteroid the radiators cool much faster. fly into the marked shadow.',
  'when impact appears below the crosshair, flip and burn or steer past.',
  'flight school complete. your clone is cleared for the tournament.',
];

/** What the flight computer says when the screen shows a message. */
export const COMPUTER = {
  reactor: 'reactor breach',
  drive: 'main drive damaged',
  thrusters: 'thrusters damaged',
  hull: 'hull breach',
  impact: 'impact',
  debris: 'debris impact',
  asteroid: 'asteroid cracked',
  arena: 'return to the field',
  mouse: 'click to steer with the mouse',
  noLink: 'could not connect',
  cloneLost: 'clone lost. want another clone? you pay with advertising. make the sponsor happy.',
  sponsorHappy: 'the sponsor is happy. booting your next clone.',
  roundOver: 'round over',
  launch: 'clone online. good luck, pilot.',
} as const;

/** All phrases and fixed announcements of a language, for the renderer. */
export function allLines(language: Language): string[] {
  switch (language) {
    case 'en':
      return [STATION_EN, NOW_PLAYING_EN, ...TITLE_FIRST, ...TITLE_SECOND, ...PHRASES_EN];
    case 'de':
      return [STATION_DE, NOW_PLAYING_DE, ...TITLE_FIRST_DE, ...TITLE_SECOND_DE, ...PHRASES_DE];
    case 'mod':
      return [...HOST_KILL, ...HOST_ALIEN, ...HOST_ROCK, ...HOST_OPEN, ...HOST_NAMES].map((line) => line.replace('{name}', ''));
    case 'sys':
      return [...SCHOOL_SPEECH, ...Object.values(COMPUTER)];
  }
}

/** A line split into words; a word followed by a period ends a sentence (a longer pause). */
export function words(line: string): { word: string; stop: boolean }[] {
  return line.split(/\s+/).filter(Boolean).map((token) => ({ word: token.replace(/[^\p{L}\p{N}]/gu, ''), stop: /[.?!]$/.test(token) }));
}

/** Key of a rendered word in the voice manifest. */
export const clipKey = (language: Language, word: string) => `${language}:${word}`;
