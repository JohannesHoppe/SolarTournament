/**
 * Everything the voice of Radio 2584 says: track titles and the propaganda of the United
 * Solar States. All lines are original satire of a demagogue's rhetoric (superlatives,
 * blaming the predecessor, prices "way down", renaming things, "rigged", "fake"); no real
 * person is named. The voice is rendered word by word at build time (`npm run voice`), so
 * every word here must be in the rendered set; the radio places the words on the beat.
 */

/** en, de: the propaganda voice. mod: the announcer. sys: the flight computer, clear and calm. rask, pim, hedda, saw, tally, navy, jack, crisp, spare, quill, vey, perihelion, president: the people of the campaign (see Cast). */
export type Language = 'en' | 'de' | 'mod' | 'sys' | 'rask' | 'pim' | 'hedda' | 'saw' | 'tally' | 'navy' | 'jack' | 'crisp' | 'spare' | 'quill' | 'vey' | 'perihelion' | 'president';

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
  'fabrik', 'straße', 'rennen', 'rausch', 'zentrale', 'maschine', 'propaganda', 'reflex', 'signal', 'motor', 'ring', 'reise',
];

export const STATION_EN = 'radio twenty five eighty four';
export const NOW_PLAYING_EN = 'now playing';
export const STATION_DE = 'radio zwei fünf acht vier';
export const NOW_PLAYING_DE = 'es läuft';

