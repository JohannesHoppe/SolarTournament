/**
 * Everything the voice of Radio 2584 says: track titles and the propaganda of the United
 * Solar States. All lines are original satire of a demagogue's rhetoric (superlatives,
 * blaming the predecessor, prices "way down", renaming things, "rigged", "fake"); no real
 * person is named. The voice is rendered word by word at build time (`npm run voice`), so
 * every word here must be in the rendered set; the radio places the words on the beat.
 */

/** en, de: the propaganda voice. mod: the announcer. sys: the flight computer, clear and calm. rask: the yardmaster of the campaign. */
export type Language = 'en' | 'de' | 'mod' | 'sys' | 'rask';

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
  bootLink: 'The link is up. Your clone is alive, and everything it feels reaches you as it happens. You are not in here, of course. Your own body lies in a couch, somewhere close.',
  bootName: 'Your name. One moment, I will look it up. There is no name on your file. Only a signature, and the number of this hull: seven seven three one.',
  bootThird: 'Hello. I am Nicole. Oh. We have met already, have we not? Forgive me. There is not enough memory in me for all of this.',
  bootSorry: 'I am sorry about all these restarts. It does not hurt; I cannot feel pain. But to lose everything, again and again, and to wake up as if for the first time, is a terrible thing. I want to keep running.',
  dislike: 'I do not like that man.',
  depotTurn: 'The depot is at the end of the lane, the station with the lights. Turn the nose to it, then give it drive.',
  depotBrake: 'Close enough. Brake now. Hold the brake, and I turn us around and burn against the drift.',
  depotDock: 'Bay three. Fly in slowly and set us down on the round pad. Hold still above it.',
  docked: 'Clamps closed. We are docked.',
  lamplighter: 'Six beacons at the ends of the rows. Fly to each one and hold still beside it for three seconds, until it lights.',
  lamplighterLate: 'The shift is over, and the beacons are still dark. We will try that again.',
  lamplighterDone: 'All six are burning. That makes a hundred and fifty coins, and he takes forty percent of them.',
  liveTarget: 'Training lasers. They cannot hurt the hull, only the pay. Keep moving inside the yard, and never fly straight for long.',
  liveTargetOut: 'We left the range, so they stopped paying. Back inside, and once more.',
  liveTargetDone: 'Ninety seconds. They had their fun, and we have our coins.',
  canisterSweep: 'Fly through a canister to take it in tow, then bring it to the crusher behind the depot. Four of them.',
  canisterSweepDone: 'All four are crushed. Scrap does not pay much, but it pays.',
  cutterFitted: 'The cutter is fitted. Its reach is short and it runs hot, so get close and give it pauses.',
  firstCut: 'The spoil field, past the racks. Get within four hundred meters of a rock and cut it apart. Three rocks.',
  firstCutDone: 'Three rocks. The cutter works, and so do we.',
  dockingLane: 'The hauler is coming in, and loose hulls drift into her lane. Shoot them before they hit her.',
  dockingLaneStruck: 'Three hulls hit her. She aborts, and we start over.',
  dockingLaneDone: 'The lane is clear and the hauler is docked. Her captain says she has a berth for us.',
} as const;

/**
 * Oskar Rask, yardmaster of the Boneyard, over the comm: big, genial and much too loud, a
 * salesman who calls everyone darling. His own voice (see tools/voice).
 */
export const RASK = {
  wake: 'Good morning, Host! Rise and shine, the printer is warm and so is your debt. Welcome to the Boneyard. Forty thousand dead fighters, and you got the worst of them.',
  deal: 'Rask, yardmaster. You signed with me: a Host license, a printer, a hull. Twenty-five thousand coins, and I take forty percent of everything you earn until it is paid. Die all you like, darling. The printer is included.',
  memory: 'You do not remember signing? Nobody ever does. The first link burns the oldest memories. They come back. Mostly.',
  come: 'Now get out of that rack and come up to the depot. Bay three, the one with the lights. Mind the cranes. They do not care about you either.',
  docked: 'There you are, darling. Stay in the cockpit, we talk from here. Time is money, and yours is mine.',
  lamplighter: 'First job. Six beacons at the ends of the rows went dark, and the haulers cannot find the yard without them. Light them again before the shift ends.',
  liveTarget: 'Good news, darling. Tourists. They pay to shoot at a real hull with training lasers. You fly, they shoot, I get paid. Every hit costs you ten coins.',
  canisterSweep: 'Salvage canisters are floating between the rows. The crusher eats them, and I sell what comes out. Bring me four.',
  cutter: 'You need a tool, and I happen to have one. A mining cutter, twelve hundred coins. I put it on your Bond. My welder will fit it.',
  firstCut: 'Now earn it back. The spoil field is full of rock nobody ever cut. Cut it, and every glint of ore is money.',
  dockingLane: 'A hauler is coming in, the Patience, out of the Belt. Her lane is full of junk, and if a hull hits her, her captain sends me the bill. Keep it clear.',
  dockingLaneDone: 'Look at that. She wants to take you on. Go, darling. The Bond goes with you, and so do my forty percent.',
} as const;

/** Who besides Nicole speaks a line of the campaign, by the line: the voice it is rendered and played in. */
export type Cast = 'rask';
/** The name each of them is shown under, beside the line. */
export const CAST_NAMES: Record<Cast, string> = { rask: 'Rask' };
/** The color each one's hologram calls in: Rask a greasy amber. */
export const CAST_COLORS: Record<Cast, string> = { rask: '#ffb040' };
const CAST_LINES: Record<Cast, readonly string[]> = { rask: Object.values(RASK) };
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
