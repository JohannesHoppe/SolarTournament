import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Assets, ShipType } from '../assets';
import { ASTEROID_POINTS, AsteroidField, FIELD_RADIUS, raySphere } from '../world/asteroids';
import { Sound } from '../sound/audio';
import { Bot, BOT_NAMES, evenSkills, HOME_RADIUS, meanSkill, raceSpeedOf, skillsOf, type Ring, type Skills } from '../ship/bots';
import { Effects } from '../view/effects';
import { Glitch } from '../view/glitch';
import { Datamosh } from '../view/datamosh';
import { GuideLine } from '../view/guide';
import { Ghost } from '../view/ghost';
import { lapClock, LapTimer, parseLaps } from './laps';
import { aimHook, cableEnd, Cables, flightTime, floorOf, HOOK_RANGE, HOOK_RECHARGE, pivotOf, pullOn, type Anchor, type Tether } from './hook';
import { Hud, METERS_PER_UNIT, meters } from '../view/hud';
import { bindVolume, Radio, type MusicCue } from '../music/radio';
import { Crowd } from '../music/crowd';
import type { Spoken } from '../music/band';
import { COMPUTER, ANNOUNCER_ALIEN, ANNOUNCER_ARENA, ANNOUNCER_CAPTURE, ANNOUNCER_COMET, ANNOUNCER_COMET_KILL, ANNOUNCER_FLARE, ANNOUNCER_FLEET, ANNOUNCER_KILL, ANNOUNCER_LAST_LAP, ANNOUNCER_LEAD, ANNOUNCER_NAMES, ANNOUNCER_OPEN, ANNOUNCER_OUT, ANNOUNCER_PERFECT, ANNOUNCER_ROCK, ANNOUNCER_START, ANNOUNCER_SURVIVOR, ANNOUNCER_WIN, SPONSOR_BREAK, SPONSOR_HAPPY } from '../music/lines';
import { Speaker } from '../sound/speaker';
import { hash, mixSeed, ROUND_SECONDS, textSeed, titleFor, type Song } from '../music/songs';
import { showTransmission } from '../music/transmission';
import { IDLE, Input, keyLabel, learnKeyboardLayout, type Action, type Controls } from '../input/input';
import { MAX_HEAT, Ship, type ShipState, type Zone } from '../ship/ship';
import { gripOf, MAIN_THRUST, MAX_SPEED, MAX_TURN_RATE, OVERDRIVE_PUSH, PathSteering, RCS_THRUST } from '../ship/flight';
import { Session, TOURNAMENT_SIZE, type RoundState } from '../net/session';
import { Online, type OnlineGame } from '../net/online';
import { Lobby, type Listing } from '../net/lobby';
import { newRoom, roomFragment, roomFromFragment, type Room } from '../net/room';
import { cleanName } from '../net/validate';
import { Space, SUN_DIRECTION } from '../world/space';
import { Arena, ARENA_GRACE, ARENA_LIMIT } from '../world/arena';
import { Belt, BELT_INNER } from '../world/belt';
import { COURSE_NAMES, FlightSchool, RING_RADIUS, SCHOOL_COURSES, type SchoolContext, type SchoolCourse } from './school';
import { SponsorBreak } from './sponsors';
import { Wrecks, type Wreck, type WreckState } from '../world/wrecks';
import { ARENAS, arenaById, arenaByKey, arenaOfRound, PREVIEW_FROM, type ArenaId, type ArenaProfile } from '../world/arenas';
import { Landmarks } from '../world/landmarks';
import { Lensing } from '../view/lensing';
import { Radar, type RadarMark } from '../view/radar';
import { KillCam } from '../view/killcam';
import { Showcase } from '../view/showcase';
import { storageGet, storageSet } from '../storage';
import { buy, LEVELS, nextPrice, parseHangar, payOut, perksOf, sovereignEarned, UPGRADES } from './hangar';
import { LOCK_ANGLE, LOCK_DISTANCE, TORPEDO_DAMAGE, TORPEDO_RADIUS, TORPEDOES, Torpedoes, type Homing, type Torpedo } from './torpedoes';
import { contents, Probes, PROBE_RADIUS, ITEM_NAMES, ITEM_HINTS, placeBucket, SEALED_NAME, type Probe, type ItemKind, type ProbeState } from './items';
import type { Asteroid, FieldState } from '../world/asteroids';
import { RacingLine } from './racingline';
import { bounceOff, impactDamage, ram, ramImpulse, RAM_SAFE, SAFE_IMPACT } from '../ship/impact';
import { setGlint } from '../ship/models';
import { BOOST_PUSH, BOOST_RADIUS, coilPush, Course, FINISH_GATES, GATE_POINTS, GATE_RADIUS, GATES, lapOf, LAPS, modeOfRound, pathCrossing, PLACE_POINTS, ROUND_MODES, type RoomMode, type RoundMode } from './race';
import { BATTERY_DAMAGE, BATTERY_RANGE, batteryChance, Fleet, FLEET_HIT_POINTS, PLUME_BURN as FLEET_PLUME_BURN, PLUME_HEAT as FLEET_PLUME_HEAT, SINK_BLAST, SINK_POINTS, SINK_SECONDS, TORPEDO_HITS, ZONE_NAMES, ZONE_POINTS, type FleetEvent } from './fleet';
import { touchRing } from '../world/gates';
import { COMET_SPEED, COMET_WARNING, cometEnd, cometsOf, cometStart, CometView, courseAt, headAt, HEAD_RADIUS, makeComet, PIECE_RADIUS, routeNearest, runDown, Shower, SHOWER_LENGTH, SHOWER_PIECES, SHOWER_WIDE, type Comet } from './comet';
import { BASE_RADIUS, CAPTURE_POINTS, Flags, GRAB_POINTS, RETURN_POINTS, TEAM_NAMES, TEAM_TINTS, type FlagEvent } from './flags';
import { CLONES, clonesLeft, FLARE_APPROACH, FLARE_BURN, FLARE_END, FLARE_HEAT, FLARE_KEEP, FLARE_RADIUS, FLARE_SHADE, FLARE_START, flareCenter, flareClearance, flareFront, flarePocket, isOut, standing } from './survival';
import { FlareView } from '../world/flare';
import { markedName } from '../view/marks';
import { Coach, type Tip } from './coach';
import {
  ALARM_RANK,
  AlarmTones,
  Alarms,
  CRITICAL_GLITCHES,
  escapeLoad,
  FIELD_CRITICAL,
  HEART_HULL,
  HEART_WELL,
  HULL_CRITICAL,
  IMPACT_CRITICAL,
  SILENCE_BEFORE,
  SILENCE_COOLDOWN,
  SILENCE_SECONDS,
  WELL_CRITICAL,
  WELL_LOST,
  WELL_RELEASE,
  wellLevel,
} from './alarms';
import { MOMENTS, Moments, type Moment } from './moments';
import { devlog } from '../devlog';
import { chooseLocale, currentLocale, LOCALE_NAMES, LOCALES, msg, t } from '../i18n/i18n';

/** Online tournaments show the scoreboard this long before the next round starts. */
const RESULTS_SECONDS = 12;
/** The standings held open with Tab are written anew this often (s, real time). */
const STANDINGS_REFRESH = 0.25;
/**
 * Once a round is decided before its time (every Host has finished the race, one ship is left
 * standing, a side has captured enough, the battleship went up), it ends this many seconds
 * later (s): time to see the own place.
 */
const DECIDED_SECONDS = 5;
/**
 * Online, a round is not decided in its first seconds (s): the other browsers' ships still carry
 * the last round's deaths and finishes until their first states of the new one arrive.
 */
const DECIDE_GRACE = 3;
/**
 * Every round but the flight school's opens as a show, on the round clock, the same on every
 * browser: INTRO_SECONDS of the camera flying in over the arena while the field is presented,
 * then a countdown of START_SECONDS with START_LIGHTS lights coming on one by one; at START_AT
 * the clamps let go (BURN! in a race, FIGHT! in every other mode). Until then the clamps hold
 * every ship (no drive, no thrusters, no laser, no torpedo, no overdrive, no hook), and a race's
 * time runs from that moment. A drive lit within START_WINDOW seconds before BURN!, or within
 * START_LATE seconds after it, makes a perfect start: a shove of BOOST_PUSH along the nose. A
 * drive lit earlier and still burning at BURN! stalls for FALSE_START_STALL seconds. A bot gets a
 * perfect start with a chance of its reflexes times BOT_PERFECT_START.
 */
const INTRO_SECONDS = 5;
const START_SECONDS = 3;
const START_AT = INTRO_SECONDS + START_SECONDS;
const START_LIGHTS = 5;
/** How loud the stadium is over the intro and at each number of the countdown (0 silent, 1 on its feet); at the start word it erupts. */
const CROWD_INTRO = 0.3;
/**
 * A racing bot within APPROACH_NEAR (units, 150 m) of its next gate's plane but beside its
 * opening first flies for a point APPROACH_FAR (200 m) before the gate on its axis (see
 * approach), so it never runs into the coil's housings from the side.
 */
const APPROACH_NEAR = 3000;
const APPROACH_FAR = 4000;
/** A racer passes a gate this many ship radii inside its rim (about 34 m), or flies for its center first (see approach). */
const APPROACH_CLEAR = 2;
const CROWD_COUNT: Record<number, number> = { 3: 0.45, 2: 0.65, 1: 0.85 };
/** A smaller moment's cheer lasts this long (s), then the stadium settles back to its murmur (0..1). */
const CHEER_SECONDS = 1.5;
const CROWD_MURMUR = 0.25;
/** The countdown's state before its numbers: the intro is running (see startCountdown). */
const INTRO_COUNT = START_SECONDS + 1;
/**
 * The intro's camera (see introCamera) holds on the arena's landmark for this share of the
 * intro, drifting by INTRO_SWING (rad) around it over the whole intro, and then sweeps onto the
 * own ship.
 */
const INTRO_HOLD = 0.3;
const INTRO_SWING = 0.5;
/** The start word shakes the camera like a kill (see KICK_SHAKE). */
const START_KICK = 1.5;
const START_WINDOW = 0.3;
const START_LATE = 0.2;
const FALSE_START_STALL = 1.5;
const BOT_PERFECT_START = 0.8;
/**
 * Solar storms in the corona arena: every STORM_PERIOD seconds of field time a storm of
 * STORM_SECONDS blinds the sensors (no markers, no lock warnings, bots see only within
 * STORM_SIGHT). The field time is shared, so a storm hits every browser at once.
 */
const STORM_PERIOD = 50;
const STORM_SECONDS = 8;
/**
 * The director of a watching Host's broadcast (see Game.direct) holds a pilot at least
 * DIRECTOR_HOLD seconds, cuts only to one clearly more in the thick of it (the followed one
 * counts DIRECTOR_STICK times), and takes over again DIRECTOR_PAUSE seconds after Tab.
 */
const DIRECTOR_HOLD = 6;
const DIRECTOR_STICK = 1.3;
const DIRECTOR_PAUSE = 10;
/** The modes as the list of tournaments names them. */
const MODE_NAMES: Record<RoomMode, string> = {
  deathmatch: msg('Deathmatch'),
  race: msg('Race'),
  survival: msg('Last Clone Standing'),
  flag: msg('Capture the Flag'),
  fleet: msg("The President's Fleet"),
  mixed: msg('Every mode in turn'),
};
/** The beams of the President's batteries: red, the regime's neon. */
const BATTERY_COLOR = new THREE.Color(1, 0.1, 0.15);
/**
 * Bots of Capture the Flag: one in FLAG_GUARDS of each side guards its base and hunts a thief
 * of its core, the others raid. They fly for a core at FLAG_RAID_SPEED (units/s, 120 m/s),
 * slow enough to turn for home, and home at FLAG_HOME_SPEED (220 m/s), close to the limit.
 */
const FLAG_GUARDS = 3;
const FLAG_RAID_SPEED = 2400;
const FLAG_HOME_SPEED = 4400;
/** A raider swings out this far beyond the other side's base, and as far to one side, before it dives through the core (units, 200 m). */
const FLAG_SWING = 4000;
/** Against the President's battleships bots range out this far (units), to its orbit beyond the rocks. */
const FLEET_HOME = ARENA_LIMIT * 0.95;
/** The flight school's line to a marker shows from this far off it (units, 100 m). */
const SCHOOL_LINE_MIN = 2000;
/** The HUD marks where the own flight crosses the next ring's plane when it gets there within this time (s). */
const CROSSING_HORIZON = 12;
/** The flight school's line is laid anew from the pilot whenever its marker moved this far (units, 10 m), so it keeps pointing at a ship or torpedo on the move. */
const SCHOOL_LINE_MOVE = 200;
/** Bots keep this far clear of the plume of a battleship hunting with its stern (units, 100 m). */
const PLUME_MARGIN = 2000;
/** What each event of Capture the Flag is worth to the ship that did it. */
const FLAG_POINTS: Record<FlagEvent['kind'], number> = { grab: GRAB_POINTS, return: RETURN_POINTS, capture: CAPTURE_POINTS, drop: 0 };
/** A kill in a race is worth less than in a deathmatch: the gates and the finish decide. */
const RACE_KILL_POINTS = 200;
/** Points for shooting down a torpedo, and how often a bot with a lock fires one (per second). */
const TORPEDO_DOWN_POINTS = 50;
/** A flight school drill's torpedo leaves its drone at this speed towards the pilot (units/s, 40 m/s, as from a tube). */
const DRILL_TORPEDO_LAUNCH = 800;
/** A torpedo another browser says went off is this close (units, 1.5 km) to where it flies here, or the report is ignored: torpedoes fly alike everywhere, up to the lag. */
const TORPEDO_GONE_SLACK = 30000;
const BOT_TORPEDO_RATE = 0.08;
/**
 * A bot hooks the ship it hunts when it lies dead ahead between BOT_HOOK_MIN (units, 150 m) and
 * nine tenths of the hook's reach, with a chance of BOT_HOOK_RATE times its daring a second
 * (Halley about once in five seconds of such a chance, Sputnik once in twenty, Laika never), reels it in for
 * BOT_HOOK_HOLD seconds and lets go; its hook is ready again BOT_HOOK_PAUSE seconds after that.
 * Far rarer than a Host can, and never in a race.
 */
const BOT_HOOK_MIN = 3000;
const BOT_HOOK_RATE = 0.25;
const BOT_HOOK_HOLD = 1.5;
const BOT_HOOK_PAUSE = 10;
/**
 * A nova core destroys every other ship within NOVA_RADIUS (units, 800 m) of its holder; its
 * shell runs out there in NOVA_EXPANSION seconds. A bot that holds one only sets it off with
 * at least NOVA_CROWD enemies inside, and bots flee a nova holder within NOVA_FLEE radii.
 */
const NOVA_RADIUS = 16000;
const NOVA_EXPANSION = 0.8;
const NOVA_CROWD = 2;
const NOVA_FLEE = 1.5;
/** The white flash of a nova seen close lasts this long (ms), as the animation nova-flash in style.css. */
const NOVA_FLASH_MS = 1600;
/** An idle bot goes for a probe within this distance (units, 1.5 km). */
const PROBE_LURE = 30000;
/** Plating (an item) turns this many hits into the drive, or one torpedo. */
const PLATING_CHARGES = 2;
/**
 * A drive plume: a burning main drive (throttle above PLUME_THROTTLE) throws hot plasma out
 * behind it, PLUME_REACH far (units, 150 m), spreading by PLUME_SPREAD per unit of its length
 * (about 7°). A ship inside takes PLUME_HEAT heat and PLUME_BURN hull per second at the nozzle
 * of a full burn, less with the throttle and fading to nothing at the plume's end. Nothing
 * like a slipstream in vacuum: to overtake, a ship has to get out of the line of the one ahead.
 */
const PLUME_THROTTLE = 0.3;
const PLUME_REACH = 3000;
const PLUME_SPREAD = 0.12;
const PLUME_HEAT = 60;
const PLUME_BURN = 8;
/**
 * Let go by its hook, the own ship flies off along its swing, across its nose. For
 * FLING_SECONDS the flight computer turns the nose onto the new course and the autopilot
 * leaves the drift alone, unless the pilot steers more than FLING_STEER (stick deflection).
 */
const FLING_SECONDS = 1.2;
const FLING_STEER = 0.1;
/** A torpedo homing on the own ship within this distance sets off TORPEDO INBOUND (units, 2 km); within TORPEDO_CRITICAL it is CRITICAL (units, 500 m). */
const TORPEDO_WARNING = 40000;
const TORPEDO_CRITICAL = 10000;
/** How a ship that touches an arena's massive body dies, for the sponsor break. */
const WELL_DEATHS: Partial<Record<ArenaId, string>> = { giant: msg('Burned up in the clouds'), hole: msg('Crossed the event horizon') };
/** A client's round clock jumps to the lead browser's when it is this far off (s), and drifts towards it otherwise. */
const ROUND_SNAP = 0.25;
/** A rock hit from another browser counts only within this much field time (s) of the own clock; the clocks agree to a fraction of a second. */
const ROCK_TIME_SLACK = 5;
/** A lead browser's next round is taken this long (s) before the own clock ends the running one at the earliest: clocks drift a little, not by minutes. */
const ROUND_END_SLACK = 30;
/** Online, the asteroids jump to the lead browser's field time when they are this far off (s), and otherwise glide towards it. */
const FIELD_SNAP = 0.5;
/** The announcer comments on a death at most this often (s). */
const ANNOUNCER_COOLDOWN = 7;
/** Nicole names the own passes and the lead at most this often (s of game time). */
const PLACE_CALL_COOLDOWN = 4;
/** Song of the menu. The flight school plays no music, so Nicole is heard clearly. */
const LOUNGE_SEED = 2584;
/** The idle link to the clone hangar glitches now and then, every 5 to 14 s. */
const IDLE_GLITCH_MIN = 5;
const IDLE_GLITCH_RANGE = 9;
/** Reach of the laser (units, 10 km), far beyond the arena; also the length of the rays that find the shadow of the rocks. */
const LASER_RANGE = 200000;
/** A probe another browser's ship took may lie this far beyond its reach here (units, 500 m, and half a second of the ship's flight): the taker is seen a moment late. */
const PROBE_LAG = 10000;
/** Points for destroying a ship: a kill is worth more than any rock. */
const KILL_POINTS = 500;
/**
 * A ship destroyed by a nova core counts as this many kills (and their points) for the holder,
 * because it is funny; the victim loses one kill and its points for it, so everyone has a
 * reason to get out of the blast radius fast.
 */
const NOVA_KILL_CREDIT = 2;
/** Bots respawn after this delay; the own pilot sees the sponsor break after it. */
const RESPAWN_SECONDS = 3;
/** Each death of the Host by an enemy raises the bots' ease (see Bot.ease) by this much in a solo round; a kill by the Host lowers it by KILL_EASE. */
const DEATH_EASE = 0.35;
const KILL_EASE = 0.1;
/**
 * A ship struck by another at this closing speed or more (units/s, 5 m/s) is shoved: a crash of
 * its within KNOCKOUT_SECONDS (s) is a knockout, the shover's kill. Three seconds carry a ship
 * shoved at 40 m/s some 120 m: into the rock beside the line, the housing of a gate, the hull.
 */
const SHOVE_SPEED = 100;
const KNOCKOUT_SECONDS = 3;
/** The crashes a shove can end in: what a ship flies into, not what shoots it. */
const KNOCKOUTS: ReadonlySet<DeathCause> = new Set<DeathCause>(['rock', 'wreck', 'space', 'well', 'flare', 'comet']);
/** A shove sets the hull spinning by this much per unit of closing speed (rad/s per units/s; 3.2 rad/s at 40 m/s), up to SHOVE_SPIN_MAX; the flight computer catches it within a fraction of a second. */
const SHOVE_SPIN = 0.004;
const SHOVE_SPIN_MAX = 6;
/**
 * The longest step the round runs in (s): a longer frame is split into steps this short, so a
 * laser's cadence, a collision's sweep and a bot's thinking come out the same at 20 frames a
 * second or in a time-lapse as at 60.
 */
const MAX_STEP = 1 / 30;
/** The aim assist takes ships within this angle of the nose (rad, about 4°) and this distance (units, 2 km). */
const AIM_ASSIST_ANGLE = 0.07;
const AIM_ASSIST_RANGE = 40000;
/** How hard the aim assist pulls at most (0..1), and the steering gain it pulls with. */
const AIM_ASSIST_STRENGTH = 0.85;
const AIM_ASSIST_GAIN = 6;
/** The ease fades away over this many seconds of game time. */
const EASE_FADE = 90;
/** Explosions closer than this pelt the own hull with audible debris. */
const DEBRIS_HEARING = 6000;
/** The autopilot's thrusters push at full strength until the drift would be gone in this time (s), then ease off. */
const AUTOPILOT_EASE = 0.3;
/** The upright hold rolls at full rate from this roll error on (1/rad): firm, without overshooting. */
const UPRIGHT_GAIN = 1.2;
/** The upright hold fades out between these steepness values of the nose (sine of the climb angle: about 45° and 65°). */
const UPRIGHT_LET_GO = 0.7;
const UPRIGHT_FREE = 0.9;
/** The brake burns once the nose is this close to retrograde (rad). */
const BRAKE_BURN_ANGLE = 0.2;
/** The brake eases the burn over the last BRAKE_EASE seconds of full thrust (s). */
const BRAKE_EASE = 0.3;
/** Below this speed the brake counts the ship as at rest (units/s, 1 m/s). */
const BRAKE_REST = 20;
/** Once at rest, the brake only burns again above this speed (units/s, 2 m/s). */
const BRAKE_RESUME = 40;
/**
 * Below this speed the brake stops the ship with the thrusters alone and does not turn it
 * (units/s, 50 m/s): the thrusters take it out in about the time a flip would take. A brake
 * that started a flip goes on flipping and burning down to BRAKE_SETTLE (units/s, 15 m/s),
 * though the thrusters take out drift during the turn; only the last few m/s are left to the
 * thrusters, so a slow drift that wanders in direction cannot make the ship flip back and forth.
 */
const BRAKE_FINE = 1000;
const BRAKE_SETTLE = 300;
/** Confirm presses are ignored this long after a screen changes (ms). */
const CONFIRM_LOCK_MS = 600;
/** Drive lights in the scene: one for every place of a tournament, and one more for a watching Host's clone. */
const ENGINE_LIGHTS = TOURNAMENT_SIZE + 1;
/**
 * A Host who comes in after a round's opening (online) hears the announcer open the broadcast
 * this long after the launch (s), once the flight computer is through, and sees the arena's name
 * ARENA_TITLE_DELAY after it; the opening's intro does both for everyone else.
 */
const ANNOUNCER_OPEN_DELAY = 7;
const ARENA_TITLE_DELAY = 4.5;
/** One standard gravity in units/s² (1 unit = 5 cm). */
const G = 9.81 / METERS_PER_UNIT;
/** Above this load the pilot starts to grey out; at the limit it takes G_ONSET seconds to tunnel vision. */
const G_TOLERANCE = 3;
const G_ONSET = 5;
const G_RECOVERY = 3;
/** The impact warning starts this many seconds before the last chance to flip and brake. */
const IMPACT_MARGIN = 2;
/** Assumed duration of a flip for the impact warning (s): half a turn at full rate, plus spin-up and settling. */
const FLIP_SECONDS = Math.PI / MAX_TURN_RATE + 0.35;
/** Assumed extra time of the roll that starts a head-over flip (s). */
const FLIP_ROLL_SECONDS = 0.7;
/** Without a rock or ship in the way, the crosshair shows the nose at this distance (units, 2 km). */
const AIM_DEPTH = 40000;
/** Random places on the edge of the field a respawn chooses from. */
const SPAWN_CANDIDATES = 12;
/** Where a clone is printed when no place in the field is clear: this share of the field's layout radius out, beyond its rocks, and never beyond 95 % of the arena's edge. */
const SPAWN_BEYOND = 1.1;
/** Ships farther away than this never set off the lock warning (units, 3 km). */
const LOCK_RANGE = 60000;
/** A nose within this many times the own ship's angular radius counts as TRACKED. */
const LOCK_TRACKING = 4;
/** Vertical field of view of the camera (degrees). */
const CAMERA_FOV = 70;
/**
 * The camera sees this far (units, 35 km): the horizon of the gas giant's clouds, 40 km in
 * radius, lies up to 22 km off for a ship at the arena's edge (see arenas.ts).
 */
const CAMERA_FAR = 700000;
/** A full burn widens the view by this much (degrees) and shakes the chase camera by this share of the ship radius: the drive is felt. */
const DRIVE_FOV_KICK = 7;
const DRIVE_SHAKE = 0.012;
/** How fast the chase camera follows the ship's position and turns (1/s): tight, so the ship feels direct. */
const CAMERA_FOLLOW = 20;
const CAMERA_TURN = 18;
/**
 * Cinema mode (see toggleCinema): the chase camera hangs CINEMA_DISTANCE ship radii farther
 * back, follows and turns at CINEMA_SOFTNESS of its usual speed, and drifts around the ship by a
 * ship radius sideways and a quarter up and down, slowly (CINEMA_DRIFT, rad/s).
 */
const CINEMA_DISTANCE = 1.4;
const CINEMA_SOFTNESS = 0.3;
const CINEMA_DRIFT = 0.25;
/** A landed hit jolts the camera by this share of the ship radius (a kill by twice that), fading at KICK_FADE (1/s). */
const KICK_SHAKE = 0.06;
const KICK_FADE = 9;
/**
 * The overdrive (E): the drive's reactor dumps everything into one shove along the nose
 * (OVERDRIVE_PUSH, 150 m/s), past the tournament's limit. It leaves the clone at the edge of
 * blacking out (OVERDRIVE_STRAIN) and the main drive glowing: no thrust for
 * OVERDRIVE_DRIVE_COOLDOWN seconds, while the thrusters still turn the ship and the laser
 * still fires. It needs OVERDRIVE_RECHARGE seconds before it fires again.
 */
const OVERDRIVE_STRAIN = 0.9;
const OVERDRIVE_DRIVE_COOLDOWN = 4;
const OVERDRIVE_RECHARGE = 60;
/**
 * The dodge (a thruster key tapped twice, LB): the maneuvering thrusters fire all at once at
 * overload, a kick of DODGE_SPEED (units/s, 40 m/s) sideways or up or down. The autopilot lets
 * the drift be for DODGE_DRIFT seconds, so the ship plainly leaves the line of fire (about
 * 50 m, more than a ship length, before the autopilot takes the drift out), and the thrusters
 * need DODGE_RECHARGE seconds before the next one. It presses the clone into the side of the
 * seat (DODGE_STRAIN).
 */
const DODGE_SPEED = 800;
const DODGE_DRIFT = 1.2;
const DODGE_RECHARGE = 1.5;
const DODGE_STRAIN = 0.15;
/**
 * A close call: passing a rock faster than CLOSE_CALL_SPEED (units/s, 60 m/s) within
 * CLOSE_CALL_REACH ship radii of its surface, without touching it, earns CLOSE_CALL_POINTS.
 * The same rock pays again only once the ship has left it behind (CLOSE_CALL_CLEAR radii).
 */
const CLOSE_CALL_SPEED = 1200;
const CLOSE_CALL_REACH = 2.2;
const CLOSE_CALL_CLEAR = 5;
const CLOSE_CALL_POINTS = 25;
/** The camera hangs back by this share of the ship radius at a full burn, and the view widens by SPEED_FOV degrees at the speed limit: speed is felt. */
const DRIVE_LAG = 0.6;
const SPEED_FOV = 10;
/** A gate's coil boost (see race.ts) widens the view by BOOST_FOV degrees for a moment, fading at BOOST_FADE (1/s), and presses the clone into the seat (BOOST_STRAIN). */
const BOOST_FOV = 9;
const BOOST_FADE = 2.5;
const BOOST_STRAIN = 0.3;
/** Hosts who ask for less motion get no camera shake. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
/** What a landed hit says where it struck, by the zone it broke. */
const HIT_WORDS: Record<Zone, string> = { reactor: msg('REACTOR'), drive: msg('DRIVE'), thrusters: msg('ARMOR'), armor: msg('ARMOR') };
const ZONE_MESSAGES: Record<Zone, string> = {
  reactor: msg('Reactor breach'),
  drive: msg('Main drive damaged'),
  thrusters: msg('Thrusters damaged'),
  armor: msg('Armor hit'),
};
const BEST_SCORE_KEY = 'solartournament.best';
/** A Host the others cast out as a cheater sees the call this long before it is back in the menu (ms). */
const CAST_OUT_MS = 3000;
/** What the Host owns: Solar Coins, the upgrades of its ships, the ship it flies (see game/hangar). */
const HANGAR_KEY = 'solartournament.hangar';
/** The ships as the menu names them. */
const SHIP_NAMES: Record<ShipType, string> = { human: msg('Human Interceptor'), alien: msg('Alien Interceptor'), sovereign: msg('The Sovereign') };
const CALLSIGN_KEY = 'solartournament.callsign';
/** The flight school's courses a Host has completed (a list); once the basic training is among them, the menu leads with the solo round. */
const SCHOOL_DONE_KEY = 'solartournament.school';
/** The drill a Host has reached in each course, so a reload continues there; a course's entry goes when it is complete or started over. */
const SCHOOL_STEP_KEY = 'solartournament.school-step';
/** What each course of the flight school teaches, on its button. */
const SCHOOL_NOTES: Record<SchoolCourse, string> = {
  basic: msg('Turn, aim, burn and brake. Start here.'),
  racer: msg('Rings, coils and the perfect start.'),
  gladiator: msg('The laser, free drift and the dogfight.'),
  arsenal: msg('Torpedoes, overdrive, probes, the hook on a ship and the nova core.'),
  tactician: msg('Win the dogfight: dodge, turn, fire in bursts, take cover.'),
};

/** The courses a Host has completed, as this browser keeps them; whatever does not fit is dropped. */
function schoolDone(): Set<SchoolCourse> {
  try {
    const kept: unknown = JSON.parse(storageGet(SCHOOL_DONE_KEY) ?? '[]');
    return new Set(Array.isArray(kept) ? SCHOOL_COURSES.filter((course) => kept.includes(course)) : []);
  } catch {
    return new Set();
  }
}

/** The drill a Host has reached in each course. */
function schoolSteps(): Partial<Record<SchoolCourse, number>> {
  try {
    const kept: unknown = JSON.parse(storageGet(SCHOOL_STEP_KEY) ?? '{}');
    const steps: Partial<Record<SchoolCourse, number>> = {};
    if (kept && typeof kept === 'object') for (const course of SCHOOL_COURSES) if (Number.isInteger((kept as Record<string, unknown>)[course])) steps[course] = (kept as Record<string, number>)[course];
    return steps;
  } catch {
    return {};
  }
}
/** The solo round a Host chose last: mode, arena (none: by chance) and rivals. */
const SOLO_KEY = 'solartournament.solo';
/** The best lap of each arena's course, with its ghost (see game/laps). */
const LAPS_KEY = 'solartournament.laps';

/** What a solo round plays: a race unless the Host asks for another mode, its arena (null: by chance), and the bots it flies against: a full grid unless the Host picks fewer (the rivals chosen set how fast and how hard it is). */
type SoloChoice = { mode: RoundMode; arena: ArenaId | null; rivals: string[] };
const SOLO_DEFAULT: SoloChoice = { mode: 'race', arena: null, rivals: ['Laika', 'Sputnik', 'Juno', 'Ceres', 'Kessler', 'Orion', 'Vega'] };
const SOLO_NOTES: Record<RoundMode, string> = {
  race: msg('Three laps through eight gates. Killing your opponents is explicitly allowed.'),
  deathmatch: msg('For the hard pilots: five minutes, every clone for itself.'),
  survival: msg('{clones} clones each. A solar flare sweeps in from the sun and drives everyone to the far side. The last clone standing wins.'),
  flag: msg('Orange against Blue, bots on both sides. Steal their sponsor core, bring it home, keep yours.'),
  fleet: msg('The President wants blood and sends a battleship into the ring. Because he can. Everyone against it: sink it before the time runs out.'),
};

/** The solo choice kept in this browser, checked: whatever does not fit falls back to the default. */
function loadSolo(): SoloChoice {
  try {
    const kept = JSON.parse(storageGet(SOLO_KEY) ?? '{}') as Partial<SoloChoice>;
    return {
      mode: kept.mode && ROUND_MODES.includes(kept.mode) ? kept.mode : SOLO_DEFAULT.mode,
      arena: ARENAS.some((a) => a.id === kept.arena) ? kept.arena! : null,
      rivals: Array.isArray(kept.rivals) ? BOT_NAMES.filter((n) => kept.rivals!.includes(n)).slice(0, TOURNAMENT_SIZE - 1) : [...SOLO_DEFAULT.rivals],
    };
  } catch {
    // the choice changes the rivals in place: the default keeps its own
    return { ...SOLO_DEFAULT, rivals: [...SOLO_DEFAULT.rivals] };
  }
}

type State = 'menu' | 'playing' | 'paused' | 'results';
/**
 * What killed a ship without a killer, where this browser saw it happen: a rock, wreckage, deep
 * space, the arena's massive body; or, with a killer, its nova core, its plume, its ram, or a
 * crash right after its shove (a knockout).
 */
type DeathCause = 'rock' | 'wreck' | 'space' | 'well' | 'flare' | 'battery' | 'exhaust' | 'blast' | 'nova' | 'plume' | 'shower' | 'comet' | 'ram' | 'knockout' | null;
/** How the President's battleship killed a ship, for the sponsor break. */
const FLEET_DEATHS: Partial<Record<NonNullable<DeathCause>, string>> = {
  battery: msg("Shot down by the President's battleship"),
  exhaust: msg("Burned up in the battleship's drive plume"),
  blast: msg('Taken along by the battleship'),
};
/** How a comet killed a ship: its head or its shower. */
const COMET_DEATHS: Partial<Record<NonNullable<DeathCause>, string>> = {
  comet: msg('Run down by a comet'),
  shower: msg("Riddled by a comet's shower"),
};
/**
 * A comet's shower (see comet.ts) strikes a ship like a laser, armor or drive by where it comes
 * from, unless rock within SHOWER_COVER (units, 300 m) upstream of the ship stands in its way:
 * cover behind an asteroid is the best answer, the armored nose turned into it the next.
 */
const SHOWER_COVER = 6000;
/** A bot this close to a comet's route (units, 500 m beyond the swarm's width) as the head nears or the swarm passes flies away from it, sideways. */
const COMET_DANGER = 10000;
/** The flight school's comet passes the point its drill names this long after the drill sends it (s): 2.25 km off at its speed. */
const DRILL_COMET_LEAD = 15;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** The label of a menu mode button: the text of its first line, without the Enter key. */
const modeName = (id: string) => $(id).querySelector<HTMLElement>('.mode-label')!;

/** One of several lines, at random; only the local voice says it. */
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const scratch = new THREE.Vector3();
const forward = new THREE.Vector3();
const upward = new THREE.Vector3();
const facing = new THREE.Matrix4();
const muzzle = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();
const introTarget = new THREE.Vector3();
const introFrom = new THREE.Vector3();
const introUp = new THREE.Vector3();
const look = new THREE.Matrix4();
const aim = new THREE.Quaternion();
const gravity = new THREE.Vector3();
const retrograde = new THREE.Vector3();
const normal = new THREE.Vector3();
const relative = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const toAim = new THREE.Vector3();
const assistSteer = { yaw: 0, pitch: 0 };
const sweep = new THREE.Vector3();
const surface = new THREE.Vector3();
const ringFacing = new THREE.Vector3();
const cometHead = new THREE.Vector3();
const cometVelocity = new THREE.Vector3();
const cometOffset = new THREE.Vector3();
const cometPiece = new THREE.Vector3();
const cometCover = new THREE.Vector3();
const cometRelative = new THREE.Vector3();
const cometAway = new THREE.Vector3();
const cometCourse = new THREE.Vector3();
/** The velocity of what does not move: a ring of the tournament holds its place. */
const STILL = new THREE.Vector3();
/** Two ships in contact: the way from the first to the second, and where they touch. */
const ramApart = new THREE.Vector3();
const ramPoint = new THREE.Vector3();
const VENT_COLOR = new THREE.Color(1, 0.6, 0.25);
/** The beams of the flight school's gunner: red, the color of danger. */
const DRILL_GUNNER_COLOR = new THREE.Color(1, 0.2, 0.25);
/** Axes of the rotation thrusters in ship space, and the lever of each pair as a share of the ship radius: nose and tail for pitch and yaw, the wing tips for roll. */
const TURN_AXES = ['x', 'y', 'z'] as const;
const TURN_AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const TURN_LEVERS = { x: new THREE.Vector3(0, 0, 0.6), y: new THREE.Vector3(0, 0, 0.6), z: new THREE.Vector3(0.5, 0, 0) };
const TURN_ENDS = [1, -1];
const SCRAPE_COLOR = new THREE.Color(1, 0.7, 0.3);
/** The sparks of a hit the plating takes: the plating probe's blue. */
const PLATING_COLOR = new THREE.Color(0.3, 0.57, 1);
/** The sparks of a gate's coil firing: hot white. */
const BOOST_COLOR = new THREE.Color(1, 0.9, 0.75);