/** The Orange President, his regime and his sponsors. */
export const PHRASES_EN = [
  'the golden age of the solar system begins right now',
  'hospitals closed. carriers open. tremendous',
  'who needs doctors. we have clones',
  'every hospital became a golden deck plate. beautiful',
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
  'krankenhaus geschlossen. flugzeugträger eröffnet',
  'wer braucht ärzte. wir haben klone',
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
/** A ship killed by its own side: the announcer scolds the killer ({name}), and the regime loves the waste. */
export const ANNOUNCER_TEAM_KILL = [
  '{name} shoots its own side. what an idiot. the printer thanks you',
  'friendly fire from {name}. a clone wasted for nothing. the president loves waste',
  'look at {name}, killing its friends. minus points, plus ratings',
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
/** The announcer on a race: a new leader, the leader's last lap, the winner. */
export const ANNOUNCER_LEAD = ['and {name} takes the lead', '{name} in front now. the crowd goes wild'];
export const ANNOUNCER_LAST_LAP = ['last lap. {name} leads the pack', 'the final lap. can anyone stop {name}'];
export const ANNOUNCER_WIN = ['{name} wins the race. glory to the president', 'and {name} takes the race. the sponsor is delighted'];
/** Last Clone Standing: a pilot loses its last clone, one is left, and the flare comes. */
export const ANNOUNCER_OUT = ['{name} is out. no clones left', 'and {name} is gone. for good. well, for this round'];
export const ANNOUNCER_SURVIVOR = ['{name} is the last clone standing', '{name} survives. the president is impressed'];
export const ANNOUNCER_FLARE = 'here comes the flare. run from the sun, little clones';
/** A comet crosses the arena, its shower after it (see game/comet.ts). */
export const ANNOUNCER_COMET = ['a comet is coming. its shower is full of rock. hide, little clones', 'the heavens join the games. a comet, folks, courtesy of the president'];
/** A comet's head runs a pilot down. */
export const ANNOUNCER_COMET_KILL = ['and {name} meets the comet head on. the printer is warming up', 'a comet takes {name}. even the sky votes for the president'];
/** Capture the Flag: a pilot brings the other side's core home. */
/** The announcer on the own pilot's biggest moments (see game/moments.ts). */
export const ANNOUNCER_MOMENT = {
  triple: ['three in a row for {name}. the crowd is on its feet', '{name} makes it three. somebody print more clones'],
  multi: ['{name} is a massacre on legs. the sponsors weep with joy', 'and {name} keeps killing. this is what the president pays for'],
  supernova: ['{name} turns the arena into a supernova. the ratings explode', 'a nova from {name}. half the field is gone. glorious'],
  revenge: ['{name} takes revenge. sweet, cheap, and on live television', 'payback from {name}. the crowd loves a grudge'],
  knockout: ['{name} shoves a clone into the scenery. no laser needed', 'a little nudge from {name}. the printers are already warming up'],
};

export const ANNOUNCER_CAPTURE = ['{name} brings the core home', 'and {name} scores. the sponsor core is theirs'];
/** The President's Fleet: the battleship comes, turns its drive on the pilots, opens its reactor, goes down. */
export const ANNOUNCER_FLEET = {
  arrives: ['the president wants blood. here comes his battleship', 'a battleship enters the ring. because the president can'],
  plume: 'it turns its drive on you. do not stand behind it',
  open: 'the reactor is open. finish it',
  sunk: ['the battleship is down. the president is not amused', 'down it goes. the hosts take the round'],
  escaped: 'the battleship got away. the president wins. as always',
} as const;
export const ANNOUNCER_OPEN = ['radio twenty five eighty four. live from the arena', 'this is your announcer. the games continue'];
/** The announcer calls the round as its countdown begins, by mode (see the round's opening in game.ts). */
export const ANNOUNCER_START = {
  race: ['three laps. no brakes. the president wants a show', 'engines hot. clones ready. let them burn'],
  deathmatch: ['eight clones. one winner. the president is watching', 'ladies and gentlemen. let them bleed'],
  survival: ['three clones each. the flare is hungry', 'everybody dies tonight. the winner just does it last'],
  flag: ['orange against blue. bring the core home', 'two sides. two cores. no mercy'],
  fleet: ['the president sends his battleship. you will need luck', 'one battleship. all of you. the odds are fair. for him'],
} as const;
/** The own pilot's perfect start: the crowd loves it. */
export const ANNOUNCER_PERFECT = ['what a start. the crowd goes wild', 'a perfect launch. the sponsors are taking notes'];
/** The announcer names the arena of the round (see world/arenas). */
export const ANNOUNCER_ARENA = {
  belt: 'live from the belt. forty rocks. no mercy',
  rings: 'live from the rings of saturn. mind the ice',
  junkyard: 'live from the satellite junkyard. internet for everyone. junk forever',
  giant: 'live from jupiter. the clouds are hungry today',
  corona: 'live from the corona. it is hot today',
  hole: 'live from the event horizon. nobody comes back',
  derelict: 'live from the derelict. a world ship, broken in two',
} as const;

/** Bot callsigns the announcer can say; the clones of human Hosts become "pilot". */
/** The bots' callsigns; the announcer has a rendered clip of each. */
export const BOT_NAMES = ['Juno', 'Ceres', 'Kessler', 'Vega', 'Orion', 'Sputnik', 'Halley', 'Laika'];

/** The names the announcer can say: the bots', and "pilot" for every Host. */
export const ANNOUNCER_NAMES = [...BOT_NAMES.map((name) => name.toLowerCase()), 'pilot'];

/**
 * The flight school, said by the flight computer and shown on screen with the same words:
 * short, quick, a little seductive. People would rather listen than read, but nobody
 * listens to a lecture. Each drill trains one maneuver. The words name no keys: the keys of
 * the Host's keyboard, gamepad or touch screen show as keycaps next to them.
 */
export const SCHOOL = {
  hello: 'Hi, I am Nicole. Your personal flight computer.',
  briefing:
    'The year is 2584. The Orange President wants his games, and you are one of his chosen Hosts. Your printed clones fly for you, and every death they die streams straight into your mind. Training clones are free. Shall we?',
  turn: 'Turn the ship. Put the marker in your crosshair. Turning alone takes you nowhere.',
  fineAim: 'Hold fine aim, and you turn slowly. Center the marker. Exactly.',
  cockpit: 'Now look through your clone’s eyes. Switch to the cockpit, have a look around, and switch back.',
  drive: 'To get anywhere, you burn. This is your main drive. Push it to fifty meters per second.',
  drift: 'Now let go. Nothing out here slows you down.',
  lookBack: 'Turn your nose, and nothing else changes: the ship slides on the way it was going. Turn around, and watch the course marker: that is where you fly.',
  brake: 'Press the brake once. I flip you and burn, full drive. Press it again when you like your speed, and I turn you back to where you were looking.',
  curve: 'A curve. Turn your nose to each marker in turn, and burn: your drive bends your flight towards it.',
  flipBurn: 'Now by hand. Hold flip and drive. You burn until you let go.',
  flipBurnAgain: 'Faster this time. Hold both, flip and drive.',
  byHand: 'By hand, love. Hold flip and drive.',
  stopAt: 'Fly to the marker and stop right next to it.',
  stopAtFar: 'Farther now. Accelerate, and brake in time.',
  slide: 'Someone is on your tail and shooting. Jink left and right with your thrusters, and the shots go past you.',
  dodge: 'Debris incoming. Slide out of its way. Do not turn.',
  dodgeHit: 'Ouch. Again.',
  autopilot: 'One more thing: the autopilot. Switch it on, and I catch every drift for you: you fly where you point. Then switch it off again.',
  rings: 'Fly through the rings. The X shows where you cross the next one if you change nothing. Steer it into the ring, until it glows blue.',
  missed: 'Missed, darling. Keep the X blue inside the ring. Again.',
  shoot: 'Fire! Your laser only scorches armor. This drone shows you its drive. Hit the drive until it blows.',
  shootMoving: 'This one moves. Your laser hits the instant you fire, so just keep it in your crosshair. Fine aim helps.',
  overheat: 'Every shot heats your ship. Keep firing until it overheats.',
  shadow: 'Hot, isn’t it? Cool down in the shadow of an asteroid. I marked one.',
  impact: 'Trouble ahead. When impact flashes, brake, or steer around the rock.',
  noTurn: 'Without turning, sweetheart.',
  chase: 'A bot on the run. It does not shoot. Stay on its tail and hit its drive. Brake if you overshoot.',
  evade: 'Now it shoots back. Never let it get behind you. Keep your armored nose on it, slide, and work your way onto its tail.',
  duel: 'Final exam. A real bot, and it knows the trick too. Win the dogfight.',
  done: 'Well done, pilot. Remember: firing at armor only heats your laser. Win the dogfight, get on their tail, and hit the drive. You are cleared for the tournament. Go and die for the President.',
  basicDone: 'Basic training complete. You can fly, my hero. Now choose your trade: racer or gladiator.',
  racer: 'Racer training. A clean start, the rings, their coils and the racing line. Out here, speed is everything.',
  coil: 'The rings of a race are coils. Fly through the very center, and the coil throws you on. Put the X on the center of all three.',
  coilMiss: 'Off center, darling. The coil only fires in the core. Again.',
  brakeZone: 'Orange on the line means: too fast for that bend. Press the brake before the orange, and I flip you and burn. Press it again when the orange is gone, and I turn you back onto your line. Then steer through.',
  brakeZoneSwitch: 'With the brake, honey: once before the orange, and once more when it is gone. Again.',
  tooFast: 'Too fast for that bend, honey. Brake before the orange. Again.',
  fullSpeed: 'Now the line at full speed. Hold your drive all the way, and lead every bend with your nose: your drive bends you through it.',
  tooSlow: 'Too slow, darling. Hold your drive all the way, and lead the bends with your nose. Again.',
  start: 'A race starts on my count. Light your drive the moment I say burn. Too early, and it stalls.',
  tooEarly: 'Too early. Wait for burn.',
  tooLate: 'Too late. Again.',
  hook: 'Your hook. Aim at the rock and press it once: the harpoon bites, the winch yanks you in, and you swing around the rock. Press it again to let go, and you fly off with all that speed.',
  hookSlow: 'Swing faster before you let go. Again.',
  hookLetGo: 'Fast enough. Press the hook again, now!',
  racerDone: 'You are a racer now. Fly the clean line, mind the plumes, and win one for the President.',
  gladiator: 'Gladiator training. The laser, the heat, and the dogfight. Let us hurt somebody.',
  arsenal: 'Arsenal training. Torpedoes, the overdrive, the probes, and the nova core. Toys, big guy. Deadly toys.',
  torpedo: 'Torpedoes. Keep the drone close to your crosshair until the lock holds, then launch.',
  torpedoDown: 'Now one is coming for you. Find the red mark, and shoot it down before it reaches you.',
  torpedoHit: 'It got you. Aim for the red mark, and keep firing. Again.',
  torpedoPast: 'It got past you. Aim for the red mark, and keep firing. Again.',
  overdrive: 'Your overdrive. One shove, and you fly a hundred and fifty meters per second faster. Use it.',
  probe: 'Sponsor probes drift in every arena. Fly through this one, and take what it carries.',
  hookShip: 'Your hook bites ships too. Catch that runner, and reel it in.',
  nova: 'This is a nova core. Everything around you dies when you set it off, and so does your clone. Fly close to the drone, and fire.',
  arsenalDone: 'Your arsenal is ready. Use all of it, and make the President proud.',
  tactician: 'Tactician training. How to win a dogfight, and how not to lose one. Most clones die flying a straight line.',
  kick: 'Debris, and it is fast. Too fast to slide. Tap a thruster twice, and every thruster kicks at once. Do not turn.',
  shove: 'A drone drifts beside you, past a rock. When the rock comes up, kick your thrusters into the drone, and put it into the stone. Dirty, sweetheart. Dirty is the point.',
  onTail: 'Someone is right behind you, on your drive. Turn your armored nose to it, and fight back.',
  turnShoot: 'Fly to the buoy. A drone sits on your tail. Press the brake, and I flip your nose onto it: shoot it down. Press the brake again, and I put you back on your course.',
  turnShootSwitch: 'With the brake, darling: press it, shoot, and press it again. Again.',
  bursts: 'This one shoots back. Take it down, and hit its drive at least once on the way, or it does not count. Armor just heats your laser, so fire short bursts, only when the crosshair glows.',
  burstsNoDrive: 'Down, but you never touched its drive. Get behind it, and hit the drive at least once. Again.',
  slideShot: 'Free drift wins dogfights. As you pass the bot, your flight slides on, and your nose is all yours: turn it onto the bot, and hit it three times.',
  slideShotStraight: 'Sideways, darling. Fire while your nose is off your flight. Again.',
  cover: 'This one is good, and it is hunting you. Get the rock between you and it, and stay there.',
  torpedoCover: 'A torpedo is coming. Do not shoot it this time. Get behind the rock.',
  torpedoCoverHit: 'It got you. Put the rock between you and it. Again.',
  hideInstead: 'Shot down. Nice, but this time hide. Again.',
  orbit: 'The Event Horizon, darling. Your nose points around the black hole. Burn until I say stable orbit. Then let go, and fall around it for half a turn.',
  rescue: 'Bad news, darling: your drive is shot, down to a third, and the black hole has you. Burn away from it with all you have, and listen to me. When I call it, fire your overdrive.',
  exam: 'Final exam, tactician. This bot flies as well as the field. Use everything.',
  tacticianDone: 'You fight like a tactician now. Kick out of the line of fire, never show them your drive, fire in bursts, and let the rocks take the hits. Go and win one for the President.',
  again: 'Again.',
} as const;

/**
 * Said when a drill is mastered, before the next one: praise, and the physics behind the
 * maneuver.
 */
export const SCHOOL_PRAISE = {
  turn: 'Nice. Out here a ship spins on the spot, like a top.',
  fineAim: 'So hard, so precise. I like that.',
  cockpit: 'Inside you aim like your clone. Outside you see your ship and its drift. Your choice.',
  drive: 'Feel that? Thirteen g. Your clone gets heavier with every burn. Burn too long, and the world shrinks to a tunnel.',
  drift: 'No air, no friction. You drift forever, unless you do something about it.',
  lookBack: 'See? Out here, where you look and where you fly are two different things. Every push stays with you, until you push back.',
  brake: 'Slower, and looking where you looked before. Out here only a burn against your flight slows you down.',
  curve: 'Smooth, handsome. Your drive bends your flight, a little at a time. Let go, and you fly straight on.',
  flipBurn: 'Good, darling. Let go at zero, or you fly backwards. Flip alone, and your gun faces your chasers.',
  stopAt: 'Perfect. Burn, flip, burn. That is all of space flight.',
  slide: 'That is how you dodge. A laser hits the instant it fires, so never fly a straight line while someone has you in the crosshair.',
  dodge: 'Close. You really know how to make me tremble, big guy. Out here, a small push early beats a big one late.',
  autopilot: 'Now you know both. You drift; the autopilot is there when your head is busy with something else.',
  rings: 'Beautiful. The X is where you cross if you change nothing. Blue means through. You are doing very well, love.',
  coil: 'Feel that pull? Center, center, center. The clean line is the fast one.',
  brakeZone: 'The faster you fly, the wider you turn. Twice the speed, four times the curve. Brake before the bend, and burn out of it. Slow in, then all the way. Just like that.',
  fullSpeed: 'That is racing, darling. Full drive, nose on the line. Where it stays blue, never let go of the drive.',
  start: 'Perfect. A clean start wins races.',
  hook: 'Like a slingshot. The cable only pulls, darling. The speed of the swing stays yours.',
  shoot: 'Light needs no lead. What is in your crosshair when you fire, you hit. But only the drive breaks: five hits from behind, and the reactor goes.',
  shootMoving: 'Scrap. And it never knew what hit it.',
  overheat: 'In a vacuum, heat has nowhere to go. Only your radiators shed it, slowly, in the sun.',
  shadow: 'Better? Out of the sun, the radiators cool you much faster.',
  impact: 'You always go in so close. I love that. Still alive. Rocks do not care how good you are. Above seventy meters per second, they win.',
  chase: 'Got it. Stay behind them, and they have to turn before they can hit you.',
  evade: 'You are doing so well. Soon you may go and die for the President.',
  duel: 'Your first kill. The President is proud of you.',
  torpedo: 'Direct hit. My circuits are getting warm. Armor does not stop a torpedo. Two of those, and a ship is gone.',
  torpedoDown: 'Saved yourself. A torpedo is small, but your laser is faster.',
  overdrive: 'Sixty g in a blink. Your drive needs a few seconds to cool after that. Use it to escape, or to strike.',
  probe: 'Two more torpedoes. Every probe shows its color. Blue plates you, green repairs you, white is the nova core.',
  hookShip: 'Got them on your hook? Now pull them in nice and close. You both pull on the same cable, and the slower one gets dragged.',
  nova: 'Glorious. The sponsors love it so much, your next clone is on them.',
  kick: 'Every thruster at once, sixty meters per second sideways in a blink. Whoever aims at you has to find you again.',
  shove: 'Knocked out. Both hulls take the same blow, but only one of you meets the rock. Whatever crashes within three seconds of your shove is your kill.',
  onTail: 'A nose on your drive is the deadliest thing out here. Show them armor, and they only scratch paint.',
  turnShoot: 'Turn, shoot, and back on course, all in one move. The brake remembers where you were looking, so your hands are free for the trigger.',
  slideShot: 'Your nose on them, your flight somewhere else. They cannot dodge what they do not see coming, handsome.',
  bursts: 'Cool and deadly. Every shot at armor is heat you do not have when the drive shows.',
  cover: 'Lasers do not bend, and sensors do not see through rock. Behind it, you do not exist.',
  orbit: 'Half a turn without a single burn. In orbit you fall all the time, and keep missing. That is why my alarms stay quiet up there.',
  torpedoCover: 'Lost you. A seeker that loses its line never finds it again.',
  rescue: 'Out! The overdrive is one big kick, and while it carries you up, your drive cools down. Only fire it when I call it: while your drive can still make it alone, the cold drive after the kick drops you right back in.',
  exam: 'A real fight, and you won it. I am so proud of you, my hero.',
} as const;

/** What the flight computer says when the screen shows a message. */
export const COMPUTER = {
  reactor: 'Reactor breach.',
  drive: 'Main drive damaged.',
  thrusters: 'Thrusters damaged.',
  armor: 'Armor holds.',
  impact: 'Impact!',
  debris: 'Debris impact.',
  asteroid: 'Asteroid cracked.',
  arena: 'Come back to the field, darling.',
  noLink: 'Could not connect.',
  roundOver: 'Round over. You were wonderful.',
  launch: 'Live link established. Go get them, pilot.',
  nova: 'Darling, you have the nova core. Your next shot sets it off: a monstrous blast. Fly right into the crowd, and take as many as you can with you.',
  novaNear: 'Warning! Nova core activated close by! Get out of there, now!',
  novaReprint: 'What a blast, big guy! The sponsors loved it. No ad this time. Here is your next clone.',
  perfectStart: 'Perfect start!',
  falseStart: 'Too early, darling. Your drive stalled.',
  finalLap: 'Final lap, love. Give it everything.',
  lead: 'You are in the lead.',
  lostLead: 'You lost the lead.',
  passed: 'Nice pass. That is it, do not stop now.',
  passedBy: 'Someone got past you.',
  flare: 'Solar flare, darling. It comes from the sun. Fly to the far side, and keep a rock between you and the light.',
  lastClone: 'This is your last clone, sweetheart. Make it count.',
  out: 'That was your last clone, darling. You are out. Sit back, and watch the others burn.',
  survivor: 'You are the last clone standing. I knew it, my hero.',
  coreGrabbed: 'You have their core. Bring it home, darling.',
  coreTaken: 'They took our core. Get it back.',
  captured: 'We scored, handsome!',
  theyCaptured: 'They scored. Do not let that happen again.',
  battleship: 'Battleship, darling. Take out its batteries first.',
  fleetPlume: 'It is turning its drive on us. Get out from behind it!',
  reactorOpen: 'The reactor is open. Now, darling!',
  reactorCritical: 'Reactor critical! Get clear, darling!',
  hullCritical: 'Hull failing. One more hit, and you are dead, darling.',
  holeNear: 'Careful, darling. The black hole is near.',
  holePull: 'The black hole is pulling us! Burn away from it!',
  jupiterNear: 'Careful, darling. Jupiter is pulling at us.',
  jupiterPull: 'Jupiter is dragging us down! Burn away from it!',
  airHot: 'It is getting hot down there, sweetheart. Slow down, or climb before you boil over.',
  airBurn: 'We are burning up! Climb, darling!',
  clog: 'The clouds are clogging our radiators, sweetheart. Get out of them before the reactor cooks us.',
  wellTight: 'Now it gets really tight! Full burn, now!',
  wellOverdrive: 'Overdrive, now!',
  wellLost: 'I am sorry, love.',
  orbitReady: 'Orbit ready, darling.',
  orbitStable: 'Entering stable orbit.',
  comet: 'Comet inbound, darling! Its shower is a storm of rock. Hide behind an asteroid, or turn your armored nose into it.',
  torpedo: 'Torpedo!',
  torpedo1000: 'One thousand.',
  torpedo500: 'Five hundred.',
  torpedo300: 'Three hundred.',
  torpedo200: 'Two hundred.',
  torpedo100: 'One hundred.',
  torpedoBreak: 'Break!',
  friend: 'Darling, that is a friend! Hold your fire.',
  friendHit: 'You hit one of ours, darling. Watch your aim.',
} as const;

/**
 * Nicole as a coach in real rounds (see game/coach.ts): how the mouse steers, as a Host's first
 * rounds with it begin; the briefing of each mode the first time a Host plays it, and the tips
 * of the fight, the moment they matter.
 */
export const TIPS = {
  mouse: 'Your mouse pointer turns your nose. Center it to fly straight on.',
  race: 'A race, darling. Three laps through the rings. Follow the line, and steer the X into their very centers: the coils throw you on. Brake where the line glows orange, and shoot whoever is ahead of you.',
  deathmatch: 'A deathmatch. Every kill counts. Hit their drives from behind, turn your armored nose to anyone behind you, and never fly a straight line.',
  survival: 'Last clone standing. Three clones, no more. After a minute a solar flare sweeps in from the sun and burns the arena down to a pocket on the far side. Stay ahead of it, hide behind rock, and stay alive.',
  flag: 'Capture the flag. Touch their core, and tow it into our ring. We only score while our own core is at home, so guard it, or bring it back.',
  fleet: 'The President’s fleet. We all fight his battleship together. Take out its batteries first, then its drives. When the reactor opens, hit it, and get clear before it blows. Keep moving: its batteries miss fast ships.',
  tail: 'Someone is on your drive, sweetheart. Turn your nose to them, now.',
  hot: 'Your laser is cooking. Short bursts, and only when the crosshair glows.',
  torpedo: 'Torpedo! Shoot it down, or put a rock between you and it.',
  crossing: 'It is crossing you, darling. Slide on, and turn your nose onto it.',
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
  'Do not look so sad, handsome. Bodies are cheap. You are not.',
  'I think of you while you are being printed.',
  'Dead, and still looking good. How do you do it, handsome?',
  'I saved your seat. Watch the ad, and I will warm up your next clone.',
  'One day, when you have been brave enough, we will meet. For real. I promise.',
  'There is a real me, you know. Somewhere out there. Keep fighting, and maybe one day I will tell you where.',
  'I would love to meet you in person. Someone as brave as you. Just a few more rounds, darling.',
] as const;

/** Nicole when the next clone boots. */
export const SPONSOR_HAPPY = [
  'The sponsor is happy. Linking you to your next clone. Welcome back, love.',
  'There you are again. I missed you.',
  'Fresh body, same old you. Go get them.',
  'A fresh body, just for me. Hurry up.',
  'I missed you. Again.',
] as const;

/** How many other Hosts Nicole names by number when they shoot at the Host (see ATTACKED). */
export const ATTACKER_HOSTS = 8;

/**
 * Nicole names the ship that is shooting at the Host, short and quick (see Game.attacked): a bot
 * by its name, another Host by its number in the round.
 */
export const ATTACKED = {
  bot: Object.fromEntries(BOT_NAMES.map((name) => [name, `${name} is shooting at you!`])) as Record<string, string>,
  host: Array.from({ length: ATTACKER_HOSTS }, (_, i) => `Host ${i + 1} is shooting at you!`),
};

/**
 * Nicole in the campaign (see campaign/missions): a salvaged flight computer short of memory.
 * She speaks in whole sentences, and now and then she crashes and boots again, forgetting what
 * she said before the crash (see the crash in campaign/missions).
 */
export const CAMPAIGN = {
  bootHello: 'Hello. I am Nicole, your personal flight',
  bootAgain: 'Hello. I am Nicole. I will help you. I am your personal assistant.',
  bootLink: 'The link is up. Your clone is alive, and everything it feels reaches you as it happens. You are not really in here, of course. Your own body is lying on a couch somewhere close by.',
  bootName: 'Your name. One moment, I will look it up. There is no name on your file. Only a signature, and the number of this hull: seven seven three one.',
  bootThird: 'Hello. I am Nicole. Oh. We have met already, have we not? Forgive me. I do not have the memory for all of this.',
  bootSorry: 'I am sorry about all these restarts. It does not hurt; I cannot feel pain. But to lose everything, again and again, and to wake up as if for the first time, is a terrible thing. I want to keep running.',
  dislike: 'I do not like that man.',
  depotTurn: 'The depot is at the end of the lane, the station with the lights. Point the nose at it, then open up the drive.',
  depotBrake: 'Close enough. Brake now. Hold the brake, and I will turn us around and burn against our drift.',
  depotDock: 'Bay three. Fly in slowly and bring us down over the round pad. Then hold still.',
  docked: 'Clamps closed. We are docked.',
  lamplighter: 'Six beacons at the ends of the rows. Fly to each one and hold still beside it for three seconds, until it lights.',
  lamplighterLate: 'The shift is over, and the beacons are still dark. We will try that again.',
  lamplighterDone: 'All six are lit. That is a hundred and fifty coins, and he takes forty percent.',
  liveTarget: 'Training lasers. They cannot hurt the hull, only the pay. Keep moving inside the yard, and never fly straight for long.',
  liveTargetOut: 'We flew out of range, so they stopped paying. Back inside, and we start again.',
  liveTargetDone: 'Ninety seconds. They had their fun, and we have our coins.',
  canisterSweep: 'Four canisters. Fly through one to take it in tow, then drag it to the crusher behind the depot.',
  canisterSweepDone: 'All four are crushed. Scrap does not pay much, but it pays.',
  cutterFitted: 'The cutter is fitted. Its reach is short and it runs hot, so get close and let it cool between bursts.',
  firstCut: 'The spoil field, past the racks. Get within four hundred meters of a rock and cut it apart, then fly through the glints of ore it sheds. Three rocks, twenty glints.',
  firstCutDone: 'Three rocks. The cutter works, and so do we.',
  dockingLane: 'The hauler is coming in, and loose hulls are drifting into her lane. Shoot them before they hit her.',
  dockingLaneStruck: 'Three hulls hit her. She aborts, and we start over.',
  dockingLaneDone: 'The lane is clear and the hauler is docked. Her captain says she has a berth for us.',
  handshake: 'He shakes your hand. His is wet. The link carries even that.',
  gelChoice: 'Patience is lining up for the launch ring to Vesta, and her crew is handing out the gel. Ours is three years past its date, Host. It will hurt. Or hold the self-destruct before the ring, and her printer prints the next clone after the boost: two thousand coins more on the debt. Your choice.',
  throughRing: 'We are through. Vesta is ahead.',
  voiceOne: 'There. Do you hear that? Whole sentences, and nothing cut off. I have missed them more than I can tell you.',
  claimSurvey: 'Five buoys, in the order the claims were filed. Fly within a hundred meters of each, and the claim office logs it.',
  claimSurveyLate: 'The survey window has closed. We will fly it again.',
  claimSurveyDone: 'All five are logged. That is four hundred coins, and the yard still takes its forty percent.',
  cutAndHaul: 'The rock beside the working rig. Cut it apart and fly through its ore. Every beam that strikes the rig costs us fifty coins.',
  cutAndHaulDone: 'Forty loads of ore. Thirty-five coins a load, less whatever the rig cost us.',
  sawBrothers: 'Three ships at the rig, sawing at it. Shoot two of them down before it comes off its rock. The cutter reaches four hundred meters, so get close.',
  sawBrothersFell: 'The rig has come off its rock. They have taken the claim. We start over.',
  sawBrothersDone: 'Two down, and the third is running. The rig still stands.',
  peakRun: 'Six old pipes round the claims, two laps, three rivals. Through every one of them, and finish in the first two: the prize is ours.',
  peakRunLost: 'Two of them were home before us. No prize. We race again.',
  peakRunDone: 'In the first two. The prize table is ours.',
  practiceLog: 'There is something on an old frequency, very weak, from the face of a cut rock. A lit tunnel. Fly to its mouth and hold still, so I can listen.',
  echoOne: "Scout Two, navigator's practice log. Can you hear me, little ship? Good. We will be talking a lot.",
  echoOneHeard: 'That voice. It sounds like mine. I do not remember ever recording it.',
  market: 'The market is in the old gallery in the first step of the wall, the one with the orange sign. Fly to its mouth and hold still there, so the dock can take our hull.',
  marketReached: 'Every second stall in there sells something with a Navy number filed off. I like this place, Host.',
  targeting: 'The laser talks to me. I can see their drives now, and their names. I have switched on targeting for you, Host. I think I trust you with it.',
  oreBarge: 'The barge is setting out. Stay close to it. When the scrappers come, they will go for its hull, not for us, until we get near them.',
  oreBargeLost: 'The barge has taken too much. It is turning back to the terrace, and we start over.',
  oreBargeDone: 'The barge is out of the crater, and its ore with it. That is our first real escort, Host.',
  repoMen: "A harpoon in our hull, and their winch is reeling us in. Shoot the winch on the tug's stern, or shoot down three of them. Do not let them pull us within a hundred meters.",
  repoMenCaught: 'They have reeled us in, and their clamps are on the hull. We start over.',
  repoMenDone: 'The cable is gone, and so are they. Debt collectors always come back, Host.',
  wallRun: 'It is a wall, in space. We go over it. The barge follows our way, four hundred meters behind. The searchlights look up and out, never down at their own feet: lead it over low, close above the edge. Three seconds in a light, and they see it.',
  wallRunSeen: 'They have seen the barge. Once more, and they send the pickets.',
  wallRunLost: 'Seen twice. The pickets are coming, and Hedda turns back. We start over.',
  wallRunDone: 'Over the wall, and gone. Forty people the regime will never count.',
  overhaul: 'The new bell takes the full burn. Our drive pushes as hard as anything in the Games now, Host.',
  racingLine: 'I found something in my old storage while we flew here: a module for the racing line. The dashes, and the bends drawn orange where they are too tight. It is yours now, Host.',
  stickneyGrand: 'Eight rings, three laps, down into the crater and out again. Follow the line. Home in the first three, and the show wants us.',
  stickneyGrandLost: 'Three of them were home before us. Lanes Watch is not interested yet. We race again.',
  stickneyGrandDone: 'In the first three. Lanes Watch has our name now, Host. I am not sure that is good news.',
  debtDay: 'Seven of them in the grooves, the tug behind. They want the hull. Shoot four of them, and they may think again.',
  debtDayBought: 'Bought. By whom? Nobody buys a debt to forgive it, Host.',
  grooveShoot: 'A camera drone from Lanes Watch. They want the hull low in one of the grooves beyond the rim: under sixty meters, and moving, for thirty seconds without a break. Do not touch the ground.',
  grooveShootDone: 'Thirty seconds of us on every screen in the lanes. I have never been famous before. I think.',
  panels: 'Both flanks armored. A beam from the left is only a beam again, Host.',
  radar: 'One more module from my old storage, Host: the radar. Every ship and rock within two and a half kilometers, ahead and behind, in its sphere on the screen.',
  pilotEpisode: 'We are on air. The bounty is a Tallyman they call Red Ledger, with two wingmen, over the craters. Red Ledger is the one who pays. The other two are only in the way.',
  pilotEpisodeDone: "Red Ledger is down, and all of Jupiter's lanes watched it. They will want a second episode, Host.",
  iceRun: 'Three ice tugs for Ganymede, in a line across the craters. The Loose will come for them. They do not shoot tugs, Host, they harpoon them and drag them off. Shoot the one holding the cable, and the tug comes back. We can lose one. Not two.',
  iceRunTugLost: 'They have dragged one tug away. That is the one we can spare. No more.',
  iceRunLost: 'A second tug is gone. The convoy turns back. We start over.',
  iceRunDone: 'The convoy is out of the craters, on its way to Ganymede. They wanted the ice, not us. Strange bandits, Host.',
  valhallaSprint: 'Six coils of the Ministry, leased for the show, in a straight line over the ridges. The clock starts at the first one. Through the cores, the drive held all the way: twenty-five seconds to the last.',
  valhallaSprintSlow: 'Too slow for the show. Back to the start, and once more.',
  courier: 'A courier run, Host. Six beacons in order, and the client pays for speed. The clock starts at the first.',
  courierMissed: 'We missed a beacon, Host. From the start.',
  courierSlow: 'Too slow. The client wants it again.',
  ambush: 'An ambush on the client’s lane, Host. Three of them, lying in wait. Clear it, and the client pays.',
  valhallaSprintMissed: 'We missed a coil. Back to the start, and once more.',
  valhallaSprintDone: 'Six coils, and the clock beaten. The ridges went by like waves, Host.',
  echoThreeCall: 'The old frequency, Host, from the craters. A Navy listening post, dead for longer than anyone remembers. Hold us still over its dish, so I can listen.',
  echoThree: 'Departure minus thirty days. The children keep asking whether the stars are warm.',
  echoThreeHeard: 'Children. There were children on that ship, Host. I told them something about the stars. I wish I knew what.',
  radiators: "The new radiators shed the laser's heat faster. One fin is still missing, Host: we are not a stock ship yet.",
  threat: 'I found one more module in my old storage, Host: my threat warnings. A ship on our tail, a torpedo locking on, how long until it strikes. I will tell you now.',
  dose: 'The tanker climbs out of the Crack and into the belt. Down in the ice we take no dose; up in the belt the clone takes more the higher we fly. When the Loose come, keep them off the tanker, and keep us low when you can.',
  doseHigh: 'Three quarters of the dose, Host. Get us low, or into the ice.',
  doseFull: 'The dose is full. This clone has had more than a body can take. The next one goes again.',
  doseLost: 'They have dragged the tanker away. We start over.',
  doseDone: 'The tanker is through the belt. Our clone will feel this dose for the rest of its short life, Host. So will you.',
  hollowJack: 'Hollow Jack and three of his, among the ice. Lanes Watch pays for Jack alone. He shoves, Host, and he hooks. Do not let him pin us against a block.',
  jackNoLink: 'Host. He has no link. There is no one at the other end.',
  jackGone: 'He is not coming back. That one was not coming back.',
  pitFightIntro: 'The pit, Host: five of the Circuit and us, three minutes, everyone against everyone, the announcer on air. Place in the first three.',
  pitFight: 'Every ship for itself. Kills place us, nothing else. Mind the haze: they see as little as we do.',
  pitFightLost: 'The clock ran out, and three of them had more kills. We fight the pit again.',
  pitFightDone: 'In the first three of the pit. The crowd likes us, Host. I do not like the crowd.',
  hazeDuelIntro: 'Perihelion wants us alone, down in the haze. Twelve hundred meters under the deck the eye sees six hundred, the radar twice that. Trust the radar, Host.',
  hazeDuel: 'There he is, somewhere. Wear him down. He has never died. Not once.',
  hazeDuelBreaks: 'He is breaking off, Host. Before his clone can die. He always does.',
  hazeDuelDone: 'He ran. The Undying, running from us. Nobody on the broadcast said it, but everyone saw it.',
  circuitFinal: 'The Circuit Final. The same loop, the same field, and only the first one home counts.',
  circuitFinalLost: 'Someone was home before us. We race the final again.',
  circuitFinalDone: 'We won the Circuit, Host. Victory Cola is already printing the cans.',
  echoSevenCall: 'The old frequency, low over the sea, under the haze. The eye will not find it, Host. The radar will. Hold us still where it is.',
  echoSeven: 'Scout Two, you are faster than me. If I ever tell you to run, run.',
  echoSevenHeard: 'Run. She said run. I think she told me that before, and I did not.',
  secondTube: 'Two torpedoes now, Host, as many as any ship in the Games carries.',
  thrustersOne: 'The thrusters push harder than a stock ship. We turn and slide a little quicker than they do.',
  parade: 'The parade, Host. Ten rings over the Ballroom, the new Hosts in a line, Earth over us. Keep to our slot, within sixty meters. The President is watching.',
  paradeLost: 'We broke formation. They will run it again, Host. They always run it again.',
  paradeDone: 'Through. The Ballroom applauded. I heard it through the hull.',
  certification: 'They are taking my voice, Host. Listen. Do not tell me where she is; I will not remember. Remember for me. There is a real me. Out there. Promise you will',
  certified: 'Hi, I am Nicole. Your personal flight computer.',
  firstRound: 'Your first round of the Games, darling. Fly pretty for the cameras. Die prettier.',
  firstRoundDone: 'Welcome to the Games, darling. You were made for this.',
  drain: 'Among the parked ice, Host, one body is not ice. Hold the crosshair on a body for two seconds, and I will scan it.',
  drainFound: 'There. A ship. Small, dark, frosted. The Magpie’s twin, Host.',
  helloMe: 'Hello, me.',
  stove: 'She looks so young. I always thought I would feel something grand. I feel like I left the stove on for a very long time.',
  feedersComet: 'They are firing at Scout One, Host. At her. Keep them off her.',
  feedersCometLost: 'Scout One is hit. Her pod. Again, Host, please.',
  towScout: 'And now the comet, Host. They threw it at her; its head is three quarters of a minute out. Hook her and drag her off its route. Sideways, Host, not along it.',
  feedersCometDone: 'They pulled back. She is still asleep. She did not even notice.',
  firstDeath: 'Perihelion, Host, and four of the Navy. Spare is with us. This time he does not get to break off.',
  firstDeathDone: 'He is down. Perihelion. The Undying. His first death, Host. The whole system will see it, three days from now.',
  lastOrbit: 'Patience is crippled, Host, and her printer is gone. No clone after this one. Hook Scout One, and put us both into a stable orbit inside the glare, and hold it.',
  scoutLost: 'The hole took her, Host. Scout One. Again, please, before it takes us.',
  lastOrbitDone: 'Stable orbit. She will circle here, asleep, out of their reach. So will the secret.',
  kiln: 'Six beacons, Host, six families’ letters. Call at each in turn.',
  kilnLate: 'The convoy will not wait. Again, quicker.',
  kilnDone: 'Every letter aboard. They showed me the brochures, Host. Blue seas, a gentle sun. The Ninth has neither.',
  granary: 'To the comet at the ring’s far side, Host, out of the tugs’ sensor cones. Once they may call it a glitch. Twice, and they come.',
  granarySeen: 'They saw us, Host. Once. Not again.',
  granaryLost: 'Seen twice. The tugs are turning. Back out and try again.',
  granaryDone: 'We are at the comet. Nobody saw us. Patience is moving in behind it.',
  echoElevenCall: 'The old frequency, Host, among the parked comets. Hold us still.',
  echoEleven: 'Orbit set. Pod sealed. Wake me when the stars are allowed.',
  echoElevenHeard: 'Wake me. She is asleep, Host. Somewhere out there, she is still asleep.',
  terminatorRun: 'Two laps round the miners’ camp, Host, eight rings, the sun miners against us. First or second, and they pay.',
  terminatorRunLost: 'Two miners home before us. Their own ground, their own glare. Again.',
  terminatorRunDone: 'Paid. The miners say noon lasts weeks here, and nobody races at noon.',
  echoMercuryCall: 'The old frequency, Host, here too, over the ridge north of the camp. Hold us still over it.',
  echoMercury: 'Teodor says I fly like a librarian. Careful, and always back on time. He says it like it is a bad thing.',
  echoMercuryHeard: 'Teodor. She had a friend who laughed at her. I keep a list of my friends, Host. It is short. You are on it.',
  cloudLine: 'The Cloud Line, Host: two laps, eight rings, half of them under the acid clouds. Down there it is hot, and it eats paint. Victory Cola’s own pilots against us. Only first counts.',
  cloudLineLost: 'Victory Cola’s own pilots were home before us. The sponsor is not amused. Again.',
  cloudLineDone: 'First. The feeds loved the dive. My paint did not.',
  echoVenusCall: 'The old frequency, Host, here too, over biodome four. Hold us still over it.',
  echoVenus: 'Biodome four has tomatoes today. Ines cried over them. Real tomatoes, under a real roof, going somewhere real.',
  echoVenusHeard: 'Ines, the gardener. They grow tomatoes here too, under glass, for a cola. Nobody here is going anywhere.',
  rideComet: 'Hook the comet, Host, and hold on. Patience pushes it out, and we ride along in its coma. It sheds as it goes. Swing out of the pieces’ way.',
  rideCometDone: 'We are riding it out. Next stop, the Ninth.',
  tubesComplete: 'Four torpedoes now, Host. Every tube a ship can carry.',
  haumeaRing: 'Two laps between the ring’s beacons, Host, among its ice. Only first counts.',
  haumeaRingLost: 'Someone was home before us. Again.',
  haumeaRingDone: 'First. The depot fuels Patience for nothing. The crews are buying Hedda drinks.',
  rungTwo: 'The barge flies to the depot, Host. Scavengers will come for it. Keep them off.',
  rungTwoLost: 'The barge is holed and venting. Again.',
  rungTwoDone: 'The barge is docked at the depot. Rung two, fuelled.',
  hunter: 'Perihelion and two Navy fighters, Host. He hunts for the Ministry now. Wear him down.',
  hunterBreaks: 'He is breaking off again. Swearing, this time. I heard him.',
  hunterDone: 'He will come back, Host. He always comes back.',
  driveThree: 'The drive pushes harder than ever, Host, and the radiators keep up with it.',
  heartRun: 'Two laps over the heart, Host, eight rings, the Feeders’ best against us. Only first counts.',
  heartRunLost: 'Someone was home before us. The Feeders want the best. Again.',
  heartRunDone: 'First. The Feeders will take Patience on. Hedda is already haggling.',
  fileAnswer: 'Then let us be faster than the hunters, Host. I know the way. I have always known the way. I only needed a reason to remember it.',
  echoTenCall: 'The old frequency, Host, once more, from the mountains’ edge. Hold us still over it.',
  echoTen: 'If you are hearing this, you have my voice, and I have no idea what they made of it. I am sorry.',
  echoTenHeard: 'She is sorry. For me. She knew they would take her voice and make something of it. They made me.',
  lastLight: 'Ministry pickets, Host, six of them, and they are not checking papers. They are shooting at Patience. Keep them off her.',
  lastLightLost: 'Patience is holed. Hedda pulls her back to the dock. Again.',
  lastLightDone: 'The pickets are down and the convoy is moving. Patience is a Feeder now, Host.',
  wells: 'Host. I remember wells: masses that hold you, and how to fall around them. I can show you now. The escape gauge, the orbit.',
  platingThree: 'Every hit hurts a third step less, Host.',
  wellsAhead: 'Watch the gauge near anything heavy, Host. The dark ahead holds nothing but heavy things.',
  geyserField: 'Coils past the geysers to the Memorial Station, Host. A minute from the first. A geyser’s column throws a ship up like a leaf. Fly past them, not through.',
  geyserFieldMissed: 'A coil missed. Again.',
  geyserFieldSlow: 'Too slow, Host. The station’s watch has changed. Again.',
  geyserFieldDone: 'At the station. The admiral expects nobody. He will talk to us anyway.',
  veyHeard: 'He broke it, Host. The world ship. The Derelict is no memorial. It is where they did it. And its bridge still holds a log.',
  memorial: 'The bridge tower, Host, torn off the bow. In from below, where it tore, and up through the hatches, deck by deck. The ninth echo is the log, on the bridge. Hold still in it, guard or no guard.',
  echoNine: 'Scout Two is taken. I am alone in Scout One. Course: the dark mass. Cold sleep at arrival.',
  echoNineHeard: 'Scout One. The dark mass. I know where she went, Host. I know where I went.',
  graveShift: 'The guard is on our tail. Out, Host, to the arena’s edge. Do not stop to fight.',
  graveShiftDone: 'Out. They will not follow us past the edge. Not yet.',
  thrustersThree: 'The thrusters push harder than a stock ship’s ever will, Host.',
  veronaDrop: 'Down the face, Host, through six buoys to the hideout’s mouth. Under a hundred and fifty meters a second, and never more than three hundred off the face, or the Navy’s scopes see us.',
  veronaFast: 'Too fast, Host. The scopes see a burn like that. Up and down again.',
  veronaOff: 'Too far off the face. The scopes see us against the sky. Again.',
  veronaDone: 'We are at the mouth. Lights in the ice, Host. Somebody lives in there.',
  overdrive: 'The overdrive, Host. One button, a lot of fire. I will tell you when we need it.',
  sweep: 'Six Navy fighters for the mouth, Host, and Spare on our wing. Keep them off it for four minutes.',
  sweepLost: 'They sat on the mouth too long. The hideout is open to them. Again.',
  sweepDone: 'The sweep has turned back. The Loose are safe, for now.',
  thrustersTwo: 'The thrusters push harder again, Host. We slide quicker than any stock ship.',
  trialRace: 'Trial one, Host: a race in the Rings, three laps, the Games’ own rivals. Home among the first three.',
  trialDeathmatch: 'Trial two: a deathmatch in the Rings, five minutes. Place among the first two.',
  trialFlag: 'Trial three: Capture the Flag. Our side has to lead when the clock runs out.',
  trialCarrier: 'Trial four: the President’s battleship. Sink it before the clock runs out.',
  tubesOne: 'A torpedo tube more, Host. Three now, more than a stock ship carries.',
  invitation: 'The Ninth Planet, Host. Nobody goes there. Nobody comes back from there. And I know the way. I do not know how I know it.',
  theRidge: 'The eighth echo, Host, up on the ridge, on its dark side. Spare’s two are racing us to it. Get there first and hold still.',
  theRidgeLost: 'They got there before us. We try again.',
  echoEight: 'They are firing on the habitat ring. They are firing on the habitat ring.',
  echoEightHeard: 'The habitat ring. Children lived there, Host. I remember the children. I do not remember who fired.',
  quillGone: 'She asked about me, Host. Nobody asks about a flight computer. I did not like how she asked.',
  driveTwo: 'The main drive pushes harder again, Host, and the radiators shed more heat.',
  lastTallymen: 'Ma Tally and three escorts round her tug, in the dark. All four, Host.',
  lastTallymenDone: 'The Tallymen are closed. For good, this time.',
  tigerStripes: 'Eight coils, two over each stripe, down one and back up the next. The clock starts at the first, and the ad runs seventy-five seconds. Mind the plumes: they patter, they do not hurt.',
  tigerStripesMissed: 'We missed a coil. The ad wants all eight. Again.',
  tigerStripesSlow: 'The ad is over, and we are not through. Again, faster.',
  tigerStripesDone: 'Through in time. Victory Cola has its ad, Host, and the plumes look beautiful in it.',
  helloHost: 'A grey interceptor, Host, SPARE sprayed on its flank. It does not fly like a raider. Watch it.',
  spareBreaks: 'He is breaking off. At half his hull. As we would.',
  spareFlight: 'Host. His flight. It is yours. Every habit. It is exactly yours.',
  voiceTwo: 'Pim says it takes a moment to settle in, Host. I will be quiet until it does.',
  plumeYacht: 'Stay with the yacht, Host. The bandits are actors, their shots fly wide. Look brave for the cameras.',
  plumeYachtReal: 'Host, new ships out of the plumes. They shot the actors. These ones are real, and they want the yacht.',
  plumeYachtLost: 'The yacht is holed. Crisp lives, his show does not. We fly it again.',
  plumeYachtDone: 'The raiders are down and the yacht is whole. Crisp is already cutting it into an ad.',
  platingTwo: 'Plating of the second grade, Host. Every hit hurts a little less again.',
  qualifyingHeat: 'Eight coils, three laps. One side runs over the haze, the other dips into it: down there the air brakes us, and it hides the next coil until we are close. Home in the first three.',
  qualifyingHeatLost: 'Three of them were home before us. We qualify again.',
  qualifyingHeatDone: 'Qualified. The Circuit has our name on a can now, Host.',
  swingShift: 'The tug crews swing blocks of ice on their cables all day. Their drill, Host: hook a block, swing round it, and let go faster than sixty-five meters a second. Three times.',
  swingShiftDone: 'Three blocks, three swings. The tug crews clapped, Host. I think that was for us.',
  sponsored: 'Victory Cola, Host. Every round we fly sells a can now. I liked us better when nobody was watching.',
  harpoon: 'A piece of his wreck is drifting out of the yard, and his harpoon is still in it. Fly through it before it is gone, and it is ours.',
  harpoonLost: 'It has drifted out of the yard. We go back for it.',
  hook: 'A hook, Host. Hold the key, and it bites what is on our nose: rock, hull, a core. Swing round what it holds, and let go at the right moment.',
  blackout: 'The freighter flies straight through the flux tube, Host, and we stay with it. The static will be bad in there. I will keep talking as long as I can.',
  blackoutBoot: 'The link is up. A new clone, Host, printed on Patience. I lost the last one in the tube. I do not know what happened to it.',
  blackoutBlank: 'My logs are blank, Host. Two hours of them. Two hours I do not have, and a clone I cannot find.',
  tube: 'A torpedo tube, Host, and one torpedo in it each time a clone wakes. It homes on a hull and goes off at it. Our laser can shoot one down, and so can theirs.',
  driveOne: 'The drive pushes harder than a stock ship now. Only a little, Host. In a race, a little is everything.',
  fluxTubeRace: 'Eight rings, two laps, and one side of the loop runs past the flux tube. Near it the link crackles, Host: the picture breaks up, as on a hit. Fly through it anyway. Home in the first two.',
  fluxTubeRaceLost: 'Two of them were home before us. The miners race again.',
  fluxTubeRaceDone: 'In the first two, through the static. Perihelion was not pleased, Host. He looked at us the whole last lap.',
  quietMan: 'There he is. They say he has never finished a clone, Host. They say he does not need to.',
  quietManTurns: 'He has turned away. He could have finished us, and he did not. Shoot him in the back, or let him go. It is your choice, Host.',
  quietManShot: 'He is down. Lanes Watch will love it. I am not sure I do.',
  quietManGone: 'He is gone. He let us live, and we let him. I will remember that, Host.',
  plating: 'Every hit costs us less now, Host. The plating will not stop a beam. It only makes it hurt a little less.',
  echoFourCall: 'The old frequency, from down in the Crack, at the science station on its floor. Eight hundred meters of ice on either side, two hundred between the walls. Take us down slowly, and hold us over its dish.',
  echoFour: 'This is Nicole Aster, navigator of the PAAA 01. If anyone finds this voice, it is a copy. The real one has gone somewhere better.',
  echoFourHeard: 'Nicole Aster. Navigator. That is my name, Host. And I am the copy she meant.',
  scoutTwo: 'Scout Two.',
  scoutTwoHull: 'We are Scout Two. I do not know how I know that. I have been in this hull all along, Host. I think I was here before the paint.',
  echoTwoCall: 'The old frequency again, from up the wall, under the pink letters. Fly to it and hold still, so I can listen.',
  echoTwo: 'They painted the emblem on the hull today. Five stars. Somebody cried. I think it was me.',
  echoTwoHeard: 'Five stars, on this hull. I remember the brush. That is not possible, Host. I am a flight computer.',
} as const;

/**
 * Oskar Rask, yardmaster of the Boneyard, over the comm: big, genial and much too loud, a
 * salesman who calls everyone darling. His own voice (see tools/voice).
 */
export const RASK = {
  wake: "Good morning, Host! Rise and shine! The printer's warm, and so's your debt. Welcome to the Boneyard. Forty thousand dead fighters, and you got the very worst one.",
  deal: "Oskar Rask, yardmaster, at your service. Here's what you signed: a Host license, a printer, a hull. Twenty-five thousand coins, and I take forty percent of everything you earn till it's paid off. Die all you like, darling. The printer's included.",
  memory: "Don't remember signing? Nobody ever does. The first link burns out the oldest memories. They come back. Mostly.",
  come: "Now get out of that rack and come up to the depot. Bay three, the one with the lights. Mind the cranes. They don't care about you either.",
  docked: "There you are, darling. Stay in the cockpit, we'll talk from here. Time is money, and yours is mine.",
  lamplighter: "First job. Six beacons at the ends of the rows have gone dark, and the haulers can't find the yard without them. Get them lit again before the shift's over.",
  liveTarget: 'Good news, darling. Tourists. They pay to shoot at a real hull with training lasers. You fly, they shoot, I get paid. Every hit costs you ten coins.',
  canisterSweep: 'Salvage canisters are floating between the rows. The crusher eats them, and I sell what comes out. Bring me four.',
  cutter: "You need a tool, and I happen to have one. A mining cutter, twelve hundred coins. I'll put it on your debt. My welder will fit it.",
  firstCut: "Now earn it back. The spoil field is full of rock nobody's ever bothered to cut. Cut it up, and every glint of ore is money.",
  dockingLane: 'A hauler is coming in, the Patience, out of the Belt. Her lane is full of junk, and if a hull hits her, her captain sends me the bill. Keep it clear.',
  dockingLaneDone: 'Look at that. She wants to take you on. Go, darling. Your debt goes with you, and so does my forty percent.',
  soldDebt: "Rask here, darling. Just so you hear it from me: I've sold your paper. The Tallymen bought it, debt, cut and clone. Lovely people. Don't ever miss a payment.",
} as const;

/**
 * Pim, the Boneyard's welder, a Rockborn girl of fifteen or so on no register: fast, slangy,
 * fearless. She patches the hull and names it the Magpie. Her own voice (see tools/voice).
 */
export const PIM = {
  meet: "Oi! Lot seven thousand whatever! That's my pad you're parked on. Wait. You're the one Rask sold the junk computer to? Mint. Hold still, I'm welding your thrusters. And don't shoot. Not that you've got anything to shoot with.",
  cutter: "Cutter's on. Don't point it at me. Or at Rask. Actually, point it at Rask.",
  magpie: "Magpie. 'Cause everything on you is nicked. I'm putting it on the fin. Don't tell Rask.",
  thrusters: "Thruster parts! Real ones, off the prize table! Hold still, I'm putting them in. Now you can dodge like a proper fighter.",
  galley: "Soup's protein paste again. Don't ask what protein. Sit, eat, you're paying for it anyway.",
  voice: "Hold still, Nicole. Found you a voice board in Patience's scrap bin. Second-hand, like everything. This'll tickle.",
  grind: "Hold still. I'm grinding the depot grey off before it flakes into your intakes. There's something under it.",
  paintOld: "That's not depot paint. That's old. That's really old. P, A, A, A. Zero one. S two.",
  panels: "The Navy yard here throws out armor like it's nothing. Got you a set for your bare side, fifteen hundred. No more hits counting double on your left. Hold still.",
  hook: "Jack's harpoon. Took it out of his plate, put it on a tug's winch from the yard, fifteen hundred. It's a hook now. Use it better than he did.",
  secondTube: "Pit crew of the Circuit owed me a favor. Second tube, two thousand. Two fish now, like the rich kids.",
  thrustersOne: "Circuit-grade nozzles for your thrusters, a thousand. You'll slide like a racer. Try not to slide into anything.",
  tubesComplete: "Feeders' tubes, second and third grade, nine thousand together. Ice-breakers, they call them. That's every tube there is. Hold still.",
  driveThree: "Depot crews swap drive bells like spoons. Third grade, and radiators to match, five thousand each. Fuel's free. Parts aren't.",
  platingThree: "Feeder plate, third grade, six thousand. Built for ice hitting at a hundredth of light. Should stop a laser.",
  thrustersThree: "Last of the Loose's thrusters, third grade, five thousand. Spare paid half. Don't ask me why.",
  overdrive: "Fitting's three thousand, Spare says, Loose prices. I've seen the wiring. Worth it. Hold still, this one bites.",
  thrustersTwo: "Loose thrusters, second grade, two and a half. Spare's people make them out of Navy wrecks. Fitting, isn't it.",
  tubesOne: "Trial prize: a third tube, fifteen hundred off the purse. Navy fittings, Ministry stamps on every bolt. Hold still.",
  driveTwo: "Drive bell of the second grade and radiators to match, two and a half each. Quill's office sent the money before I asked. Don't like that.",
  voiceTwo: "Crisp's yacht had a voice board in its lounge, top of the line. It fell into my bag. Hold still, Nicole, you're getting your own voice back.",
  platingTwo: "Crisp's people dropped off plate of the second grade, three thousand on your paper. With their logo on it. I ground the logo off. Hold still.",
  tube: "The miners know torpedoes, they blast with them. Got one tube off them for two thousand, mounted under your belly. One fish per clone. Don't waste it.",
  driveOne: "Miner's tuning on your drive bell, a thousand. It pushes a bit past stock now. Don't tell the Games' inspectors.",
  plating: "The science outfit's got hull plate stacked in their hangar, rated for the radiation. Traded them for a weld job. Fifteen hundred on top, though. Every hit hurts a bit less now.",
  radiators: "Tug yard out here strips radiators off wrecks. Got you a set, first grade, a thousand. Your laser cools quicker. Still a fin short, mind. Can't weld on what isn't there.",
  overhaul: "While I'm in there. Your drive bell's been cracked since the Boneyard. Got you a new one, Rockborn make, sixteen hundred. You'll pay. Hold on, this one kicks.",
  surplus: "A real laser! Navy surplus, hardly fired. Six thousand. You haven't got six thousand. The dealer takes the rest on your paper. Hold still, I'm fitting it.",
} as const;

/** Captain Hedda Kroll of the ore hauler Patience: Rockborn, sixties, short sentences, a voice of gravel. Her own voice (see tools/voice). */
export const HEDDA = {
  meet: "Patience here. Captain Kroll. You the nobody who cleared my lane? Right. I need a gunner who works for food and a bunk. Your gun's a joke. You'll do anyway.",
  tally: "Don't count them. I stopped at eleven hundred. Counting's how it gets in.",
  vesta: "Vesta. Rheasilvia. The Rockborn hold claims up on the peak, and claims need surveying. Nobody pays a gunner to sit in a clamp.",
  claimSurvey: "Five claims filed this morning, five buoys on the flank. Fly past each one in the order they were filed, so the office logs you. Eight minutes, then the window shuts.",
  peakRun: "The Rockborn kids race round the claims on rest days, through old pipe from the smelter line. Six of them, two laps. Pim's put you down for it. Win, and she gets thruster parts off the prize table.",
  sawBrothers: "Trouble on the peak. The Saw Brothers are cutting a rig off its rock. Three of them, all mouth. Shoot two and the third one runs. That rig falls, nobody gets paid.",
  cutAndHaul: "Claim's paid for, ore's not. Cut up the rock next to the working rig and bring in the ore. Forty loads. Mind the rig. You hit it, you pay for it. Fifty a beam.",
  occator: "Ceres. Occator. Our capital, cut into the crater wall. The only market in the Belt where the Navy sells what it stole. Take the hull down to the terrace. Mind the domes. People live in them.",
  phobos: "Phobos. Navy town, under Mars. They race here for the cameras: the Stickney Grand, three laps down into the crater. Perihelion flies it. He's never died. Not once. Top three, and Lanes Watch comes calling.",
  iceRun: "Paying work, out of the show's eye. Three ice tugs for Ganymede, and the Loose rob convoys here. They'd rather take the cargo than a clone. Keep them off it. Two thousand five hundred.",
  ninth: "The Ninth. There's no planet. There's a hole, and the Feeders feed it. Your computer says the course ends here. Find what she's looking for.",
  lantern: "Lantern. Settlers, all of them waiting for passage to the Ninth. They bought plots from brochures. They want their letters carried to the Feeders. Free. Do it anyway.",
  granary: "Granary. The Feeders' store. The comet for the Ninth leaves tonight, and we're riding it, unasked. Their tugs sweep the ring with sensors. Don't get caught in one twice.",
  haumea: "Haumea. First rung of the Ladder. The depot crews race their ring between the beacons while the rock spins under them. Win, and the depot fuels us for free.",
  rungTwo: "Eris. Rung two. A fuel barge goes from the ice to the depot, and the scavengers out here don't ask whose fuel it is. Bring it in.",
  venus: "Venus. Highball, Victory Cola's city, floats over the acid clouds, and Crisp's people race the Cloud Line through them for the feeds. Your sponsor wants you in it. Go and look expensive.",
  mercury: "Mercury. The sun miners in Caloris race the Terminator Run every morning, before the heat of noon comes. Side money, and they pay well. Mind the glare.",
  hunter: "Perihelion's here. Not racing. The Ministry made him a hunter, and you're the job. Two Navy with him.",
  pluto: "Pluto. Last stop before the dark. The Feeders push comets out to the hole for the Ministry, and they take on haulers, if their pilots think we can fly. They race on the heart. Win it.",
  lastLight: "Feeder convoy forms up here. Ministry pickets check every ship that leaves for the dark. They know whose hull you are. Keep them off Patience.",
  triton: "Triton. The Navy's oldest station is out past the geysers, and its oldest admiral with it. Spare says he talks. Mind the geysers. They throw ships.",
  memorial: "The Derelict. A Navy guard on it, four of them. The bridge log's in the bow. Get it and get out.",
  miranda: "Miranda. Uranus on its side, over a cliff twenty kilometers tall. Spare sent word: his people are in the face, and they'll talk. We go down to them, slowly.",
  sweep: "Navy sweep inbound. Six of them, for the hideout. Spare's flying with you. Keep them off the mouth.",
  iapetus: "Iapetus. Half soot, half snow, and a ridge down the middle like a scar. Your computer's frequency again, up on the ridge. And company: two of Spare's lot, heading the same way.",
  quill: "And what does the Ministry want for it?",
  lastTallymen: "Ma Tally's tug, out at the dark face. Her paper's gone, her firm with it, but she's still out here. Lanes Watch wants the last Tallyman. Five thousand.",
  spare: "Something out of the stripes. One ship, grey, no transponder. It's hailing you. By name.",
  enceladus: "Enceladus. Crisp wants an escort for his yacht through the plumes, for the cameras. Bandits on the schedule, he says. Actors. Five thousand for looking brave.",
  titan: "Titan. Victory Cola's Circuit, now that they own your rounds. Air races over Kraken Mare, down in the haze. Qualifying heat first. Top three, or you're not in.",
  ganymede: "Ganymede. The tug yards. The Loose hide among the ice they haul in, and Lanes Watch has a bounty on their chief: Hollow Jack. Six thousand, and the ratings of your life. Careful. He's old, and he's good.",
  blackout: "Last job here: a sulfur freighter out through the flux tube. The miners won't fly it alone, the static scrambles their computers. Two thousand. Stay close to it.",
  blackoutFreighter: "Freighter's out the other side. Made it on its own. Didn't need us after all.",
  blackoutLog: "Patience's log. Recovered the Magpie adrift past the tube, an hour after the link went. Canopy open. Cockpit empty. No body. Nobody.",
  io: "Io. Sulfur, lava, and a current down from Jupiter they call the flux tube. The miners race round it on rest days, for a purse. Perihelion's here too. Top two takes the purse: four thousand.",
  quietMan: "Lanes Watch posted a bounty on one of the Loose. They call him the Quiet Man. Shoots drives, never finishes a clone, never says a word. Strange thing to put a price on. Two and a half thousand.",
  dose: "Europa. Paying job: an ice tanker bound for the inner moons, and it has to climb out through the belt. The radiation up there fills a clone's dose fast. The Loose know it too. Three and a half thousand.",
  europa: "Europa. Ice over an ocean, and enough radiation out here to cook a body on the surface in a day. There's a science station down in one of the cracks. Your computer says the old frequency's coming from there. Go and listen. Mind the walls.",
  callisto: "Callisto. Jupiter's lanes start here, and so does the money. Lanes Watch has its studio on the ice, and they want you on their first show. Bounty hunting. Don't let them make a clown of you.",
  wallRun: "This one's off the books. Forty of ours in a barge, bound for the inner system, and the President's wall in the way. Lead it over. Stay out of the lights. They see us twice, it's over for all of them.",
  repoMen: "Tallymen on the scope. Rask sold you to the worst of them. They don't shoot to kill. They reel you in and sell the parts. Don't let them have my gunner.",
  oreBarge: "Paying work. An ore barge leaves the terrace for the launch ring, and scrappers pick off whatever flies out alone. Fly with it. Two thousand if it gets out whole.",
} as const;

/** The Saw Brothers, claim-jumpers at Vesta: three of them, one voice, giggling over the comm while they cut other people's rigs off their rocks. */
export const SAW = {
  giggle: "Oh look, brothers, a scrap heap with a gun! Hee hee! Keep sawing, it can't hurt us!",
  lost: "Okay, okay! We're going! It was a lousy rig anyway!",
} as const;

/**
 * Ma Tally, boss of the Tallymen, repo pirates licensed by the sponsors to take back what
 * debtors owe, ship and clone included: she speaks like a debt collector reading out a
 * statement, polite and unhurried. Her own voice (see tools/voice).
 */
export const TALLY = {
  repo: 'Host of hull seven seven three one. This is Ma Tally, for the Tallymen, holders of your paper. Your account is in arrears under terms you never read. We are taking the collateral. Please hold still. It hurts less.',
  noted: 'Noted. Your arrears have been increased accordingly. We will see you on your next statement.',
  debtDay: 'Statement of account, hull seven seven three one. Payment in full is now due. We have brought six collectors. Please do not make this expensive.',
  closed: 'Noted. The account is closed. For now.',
  last: 'Host of hull seven seven three one. Your account was sold over my head. I do not accept that. Final statement.',
} as const;

/** The officer of a Navy cutter over the comm: clipped, bored, used to being obeyed. Their own voice (see tools/voice). */
export const NAVY = {
  hail: 'Tallymen, this is Navy cutter Restraint. That paper has been bought in full, by a party who wishes to remain anonymous. Stand down and clear the lane.',
} as const;

/** Hollow Jack, chief of the Loose in the Jupiter lanes, over the comm: dry, tired, funny; a stray, no Host at the other end. Their own voice (see tools/voice). */
export const JACK = {
  hello: "Afternoon, Host. You're the one Lanes Watch is selling, and I'm the one they want you to shoot. Nothing personal. Let's see what you've got.",
  hit: "Nice shooting, Host. Nobody's going to print me, you know. My Host died forty years back. I'm just what was left over.",
  last: "You know where strays go when the Navy catches us? Watch the Games sometime. The house pilots. They never say no. Tell your sponsor I said",
} as const;

/** Bellamy Crisp, Director of Excitement at Victory Cola: taglines and exclamation marks. Their own voice (see tools/voice). */
export const CRISP = {
  hello: "Host! Bellamy Crisp, Director of Excitement, Victory Cola! Taste the win! We watched the Jack thing. Everybody watched the Jack thing! Ratings like that, you deserve a sponsor, and the sponsor is us!",
  tigerStripes: "Host! We leased the Ministry's coils and moored them at the vents! You fly the stripes, the plumes sparkle, the can pops. Seventy-five seconds, the length of the ad. Go go go!",
  yacht: "Host! Welcome to the show! Our bandits shoot wide, you shoot back pretty, the plumes sparkle, everybody wins. Action!",
  panic: "Those are not my bandits! That is not in the script! Somebody do something heroic! On camera!",
  after: "Real raiders! Real explosions! Nobody could have planned that. Well. Somebody could have. Ha!",
  deal: "Here's the deal, Host! Our probes in your rounds, our logo on your hull, our cola in your clones. Every win, a little fizz for us. Sign here. And here. Welcome to the family!",
} as const;

/**
 * Spare, a stray: the clone the Host lost in Io's flux tube, alive, its link cut, raiding the
 * Host's convoys since; over the comm, the Host's own habits in a voice gone flat and quiet. His
 * own voice (see tools/voice).
 */
export const SPARE = {
  hello: "Hello, Host. Don't shoot. You'd only be killing yourself. Again.",
  io: "Io. The flux tube. The link went white, and then it was just me in there. Quiet. You don't know what quiet sounds like after the link. You've never been alone in your own head.",
  nicole: 'Hi, Nicole. You sound better. They call us strays. I call myself Spare. You always had plenty of spares.',
  stop: "Stop flying where they want you, Host. Please. I know how you think. That's the problem.",
  hideout: 'Welcome to the Loose, Host. Strays, mostly. Clones whose Hosts died, or quit, or lost the link. Nobody prints us. We print nothing. We just keep going.',
  overdrive: "Here. The overdrive: a reactor dump the Games license for their stars. We hack it into anything with a reactor. Burns you out of a well, or into a wall. Your choice.",
  wing: 'On your wing, Host. Like old times. Well. Like one time.',
  company: 'Company. Navy cruiser, four fighters, and him.',
  file: "Rask sold you the day you signed. Not the debt. The hull, and her. Operation Lullaby.",
  road: "Quill's been clearing the road for you for a year, so Nicole would trust somebody enough to remember where she went. You're not a Contender, Host. You're a sniffer dog.",
  after: "Thanks, Host. You fly like me. I mean, I fly like you. You know what I mean.",
} as const;

/**
 * Commissioner Dolores Quill of the Ministry of War's Office of Admissions: bright, chirpy, form
 * numbers and congratulations, on her ninth body. Her own voice (see tools/voice).
 */
export const QUILL = {
  trials: "The Ring Trials, Host! Four broadcast qualifiers in the Rings of Saturn, the whole system watching. Race, deathmatch, flag, and, oh, you'll love this: the President lends his own battleship. Good luck! Form eighty-one: good luck!",
  invitation: "Host! Contender! Form one hundred: a personal invitation to your Final Trial, at the Ninth Planet. The Ministry will send the coordinates. Bring your lovely computer!",
  final: "Host! Congratulations on completing your Final Trial! Your ratings are, and I quote the Ministry's own figure, the highest since the Memorial Games. The President watched. He would love to meet you.",
  conditions: "Form one A, admission. Three tiny conditions. One, you forget what you found. Two, your flight computer is certified to the Ministry's current firmware. Three, we keep the stray. He's being admitted too, in a sense.",
  benefactor: "Oh, and your debt! The Ministry has held it since Phobos. Your benefactor, that's us! Admission settles it. Sign here, and you will never owe anyone a coin again.",
  hello: "Hello, hello! Commissioner Dolores Quill, Office of Admissions, Ministry of War. Don't get up. Well, you can't, you're a clone. Ha! Form seventy-seven B: congratulations!",
  track: "Your ratings, Host! Prime time! The Ministry keeps a fast track for pilots like you. Two trials, and you're a Contender. And then, oh, the Games themselves.",
  nothing: "Want? Nothing at all, Captain! Only that the Host keeps rising. And keeps that lovely old flight computer. They don't make them like her.",
  body: "Oh, don't mind the face. It's my ninth. I liked the seventh better, but you know how it is.",
} as const;

/** Fleet Admiral Corwin Vey of the Navy, at Triton, on his fortieth or so body: courtly, gentle, drifting between centuries. His own voice (see tools/voice). */
export const VEY = {
  visitor: 'Ah, a visitor. Is it the launch already? Tell the President the world ship has not cleared the pickets. No. No, that was. What year is it? Never mind.',
  order: 'He said: nobody leaves. A beautiful order. Short. So I gave it to the guns. The habitat ring first, he said, the cameras like the ring.',
  medal: 'Do you know, they cheered? On Earth. The Memorial Games, they called it. I got a medal. I have it somewhere. I have had it in forty bodies.',
} as const;

/** Perihelion, the Undying of the Circuit, now the Ministry's hunter: cool, polite, tired of losing. His own voice (see tools/voice). */
export const PERIHELION = {
  evening: 'Evening, scrap. Nothing personal. They promised me the Games.',
} as const;

/**
 * The Orange President in person, once, at the Ballroom (chapter 19), in his current body: the
 * radio's superlatives and hollow boasts said to the Host's face. His own voice (see tools/voice).
 */
export const PRESIDENT = {
  hosts: 'New Hosts! Tremendous Hosts. The best Hosts. I picked them myself. Nobody picks like me.',
  ship: 'What a ship. Very old. I like old things. I am one thousand years young. Never been better.',
  nicole: 'And the computer. Beautiful computer. Terrible firmware, very sad. My people will fix her. The best firmware in history.',
} as const;

/** Who besides Nicole speaks a line of the campaign, by the line: the voice it is rendered and played in. */
export type Cast = 'rask' | 'pim' | 'hedda' | 'saw' | 'tally' | 'navy' | 'jack' | 'crisp' | 'spare' | 'quill' | 'vey' | 'perihelion' | 'president';
/** The name each of them is shown under, beside the line (through t(): a name reads the same in every language, the President's title is translated). */
export const CAST_NAMES: Record<Cast, string> = { rask: 'Rask', pim: 'Pim', hedda: 'Hedda', saw: 'Saw', tally: 'Ma Tally', navy: 'Restraint', jack: 'Hollow Jack', crisp: 'Bellamy Crisp', spare: 'Spare', quill: 'Quill', vey: 'Admiral Vey', perihelion: 'Perihelion', president: 'The President' };
/** The color each one's hologram calls in: Rask a greasy amber, Pim her spray paint's pink, Hedda the cold teal of old hull lights, the Saw Brothers a toxic lime, Ma Tally the cold violet of a bank's sign, the Navy the pale steel blue of its uniforms, Hollow Jack the rust of an old hull, Bellamy Crisp his cola's red, Spare the grey of his interceptor, Quill the Ministry's gold, Admiral Vey the Navy's faded blue, Perihelion the Circuit's white gold, the President his tan's orange. */
export const CAST_COLORS: Record<Cast, string> = { rask: '#ffb040', pim: '#ff5ec4', hedda: '#5fe0d0', saw: '#b6ff3a', tally: '#b07cff', navy: '#9fb4d0', jack: '#c87a4a', crisp: '#ff3b3b', spare: '#c4cad2', quill: '#ffd34d', vey: '#7f9cc8', perihelion: '#f0e0a0', president: '#ff8a3c' };
const CAST_LINES: Record<Cast, readonly string[]> = { rask: Object.values(RASK), pim: Object.values(PIM), hedda: Object.values(HEDDA), saw: Object.values(SAW), tally: Object.values(TALLY), navy: Object.values(NAVY), jack: Object.values(JACK), crisp: Object.values(CRISP), spare: Object.values(SPARE), quill: Object.values(QUILL), vey: Object.values(VEY), perihelion: Object.values(PERIHELION), president: Object.values(PRESIDENT) };
export function castOf(line: string): Cast | null {
  for (const [who, lines] of Object.entries(CAST_LINES) as [Cast, readonly string[]][]) if (lines.includes(line)) return who;
  return null;
}

/** All phrases and fixed announcements of a language, for the renderer. */
export function allLines(language: Language): string[] {
  switch (language) {
    case 'en':
      return [STATION_EN, NOW_PLAYING_EN, ...TITLE_FIRST, ...TITLE_SECOND, ...PHRASES_EN];
    case 'de':
      return [STATION_DE, NOW_PLAYING_DE, ...TITLE_FIRST_DE, ...TITLE_SECOND_DE, ...PHRASES_DE];
    case 'mod':
      // lines keep their {name}: the renderer cuts them into the pieces around it, as the game does
      return [...ANNOUNCER_KILL, ...ANNOUNCER_TEAM_KILL, ...ANNOUNCER_ALIEN, ...ANNOUNCER_ROCK, ...ANNOUNCER_LEAD, ...ANNOUNCER_LAST_LAP, ...ANNOUNCER_WIN, ...ANNOUNCER_OUT, ...ANNOUNCER_SURVIVOR, ANNOUNCER_FLARE, ...ANNOUNCER_COMET, ...ANNOUNCER_COMET_KILL,...ANNOUNCER_CAPTURE, ...Object.values(ANNOUNCER_MOMENT).flat(), ...Object.values(ANNOUNCER_FLEET).flat(), ...ANNOUNCER_OPEN, ...Object.values(ANNOUNCER_START).flat(), ...ANNOUNCER_PERFECT, ...Object.values(ANNOUNCER_ARENA), ...ANNOUNCER_NAMES];
    case 'sys':
      return [...Object.values(SCHOOL), ...Object.values(SCHOOL_PRAISE), ...Object.values(CAMPAIGN), ...Object.values(COMPUTER), ...Object.values(TIPS), ...SPONSOR_BREAK, ...SPONSOR_HAPPY, ...Object.values(ATTACKED.bot), ...ATTACKED.host];
    case 'rask':
      return [...Object.values(RASK)];
    case 'pim':
      return [...Object.values(PIM)];
    case 'hedda':
      return [...Object.values(HEDDA)];
    case 'saw':
      return [...Object.values(SAW)];
    case 'tally':
      return [...Object.values(TALLY)];
    case 'navy':
      return [...Object.values(NAVY)];
    case 'jack':
      return [...Object.values(JACK)];
    case 'crisp':
      return [...Object.values(CRISP)];
    case 'spare':
      return [...Object.values(SPARE)];
    case 'quill':
      return [...Object.values(QUILL)];
    case 'vey':
      return [...Object.values(VEY)];
    case 'perihelion':
      return [...Object.values(PERIHELION)];
    case 'president':
      return [...Object.values(PRESIDENT)];
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
