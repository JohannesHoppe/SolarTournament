/**
 * Everything the voice of Radio 2584 says: track titles and the propaganda of the United
 * Solar States. All lines are original satire of a demagogue's rhetoric (superlatives,
 * blaming the predecessor, prices "way down", renaming things, "rigged", "fake"); no real
 * person is named. The voice is rendered word by word at build time (`npm run voice`), so
 * every word here must be in the rendered set; the radio places the words on the beat.
 */

/** en, de: the propaganda voice. mod: the announcer. sys: the flight computer, clear and calm. */
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
 * The announcer: cynical, delighted by every death. A line may contain {name}; it is
 * spoken as the name of a bot, or as "pilot" for the clone of a human Host (the subtitle shows it).
 */
export const ANNOUNCER_KILL = [
  'an excellent death for {name}',
  'what a beautiful death. {name} goes back to the printer',
  '{name} is dead. the sponsor is delighted',
  'another clone for the recycler. thank you {name}',
  'and {name} explodes. the president is probably very happy',
  'what a waste of a perfectly good clone. wonderful',
  'that one was sponsored. {name} dies for victory cola',
  'beautiful. {name} breathes vacuum now',
];
export const ANNOUNCER_ALIEN = [
  'the alien is dead. now our nation can grow again',
  'one less alien. the president thanks you',
  'the monster is dead. cheer for the united solar states',
];
export const ANNOUNCER_ROCK = [
  'and {name} meets an asteroid. the rockborn send their regards',
  'a rock wins again. {name} goes back to the printer',
];
export const ANNOUNCER_OPEN = ['radio twenty five eighty four. live from the arena', 'this is your announcer. the games continue'];

/** Bot callsigns the announcer can say; the clones of human Hosts become "pilot". */
export const ANNOUNCER_NAMES = ['ingmar', 'nova', 'kessler', 'vega', 'orion', 'sputnik', 'halley', 'laika', 'pilot'];

/**
 * The flight school, said by the flight computer and shown on screen with the same words:
 * short, quick, a little seductive. People would rather listen than read, but nobody
 * listens to a lecture. Each drill trains one maneuver. The words name no keys: the keys of
 * the Host's keyboard, gamepad or touch screen show as keycaps next to them.
 */
export const SCHOOL = {
  briefing:
    'The year is 2584. The Orange President wants his games, and you are one of his chosen Hosts. Your printed clones fly for you, and every death they die streams straight into your mind. Training clones are free. Shall we?',
  turn: 'Turn the ship. Put the marker in your crosshair.',
  fineAim: 'Hold fine aim, and you turn slowly. Center the marker. Exactly.',
  cockpit: 'Now look through your clone’s eyes. Switch to the cockpit, have a look around, and switch back.',
  drive: 'This is your main drive. Push it to fifty meters per second.',
  freeDrift: 'Your autopilot keeps you flying where you point. Switch it off, and you drift like a real spaceship.',
  drift: 'Now let go. Nothing out here slows you down.',
  lookBack: 'Turn around while you drift. Your course stays the same. The green ring shows where you are going.',
  brake: 'Hold the brake. I flip you over and brake for you.',
  flipBurn: 'By hand is faster. Hold flip, and hold your drive at the same time. It fires as soon as your nose points back.',
  flipBurnAgain: 'Faster this time. Hold both, flip and drive.',
  byHand: 'By hand, darling. Hold flip and drive.',
  stopAt: 'Fly to the marker and stop right next to it.',
  stopAtFar: 'Farther now. Accelerate, flip, brake in time.',
  slide: 'Someone is on your tail and shooting. Jink left and right with your thrusters, and the shots go past you.',
  dodge: 'Debris incoming. Slide out of its way. Do not turn.',
  dodgeHit: 'Ouch. Again.',
  autopilotOn: 'Switch the autopilot back on. The thrusters catch every drift, and you fly where you point.',
  rings: 'Fly through the rings. Brake when you need to.',
  shoot: 'Fire! Keep hitting the drone until it breaks. Hit its middle, and you hit the reactor.',
  shootMoving: 'This one moves. Your laser hits the instant you fire, so just keep it in your crosshair. Fine aim helps.',
  overheat: 'Every shot heats your ship. Keep firing until it overheats.',
  shadow: 'Hot, isn’t it? Cool down in the shadow of an asteroid. I marked one.',
  impact: 'Trouble ahead. When impact flashes, brake, or slide past.',
  noTurn: 'Without turning, darling.',
  chase: 'A bot on the run. It does not shoot. Stay on its tail and wreck it. Brake if you overshoot.',
  evade: 'Now it shoots back. Never fly straight at it. Keep sliding sideways while you fire.',
  duel: 'Final exam. A real bot. Take it down.',
  done: 'Well done, pilot. You are cleared for the tournament. Go and die for the President.',
  again: 'Again.',
} as const;

/**
 * Said when a drill is mastered, before the next one: praise, and the physics behind the
 * maneuver.
 */