/** The solo plate's camera drifts around the chosen arena's landmark this fast (rad/s, a turn in about three and a half minutes). */
const PREVIEW_DRIFT = 0.03;
/** It shows the landmark this share of the screen's width left of the middle, beside the plate. */
const PREVIEW_SHIFT = 0.3;
const UP = new THREE.Vector3(0, 1, 0);
/** A bot's skills as small scales of five pips each, for the solo plate: what it can, at a glance. */
const SKILL_NAMES: [keyof Skills, string][] = [
  ['aim', msg('Aim')],
  ['reflexes', msg('Reflexes')],
  ['daring', msg('Daring')],
];
const skillScales = (skills: Skills) =>
  `<span class="skills">${SKILL_NAMES.map(([key, name]) => {
    const pips = Math.round(skills[key] * 5);
    const label = t(name);
    return `<span class="skill" aria-label="${t('{skill} {pips} of 5', { skill: label, pips })}"><span>${label}</span><span class="pips">${'<i class="on"></i>'.repeat(pips)}${'<i></i>'.repeat(5 - pips)}</span></span>`;
  }).join('')}</span>`;

/** A sum of Solar Coins as the Host's language writes it (1,000 / 1.000 / 1 000). */
const coinText = (coins: number) => coins.toLocaleString(currentLocale());

/** A hook's anchor, the owner's nose and the cable's far end this frame. */
const hookPoint = new THREE.Vector3();
const hookNose = new THREE.Vector3();
const hookVelocity = new THREE.Vector3();
const hookEnd = new THREE.Vector3();

/** The part of the battleship the HUD marks, how far a battery's beam misses, and the point of the plume a bot flies away from. */
const fleetGoal = new THREE.Vector3();
const missBy = new THREE.Vector3();
const plumeAxis = new THREE.Vector3();

/** A solar flare's plasma center, the point of its front nearest the camera, an ember's drift, and the middle of a new clone's places. */
const flareAt = new THREE.Vector3();
const frontPoint = new THREE.Vector3();
const emberDrift = new THREE.Vector3();
const spawnMiddle = new THREE.Vector3();

/** Within this distance of a solar flare's front (units, 1 km) the camera sees embers blown off it. */
const EMBER_REACH = 20000;
/** Within this distance of the front (units, 400 m) a bot flies away from it before anything else. */
const FLARE_FLEE = 8000;
/** Within this distance of the front (units, 600 m: about 20 s of its advance) the own pilot hears its WARNING. */
const FLARE_WARNING = 12000;
/** The Host's screen glows with the flare's heat from this distance outside the front (units, 300 m) to full inside it. */
const FLARE_GLOW = 6000;

/** Where the ghost of the best lap is this frame. */
const ghostPosition = new THREE.Vector3();
const crossingPoint = new THREE.Vector3();
const ghostTurn = new THREE.Quaternion();

/** The turn of a ship at `eye` that looks at `target`, `up` as up; a fresh quaternion for a new clone. */
const lookingAt = (eye: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3) => new THREE.Quaternion().setFromRotationMatrix(facing.lookAt(eye, target, up));

/** 1st, 2nd, 3rd, 4th … */
const ordinal = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? t('{n}st', { n }) : n % 10 === 2 && n % 100 !== 12 ? t('{n}nd', { n }) : n % 10 === 3 && n % 100 !== 13 ? t('{n}rd', { n }) : t('{n}th', { n });

/** How many clones a ship has left in Last Clone Standing, in words. */
const clonesLeftText = (n: number) => (n === 1 ? t('{n} clone left', { n }) : t('{n} clones left', { n }));

/** The sensors see nothing (a solar storm). */
const blind = () => false;

/** Real time in seconds; unlike game time it never slows down or pauses. */
const wallClock = () => performance.now() / 1000;