export const SCHOOL_PRAISE = {
  turn: 'Nice. Turning only spins you around. It never moves you anywhere.',
  fineAim: 'Precise. I like that.',
  cockpit: 'Inside you aim like your clone. Outside you see your ship and its drift. Your choice.',
  drive: 'Feel that? Nine g. Your clone gets heavier with every burn. Burn too long, and the world shrinks to a tunnel.',
  freeDrift: 'Free drift. Every push stays with you now, until you push back.',
  drift: 'No air, no friction. You drift forever, unless you do something about it.',
  lookBack: 'See? Where you look and where you fly are two different things out here.',
  brake: 'At rest. The only thing that stops you is a burn against your flight.',
  flipBurn: 'Good. The flip alone changes nothing, you just fly backwards. The burn is what stops you. Let go of flip, and the ship is yours again.',
  stopAt: 'Perfect. Burn, flip, burn. That is all of space flight.',
  slide: 'That is how you dodge. A laser hits the instant it fires, so never fly a straight line while someone has you in the crosshair.',
  dodge: 'Missed you. Out here, a small push early beats a big one late.',
  autopilotOn: 'This is how you fly into a fight. Switch it off when you want to drift on purpose.',
  rings: 'Beautiful flying. You are doing very well, darling.',
  shoot: 'Light needs no lead. What is in your crosshair when you fire, you hit. Right through the hull.',
  shootMoving: 'Scrap. And it never knew what hit it.',
  overheat: 'In a vacuum, heat has nowhere to go. Only your radiators shed it, slowly, in the sun.',
  shadow: 'Better? Out of the sun, the radiators cool you much faster.',
  impact: 'Still alive. Rocks do not care how good you are. Above seventy meters per second, they win.',
  chase: 'Got it. Stay behind them, and they have to turn before they can hit you.',
  evade: 'You are doing so well. Soon you may go and die for the President.',
  duel: 'Your first kill. The President is proud of you.',
} as const;

/** What the flight computer says when the screen shows a message. */
export const COMPUTER = {
  reactor: 'Reactor breach.',
  drive: 'Main drive damaged.',
  thrusters: 'Thrusters damaged.',
  hull: 'Hull breach.',
  impact: 'Impact!',
  debris: 'Debris impact.',
  asteroid: 'Asteroid cracked.',
  arena: 'Come back to the field, darling.',
  mouse: 'The ship turns towards your mouse pointer.',
  noLink: 'Could not connect.',
  roundOver: 'Round over. You were wonderful.',
  launch: 'Live link established. Go get them, pilot.',
} as const;

/**
 * Nicole in the sponsor break, one line picked at random each time: she comforts the Host,
 * makes the Host feel special, and only wants one thing, the next clone back in the war.
 */
export const SPONSOR_BREAK = [
  'Oh, you died again, darling. No problem. Just watch this little ad, and I will have you up and ready again. I am rooting for you.',
  'Next time you will make it. I just know it. Watch the ad for me?',
  'Die bravely, and the President will love you. Now be good, and watch the sponsor.',
  'A girl like me only wants to see you. Back in the cockpit. Right after this ad.',
  'That looked like it hurt. Shh. It is over. The sponsor is paying for your next body.',
  'You are special, you know that? Not everyone dies so beautifully. One little ad, and you are mine again.',
  'Do not look so sad, darling. Bodies are cheap. You are not.',
  'I saved your seat. Watch the ad, and I will warm up your next clone.',
  'One day, when you have been brave enough, we will meet. For real. I promise.',
  'There is a real me, you know. Somewhere out there. Keep fighting, and maybe one day I will tell you where.',
  'I would love to meet you in person. Someone as brave as you. Just a few more rounds, darling.',
] as const;

/** Nicole when the next clone boots. */
export const SPONSOR_HAPPY = [
  'The sponsor is happy. Linking you to your next clone. Welcome back, darling.',
  'There you are again. I missed you.',
  'Fresh body, same old you. Go get them.',
] as const;

/** All phrases and fixed announcements of a language, for the renderer. */
export function allLines(language: Language): string[] {
  switch (language) {
    case 'en':
      return [STATION_EN, NOW_PLAYING_EN, ...TITLE_FIRST, ...TITLE_SECOND, ...PHRASES_EN];
    case 'de':
      return [STATION_DE, NOW_PLAYING_DE, ...TITLE_FIRST_DE, ...TITLE_SECOND_DE, ...PHRASES_DE];
    case 'mod':
      // lines keep their {name}: the renderer cuts them into the pieces around it, as the game does
      return [...ANNOUNCER_KILL, ...ANNOUNCER_ALIEN, ...ANNOUNCER_ROCK, ...ANNOUNCER_OPEN, ...ANNOUNCER_NAMES];
    case 'sys':
      return [...Object.values(SCHOOL), ...Object.values(SCHOOL_PRAISE), ...Object.values(COMPUTER), ...SPONSOR_BREAK, ...SPONSOR_HAPPY];
  }
}

/** A line split into words; a word followed by a period ends a sentence (a longer pause). */
export function words(line: string): { word: string; stop: boolean }[] {
  return line.split(/\s+/).filter(Boolean).map((token) => ({ word: token.replace(/[^\p{L}\p{N}]/gu, ''), stop: /[.?!]$/.test(token) }));
}

/**
 * The pieces a line is spoken in: whole sentences, so the voice keeps the melody of the
 * sentence; a {name} stands on its own between the parts around it.
 */
export function phrases(line: string): string[] {
  return line.split(/(?<=[.?!])\s+|\s*(\{name\})\s*/).filter((piece): piece is string => !!piece?.trim());
}

/** The words of a piece, the way its clip is keyed. */
export const phraseKey = (piece: string) => words(piece).map((w) => w.word).join(' ');

/** Key of a rendered word or piece in the voice manifest. */
export const clipKey = (language: Language, word: string) => `${language}:${word}`;