export class Game implements OnlineGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 10, CAMERA_FAR);
  private readonly space = new Space();
  private readonly arena = new Arena();
  private readonly belt: Belt;
  readonly field: AsteroidField;
  private readonly effects: Effects;
  private readonly replayEffects: Effects;
  private readonly killcam: KillCam;
  private readonly torpedoes: Torpedoes;
  /** The shells of novas going off (see novaBlast). */
  private readonly shockwaves: { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; born: number }[] = [];
  private readonly shockwaveGeometry = new THREE.SphereGeometry(1, 48, 24);
  /** The item probes of the round (see game/items). */
  private readonly probes = new Probes();
  /** The last picture was the kill cam's. */
  private replaying = false;
  private readonly wrecks = new Wrecks();
  /** The arena the round is played in (see enterArena), and its scenery. */
  private venue: ArenaProfile = ARENAS[0];
  private readonly landmarks = new Landmarks();
  private readonly lensing = new Lensing();
  /** A solar storm blinds the sensors (see STORM_PERIOD). */
  private storming = false;
  private readonly sponsors = new SponsorBreak();
  private readonly hud = new Hud();
  private readonly input: Input;
  private readonly timer = new THREE.Timer();

  private state: State = 'menu';
  time = 0;
  private roundEndsAt = 0;
  /** When the running round started (game time; see setRoundEnd). */
  private roundStartedAt = 0;
  /** Online: when this browser arrived in the running round (game time; see DECIDE_GRACE). */
  private roundArrivedAt = -Infinity;
  /** The same moment on the real-time clock (see setRoundEnd). */
  private roundEndsAtWall = 0;
  /** Online tournament this browser takes part in, or null offline. */
  private online: Online | null = null;
  /** A tournament connection is being set up; every new start or leave counts up the attempt. */
  private connecting = false;
  private joinAttempt = 0;
  /** The tournament this browser is in: its code, name and rules (see net/room). */
  private room: Room | null = null;
  /** The list of tournaments is open; the lobby listens meanwhile. */
  private browsing = false;
  /** The choices of a solo round are open. */
  private choosingSolo = false;
  /** The flight school's plate is open, and the course it starts. */
  private choosingSchool = false;
  private schoolCourse: SchoolCourse = 'basic';
  private solo = loadSolo();
  /** The lobby: open while browsing, or while leading a public tournament (see updateLobby). */
  private lobby: Lobby | null = null;
  private lobbyOpening = false;
  /** The rows of the list of tournaments, by room code (see renderTournaments). */
  private readonly tournamentRows = new Map<string, { item: HTMLLIElement; name: HTMLElement; meta: HTMLElement; join: HTMLButtonElement; listing: Listing }>();
  /** Counts down the time left of the listed tournaments while the list is open. */
  private tournamentClock = 0;
  /** The choices of the form that starts a tournament. */
  private roomPublic = true;
  private roomBots = true;
  private roomMode: RoomMode = 'race';
  /** What the running round is, its course when it is a race, its bases and cores in Capture the Flag. */
  private roundMode: RoundMode = 'deathmatch';
  private course: Course | null = null;
  private flags: Flags | null = null;
  /** The President's battleship in his Fleet, whether its coming has been announced, and the phase it was in. */
  private fleet: Fleet | null = null;
  private fleetCalled = false;
  private fleetPhase = 1;
  /** A point of its own each bot steers by: where a raider swings out before it dives through a core (see raidPoint), the part of a battleship it attacks. */
  private readonly botPoints = new Map<Bot, THREE.Vector3>();
  /** The tournament was full: the own Host watches a pilot (Tab switches, see watchNext) instead of flying. */
  private spectating = false;
  /** The pilot the watching Host follows, when the director cut to it, and until when a pilot picked by hand holds. */
  private watchedShip: Ship | null = null;
  private cutAt = -Infinity;
  private handPickedUntil = -Infinity;
  /** The director's shot of the pilot: the chase camera, or a wide shot from the side. */
  private wideShot = false;
  /** Number of the running online round; a new number resets the scores. */
  roundId = 0;
  /** The round this browser was in when it started over in the tournament (see rejoin), until it knows the round again. */
  private rejoinedFrom: number | null = null;
  private ships: Ship[] = [];
  private bots: Bot[] = [];
  private me: Ship | null = null;
  private cockpit = false;
  /** Cinema mode is on (see toggleCinema). */
  private cinema = false;
  /** What the Host owns (see game/hangar), the ship it flies, the ship on show above the logo, and whether the hangar's plate is open. */
  private readonly hangar = parseHangar(storageGet(HANGAR_KEY));
  private selectedShip: ShipType = this.hangar.ship;
  private shipShown: ShipType = this.hangar.ship;
  private showcase: Showcase | null = null;
  private inHangar = false;
  /** The drive lights, always in the scene; ships borrow them (see lendLight). */
  private readonly engineLights: THREE.PointLight[] = [];
  /** X is held: the flight computer turns the own ship towards `flipGoal`, fixed when the flip started. */
  private flipping = false;
  private readonly flipGoal = new THREE.Vector3();
  /** The nose points at the flip's goal (it beeps once when it gets there). */
  private flipAligned = false;
  /**
   * The autopilot flies the own ship by its path (see PathSteering): the stick turns the flight,
   * and drive and thrusters bend it; slower than 20 m/s, or looking elsewhere, the stick turns the
   * nose and the thrusters take out every drift across it. On at the start of a round; T switches
   * to free drift and back.
   */
  private autopilot = false;
  private readonly steering = new PathSteering();
  /** How much the bots go easy on the Host in a solo round, 0..1 (see DEATH_EASE). */
  private ease = 0;
  /** The nose is on a ship: the laser would hit now (see assistAim). */
  private onTarget: 'drive' | 'armor' | null = null;
  /** Angle between the nose and the aim target (see aimTarget). */
  private aimAngle = 0;
  /** Strength of the camera jolt after the own laser hit something, 0..2. */
  private kick = 0;
  /** Strength of the widened view after a coil boost, 0..1. */
  private boostKick = 0;
  /** The number of a race's countdown last shown (0 once the race runs; see startCountdown). */
  private countdown = 0;
  /** The clamps of a round's opening hold every ship (see startCountdown). */
  private clamped = false;
  /** The start lights on (see startCountdown). */
  private lightsOn = 0;
  /** The round's intro is running, and whether the Host skipped it (the camera comes home then). */
  private introOpen = false;
  private introSkipped = false;
  /** The announcer has opened the broadcast of this round (the intro does; else a cue does, see startRound). */
  private broadcastOpened = false;
  /** The own drive is lit, and since when (round time, s); the perfect start is still to be judged. */
  private driveLit = false;
  private driveLitAt = -Infinity;
  private startOpen = false;
  /** What the race calls have said (see callRace): the leader, the last lap and the winner, the own place, when Nicole may name a pass again. */
  private leader: Ship | null = null;
  private lastLapCalled = false;
  private winCalled = false;
  private place = -1;
  private nextPlaceCall = 0;
  /** The radio is opened up for the own last lap. */
  private pushed = false;
  /** What Last Clone Standing has said: the flare coming, the last one standing. */
  private flareCalled = false;
  private survivorCalled = false;
  /** The solar flare's plasma as the screen shows it. */
  private readonly flare = new FlareView();
  /** The flare's safe pocket this frame (see flarePocket): its middle and radius (units). */
  private readonly pocket = new THREE.Vector3();
  private pocketRadius = ARENA_LIMIT;
  /** When each ship lost its last clone (game time, s): who held out longer places higher. */
  private readonly outAt = new Map<Ship, number>();
  /** The velocity of the ship the camera rides with, for the dust's streaks; null without one. */
  private riding: THREE.Vector3 | null = null;
  /** The own drive burned in the last frame (see ignite). */
  private burning = false;
  /** When the next dodge is ready (game time, s). */
  private dodgeReadyAt = 0;
  /** When the own ship last got a close call (game time, s), and from which rock. */
  private lastCloseCall = -Infinity;
  /** Rocks that paid a close call and stay unpaid until the ship has left them behind. */
  private readonly closeCalls = new Set<string>();
  /** The rock the own ship is passing close by, and whether it touched it. */
  private closePass: { id: string; touched: boolean } | null = null;
  /** When the own ship last touched a rock (game time, s). */
  private lastScrape = -Infinity;
  /** When the overdrive can fire again (game time, s). */
  private overdriveReadyAt = 0;
  /** The brake has brought the ship to rest (it beeps once). */
  private braked = false;
  /** The brake is flipping the ship to burn (see BRAKE_FINE). */
  private brakeFlip = false;
  /** The flight computer's output, reused from frame to frame. */
  private readonly computed: Controls = { ...IDLE };
  /**
   * The own clone's alarms, raised anew every frame (see game/alarms.ts); any part of the game
   * raises its own danger here, and the HUD and the headset show the worst.
   */
  readonly alarms = new Alarms();
  private readonly alarmTones = new AlarmTones();
  /** How far Nicole has warned of a gravity well (an alarm rank, 4: past return), reset once the pull lets go. */
  private wellSaid = 0;
  private hullWarned = false;
  /** When the radio may fall silent again before an imminent death. */
  private silenceReadyAt = 0;
  /** Whether the camera sees a ship past the asteroids, for the HUD markers. */
  private readonly inSight = (ship: Ship) => this.field.lineOfSight(this.camera.position, ship.flight.position);
  /** Whether the own ship's sensors see a ship past the asteroids, for the radar. */
  private readonly sensed = (ship: Ship) => this.field.lineOfSight(this.subject().flight.position, ship.flight.position);
  private readonly radar = new Radar($<HTMLCanvasElement>('radar'));
  /** The radar's marks besides ships and rocks, reused from frame to frame. */
  private readonly marks: RadarMark[] = [
    { position: new THREE.Vector3(), label: t('Center'), color: '#4d91ff' },
    { position: new THREE.Vector3(), label: '', color: '#ff9d00' },
  ];
  private readonly torpedoMarks: RadarMark[] = Array.from({ length: 16 }, () => ({ position: new THREE.Vector3(), label: t('Torpedo'), color: '#ff3b30' }));
  private readonly probeMarks: RadarMark[] = Array.from({ length: 12 }, () => ({ position: new THREE.Vector3(), label: '', color: '#3dff9a' }));
  /** Capture the Flag: each side's base and core, in its color. */
  private readonly flagMarks: RadarMark[] = TEAM_NAMES.flatMap((name, team) => [
    { position: new THREE.Vector3(), label: t('{side} base', { side: t(name) }), color: TEAM_TINTS[team] },
    { position: new THREE.Vector3(), label: t('{side} core', { side: t(name) }), color: TEAM_TINTS[team] },
  ]);
  /** The President's battleship, in the regime's red. */
  private readonly fleetMark: RadarMark = { position: new THREE.Vector3(), label: t('Battleship'), color: '#ff2a3a' };
  /** The comet of the round as the scene shows it, and on the radar. */
  private readonly cometView = new CometView();
  private readonly cometMark: RadarMark = { position: new THREE.Vector3(), label: t('Comet'), color: '#bfe6ff' };
  /** The comets of the round (see cometsOf), and of which room, round and arena they are. */
  private comets: Comet[] = [];
  private cometsOfKey = '';
  /** The flight school's comet, when a drill sends one. */
  private drillComet: Comet | null = null;
  /** The comet the flight computer has warned of, and the one whose shower flies now. */
  private cometCalled: Comet | null = null;
  private shower: Shower | null = null;
  /** The pieces of the shower that already struck each ship: one strikes a ship once. */
  private readonly struck = new Map<Ship, Uint8Array>();
  /** The ship holding a nova core, in white, so everyone sees where not to be. */
  private readonly novaMark: RadarMark = { position: new THREE.Vector3(), label: t('NOVA'), color: '#ffffff' };
  /** A solar flare: the nearest point of its front in the sun's orange, the safe pocket in the information blue. */
  private readonly flareMarks: RadarMark[] = [
    { position: new THREE.Vector3(), label: t('Flare'), color: '#ff9d00' },
    { position: new THREE.Vector3(), label: t('Safe zone'), color: '#4d91ff' },
  ];
  /** The marks the radar shows this frame (see radarMarks). */
  private readonly shownMarks: RadarMark[] = [];
  /** How the own clone died last, for the sponsor break. */
  private deathCause: string | (string | Node)[] = t('Your clone is dead');
  /** When the current screen (menu, playing, paused, results) came up (performance.now, ms). */
  private screenSince = 0;
  /** When the standings held open with Tab are written next (real time, s). */
  private standingsAt = 0;
  /** Online round whose scoreboard has been shown and announced. */
  private resultsShownFor: number | null = null;
  /** Rock hits from other browsers for a round this browser has not started yet. */
  private readonly pendingRocks: { id: string; at: number; round: number }[] = [];
  /** Rocks this browser's ships broke online: when, by whom, for how many points, and where the rock was and how far it reached. */
  private readonly brokenHere = new Map<string, { at: number; ship: Ship; points: number; position: THREE.Vector3; radius: number }>();
  /** The last hit this browser's ships landed on each rock online that did not break it: when, by whom. */
  private readonly lastRockHit = new Map<string, { at: number; ship: Ship }>();
  /** The running flight school, or null in a tournament round. */
  private school: FlightSchool | null = null;
  private schoolContext: SchoolContext | null = null;
  /** Torpedoes the own pilot has shot down, for the flight school's drill. */
  private torpedoesDown = 0;
  /** Torpedoes of the own pilot that hit a ship, for the flight school's drill. */
  private torpedoesHit = 0;
  /** Dodges the own pilot has fired, for the flight school's drill. */
  private dodges = 0;
  /** The flight school's line to its marker (see lineTo). */
  private schoolLine: { line: RacingLine; next: number; to: THREE.Vector3 } | null = null;
  /** Target drone of the flight school. */
  private drone: Ship | null = null;
  /** G-force strain of the own pilot, 0..1. */
  private strain = 0;
  private nextHeartbeat = 0;
  /** The nova holder the own pilot was last warned about. */
  private novaWarned: Ship | null = null;
  private novaFlashTimer = 0;
  /** Things to say and show a little after a round started (see cue). */
  private readonly cues: { at: number; run: () => void }[] = [];
  /** Speed of game time; 0 freezes the simulation while rendering continues. */
  timeScale = 1;
  /** The picture has to be drawn again even in a still pause (see frame). */
  private redraw = true;
  private glitched = false;
  private readonly glitch = new Glitch();
  private readonly datamosh = new Datamosh(this.camera);
  /** The racing line to the next gate. */
  private readonly guide = new GuideLine();
  /** The hooks out, by the ship that fired them, and their cables (see game/hook); when the own hook is ready again, and whether it was held last frame. */
  private readonly tethers = new Map<Ship, Tether>();
  private readonly cables = new Cables();
  private hookReadyAt = 0;
  private hookHeld = false;
  /** The own ship was let go by its hook: until then the flight computer turns it onto its new course (see FLING_SECONDS). */
  private flungUntil = 0;
  /** The own laps in a race, against the best lap of the arena, and its ghost. */
  private laps: LapTimer | null = null;
  private readonly ghost = new Ghost();
  private readonly radio: Radio;
  /** The stadium on Earth, heard through the broadcast (see Crowd). */
  private readonly crowd: Crowd;
  /** The flight computer's voice: reads out what the screen shows. */
  private readonly speaker: Speaker;
  /** Nicole's briefings and tips in real rounds. */
  private readonly coach = new Coach();
  /** The own pilot's streaks and grudges, for its big moments. */
  private readonly moments = new Moments();
  /** The development log (see devlog.ts): `game.log` in the console; null in production. */
  readonly log = devlog;
  /** The rings of the round (see Bot.rings). */
  private rings: Ring[] = [];
  /** The race's gate a ship touched last (see touchesRing), -1 for none: where a gate crash happened, for the log. */
  private gateStruck = -1;
  /** The impact warning is on (the flight school watches it). */
  private impactAhead = false;
  /** The flight school's sparring bot, and whether it may fire. */
  private sparring: { bot: Bot; armed: boolean } | null = null;
  /** The pilot has been told to return to the field during this excursion. */
  private toldToReturn = false;
  /** Song of the running solo round. */
  private soloSeed = 1;
  /** Clock of the lounge song in the menu (s). */
  private readonly loungeEpoch = wallClock();
  private nextIdleGlitch = 0;
  private radioTitleTimer = 0;
  /** Real time before which the announcer stays quiet (s). */
  private nextAnnouncement = 0;
  /** The name the announcer's current line is about, for the subtitle. */
  private announcedName: string | null = null;

  constructor(
    container: HTMLElement,
    private readonly assets: Assets,
    private readonly sound: Sound,
  ) {
    // no multisampled canvas: the composer draws the scene into its own targets and only puts
    // the finished picture on the canvas, so the canvas's samples would smooth nothing
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.append(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    // the scene's depth stays readable, so the black hole's lens bends only what lies behind it
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) target.depthTexture = new THREE.DepthTexture(1, 1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.lensing.pass);
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.88));
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.datamosh);
    this.composer.addPass(this.glitch.pass);
    this.glitch.onStatic = (strength) => this.sound.crackle(strength);
    this.radio = new Radio(sound.context, sound.headset, (song) => this.announceSong(song), (spoken, delay) => this.subtitle(spoken, delay));
    this.crowd = new Crowd(sound.context, this.radio.input);
    this.speaker = new Speaker(sound.context, sound.headset);
    this.speaker.prepare();

    this.scene.background = new THREE.Color(0x01020a);
    this.field = new AsteroidField(assets.fieldSets);
    this.belt = new Belt(assets.belt);
    this.effects = new Effects(assets.textures);
    // the kill cam fires the beams of its replay in effects of their own
    this.replayEffects = new Effects(assets.textures);
    this.replayEffects.group.visible = false;
    this.scene.add(this.replayEffects.group);
    this.killcam = new KillCam(this.replayEffects);
    this.torpedoes = new Torpedoes(this.effects);
    this.scene.add(this.torpedoes.group, this.probes.group, this.guide.ribbon, this.ghost.root, this.cables.group, this.cometView.root);
    this.scene.add(this.space.sky, this.space.dust, this.space.streaks, this.arena.mesh, this.belt.group, this.landmarks.group, this.flare.mesh, this.space.lights, this.field.group, this.wrecks.group, this.effects.group);
    for (let i = 0; i < ENGINE_LIGHTS; i++) {
      const light = new THREE.PointLight(0x88bbff, 0, 2500, 2);
      this.engineLights.push(light);
      this.scene.add(light);
    }

    this.input = new Input(this.renderer.domElement);
    this.input.onAction((action) => this.onAction(action));
    this.bindMenu();
    // the controls and the pause screen name the keys as the Host's keyboard prints them
    void learnKeyboardLayout().then(() => {
      for (const key of document.querySelectorAll<HTMLElement>('.controls dt, #pause kbd')) key.textContent = keyLabel(key.textContent ?? '');
    });

    window.addEventListener('resize', () => this.resize());
    // a hidden tab runs no frames: a solo round pauses instead of running out unseen
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing' && !this.online) this.pause();
    });
    this.resize();
    this.showMenu();
    this.timer.connect(document);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private bindMenu() {
    const callsign = $<HTMLInputElement>('callsign');
    callsign.value = storageGet(CALLSIGN_KEY) ?? '';
    callsign.placeholder = t('Host');
    // the languages, each named in itself
    $('languages').append(
      ...LOCALES.map((locale) => {
        const button = Object.assign(document.createElement('button'), { type: 'button', textContent: LOCALE_NAMES[locale], lang: locale });
        button.classList.toggle('selected', locale === currentLocale());
        button.addEventListener('click', () => chooseLocale(locale));
        return button;
      }),
    );
    // the ship on show above the logo, and the hangar
    this.showcase = new Showcase($<HTMLCanvasElement>('crest'), this.assets);
    $('ship-prev').addEventListener('click', () => this.turnShowcase(-1));
    $('ship-next').addEventListener('click', () => this.turnShowcase(1));
    $('hangar').addEventListener('click', () => this.showHangar(true));
    $('hangar-back').addEventListener('click', () => this.showHangar(false));
    this.renderShowcase();
    // the modes to choose from, for a solo round and for a room, each a button with its name
    for (const [choice, modes] of [['solo-mode', ROUND_MODES], ['room-mode', [...ROUND_MODES, 'mixed']]] as const) {
      document.querySelector(`[data-choice="${choice}"]`)!.append(
        ...modes.map((mode) => {
          const button = Object.assign(document.createElement('button'), { type: 'button', textContent: t(MODE_NAMES[mode]) });
          button.dataset.value = mode;
          button.classList.toggle('selected', mode === this.roomMode);
          return button;
        }),
      );
    }
    $('start').addEventListener('click', () => this.showSolo(true));
    this.buildSolo();
    $('school').addEventListener('click', () => this.showSchool(true));
    $('school-back').addEventListener('click', () => this.showSchool(false));
    this.buildSchool();
    $('online').addEventListener('click', () => this.openOnline());
    $('room-create').addEventListener('click', () => this.createTournament());
    $('tournaments-back').addEventListener('click', () => this.showTournaments(false));
    // two pairs of switches: who can find the tournament, and whether bots fill it
    const choose = (on: string, off: string, set: (value: boolean) => void, value: boolean) =>
      $(on).addEventListener('click', () => {
        set(value);
        $(on).classList.add('selected');
        $(off).classList.remove('selected');
        this.describeRoom();
      });
    choose('room-public', 'room-private', (v) => (this.roomPublic = v), true);
    choose('room-private', 'room-public', (v) => (this.roomPublic = v), false);
    choose('room-bots', 'room-nobots', (v) => (this.roomBots = v), true);
    choose('room-nobots', 'room-bots', (v) => (this.roomBots = v), false);
    // the rounds of a room: three choices that keep their value in data-value
    const modes = document.querySelectorAll<HTMLButtonElement>('[data-choice="room-mode"] button[data-value]');
    for (const button of modes) {
      button.addEventListener('click', () => {
        modes.forEach((b) => b.classList.toggle('selected', b === button));
        this.roomMode = button.dataset.value as RoomMode;
        this.describeRoom();
      });
    }
    this.describeRoom();
    $('resume').addEventListener('click', () => this.resume());
    $('quit').addEventListener('click', () => this.endRound());
    $('again').addEventListener('click', () => this.showMenu());
    $('invite').addEventListener('click', () => void this.invite());
    $('radio').addEventListener('click', () => this.toggleRadio());
    bindVolume($<HTMLInputElement>('radio-volume'));
    // the slider hands the focus back once let go, so Enter and Space go to the game again
    $('radio-volume').addEventListener('change', () => $('radio-volume').blur());
    for (const id of ['fullscreen', 'fullscreen-pause']) {
      $(id).hidden = !document.fullscreenEnabled;
      $(id).addEventListener('click', () => this.toggleFullscreen());
    }
    document.addEventListener('fullscreenchange', () => {
      for (const id of ['fullscreen', 'fullscreen-pause']) $(id).textContent = document.fullscreenElement ? t('Leave fullscreen') : t('Fullscreen');
    });
    this.showRadioState();

    if (this.invitedRoom()) modeName('online').textContent = t('Join tournament');
    this.markLeadMode();
  }

  /**
   * The main action of the menu, started by Enter: joining when invited, the flight school
   * until its basic training is complete, then the solo round.
   */
  private leadMode(): 'online' | 'school' | 'start' {
    if (this.invitedRoom()) return 'online';
    return schoolDone().has('basic') ? 'start' : 'school';
  }

  /** The flight school's plate: one button per course, each with a way to start it over. */
  private buildSchool() {
    for (const course of SCHOOL_COURSES) {
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'mode', id: `school-${course}` });
      button.innerHTML = `<span class="mode-name"><span class="mode-label">${t(COURSE_NAMES[course])}</span></span><span class="mode-note"></span>`;
      button.addEventListener('click', () => this.startSchool(course));
      const reset = Object.assign(document.createElement('button'), { type: 'button', className: 'quiet', textContent: t('Start {course} over', { course: t(COURSE_NAMES[course]) }) });
      reset.addEventListener('click', () => {
        const steps = schoolSteps();
        delete steps[course];
        storageSet(SCHOOL_STEP_KEY, JSON.stringify(steps));
        this.showSchoolProgress();
      });
      $('school-courses').append(button, reset);
    }
  }

  private showSchool(open: boolean) {
    this.choosingSchool = open;
    $('menu').hidden = open || this.state !== 'menu';
    $('school-plate').hidden = !open;
    if (open) $(`school-${this.nextCourse()}`).focus();
  }

  /** The course Enter starts on the school's plate: the first one not completed, or the basic training again. */
  private nextCourse(): SchoolCourse {
    const done = schoolDone();
    return SCHOOL_COURSES.find((course) => !done.has(course)) ?? 'basic';
  }

  private startSchool(course: SchoolCourse) {
    this.schoolCourse = course;
    this.startRound('school');
  }

  /**
   * The flight school says where a Host left off in each course, with a way to start it over,
   * and a course once completed says so for good: a Host who made it through keeps the badge.
   * The menu's button sums it up.
   */
  private showSchoolProgress() {
    const steps = schoolSteps();
    const done = schoolDone();
    for (const course of SCHOOL_COURSES) {
      const button = $(`school-${course}`);
      const step = steps[course] ?? 0;
      const cleared = done.has(course);
      const note = button.querySelector<HTMLElement>('.mode-note')!;
      const drill = { n: step + 1, total: FlightSchool.drillsOf(course) };
      if (step > 0) note.textContent = cleared ? t('Continue at drill {n} of {total}. Completed before.', drill) : t('Continue at drill {n} of {total}.', drill);
      else note.textContent = cleared ? t('✓ Completed.') : t(SCHOOL_NOTES[course]);
      button.classList.toggle('cleared', cleared);
      (button.nextElementSibling as HTMLElement).hidden = step <= 0;
      button.classList.toggle('primary', course === this.nextCourse() && !cleared);
    }
    const cleared = SCHOOL_COURSES.filter((course) => done.has(course)).length;
    const note = $('school').querySelector<HTMLElement>('.mode-note')!;
    note.textContent =
      cleared === SCHOOL_COURSES.length ? t('✓ All courses completed.') : cleared ? t('✓ {n} of {total} courses completed.', { n: cleared, total: SCHOOL_COURSES.length }) : t('Learn to fly. Training clones are free.');
    $('school').classList.toggle('cleared', cleared > 0);
  }

  private markLeadMode() {
    const lead = this.leadMode();
    for (const id of ['school', 'start', 'online'] as const) {
      $(id).classList.toggle('primary', id === lead);
      $(id).querySelector('kbd')?.remove();
    }
    $(lead).querySelector('.mode-name')!.append(Object.assign(document.createElement('kbd'), { textContent: 'Enter' }));
  }

  /**
   * The room of an invitation link (#t=code&n=name…). It travels in the fragment, so it never
   * reaches the web server's logs or another site's Referer header.
   */
  private invitedRoom(): Room | null {
    return roomFromFragment(location.hash);
  }

  /** The plate of a solo round's choices: mode, arena and rivals, kept in this browser. */
  private buildSolo() {
    const choose = (element: HTMLButtonElement, apply: () => void) =>
      element.addEventListener('click', () => {
        apply();
        storageSet(SOLO_KEY, JSON.stringify(this.solo));
        this.renderSolo();
      });
    const button = (html: string, apply: () => void) => {
      const element = Object.assign(document.createElement('button'), { type: 'button', innerHTML: html });
      choose(element, apply);
      return element;
    };
    for (const mode of document.querySelectorAll<HTMLButtonElement>('[data-choice="solo-mode"] button[data-value]')) choose(mode, () => (this.solo.mode = mode.dataset.value as RoundMode));
    $('solo-arenas').append(
      button(t('By chance'), () => (this.solo.arena = null)),
      ...ARENAS.map((arena) => button(`${t(arena.name)}<small>${t(arena.tagline)}</small>`, () => (this.solo.arena = arena.id))),
    );
    $('solo-bots').append(
      ...BOT_NAMES.map((name) =>
        button(`${name}${skillScales(skillsOf(name))}`, () => {
          const rivals = this.solo.rivals;
          if (rivals.includes(name)) rivals.splice(rivals.indexOf(name), 1);
          else if (rivals.length < TOURNAMENT_SIZE - 1) rivals.push(name);
        }),
      ),
    );
    $('solo-launch').addEventListener('click', () => this.startRound('solo'));
    $('solo-back').addEventListener('click', () => this.showSolo(false));
    this.renderSolo();
  }

  /** Marks the solo round's choices. */
  private renderSolo() {
    const { mode, arena, rivals } = this.solo;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-choice="solo-mode"] button[data-value]')) button.classList.toggle('selected', button.dataset.value === mode);
    $('solo-mode-note').textContent = t(SOLO_NOTES[mode], { clones: CLONES });
    [...$('solo-arenas').children].forEach((b, i) => b.classList.toggle('selected', i === 0 ? arena === null : ARENAS[i - 1].id === arena));
    [...$('solo-bots').children].forEach((b, i) => {
      const chosen = rivals.includes(BOT_NAMES[i]);
      b.classList.toggle('selected', chosen);
      b.setAttribute('aria-pressed', String(chosen));
    });
    $('solo-bot-count').textContent = rivals.length ? `· ${rivals.length}` : t('· none: alone against the clock');
  }

  private showSolo(open: boolean) {
    this.choosingSolo = open;
    $('menu').hidden = open || this.state !== 'menu';
    $('solo').hidden = !open;
    // the seal steps back for the arena the plate shows
    $('crest').hidden = open || this.state !== 'menu';
    if (open) $('solo-launch').focus();
  }

  /** The menu's online button: straight into the invited tournament, else the list of tournaments. */
  private openOnline() {
    const invited = this.invitedRoom();
    if (invited) void this.goOnline(invited, false);
    else this.showTournaments(true);
  }

  /**
   * The plate of tournaments: the public ones the lobby hears of, and a form to start one.
   * While it is open this browser listens in the lobby.
   */
  private showTournaments(open: boolean) {
    this.browsing = open;
    $('menu').hidden = open || this.state !== 'menu';
    $('tournaments').hidden = !open;
    clearInterval(this.tournamentClock);
    if (open) {
      this.renderTournaments(this.lobby?.list() ?? []);
      this.tournamentClock = window.setInterval(() => this.renderTournaments(this.lobby?.list() ?? []), 1000);
      $('room-name').focus();
    }
    this.updateLobby();
  }

  /**
   * Shows the public tournaments. Rows stay the same elements while their tournament is
   * listed and only their texts change, so a click or the keyboard focus on a row survives
   * every update.
   */
  private renderTournaments(listings: Listing[]) {
    const list = $('tournament-list');
    if (!listings.length) {
      this.tournamentRows.clear();
      const text = this.lobby?.settled ? t('No public tournament right now. Start one.') : t('Looking for tournaments…');
      const empty = list.querySelector('li.empty');
      if (empty && list.children.length === 1) {
        if (empty.textContent !== text) empty.textContent = text;
      } else {
        list.replaceChildren(Object.assign(document.createElement('li'), { className: 'empty', textContent: text }));
      }
      return;
    }
    list.querySelector('li.empty')?.remove();
    const rows: HTMLLIElement[] = [];
    for (const listing of listings) {
      let row = this.tournamentRows.get(listing.code);
      if (!row) {
        const item = document.createElement('li');
        const info = Object.assign(document.createElement('span'), { className: 'room-info' });
        const name = Object.assign(document.createElement('span'), { className: 'room-name' });
        const meta = Object.assign(document.createElement('span'), { className: 'room-meta' });
        info.append(name, meta);
        const join = Object.assign(document.createElement('button'), { type: 'button' });
        item.append(info, join);
        row = { item, name, meta, join, listing };
        const entry = row;
        join.addEventListener('click', () => void this.goOnline({ code: entry.listing.code, name: entry.listing.name, public: true, bots: entry.listing.bots, mode: entry.listing.mode }, false));
        this.tournamentRows.set(listing.code, row);
      }
      row.listing = listing;
      const minutes = Math.max(0, Math.floor(listing.left / 60));
      const seconds = String(Math.max(0, Math.floor(listing.left % 60))).padStart(2, '0');
      const facts = { mode: t(MODE_NAMES[listing.mode]), hosts: listing.hosts, places: TOURNAMENT_SIZE, left: `${minutes}:${seconds}` };
      const meta = listing.bots ? t('{mode} · {hosts} of {places} Hosts · bots · {left} left', facts) : t('{mode} · {hosts} of {places} Hosts · {left} left', facts);
      const join = listing.hosts >= TOURNAMENT_SIZE ? t('Watch') : t('Join');
      if (row.name.textContent !== listing.name) row.name.textContent = listing.name;
      if (row.meta.textContent !== meta) row.meta.textContent = meta;
      if (row.join.textContent !== join) row.join.textContent = join;
      rows.push(row.item);
    }
    const listed = new Set(listings.map((listing) => listing.code));
    for (const [code, row] of this.tournamentRows) {
      if (listed.has(code)) continue;
      row.item.remove();
      this.tournamentRows.delete(code);
    }
    // the order changes only when it has to, so rows do not move under the pointer
    if (rows.some((row, i) => list.children[i] !== row)) list.append(...rows);
  }

  /** A line under the switches: what the chosen kind of tournament means. */
  private describeRoom() {
    const who = this.roomPublic ? t('Listed here for every Host; anyone can join or watch.') : t('Not listed: only who has your invite link finds it.');
    const bots = this.roomBots ? t("Bots fill the {places} places; every Host who joins takes a bot's place.", { places: TOURNAMENT_SIZE }) : t('No bots: only Hosts fly.');
    const rounds = {
      deathmatch: () => t('Every round a deathmatch.'),
      race: () => t('Every round a race: {laps} laps through {gates} gates, lasers on.', { laps: LAPS, gates: GATES }),
      survival: () => t('Every round Last Clone Standing: {clones} clones each, a solar flare sweeping in from the sun.', { clones: CLONES }),
      flag: () => t('Every round Capture the Flag: Orange against Blue, Hosts spread over both sides.'),
      fleet: () => t("Every round the President's Fleet: every Host and bot together against one of his battleships."),
      mixed: () => t('Every mode in turn, starting with a deathmatch.'),
    }[this.roomMode]();
    $('room-note').textContent = `${who} ${bots} ${rounds} ${t('The link works for good: whoever follows it later starts the tournament again.')}`;
  }

  /** Starts a tournament from the form: a name, public or private, with or without bots, and what its rounds are. */
  private createTournament() {
    const name = $<HTMLInputElement>('room-name').value;
    void this.goOnline(newRoom(name || $<HTMLInputElement>('room-name').placeholder, this.roomPublic, this.roomBots, this.roomMode), true);
  }

  /**
   * The lobby is open while the list of tournaments is shown, or while this browser leads a
   * public tournament and announces it; otherwise it is closed and talks to no relay.
   */
  private lobbyWanted() {
    return this.browsing || this.announcing();
  }

  private announcing() {
    return !!this.online && !!this.room?.public && this.online.isLead;
  }

  private updateLobby() {
    const announcing = this.announcing();
    if (!this.lobbyWanted()) {
      this.lobby?.close();
      this.lobby = null;
      return;
    }
    if (!this.lobby) {
      if (this.lobbyOpening) return;
      this.lobbyOpening = true;
      void Lobby.open(new URLSearchParams(location.search).has('local'))
        .then((lobby) => {
          // the Host may have closed the list while the lobby was opening
          if (!this.lobbyWanted()) {
            lobby.close();
            return;
          }
          this.lobby = lobby;
          lobby.onChange = (listings) => {
            if (this.browsing) this.renderTournaments(listings);
          };
          if (this.browsing) this.renderTournaments(lobby.list());
        })
        .catch((error) => console.warn('Lobby unavailable', error))
        .finally(() => (this.lobbyOpening = false));
      return;
    }
    const left = Number.isFinite(this.roundEndsAt) ? this.roundEndsAt - this.time : ROUND_SECONDS;
    this.lobby.announce(announcing ? { code: this.room!.code, name: this.room!.name, hosts: this.online!.pilots, bots: this.room!.bots, mode: this.room!.mode, left } : null);
  }

  /** Joins a tournament room, then starts playing in it; `created` invites friends at once. */
  private async goOnline(room: Room, created: boolean) {
    if (this.connecting) return;
    this.connecting = true;
    // still inside the click: later, after connecting, the browser would refuse
    if (this.input.touchActive) this.enterFullscreen();
    const attempt = ++this.joinAttempt;
    const button = $<HTMLButtonElement>('online');
    button.disabled = true;
    modeName('online').textContent = t('Connecting…');
    this.notice('');
    let session: Session | null = null;
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}${roomFragment(room)}`);
      // ?local=1 connects tabs of this browser instead of going over the internet
      session = await Session.join(room.code, new URLSearchParams(location.search).has('local'));
      // the Host started something else while the connection was being set up
      if (attempt !== this.joinAttempt) {
        session.leave();
        return;
      }
      this.room = room;
      this.online = new Online(session, this, room.bots);
      this.showTournaments(false);
      this.startRound('online');
      if (created) void this.invite();
    } catch (error) {
      console.error(error);
      // a session that never got going is left at once, so no relay stays connected
      if (this.online) this.showMenu();
      else session?.leave();
      this.notice(t('Could not connect to the tournament. Try again in a moment.'));
      this.speaker.say(COMPUTER.noLink, 'urgent');
    } finally {
      this.connecting = false;
      button.disabled = false;
      modeName('online').textContent = this.invitedRoom() ? t('Join tournament') : t('Online tournament');
      this.markLeadMode();
    }
  }

  /**
   * Fullscreen: the browser's bars cost a phone much of its screen. On touch devices a round
   * goes fullscreen by itself, in landscape where the browser allows it to hold it; the menu
   * and the pause menu have a button for everyone. Browsers without fullscreen for pages
   * (the iPhone's) get it by adding the game to the home screen (manifest.webmanifest).
   */
  private enterFullscreen() {
    const root = document.documentElement;
    if (document.fullscreenElement || !root.requestFullscreen) return;
    root
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => {
        // not allowed here, or no orientation lock: the game plays on as it is
      });
  }

  private toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else this.enterFullscreen();
  }

  castOut() {
    // after the call, so the Host still sees its name on the cheater's line; a Host who has
    // left that tournament meanwhile is not taken out of what it does now
    const tournament = this.online;
    window.setTimeout(() => {
      if (!tournament || this.online !== tournament) return;
      this.showMenu();
      this.notice(t('The other Hosts named you a cheater and cast you out of the tournament.'));
    }, CAST_OUT_MS);
  }

  /** A line in the menu for what went wrong; empty hides it. */
  private notice(text: string) {
    $('menu-notice').textContent = text;
    $('menu-notice').hidden = !text;
  }

  /**
   * All places are taken by Hosts who came first: the own clone watches a pilot of the
   * tournament (Tab switches) until a place comes free, then it is printed and flies.
   */
  spectate(watching: boolean) {
    const me = this.me!;
    this.spectating = watching;
    if (watching) {
      me.alive = false;
      me.root.visible = false;
      me.respawnAt = Infinity;
      this.cockpit = false;
      this.endSponsorBreak();
    } else {
      this.respawn(me);
    }
  }

  /** A sponsor break in progress ends without booting a clone; HUD and mouse come back. */
  private endSponsorBreak() {
    if (!this.sponsors.visible) return;
    this.sponsors.hide();
    if (this.state === 'playing') {
      this.hud.show(true);
      this.input.steerWithMouse(true);
    }
  }

  /** The pilot a watching Host follows (see direct). */
  private watched(): Ship | null {
    // a ship that left the tournament is no longer among the ships, though its clone was alive
    return this.watchedShip?.alive && this.ships.includes(this.watchedShip) ? this.watchedShip : null;
  }

  /** The ship the screen shows: the pilot a watching Host follows, else the own one. */
  private subject(): Ship {
    return (this.watching() ? this.watched() : null) ?? this.me!;
  }

  /** Tab while watching: the pilot after the one on screen, held for a while. */
  private watchNext() {
    const pilots = this.ships.filter((ship) => ship !== this.me && ship.alive);
    if (!pilots.length) return;
    const current = this.watched();
    this.watchedShip = pilots[(current ? pilots.indexOf(current) + 1 : 0) % pilots.length];
    this.cutAt = this.time;
    this.handPickedUntil = this.time + DIRECTOR_PAUSE;
  }

  /**
   * The director of the broadcast a watching Host sees: it follows the pilot in the thick of
   * it (another ship close, one on its tail, its nose on an enemy, its hull battered) and cuts
   * to another only after a while, or at once when the followed one dies. Tab picks the next
   * pilot by hand; the director takes over again after a while without a key.
   */
  private direct(now: number) {
    if (!this.watching()) return;
    const pilots = this.ships.filter((ship) => ship !== this.me && ship.alive);
    if (!pilots.length) {
      this.watchedShip = null;
      return;
    }
    // a pilot picked by hand holds a while, as long as its clone lives
    if (now < this.handPickedUntil && this.watched()) return;
    const current = this.watched();
    if (current && now - this.cutAt < DIRECTOR_HOLD) return;
    let best = current;
    let bestScore = current ? this.drama(current) * DIRECTOR_STICK : -Infinity;
    for (const ship of pilots) {
      const score = this.drama(ship);
      if (score > bestScore) {
        best = ship;
        bestScore = score;
      }
    }
    if (best !== current) {
      this.watchedShip = best;
      this.cutAt = now;
      // every other cut is a wide shot
      this.wideShot = !this.wideShot;
    }
  }

  /** How much a pilot is in the thick of it, for the director. */
  private drama(ship: Ship): number {
    let nearest = Infinity;
    let threat = 0;
    for (const other of this.ships) {
      if (other === ship || !other.alive || (this.spectating && other === this.me)) continue;
      const line = relative.subVectors(other.flight.position, ship.flight.position);
      const distance = line.length();
      nearest = Math.min(nearest, distance);
      // its nose on another ship, or another's nose on it from behind
      if (distance < LOCK_RANGE && ship.flight.angleTo(line) < 0.2) threat += 1;
      if (distance < LOCK_RANGE && other.flight.angleTo(line.negate()) < 0.2) threat += ship.tailToward(line) ? 2 : 1;
    }
    return 20000 / (nearest + 2000) + threat + (1 - ship.hull / 100) + (this.course ? ship.gates / GATES : 0);
  }

  /**
   * Invites friends: the phone's share sheet where there is one, else the link to the
   * clipboard. The link names the tournament, so a friend sees where they are going.
   */
  private async invite() {
    const button = $('invite');
    const url = location.href;
    const text = t('Fly with me in the SolarTournament "{name}"', { name: this.room?.name ?? t('Tournament') });
    try {
      if (navigator.share && this.input.touchActive) {
        await navigator.share({ title: 'SolarTournament', text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      button.textContent = t('Invite link copied');
      this.hud.flashMessage(this.time, t('Invite link copied. Send it to your friends.'), 3);
    } catch {
      // no clipboard here, or the share sheet was closed: the link is shown to copy by hand
      button.textContent = url;
    }
  }

  /** Leaves the tournament, and forgets its code, so the menu leads with the own choice again. */
  private leaveOnline() {
    // a connection still being set up is dropped when it arrives
    this.joinAttempt++;
    if (!this.online) return;
    this.online.leave();
    this.online = null;
    this.room = null;
    this.spectating = false;
    this.updateLobby();
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    modeName('online').textContent = t('Online tournament');
  }

  private toggleRadio() {
    this.radio.toggle();
    this.showRadioState();
  }

  private showRadioState() {
    $('radio').classList.toggle('off', !this.radio.enabled);
    $('now-playing').classList.toggle('off', !this.radio.enabled);
    if (!this.radio.enabled) $('radio-title').textContent = t('Radio off');
    else if (this.radio.song) $('radio-title').textContent = this.radio.song.title;
  }

  /** Now playing: the title (the track's seed) stays in view; a new one lights up for a few seconds. */
  private announceSong(song: Song) {
    $('radio-title').textContent = song.title;
    $('radio-style').textContent = `${song.flavor} · ${song.bpm} bpm`;
    $<HTMLAnchorElement>('now-playing-link').href = `radio.html?title=${encodeURIComponent(song.title)}`;
    const box = $('now-playing');
    box.classList.add('fresh');
    clearTimeout(this.radioTitleTimer);
    this.radioTitleTimer = window.setTimeout(() => box.classList.remove('fresh'), 6000);
  }

  /** Whatever the radio says also runs across the screen, in neon, while it is spoken. */
  private subtitle(spoken: Spoken, delay: number) {
    showTransmission(spoken, delay, this.radio.song?.title ?? null, this.announcedName);
  }

  /**
   * The announcer revels in every death: a line about the victim, the president's joy or
   * the dead "alien". Not every death, and never two comments on top of each other.
   */
  private commentOnDeath(victim: Ship, killer: Ship | null, cause: DeathCause) {
    // the flight school is on no broadcast; a death the announcer has no line for goes uncommented
    if (this.school || (!killer && cause !== 'rock' && cause !== 'comet')) return;
    if (wallClock() < this.nextAnnouncement) return;
    const roll = hash(textSeed(victim.id), victim.deaths, 7);
    if (roll % 10 >= 7) return;
    const lines = cause === 'comet' ? ANNOUNCER_COMET_KILL : victim.type === 'alien' && roll % 2 === 0 ? ANNOUNCER_ALIEN : killer ? ANNOUNCER_KILL : ANNOUNCER_ROCK;
    this.announce(lines[(roll >>> 4) % lines.length], victim);
  }

  /**
   * The announcer says a line about a pilot, unless it spoke a moment ago; `always` lines (the
   * last lap, the winner) are said anyway. Bots have rendered names; the clone of a human Host
   * is spoken as "pilot" and shown in the subtitle.
   */
  private announce(line: string, about: Ship, always = false) {
    const now = wallClock();
    if (!always && now < this.nextAnnouncement) return;
    this.nextAnnouncement = now + ANNOUNCER_COOLDOWN;
    const spoken = about.name.toLowerCase();
    this.announcedName = about.name;
    this.radio.announce(line, ANNOUNCER_NAMES.includes(spoken) ? spoken : null);
  }

  /**
   * What a race is worth saying while it runs: the announcer calls a new leader and the
   * leader's last lap, Nicole tells the own pilot its passes and the lead, and the own last
   * lap opens up the radio.
   */
  private callRace(me: Ship) {
    const standings = this.standings();
    const leader = standings[0] ?? null;
    if (leader && leader !== this.leader && leader.gates > 0 && leader.finish < 0) {
      if (this.leader) this.announce(pick(ANNOUNCER_LEAD), leader);
      this.leader = leader;
    }
    if (leader && !this.lastLapCalled && leader.finish < 0 && lapOf(leader.gates) === LAPS) {
      this.lastLapCalled = true;
      this.announce(pick(ANNOUNCER_LAST_LAP), leader, true);
    }
    if (leader && !this.winCalled && leader.finish >= 0) {
      this.winCalled = true;
      this.announce(pick(ANNOUNCER_WIN), leader, true);
    }
    const racing = me.alive && me.finish < 0 && me.gates > 0 && !this.spectating;
    const place = standings.indexOf(me);
    const now = this.time;
    if (racing && this.place >= 0 && place !== this.place && now >= this.nextPlaceCall) {
      const line = place === 0 ? COMPUTER.lead : this.place === 0 ? COMPUTER.lostLead : place < this.place ? COMPUTER.passed : COMPUTER.passedBy;
      if (this.speaker.say(line, 'chatter')) this.nextPlaceCall = now + PLACE_CALL_COOLDOWN;
      if (place < this.place) this.moment(place === 0 ? 'lead' : 'pass');
    }
    this.place = racing ? place : -1;
  }

  /** The own last lap of a race opens up the radio (see Radio.push); anything else leaves it as it is. */
  private pushRadio(on: boolean) {
    if (on === this.pushed) return;
    this.pushed = on;
    this.radio.push(on);
  }

  /**
   * What the radio plays now. A tournament round has its own song on the round clock: online,
   * the room and round number pick it, so every pilot hears the same song at the same beat.
   * The menu plays a calm song on a local clock; the flight school plays nothing (null), so
   * Nicole has the cockpit to herself.
   */
  private musicCue(): MusicCue | null {
    if (this.school) return null;
    const inRound = this.state === 'playing' || this.state === 'results' || (this.state === 'paused' && !!this.online);
    if (inRound && Number.isFinite(this.roundEndsAtWall)) {
      // a browser that started over plays on the round it was in until it hears the round again
      const round = this.roundId < 0 ? (this.rejoinedFrom ?? 0) : this.roundId;
      const seed = this.online ? mixSeed(textSeed(this.online.session.room), round) : this.soloSeed;
      return { title: titleFor(seed), energy: 'round', elapsed: ROUND_SECONDS - (this.roundEndsAtWall - wallClock()), roundLength: ROUND_SECONDS };
    }
    return { title: titleFor(LOUNGE_SEED), energy: 'lounge', elapsed: wallClock() - this.loungeEpoch, roundLength: ROUND_SECONDS };
  }

  /** A blow to the clone shakes the link to it: the picture breaks up, the radio drops out. */
  private linkHit(strength: number, seconds: number) {
    this.glitch.trigger(strength, seconds);
    this.radio.dropout(0.05 + 0.2 * strength);
  }

  private onAction(action: Action) {
    if (action === 'radio') {
      this.toggleRadio();
      return;
    }
    // F1 lays the controls over any screen, the running game included
    if (action === 'help') {
      $('quicksheet').hidden = !$('quicksheet').hidden;
      return;
    }
    // a confirm right after a screen change is a key or button still held from before (the
    // fire button A, Enter for the last screen), not a choice on the new screen
    if (action === 'confirm' && performance.now() - this.screenSince < CONFIRM_LOCK_MS) return;
    switch (this.state) {
      case 'menu':
        // on the list of tournaments Enter starts one and Escape goes back
        if (this.browsing) {
          if (action === 'confirm') this.createTournament();
          if (action === 'back' || action === 'pause') this.showTournaments(false);
          break;
        }
        // on the solo round's choices Enter launches it and Escape goes back
        if (this.choosingSolo) {
          if (action === 'confirm') this.startRound('solo');
          if (action === 'back' || action === 'pause') this.showSolo(false);
          break;
        }
        if (this.inHangar) {
          if (action === 'back' || action === 'pause') this.showHangar(false);
          break;
        }
        // on the flight school's plate Enter starts the next course
        if (this.choosingSchool) {
          if (action === 'confirm') this.startSchool(this.nextCourse());
          if (action === 'back' || action === 'pause') this.showSchool(false);
          break;
        }
        if (action === 'confirm') {
          const lead = this.leadMode();
          if (lead === 'online') this.openOnline();
          else if (lead === 'school') this.showSchool(true);
          else this.showSolo(true);
        }
        break;
      case 'playing':
        if (action === 'pause') this.pause();
        // in the sponsor break the kill cam runs behind the ad: Enter boots the clone
        if (this.sponsors.visible) {
          if (action === 'confirm') this.sponsors.confirm();
          break;
        }
        if (this.killcam.active) {
          if (action === 'confirm') this.killcam.stop();
          break;
        }
        // a watching Host has no cockpit of its own
        if (action === 'camera' && !this.watching()) this.cockpit = !this.cockpit;
        if (action === 'cinema') this.toggleCinema();
        if (action === 'autopilot' && this.me?.alive) this.toggleAutopilot();
        // Enter skips a round's intro
        if (action === 'confirm' && this.introOpen) this.skipIntro();
        // the clamps of the opening hold the overdrive and the torpedoes too
        if (action === 'overdrive' && !this.clamped) this.overdrive();
        if (action === 'torpedo' && !this.spectating && this.me && !this.clamped) this.fireTorpedo(this.me);
        if (action === 'watch' && this.watching()) this.watchNext();
        break;
      case 'paused':
        if (action === 'confirm' || action === 'pause' || action === 'back') this.resume();
        if (action === 'quit') this.endRound();
        break;
      case 'results':
        if (action === 'confirm' || action === 'back') this.showMenu();
        break;
    }
  }

  private setScreen(state: State) {
    if (state !== this.state) this.screenSince = performance.now();
    this.redraw = true;
    this.state = state;
    // the solo plate's view beside it (see updateMenuCamera) ends with the menu
    if (state !== 'menu' && this.camera.view?.enabled) this.camera.clearViewOffset();
    $('menu').hidden = state !== 'menu';
    $('crest').hidden = state !== 'menu';
    $('pause').hidden = state !== 'paused';
    $('results').hidden = state !== 'results';
    // a phone held upright is asked to turn sideways while a round is flown (see #turn-phone)
    document.body.classList.toggle('playing', state === 'playing');
    $('invite').hidden = !this.online;
    $('invite').textContent = t('Invite friends');
    // the A button that changed the screen does not also fire
    this.input.holdFire();
    if (state !== 'playing') this.sponsors.hide();
    this.hud.show(state === 'playing');
    this.input.steerWithMouse(state === 'playing');
    if (state !== 'playing') {
      this.sound.setEngine(0, 0);
      // the look of a nova core belongs to the round; the next frame of play brings it back
      document.body.classList.remove('nova-held', 'alarm-critical');
    }
    if (state === 'menu' || state === 'results') {
      this.datamosh.stop();
      this.guide.hide();
      this.ghost.show(null);
      this.pushRadio(false);
    }
  }

  /**
   * Builds an arena: its field, its sun and scenery. A field restored from a snapshot is
   * built by the snapshot (see restoreField) and only takes the rest here; `keepWreckage`
   * keeps the wreckage and torpedoes in flight, for the same arena rebuilt with another course.
   */
  private enterArena(arena: ArenaProfile, state?: FieldState, keepWreckage = false) {
    // the rocks a hook held are gone with the field
    this.clearHooks();
    this.venue = arena;
    devlog?.begin(this.roundMode, arena.id);
    this.field.generate(arena.layout);
    // a race's course is laid out in the field as generated, the same on every browser
    if (this.course) {
      this.scene.remove(this.course.root);
      this.course.dispose();
    }
    this.course = this.roundMode === 'race' ? new Course(this.field, arena.layout.seed) : null;
    if (this.course) this.scene.add(this.course.root);
    // so are the bases of Capture the Flag; the sides are the lead browser's to give
    if (this.flags) {
      this.scene.remove(this.flags.root);
      this.flags.dispose();
    }
    this.flags = this.roundMode === 'flag' ? new Flags(this.field, arena.layout.seed) : null;
    if (this.flags) this.scene.add(this.flags.root);
    // the rings the bots steer clear of: the race's gates, the bases
    const course = this.course;
    this.rings = course ? course.points.map((center, i) => ({ center, facing: course.normals[i], radius: GATE_RADIUS })) : (this.flags?.bases.map((center) => ({ center, facing: center.clone().normalize(), radius: BASE_RADIUS })) ?? []);
    // and the President's battleship, which comes in from a side that follows from the arena
    if (this.fleet) {
      this.scene.remove(this.fleet.root);
      this.fleet.dispose();
    }
    this.fleet = this.roundMode === 'fleet' ? new Fleet(arena.layout.seed) : null;
    if (this.fleet) this.scene.add(this.fleet.root);
    // its hull hides what is behind it and stops torpedoes
    this.field.obstacle = this.fleet;
    this.fleetCalled = false;
    this.fleetPhase = 1;
    // against the President every ship is on one side
    for (const ship of this.ships) ship.team = this.fleet ? 0 : -1;
    // the course of an arena is always the same: its best lap and ghost race along
    this.laps = this.course ? new LapTimer(parseLaps(storageGet(LAPS_KEY))[arena.id] ?? null) : null;
    this.leader = null;
    this.lastLapCalled = this.winCalled = false;
    this.flareCalled = this.survivorCalled = false;
    this.outAt.clear();
    this.flare.hide();
    this.pocket.set(0, 0, 0);
    this.pocketRadius = ARENA_LIMIT;
    this.place = -1;
    if (state) this.field.restore(state, arena.layout);
    this.space.setSun(arena.sun);
    setGlint(arena.sun.intensity);
    this.landmarks.show(arena);
    this.belt.group.visible = arena.id === 'belt';
    if (!keepWreckage) {
      this.wrecks.clear();
      this.torpedoes.clear();
    }
    this.storming = false;
  }

  /** The lead browser's field: built in the arena it names, which a joining browser may not know to be in yet. */
  restoreField(state: FieldState) {
    const arena = arenaByKey(state.k);
    if (arena) this.enterArena(arena, state);
  }

  /** The arena of the running online round, from the room and the round number. */
  private roundArena(): ArenaProfile {
    return arenaOfRound(this.online!.session.room, Math.max(0, this.roundId));
  }

  /** Shows where the round is played and what it is: the arena's name, a race's laps, what makes the arena special; the opening's intro card says it while it runs. */
  private announceArena() {
    if (this.introOpen || (!this.school && Number.isFinite(this.roundEndsAt) && this.raceTime() < START_AT)) return;
    const venue = { arena: t(this.venue.name), tagline: t(this.venue.tagline), laps: LAPS, gates: GATES };
    this.hud.flashMessage(this.time, this.roundMode === 'race' ? t('{arena} · Race: {laps} laps through {gates} gates · {tagline}', venue) : `${venue.arena} · ${venue.tagline}`, 5);
  }

  /** What an online round is, by the room's rule and the round number. */
  private onlineRoundMode(): RoundMode {
    return modeOfRound(this.room?.mode ?? 'deathmatch', Math.max(0, this.roundId));
  }

  /** Points for a kill: less in a race, where the gates and the finish decide. */
  private killPoints() {
    return this.roundMode === 'race' ? RACE_KILL_POINTS : KILL_POINTS;
  }

  /**
   * The round's time is up: online the scoreboard shows over the running game until the next
   * round, and meanwhile nothing scores and no mode's rule moves on (no gate, core or part of
   * the battleship counts), so the scoreboard stays what was paid out.
   */
  private get roundOver() {
    return this.time >= this.roundEndsAt;
  }

  /** The running round is Last Clone Standing (see survival.ts). */
  private get survival() {
    return this.roundMode === 'survival';
  }

  /** A ship that lost its last clone in Last Clone Standing: no clone of it is printed again this round. */
  private out(ship: Ship) {
    return this.survival && isOut(ship);
  }

  /** The own Host watches the others instead of flying: the tournament is full, or its last clone is dead. */
  private watching() {
    return this.spectating || (!!this.me && this.out(this.me));
  }


  private showMenu() {
    this.leaveOnline();
    this.clearShips();
    // the hangar is no race: no gates behind the menu
    this.roundMode = 'deathmatch';
    this.enterArena(ARENAS[0]);
    const best = Number(storageGet(BEST_SCORE_KEY) ?? 0);
    $('best-score').textContent = best ? t('Personal best: {points} pts', { points: best }) : '';
    this.showSchoolProgress();
    this.markLeadMode();
    // a clone that died last leaves no muffled radio behind in the hangar
    this.radio.setMuffled(false);
    $('now-playing').hidden = false;
    this.setScreen('menu');
  }

  private clearShips() {
    this.killcam.stop();
    this.clearShockwaves();
    this.cues.length = 0;
    this.torpedoes.clear();
    this.probes.reset();
    this.wrecks.clear();
    this.brokenHere.clear();
    this.lastRockHit.clear();
    for (const ship of this.ships) {
      this.returnLight(ship);
      this.scene.remove(ship.root);
    }
    this.clearHooks();
    this.ships = [];
    this.bots = [];
    this.botPoints.clear();
    this.me = null;
    this.drone = null;
    this.watchedShip = null;
    this.sparring = null;
    if (this.school) {
      this.speaker.stop();
      this.scene.remove(this.school.root);
      this.school.dispose();
      this.school = null;
      this.schoolContext = null;
    }
    this.drillComet = null;
  }

  /**
   * Starts a round: solo against bots, the flight school without opponents, or an online
   * tournament (where the lead browser adds bots for free places).
   */
  private startRound(mode: 'solo' | 'school' | 'online') {
    if (this.input.touchActive) this.enterFullscreen();
    // cleaned as every peer cleans it, so no callsign leaves nothing visible
    const callsign = cleanName($<HTMLInputElement>('callsign').value) || 'Host';
    $<HTMLInputElement>('callsign').value = callsign;
    storageSet(CALLSIGN_KEY, callsign);
    if (mode !== 'online') this.leaveOnline();
    if (this.choosingSolo) this.showSolo(false);
    if (this.choosingSchool) this.showSchool(false);

    this.clearShips();
    // the flight school trains in the belt; a solo round is in an arena of chance; online the
    // room and round decide, so a first round starts in the room's first arena (see arriveInRound)
    this.roundId = mode === 'online' ? -1 : 0;
    // a solo round plays what the Host chose, its arena by chance unless one was chosen
    this.roundMode = mode === 'online' ? this.onlineRoundMode() : mode === 'solo' ? this.solo.mode : 'deathmatch';
    if (mode === 'online') this.enterArena(arenaOfRound(this.online!.session.room, 0));
    else this.enterArena(mode === 'school' ? ARENAS[0] : (ARENAS.find((a) => a.id === this.solo.arena) ?? pick(ARENAS)));
    this.hud.reset();
    this.resetOpening();
    $('hud-room').textContent = '';

    this.me = this.addShip(this.online ? `p:${this.online.selfId}` : 'me', callsign, this.selectedShip, true);
    // the own ship flies with its upgrades, online only up to their cap
    this.me.outfit(perksOf(this.hangar, this.selectedShip, !!this.online));
    this.ghost.wear(this.assets.ships[this.selectedShip]);
    this.school = mode === 'school' ? new FlightSchool(this.schoolCourse, schoolSteps()[this.schoolCourse] ?? 0) : null;
    if (this.school) this.scene.add(this.school.root);
    $('now-playing').hidden = mode === 'school';
    if (mode === 'solo') this.setBotCount(this.solo.rivals.length, [], this.solo.rivals);
    this.respawn(this.me);

    // online the round is unknown until the lead browser tells it (see syncRound)
    this.rejoinedFrom = null;
    this.resultsShownFor = null;
    this.pendingRocks.length = 0;
    this.soloSeed = 1 + Math.floor(Math.random() * 2147483000);
    // online, the lead browser's clock decides (see leadRound and syncRound)
    if (mode === 'solo') this.setRoundEnd(ROUND_SECONDS);
    else this.roundEndsAt = this.roundEndsAtWall = Infinity;
    this.cockpit = false;
    this.flipping = false;
    this.kick = 0;
    this.autopilot = true;
    this.overdriveReadyAt = 0;
    this.hookReadyAt = 0;
    this.dodgeReadyAt = 0;
    // taps from the menu ask for nothing
    this.input.takeDodge();
    this.closeCalls.clear();
    this.closePass = null;
    this.ease = 0;
    // a resumed flight school starts with the autopilot as the drills before left it
    if (this.school) this.autopilot = this.school.startsWithAutopilot;
    this.strain = 0;
    this.setScreen('playing');
    // the link to the clone comes first, then the hint for the mouse (not for touch or gamepad)
    const mouse = !this.input.touchActive && !this.input.gamepadActive;
    // cues of this round run on its own clock: a pause holds them, clearShips drops them
    if (mouse) this.cue(2.2, () => this.hud.flashMessage(this.time, t('The ship turns towards the mouse pointer'), 4));
    // the flight school starts with its briefing; a tournament clone just reports in, and
    // once Nicole is through, the announcer opens the broadcast
    if (mode !== 'school') {
      this.speaker.say(mouse ? [COMPUTER.launch, COMPUTER.mouse] : COMPUTER.launch, 'urgent');
      // online the round's mode is known once the lead tells it (see arriveInRound)
      if (mode === 'solo') this.briefRound();
      this.broadcastOpened = false;
      this.cue(ARENA_TITLE_DELAY, () => this.announceArena());
      this.cue(ANNOUNCER_OPEN_DELAY, () => !this.broadcastOpened && this.openBroadcast());
    }
  }

  /** A round of a known mode begins: every tip may come once more, and the first round of a mode opens with its briefing, after whatever Nicole is saying. */
  private briefRound() {
    this.coach.newRound();
    this.coach.give(this.roundMode, (line) => this.speaker.say(line, 'lesson'));
  }

  /**
   * A big moment of the own pilot (see game/moments.ts): its banner above the crosshair, the
   * crowd (on its feet for the biggest, a cheer that settles again for the rest) and, for the
   * biggest, the announcer. Not in the flight school, which is on no broadcast.
   */
  private moment(moment: Moment) {
    if (this.school || !this.me) return;
    const { banner, crowd, lines, rank } = MOMENTS[moment];
    this.hud.banner(this.time, t(banner), rank);
    if (crowd >= 1) this.crowd.erupt();
    else {
      this.crowd.swell(crowd, 0.2, CHEER_SECONDS);
      this.cue(CHEER_SECONDS, () => this.crowd.swell(CROWD_MURMUR, 2));
    }
    if (lines) this.announce(pick(lines), this.me);
  }

  /** Runs `run` this many seconds of round time from now. */
  private cue(seconds: number, run: () => void) {
    this.cues.push({ at: this.time + seconds, run });
  }

  /** The cues that are due (see cue). */
  private runCues() {
    for (let i = this.cues.length - 1; i >= 0; i--) {
      if (this.time < this.cues[i].at) continue;
      const { run } = this.cues[i];
      this.cues.splice(i, 1);
      run();
    }
  }

  /** The announcer opens the broadcast from the arena of the round. */
  private openBroadcast() {
    this.radio.announce(pick([ANNOUNCER_ARENA[this.venue.id], ...ANNOUNCER_OPEN]), null);
  }

  private addShip(id: string, name: string, type: ShipType, isLocal: boolean): Ship {
    const ship = new Ship(id, name, type, this.assets, isLocal);
    this.ships.push(ship);
    this.scene.add(ship.root);
    this.lendLight(ship);
    return ship;
  }

  /**
   * Gives a ship one of the drive lights. The scene always holds the same number of lights,
   * free ones dark, because a change in the number of lights makes three.js recompile every
   * lit material, which stutters. So the lights stay children of the scene, never of a ship:
   * a hidden ship (dead, watched from its cockpit) would take its light out of the count.
   */
  private lendLight(ship: Ship) {
    const light = this.engineLights.find((l) => !this.ships.some((s) => s.engineLight === l));
    if (!light) return;
    ship.engineLight = light;
    ship.syncTransform();
  }

  private returnLight(ship: Ship) {
    const light = ship.engineLight;
    if (!light) return;
    light.intensity = 0;
    ship.engineLight = null;
  }

  // ---- OnlineGame: what the online layer uses ----

  allShips() {
    return this.ships;
  }

  /** The ships this browser runs and reports; a watching Host's clone is not printed and not reported. */
  ownedShips() {
    return this.ships.filter((ship) => ship.owner === null && !(this.spectating && ship === this.me));
  }

  /** A ship another browser runs, from a state with its name and type (see ShipState). */
  addRemoteShip(state: ShipState, owner: string): Ship {
    const ship = this.addShip(state.id, state.n!, state.k!, false);
    ship.owner = owner;
    ship.alive = false;
    ship.root.visible = false;
    ship.applyState(state, this.time);
    return ship;
  }

  removeShip(ship: Ship) {
    // gone from every screen: no camera follows it, no torpedo homes on it
    ship.alive = false;
    if (this.watchedShip === ship) this.watchedShip = null;
    this.returnLight(ship);
    this.scene.remove(ship.root);
    this.ships = this.ships.filter((s) => s !== ship);
    this.bots = this.bots.filter((b) => b.ship !== ship);
  }

  /**
   * Adds or removes own bots until this browser runs `count` of them. The first new ones adopt
   * the `heirs` (bots another browser ran, see Ship.adopt), which leave the scene in their favor.
   */
  setBotCount(count: number, heirs: readonly Ship[] = [], wanted: readonly string[] = BOT_NAMES) {
    while (this.bots.length > count) this.removeShip(this.bots[this.bots.length - 1].ship);
    for (const heir of heirs) this.removeShip(heir);
    const taken = new Set(this.ships.map((s) => s.name));
    const names = wanted.filter((n) => !taken.has(n) && !heirs.some((heir) => heir.name === n));
    for (let i = this.bots.length, next = 0, free = 0; i < count; i++) {
      const id = this.online ? `b:${this.online.selfId}:${i}` : `bot${i}`;
      const heir = heirs[next++];
      const ship = heir
        ? this.addShip(id, heir.name, heir.type, false)
        : this.addShip(id, names[free++] ?? `Bot ${i + 1}`, i % 2 === 0 ? 'alien' : 'human', false);
      this.bots.push(new Bot(ship, skillsOf(ship.name)));
      if (!heir) this.respawn(ship);
      else {
        ship.adopt(heir, this.time);
        if (!ship.alive) ship.respawnAt = this.time + RESPAWN_SECONDS;
      }
    }
  }

  showBeam(shooter: Ship, from: THREE.Vector3, to: THREE.Vector3) {
    this.effects.beam(from, to, shooter.color);
    this.killcam.recordBeam(this.time, from, to, shooter.color);
  }

  remoteDestroyed(victim: Ship, killer: Ship | null, deaths: number, position: THREE.Vector3 | null, velocity: THREE.Vector3 | null, nova: boolean) {
    victim.alive = false;
    victim.root.visible = false;
    // the owner counted this death already; its wreckage is seeded with that count and flies
    // from where the owner saw the ship break up, not from where it was predicted here
    victim.deaths = deaths;
    if (position) victim.flight.position.copy(position);
    if (velocity) victim.flight.velocity.copy(velocity);
    this.shipDestroyed(victim, killer, nova && killer ? 'nova' : null, 'remote');
  }

  remoteWreck(id: string) {
    const wreck = this.wrecks.find(id);
    if (wreck) this.shatterWreck(wreck);
  }

  wreckSnapshot() {
    return this.wrecks.snapshot(this.time);
  }

  restoreWrecks(wrecks: WreckState[]) {
    this.wrecks.restore(wrecks, this.me!.radius, this.time);
  }

  /** A piece of wreckage bursts: shot or rammed, here or on another browser. */
  private shatterWreck(wreck: Wreck) {
    this.effects.explosion(wreck.mesh.position, wreck.radius, wreck.velocity);
    this.wrecks.remove(wreck);
  }

  remoteRock(id: string, at: number, round: number) {
    // every round has the same rock ids: a hit counts on the field of its own round. A newcomer
    // that does not know the round yet applies it to the field it has.
    if (this.roundId >= 0 && round !== this.roundId) {
      if (round > this.roundId && this.pendingRocks.length < 200) this.pendingRocks.push({ id, at, round });
      return;
    }
    // the field clocks of all browsers follow the lead's closely: a hit far off in field time
    // is no hit of now (an early time would take the points of whoever broke the rock)
    if (this.roundId >= 0 && Math.abs(at - this.field.clock) > ROCK_TIME_SLACK) return;
    if (!this.field.asteroids.has(id)) {
      // two Hosts broke the same rock at once: the earlier hit by field time gets the points,
      // and each browser takes its own back when it learns it was later
      const broken = this.brokenHere.get(id);
      if (broken && at < broken.at) {
        broken.ship.score -= broken.points;
        this.brokenHere.delete(id);
      }
      return;
    }
    const destroyed = this.field.hit(id, at);
    if (!destroyed) return;
    // the last hit by field time breaks a rock: when an own hit came after this one, the
    // own ship broke it, though the other hit arrived later
    const own = this.lastRockHit.get(id);
    if (own && own.at > at) {
      own.ship.score += ASTEROID_POINTS[destroyed.generation];
      this.keepBroken(destroyed, own.at, own.ship);
    }
    this.burstRock(destroyed);
  }

  /** A rock a ship of this browser broke online, kept for remoteRock and rockAt. */
  private keepBroken(rock: Asteroid, at: number, ship: Ship) {
    this.brokenHere.set(rock.id, { at, ship, points: ASTEROID_POINTS[rock.generation], position: rock.object.position.clone(), radius: rock.radius });
  }

  /** A rock breaks apart, and the own pilot hears its debris. */
  private burstRock(rock: Asteroid) {
    this.effects.explosion(rock.object.position, rock.meanRadius * 0.6, rock.velocity);
    this.hearDebris(rock.object.position, rock.meanRadius);
  }

  rejoin() {
    if (this.roundId >= 0) this.rejoinedFrom = this.roundId;
    this.roundId = -1;
    this.pendingRocks.length = 0;
  }

  syncRound(round: RoundState) {
    // the room's modes are the lead's: a link or a lobby listing may have named others
    if (round.m && this.room && round.m !== this.room.mode) this.room.mode = round.m;
    // the first round state a newcomer hears only tells it which round runs: its field is the
    // lead's snapshot already (see Online's onSync), not a fresh one. A browser that started
    // over in another round than its own leaves its own behind.
    if (this.roundId < 0) {
      if (this.rejoinedFrom !== null && this.rejoinedFrom !== round.id) this.clearRound();
      // a newcomer's clone was printed before it knew the round's arena
      const newcomer = this.rejoinedFrom === null;
      this.roundId = round.id;
      this.rejoinedFrom = null;
      this.arriveInRound(newcomer);
    } else if (round.id > this.roundId) {
      // a new round only once the running one is over; a lead that counts rounds up before
      // has nothing to say about this one
      if (wallClock() < this.roundEndsAtWall - ROUND_END_SLACK) return;
      this.roundId = round.id;
      this.startNextRound();
    } else if (round.id < this.roundId) return;
    // the radio plays on this clock, so it follows the lead browser closely: jumps when far
    // off, otherwise smooths out the jitter of the network
    const endsAt = wallClock() + round.left;
    if (Math.abs(endsAt - this.roundEndsAtWall) > ROUND_SNAP || !Number.isFinite(this.roundEndsAtWall)) this.setRoundEnd(round.left);
    else this.setRoundEnd(this.roundEndsAtWall + (endsAt - this.roundEndsAtWall) * 0.05 - wallClock());
    // the asteroids follow the lead browser's field time the same way
    const drift = round.field - this.field.clock;
    this.field.setClock(Math.abs(drift) > FIELD_SNAP ? round.field : this.field.clock + drift * 0.1);
    // and the sides and cores of Capture the Flag are the lead's
    if (round.f && this.flags) this.flags.follow(round.f, this.time);
    // and so is the President's battleship
    if (round.b && this.fleet) this.fleetEvents(this.fleet.follow(round.b), null);
  }

  leadRound(): RoundState {
    // the first lead browser of a room starts the clock; a new one continues the synced clock,
    // and one that started over without hearing another lead continues its own round
    if (this.roundId < 0) {
      this.roundId = this.rejoinedFrom ?? 0;
      this.arriveInRound(false);
    }
    this.rejoinedFrom = null;
    if (!Number.isFinite(this.roundEndsAtWall)) this.setRoundEnd(ROUND_SECONDS);
    // the lead browser starts the next round once the scoreboard has been shown
    if (wallClock() >= this.roundEndsAtWall + RESULTS_SECONDS) {
      this.roundId++;
      this.startNextRound();
      this.setRoundEnd(ROUND_SECONDS);
    }
    if (this.decided() && this.roundEndsAtWall - wallClock() > DECIDED_SECONDS) this.setRoundEnd(DECIDED_SECONDS);
    const left = this.roundEndsAtWall - wallClock();
    this.roundEndsAt = this.time + left;
    this.followStart();
    const round: RoundState = { id: this.roundId, left: +left.toFixed(3), field: +this.field.clock.toFixed(3), ...(this.room ? { m: this.room.mode } : {}) };
    if (this.flags) round.f = this.flags.toState();
    if (this.fleet) round.b = this.fleet.toState();
    return round;
  }

  /**
   * Sets the end of the round on both clocks. Online rounds run on real time, so a slow
   * frame rate or a hidden tab does not hold them back; game time follows.
   */
  private setRoundEnd(left: number) {
    this.roundEndsAt = this.time + left;
    this.roundEndsAtWall = wallClock() + left;
    this.followStart();
  }

  /**
   * The round started ROUND_SECONDS before its end, on the same real-time clock; once it is
   * decided early it ends sooner, but keeps its start (race times and the probes count from
   * there).
   */
  private followStart() {
    if (!this.decided()) this.roundStartedAt = this.roundEndsAt - ROUND_SECONDS;
  }

  /**
   * Online: scores of the own ships start from zero, the scoreboard closes, the field and its
   * wreckage come back fresh, as in a solo round.
   */
  private startNextRound() {
    this.roundArrivedAt = this.time;
    this.clearRound();
    this.freshRound();
    this.roundMode = this.onlineRoundMode();
    this.enterArena(this.roundArena());
    this.reprintOwn();
    // the round's opening presents arena and field, and the announcer opens the broadcast
    this.briefRound();
    // hits that arrived before this browser started the round
    const pending = this.pendingRocks.splice(0);
    for (const rock of pending) if (rock.round >= this.roundId) this.remoteRock(rock.id, rock.at, rock.round);
  }

  /**
   * Online, the round's arena is known: a browser whose field is another one moves there,
   * and its ships with it, freshly printed, since where they flew may be rock in the new one.
   * A newcomer's ships were printed before it knew the arena (`reprint`): they are printed
   * again in it, on the grid in a race.
   */
  private arriveInRound(reprint: boolean) {
    this.roundArrivedAt = this.time;
    const arena = this.roundArena();
    const mode = this.onlineRoundMode();
    const sameField = this.field.layout?.key === arena.layout.key;
    if (reprint) this.freshRound();
    if (!sameField) {
      this.roundMode = mode;
      this.enterArena(arena);
      this.announceArena();
    } else if (mode !== this.roundMode) {
      // the field is right (a snapshot built it, with the wreckage restored alongside); only the
      // round's mode, and with it the course, changes
      this.roundMode = mode;
      this.enterArena(arena, this.field.snapshot(), true);
    }
    if (!sameField || reprint) this.reprintOwn();
    this.briefRound();
  }

  /** What every round starts with on screen and in the cockpit: no replay, no old marks, the autopilot on. */
  private freshRound() {
    this.killcam.stop();
    this.hud.reset();
    this.resetOpening();
    this.autopilot = true;
  }

  /** The opening starts from nothing (see startCountdown): a round left during the last one's intro leaves none behind, and a browser that arrives during an opening sees the rest of it. */
  private resetOpening() {
    this.countdown = 0;
    this.lightsOn = 0;
    this.introOpen = false;
  }

  /** Every ship this browser runs starts the arena with a fresh clone on its edge; a sponsor break in progress ends. */
  private reprintOwn() {
    for (const ship of this.ships) {
      if (ship.owner !== null || ship === this.drone || (this.spectating && ship === this.me)) continue;
      if (ship === this.me) this.endSponsorBreak();
      this.respawn(ship);
    }
  }

  /** Online: scores of the own ships start from zero, the scoreboard closes, the wreckage goes. */
  private clearRound() {
    // the own clone too while it watches: it starts the round it flies with nothing
    for (const ship of this.ships) {
      if (ship.owner !== null) continue;
      ship.score = ship.kills = ship.deaths = ship.gates = 0;
      ship.finish = -1;
    }
    this.brokenHere.clear();
    this.lastRockHit.clear();
    this.moments.reset();
    this.wrecks.clear();
    this.probes.reset();
    $('results').hidden = true;
  }

  /** Spawns a ship on the edge of the field, facing the center, away from asteroids. */
  private respawn(ship: Ship) {
    const position = new THREE.Vector3();
    const candidate = new THREE.Vector3();
    let best = -Infinity;
    const course = this.course;
    if (course) {
      // a racer starts on the grid before the first gate, and a new clone takes up the race
      // where the last one died, facing the next gate; where the last one passed its last gate
      // when that spot lies in rock, in a well or out of the arena
      const spot = ship.flight.position;
      if (ship.gates > 0 && ship.outsideSince === null && !this.field.overlap(spot, ship.radius * 4) && !this.field.insideWell(spot, ship.radius * 40)) position.copy(spot);
      else course.startOf(ship.gates, Math.max(0, this.ships.indexOf(ship)) % 8, position);
      candidate.copy(course.points[ship.gates % GATES]);
      best = 0;
    }
    // of a dozen random places on the edge of the field (in Last Clone Standing around the middle
    // of a solar flare's safe pocket and clear of its plasma; in Capture the Flag around the own
    // side's base), clear of rock, the one farthest from the nearest enemy, preferably hidden
    // from every enemy behind the asteroids
    const clock = this.field.clock;
    const edge = this.survival ? Math.min(FIELD_RADIUS, flarePocket(clock, spawnMiddle) * FLARE_KEEP) : FIELD_RADIUS;
    if (!this.survival) spawnMiddle.set(0, 0, 0);
    const scorched = (point: THREE.Vector3) => this.survival && flareClearance(point, clock) < ship.radius * 10;
    const base = this.flags && ship.team >= 0 ? this.flags.bases[ship.team] : null;
    for (let attempt = 0; attempt < SPAWN_CANDIDATES && !course; attempt++) {
      if (base) candidate.randomDirection().multiplyScalar(BASE_RADIUS * (2 + Math.random() * 2)).add(base);
      else candidate.randomDirection().multiplyScalar(edge * (0.9 + Math.random() * 0.2)).add(spawnMiddle);
      if (this.field.overlap(candidate, ship.radius * 10) || this.field.insideWell(candidate, ship.radius * 40) || scorched(candidate)) continue;
      let nearest = Infinity;
      let seen = false;
      for (const other of this.ships) {
        if (other === ship || !other.alive || other.allyOf(ship)) continue;
        const distance = other.flight.position.distanceTo(candidate);
        nearest = Math.min(nearest, distance);
        seen ||= distance < LOCK_RANGE && this.field.lineOfSight(other.flight.position, candidate);
      }
      const score = Math.min(nearest, FIELD_RADIUS * 3) - (seen ? FIELD_RADIUS * 3 : 0);
      if (score > best) {
        best = score;
        position.copy(candidate);
      }
    }
    // none clear (a dense field, a base among rocks): the first of more tries that is clear of
    // rock and well at all, and as a last resort the open space just beyond the field's rocks
    for (let attempt = 0; attempt < SPAWN_CANDIDATES * 4 && best === -Infinity; attempt++) {
      candidate.randomDirection().multiplyScalar(edge * (0.9 + Math.random() * 0.2)).add(spawnMiddle);
      if (this.field.overlap(candidate, ship.radius * 2) || this.field.insideWell(candidate, ship.radius * 40) || scorched(candidate)) continue;
      best = 0;
      position.copy(candidate);
    }
    // (in Last Clone Standing the open space behind the field, away from the sun, which no flare reaches)
    if (best === -Infinity && this.survival) position.copy(SUN_DIRECTION).multiplyScalar(-ARENA_LIMIT * 0.85);
    else if (best === -Infinity) position.randomDirection().multiplyScalar(Math.min(ARENA_LIMIT * 0.95, (this.field.layout?.radius ?? FIELD_RADIUS) * SPAWN_BEYOND));
    ship.spawn(position, lookingAt(position, course ? candidate : spawnMiddle, UP), this.time);
    if (ship === this.me) {
      // the Host's mind locks onto the freshly printed clone: from here on we are the clone
      this.hud.flashMessage(this.time, t('Establishing live link to your clone…'), 2);
      this.hud.boot(this.time);
      if (this.survival && clonesLeft(ship) === 1) this.speaker.say(COMPUTER.lastClone, 'urgent');
      this.glitch.trigger(0.9, 1.1);
      this.radio.setMuffled(false);
    }
  }

  /** The next clone only boots after the Host has watched an ad. */
  private sponsorBreak() {
    const me = this.me!;
    this.input.steerWithMouse(false);
    this.hud.show(false);
    this.speaker.say(pick(SPONSOR_BREAK), 'urgent');
    // the kill again and again behind the ad, until the next clone boots
    this.killcam.again();
    const n = me.kills;
    const kills = n === 1 ? t('{n} kill', { n }) : t('{n} kills', { n });
    const lost = me.deaths === 1 ? t('{n} clone lost', { n: me.deaths }) : t('{n} clones lost', { n: me.deaths });
    const clones = this.survival ? `${lost} · ${clonesLeftText(clonesLeft(me))}` : lost;
    this.sponsors.show(this.deathCause, t('This round: {kills} · {points} pts · {clones}', { kills, points: me.score, clones }), () => {
      this.speaker.say(pick(SPONSOR_HAPPY), 'urgent');
      this.killcam.stop();
      this.hud.show(true);
      this.respawn(this.me!);
      this.input.steerWithMouse(true);
      this.input.holdFire();
    });
  }

  private pause() {
    this.setScreen('paused');
  }

  /** A phone held upright (the touch controls on); see holdUpright. */
  private readonly upright = window.matchMedia('(orientation: portrait)');
  /** The solo round stands still because the phone is upright, and goes on by itself once it turns. */
  private pausedUpright = false;

  /**
   * A round is flown with the phone held sideways (see #turn-phone): a solo round held upright
   * stands still behind the plate and goes on as soon as the phone turns; an online tournament
   * does not wait for one pilot.
   */
  private holdUpright() {
    const up = this.upright.matches && this.input.touchActive;
    if (up && this.state === 'playing' && !this.online) {
      this.pausedUpright = true;
      this.pause();
    } else if (!up && this.pausedUpright) {
      this.pausedUpright = false;
      if (this.state === 'paused') this.resume();
    }
    const held = this.pausedUpright && this.state === 'paused';
    if (document.body.classList.contains('upright-paused') !== held) document.body.classList.toggle('upright-paused', held);
  }

  private resume() {
    // a solo round stood still during the pause; its real-time end moves on accordingly
    if (!this.online && Number.isFinite(this.roundEndsAt)) this.setRoundEnd(this.roundEndsAt - this.time);
    this.setScreen('playing');
  }

  /** Ends a solo round with the scoreboard; leaving an online tournament goes to the menu. */
  private endRound() {
    if (this.online) {
      this.showMenu();
      return;
    }
    // the lessons of a flight school that is left end with it
    if (this.school) this.speaker.stop();
    this.renderScoreboard();
    $('results-next').textContent = '';
    $('again').innerHTML = `${t('Back to hangar')} <kbd>Enter</kbd>`;
    this.speaker.say(COMPUTER.roundOver, 'urgent');
    this.setScreen('results');
  }

  private renderScoreboard() {
    const me = this.me;
    this.fillStandings($<HTMLTableElement>('scoreboard'));
    // the time ran out with the President's battleship still in the fight: it got away
    if (this.fleet?.present(this.field.clock)) this.radio.announce(ANNOUNCER_FLEET.escaped, null);
    // training points from the flight school are no personal best, and pay no coins
    if (me && !this.school && me.score > Number(storageGet(BEST_SCORE_KEY) ?? 0)) storageSet(BEST_SCORE_KEY, String(me.score));
    const coins = me && !this.school && !this.spectating ? payOut(this.hangar, me.score) : 0;
    if (coins > 0) this.saveHangar();
    $('results-coins').textContent = coins > 0 ? t('+{coins} Solar Coins · {total} in the hangar', { coins: coinText(coins), total: coinText(this.hangar.coins) }) : '';
  }

  private saveHangar() {
    storageSet(HANGAR_KEY, JSON.stringify(this.hangar));
    this.renderShowcase();
  }

  /** The ship on show above the logo, its name and what it is; the hangar's note on its button. */
  private renderShowcase() {
    const ship = this.shipShown;
    const locked = ship === 'sovereign' && !sovereignEarned(this.hangar);
    this.showcase?.show(ship, perksOf(this.hangar, ship, false), locked);
    $('ship-name').textContent = t(SHIP_NAMES[ship]);
    $('ship-note').textContent = locked ? t('Make both interceptors complete in the hangar, and it is yours.') : ship === this.selectedShip ? t('Your ship') : '';
    $('hangar-note').textContent = t('{coins} Solar Coins · upgrade your ships', { coins: coinText(this.hangar.coins) });
    if (this.inHangar) this.renderHangar();
  }

  /** The next or the previous ship on show; one that is earned is the one the Host flies. */
  private turnShowcase(step: number) {
    const ships: ShipType[] = ['human', 'alien', 'sovereign'];
    this.shipShown = ships[(ships.indexOf(this.shipShown) + step + ships.length) % ships.length];
    if (this.shipShown !== 'sovereign' || sovereignEarned(this.hangar)) {
      this.selectedShip = this.hangar.ship = this.shipShown;
      this.saveHangar();
    } else this.renderShowcase();
  }

  /** The hangar's plate: the coins, and every upgrade of the ship on show with its steps and the price of the next. */
  private renderHangar() {
    const ship = this.shipShown;
    $('hangar-coins').textContent = t('{coins} Solar Coins. Every point of a round pays one.', { coins: coinText(this.hangar.coins) });
    const list = $('hangar-upgrades');
    if (ship === 'sovereign') {
      list.textContent = sovereignEarned(this.hangar) ? t('The Sovereign flies with every upgrade, and wears every look.') : t('The Sovereign is the President’s gift for both interceptors made complete.');
      return;
    }
    list.replaceChildren(
      ...UPGRADES.map((upgrade) => {
        const level = this.hangar.levels[ship][upgrade.id];
        const price = nextPrice(this.hangar, ship, upgrade.id);
        const row = Object.assign(document.createElement('button'), { type: 'button', className: 'upgrade' });
        row.disabled = price === null || price > this.hangar.coins;
        row.innerHTML = `<span class="upgrade-name">${t(upgrade.name)}<small>${upgrade.looks ? t('{note} · looks only', { note: t(upgrade.note) }) : t(upgrade.note)}</small></span><span class="pips">${'<i class="on"></i>'.repeat(level)}${'<i></i>'.repeat(LEVELS - level)}</span><span class="upgrade-price">${price === null ? t('Complete') : `${coinText(price)} ☉`}</span>`;
        row.addEventListener('click', () => {
          if (buy(this.hangar, ship, upgrade.id)) this.saveHangar();
        });
        return row;
      }),
    );
  }

  private showHangar(open: boolean) {
    this.inHangar = open;
    $('menu').hidden = open || this.state !== 'menu';
    $('hangar-plate').hidden = !open;
    // the ship's name and its arrows go along onto the hangar's plate, and back onto the menu's
    if (open) $('hangar-plate').insertBefore($('showcase'), $('hangar-coins'));
    else $('menu').prepend($('showcase'));
    this.renderShowcase();
    if (open) $('hangar-back').focus();
  }

  /** The standings as a table: the scoreboard at the round's end, and the one Tab holds open. */
  private fillStandings(table: HTMLTableElement) {
    const race = this.roundMode === 'race';
    const survival = this.survival;
    const flags = this.flags;
    const heads = ['#', t('Host'), race && t('Race'), survival && t('Clones'), flags && t('Side'), t('Kills'), t('Deaths'), t('Score')];
    table.innerHTML = `<tr>${heads.map((head) => (head ? `<th>${head}</th>` : '')).join('')}</tr>`;
    // Capture the Flag names the sides' captures above the pilots
    if (flags) table.createCaption().textContent = flags.leading >= 0 ? t('{score} · {side} leads', { score: this.flagScore(), side: t(TEAM_NAMES[flags.leading]) }) : this.flagScore();
    // the President's Fleet: who won, the Hosts or the President
    if (this.fleet) table.createCaption().textContent = this.fleet.down ? t('Battleship down · the Hosts win') : this.fleet.present(this.field.clock) ? t('The battleship got away · the President wins') : t('The battleship is coming');
    // a race ranks by the finish, Last Clone Standing by the clones left, a deathmatch by the
    // score (see standings), as it stands this moment
    this.rankedAt = -1;
    this.standings().forEach((ship, i) => {
      const row = table.insertRow();
      row.classList.toggle('me', ship === this.me);
      row.insertCell().textContent = String(i + 1);
      row.insertCell().append(...markedName(ship.kind, ship.name));
      if (race) row.insertCell().textContent = ship.finish >= 0 ? t('{time} s', { time: ship.finish.toFixed(1) }) : t('Lap {lap}/{laps}', { lap: lapOf(ship.gates), laps: LAPS });
      if (survival) row.insertCell().textContent = isOut(ship) ? t('Out') : t('{n} left', { n: clonesLeft(ship) });
      if (flags) {
        const side = row.insertCell();
        side.textContent = TEAM_NAMES[ship.team] ? t(TEAM_NAMES[ship.team]) : '–';
        side.style.color = TEAM_TINTS[ship.team] ?? '';
      }
      for (const value of [ship.kills, ship.deaths, ship.score]) row.insertCell().textContent = String(value);
    });
  }

  /** The captures of Capture the Flag, both sides named: Orange 2 : 1 Blue. */
  private flagScore() {
    const [orange, blue] = this.flags!.captures;
    return `${t(TEAM_NAMES[0])} ${orange} : ${blue} ${t(TEAM_NAMES[1])}`;
  }

  /** Tab held in a round: the standings over the running game, refreshed a few times a second. */
  private showStandings(now: number) {
    const open = this.state === 'playing' && this.input.standings && $('results').hidden;
    if ($('standings').hidden === open) $('standings').hidden = !open;
    if (!open || now < this.standingsAt) return;
    this.standingsAt = now + STANDINGS_REFRESH;
    this.fillStandings($<HTMLTableElement>('standings-table'));
  }

  /**
   * Online rounds end for everyone at once: the scoreboard shows over the running game
   * until the lead browser starts the next round. It is announced once per round, and the
   * pause menu covers it while it is open.
   */
  private showOnlineResults() {
    // a browser that started over does not announce the round it was in once more
    if (this.roundId >= 0 && this.resultsShownFor !== this.roundId) {
      this.resultsShownFor = this.roundId;
      this.renderScoreboard();
      $('again').textContent = t('Leave tournament');
      this.speaker.say(COMPUTER.roundOver, 'urgent');
    }
    $('results').hidden = this.state !== 'playing';
    const next = t('Next round in {seconds} s', { seconds: Math.ceil(Math.max(0, this.roundEndsAt + RESULTS_SECONDS - this.time)) });
    if ($('results-next').textContent !== next) $('results-next').textContent = next;
  }

  private resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // a zoom or another screen changes the pixel ratio as well
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.hud.setViewport(width, height);
    this.guide.setViewport(width, height);
    this.redraw = true;
    this.glitch.setSize(width * this.renderer.getPixelRatio(), height * this.renderer.getPixelRatio());
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.effects.setViewport(height * this.renderer.getPixelRatio(), this.camera.fov);
  }

  private frame() {
    this.timer.update();
    this.input.poll();
    this.holdUpright();
    const dt = Math.min(this.timer.getDelta(), 0.05) * this.timeScale;
    // a long frame (a slow device, a time-lapse) runs as several steps of at most MAX_STEP, so
    // shots, collisions and bots play the same game at any frame rate
    const steps = Math.max(1, Math.ceil(dt / MAX_STEP - 1e-9));
    for (let i = 0; i < steps; i++) {
      // an online tournament does not stop for one pilot's pause menu
      const running = this.state === 'playing' || (this.state === 'paused' && !!this.online);
      if (this.state === 'paused' && !running) break;
      this.time += dt / steps;
      if (running) this.updateRound(dt / steps);
      this.field.update(dt / steps);
    }
    if (this.state !== 'paused' || this.online) this.effects.update(dt);
    if (this.state === 'menu' || this.state === 'results') this.updateMenuCamera();
    // the ship on show, while the menu or the hangar shows it
    if (this.state === 'menu' && !this.choosingSolo && !this.choosingSchool && !this.browsing) this.showcase?.render(wallClock());

    const cue = this.musicCue();
    if (cue) this.radio.setCue(cue);
    else if (this.radio.playing) this.radio.stop();
    if (this.state === 'menu' || this.state === 'paused' || this.sponsors.visible) {
      // the idle link flickers now and then
      const now = performance.now() / 1000;
      if (now >= this.nextIdleGlitch) {
        if (this.nextIdleGlitch > 0) this.glitch.trigger(0.25 + Math.random() * 0.4, 0.1 + Math.random() * 0.4);
        this.nextIdleGlitch = now + IDLE_GLITCH_MIN + Math.random() * IDLE_GLITCH_RANGE;
      }
    }
    this.glitch.update();
    this.datamosh.update();
    this.showStandings(wallClock());

    // a paused solo round stands still: its picture is drawn again only while it glitches or
    // after the window changed, not 60 times a second under the pause plate
    const glitching = this.glitch.pass.enabled;
    // the frame after a glitch shows the clean picture again
    if (this.glitched && !glitching) this.redraw = true;
    this.glitched = glitching;
    const still = this.state === 'paused' && !this.online && !glitching;
    if (still && !this.redraw) return;
    this.redraw = false;
    // the kill cam borrows the ships' pictures and the camera for this one picture, from the
    // second picture after the death on: the first one is the cockpit's last, which rots
    const replaying = this.state === 'playing' && !this.datamosh.freezing && this.killcam.pose(this.camera);
    if (replaying !== this.replaying) {
      this.replaying = replaying;
      this.effects.group.visible = !replaying;
      this.replayEffects.group.visible = replaying;
      this.hud.show(!replaying && this.state === 'playing' && !this.sponsors.visible);
    }
    this.paint();
    if (replaying) this.killcam.restore();
  }

  /** Draws the scene as the camera sees it: the sky around it, the arena's edge, its landmarks, a black hole's lens. */
  private paint() {
    this.space.follow(this.camera, this.state === 'menu' ? null : this.riding);
    this.arena.update(this.camera);
    this.landmarks.update(this.field.clock);
    const well = this.field.well;
    // the scene is drawn into the composer's read buffer, which the lens reads right after
    this.lensing.update(this.camera, this.venue.id === 'hole' && well ? well.position : null, well?.radius ?? 0, this.composer.readBuffer.depthTexture);
    this.composer.render();
  }

  private updateRound(dt: number) {
    const me = this.me!;
    const now = this.time;
    this.runCues();

    // solo rounds run on real time too, like the radio, so a slow frame rate does not stretch
    // them and the finale of the music meets the end of the round
    if (!this.online && Number.isFinite(this.roundEndsAtWall)) {
      this.roundEndsAt = now + (this.roundEndsAtWall - wallClock());
      this.followStart();
    }

    this.ease = Math.max(0, this.ease - dt / EASE_FADE);
    this.weather(dt, now);
    this.direct(now);
    const myControls = this.flightComputer(this.state === 'playing' ? this.input.read() : IDLE, dt);
    this.ignite(myControls);
    const dodge = this.input.takeDodge();
    if (dodge && this.state === 'playing' && !this.spectating) this.dodge(dodge);
    const clamped = (this.clamped = this.startCountdown(myControls));
    // Last Clone Standing: the solar flare, the same on every browser by the field time
    this.showFlare(dt);
    this.playComet();
    // removing a ship replaces the list, so the loop safely runs over the list it started with
    for (const ship of this.ships) {
      if (ship.owner !== null) {
        ship.updateRemote(dt, now);
        // the synced throttle is all the drive's trail needs
        if (ship.alive) this.exhaust(ship, dt);
        continue;
      }
      if (!ship.alive) {
        if (now < ship.respawnAt || ship === this.drone || ship === this.sparring?.bot.ship || this.out(ship)) continue;
        // training clones are free; tournament clones cost an ad
        if (ship !== me || this.school) this.respawn(ship);
        else if (!this.sponsors.visible && this.state === 'playing' && !this.killcam.active) this.sponsorBreak();
        continue;
      }
      let bot: Bot | null = null;
      for (const b of this.bots) if (b.ship === ship) bot = b;
      if (bot) {
        bot.ease = this.online ? 0 : this.ease;
        // a racing bot flies the course until it has finished, then it only fights
        // along the ideal line, bowed around the rock as it lies now
        bot.rings = this.rings;
        bot.through = this.course && ship.finish < 0 ? this.rings[ship.gates % GATES] : null;
        bot.waypoint = this.course && ship.finish < 0 ? this.approach(this.course, ship, this.course.line.target(ship.flight.position, ship.gates % GATES, ship.flight.velocity.length(), this.field, this.botPoint(bot))) : null;
        bot.lure = this.probes.nearest(ship.flight.position, PROBE_LURE)?.position ?? null;
        // a nova core close by, a battleship whose reactor went critical, the plume of one
        // hunting with its stern, a solar flare's front or a comet's route: away from it, out of
        // the plume to the side, away from the sun
        const nova = this.novaNear(ship, NOVA_RADIUS * NOVA_FLEE)?.flight.position ?? null;
        const danger = nova ?? (this.fleet ? this.fleetDanger(ship, this.fleet) : this.flareNear(ship));
        bot.flee = danger ?? this.cometDanger(ship);
        if (devlog) bot.fleeFrom = nova ? 'nova' : danger ? (this.fleet ? 'battleship' : 'flare') : bot.flee ? 'comet' : '';
        // a bot goes out to the President's battleship on its orbit beyond the rocks, and keeps
        // to a solar flare's safe pocket
        bot.home = this.fleet ? FLEET_HOME : this.survival ? Math.min(HOME_RADIUS, this.pocketRadius * FLARE_KEEP) : HOME_RADIUS;
        bot.homeAt = this.survival ? this.pocket : null;
        bot.prey = null;
        bot.siege = this.fleet ? this.siegePoint(bot, this.fleet) : null;
        // a race at the bot's own pace, by how good it is; a raid in Capture the Flag at the raiders'
        bot.raceSpeed = this.flags ? FLAG_RAID_SPEED : raceSpeedOf(bot.skills);
        if (this.flags) this.flagRole(bot, this.flags);
      }
      const thought = bot ? bot.think(now, this.ships, this.field, this.bots) : null;
      // the flight school's unarmed sparring bot only flies
      if (thought && bot === this.sparring?.bot && !this.sparring.armed) thought.fire = false;
      // a bot with a nova core saves it for a crowd
      if (thought?.fire && ship.nova && this.crowdAround(ship, NOVA_RADIUS * 0.8) < NOVA_CROWD) thought.fire = false;
      // a bot with its target locked, or a part of the battleship it attacks, sends a torpedo
      // now and then (never the flight school's)
      if (bot && !clamped && bot !== this.sparring?.bot && (bot.target || bot.siege) && ship.torpedoes > 0 && Math.random() < dt * BOT_TORPEDO_RATE) {
        // against the battleship every ship is on one side: whatever it locks on is a part
        const lock = this.torpedoTarget(ship);
        if (lock && (!bot.target || lock === bot.target)) {
          this.fireTorpedo(ship);
          devlog?.add({ kind: 'act', t: now, ship: ship.name, act: 'torpedo', detail: bot.target?.name ?? 'battleship' });
        }
      }
      if (bot && !clamped) this.botHook(bot, dt, now);
      if (bot?.shove && !clamped) this.thrusterKick(ship, bot.shove);
      // the target drone keeps its drive turned to the pilot, wherever the pilot flies: the
      // drills train hitting the drive, not getting around the armor
      if (ship === this.drone && me.alive) ship.flight.orientation.setFromRotationMatrix(facing.lookAt(me.flight.position, ship.flight.position, me.flight.up(upward)));
      // in the clamps of a round's opening the ship is held: no push, no pull, no shot
      if (clamped) ship.flight.velocity.set(0, 0, 0);
      const controls = clamped ? IDLE : ship === me ? myControls : (thought ?? IDLE);
      this.field.gravity(ship.flight.position, gravity);
      if (clamped) gravity.set(0, 0, 0);
      ship.inShadow = this.field.raycast(ship.flight.position, SUN_DIRECTION, LASER_RANGE) !== null;
      ship.sunCooling = this.venue.cooling;
      if (ship.update(dt, now, controls, gravity)) this.fireLaser(ship);
      if (this.course && !this.roundOver) this.passGates(ship, this.course);
      this.keepInArena(ship, now);
      // a rock between the ship and the sun shades it from the worst of the plasma; the own
      // pilot hears of it through the flare's alarm (see flareAlarm)
      if (this.survival && flareClearance(ship.flight.position, this.field.clock) < 0) this.burn(ship, ship.inShadow ? FLARE_SHADE : 1, FLARE_HEAT, FLARE_BURN, null, null, 'flare', dt, now);
      this.collide(ship, now);
      this.cometStrike(ship, now);
      this.hitWreckage(ship, now);
      this.scorch(ship, dt, now);
      this.exhaust(ship, dt);
    }
    this.collideShips(now);
    if (this.flags) this.playFlags(this.flags, dt, now);
    if (this.fleet) this.playFleet(this.fleet, dt, now);
    this.hookOwn(now);
    this.updateHooks(dt);
    this.wrecks.update(dt, now, this.field);
    this.killcam.record(now, this.ships);
    this.replayEffects.update(dt);
    this.torpedoes.update(dt, now, this.field, this.ships, (torpedo, hit) => this.detonate(torpedo, hit));
    this.items(dt, now);
    this.closeCall(now);
    this.pilot(dt, now);

    if (me.alive) {
      const rcs = Math.min(1, me.flight.rcs.length() + Math.abs(myControls.yaw) * 0.5 + Math.abs(myControls.pitch) * 0.5 + Math.abs(myControls.roll) * 0.5);
      this.sound.setEngine(me.flight.throttle, rcs * (0.25 + 0.75 * me.thrusters));
    } else {
      this.sound.setEngine(0, 0);
    }

    this.updateCamera(dt);
    me.root.visible = me.alive && !this.cockpit;
    // a watching Host sees the tournament through the pilot it follows
    const subject = this.subject();
    // a core keeps clear of the view on the pilot and its crosshair
    this.flags?.view(this.camera, subject, this.cockpit, dt);
    // its gauges too: the own clone is not printed while the Host watches
    this.hud.update(now, Math.max(0, this.roundEndsAt - now), subject);
    // a solar storm blinds the sensors: no ship shows a marker
    this.hud.updateMarkers(this.camera, this.ships, subject, this.storming ? blind : this.inSight);
    this.radar.update(wallClock(), subject, this.ships, this.field, this.sensed, this.radarMarks(subject), this.storming);
    this.hud.updateVelocityMarkers(this.camera, subject);
    this.hud.updateAttitude(this.camera, subject.alive, this.input.touchActive);
    this.hud.setCenter(this.camera, subject);
    this.hud.setAutopilot(this.autopilot);
    this.hud.setOverdrive(Math.max(0, this.overdriveReadyAt - now));
    const hook = this.tethers.get(me);
    this.hud.setHook(hook && hook.flying <= 0 && hook.anchor ? hook.length * METERS_PER_UNIT : null, Math.max(0, this.hookReadyAt - now));
    this.hud.setArsenal(me.torpedoes, me.twin, me.plating, me.nova);
    this.hud.setKeys(this.input.device);
    // a watching Host sees the race of the pilot on screen
    // only a course of rings has its rings bracketed (see showRace, teach)
    this.hud.setGates(this.camera, null, null, 0);
    const waypoint = this.school ? this.teach(dt, myControls) : this.course ? this.showRace(this.course, subject) : this.flags ? this.showFlags(this.flags, subject) : this.fleet ? this.showFleet(this.fleet, subject) : this.survival ? this.callSurvival(me, subject) : null;
    if (!this.course && !this.school) this.guide.hide();
    this.flyGhost(me);
    const racing = !!this.course && !this.school && !this.clamped;
    if (racing) this.callRace(subject);
    this.pushRadio(racing && !this.spectating && me.finish < 0 && lapOf(me.gates) === LAPS);
    if (me.alive && this.state === 'playing') this.aimCrosshair(waypoint);
    this.hud.showCrosshair(me.alive);
    this.hud.setOnTarget(me.alive ? this.onTarget : null);

    const outside = me.alive && me.outsideSince !== null;
    if (!outside) this.toldToReturn = false;
    if (this.spectating) {
      const watched =
        subject === me ? t('the field') : now < this.handPickedUntil ? t('{name} (your pick)', { name: subject.name }) : t('{name} (live, the director cuts)', { name: subject.name });
      this.hud.flashMessage(now, t('Tournament full · watching {watched} · Tab: next pilot · you fly as soon as a place is free', { watched }), 0.2);
    } else if (this.watching()) {
      this.hud.flashMessage(now, t('Out · watching {watched} · Tab: next pilot', { watched: subject === me ? t('the field') : subject.name }), 0.2);
    } else if (outside) {
      this.hud.flashMessage(now, this.school ? t('Return to the field') : t('Return to the field — {seconds}s', { seconds: Math.max(0, ARENA_GRACE - (now - me.outsideSince!)).toFixed(1) }), 0.2);
      if (!this.toldToReturn) this.toldToReturn = this.speaker.say(COMPUTER.arena, 'urgent');
    } else if (this.flipping) {
      this.hud.flashMessage(now, this.flipAligned ? t('Flipped · drive brakes') : t('Flip'), 0.2);
    } else if (this.input.braking && me.alive) {
      this.hud.flashMessage(now, this.braked ? t('At rest') : t('Braking'), 0.2);
    }

    if (this.online) {
      this.online.update(now);
      this.updateLobby();
      // the room code is in the invite link; the HUD names the tournament, how many Hosts fly and why the relay is missing, if it is
      const relayOff = this.online.session.relayOff;
      const pilots = { name: this.room?.name ?? t('Online'), n: this.online.pilots };
      const hosts = pilots.n === 1 ? t('{name} · {n} Host', pilots) : t('{name} · {n} Hosts', pilots);
      const room = relayOff ? t('{hosts} · Relay off: {reason}', { hosts, reason: t(relayOff) }) : hosts;
      if ($('hud-room').textContent !== room) $('hud-room').textContent = room;
      if (now >= this.roundEndsAt) this.showOnlineResults();
    } else {
      if (this.decided() && this.roundEndsAt - now > DECIDED_SECONDS) this.setRoundEnd(DECIDED_SECONDS);
      if (now >= this.roundEndsAt) this.endRound();
    }
  }

  /**
   * The round is decided before its time: a race once every Host's clone has finished (bots do
   * not hold it up), Last Clone Standing once no more than one ship has a clone left, Capture
   * the Flag once a side has captured enough, the President's Fleet once his battleship went up.
   */
  private decided() {
    if (this.online && this.time - this.roundArrivedAt < DECIDE_GRACE) return false;
    if (this.survival) {
      const ships = this.standings();
      return ships.length > 1 && standing(ships) <= 1;
    }
    if (this.flags) return this.flags.won;
    if (this.fleet) return this.fleet.sunk(this.field.clock);
    if (!this.course) return false;
    // the Hosts who race: a watching Host is in the standings of no one (see standings)
    let hosts = 0;
    for (const ship of this.standings()) {
      if (ship.kind !== 'host') continue;
      if (ship.finish < 0) return false;
      hosts++;
    }
    return hosts > 0;
  }

  /**
   * Last Clone Standing as it runs: the clones left, who still stands and the flare in the HUD
   * (how far the front is from the pilot on screen, or how deep it is in the plasma), the safe
   * pocket marked once the flare comes; the announcer and Nicole call the flare and the last one
   * standing. Returns the pocket's middle for the crosshair, or null before the flare.
   */
  private callSurvival(me: Ship, subject: Ship): THREE.Vector3 | null {
    const clock = this.field.clock;
    if (!this.flareCalled && clock >= FLARE_START) {
      this.flareCalled = true;
      // a Host who joins long after it started is not told again
      if (clock < FLARE_START + 5) {
        this.radio.announce(ANNOUNCER_FLARE, null);
        this.speaker.say(COMPUTER.flare, 'urgent');
      }
    }
    const ships = this.standings();
    if (!this.survivorCalled && this.decided()) {
      this.survivorCalled = true;
      const last = ships.find((ship) => !isOut(ship));
      if (last) this.announce(pick(ANNOUNCER_SURVIVOR), last, true);
      if (last === me) this.speaker.say(COMPUTER.survivor, 'urgent');
    }
    const step = isOut(me) ? t('Out · {place}', { place: ordinal(ships.indexOf(me) + 1) }) : t('Last Clone Standing · {left}', { left: clonesLeftText(clonesLeft(me)) });
    const clearance = flareClearance(subject.flight.position, clock);
    const reach = { meters: Math.round(Math.abs(clearance) * METERS_PER_UNIT) };
    const flare =
      clock < FLARE_START
        ? t('solar flare in {seconds} s', { seconds: Math.ceil(FLARE_START - clock) })
        : clearance < 0
          ? t('in the flare, {meters} m deep · away from the sun', reach)
          : t('flare front {meters} m away', reach);
    this.hud.setSchool({ step, text: t('{n} of {total} standing · {flare}', { n: standing(ships), total: ships.length, flare }), keys: [] });
    const pocket = clock >= FLARE_START ? this.pocket : null;
    this.hud.setWaypoint(this.camera, pocket, t('Safe zone'));
    return pocket;
  }

  /**
   * The solar flare of Last Clone Standing on screen, from the field time alone: the plasma
   * coming at the arena and eating into it, the sun swelling and burning white-hot, embers blown
   * off the front near the camera, the Host's screen glowing with the heat; and the safe pocket
   * for whoever keeps to it. Outside Last Clone Standing it shows nothing.
   */
  private showFlare(dt: number) {
    const clock = this.field.clock;
    const coming = FLARE_START - FLARE_APPROACH;
    if (!this.survival || clock < coming) {
      this.flare.hide();
      this.space.flare(0);
      this.hud.setFlareHeat(0);
      this.pocket.set(0, 0, 0);
      this.pocketRadius = ARENA_LIMIT;
      return;
    }
    this.pocketRadius = flarePocket(clock, this.pocket);
    flareCenter(clock, flareAt);
    // it flares up over its approach, and the sun heats up until the front stops
    const strength = THREE.MathUtils.smoothstep(clock, coming, FLARE_START);
    this.flare.show(flareAt, strength, this.time, this.camera.position);
    this.space.flare(strength * (0.6 + 0.4 * THREE.MathUtils.smoothstep(clock, FLARE_START, FLARE_END)));
    // the front's point nearest the camera, and embers blown off it towards the far side
    const eye = this.camera.position;
    frontPoint.subVectors(eye, flareAt).setLength(FLARE_RADIUS).add(flareAt);
    const near = eye.distanceTo(flareAt) - FLARE_RADIUS;
    if (Math.abs(near) < EMBER_REACH && Math.random() < dt * 40 * strength) {
      emberDrift.copy(SUN_DIRECTION).multiplyScalar(-1500 - Math.random() * 1500);
      scratch.randomDirection().multiplyScalar(EMBER_REACH * 0.4 * Math.random()).add(frontPoint);
      this.effects.ember(scratch, emberDrift, 120 + Math.random() * 200);
    }
    const subject = this.subject();
    const clearance = subject.alive ? flareClearance(subject.flight.position, clock) : FLARE_GLOW;
    this.hud.setFlareHeat(strength * (1 - THREE.MathUtils.smoothstep(clearance, -FLARE_GLOW, FLARE_GLOW)));
  }

  /** The point a bot flies away from when a solar flare's front is close: the plasma's center out towards the sun. */
  private flareNear(ship: Ship): THREE.Vector3 | null {
    if (!this.survival) return null;
    const clock = this.field.clock;
    return flareClearance(ship.flight.position, clock) < FLARE_FLEE ? flareCenter(clock, flareAt) : null;
  }

  /**
   * Capture the Flag as it runs: the lead browser (or a solo round) applies the rules, every
   * browser moves the cores, takes the sides and hears the events; a ship that gets its first
   * side is printed at its base.
   */
  private playFlags(flags: Flags, dt: number, now: number) {
    const ships = this.standings();
    if (!this.roundOver && (!this.online || this.online.isLead)) flags.lead(ships, now);
    flags.update(dt, ships, now);
    for (const ship of this.ships) {
      const team = flags.teamOf(ship.id);
      if (team === ship.team) continue;
      const fresh = ship.team < 0;
      ship.team = team;
      if (fresh && team >= 0 && ship.owner === null && ship.alive) this.respawn(ship);
    }
    for (const event of flags.takeEvents()) this.flagEvent(event);
  }

  /** Something happened to a core: points for the own ship that did it (each browser scores its own), and word of it. */
  private flagEvent(event: FlagEvent) {
    const ship = event.ship ? (this.ships.find((s) => s.id === event.ship) ?? null) : null;
    if (ship && ship.owner === null) ship.score += FLAG_POINTS[event.kind];
    const me = this.me!;
    const ours = event.team === me.team;
    const named = { side: t(TEAM_NAMES[event.team]) };
    const who = ship === me ? t('You') : (ship?.name ?? t('Someone'));
    const now = this.time;
    if (ship === me && FLAG_POINTS[event.kind]) this.hud.popup(this.camera, me.flight.position, `+${FLAG_POINTS[event.kind]}`, 'points');
    if (event.kind === 'grab') {
      const took = ours ? t('{who} took your core', { who }) : t('{who} took the {side} core', { who, ...named });
      this.hud.flashMessage(now, ship === me ? t('You have their core · bring it home') : took, 3);
      if (ship === me) this.speaker.say(COMPUTER.coreGrabbed, 'urgent');
      else if (ours) this.speaker.say(COMPUTER.coreTaken, 'urgent');
    } else if (event.kind === 'drop') {
      this.hud.flashMessage(now, ours ? t('Your core adrift') : t('{side} core adrift', named), 2);
    } else if (event.kind === 'return') {
      const home = ours ? t('Your core back home') : t('{side} core back home', named);
      this.hud.flashMessage(now, ship ? `${home} · ${who}` : home, 2);
    } else {
      const side = 1 - event.team;
      this.hud.flashMessage(now, t('{side} captures · {score}', { side: t(TEAM_NAMES[side]), score: this.flagScore() }), 4);
      if (ship) this.announce(pick(ANNOUNCER_CAPTURE), ship, true);
      this.speaker.say(side === me.team ? COMPUTER.captured : COMPUTER.theyCaptured, 'urgent');
      if (ship === me) this.moment('capture');
      this.fanfare();
    }
  }

  /** Two rising beeps for a capture and a finish. */
  private fanfare() {
    this.sound.beep(1320, 0.1, 0.18);
    this.sound.beep(1760, 0.2, 0.18, 0.12);
  }

  /**
   * What a bot of Capture the Flag does: with the other side's core in tow it flies home; its
   * own core adrift it fetches; every other bot goes for the other side's core, the rest guard
   * the base or escort a carrier of their own. A thief of the own core is hunted by the guards.
   */
  private flagRole(bot: Bot, flags: Flags) {
    const ship = bot.ship;
    const side = ship.team;
    if (side < 0) return;
    const own = flags.cores[side];
    const theirs = flags.cores[1 - side];
    if (theirs.carrier === ship.id) {
      bot.waypoint = flags.bases[side];
      bot.raceSpeed = FLAG_HOME_SPEED;
      return;
    }
    // every FLAG_GUARDS-th bot of a side guards (counted by hand: this runs every frame)
    let rank = 0;
    for (const other of this.bots) {
      if (other === bot) break;
      if (other.ship.team === side) rank++;
    }
    const guard = rank % FLAG_GUARDS === 0;
    if (own.carrier && guard) {
      bot.prey = null;
      for (const s of this.ships) if (s.id === own.carrier) bot.prey = s;
    }
    if (!own.home && !own.carrier) bot.waypoint = own.position;
    else if (!guard && !theirs.carrier) bot.waypoint = theirs.home ? this.raidPoint(bot, theirs.position) : theirs.position;
    else bot.lure = theirs.carrier ? theirs.position : flags.bases[side];
  }

  /**
   * A raider does not fly straight at a core at home: it would have to turn around under the
   * guards' fire. It swings out beyond the base first, off to one side, and dives through the
   * core from there, already on its way home.
   */
  private raidPoint(bot: Bot, core: THREE.Vector3): THREE.Vector3 {
    const out = bot.ship.flight.position.length() > core.length() + FLAG_SWING / 2;
    if (out) return core;
    scratch.set(0, 1, 0).cross(core).setLength(FLAG_SWING);
    return this.botPoint(bot).copy(core).setLength(core.length() + FLAG_SWING).add(scratch);
  }

  /** The point of its own a bot steers by (see botPoints). */
  private botPoint(bot: Bot) {
    return this.botPoints.get(bot) ?? this.botPoints.set(bot, new THREE.Vector3()).get(bot)!;
  }

  /**
   * A racer near its next gate that would not pass its opening with room to spare would fly
   * into the coil's housings. Beside the opening it flies for a point on the gate's axis
   * APPROACH_FAR before it first; in front of it, but on a way that crosses the gate's plane
   * nearer the rim than APPROACH_CLEAR ship radii (or there already), it flies for the gate's
   * center; otherwise for its `waypoint`.
   */
  private approach(course: Course, ship: Ship, waypoint: THREE.Vector3): THREE.Vector3 {
    const next = ship.gates % GATES;
    const gate = course.points[next];
    const axis = course.normals[next];
    const offset = toAim.subVectors(ship.flight.position, gate);
    // the side it comes from: the gate counts either way
    const along = offset.dot(axis);
    if (Math.abs(along) > APPROACH_NEAR) return waypoint;
    const lateral = offset.addScaledVector(axis, -along);
    const beside = lateral.length();
    if (beside >= GATE_RADIUS) return waypoint.copy(gate).addScaledVector(axis, (along < 0 ? -1 : 1) * APPROACH_FAR);
    // where its way crosses the gate's plane, flying on as it does
    const velocity = ship.flight.velocity;
    const toward = velocity.dot(axis) * (along < 0 ? 1 : -1);
    const safe = GATE_RADIUS - ship.radius * APPROACH_CLEAR;
    if (toward > 0) lateral.addScaledVector(velocity, Math.abs(along) / toward).addScaledVector(axis, -lateral.dot(axis));
    if (beside < safe && lateral.length() < safe) return waypoint;
    return waypoint.copy(gate);
  }

  /** Capture the Flag in the HUD: the score, the own side, both cores, and where to fly; returns that point for the crosshair. */
  private showFlags(flags: Flags, me: Ship): THREE.Vector3 | null {
    const step = t('Capture the Flag · {score}', { score: this.flagScore() });
    const side = me.team;
    if (side < 0) {
      this.hud.setWaypoint(this.camera, null);
      this.hud.setSchool({ step, text: t('Waiting for a side…'), keys: [] });
      return null;
    }
    const own = flags.cores[side];
    const theirs = flags.cores[1 - side];
    const where = (core: (typeof flags.cores)[number]) =>
      core.home ? t('at home') : !core.carrier ? t('adrift') : core.carrier === me.id ? t('in your tow') : t('with {name}', { name: this.ships.find((s) => s.id === core.carrier)?.name ?? t('someone') });
    let goal = theirs.position;
    let label = t('Their core');
    if (theirs.carrier === me.id) {
      goal = flags.bases[side];
      label = own.home ? t('Home') : t('Home · get your core back first');
    } else if (!own.home) {
      goal = own.position;
      label = own.carrier ? t('Thief') : t('Your core');
    }
    this.hud.setWaypoint(this.camera, goal, label);
    this.hud.setSchool({ step, text: t('You fly for {side} · your core {own} · theirs {theirs}', { side: t(TEAM_NAMES[side]), own: where(own), theirs: where(theirs) }), keys: [] });
    return goal;
  }

  /**
   * The President's Fleet as it runs: the lead browser (or a solo round) flies the battleship,
   * the others glide after it; every browser fires its batteries, burns the ships it runs in
   * its plume, and calls what it does.
   */
  private playFleet(fleet: Fleet, dt: number, now: number) {
    const clock = this.field.clock;
    for (const ship of this.ships) ship.team = 0;
    if (!this.online || this.online.isLead) fleet.lead(dt, clock, this.ships, this.comets);
    else fleet.glide(dt);
    fleet.update(clock, now);
    for (const { zone, shot } of fleet.firing(clock)) this.fireBattery(fleet, zone, shot);
    for (const ship of this.ships) {
      if (ship.owner !== null || !ship.alive) continue;
      const plume = fleet.plumeAt(ship.flight.position, ship.radius);
      if (plume > 0) this.burn(ship, plume, FLEET_PLUME_HEAT, FLEET_PLUME_BURN, msg("In the battleship's drive plume · get out"), null, 'exhaust', dt, now);
    }
    if (fleet.present(clock) && !this.fleetCalled) {
      this.fleetCalled = true;
      this.radio.announce(pick(ANNOUNCER_FLEET.arrives), null);
      this.speaker.say(COMPUTER.battleship, 'urgent');
      this.hud.flashMessage(now, t('Battleship · take out its batteries'), 4);
    }
    // the battleship's phases, called once each, wherever the hits that changed it came from
    if (fleet.present(clock) && fleet.phase > this.fleetPhase) {
      this.fleetPhase = fleet.phase;
      this.radio.announce(fleet.phase === 2 ? ANNOUNCER_FLEET.plume : ANNOUNCER_FLEET.open, null);
      this.speaker.say(fleet.phase === 2 ? COMPUTER.fleetPlume : COMPUTER.reactorOpen, 'urgent');
    }
  }

  /**
   * A battery fires at the nearest ship it sees in range. Whether it hits follows from the
   * shot's number, the target and its speed and distance (see batteryChance), the same on
   * every browser; the browser that runs the target takes the damage.
   */
  private fireBattery(fleet: Fleet, zone: number, shot: number) {
    const origin = fleet.zoneAt(zone, muzzle);
    let target: Ship | null = null;
    let distance = BATTERY_RANGE;
    for (const ship of this.ships) {
      if (!ship.alive || this.time < ship.protectedUntil) continue;
      const d = ship.flight.position.distanceTo(origin);
      if (d < distance && this.field.lineOfSight(origin, ship.flight.position)) {
        target = ship;
        distance = d;
      }
    }
    if (!target) return;
    const roll = hash(textSeed(target.id), shot, zone) / 0x100000000;
    const hit = roll < batteryChance(target.flight.velocity.length(), distance);
    const end = scratch.copy(target.flight.position);
    // a miss goes past the target, by a few of its radii
    if (!hit) end.add(missBy.set(hash(shot, zone, 1) / 0x100000000 - 0.5, hash(shot, zone, 2) / 0x100000000 - 0.5, hash(shot, zone, 3) / 0x100000000 - 0.5).setLength(target.radius * 4));
    this.effects.beam(origin, end, BATTERY_COLOR);
    this.killcam.recordBeam(this.time, origin, end, BATTERY_COLOR);
    if (!hit || target.owner !== null) return;
    this.applyLaserHit(target, origin, forward.subVectors(end, origin).normalize(), null, distance, 'battery');
    if (target.alive && target.structural(BATTERY_DAMAGE, this.time) === 'destroyed') this.shipDestroyed(target, null, 'battery');
  }

  /**
   * An own ship's laser (one hit) or torpedo (TORPEDO_HITS) hit a part of the battleship: every
   * browser counts it; the shooter scores each hit and the part it breaks.
   */
  private hitFleet(fleet: Fleet, zone: number, shooter: Ship, point: THREE.Vector3, count = 1) {
    this.effects.sparks(point, shooter.color, 60);
    if (this.roundOver) return;
    this.online?.sendFleetHit(zone, this.roundId, shooter, count);
    shooter.score += FLEET_HIT_POINTS * count;
    if (shooter.isLocal) {
      this.hud.hit();
      this.sound.beep(1320, 0.06);
      this.landed(point, t(ZONE_NAMES[fleet.zones[zone].kind]).toUpperCase());
    }
    this.fleetEvents(fleet.hit(zone, count), shooter);
  }

  remoteFleetHit(zone: number, round: number, shooter: Ship, count: number) {
    // a hit of another round was on another battleship
    if (this.fleet && round === this.roundId && !this.roundOver) this.fleetEvents(this.fleet.hit(zone, count), shooter);
  }

  /** A part of the battleship as a torpedo of another browser homes on it. */
  beacon(id: string): Homing | null {
    return this.fleet?.beacons.find((beacon) => beacon.id === id) ?? null;
  }

  /** What a bot of the President's Fleet flies away from: the battleship going up close by, or the plume of one hunting with its stern. */
  private fleetDanger(ship: Ship, fleet: Fleet): THREE.Vector3 | null {
    if (fleet.dying(this.field.clock)) return ship.flight.position.distanceTo(fleet.position) < SINK_BLAST * 1.5 ? fleet.position : null;
    return fleet.plumeNear(ship.flight.position, ship.radius + PLUME_MARGIN, plumeAxis);
  }

  /** What the battleship's hits set off: a part breaking (points for an own shooter), a new phase, the ship going down. */
  private fleetEvents(events: FleetEvent[], shooter: Ship | null) {
    const fleet = this.fleet!;
    for (const event of events) {
      if (event.kind === 'broken') {
        const kind = fleet.zones[event.zone].kind;
        this.effects.explosion(event.position, 1500, fleet.velocity);
        this.hearDebris(event.position, 1500);
        if (shooter?.owner === null) shooter.score += ZONE_POINTS[kind];
        if (shooter?.isLocal) this.hud.popup(this.camera, event.position, `+${ZONE_POINTS[kind]}`, 'points');
        this.hud.flashMessage(this.time, t('{part} destroyed', { part: t(ZONE_NAMES[kind]) }), 2);
      } else if (event.kind === 'sunk') {
        // the reactor goes critical; SINK_SECONDS later the battleship goes up
        const position = event.position.clone();
        this.speaker.say(COMPUTER.reactorCritical, 'urgent');
        this.hud.flashMessage(this.time, t('Reactor critical · get clear · {distance}', { distance: meters(SINK_BLAST) }), SINK_SECONDS);
        this.cue(SINK_SECONDS, () => this.sinkBlast(position));
      }
    }
  }

  /**
   * The battleship goes up: every ship this browser runs within SINK_BLAST goes with it, and
   * every ship it runs scores the sinking.
   */
  private sinkBlast(position: THREE.Vector3) {
    const now = this.time;
    this.effects.explosion(position, 12000, scratch.set(0, 0, 0));
    this.shockwave(position);
    this.radio.announce(pick(ANNOUNCER_FLEET.sunk), null);
    for (const ship of [...this.ships]) {
      if (ship.owner !== null || ship === this.drone) continue;
      if (!this.roundOver) ship.score += SINK_POINTS;
      if (!ship.alive || ship.flight.position.distanceTo(position) > SINK_BLAST) continue;
      ship.protectedUntil = Math.min(ship.protectedUntil, now);
      if (ship.structural(Infinity, now) === 'destroyed') this.shipDestroyed(ship, null, 'blast');
    }
    this.hud.flashMessage(now, t('Battleship down · the round is yours · +{points}', { points: SINK_POINTS }), DECIDED_SECONDS);
    this.witnessBlast(position, SINK_BLAST * 3, 0.35);
    this.moment('sunk');
  }

  /** A blast the camera sees within `reach` blinds the link for a moment and is heard from far, deeper the bigger it is (`rate`); returns whether it was seen. */
  private witnessBlast(position: THREE.Vector3, reach: number, rate: number): boolean {
    const seen = this.camera.position.distanceTo(position);
    if (seen >= reach) return false;
    this.linkHit(Math.max(0.4, 1 - seen / reach), 1);
    this.kick = 2;
    this.sound.play('explosion', { volume: 2, rate });
    return true;
  }

  /** The part of the battleship a bot attacks: the nearest it can hurt; none while the battleship is away. */
  private siegePoint(bot: Bot, fleet: Fleet): THREE.Vector3 | null {
    if (!fleet.present(this.field.clock)) return null;
    const zone = fleet.nearestZone(bot.ship.flight.position);
    return zone < 0 ? null : fleet.zoneAt(zone, this.botPoint(bot));
  }

  /** The President's Fleet in the HUD: the battleship, what is left of it, and where to fly; returns that point for the crosshair. */
  private showFleet(fleet: Fleet, me: Ship): THREE.Vector3 | null {
    const clock = this.field.clock;
    const step = t(MODE_NAMES.fleet);
    if (!fleet.present(clock)) {
      this.hud.setWaypoint(this.camera, null);
      const text = fleet.down
        ? fleet.sunk(clock)
          ? t('Battleship down · the Hosts win')
          : t('Reactor critical · get clear')
        : t('The battleship comes in {seconds} s', { seconds: Math.max(0, Math.ceil(fleet.arrivesAt - clock)) });
      this.hud.setSchool({ step, text, keys: [] });
      return null;
    }
    const total = (kind: string) => fleet.zones.filter((zone) => zone.kind === kind).length;
    const parts = { batteries: fleet.batteries, allBatteries: total('battery'), drives: fleet.drives, allDrives: total('drive') };
    const text =
      fleet.phase === 3
        ? t('Sink it before the time runs out · batteries {batteries}/{allBatteries} · drives {drives}/{allDrives} · reactor open', parts)
        : t('Sink it before the time runs out · batteries {batteries}/{allBatteries} · drives {drives}/{allDrives} · reactor sealed', parts);
    this.hud.setSchool({ step, text, keys: [] });
    const zone = fleet.nearestZone(me.flight.position);
    const goal = zone < 0 ? fleet.position : fleet.zoneAt(zone, fleetGoal);
    this.hud.setWaypoint(this.camera, goal, zone < 0 ? t('Battleship') : t(ZONE_NAMES[fleet.zones[zone].kind]));
    return goal;
  }

  /** The radar's marks: the field's center, in a race the next gate of the ship it shows, and what each mode adds. */
  private radarMarks(subject: Ship): RadarMark[] {
    const list = this.shownMarks;
    list.length = 0;
    list.push(this.marks[0]);
    const course = this.course;
    if (course && subject.finish < 0) {
      const gate = this.marks[1];
      const next = subject.gates % GATES;
      gate.position.copy(course.points[next]);
      gate.label = t('Gate {n}', { n: next + 1 });
      list.push(gate);
    }
    // the bases, and the cores away from home
    this.flags?.cores.forEach((core, team) => {
      const [base, mark] = [this.flagMarks[team * 2], this.flagMarks[team * 2 + 1]];
      base.position.copy(this.flags!.bases[team]);
      list.push(base);
      if (core.home) return;
      mark.position.copy(core.position);
      list.push(mark);
    });
    if (this.fleet?.present(this.field.clock)) {
      this.fleetMark.position.copy(this.fleet.position);
      list.push(this.fleetMark);
    }
    // a solar flare: where its front is nearest, and the safe pocket
    if (this.flare.mesh.visible) {
      const [front, pocket] = this.flareMarks;
      const center = flareCenter(this.field.clock, flareAt);
      front.position.subVectors(subject.flight.position, center).setLength(FLARE_RADIUS).add(center);
      pocket.position.copy(this.pocket);
      list.push(front, pocket);
    }
    if (this.shower) {
      headAt(this.shower.comet, this.field.clock, this.cometMark.position);
      list.push(this.cometMark);
    }
    // torpedoes in flight, in red
    for (let i = 0; i < this.torpedoes.list.length && i < this.torpedoMarks.length; i++) {
      const mark = this.torpedoMarks[i];
      mark.position.copy(this.torpedoes.list[i].position);
      list.push(mark);
    }
    // probes, in green, with what is inside
    for (let i = 0; i < this.probes.list.length && i < this.probeMarks.length; i++) {
      const mark = this.probeMarks[i];
      const probe = this.probes.list[i];
      mark.position.copy(probe.position);
      mark.label = t(probe.luck === null ? ITEM_NAMES[probe.kind] : SEALED_NAME);
      list.push(mark);
    }
    const holder = this.ships.find((ship) => ship.nova && ship.alive && ship !== subject);
    if (holder) {
      this.novaMark.position.copy(holder.flight.position);
      list.push(this.novaMark);
    }
    return list;
  }

  /**
   * A ship this browser runs flew through its next gate: a gate's points, a lap, and after
   * the last lap the finish, with the points of its place among those finished before it.
   */
  private passGates(ship: Ship, course: Course) {
    if (!ship.alive || ship.finish >= 0) return;
    const gate = ship.gates % GATES;
    const off = course.crossing(gate, ship.previous, ship.flight.position);
    if (off === null) return;
    if (off < BOOST_RADIUS) this.boost(ship, course, gate);
    ship.gates++;
    ship.score += GATE_POINTS;
    if (ship === this.me) this.timeLap(gate);
    if (ship.gates >= FINISH_GATES) {
      ship.finish = +this.raceClock().toFixed(2);
      // the standings with this finish in them
      this.rankedAt = -1;
      const place = this.standings().indexOf(ship);
      ship.score += PLACE_POINTS[place] ?? 0;
      if (ship === this.me) {
        this.hud.flashMessage(this.time, t('Finished · {place} · +{points}', { place: ordinal(place + 1), points: PLACE_POINTS[place] ?? 0 }), 4);
        this.fanfare();
      }
      return;
    }
    if (ship !== this.me) return;
    this.sound.beep(1180, 0.06, 0.12);
    // through the pink gate: a new lap begins
    if (ship.gates > 1 && ship.gates % GATES === 1) {
      const last = lapOf(ship.gates) === LAPS;
      this.hud.flashMessage(this.time, last ? t('Last lap') : t('Lap {lap} of {laps}', { lap: lapOf(ship.gates), laps: LAPS }), 2);
      if (last) this.speaker.say(COMPUTER.finalLap, 'urgent');
    }
  }

  /**
   * A round's opening on the round clock, the same on every browser (see INTRO_SECONDS): the
   * intro, then 3, 2, 1 with the start lights, then BURN! or FIGHT!. Until then the clamps hold
   * every ship (returns true while they do); online they hold until the lead's clock is known.
   * The own drive lit just before BURN!, or just after it, makes a perfect start; lit too early
   * and still burning, it stalls. A browser that comes in after the start sees none of it.
   */
  private startCountdown(controls: Controls): boolean {
    if (this.school) {
      this.countdown = 0;
      this.endIntro();
      return false;
    }
    if (!Number.isFinite(this.roundEndsAt)) return true;
    const t = this.raceTime();
    const count = t < INTRO_SECONDS ? INTRO_COUNT : Math.max(0, Math.ceil(START_AT - t));
    const lit = controls.thrust > 0;
    if (lit && !this.driveLit) this.driveLitAt = t;
    this.driveLit = lit;
    if (count !== this.countdown) {
      if (count === INTRO_COUNT) this.startIntro();
      else this.endIntro();
      if (count > 0 && count < INTRO_COUNT) this.count(String(count), count === START_SECONDS);
      // the start itself only for who saw the countdown run out, not for a late arrival
      else if (count === 0 && this.countdown > 0 && t < START_AT + 1) this.go();
      this.countdown = count;
    }
    // the lights come on one by one over the countdown and all go out at the start
    const lights = count > 0 && count < INTRO_COUNT ? Math.min(START_LIGHTS, Math.floor(((t - INTRO_SECONDS) / START_SECONDS) * START_LIGHTS) + 1) : 0;
    if (lights !== this.lightsOn) {
      this.hud.setStartLights(lights, START_LIGHTS);
      this.lightsOn = lights;
    }
    if (this.startOpen && count === 0) {
      if (t > START_AT + START_LATE) this.startOpen = false;
      else if (lit && this.driveLitAt >= START_AT) {
        this.startOpen = false;
        this.perfectStart(this.me!);
      }
    }
    return count > 0;
  }

  /**
   * The intro of a round: the camera flies in over the arena (see introCamera), the field is
   * presented on a card, the stadium murmurs and the announcer opens the broadcast. Enter (A,
   * a tap on the card) skips it: in a solo round the countdown comes at once, online only the
   * camera comes home, as the round clock is everyone's.
   */
  private startIntro() {
    this.introSkipped = false;
    this.introOpen = true;
    this.crowd.swell(CROWD_INTRO, 1.5);
    this.broadcastOpened = true;
    this.openBroadcast();
    const pilots = this.standings().filter((ship) => ship !== this.drone);
    this.hud.showIntro({
      title: t(MODE_NAMES[this.roundMode]),
      arena: t(this.venue.name),
      tagline: t(this.venue.tagline),
      pilots: pilots.map((ship) => ({ name: ship.name, kind: ship.kind, skills: ship.kind === 'bot' ? skillScales(skillsOf(ship.name)) : '', own: ship === this.me })),
      skip: t('Skip'),
      onSkip: () => this.skipIntro(),
    });
  }

  /** The intro is over (its time ran out, or it was skipped): the card goes, the HUD comes back. */
  private endIntro() {
    if (!this.introOpen) return;
    this.introOpen = false;
    this.hud.hideIntro();
  }

  /** Enter during the intro: see startIntro. */
  private skipIntro() {
    if (!this.introOpen) return;
    this.introSkipped = true;
    this.endIntro();
    if (this.online) return;
    // a solo round moves its start back, so the countdown runs at once
    const left = INTRO_SECONDS - this.raceTime();
    if (left > 0) this.setRoundEnd(this.roundEndsAt - this.time - left);
  }

  /** BURN! or FIGHT!: the clamps let go; whose drive is lit is judged at once, the rest within START_LATE. */
  private go() {
    const me = this.me!;
    this.count(this.course ? t('BURN!') : t('FIGHT!'), false, true);
    this.startOpen = !!this.course && !this.spectating && me.alive;
    if (this.startOpen && this.driveLit) {
      this.startOpen = false;
      if (this.driveLitAt >= START_AT - START_WINDOW) this.perfectStart(me);
      else {
        this.stall(me);
        this.speaker.say(COMPUTER.falseStart, 'urgent');
      }
    }
    if (!this.course) return;
    for (const bot of this.bots) {
      if (bot.ship.owner === null && bot.ship.alive && bot !== this.sparring?.bot && Math.random() < bot.skills.reflexes * BOT_PERFECT_START) this.perfectStart(bot.ship);
    }
  }

  /**
   * A number of a countdown, or the start word, in big neon, with its beep. The stadium rises
   * with every number and erupts at the start, which also flashes and shakes the camera; the
   * first number brings the announcer's call for the round.
   */
  private count(text: string, first = false, start = false) {
    this.hud.countdown(text, start);
    if (start) {
      this.sound.beep(1320, 0.35, 0.22);
      if (this.school) return;
      this.crowd.erupt();
      this.kick = Math.max(this.kick, START_KICK);
      this.boostKick = 1;
      this.glitch.trigger(0.25, 0.25);
      return;
    }
    this.sound.beep(660, 0.12, 0.2);
    if (this.school) return;
    this.crowd.swell(CROWD_COUNT[Number(text)] ?? 0.5, 0.8, 1);
    if (first) this.radio.announce(pick(ANNOUNCER_START[this.roundMode]), null);
  }

  /** A false start: the drive was lit before BURN! and stalls (see FALSE_START_STALL). */
  private stall(ship: Ship) {
    ship.overheatDrive(this.time + FALSE_START_STALL);
    this.hud.flashMessage(this.time, t('Too early · drive stalled'), 2);
    this.sound.beep(220, 0.3, 0.15);
  }

  /** A perfect start: the drive lights the moment the clamps let go, a shove along the nose. */
  private perfectStart(ship: Ship) {
    ship.flight.velocity.addScaledVector(ship.flight.forward(forward), BOOST_PUSH);
    if (ship !== this.me) return;
    this.boostKick = 1;
    this.sound.play('boost', { volume: 1.1, rate: 0.8 });
    this.hud.flashMessage(this.time, t('Perfect start'), 1.5);
    this.speaker.say(COMPUTER.perfectStart, 'urgent');
    // the stadium saw it: a cheer, and the announcer says so
    if (this.school) return;
    this.crowd.swell(1, 0.2, 3);
    this.radio.announce(pick(ANNOUNCER_PERFECT), null);
  }

  /**
   * Through a gate's core: its coil pulls the ship through and lets it go BOOST_PUSH faster,
   * the way it flew (see BOOST_RADIUS). The ring flashes for everyone on this browser; the own
   * pilot feels the shove, hears the coil sing and sees the view widen.
   */
  private boost(ship: Ship, course: Course, gate: number) {
    course.flash(gate, this.time);
    this.coilPush(ship, course.normals[gate]);
  }

  /** A coil throws a ship on along an axis, the way it flies along it (see BOOST_PUSH); the flight school's coils too. */
  private coilPush(ship: Ship, axis: THREE.Vector3) {
    // the coil's field runs at the tournament's limit plus its push: it pushes no ship beyond that
    coilPush(ship.flight.velocity, axis, MAX_SPEED);
    if (ship !== this.me) return;
    this.boostKick = 1;
    this.strain = Math.max(this.strain, BOOST_STRAIN);
    this.effects.sparks(ship.flight.position, BOOST_COLOR, 120);
    this.sound.play('boost', { volume: 1.3 });
    this.sound.beep(1568, 0.05, 0.1);
    this.sound.beep(2093, 0.09, 0.1, 0.06);
    this.hud.flashMessage(this.time, t('Coil boost'), 1);
  }

  /** Seconds since the round started; 0 while an online round is not known yet. */
  private raceTime() {
    return Number.isFinite(this.roundEndsAt) ? Math.max(0, this.time - this.roundStartedAt) : 0;
  }

  /**
   * The round as it stands: in a race who finished, by the time it took, then who is racing,
   * by the gates passed; in Last Clone Standing who has the most clones left, and among those
   * out, who held out longest. Otherwise, and among equals, the score decides.
   */
  private standings(): readonly Ship[] {
    // asked for many times a frame: ranked once per frame into the same list
    if (this.rankedAt === this.time && this.rankedOf === this.ships && this.rankedCount === this.ships.length) return this.ranked;
    this.rankedAt = this.time;
    this.rankedOf = this.ships;
    this.rankedCount = this.ships.length;
    const list = this.ranked;
    list.length = 0;
    for (const ship of this.ships) if (ship !== this.drone && !(this.spectating && ship === this.me)) list.push(ship);
    return list.sort(this.rank);
  }

  /** The order of the standings (see standings). */
  private readonly rank = (a: Ship, b: Ship) => {
    const finished = (ship: Ship) => (ship.finish >= 0 ? ship.finish : Infinity);
    const lost = (ship: Ship) => (this.survival ? Math.min(ship.deaths, CLONES) : 0);
    const held = (ship: Ship) => this.outAt.get(ship) ?? Infinity;
    return finished(a) - finished(b) || b.gates - a.gates || lost(a) - lost(b) || held(b) - held(a) || b.score - a.score;
  };

  /** The standings of this frame (see standings): the list, when, of which list of ships (removing one replaces it) and of how many it was ranked. */
  private readonly ranked: Ship[] = [];
  private rankedAt = -1;
  private rankedOf: Ship[] | null = null;
  private rankedCount = -1;

  /** The racing line from a ship on to gate `next` of an ideal line: it leaves along the flight, or along the nose of a ship that hardly moves. */
  /** The next ring of a course in the HUD: its brackets, the ring after it, and where the own flight crosses its plane (see Hud.setGates). */
  private markRings(me: Ship, next: THREE.Vector3 | null, normal: THREE.Vector3 | null, after: THREE.Vector3 | null, radius: number) {
    const off = next && normal && me.alive ? pathCrossing(me.flight.position, me.flight.velocity, next, normal, CROSSING_HORIZON, crossingPoint) : null;
    this.hud.setGates(this.camera, next, after, radius, off === null ? null : crossingPoint, off !== null && off < radius);
  }

  private showGuide(me: Ship, line: RacingLine, next: number, missed: boolean) {
    const speed = me.flight.velocity.length();
    const heading = speed > 20 ? scratch.copy(me.flight.velocity).divideScalar(speed) : me.flight.forward(scratch);
    this.guide.show(me.flight.position, heading, speed, gripOf(me.flight), line, this.field, next, missed, wallClock());
  }

  /** The own racer's next gate in the HUD, with lap, gate and place; returns the gate for the crosshair. */
  private showRace(course: Course, me: Ship): THREE.Vector3 | null {
    const place = ordinal(this.standings().indexOf(me) + 1);
    if (me.finish >= 0) {
      course.highlight(-1, this.time);
      this.guide.hide();
      this.hud.setWaypoint(this.camera, null);
      this.hud.setSchool({ step: t('Finished · {place}', { place }), text: t('{time} s. Now hunt the others.', { time: me.finish.toFixed(1) }), keys: [] });
      return null;
    }
    const next = me.gates % GATES;
    const lap = lapOf(me.gates);
    course.highlight(next, this.time);
    // past the gate's plane without going through it, and still moving away from it
    const missed = scratch.subVectors(me.flight.position, course.points[next]).dot(course.normals[next]) > GATE_RADIUS && me.flight.velocity.dot(course.normals[next]) > 0;
    const gate = { n: next + 1, gates: GATES };
    const label = missed ? t('Missed · turn back') : next === 0 ? (me.gates === 0 ? t('Start') : lap === LAPS ? t('Finish') : t('Lap')) : t('Gate {n}/{gates}', gate);
    this.hud.setWaypoint(this.camera, course.points[next], label);
    this.markRings(me, course.points[next], course.normals[next], course.points[(next + 1) % GATES], GATE_RADIUS);
    if (me.alive) this.showGuide(me, course.line, next, missed);
    else this.guide.hide();
    // the running lap's clock, and the best lap of this arena to beat
    const lapTime = this.laps?.lapTime(this.raceClock());
    const best = this.laps?.best ? ` · ${t('best {time}', { time: lapClock(this.laps.best.time) })}` : '';
    const timing = lapTime != null ? ` · ${lapClock(lapTime)}${best}` : '';
    const text = missed ? t('Missed gate {n}: turn back and fly through it', gate) : `${t('Gate {n} of {gates}', gate)}${timing}`;
    this.hud.setSchool({ step: t('Race · lap {lap}/{laps} · {place}', { lap, laps: LAPS, place }), text, keys: [] });
    return course.points[next];
  }

  /** Seconds since BURN!: the race time every finish and lap is measured in. */
  private raceClock() {
    return this.raceTime() - START_AT;
  }

  /**
   * The own racer flew through gate `gate` of the lap: the split against the best lap, or the
   * lap's time; a new best lap is kept in this browser, with its ghost.
   */
  private timeLap(gate: number) {
    const event = this.laps?.pass(gate, this.raceClock());
    if (!event || event.kind === 'start') return;
    const delta = event.delta === null ? '' : ` · ${event.delta < 0 ? '−' : '+'}${Math.abs(event.delta).toFixed(2)}`;
    if (event.kind === 'split') {
      this.hud.split(this.time, `${t('Gate {n}', { n: event.gate + 1 })} · ${lapClock(event.split)}${delta}`, event.delta === null ? null : event.delta < 0);
      return;
    }
    const lap = t('Lap {time}', { time: lapClock(event.time) });
    this.hud.split(this.time, event.best ? t('{lap} · new best', { lap }) : `${lap}${delta}`, event.best || (event.delta === null ? null : false), 4);
    if (!event.best) return;
    const laps = parseLaps(storageGet(LAPS_KEY));
    laps[this.venue.id] = this.laps!.best!;
    storageSet(LAPS_KEY, JSON.stringify(laps));
  }

  /** The ghost of the best lap flies along the own lap, and the own lap is kept for the next ghost. */
  private flyGhost(me: Ship) {
    const laps = this.laps;
    if (!laps || this.school || this.spectating || me.finish >= 0) {
      this.ghost.show(null);
      return;
    }
    const t = this.raceClock();
    if (me.alive) laps.record(t, me.flight.position, me.flight.orientation);
    this.ghost.show(laps.ghostAt(t, ghostPosition, ghostTurn) ? ghostPosition : null, ghostTurn);
  }

  /**
   * Solar storms (see STORM_PERIOD): the sensors go blind, the link to the clone crackles.
   * The storm follows the shared field time, so it hits every Host at once.
   */
  private weather(dt: number, now: number) {
    const storm = this.venue.storms && this.field.clock % STORM_PERIOD > STORM_PERIOD - STORM_SECONDS;
    if (storm && !this.storming) {
      this.hud.flashMessage(now, t('SOLAR STORM · SENSORS BLIND'), STORM_SECONDS);
      this.linkHit(0.6, 1.2);
    }
    this.storming = storm;
    for (const bot of this.bots) bot.blind = storm;
    if (storm && Math.random() < dt * 2) this.glitch.trigger(0.25 + Math.random() * 0.35, 0.1 + Math.random() * 0.3);
  }

  /** Runs the flight school for this frame; returns the point its HUD marker sits on. */
  private teach(dt: number, controls: Controls): THREE.Vector3 | null {
    const school = this.school!;
    const context = (this.schoolContext ??= this.createSchoolContext());
    context.controls = controls;
    context.braking = this.input.braking;
    const hook = this.tethers.get(this.me!);
    context.hooked = !!hook?.anchor && hook.flying <= 0;
    context.autopilot = this.autopilot;
    context.cockpit = this.cockpit;
    context.impactAhead = this.impactAhead;
    context.device = this.input.device;
    context.now = this.time;
    context.dt = dt;
    const step = school.stepIndex;
    const waypoint = school.update(context);
    if (school.stepIndex !== step) {
      this.sound.beep(880, 0.1, 0.15);
      storageSet(SCHOOL_STEP_KEY, JSON.stringify({ ...schoolSteps(), [school.course]: school.stepIndex }));
    }
    if (school.finished) {
      storageSet(SCHOOL_DONE_KEY, JSON.stringify([...schoolDone().add(school.course)]));
      storageSet(SCHOOL_STEP_KEY, JSON.stringify({ ...schoolSteps(), [school.course]: undefined }));
      // back on the school's plate: the next course is a key away
      this.showMenu();
      this.showSchool(true);
      return null;
    }
    this.hud.setSchool(school.status(context.device), context.device === 'keyboard');
    this.hud.setWaypoint(this.camera, waypoint, school.mark);
    const me = this.me!;
    this.markRings(me, school.nextRing, school.nextNormal, school.ringAfter, RING_RADIUS);
    // a ring course has its racing line, as a race does; any other marker a line to it
    if (!waypoint) this.schoolLine = null;
    const track = school.track ?? (waypoint && me.flight.position.distanceTo(waypoint) > SCHOOL_LINE_MIN ? this.lineTo(me, waypoint) : null);
    if (track && me.alive) this.showGuide(me, track.line, track.next, false);
    else this.guide.hide();
    return waypoint;
  }

  /** The flight school's line to a marker: from where the pilot was when the marker came up (or last moved by SCHOOL_LINE_MOVE), ending at it. */
  private lineTo(me: Ship, waypoint: THREE.Vector3): { line: RacingLine; next: number } {
    if (!this.schoolLine || this.schoolLine.to.distanceTo(waypoint) > SCHOOL_LINE_MOVE) {
      this.schoolLine = { line: new RacingLine([waypoint], false, me.flight.position, 0), next: 0, to: waypoint.clone() };
    }
    return this.schoolLine;
  }

  /** What the flight school sees of the game; created once, the per-frame values are filled in by teach(). */
  private createSchoolContext(): SchoolContext {
    const game = this;
    return {
      get me() {
        return game.me!;
      },
      controls: IDLE,
      braking: false,
      hooked: false,
      impactAhead: false,
      autopilot: true,
      cockpit: false,
      device: 'keyboard',
      field: this.field,
      now: 0,
      dt: 0,
      get drone() {
        return game.drone;
      },
      spawnDrone: (position, velocity) => this.spawnDrone(position, velocity),
      get bot() {
        return game.sparring?.bot.ship ?? null;
      },
      spawnBot: (position, armed, skill) => this.spawnSparring(position, armed, skill),
      removeBot: () => {
        if (this.sparring) this.removeShip(this.sparring.bot.ship);
        this.sparring = null;
      },
      get speaking() {
        return game.speaker.speaking;
      },
      say: (lines) => this.speaker.say(lines, 'lesson'),
      fireAt: (from, through) => this.drillShot(from, through),
      boost: (through) => this.coilPush(this.me!, through),
      arm: (item) => {
        if (item === 'nova') game.me!.nova = true;
        else game.me!.torpedoes = Math.max(game.me!.torpedoes, TORPEDOES);
      },
      torpedoAt: (from) => this.drillTorpedo(from),
      get torpedoes() {
        return game.torpedoes.list.length;
      },
      get incoming() {
        return game.torpedoes.list[0]?.position ?? null;
      },
      get torpedoesDown() {
        return game.torpedoesDown;
      },
      get torpedoesHit() {
        return game.torpedoesHit;
      },
      get tracked() {
        return game.torpedoes.list.some((torpedo) => torpedo.target === game.me);
      },
      get dodges() {
        return game.dodges;
      },
      launchComet: (through, direction) => {
        this.drillComet = through && direction ? makeComet(this.field.clock + DRILL_COMET_LEAD, direction.clone().normalize(), through.clone(), Math.floor(this.time * 1000) + 1, this.field.well) : null;
      },
      get cometGone() {
        const comet = game.drillComet;
        return !comet || game.field.clock > Math.min(comet.at, comet.swallowed) + (SHOWER_LENGTH + SHOWER_WIDE) / COMET_SPEED;
      },
      spawnProbe: (position, kind) => {
        // a probe of its own each time: one taken is never shown again; it waits where it is
        // until the pilot comes for it
        this.probes.drop('school', Math.floor(this.time * 1000), [kind], position, new THREE.Vector3(), this.time);
        const probe = this.probes.list[this.probes.list.length - 1];
        probe.velocity.set(0, 0, 0);
        probe.until = Infinity;
        return probe.position;
      },
      countdown: (text, start) => this.count(text, false, start),
      perfectStart: () => this.perfectStart(this.me!),
      stall: () => this.stall(this.me!),
    };
  }

  /**
   * A flight school gunner's shot: a red beam from a point through another and on. It costs
   * no hull; a beam that passes the own ship closer than its radius sparks on it and shakes
   * the link, so the pilot sees a jink that came too late.
   */
  private drillShot(from: THREE.Vector3, through: THREE.Vector3) {
    const me = this.me!;
    const direction = forward.subVectors(through, from).normalize();
    const end = aimPoint.copy(from).addScaledVector(direction, from.distanceTo(through) * 2);
    this.effects.beam(from, end, DRILL_GUNNER_COLOR);
    const distance = raySphere(from, direction, me.flight.position, me.radius);
    if (distance === null) return;
    this.effects.sparks(scratch.copy(from).addScaledVector(direction, distance), DRILL_GUNNER_COLOR, 40);
    this.glitch.trigger(0.35, 0.3);
    this.sound.beep(220, 0.1, 0.2);
  }

  /** A defenseless target for the flight school, its drive towards the pilot: the one place a laser hurts. */
  private spawnDrone(position: THREE.Vector3, velocity: THREE.Vector3) {
    const me = this.me!;
    this.drone ??= this.addShip('drone', t('Target drone'), me.type === 'human' ? 'alien' : 'human', false);
    this.drone.spawn(position, lookingAt(me.flight.position, position, me.flight.up(upward)), this.time);
    this.drone.flight.velocity.copy(velocity);
    this.drone.protectedUntil = this.time;
  }

  /** The flight school's sparring bot, facing the pilot; an unarmed one only flies. */
  private spawnSparring(position: THREE.Vector3, armed: boolean, skill: number) {
    const me = this.me!;
    if (this.sparring) this.removeShip(this.sparring.bot.ship);
    const ship = this.addShip('sparring', t('Sparring bot'), me.type === 'human' ? 'alien' : 'human', false);
    const bot = new Bot(ship, evenSkills(skill));
    bot.armed = armed;
    this.bots.push(bot);
    this.sparring = { bot, armed };
    ship.spawn(position, lookingAt(position, me.flight.position, me.flight.up(upward)), this.time);
    ship.protectedUntil = this.time;
  }

  /**
   * The own ship's flight computer. While the brake is held, it flips the ship head over
   * and burns against the flight direction until the ship is at rest. While the flip is held,
   * it only turns the nose against the flight and keeps it there; the pilot's drive pushes
   * once the nose points the right way. Otherwise it keeps the ship upright and, with the
   * autopilot, takes out the drift.
   */
  private flightComputer(controls: Readonly<Controls>, dt: number): Controls {
    const me = this.me!;
    const flight = me.flight;
    const braking = this.state === 'playing' && this.input.braking && me.alive;
    if (braking) {
      this.steering.release();
      this.flipping = false;
      this.aimTarget();
      const speed = flight.velocity.length();
      // at rest the brake holds still until gravity has pulled the ship clearly out of rest,
      // so it does not flicker between resting and burning; the ship rights itself meanwhile
      if (speed < (this.braked ? BRAKE_RESUME : BRAKE_REST)) {
        if (!this.braked) this.sound.beep(660, 0.08);
        this.braked = true;
        this.brakeFlip = false;
        const resting = this.keepUpright(Object.assign(this.computed, controls));
        resting.thrust = 0;
        return resting;
      }
      this.braked = false;
      // the drift in ship space (the nose is -Z): +Z is the speed the drive brakes once flipped
      const drift = flight.toLocalDirection(flight.velocity, relative);
      retrograde.copy(flight.velocity).negate();
      const aligned = flight.angleTo(retrograde) < BRAKE_BURN_ANGLE;
      let burn: Controls;
      this.brakeFlip = speed > BRAKE_FINE || (this.brakeFlip && speed > BRAKE_SETTLE);
      if (this.brakeFlip) {
        burn = flight.flip(retrograde, 3, Object.assign(this.computed, controls));
        // the burn eases off at the end, so the ship comes to rest instead of reversing; a
        // damaged drive pushes less, so it eases off later
        burn.thrust = aligned ? Math.min(1, Math.max(0, drift.z) / (MAIN_THRUST * Math.max(me.drive, 0.05) * BRAKE_EASE)) : 0;
      } else {
        // the last few m/s: the nose stays where it is and the thrusters stop the ship, so a
        // slow drift that wanders in direction cannot make the ship flip back and forth
        burn = this.keepUpright(Object.assign(this.computed, controls));
        burn.thrust = 0;
        burn.strafeZ = THREE.MathUtils.clamp(drift.z / (RCS_THRUST * BRAKE_EASE), -1, 1);
      }
      // the thrusters take out the drift across the nose, which the drive cannot reach
      burn.strafeX = THREE.MathUtils.clamp(-drift.x / (RCS_THRUST * BRAKE_EASE), -1, 1);
      burn.strafeY = THREE.MathUtils.clamp(-drift.y / (RCS_THRUST * BRAKE_EASE), -1, 1);
      return burn;
    }
    this.braked = false;
    this.brakeFlip = false;
    const flipping = this.state === 'playing' && this.input.flipping && me.alive;
    if (!flipping) {
      this.flipping = false;
      // flung off the hook: the flight computer turns the nose onto the new course, unless the
      // pilot steers, and the autopilot does not brake the swing meanwhile
      const flung = this.time < this.flungUntil && me.alive;
      if (!this.autopilot || !me.alive || flung) this.steering.release();
      const out = this.autopilot && me.alive && !flung ? this.trimDrift(controls, dt) : Object.assign(this.computed, controls);
      if (flung && Math.abs(controls.yaw) + Math.abs(controls.pitch) < FLING_STEER && flight.velocity.lengthSq() > 1) flight.steer(flight.velocity, 3, out);
      return this.assistAim(this.keepUpright(out));
    }
    this.steering.release();
    if (!this.flipping) {
      // the goal is fixed when the flip starts: against the flight, or straight behind the nose
      // at rest; so a burn held past standstill speeds the ship up backwards instead of flipping again
      this.flipping = true;
      this.flipAligned = false;
      if (flight.velocity.lengthSq() > BRAKE_REST * BRAKE_REST) this.flipGoal.copy(flight.velocity).negate().normalize();
      else flight.forward(this.flipGoal).negate();
    }
    this.aimTarget();
    const aligned = flight.angleTo(this.flipGoal) < BRAKE_BURN_ANGLE;
    if (aligned && !this.flipAligned) this.sound.beep(660, 0.08);
    this.flipAligned = aligned;
    const out = flight.flip(this.flipGoal, 3, Object.assign(this.computed, controls));
    // the drive only pushes once the nose points the right way, never sideways during the turn
    out.thrust = aligned ? controls.thrust : 0;
    return out;
  }

  /**
   * Aim assist: a ship in sight within AIM_ASSIST_ANGLE of the nose pulls the nose onto it,
   * the firmer the closer it already is, and the less the pilot steers away. The bots aim
   * with a computer too; the pilot still pulls the trigger. Sets `onTarget` to what the laser
   * would hit now.
   */
  private assistAim(out: Controls): Controls {
    const target = this.aimTarget();
    if (!target) return out;
    const flight = this.me!.flight;
    const angle = this.aimAngle;
    flight.steer(toAim.subVectors(target.flight.position, flight.position), AIM_ASSIST_GAIN, assistSteer);
    const pull = AIM_ASSIST_STRENGTH * (1 - angle / AIM_ASSIST_ANGLE) * (1 - THREE.MathUtils.smoothstep(Math.hypot(out.yaw, out.pitch), 0.3, 0.8));
    out.yaw += (assistSteer.yaw - out.yaw) * pull;
    out.pitch += (assistSteer.pitch - out.pitch) * pull;
    return out;
  }

  /**
   * The ship in sight closest to the nose within AIM_ASSIST_ANGLE, or null; sets `onTarget`
   * to what the laser would hit now and `aimAngle` to how far the nose is off the target.
   * It runs while the brake or the flip turns the nose too, so the crosshair always tells.
   */
  private aimTarget(): Ship | null {
    const me = this.me!;
    const flight = me.flight;
    this.onTarget = null;
    if (!me.alive) return null;
    const nose = flight.forward(forward);
    let target: Ship | null = null;
    let angle = AIM_ASSIST_ANGLE;
    let distance = 0;
    for (const ship of this.ships) {
      if (ship === me || !ship.alive) continue;
      const line = toAim.subVectors(ship.flight.position, flight.position);
      const range = line.length();
      if (range > AIM_ASSIST_RANGE) continue;
      const off = nose.angleTo(line);
      if (off < angle && this.field.lineOfSight(flight.position, ship.flight.position)) {
        target = ship;
        angle = off;
        distance = range;
      }
    }
    this.aimAngle = angle;
    if (!target) return null;
    const line = toAim.subVectors(target.flight.position, flight.position);
    if (angle < target.radius / Math.max(distance, 1)) this.onTarget = target.tailToward(line) ? 'drive' : 'armor';
    return target;
  }

  /**
   * The pilot does not roll; the flight computer keeps the ship upright to the arena (its
   * north pole is up), so there is always a horizon. In steep climbs and dives it lets go,
   * so a loop is not fought halfway through.
   */
  private keepUpright(out: Controls): Controls {
    const up = this.me!.flight.toLocalDirection(scratch.set(0, 1, 0), scratch);
    // the ship's nose is -Z, so |up.z| is how steeply it points up or down
    const hold = 1 - THREE.MathUtils.smoothstep(Math.abs(up.z), UPRIGHT_LET_GO, UPRIGHT_FREE);
    out.roll = THREE.MathUtils.clamp(Math.atan2(up.x, up.y) * UPRIGHT_GAIN, -1, 1) * hold;
    return out;
  }

  /** E: the overdrive, a last resort; see OVERDRIVE_STRAIN. */
  private overdrive() {
    const me = this.me!;
    if (!me.alive || this.time < this.overdriveReadyAt) return;
    this.overdriveReadyAt = this.time + OVERDRIVE_RECHARGE;
    me.flight.velocity.addScaledVector(me.flight.forward(forward), OVERDRIVE_PUSH);
    me.overheatDrive(this.time + OVERDRIVE_DRIVE_COOLDOWN);
    // about sixty g at once: the clone is pressed to the edge of blacking out
    this.strain = Math.max(this.strain, OVERDRIVE_STRAIN);
    this.kick = 2;
    this.effects.engineTrail(me.toWorld(scratch.set(0, 0, me.radius * 0.9)), me.toWorld(relative.set(0, 0, me.radius * 4)), me.flight.velocity, 1);
    this.sound.play('explosion', { volume: 1.4, rate: 0.7 });
    this.hud.flashMessage(this.time, t('Overdrive'), 1.2);
  }

  /**
   * V, the right mouse button: pressed, the own hook fires along the nose; held, it reels in;
   * let go, it releases (see game/hook). Not in the clamps of a round's opening.
   */
  private hookOwn(now: number) {
    const me = this.me!;
    const held = this.state === 'playing' && me.alive && !this.spectating && !this.clamped && this.input.hooking;
    const pressed = held && !this.hookHeld;
    this.hookHeld = held;
    if (this.tethers.has(me)) {
      if (!held) this.unhook(me);
    } else if (pressed && now >= this.hookReadyAt) {
      this.fireHook(me);
    }
  }

  /**
   * A bot's hook: now and then it hooks the ship it hunts, dead ahead within reach, reels it in
   * for a moment and lets go (see BOT_HOOK_RATE); never the flight school's bots, never racing.
   */
  private botHook(bot: Bot, dt: number, now: number) {
    const ship = bot.ship;
    const target = bot.target;
    const tether = this.tethers.get(ship);
    if (tether) {
      // the ship it hooked, whichever it hunts now
      const hooked = tether.anchor?.ship;
      if (now >= bot.hookUntil || (hooked && !hooked.alive)) this.unhook(ship);
      return;
    }
    if (!target || bot === this.sparring?.bot || bot.waypoint || now < bot.hookReadyAt || Math.random() >= dt * BOT_HOOK_RATE * bot.skills.daring * (1 - bot.ease)) return;
    const distance = target.flight.position.distanceTo(ship.flight.position);
    if (distance < BOT_HOOK_MIN || distance > HOOK_RANGE * 0.9 || aimHook(ship, this.field, this.ships)?.anchor.ship !== target) return;
    this.fireHook(ship);
    devlog?.add({ kind: 'act', t: now, ship: ship.name, act: 'hook', detail: target.name });
    bot.hookUntil = now + flightTime(distance) + BOT_HOOK_HOLD;
    bot.hookReadyAt = bot.hookUntil + BOT_HOOK_PAUSE;
  }

  /** The harpoon leaves the nose: it bites what lies ahead within reach, or flies out and is reeled back. */
  private fireHook(ship: Ship) {
    const aim = aimHook(ship, this.field, this.ships.filter((other) => other !== this.drone));
    const end = aim ? aim.at : ship.nose(new THREE.Vector3()).addScaledVector(ship.flight.forward(forward), HOOK_RANGE);
    this.tethers.set(ship, { owner: ship, anchor: aim?.anchor ?? null, flying: flightTime(aim?.distance ?? HOOK_RANGE), end, length: 0, line: this.cables.take() });
    if (ship === this.me) this.sound.play('laser', { volume: 0.7, rate: 0.3 });
  }

  /** A hook lets go: the cable is reeled back. The own hook is ready again after HOOK_RECHARGE; a hook this browser fired and that held is told to the others. */
  private unhook(ship: Ship) {
    const tether = this.tethers.get(ship);
    if (!tether) return;
    this.tethers.delete(ship);
    this.cables.give(tether.line);
    const held = !!tether.anchor && tether.flying <= 0;
    if (ship.owner === null && held) this.online?.sendHook(ship, null);
    if (ship !== this.me) return;
    this.hookReadyAt = this.time + HOOK_RECHARGE;
    if (held && ship.alive) this.flungUntil = this.time + FLING_SECONDS;
  }

  private clearHooks() {
    for (const ship of [...this.tethers.keys()]) this.unhook(ship);
  }

  /**
   * Every hook out: a harpoon on its way bites when it arrives, a cable pulls the ships this
   * browser runs (the owner, and a hooked ship), and every cable is drawn from its owner's
   * nose. A hook whose owner, rock or ship is gone lets go, and so does a cable that snaps.
   */
  private updateHooks(dt: number) {
    for (const tether of this.tethers.values()) {
      const owner = tether.owner;
      if (!owner.alive) {
        this.unhook(owner);
        continue;
      }
      if (tether.flying > 0) {
        tether.flying -= dt;
        if (tether.flying <= 0) {
          // a miss is reeled back; so is a harpoon whose rock broke or whose ship died on the way
          const at = tether.anchor ? pivotOf(tether.anchor, hookPoint) : null;
          if (!at || !tether.anchor) {
            this.unhook(owner);
            continue;
          }
          tether.length = owner.flight.position.distanceTo(at);
          this.hooked(owner, tether.anchor, tether.length);
        }
      }
      const nose = owner.nose(hookNose);
      Cables.draw(tether.line, nose, cableEnd(tether, nose, hookEnd));
      if (tether.flying > 0 || !tether.anchor) continue;
      const at = pivotOf(tether.anchor, hookPoint);
      if (!at) {
        this.unhook(owner);
        continue;
      }
      // a ship hooked to a ship: the winch pulls both alike, each on the browser that runs it
      const target = tether.anchor.ship;
      const share = target ? 0.5 : 1;
      const floor = floorOf(owner, tether.anchor);
      let length: number | null = tether.length;
      // the winch yanks as hard as a coil throws: up to the limit plus a coil's push
      const rock = tether.anchor.rock;
      const anchorVelocity = target ? target.flight.velocity : rock ? this.field.surfaceVelocity(rock, at, hookVelocity) : hookVelocity.set(0, 0, 0);
      if (owner.owner === null) length = pullOn(owner.flight, at, anchorVelocity, length, true, share, floor, MAX_SPEED + BOOST_PUSH, dt);
      if (length !== null && target && target.owner === null) length = pullOn(target.flight, owner.flight.position, owner.flight.velocity, length, true, share, floor, MAX_SPEED + BOOST_PUSH, dt);
      if (length === null) {
        if (owner === this.me) this.hud.flashMessage(this.time, t('Cable snapped'), 1.5);
        this.unhook(owner);
        continue;
      }
      tether.length = length;
    }
  }

  /** A hook of this browser bit: the others are told, and the own pilot feels and hears it. */
  private hooked(owner: Ship, anchor: Anchor, length: number) {
    if (owner.owner !== null) return;
    this.online?.sendHook(owner, anchor.rock ? { rock: anchor.rock.id, local: anchor.local } : { target: anchor.ship }, length);
    if (owner !== this.me) return;
    this.sound.play('explosion', { volume: 0.5, rate: 2.4 });
    this.sound.beep(523, 0.08, 0.12);
    this.hud.flashMessage(this.time, anchor.ship ? t('Hooked {name}', { name: anchor.ship.name }) : t('Hooked'), 1.2);
    if (anchor.ship) this.kick = Math.max(this.kick, 0.8);
  }

  /** A ship of another browser hooked a rock or a ship: its cable shows here, and pulls a ship this browser runs. */
  remoteHook(owner: Ship, rock: string | null, local: THREE.Vector3 | null, target: Ship | null, length: number) {
    this.unhook(owner);
    const asteroid = rock ? this.field.asteroids.get(rock) : undefined;
    const anchor: Anchor | null = asteroid && local ? { rock: asteroid, local: local.clone(), ship: null } : target ? { rock: null, local: null, ship: target } : null;
    if (!anchor) return;
    this.tethers.set(owner, { owner, anchor, flying: 0, end: new THREE.Vector3(), length, line: this.cables.take() });
    if (target === this.me) {
      this.hud.flashMessage(this.time, t('Hooked by {name}', { name: owner.name }), 2);
      this.linkHit(0.3, 0.2);
    }
  }

  remoteUnhook(owner: Ship) {
    this.unhook(owner);
  }

  /** G, D-pad up: a torpedo, at the ship closest to the nose when one is locked (see game/torpedoes). */
  private fireTorpedo(ship: Ship) {
    if (!ship.alive || ship.torpedoes <= 0) return;
    ship.torpedoes--;
    // firing ends the own spawn protection, as the laser does
    ship.protectedUntil = Math.min(ship.protectedUntil, this.time);
    const target = this.torpedoTarget(ship);
    const id = `${ship.id}.${ship.torpedoesFired++}`;
    const position = ship.nose(new THREE.Vector3());
    const velocity = Torpedoes.launchVelocity(ship);
    this.torpedoes.launch(id, ship, target, position, velocity, this.time, true);
    this.online?.sendTorpedo(id, ship, target, position, velocity);
    if (ship.isLocal) {
      this.sound.play('laser', { volume: 0.9, rate: 0.45 });
      this.hud.flashMessage(this.time, target ? t('Torpedo away · {name}', { name: target.name }) : t('Torpedo away · no lock'), 1.5);
    }
  }

  /** What a torpedo of `ship` would lock on: the ship or part of the battleship in sight closest to its nose (see LOCK_ANGLE). */
  private torpedoTarget(ship: Ship): Homing | null {
    let best: Homing | null = null;
    let angle = LOCK_ANGLE;
    const consider = (other: Homing) => {
      const line = toAim.subVectors(other.flight.position, ship.flight.position);
      if (line.length() > LOCK_DISTANCE) return;
      const off = ship.flight.angleTo(line);
      if (off < angle && this.field.lineOfSight(ship.flight.position, other.flight.position)) {
        best = other;
        angle = off;
      }
    };
    // the flight school's target drone too: its torpedo drill is about the lock
    for (const other of this.ships) if (other !== ship && other.alive && !other.allyOf(ship)) consider(other);
    for (const beacon of this.fleet?.beacons ?? []) if (beacon.alive) consider(beacon);
    return best;
  }

  /** An own torpedo went off: on a ship (whose browser takes the damage), on the battleship, on a rock, or burnt out. */
  private detonate(torpedo: Torpedo, hit: Ship | null) {
    this.blowUp(torpedo);
    this.online?.sendTorpedoGone(torpedo.id, torpedo.position, null);
    // every part of the battleship close to where it went off takes it
    if (this.fleet) for (const zone of this.fleet.blast(torpedo.position)) this.hitFleet(this.fleet, zone, torpedo.shooter, torpedo.position, TORPEDO_HITS);
    if (!hit) return;
    if (hit.owner === null) this.applyTorpedoHit(hit, torpedo.shooter);
    else this.online?.sendTorpedoHit(hit, torpedo.shooter, torpedo.id);
    if (torpedo.shooter.isLocal) {
      this.hud.hit();
      this.landed(hit.flight.position, t('TORPEDO'));
    }
  }

  /**
   * The round's probes: the arena's show up on the round clock (the same on every browser),
   * all of them drift, and a ship this browser runs that flies through one takes it.
   */
  private items(dt: number, now: number) {
    this.updateShockwaves();
    for (const ship of this.ships) ship.pulse(now);
    // the world looks different while the own clone holds a nova core
    const holding = !!this.me?.nova && this.me.alive;
    if (document.body.classList.contains('nova-held') !== holding) document.body.classList.toggle('nova-held', holding);
    // the flight school shows only the probes its drills put out
    const seed = this.online ? textSeed(this.online.session.room) : this.soloSeed;
    if (!this.school && this.roundId >= 0) this.probes.schedule(seed, this.roundId, this.raceTime(), now, this.field, this.course?.points);
    this.probes.update(dt, now, this.field);
    for (const ship of this.ships) {
      if (ship.owner !== null || !ship.alive || ship === this.drone || (this.spectating && ship === this.me)) continue;
      const probe = this.probes.touching(ship.flight.position, ship.radius);
      if (probe) this.takeProbe(ship, probe);
    }
  }

  private takeProbe(ship: Ship, probe: Probe) {
    const bucket = this.bucketOf(ship);
    this.probes.take(probe);
    this.online?.sendProbe(probe.id, ship, bucket);
    this.useItem(ship, contents(probe, bucket));
  }

  /** The third of the race a ship lies in (see placeBucket); outside a race the middle. */
  private bucketOf(ship: Ship): number {
    if (!this.course) return 1;
    const standings = this.standings();
    return placeBucket(standings.indexOf(ship), standings.length);
  }

  /** What an item does to the ship that took it. */
  private useItem(ship: Ship, kind: ItemKind) {
    switch (kind) {
      case 'twin':
        ship.twin = true;
        break;
      case 'plating':
        ship.plating = PLATING_CHARGES;
        break;
      case 'torpedoes':
        ship.torpedoes += 2;
        break;
      case 'overdrive':
        if (ship === this.me) this.overdriveReadyAt = 0;
        break;
      case 'repair':
        ship.repair();
        break;
      case 'nova':
        ship.nova = true;
        // the core goes off on the next press of fire, not on fire held since before
        ship.holdTrigger();
        break;
    }
    if (ship.isLocal) {
      this.hud.flashMessage(this.time, `${t(ITEM_NAMES[kind])} · ${t(ITEM_HINTS[kind])}`, kind === 'nova' ? 4 : 2.5);
      if (kind === 'nova') this.speaker.say(COMPUTER.nova, 'urgent');
      this.sound.beep(988, 0.07, 0.15);
      this.sound.beep(1319, 0.07, 0.15, 0.07);
      this.sound.beep(1976, 0.12, 0.15, 0.14);
    }
  }

  /**
   * Another browser's ship took a probe; an id no probe could have is ignored. A sealed probe
   * holds what the taker's place made of it: the third the taker's browser names, unless it
   * lies two thirds from where this browser sees the taker (standings differ by a little lag,
   * not from first to last), then the third seen here.
   */
  remoteProbe(id: string, ship: Ship | null, bucket: number): ItemKind | null | undefined {
    const deathsOf = (s: string) => this.ships.find((other) => other.id === s)?.deaths ?? null;
    if (!this.probes.plausible(id, this.roundId, deathsOf)) return undefined;
    const probe = this.probes.takeId(id);
    if (!probe) return null;
    const seen = ship ? this.bucketOf(ship) : 1;
    return contents(probe, Math.abs(bucket - seen) <= 1 ? bucket : seen);
  }

  probeWithin(id: string, ship: Ship): boolean {
    const probe = this.probes.find(id);
    // the taker flew through it on its own screen: here it may be a moment behind, at full speed
    return !probe || probe.position.distanceTo(ship.flight.position) < PROBE_RADIUS + ship.radius + PROBE_LAG + ship.flight.velocity.length() * 0.5;
  }

  rockAt(id: string): { position: THREE.Vector3; radius: number } | null {
    const rock = this.field.asteroids.get(id);
    if (rock) return { position: rock.object.position, radius: rock.radius };
    return this.brokenHere.get(id) ?? null;
  }

  fleetZoneAt(zone: number): THREE.Vector3 | null {
    return this.fleet?.present(this.field.clock) ? this.fleet.zoneAt(zone, new THREE.Vector3()) : null;
  }

  /** Several browsers found a Host cheating: everyone is told. */
  announceCheater(name: string) {
    this.hud.flashMessage(this.time, t('CHEATER · {name}', { name }), 6);
    this.sound.beep(220, 0.3, 0.15);
    this.sound.beep(165, 0.4, 0.15, 0.3);
  }

  probesTaken() {
    return this.probes.takenIds();
  }

  restoreProbes(taken: string[], probes: ProbeState[]) {
    for (const id of taken) this.probes.takeId(id);
    this.probes.restore(probes, this.time);
  }

  probeSnapshot() {
    return this.probes.snapshot(this.time);
  }

  /**
   * A nova core goes off: a shockwave runs out to NOVA_RADIUS, and every ship this browser
   * runs inside it is gone, whatever protects it (each browser destroys its own and says so,
   * as with every death), together with torpedoes and wreckage there. The holder's clone burns
   * up too and is printed again at once.
   */
  novaBlast(holder: Ship, position: THREE.Vector3) {
    const now = this.time;
    this.effects.explosion(position, holder.radius * 12, holder.flight.velocity);
    this.shockwave(position);
    for (const ship of [...this.ships]) {
      if (ship === holder || ship.owner !== null || !ship.alive || ship.allyOf(holder) || ship.flight.position.distanceTo(position) > NOVA_RADIUS) continue;
      ship.protectedUntil = Math.min(ship.protectedUntil, now);
      if (ship.structural(Infinity, now) === 'destroyed') this.shipDestroyed(ship, holder, 'nova');
    }
    // the holder's clone burns up in its own core, leaving nothing behind; no one is blamed for
    // it, and the sponsors are so thrilled by the show that the next clone comes without an ad
    if (holder.owner === null && holder.alive) {
      this.respawn(holder);
      if (holder === this.me) {
        this.speaker.say(COMPUTER.novaReprint, 'urgent');
        this.hud.flashMessage(now, t('Sponsors thrilled · no ad · next clone ready'), 3);
      }
    }
    for (const torpedo of [...this.torpedoes.list]) if (torpedo.position.distanceTo(position) < NOVA_RADIUS) this.blowUp(torpedo);
    for (const wreck of [...this.wrecks.list]) if (wreck.mesh.position.distanceTo(position) < NOVA_RADIUS) this.shatterWreck(wreck);
    // whoever sees it is blinded for a moment, and hears its debris from far
    if (this.witnessBlast(position, NOVA_RADIUS * 3, 0.4)) {
      // the class goes once the flash has faded, or showing the HUD again would replay it
      document.body.classList.remove('nova-flash');
      void document.body.offsetWidth;
      document.body.classList.add('nova-flash');
      clearTimeout(this.novaFlashTimer);
      this.novaFlashTimer = window.setTimeout(() => document.body.classList.remove('nova-flash'), NOVA_FLASH_MS);
    }
    if (holder !== this.me) this.hud.flashMessage(now, t('NOVA · {name}', { name: holder.name }), 2.5);
  }

  /**
   * Panic in the own cockpit while another ship with a nova core is close: a CRITICAL alarm
   * with its two-tone siren and the red edge, and Nicole urging the pilot away, once each time
   * a holder comes close.
   */
  private novaAlarm(me: Ship) {
    const holder = me.alive ? this.novaNear(me, NOVA_RADIUS * NOVA_FLEE) : null;
    if (!holder) {
      this.novaWarned = null;
      return;
    }
    const away = relative.subVectors(holder.flight.position, me.flight.position);
    this.alarms.raise({ id: 'nova', level: 'critical', text: t('NOVA CORE ACTIVATED · {distance} · GET OUT', { distance: meters(away.length()) }), direction: away, tone: 'nova' });
    if (this.novaWarned !== holder) {
      this.novaWarned = holder;
      this.speaker.say(COMPUTER.novaNear, 'urgent');
    }
  }

  /** How many other living ships are within `range` of a ship. */
  private crowdAround(ship: Ship, range: number): number {
    let count = 0;
    for (const other of this.ships) if (other !== ship && other.alive && other !== this.drone && other.flight.position.distanceTo(ship.flight.position) < range) count++;
    return count;
  }

  /** The nearest other ship within `range` that holds a nova core, if any. */
  private novaNear(ship: Ship, range: number): Ship | null {
    let best: Ship | null = null;
    let distance = range;
    for (const other of this.ships) {
      if (other === ship || !other.alive || !other.nova) continue;
      const d = other.flight.position.distanceTo(ship.flight.position);
      if (d < distance) {
        best = other;
        distance = d;
      }
    }
    return best;
  }

  /** The shell of a nova: a glowing sphere that runs out to NOVA_RADIUS and fades. */
  private shockwave(position: THREE.Vector3) {
    const mesh = new THREE.Mesh(this.shockwaveGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.6).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, born: this.time });
  }

  private updateShockwaves() {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const { mesh, born } = this.shockwaves[i];
      const t = (this.time - born) / NOVA_EXPANSION;
      if (t >= 1) {
        this.removeShockwave(i);
        continue;
      }
      mesh.scale.setScalar(NOVA_RADIUS * Math.sqrt(t));
      mesh.material.opacity = 0.6 * (1 - t);
    }
  }

  private removeShockwave(index: number) {
    const { mesh } = this.shockwaves[index];
    this.scene.remove(mesh);
    mesh.material.dispose();
    this.shockwaves.splice(index, 1);
  }

  private clearShockwaves() {
    while (this.shockwaves.length) this.removeShockwave(0);
  }

  /** A beam went through a torpedo: it goes off where it is, on every browser. */
  private shootDown(torpedo: Torpedo, shooter: Ship) {
    this.blowUp(torpedo);
    if (shooter.owner !== null) return;
    this.online?.sendTorpedoGone(torpedo.id, torpedo.position, shooter);
    shooter.score += TORPEDO_DOWN_POINTS;
    if (!shooter.isLocal) return;
    this.torpedoesDown++;
    this.hud.popup(this.camera, torpedo.position, t('TORPEDO DOWN +{points}', { points: TORPEDO_DOWN_POINTS }), 'points');
    this.moment('interception');
  }

  /** A flight school drill's torpedo: from a ship (the drone), homing on the own pilot, launched straight at it. */
  private drillTorpedo(from: Ship) {
    const me = this.me!;
    const position = from.flight.position.clone();
    const velocity = toAim.subVectors(me.flight.position, position).setLength(DRILL_TORPEDO_LAUNCH).clone();
    this.torpedoes.launch(`${from.id}.${from.torpedoesFired++}`, from, me, position, velocity, this.time, true);
  }

  private blowUp(torpedo: Torpedo) {
    this.effects.explosion(torpedo.position, TORPEDO_RADIUS * 4, torpedo.velocity);
    this.hearDebris(torpedo.position, TORPEDO_RADIUS * 4);
    this.torpedoes.remove(torpedo);
  }

  applyTorpedoHit(ship: Ship, shooter: Ship | null) {
    const now = this.time;
    if (shooter && ship.allyOf(shooter)) return;
    // plating (an item) takes a whole torpedo and is gone
    if (ship.plating > 0 && now >= ship.protectedUntil) {
      ship.plating = 0;
      this.effects.sparks(ship.flight.position, PLATING_COLOR, 160);
      if (ship.isLocal) this.hud.flashMessage(now, t('Plating took the torpedo'), 1.5);
      return;
    }
    const status = ship.structural(TORPEDO_DAMAGE, now);
    if (status === 'protected') return;
    if (shooter?.isLocal) this.torpedoesHit++;
    // the blast shakes the thrusters too
    ship.thrusters = Math.max(0, ship.thrusters - 0.3);
    if (ship.isLocal) {
      this.hud.damaged();
      this.hud.flashMessage(now, t('Torpedo hit'), 1.5);
      this.sound.play('explosion', { volume: 1.5, rate: 0.9 });
      this.linkHit(0.9, 0.6);
    }
    if (status === 'destroyed') {
      this.shipDestroyed(ship, shooter, null, 'torpedo');
      // a streak's banner outranks the torpedo's
      if (shooter && shooter === this.me && !ship.allyOf(shooter)) this.moment('torpedo');
    }
  }

  remoteTorpedo(id: string, shooter: Ship, target: Homing | null, position: THREE.Vector3, velocity: THREE.Vector3) {
    this.torpedoes.launch(id, shooter, target, position, velocity, this.time, false);
  }

  recentTorpedo(id: string) {
    return this.torpedoes.recent(id);
  }

  remoteTorpedoGone(id: string, position: THREE.Vector3) {
    const torpedo = this.torpedoes.find(id);
    // it flies here too: a report from far off its course is no shot that downed it
    if (!torpedo || torpedo.position.distanceTo(position) > TORPEDO_GONE_SLACK) return;
    torpedo.position.copy(position);
    this.blowUp(torpedo);
  }

  /** A thruster key tapped twice, or LB: the dodge; see DODGE_SPEED. */
  private dodge(direction: { x: number; y: number }) {
    const me = this.me!;
    if (!me.alive || this.time < this.dodgeReadyAt) return;
    this.dodgeReadyAt = this.time + DODGE_RECHARGE;
    this.dodges++;
    this.thrusterKick(me, direction);
    this.strain = Math.min(1, this.strain + DODGE_STRAIN);
    this.kick = Math.min(2, this.kick + 0.8);
    this.sound.play('explosion', { volume: 0.5, rate: 2.6 });
  }

  /** A ship kicks its thrusters, sideways or up or down in its own frame: the dodge, and a bot's shove (see Bot.shove). */
  private thrusterKick(ship: Ship, direction: { x: number; y: number }) {
    // a damaged thruster kicks weaker
    const push = relative.set(direction.x, direction.y, 0).normalize().multiplyScalar(DODGE_SPEED * (0.25 + 0.75 * ship.thrusters));
    ship.flight.velocity.add(push.applyQuaternion(ship.flight.orientation));
    // the gas leaves on the side opposite to the kick
    const nozzle = ship.toWorld(scratch.set(-direction.x, -direction.y, 0).multiplyScalar(ship.radius * 0.7), scratch);
    for (let i = 0; i < 6; i++) this.effects.puff(nozzle, aimPoint.copy(push).multiplyScalar(-1.5).add(ship.flight.velocity), ship.radius * 0.25);
  }

  /** The drive lights: the first moment of a burn is felt, with a jolt and a thump through the hull. */
  private ignite(controls: Readonly<Controls>) {
    const me = this.me!;
    const burning = me.alive && controls.thrust > 0.5 && !me.driveOffline(this.time) && !me.flight.limited;
    if (burning && !this.burning) {
      this.kick = Math.min(2, this.kick + 0.35);
      this.sound.play('explosion', { volume: 0.45, rate: 0.45 });
    }
    this.burning = burning;
  }

  /** Passing a rock close and fast pays (see CLOSE_CALL_SPEED); a touch does not. */
  private closeCall(now: number) {
    const me = this.me!;
    if (!me.alive || this.school) {
      this.closePass = null;
      return;
    }
    const flight = me.flight;
    for (const id of this.closeCalls) {
      const rock = this.field.asteroids.get(id);
      if (!rock || rock.object.position.distanceTo(flight.position) > rock.radius + me.radius * CLOSE_CALL_CLEAR) this.closeCalls.delete(id);
    }
    const near = this.field.overlap(flight.position, me.radius * CLOSE_CALL_REACH);
    const pass = this.closePass;
    if (pass && near?.id !== pass.id) {
      // the pass is over: it pays if it was fast and never touched the rock
      this.closePass = null;
      if (!pass.touched) this.payCloseCall(now);
    }
    const touched = now - this.lastScrape < 0.1;
    if (near && this.closePass) this.closePass.touched ||= touched;
    if (!near || this.closePass || this.closeCalls.has(near.id) || flight.velocity.lengthSq() < CLOSE_CALL_SPEED * CLOSE_CALL_SPEED) return;
    this.closeCalls.add(near.id);
    this.closePass = { id: near.id, touched };
  }

  private payCloseCall(now: number) {
    const me = this.me!;
    const flight = me.flight;
    if (now - this.lastCloseCall < 0.5) return;
    this.lastCloseCall = now;
    me.score += CLOSE_CALL_POINTS;
    this.hud.popup(this.camera, scratch.copy(flight.position).addScaledVector(flight.forward(forward), me.radius * 4), t('CLOSE CALL +{points}', { points: CLOSE_CALL_POINTS }), 'points');
    this.sound.beep(1180, 0.05, 0.12);
    this.sound.beep(1570, 0.08, 0.12, 0.06);
  }

  /** T: the autopilot on or off. */
  private toggleAutopilot() {
    this.autopilot = !this.autopilot;
    this.sound.beep(this.autopilot ? 880 : 440, 0.08);
  }

  /**
   * The autopilot: path steering flies the ship by its path (see PathSteering). Where it does
   * not (slower than 20 m/s, or the nose elsewhere), the thrusters push against every drift
   * across the nose, so the ship flies where it points and the main drive (W) pushes it exactly
   * that way. The pilot's own thruster input on an axis goes first.
   */
  private trimDrift(controls: Readonly<Controls>, dt: number): Controls {
    const out = Object.assign(this.computed, controls);
    const me = this.me!;
    // right after a dodge the drift is the point, and so is a swing on the hook
    if (this.time < this.dodgeReadyAt - DODGE_RECHARGE + DODGE_DRIFT || this.tethers.has(me)) {
      this.steering.release();
      return out;
    }
    if (this.steering.fly(me.flight, controls, this.field.gravity(me.flight.position, gravity), dt, out)) return out;
    const drift = me.flight.toLocalDirection(me.flight.velocity, relative).divideScalar(RCS_THRUST * AUTOPILOT_EASE);
    if (!controls.strafeX) out.strafeX = THREE.MathUtils.clamp(-drift.x, -1, 1);
    if (!controls.strafeY) out.strafeY = THREE.MathUtils.clamp(-drift.y, -1, 1);
    return out;
  }

  /**
   * A ship this browser runs inside another's drive plume (see PLUME_REACH) gets grilled: its
   * radiators take the heat, its hull burns, and a clone that burns up counts as a kill of the
   * ship that burned. The flight school has no plumes: its drills chase drives on purpose.
   */
  private scorch(ship: Ship, dt: number, now: number) {
    if (this.school || !ship.alive) return;
    let hottest = 0;
    let burner: Ship | null = null;
    for (const other of this.ships) {
      const throttle = other.flight.throttle;
      if (other === ship || !other.alive || throttle < PLUME_THROTTLE) continue;
      // behind the other's drive, along its axis, and inside the cone the plume spreads to
      const back = other.flight.forward(forward).negate();
      const away = relative.subVectors(ship.flight.position, other.flight.position);
      const along = away.dot(back);
      if (along <= 0 || along > PLUME_REACH) continue;
      const across = away.addScaledVector(back, -along).length();
      if (across > ship.radius * 0.6 + along * PLUME_SPREAD) continue;
      const strength = throttle * (1 - along / PLUME_REACH);
      if (strength > hottest) {
        hottest = strength;
        burner = other;
      }
    }
    if (burner) this.burn(ship, hottest, PLUME_HEAT, PLUME_BURN, msg('In the drive plume of {name} · get out'), burner, 'plume', dt, now);
  }

  /**
   * Hot plasma on the hull (a drive plume, a solar flare): `heat` and `hull` per second at full
   * `strength`, a word for the own pilot (a text marked with msg(), the killer as {name}; none
   * where an alarm says it), and the killer and cause should the ship break up.
   */
  private burn(ship: Ship, strength: number, heat: number, hull: number, message: string | null, killer: Ship | null, cause: DeathCause, dt: number, now: number) {
    if (!ship.alive) return;
    ship.heat = Math.min(MAX_HEAT, ship.heat + heat * strength * dt);
    if (ship.heat >= MAX_HEAT) ship.overheated = true;
    const status = ship.structural(hull * strength * dt, now);
    if (ship.isLocal) {
      if (message) this.hud.flashMessage(now, killer ? t(message, { name: killer.name }) : t(message), 0.2);
      if (Math.random() < dt * 6) this.linkHit(0.2 + 0.4 * strength, 0.15);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, killer, cause);
  }

  /** Drive trail, thruster puffs, and venting holes in damaged hulls. */
  private exhaust(ship: Ship, dt: number) {
    const flight = ship.flight;
    if (flight.throttle > 0.3) {
      // the exhaust is laid along the nozzle's path since the last frame, without gaps
      const nozzle = ship.toWorld(scratch.set(0, 0, ship.radius * 0.9), scratch);
      if (!ship.trailing) ship.trailFrom.copy(nozzle);
      this.effects.engineTrail(ship.trailFrom, nozzle, flight.velocity, flight.throttle);
      ship.trailFrom.copy(nozzle);
      ship.trailing = true;
    } else {
      ship.trailing = false;
    }
    const rcs = flight.rcs;
    if (rcs.lengthSq() > 0.01 && Math.random() < dt * 30) {
      // the exhaust leaves on the side opposite to the push
      const nozzle = ship.toWorld(scratch.copy(rcs).normalize().multiplyScalar(-ship.radius * 0.7), scratch);
      relative.copy(rcs).normalize().applyQuaternion(flight.orientation).multiplyScalar(-600).add(flight.velocity);
      this.effects.puff(nozzle, relative, ship.radius * 0.12);
    }
    // rotation thrusters fire in pairs on opposite levers (nose and tail for pitch and yaw,
    // the wing tips for roll), when a turn speeds up and when it is stopped
    const turn = flight.turnThrust;
    for (const k of TURN_AXES) {
      const thrust = turn[k];
      if (Math.abs(thrust) < 0.2 || Math.random() > dt * 40 * Math.abs(thrust)) continue;
      const lever = TURN_LEVERS[k];
      for (const end of TURN_ENDS) {
        // a push F = axis × lever at the lever turns the ship about the axis; the gas leaves against F
        scratch.copy(lever).multiplyScalar(end * ship.radius);
        relative.copy(TURN_AXIS[k]).cross(scratch).normalize().multiplyScalar(-Math.sign(thrust));
        const nozzle = ship.toWorld(scratch, scratch);
        relative.applyQuaternion(flight.orientation).multiplyScalar(500).add(flight.velocity);
        this.effects.puff(nozzle, relative, ship.radius * 0.08);
      }
    }
    for (const hole of ship.holes) {
      const strength = ship.ventStrength(hole, this.time);
      const position = ship.toWorld(hole.point, scratch);
      if (Math.random() < dt * 40 * strength) {
        relative.copy(hole.vent).applyQuaternion(flight.orientation).multiplyScalar(900 * strength).add(flight.velocity);
        this.effects.puff(position, relative, ship.radius * 0.15 * (0.5 + strength));
      }
      if (Math.random() < dt * 1.5) this.effects.sparks(position, VENT_COLOR, 12);
    }
  }

  /**
   * Hitscan laser along the nose. The beam punches through every ship in its path and
   * stops at the first asteroid, which takes one hit.
   */
  private fireLaser(shooter: Ship) {
    // shooting ends the own spawn protection: nobody fires from behind it
    shooter.protectedUntil = Math.min(shooter.protectedUntil, this.time);
    // with a nova core, the next shot is the nova
    if (shooter.nova) {
      shooter.nova = false;
      const position = shooter.flight.position.clone();
      this.online?.sendNova(shooter, position);
      this.novaBlast(shooter, position);
      return;
    }
    const origin = shooter.nose(muzzle);
    const direction = shooter.flight.forward(forward);
    let asteroidHit = this.field.raycast(origin, direction, LASER_RANGE);
    let wreckHit = this.wrecks.raycast(origin, direction, asteroidHit?.distance ?? LASER_RANGE);
    if (wreckHit) asteroidHit = null;
    let beamLength = wreckHit?.distance ?? asteroidHit?.distance ?? LASER_RANGE;
    // a torpedo in the way takes the beam and goes off
    const torpedoHit = this.torpedoes.raycast(origin, direction, beamLength, shooter, this.time);
    if (torpedoHit) {
      asteroidHit = wreckHit = null;
      beamLength = torpedoHit.distance;
    }
    // the President's battleship stops it: on its armor, or on a part it breaks
    const fleetHit = torpedoHit ? null : (this.fleet?.raycast(origin, direction, beamLength, this.field.clock) ?? null);
    if (fleetHit) {
      asteroidHit = wreckHit = null;
      beamLength = fleetHit.distance;
    }

    const end = new THREE.Vector3().copy(origin).addScaledVector(direction, beamLength);
    const start = shooter.muzzle(new THREE.Vector3());
    this.effects.beam(start, end, shooter.color);
    this.killcam.recordBeam(this.time, start, end, shooter.color);
    this.online?.sendFire(shooter, start, end);
    if (shooter.isLocal) this.sound.play('laser', { volume: 0.7 });
    // after the beam: the other browsers take a torpedo shot down only with the beam that did it
    if (torpedoHit) this.shootDown(torpedoHit.torpedo, shooter);

    for (const ship of [...this.ships]) {
      // a beam passes through the own side's ships
      if (ship === shooter || !ship.alive || ship.allyOf(shooter)) continue;
      const distance = raySphere(origin, direction, ship.flight.position, ship.radius);
      if (distance === null || distance > beamLength) continue;
      if (ship.owner !== null) {
        // another peer simulates this ship and applies the damage
        if (this.time < ship.protectedUntil) continue;
        this.online?.sendHit(ship, origin, direction, shooter);
        this.effects.sparks(scratch.copy(origin).addScaledVector(direction, distance), shooter.color, 60);
        if (shooter.isLocal) {
          this.hud.hit();
          this.sound.beep(1320);
          this.landed(scratch, t(ship.tailToward(direction) ? HIT_WORDS.drive : HIT_WORDS.armor), ship.tailToward(direction));
        }
        continue;
      }
      this.applyLaserHit(ship, origin, direction, shooter, distance);
    }

    if (wreckHit) {
      this.effects.sparks(end, shooter.color, 40);
      this.online?.sendWreck(wreckHit.wreck.id);
      this.shatterWreck(wreckHit.wreck);
    }
    if (fleetHit) {
      if (fleetHit.zone >= 0) this.hitFleet(this.fleet!, fleetHit.zone, shooter, end);
      else this.effects.sparks(end, shooter.color, 30);
    }

    // a beam into the well's body (a planet's clouds, a black hole) is simply gone
    const asteroid = asteroidHit?.asteroid;
    if (asteroid) {
      normal.subVectors(end, asteroid.object.position).normalize();
      this.effects.sparks(end, shooter.color, 40);
      this.effects.debris(end, normal, 120);
      // the hull of a wreck only scorches
      if (asteroid.solid) return;
      const destroyed = this.field.hit(asteroid.id);
      if (this.online && !destroyed) this.lastRockHit.set(asteroid.id, { at: this.field.clock, ship: shooter });
      this.online?.sendRock(asteroid.id, this.field.clock, this.roundId >= 0 ? this.roundId : (this.rejoinedFrom ?? 0), shooter);
      if (destroyed) {
        const points = ASTEROID_POINTS[destroyed.generation];
        shooter.score += points;
        // online, another Host may have broken the same rock a moment earlier (see remoteRock)
        if (this.online) this.keepBroken(destroyed, this.field.clock, shooter);
        this.burstRock(destroyed);
        if (shooter.isLocal) {
          this.hud.hit();
          this.hud.popup(this.camera, destroyed.object.position, `+${points}`, 'points');
          this.kick = Math.min(2, this.kick + 0.6);
          this.hud.flashMessage(this.time, t('Asteroid cracked +{points}', { points }), 1.5);
          this.speaker.say(COMPUTER.asteroid);
        }
      }
    }
  }

  /** Feedback for a hit the own laser landed: a word where it struck, and a jolt for one that hurt. */
  private landed(point: THREE.Vector3, word: string, hurt = true) {
    this.hud.popup(this.camera, point, word, hurt ? 'hit' : 'armor');
    if (hurt) this.kick = Math.min(2, this.kick + 0.5);
  }

  /**
   * A laser beam went through a ship this browser simulates: damage, feedback, destruction.
   * Also called for beams from other peers.
   */
  applyLaserHit(ship: Ship, origin: THREE.Vector3, direction: THREE.Vector3, shooter: Ship | null, distance?: number, cause: DeathCause = null) {
    if (shooter && ship.allyOf(shooter)) return;
    // plating (an item) takes a hit into the drive
    // where the beam meets the ship
    const along = distance ?? scratch.subVectors(ship.flight.position, origin).dot(direction);
    if (ship.plating > 0 && ship.tailToward(direction) && ship.alive && this.time >= ship.protectedUntil) {
      ship.plating--;
      this.effects.sparks(scratch.copy(origin).addScaledVector(direction, along), PLATING_COLOR, 80);
      if (ship.isLocal) this.hud.flashMessage(this.time, ship.plating ? t('Plating holds') : t('Plating gone'), 1.2);
      return;
    }
    const { status, zone } = ship.laserHit(origin, direction, this.time);
    if (status === 'protected') return;
    // a hit into the drive hurts; the armor only scorches
    const serious = zone === 'drive' || zone === 'reactor';
    // a bot hit in the drive turns to the shooter, from however far it fired
    if (shooter && serious) this.bots.find((bot) => bot.ship === ship)?.struck(shooter, this.time);
    this.effects.sparks(scratch.copy(origin).addScaledVector(direction, along), shooter?.color ?? SCRAPE_COLOR, 60);
    if (shooter?.isLocal) {
      this.hud.hit();
      // the drive rings out, the armor only clinks
      this.sound.beep(zone === 'reactor' ? 1760 : serious ? 1320 : 660, serious ? 0.08 : 0.04);
      this.landed(scratch, t(HIT_WORDS[zone]), serious);
    }
    if (ship.isLocal) {
      // a hit into the drive is told at once; the armor's scorch marks are chatter
      this.hud.damaged();
      this.hud.flashMessage(this.time, t(ZONE_MESSAGES[zone]), 1.5);
      this.speaker.say(COMPUTER[zone], serious ? 'urgent' : 'chatter');
      this.sound.play('explosion', { volume: serious ? 1.2 : 0.6, rate: 1.5 });
      this.sound.beep(220, 0.25, 0.12);
      this.linkHit(zone === 'reactor' ? 1 : serious ? 0.7 : 0.3, serious ? 0.5 : 0.2);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, shooter, cause, cause ?? 'laser');
  }

  /**
   * `cause` says what killed a ship without a killer, where this browser saw it happen; `what`
   * and `impact` (units/s) say it more closely for the development log (a laser, a torpedo; the
   * rock, a battleship's hull or a gate struck, and how fast).
   */
  private shipDestroyed(victim: Ship, killer: Ship | null, cause: DeathCause = null, what?: string, impact = 0, note?: string) {
    // a crash soon after a shove is the shover's knockout; the victim's browser decides it
    const shover = victim.shovedBy;
    if (!killer && shover && victim.owner === null && KNOCKOUTS.has(cause) && this.time - victim.shovedAt <= KNOCKOUT_SECONDS) {
      killer = shover;
      what ??= cause ?? undefined;
      cause = 'knockout';
    }
    devlog?.death({
      t: Math.round(this.time * 10) / 10,
      ship: victim.name,
      skill: this.skillOf(victim),
      cause: cause === 'knockout' || cause === 'ram' || !what ? (cause ?? 'unknown') : what,
      into: cause === 'knockout' ? (what ?? null) : null,
      killer: killer?.name ?? null,
      range: killer ? Math.round(killer.flight.position.distanceTo(victim.flight.position) * METERS_PER_UNIT) : null,
      position: [Math.round(victim.flight.position.x * METERS_PER_UNIT), Math.round(victim.flight.position.y * METERS_PER_UNIT), Math.round(victim.flight.position.z * METERS_PER_UNIT)],
      speed: Math.round(victim.flight.velocity.length() * METERS_PER_UNIT),
      impact: Math.round(impact * METERS_PER_UNIT),
      note: note ?? null,
    });
    const fleetDeath = cause && FLEET_DEATHS[cause];
    const cometDeath = cause && COMET_DEATHS[cause];
    victim.respawnAt = this.time + RESPAWN_SECONDS;
    if (victim.engineLight) victim.engineLight.intensity = 0;
    if (victim === this.me && killer && killer !== victim) {
      this.ease = Math.min(1, this.ease + DEATH_EASE);
      // the moments before the kill, again, in slow motion, from behind the shooter
      if (!this.school && this.state === 'playing') {
        this.killcam.start(killer, victim, this.time);
        this.hud.flashMessage(this.time, t('Kill cam · {name} · Enter skips', { name: killer.name }), 3);
      }
    }
    if (killer === this.me && victim !== this.me) this.ease = Math.max(0, this.ease - KILL_EASE);
    if (victim === this.me) {
      if (killer) {
        // the killer's name with its mark goes where the translation puts {name}
        const line = cause === 'nova' ? t('Vaporized by the nova of {name}') : cause === 'plume' ? t('Grilled in the drive plume of {name}') : cause === 'ram' ? t('Rammed by {name}') : cause === 'knockout' ? t('Knocked out by {name}') : t('Shot down by {name}');
        const [before, after = ''] = line.split('{name}');
        this.deathCause = [before, ...markedName(killer.kind, killer.name), after];
      } else if (cause === 'well') this.deathCause = t(WELL_DEATHS[this.venue.id] ?? msg('Crashed'));
      else if (cause === 'flare') this.deathCause = t('Burned up in the solar flare');
      else if (fleetDeath || cometDeath) this.deathCause = t((fleetDeath || cometDeath)!);
      else this.deathCause = victim.outsideSince !== null ? t('Lost in deep space') : t('Crashed');
    }
    // a kill of the Host's own is bigger: more fire, a jolt, and the points where it happened
    // a kill of the own side (a plume, a ram) scores nothing, nor does one after the round's end
    const scored = !!killer && killer !== victim && !killer.allyOf(victim) && !this.roundOver;
    const ownKill = scored && killer?.isLocal === true && killer === this.me;
    const credit = cause === 'nova' ? NOVA_KILL_CREDIT : 1;
    this.effects.explosion(victim.flight.position, victim.radius * (ownKill ? 3 : 2), victim.flight.velocity.clone().multiplyScalar(0.3));
    if (ownKill) {
      this.hud.popup(this.camera, victim.flight.position, credit > 1 ? t('Double kill +{points}', { points: this.killPoints() * credit }) : `+${this.killPoints()}`, 'kill');
      this.kick = 2;
    }
    this.wrecks.spawn(victim.id, victim.deaths, victim.flight.position, victim.flight.velocity, victim.radius, this.time);
    // what the clone held flies out again, as probes for whoever gets there first
    const held: ItemKind[] = [];
    if (victim.twin) held.push('twin');
    if (victim.plating > 0) held.push('plating');
    if (victim.nova) held.push('nova');
    if (held.length && !this.school) this.probes.drop(victim.id, victim.deaths, held, victim.flight.position, victim.flight.velocity, this.time);
    victim.twin = false;
    victim.plating = 0;
    victim.nova = false;
    if (victim.isLocal) {
      this.sound.play('explosion', { volume: 1.6, rate: 0.6 });
      // the clone dies: its link breaks down in a burst, its last picture rots, its radio fades out
      this.glitch.trigger(0.7, 0.5);
      this.datamosh.trigger();
      this.radio.setMuffled(true);
    } else {
      this.hearDebris(victim.flight.position, victim.radius);
    }
    // online, the owner of the victim announces the destruction; each peer scores its own ships
    if (victim.owner === null) this.online?.sendDestroyed(victim, killer, cause === 'nova');
    // a nova's second kill comes out of the victim's pocket: whoever lets novas catch it again
    // and again goes below zero (each browser scores the victims it runs)
    if (scored && cause === 'nova' && victim.owner === null) {
      victim.kills--;
      victim.score -= this.killPoints();
    }
    if (scored && killer && killer.owner === null) {
      killer.kills += credit;
      killer.score += this.killPoints() * credit;
      if (killer.isLocal) {
        this.sound.beep(1320, 0.07, 0.15);
        this.sound.beep(1760, 0.12, 0.15, 0.09);
      }
    }
    if (victim === this.me) this.moments.died(killer && killer !== victim ? killer.id : null);
    if (ownKill) {
      const moment = this.moments.ownKill(victim.id, this.time, cause === 'nova') ?? (cause === 'knockout' ? 'knockout' : null);
      if (moment) this.moment(moment);
    }
    // remote ships do not report how they crashed: "Crash" covers rocks and wreckage alike
    const killedBy =
      cause === 'well' ? t(this.venue.name) : cause === 'flare' ? t('Solar flare') : fleetDeath ? t('Battleship') : cometDeath ? t('Comet') : victim.outsideSince !== null ? t('Deep space') : t('Crash');
    this.hud.kill(this.time, killer ?? { kind: null, name: killedBy }, victim);
    // the last clone of a ship in Last Clone Standing: out, and everyone hears it
    if (this.out(victim)) {
      this.outAt.set(victim, this.time);
      this.announce(pick(ANNOUNCER_OUT), victim, true);
      if (victim === this.me) this.speaker.say(COMPUTER.out, 'urgent');
    } else if (victim !== this.drone) this.commentOnDeath(victim, killer, cause);
  }

  /** Where a ship struck the gate it touched last, for the log: the gate, how far off its axis and its plane (m), and the angle of its flight to the axis (°). */
  private gateNote(ship: Ship): string {
    const course = this.course;
    if (!course || this.gateStruck < 0) return '';
    const i = this.gateStruck;
    const offset = scratch.subVectors(ship.flight.position, course.points[i]);
    const along = offset.dot(course.normals[i]);
    const out = Math.sqrt(Math.max(0, offset.lengthSq() - along * along));
    const angle = THREE.MathUtils.radToDeg(ship.flight.velocity.angleTo(course.normals[i]));
    return `gate ${i} out ${Math.round(out * METERS_PER_UNIT)} m along ${Math.round(along * METERS_PER_UNIT)} m at ${Math.round(angle)}° next ${ship.gates % course.points.length}`;
  }

  /** The skill of a bot (see meanSkill), null for a Host's ship. */
  private skillOf(ship: Ship): number | null {
    const bot = this.bots.find((b) => b.ship === ship);
    return bot ? meanSkill(bot.skills) : null;
  }

  /** In vacuum an explosion is only heard when its debris rattles against the own hull. */
  private hearDebris(position: THREE.Vector3, size: number) {
    const me = this.me;
    if (!me?.alive) return;
    const distance = Math.max(0, position.distanceTo(me.flight.position) - size);
    if (distance > DEBRIS_HEARING) return;
    this.sound.play('explosion', { volume: 0.8 * (1 - distance / DEBRIS_HEARING), rate: 1.7 });
  }

  /** Ship vs asteroid: the ship bounces off; fast impacts wreck the hull. */
  private collide(ship: Ship, now: number) {
    const flight = ship.flight;
    // the clouds of a gas giant burn a ship up, a black hole swallows it; no protection holds
    if (this.field.insideWell(flight.position, ship.radius)) {
      ship.protectedUntil = Math.min(ship.protectedUntil, now);
      if (ship.structural(Infinity, now) === 'destroyed') this.shipDestroyed(ship, null, 'well');
      return;
    }
    // a ship that moved farther than its radius this frame may have passed through a thin
    // rock: the path is checked, and the ship stops where it first touched
    const moved = flight.position.distanceTo(ship.previous);
    if (moved > ship.radius) {
      sweep.subVectors(flight.position, ship.previous).divideScalar(moved);
      const hit = this.field.raycast(ship.previous, sweep, moved);
      if (hit) flight.position.copy(ship.previous).addScaledVector(sweep, Math.max(0, hit.distance - 1));
    }
    const asteroid = this.field.overlap(flight.position, ship.radius);
    if (asteroid && this.field.resolve(asteroid, flight.position, ship.radius, normal)) {
      // the rock's surface moves with its drift and its spin; the tip of a long rock sweeps fast
      this.field.surfaceVelocity(asteroid, scratch.copy(flight.position).addScaledVector(normal, -ship.radius), surface);
      this.bounce(ship, surface, now, 'rock');
    } else if (this.fleet?.resolve(flight.position, ship.radius, this.field.clock, normal)) this.bounce(ship, this.fleet.velocity, now, 'hull');
    else if (this.touchesRing(flight.position, ship.radius)) this.bounce(ship, STILL, now, 'gate');
  }

  /**
   * Whether a ship touches the housings of a ring (see touchRing): a race's gates, the bases of
   * Capture the Flag, the flight school's rings still standing. Flying through is the point;
   * flying into the coil is a crash. Moves the ship out and sets `normal` when it does.
   */
  private touchesRing(position: THREE.Vector3, radius: number): boolean {
    this.gateStruck = -1;
    const course = this.course;
    if (course) {
      for (let i = 0; i < course.points.length; i++) {
        if (!touchRing(course.points[i], course.normals[i], GATE_RADIUS, position, radius, normal)) continue;
        this.gateStruck = i;
        return true;
      }
    }
    const flags = this.flags;
    if (flags) {
      for (const base of flags.bases) if (touchRing(base, ringFacing.copy(base).normalize(), BASE_RADIUS, position, radius, normal)) return true;
    }
    return !!this.school?.touchesRing(position, radius, normal);
  }

  /** A ship touched a surface (`what`: a rock, a battleship's hull, a gate) moving at `moving`, with the outward `normal` of this frame: it bounces off, scrapes, and an impact hurts. */
  private bounce(ship: Ship, moving: THREE.Vector3, now: number, what: 'rock' | 'hull' | 'gate') {
    const approach = bounceOff(ship.flight.velocity, moving, normal);
    if (approach <= 0) return;
    if (ship === this.me) this.lastScrape = now;
    ship.syncTransform();

    if (approach < SAFE_IMPACT * 0.4) return;
    this.effects.sparks(scratch.copy(ship.flight.position).addScaledVector(normal, -ship.radius), SCRAPE_COLOR, 40 + approach * 0.05);
    if (ship.isLocal) this.sound.play('explosion', { volume: Math.min(1.4, approach / 800), rate: 1.9 });
    if (approach < SAFE_IMPACT) return;
    const status = ship.structural(impactDamage(approach), now);
    if (ship.isLocal && status !== 'protected') {
      this.hud.damaged();
      this.hud.flashMessage(now, t('Impact at {speed} m/s', { speed: Math.round(approach * METERS_PER_UNIT) }), 1.5);
      this.speaker.say(COMPUTER.impact, 'urgent');
      this.linkHit(Math.min(1, 0.4 + (approach - SAFE_IMPACT) / 1000), 0.6);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, null, 'rock', what, approach, devlog && what === 'gate' ? this.gateNote(ship) : undefined);
  }

  /**
   * Ship vs ship: no hull passes through another. Two ships in contact (their hit spheres
   * overlapping) are pushed apart and bounce off each other as two bodies of equal mass; a
   * bump slower than RAM_SAFE only clunks, a faster one is a ram, and each ship takes damage
   * where it was struck (see Ship.rammed): the armored nose little, the drive from behind a
   * lot. Each browser decides for the ships it runs, from the closing speed both see alike, so
   * neither ship is hurt twice; a ship a ram destroys counts as killed by the other.
   */
  private collideShips(now: number) {
    const ships = this.ships;
    for (let i = 0; i < ships.length; i++) {
      const a = ships[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < ships.length; j++) {
        const b = ships[j];
        if (!b.alive || (a.owner !== null && b.owner !== null)) continue;
        ramApart.subVectors(b.flight.position, a.flight.position);
        const distance = ramApart.length();
        const reach = a.radius + b.radius;
        if (distance >= reach) continue;
        if (distance > 1e-6) ramApart.divideScalar(distance);
        else ramApart.set(0, 1, 0);
        const ownA = a.owner === null;
        const ownB = b.owner === null;
        // out of each other, each owner its own half
        const overlap = (reach - distance) / 2;
        if (ownA) a.flight.position.addScaledVector(ramApart, -overlap);
        if (ownB) b.flight.position.addScaledVector(ramApart, overlap);
        const closing = ram(a.flight.velocity, b.flight.velocity, ramApart, ownA, ownB);
        if (closing <= 0) continue;
        if (ownA) a.syncTransform();
        if (ownB) b.syncTransform();
        ramPoint.copy(a.flight.position).addScaledVector(ramApart, a.radius);
        if (a.isLocal || b.isLocal) this.sound.play('explosion', { volume: Math.min(1.4, closing / 800), rate: closing < RAM_SAFE ? 2.4 : 1.6 });
        const hullA = a.hull;
        const hullB = b.hull;
        if (closing >= SHOVE_SPEED) {
          if (closing >= RAM_SAFE) this.effects.sparks(ramPoint, SCRAPE_COLOR, 60 + closing * 0.08);
          // each struck from the other's side: b along the way from a, a along the way back
          if (ownB) this.shoved(b, a, ramApart, closing, now);
          if (ownA) this.shoved(a, b, ramApart.negate(), closing, now);
        }
        const outcome = closing < SHOVE_SPEED ? 'bump' : closing < RAM_SAFE ? 'shove' : 'ram';
        devlog?.add({ kind: 'contact', t: now, a: a.name, b: b.name, closing: closing * METERS_PER_UNIT, impulse: ramImpulse(closing) * METERS_PER_UNIT, outcome, hullA: hullA - a.hull, hullB: hullB - b.hull });
      }
    }
  }

  /**
   * A ship this browser runs was struck by `by`, shoved along `direction` at `closing` (units/s):
   * it remembers who (see KNOCKOUT_SECONDS), its hull spins away from the blow, and above
   * RAM_SAFE the blow hurts it where it landed.
   */
  private shoved(ship: Ship, by: Ship, direction: THREE.Vector3, closing: number, now: number) {
    ship.shovedBy = by;
    ship.shovedAt = now;
    devlog?.add({ kind: 'shove', t: now, by: by.name, ship: ship.name, closing: closing * METERS_PER_UNIT });
    const blow = ship.flight.toLocalDirection(direction, relative);
    const spin = Math.min(SHOVE_SPIN_MAX, closing * SHOVE_SPIN);
    // a blow from the side swings the nose and rolls the hull, one from above or below pitches it
    ship.flight.angularVelocity.x += blow.y * spin;
    ship.flight.angularVelocity.y -= blow.x * spin;
    ship.flight.angularVelocity.z += blow.x * spin * 0.5;
    if (ship.isLocal) this.kick = Math.min(2, this.kick + closing / 600);
    if (closing < RAM_SAFE) return;
    const { status } = ship.rammed(direction, closing, now);
    if (ship.isLocal && status !== 'protected') {
      this.hud.damaged();
      this.hud.flashMessage(now, t('Rammed by {name} at {speed} m/s', { name: by.name, speed: Math.round(closing * METERS_PER_UNIT) }), 1.5);
      this.speaker.say(COMPUTER.impact, 'urgent');
      this.linkHit(Math.min(1, 0.4 + (closing - RAM_SAFE) / 1500), 0.6);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, by, 'ram');
  }

  /** Ship vs debris: the piece is pulverized, the hull takes damage by the impact speed. */
  private hitWreckage(ship: Ship, now: number) {
    if (!ship.alive) return;
    const wreck = this.wrecks.overlap(ship.flight.position, ship.radius * 0.8);
    if (!wreck) return;
    const impact = relative.subVectors(ship.flight.velocity, wreck.velocity).length();
    this.effects.sparks(wreck.mesh.position, SCRAPE_COLOR, 60);
    this.online?.sendWreck(wreck.id);
    this.wrecks.remove(wreck);
    const status = ship.structural(impactDamage(impact) * 0.6, now);
    if (ship.isLocal && status !== 'protected') {
      this.sound.play('explosion', { volume: Math.min(1.4, 0.3 + impact / 1000), rate: 2.1 });
      this.hud.damaged();
      this.hud.flashMessage(now, t('Debris impact'), 1.2);
      this.speaker.say(COMPUTER.debris);
      this.linkHit(0.5, 0.35);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, null, 'wreck', 'wreck', impact);
  }

  /**
   * What the own pilot feels and the flight computer reports: g-force strain with tunnel
   * vision, a heartbeat, and the alarms (see game/alarms.ts) of an impact ahead, an overheated
   * laser or drive, a nova core, a torpedo, a nose on the own ship, the field's edge, a
   * gravity well and a failing hull, besides whatever other parts of the game raised.
   */
  private pilot(dt: number, now: number) {
    const me = this.me!;
    const flight = me.flight;
    const load = me.alive ? flight.properAcceleration / G : 0;
    if (load > G_TOLERANCE) this.strain += ((load - G_TOLERANCE) / (MAIN_THRUST / G - G_TOLERANCE)) * (dt / G_ONSET);
    else this.strain -= dt / G_RECOVERY;
    this.strain = THREE.MathUtils.clamp(this.strain, 0, 1);
    this.hud.setStrain(this.strain);

    const alarms = this.alarms;
    let impact = Infinity;
    const speed = flight.velocity.length();
    if (me.alive && speed > 100) {
      const heading = scratch.copy(flight.velocity).divideScalar(speed);
      // a rock, the well's body or the battleship's hull
      const hit = this.field.raycast(flight.position, heading, speed * 20, true);
      if (hit) {
        const timeToImpact = Math.max(0, hit.distance - me.radius) / speed;
        const thrust = MAIN_THRUST * Math.max(me.drive, 0.01);
        // the head-over flip rolls first, and damaged thrusters turn the ship more slowly
        const turning = flight.angleTo(retrograde.copy(heading).negate());
        const turnRate = 0.3 + 0.7 * (0.25 + 0.75 * me.thrusters);
        const flipTime = ((turning / Math.PI) * FLIP_SECONDS + (turning > 0.35 ? FLIP_ROLL_SECONDS : 0)) / turnRate;
        const brakeTime = flipTime + speed / thrust / 2;
        if (timeToImpact < brakeTime + IMPACT_MARGIN) {
          impact = timeToImpact;
          alarms.raise({ id: 'impact', level: timeToImpact < IMPACT_CRITICAL ? 'critical' : 'warning', text: t('IMPACT'), direction: heading, seconds: timeToImpact, tone: 'impact' });
        }
      }
    }
    this.impactAhead = impact < Infinity;
    this.lockWarning();
    if (me.alive && me.overheated) {
      alarms.raise({ id: 'laser', level: 'caution', text: t('LASER OVERHEATED') });
      this.tip('hot');
    }
    this.novaAlarm(me);
    // a torpedo homing on the own ship: shoot it down or dodge
    for (const torpedo of this.torpedoes.list) {
      if (!me.alive || torpedo.target !== me) continue;
      const toward = relative.subVectors(torpedo.position, flight.position);
      const distance = toward.length();
      if (distance > TORPEDO_WARNING) continue;
      alarms.raise({ id: 'torpedo', level: distance < TORPEDO_CRITICAL ? 'critical' : 'warning', text: t('TORPEDO INBOUND'), direction: toward, tone: 'torpedo' });
      this.tip('torpedo');
      break;
    }
    if (me.alive && me.driveOffline(now)) alarms.raise({ id: 'drive', level: 'caution', text: t('DRIVE OVERHEATED') });
    this.cometAlarm(me);
    this.flareAlarm(me);
    if (me.alive && me.outsideSince !== null) {
      // the field's edge: back towards its center before the clone is lost in deep space
      const left = this.school ? null : Math.max(0, ARENA_GRACE - (now - me.outsideSince));
      alarms.raise({ id: 'field', level: left !== null && left < FIELD_CRITICAL ? 'critical' : 'warning', text: t('OUT OF FIELD'), direction: relative.copy(flight.position).negate(), seconds: left });
    }
    const well = this.wellAlarm(me);
    const hullCritical = me.alive && me.hull <= HULL_CRITICAL;
    if (hullCritical) {
      alarms.raise({ id: 'hull', level: 'warning', text: t('HULL FAILING') });
      if (!this.hullWarned) this.speaker.say(COMPUTER.hullCritical, 'urgent');
    }
    this.hullWarned = hullCritical;

    // a dead clone hears no alarms
    if (!me.alive) alarms.begin();
    alarms.finish();
    this.hud.setAlarms(alarms.list, this.camera);
    this.alarmTones.play(alarms.top, now, this.sound);
    // heartbeat: faster and louder the harder the pilot is pressed into the seat, steady and loud one hit from death or deep in a well
    const beat = Math.max(this.strain, hullCritical ? HEART_HULL : 0, well >= WELL_CRITICAL ? HEART_WELL : 0);
    if (beat > 0.4 && now >= this.nextHeartbeat) {
      this.sound.beep(55, 0.12, 0.25 * beat);
      this.sound.beep(48, 0.14, 0.2 * beat, 0.16);
      this.nextHeartbeat = now + 1.1 - 0.5 * beat;
    }
    if (alarms.top?.level === 'critical') {
      // the link frays in a panic: short and seldom, never long enough to hide a warning
      if (Math.random() < dt * CRITICAL_GLITCHES) this.glitch.trigger(0.2 + Math.random() * 0.2, 0.06 + Math.random() * 0.1);
      // death is a breath away: the music drops out, only the heart and the alarm remain
      if ((impact < SILENCE_BEFORE || well >= WELL_LOST) && now >= this.silenceReadyAt) {
        this.radio.dropout(SILENCE_SECONDS);
        this.silenceReadyAt = now + SILENCE_COOLDOWN;
      }
    }
    alarms.begin();
  }

  /**
   * A gravity well's hold on the own ship (see escapeLoad): the escape gauge, its alarm towards
   * the well, and Nicole, once for each level it reaches until the pull lets go again: the well
   * is near, it is pulling, full burn now, and past the point of no return a quiet goodbye.
   * Returns the load (0 without a well).
   */
  private wellAlarm(me: Ship): number {
    const well = this.field.well;
    if (!me.alive || !well) {
      this.hud.setEscape(null);
      return 0;
    }
    const load = escapeLoad(well, me.flight.position, me.flight.velocity, MAIN_THRUST * Math.max(me.drive, 0.01));
    this.hud.setEscape(load);
    // the warnings come again once the well has let go of the ship for good
    if (load < WELL_RELEASE) this.wellSaid = 0;
    const level = wellLevel(load);
    if (!level) return load;
    const hole = this.venue.id === 'hole';
    const lost = load >= WELL_LOST;
    this.alarms.raise({ id: 'well', level, text: lost ? t('NO RETURN') : hole ? t('BLACK HOLE · BURN AWAY') : t('GRAVITY WELL · BURN AWAY'), direction: relative.subVectors(well.position, me.flight.position) });
    const said = lost ? ALARM_RANK.critical + 1 : ALARM_RANK[level];
    if (said > this.wellSaid) {
      this.wellSaid = said;
      const line = lost ? COMPUTER.wellLost : level === 'critical' ? COMPUTER.wellTight : level === 'warning' ? (hole ? COMPUTER.holePull : COMPUTER.giantPull) : hole ? COMPUTER.holeNear : COMPUTER.giantNear;
      this.speaker.say(line, 'urgent');
    }
    return load;
  }

  /**
   * The comet of the round (see comet.ts): its route, the warning before it comes, its shower
   * shown at the field time and its head running down the rock in its way. The flight school
   * sees only the comet its drill sends.
   */
  private playComet() {
    const clock = this.field.clock;
    let comet = this.drillComet;
    if (!this.school && this.roundId >= 0) {
      const seed = this.online ? textSeed(this.online.session.room) : this.soloSeed;
      const key = `${seed}.${this.roundId}.${this.venue.id}`;
      if (key !== this.cometsOfKey) {
        this.cometsOfKey = key;
        this.comets = cometsOf(seed, this.roundId, this.field.well);
      }
      for (const next of this.comets) if (clock >= cometStart(next) - COMET_WARNING && clock <= cometEnd(next)) comet = next;
    }
    // the warning, once, as the head nears the arena's edge
    if (comet && comet !== this.cometCalled && clock >= comet.edge - COMET_WARNING && clock < comet.at) {
      this.cometCalled = comet;
      this.speaker.say(COMPUTER.comet, 'urgent');
      if (!this.school) this.radio.announce(pick(ANNOUNCER_COMET), null);
      this.hud.flashMessage(this.time, t('Comet inbound · take cover behind a rock, or turn your nose into its shower'), 5);
      this.sound.beep(980, 0.3, 0.2);
    }
    const flying = comet && clock >= cometStart(comet) && clock <= cometEnd(comet) ? comet : null;
    if (this.shower?.comet !== flying) {
      this.shower = flying ? new Shower(flying) : null;
      this.struck.clear();
    }
    this.cometView.update(this.shower, clock);
    if (!flying) return;
    runDown(flying, this.field, clock, (rock) => this.burstRock(rock), (piece, point) => this.cometShove(piece, point));
    // the battleship that did not get out of its way goes down: the lead browser decides
    const fleet = this.fleet;
    if (fleet?.present(clock) && (!this.online || this.online.isLead) && clock < flying.swallowed && fleet.touches(headAt(flying, clock, cometHead), HEAD_RADIUS)) {
      this.hud.flashMessage(this.time, t('The comet rams the battleship'), 3);
      this.fleetEvents(fleet.sink(), null);
    }
  }

  /** The comet's head strikes a piece of the wreck's hull and shoves it: a flash, sparks and debris where it struck, heard as far as debris is. */
  private cometShove(piece: Asteroid, point: THREE.Vector3) {
    this.effects.explosion(point, HEAD_RADIUS * 1.5, piece.velocity);
    this.effects.sparks(point, SCRAPE_COLOR, HEAD_RADIUS);
    this.effects.debris(point, normal.subVectors(point, piece.object.position).normalize(), HEAD_RADIUS);
    this.hearDebris(point, HEAD_RADIUS * 2);
    this.witnessBlast(point, HEAD_RADIUS * 20, 0.6);
  }

  /**
   * The comet meets a ship this browser runs: its head runs it down, whatever protects it, and
   * each piece of its shower that comes within reach strikes it once, as a laser would, from
   * where it comes; rock just upstream of the ship takes the piece instead.
   */
  private cometStrike(ship: Ship, now: number) {
    const shower = this.shower;
    if (!shower || !ship.alive) return;
    const comet = shower.comet;
    const clock = this.field.clock;
    const position = ship.flight.position;
    if (clock < comet.swallowed && position.distanceTo(headAt(comet, clock, cometHead)) < HEAD_RADIUS + ship.radius) {
      ship.protectedUntil = Math.min(ship.protectedUntil, now);
      if (ship.structural(Infinity, now) === 'destroyed') this.shipDestroyed(ship, null, 'comet');
      return;
    }
    // beside the swarm, ahead of it or behind it: nothing to strike
    const when = routeNearest(comet, position, clock - SHOWER_LENGTH / COMET_SPEED, clock, cometOffset);
    if (cometOffset.distanceTo(position) > SHOWER_WIDE + PIECE_RADIUS + ship.radius) return;
    let struck = this.struck.get(ship);
    if (!struck) this.struck.set(ship, (struck = new Uint8Array(SHOWER_PIECES)));
    // the pieces come along the route, as fast as the head flew there
    courseAt(comet, when, cometCourse);
    cometVelocity.subVectors(headAt(comet, when + 0.5, cometPiece), headAt(comet, when - 0.5, cometCover));
    const near = (ship.radius + PIECE_RADIUS) ** 2;
    for (let i = 0; i < SHOWER_PIECES; i++) {
      if (struck[i] || shower.gone(i, clock) || shower.pieceAt(i, clock, cometPiece).distanceToSquared(position) > near) continue;
      struck[i] = 1;
      if (!this.field.lineOfSight(cometCover.copy(position).addScaledVector(cometCourse, -SHOWER_COVER), position)) continue;
      cometRelative.subVectors(cometVelocity, ship.flight.velocity).normalize();
      this.applyLaserHit(ship, cometPiece, cometRelative, null, undefined, 'shower');
      if (!ship.alive) return;
    }
  }

  /** For a bot close to a comet's route as its head nears or its shower passes: the point of the route nearest it, to fly away from; else null. */
  private cometDanger(ship: Ship): THREE.Vector3 | null {
    const comet = this.shower?.comet ?? null;
    if (!comet) return null;
    const clock = this.field.clock;
    routeNearest(comet, ship.flight.position, clock - (SHOWER_LENGTH + COMET_DANGER) / COMET_SPEED, clock + COMET_WARNING, cometAway);
    return cometAway.distanceTo(ship.flight.position) > SHOWER_WIDE + COMET_DANGER ? null : cometAway;
  }

  /** The comet as an alarm towards its head: WARNING from the flight computer's call until the head passes, counting down to the arena's edge; CRITICAL while the own pilot is in its way. */
  private cometAlarm(me: Ship) {
    const comet = this.cometCalled;
    const clock = this.field.clock;
    if (!comet || !me.alive || clock > cometEnd(comet)) return;
    const direction = relative.subVectors(headAt(comet, Math.min(clock, comet.swallowed), cometHead), me.flight.position);
    if (this.shower?.comet === comet && this.cometDanger(me)) this.alarms.raise({ id: 'comet', level: 'critical', text: t('COMET SHOWER · NOSE INTO IT OR TAKE COVER'), direction });
    else if (clock < comet.at) this.alarms.raise({ id: 'comet', level: 'warning', text: t('COMET INBOUND'), direction, seconds: clock < comet.edge ? comet.edge - clock : null });
  }

  /**
   * A solar flare as an alarm pointing away from the sun: WARNING while its front is within
   * FLARE_WARNING of the own clone, counting down to when it arrives; CRITICAL in its plasma,
   * saying so when a rock shades the clone.
   */
  private flareAlarm(me: Ship) {
    if (!this.survival || !me.alive) return;
    const clock = this.field.clock;
    const clearance = flareClearance(me.flight.position, clock);
    if (clearance > FLARE_WARNING) return;
    const away = relative.copy(SUN_DIRECTION).negate();
    if (clearance < 0) {
      this.alarms.raise({ id: 'flare', level: 'critical', text: me.inShadow ? t('SOLAR FLARE · SHADED · AWAY FROM THE SUN') : t('SOLAR FLARE · AWAY FROM THE SUN'), direction: away });
      return;
    }
    // how fast the front comes on (units/s): nothing once it holds
    const closing = flareFront(clock) - flareFront(clock + 1);
    this.alarms.raise({ id: 'flare', level: 'warning', text: t('FLARE FRONT · {distance}', { distance: meters(clearance) }), direction: away, seconds: closing > 0 ? clearance / closing : null });
  }

  /** A tip of the fight from Nicole, while it is still due (see Coach); the flight school teaches on its own. */
  private tip(tip: Tip) {
    if (!this.school) this.coach.give(tip, (line) => this.speaker.say(line, 'urgent'));
  }

  /**
   * Another ship's nose on the own ship: LOCKED when its laser would hit now, TRACKED when
   * the nose is close to it, ON YOUR TAIL when it sits behind, where it reaches the drive. The
   * ship's sensors see where every other hull points; the faster beeping is the cue to act.
   * Its line, with the shooter's mark, sits below the alarm list; its alarm (TRACKED a CAUTION,
   * LOCKED and ON YOUR TAIL a WARNING) counts for the master caution and the beep.
   */
  private lockWarning() {
    const me = this.me!;
    // a solar storm blinds the sensors that would see a nose on the own ship
    if (!me.alive || this.storming) {
      this.hud.setLock('', null);
      return;
    }
    let level = 0;
    let shooter: Ship | null = null;
    for (const ship of this.ships) {
      // the target drone and the unarmed sparring bot never shoot
      if (ship === me || !ship.alive || ship === this.drone || (ship === this.sparring?.bot.ship && !this.sparring.armed)) continue;
      const line = relative.subVectors(me.flight.position, ship.flight.position);
      const distance = line.length();
      if (distance > LOCK_RANGE) continue;
      const angle = ship.flight.angleTo(line);
      const size = me.radius / Math.max(distance, 1);
      const sighted = angle < size ? 2 : angle < size * LOCK_TRACKING ? 1 : 0;
      if (sighted > level && this.field.lineOfSight(ship.flight.position, me.flight.position)) {
        level = sighted;
        shooter = ship;
      }
    }
    if (!shooter) {
      this.hud.setLock('', null);
      return;
    }
    // from behind the shooter reaches the drive, the one place that hurts: turn to face it
    const tail = me.tailToward(relative.subVectors(me.flight.position, shooter.flight.position));
    this.hud.setLock(tail ? t('ON YOUR TAIL') : level === 2 ? t('LOCKED') : t('TRACKED'), shooter);
    if (tail) this.tip('tail');
    this.alarms.raise({ id: 'lock', level: tail || level === 2 ? 'warning' : 'caution', text: '', direction: relative.negate(), tone: tail ? 'tail' : level === 2 ? 'locked' : 'tracked' });
  }

  /**
   * The crosshair shows where the nose points, at the depth that matters: a flight school
   * marker's distance, or what the laser would hit. The chase camera sits above and behind
   * the ship and trails its turns, so the plain screen center would be off by degrees up close.
   */
  private aimCrosshair(waypoint: THREE.Vector3 | null) {
    const me = this.me!;
    const flight = me.flight;
    const direction = flight.forward(forward);
    let depth = waypoint ? waypoint.distanceTo(flight.position) : (this.field.raycast(flight.position, direction, AIM_DEPTH)?.distance ?? AIM_DEPTH);
    if (!waypoint) {
      depth = this.wrecks.raycast(flight.position, direction, depth)?.distance ?? depth;
      for (const ship of this.ships) {
        if (ship === me || !ship.alive) continue;
        const distance = raySphere(flight.position, direction, ship.flight.position, ship.radius);
        if (distance !== null && distance < depth) depth = distance;
      }
    }
    this.hud.setCrosshair(this.camera, aimPoint.copy(flight.position).addScaledVector(direction, depth));
  }

  /** Space has no walls: ships that stay outside the arena for too long are lost. */
  private keepInArena(ship: Ship, now: number) {
    if (!ship.alive) return;
    if (ship.flight.position.length() < ARENA_LIMIT) {
      ship.outsideSince = null;
      return;
    }
    ship.outsideSince ??= now;
    // the belt beyond is scenery: a ship that reaches it before its time is up is lost there;
    // the flight school gives its pilot all the time it takes to find back
    if ((this.school || now - ship.outsideSince < ARENA_GRACE) && ship.flight.position.length() < BELT_INNER) return;
    ship.structural(Infinity, now);
    if (!ship.alive) this.shipDestroyed(ship, null, 'space');
  }

  private updateCamera(dt: number) {
    // the chase camera follows the own ship, or the pilot a watching Host follows
    const me = this.subject();
    const flight = me.flight;
    if (this.introOpen && !this.introSkipped && me === this.me && me.alive) {
      this.introCamera(me);
    } else if (this.cockpit) {
      this.camera.position.copy(flight.position).addScaledVector(flight.forward(scratch), me.radius * 0.3);
      this.camera.quaternion.copy(flight.orientation);
    } else if (this.watching() && this.wideShot && me !== this.me) {
      // the director's wide shot: off to the side and behind, the pilot in the frame
      flight.toWorld(cameraGoal.set(me.radius * 6, me.radius * 2.5, me.radius * 5), cameraGoal);
      this.camera.position.lerp(cameraGoal, 1 - Math.exp(-CAMERA_FOLLOW * 0.4 * dt));
      look.lookAt(this.camera.position, flight.position, flight.up(scratch));
      this.camera.quaternion.slerp(aim.setFromRotationMatrix(look), 1 - Math.exp(-CAMERA_TURN * 0.5 * dt));
    } else {
      // a burn presses the ship ahead of the camera, which hangs back a little; in cinema mode
      // it hangs farther back, follows softer and drifts slowly around the ship
      const lag = me.alive ? flight.throttle * DRIVE_LAG : 0;
      const film = this.cinema ? 1 : 0;
      const drift = this.time * CINEMA_DRIFT;
      flight.toWorld(cameraGoal.set(film * me.radius * Math.sin(drift), me.radius * (0.75 + film * (0.35 + 0.25 * Math.cos(drift * 0.7))), me.radius * (2.6 + film * CINEMA_DISTANCE + lag)), cameraGoal);
      const soft = this.cinema ? CINEMA_SOFTNESS : 1;
      this.camera.position.lerp(cameraGoal, 1 - Math.exp(-CAMERA_FOLLOW * soft * dt));
      this.camera.quaternion.slerp(flight.orientation, 1 - Math.exp(-CAMERA_TURN * soft * dt));
    }
    this.riding = me.alive ? flight.velocity : null;
    // the drive kicks: the view widens while it burns and with speed, and the chase camera trembles
    const burn = me.alive ? flight.throttle : 0;
    const fast = me.alive ? Math.min(1, flight.velocity.length() / MAX_SPEED) : 0;
    const fov = this.camera.fov + (CAMERA_FOV + DRIVE_FOV_KICK * burn + SPEED_FOV * fast + BOOST_FOV * this.boostKick - this.camera.fov) * (1 - Math.exp(-6 * dt));
    this.boostKick *= Math.exp(-BOOST_FADE * dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) this.setFov(fov);
    if (!this.cockpit && !reducedMotion.matches) {
      if (burn > 0.05) this.camera.position.add(scratch.randomDirection().multiplyScalar(me.radius * DRIVE_SHAKE * burn));
      // a jolt for every hit the own laser lands, bigger for a kill; it fades in a fraction of a second
      if (this.kick > 0.01) this.camera.position.add(scratch.randomDirection().multiplyScalar(me.radius * KICK_SHAKE * this.kick));
    }
    this.kick *= Math.exp(-KICK_FADE * dt);
    // the HUD projects with this frame's camera, not the one of the last rendered frame
    this.camera.updateMatrixWorld();
  }

  /**
   * Cinema mode, for recordings and trailers: the whole HUD, the radio's title and the
   * subtitles step aside (body.cinema), and the chase camera hangs farther back, follows softer
   * and drifts a little (see updateCamera). The same key brings everything back.
   */
  private toggleCinema() {
    this.cinema = !this.cinema;
    document.body.classList.toggle('cinema', this.cinema);
    if (!this.cinema) this.hud.flashMessage(this.time, t('Cinema mode off'), 1.5);
  }

  /**
   * The intro's flight (see startIntro): it opens on the arena's landmark as the menu shows it,
   * drifting around it, and sweeps down onto the own ship, ending exactly where the chase camera
   * sits, so the round takes over without a cut.
   */
  private introCamera(me: Ship) {
    const progress = THREE.MathUtils.clamp(this.raceTime() / INTRO_SECONDS, 0, 1);
    const at = introTarget.fromArray(this.venue.preview?.at ?? [0, 0, 0]);
    const from = introFrom.fromArray(this.venue.preview?.from ?? PREVIEW_FROM).sub(at).applyAxisAngle(UP, (progress - 0.5) * INTRO_SWING).add(at);
    const flight = me.flight;
    flight.toWorld(cameraGoal.set(0, me.radius * 0.75, me.radius * 2.6), cameraGoal);
    // the first part on the landmark, then the sweep, slow at both ends
    const sweep = THREE.MathUtils.smootherstep(progress, INTRO_HOLD, 1);
    this.camera.position.copy(from).lerp(cameraGoal, sweep);
    const target = at.lerp(scratch.copy(cameraGoal).addScaledVector(flight.forward(forward), me.radius * 10), sweep);
    look.lookAt(this.camera.position, target, flight.up(introUp).multiplyScalar(sweep).addScaledVector(UP, 1 - sweep));
    this.camera.quaternion.setFromRotationMatrix(look);
  }

  /** A new field of view: the particles keep their size in the world with it. */
  private setFov(fov: number) {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.effects.setViewport(window.innerHeight * this.renderer.getPixelRatio(), fov);
  }

  private updateMenuCamera() {
    this.riding = null;
    if (this.camera.fov !== CAMERA_FOV) this.setFov(CAMERA_FOV);
    // the solo plate shows the arena chosen on it: the menu goes there, and the camera drifts
    // slowly around its landmark (see ArenaProfile.preview), the rocks turning as in a round
    const chosen = this.choosingSolo && this.state === 'menu' && this.solo.arena ? arenaById(this.solo.arena) : undefined;
    if (chosen) {
      if (chosen !== this.venue) this.enterArena(chosen);
      const at = scratch.fromArray(chosen.preview?.at ?? [0, 0, 0]);
      this.camera.position.fromArray(chosen.preview?.from ?? PREVIEW_FROM).sub(at).applyAxisAngle(UP, this.time * PREVIEW_DRIFT).add(at);
      this.camera.lookAt(at);
      // the landmark beside the plate, not behind it: the picture is cut from a wider one
      const { width, height } = this.renderer.domElement;
      const shift = width * PREVIEW_SHIFT;
      this.camera.setViewOffset(width + 2 * shift, height, 2 * shift, 0, width, height);
      return;
    }
    if (this.camera.view?.enabled) this.camera.clearViewOffset();
    const t = this.time * 0.08;
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(Math.cos(t), Math.sin(t * 0.7) * 0.2, Math.sin(t));
  }
}
