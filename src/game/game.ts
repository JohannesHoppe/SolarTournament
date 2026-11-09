import * as THREE from 'three';
import { cos, exp, hypot, pow, sin } from '../detmath';
import { angleTo, applyAxisAngle, slerp } from '../detthree';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { Bloom, BLOOM_THRESHOLD } from '../view/bloom';
import { Graphics } from '../view/graphics';
import { TIER_NAMES, TIER_RUNGS, TIERS, type BenchFeature, type Look, type Quality } from '../view/quality';
import type { Assets, ShipType } from '../assets';
import { ASTEROID_POINTS, AsteroidField, FIELD_RADIUS, raySphere } from '../world/asteroids';
import { Sound } from '../sound/audio';
import { allyInLine, Bot, BOT_NAMES, evenSkills, HOME_RADIUS, meanSkill, novaWorth, pressOn, raceSpeedOf, SIEGE_DISTANCE, skillsFrom, skillsOf, startTiming, TORPEDO_CLEARANCE, type Ring, type Skill, type Skills } from '../ship/bots';
import { Effects } from '../view/effects';
import { Glitch } from '../view/glitch';
import { GradedOutputPass } from '../view/grade';
import { Datamosh } from '../view/datamosh';
import { GuideLine } from '../view/guide';
import { ReferencePlane } from '../view/plane';
import { OrbitPath } from '../view/orbitpath';
import { referencesOf } from '../world/reference';
import { lapClock, LapTimer, parseLaps } from './laps';
import { aimHook, cableEnd, Cables, clearOf, flightTime, floorOf, HOOK_RANGE, HOOK_RECHARGE, keepsHold, newTether, anchorPoint, pullOn, type Anchor, type Mark, type Tether } from './hook';
import { Hud, METERS_PER_UNIT, meters } from '../view/hud';
import { STREAKS } from '../view/streaks';
import { bindVolume, moodCue, Radio, type Mood, type MusicCue } from '../music/radio';
import { Crowd } from '../music/crowd';
import type { Spoken } from '../music/band';
import { CAMPAIGN, KESH, COMPUTER, ATTACKED, ANNOUNCER_ALIEN, ANNOUNCER_ARENA, ANNOUNCER_CAPTURE, ANNOUNCER_COMET, ANNOUNCER_COMET_KILL, ANNOUNCER_FLARE, ANNOUNCER_FLEET, ANNOUNCER_KILL, ANNOUNCER_LAST_LAP, ANNOUNCER_LEAD, ANNOUNCER_NAMES, ANNOUNCER_OPEN, ANNOUNCER_OUT, ANNOUNCER_PERFECT, ANNOUNCER_ROCK, ANNOUNCER_START, ANNOUNCER_SURVIVOR, ANNOUNCER_TEAM_KILL, ANNOUNCER_WIN, type Cast, CAST_COLORS, CAST_NAMES, RASK, SPONSOR_BREAK, SPONSOR_HAPPY, TIPS } from '../music/lines';
import { Hologram } from '../view/hologram';
import { loadBust, PORTRAIT_SWING, portraitModel } from '../view/products';
import { SCENE_MUSIC, type SceneName, stageOf } from '../campaign/scenes';
import type { Stage } from '../view/stage';
import { Speaker } from '../sound/speaker';
import { hash, mixSeed, ROUND_SECONDS, textSeed, titleFor, type Song } from '../music/songs';
import { showRecorded, showTransmission } from '../music/transmission';
import { IDLE, Input, keyLabel, learnKeyboardLayout, type Action, type Command, type Controls, type Device } from '../input/input';
import { fillSheet, SHEET_TABS } from '../input/sheet';
import { DECOY_LURE, decoyLaunch, Decoys, DECOYS_HELD, DECOYS_PER_PROBE } from './decoys';
/** A bot drops a decoy when a torpedo homing on it is within this share of the lure's reach (see botDecoy), at this rate a second once it is. */
const BOT_DECOY_AT = 0.6;
const BOT_DECOY_RATE = 3;
import { AGAIN_SHARE, BLACK_GLITCH, BLACK_PRINT_PRICE, BLACK_SHAKE, BLACK_TREMOR, BOND_MAX, buySalvage, type Campaign, campaignFrom, complete, counterOf, flownAgain, freshRun, gold, goldOf, styleRatings, HABIT_NEAR, hasMedal, hullOf, isJob, keepsStep, master, medal, MEDAL_SHARE, PRINT_PRICE, pitNight, placeBet, printClone, buyRumor, settleBet, sideJobAt, trialPassed, MISSIONS, type Mission, type Module, MODULE_NAMES, nextMission, PART_NAMES, PLACE_MUSIC, rankOf, ratingsOf, sideTrips, spareSkills, bars, takeChip, takeTag } from '../campaign/campaign';
import { scar, SCAR_EFFECTS, SCAR_KINDS, SCAR_NAMES, scarNumbers, scarOf, scarTier, stoneSeconds } from '../campaign/scars';
import { salvageById, type Salvage } from '../campaign/salvage';
import { PEOPLE_NAMES, PEOPLES, STANDING_NAMES, standingTier } from '../campaign/standing';
import { firstJobAt, freeFlight, GALLEY_VISIT, pitWaves, wantedName } from '../campaign/missions';
import { BET_ODDS, BET_STAKES, PIT_PURSE, RUMOR_PRICE, RUMORS } from '../campaign/gullet';
import { CAMPAIGN_KEY, CHIPS, HUNT_PLACES, isHuntPlace, TAG_IDS, tagId, tagOf, TAGS_PER_PLACE, type HuntPlace } from '../campaign/finds';
import { chipId, Hunt, type Find } from '../campaign/hunt';
import { showShelf } from '../world/shelf';
import { detectable, firstHull, LASER_RANGE, LOCK_RANGE, MAX_HEAT, MAX_HULL, noseOn, Ship, type ShipState, type Zone } from '../ship/ship';
import { flyByNose, MAIN_THRUST, MAX_SPEED, MAX_TURN_RATE, OVERDRIVE_DRIVE_COOLDOWN, OVERDRIVE_PUSH, type FlightModel } from '../ship/flight';
import { ownerOf, Session, TOURNAMENT_SIZE, type RoundState } from '../net/session';
import { assignTints, botTint, loadTint, saveTint, shownTint, TINTS, TROPHY_MARKS } from '../ship/tints';
import { isLeadHost, Online, pingPeerOf, type OnlineGame } from '../net/online';
import { Lobby, type Listing } from '../net/lobby';
import { OpenBeat, pausePush, pushKey, pushStatus, setPushFrom, subscribe as subscribePush, unsubscribe as unsubscribePush } from '../net/push';
import { MAX_FROM, snoozeUntil } from '../net/pushtext';
import { newRoom, roomFragment, roomFromFragment, roomLink, type Room } from '../net/room';
import { cleanName } from '../net/validate';
import { Space, SUN_DIRECTION } from '../world/space';
import { airAround, airStep, altitudeIn, density, heatInto, REACTOR_WASTE, dragOn, LOCK_DEPTH, RADAR_DEPTH, reachIn, safeSpeed, SIGHT_DEPTH, upIn } from '../world/air';
import { Haze, installHaze, skyLight } from '../view/haze';
import { Reentry } from '../view/reentry';
import { Arena, ARENA_GRACE, ARENA_LIMIT } from '../world/arena';
import { Belt, BELT_INNER } from '../world/belt';
import { COURSE_NAMES, coursesFrom, FlightSchool, RING_RADIUS, SCHOOL_COURSES, type SchoolContext, type SchoolCourse } from './school';
import { BOT_RESPAWN_SECONDS, RESPAWN_SECONDS, SponsorBreak } from './sponsors';
import { Wrecks, type Wreck, type WreckState } from '../world/wrecks';
import { ARENAS, arenaById, DEFAULT_ARENA, arenaByKey, arenaOfRound, PREVIEW_FROM, type ArenaId, type ArenaProfile, type Reference } from '../world/arenas';
import { Landmarks } from '../world/landmarks';
import { JET_WELDS } from '../world/derelict';
import { animateHull, setHullFrost } from '../world/worldship';
import { Mining } from '../world/mining';
import { Lensing } from '../view/lensing';
import { Radar, type RadarMark } from '../view/radar';
import { KillCam, REPLAY_SECONDS } from '../view/killcam';
import { clipType, recordClip } from '../view/clip';
import { Showcase, TITLE_WIDE } from '../view/showcase';
import { storageGet, storageSet } from '../storage';
import { BOT_GEAR, buy, buyGear, emptyHangar, type TournamentShip, GEAR, hangarFrom, hullLooks, keepable, LEVELS, nextPrice, payOut, perksOf, SELF_DESTRUCT_HOLD, SELF_DESTRUCT_RADIUS, sovereignEarned, UPGRADES, WALLET } from './hangar';
import { creditOf, LOCK_ANGLE, LOCK_DISTANCE, seesTarget, TORPEDO_BREAK, TORPEDO_DAMAGE, TORPEDO_GONE_SLACK, TORPEDO_LAUNCH, TORPEDO_LIFETIME, TORPEDO_RADIUS, TORPEDOES, Torpedoes, type Homing, type Torpedo } from './torpedoes';
import { contents, fieldSolid, obstacleSolid, Probes, PROBE_RADIUS, PROBE_STEADY, ITEM_NAMES, ITEM_HINTS, NOVA_RADIUS, placeBucket, SEALED_NAME, type Probe, type ItemKind, type ProbeState, type Solid } from './items';
import type { Asteroid, FieldState, RayHit, ShovedState, Well } from '../world/asteroids';
import { type Orbit, OrbitCalls, orbitable, type OrbitState, readOrbit, wellAlarmLevel } from './orbit';
import { knockShare, ramShare, syncShare } from '../net/plausible';
import { RacingLine } from './racingline';
import { bounceOff, impactDamage, ram, ramImpulse, RAM_SAFE, SAFE_IMPACT } from '../ship/impact';
import { setGlint } from '../ship/models';
import { approachGate, BOOST_PUSH, BOOST_RADIUS, canSkip, coilPush, Course, FINISH_GATES, GATE_POINTS, GATE_RADIUS, GATES, lapOf, LAPS, modeOfRound, pathCrossing, PLACE_POINTS, ROUND_MODES, takesStart, type RoomMode, type RoundMode } from './race';
import { BATTERY_DAMAGE, BATTERY_RANGE, batteryChance, Fleet, FLEET_HIT_POINTS, PLUME_BURN as FLEET_PLUME_BURN, PLUME_HEAT as FLEET_PLUME_HEAT, SINK_BLAST, SINK_POINTS, SINK_SECONDS, TORPEDO_HITS, ZONE_NAMES, ZONE_POINTS, type FleetEvent, type FleetWeapon } from './fleet';
import { ringReach, ringRim, touchRing } from '../world/gates';
import { FieldContacts, ringFixture } from '../world/contacts';
import { fieldSlice, SYNC_EVERY, SYNC_GRACE, SYNC_SLICES, syncField, type FieldSlice } from '../world/fieldsync';
import { IMMOVABLE, MASS, massOf, type Body } from '../world/bodies';
import { COMET_SPEED, COMET_WARNING, cometAt, cometEnd, cometStart, CometView, courseAt, headAt, headEnd, HEAD_RADIUS, meetObstacle, meetSolids, PIECE_RADIUS, roundComets, routeNearest, runDown, Shower, SHOWER_LENGTH, SHOWER_PIECES, SHOWER_WIDE, type Comet } from './comet';
import { BASE_RADIUS, CAPTURE_POINTS, CORE_REACH, Flags, GRAB_POINTS, RETURN_POINTS, TEAM_NAMES, TEAM_TINTS, type FlagEvent } from './flags';
import { CLONES, clonesLeft, FLARE_APPROACH, FLARE_BURN, FLARE_END, FLARE_HEAT, FLARE_KEEP, FLARE_RADIUS, FLARE_SHADE, FLARE_START, flareCenter, flareClearance, flareFront, flarePocket, isOut, standing } from './survival';
import { FlareView } from '../world/flare';
import { BEAM_STOPS, PROBE_BOUNCES, pushesOf, SLOT_BOUNCES, rayOf, SHOWER_BURSTS, solidTable, TORPEDO_FUSE, touchOf, WRECK_GRINDS } from './solids';
import { markedName, markLead, swatch } from '../view/marks';
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
  inGrip,
  SILENCE_BEFORE,
  SILENCE_COOLDOWN,
  SILENCE_SECONDS,
  WELL_CAUTION,
  WELL_CRITICAL,
  WELL_GAUGE,
  WELL_RELEASE,
  WELL_WARNING,
  BURNING_AWAY,
  wellEscape,
  type WellEscape,
} from './alarms';
import { MOMENTS, Moments, type Moment } from './moments';
import { killScore } from './friendly';
import { streakBonus, Streaks } from './streaks';
import { devlog } from '../devlog';
import { recorder, type FlightMode, type InputFrame } from '../recorder';
import { CAMERA_FOLLOW, CAMERA_FOV, CAMERA_TURN, CHASE_DISTANCE, CHASE_HEIGHT } from '../view/chase';
import { AIM_ASSIST_ANGLE, AIM_ASSIST_RANGE, assistAim, BRAKE_BURN_ANGLE, BRAKE_REST, Brake, keepUpright } from '../ship/computer';
import { chooseLocale, currentLocale, LOCALE_NAMES, LOCALES, msg, t } from '../i18n/i18n';
import { GAME_URL, ShareButton, type ShareWhere } from '../share';

/** Online tournaments show the scoreboard this long before the next round starts. */
const RESULTS_SECONDS = 12;
/** A round the game master cuts short shows its scoreboard this long: long enough to read one's place, short since the Hosts just asked for the next (s). */
const CUT_RESULTS_SECONDS = 3;
/** The motion streaks follow the share of particles drawn, but keep at least this share of STREAKS: they say where the ship moves. */
const STREAKS_LEAST = 0.75;
/** The standings held open with Tab are written anew this often (s, real time). */
const STANDINGS_REFRESH = 0.25;
/** The standings' ping turns orange from this delay, and red from twice that (ms): only once it starts to matter. */
const PING_WARN_MS = 150;
const PING_CRITICAL_MS = 2 * PING_WARN_MS;
/** The Hosts' tints are settled anew this often (s, real time, see Game.tintShips). */
const TINT_SECONDS = 0.5;
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
 * drive lit earlier and still burning at BURN! stalls for FALSE_START_STALL seconds. A bot's
 * drive is judged alike, lit by its own timing (see startTiming).
 */
const INTRO_SECONDS = 5;
const START_SECONDS = 3;
const START_AT = INTRO_SECONDS + START_SECONDS;
const START_LIGHTS = 5;
/** How loud the stadium is over the intro and at each number of the countdown (0 silent, 1 on its feet); at the start word it erupts. */
const CROWD_INTRO = 0.3;
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
/** A carrier whose flight is more than this off the way home (rad, about 35°) eases off to FLAG_RAID_SPEED for the turn, so the core in tow does not whip around. */
const FLAG_TOW_TURN = 0.6;
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
/** A bot of Capture the Flag fires its harpoon at a core it may take that lies this close to its nose's line (rad, about 3°; see Game.botHookCore). */
const BOT_CORE_CONE = 0.05;
/**
 * A nova core destroys every other ship within NOVA_RADIUS (units, 800 m) of its holder, its
 * own side's too, and takes the battleship's parts it reaches (see Fleet.novaHits); its shell
 * runs out there in NOVA_EXPANSION seconds. A bot that holds one sets it off where it is worth
 * it with none of its own side inside (see novaWorth), and bots flee a nova holder within
 * NOVA_FLEE radii.
 */
const NOVA_EXPANSION = 0.8;
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
/**
 * The brake as a switch (see Game.brakeManeuver): steering past BRAKE_STEER (stick, both axes)
 * during the brake gives the Host the nose, the drive burning only while it points within BRAKE_AIM
 * (rad, 30°) of against the flight; steering past BRAKE_TAKEOVER during the turn back breaks it
 * off; the turn back is done within BRAKE_HOME (rad, about a degree) of the attitude remembered.
 */
const BRAKE_STEER = 0.15;
const BRAKE_AIM = 0.52;
const BRAKE_TAKEOVER = 0.6;
const BRAKE_HOME = 0.02;
/**
 * Who is shooting at the Host (see Game.attacked): marked on the HUD for ATTACK_MEMORY seconds
 * after its hit; named by Nicole when it is more than ATTACK_UNSEEN (rad, about 35°) off the
 * nose, the same ship at most every ATTACK_REPEAT seconds, any at most every ATTACK_GAP.
 */
const ATTACK_MEMORY = 5;
const ATTACK_UNSEEN = 0.6;
const ATTACK_REPEAT = 10;
const ATTACK_GAP = 3;
const homeTurn = { yaw: 0, pitch: 0, roll: 0, off: 0 };
const returnAt = new THREE.Vector3();
/** A torpedo homing on the own ship within this distance sets off TORPEDO INBOUND (units, 2 km); within TORPEDO_CRITICAL it is CRITICAL (units, 500 m). */
const TORPEDO_WARNING = 40000;
const TORPEDO_CRITICAL = 10000;
/**
 * Nicole counts an incoming torpedo down at these distances (units: 1000, 500, 300, 200, 100 m),
 * each mark only while TORPEDO_MARK_SECONDS remain at the closing speed: a mark said later would
 * talk over the moment to act.
 */
const TORPEDO_MARKS: readonly (readonly [number, string])[] = [
  [20000, COMPUTER.torpedo1000],
  [10000, COMPUTER.torpedo500],
  [6000, COMPUTER.torpedo300],
  [4000, COMPUTER.torpedo200],
  [2000, COMPUTER.torpedo100],
];
const TORPEDO_MARK_SECONDS = 2.2;
/** Nicole's tips: while one is said, she does not cut it off with the call of a torpedo. */
const TIP_LINES: ReadonlySet<string> = new Set(Object.values(TIPS));
/** How a ship that touches an arena's massive body dies, for the sponsor break. */
const WELL_DEATHS: Partial<Record<ArenaId, string>> = { giant: msg('Crushed in the depths'), hole: msg('Crossed the event horizon') };
/** A client's round clock jumps to the lead browser's when it is this far off (s), and drifts towards it otherwise. */
const ROUND_SNAP = 0.25;
/** A rock hit from another browser counts only within this much field time (s) of the own clock; the clocks agree to a fraction of a second. */
const ROCK_TIME_SLACK = 5;
/** A motion the lead gave a piece counts as older than the piece's own beyond this much field time (s): the field times travel to the millisecond. */
const STALE_MOTION = 0.002;
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
/** Each death of the Host by an enemy raises the bots' ease (see Bot.ease) by this much in a solo round; a kill by the Host lowers it by KILL_EASE. */
/** A touch the clone feels in a scene in person (see SchoolContext.feel): how hard the link jolts (glitch strength) and for how long (s). */
const FEEL_GLITCH = 0.3;
const FEEL_SECONDS = 0.5;
/** The share of the sky's light left in a scene in person shut in rock (see ScenePlan.indoors): a trace, so a corner no lamp reaches is dark, never black. The sun's is none. */
const INDOORS_SKY = 0.12;
/** How hard pain the clone lives through breaks the link's picture up (see SchoolContext.agony): far harder than a touch (FEEL_GLITCH). */
const AGONY_GLITCH = 0.85;
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
const KNOCKOUTS: ReadonlySet<DeathCause> = new Set<DeathCause>(['rock', 'wreck', 'space', 'well', 'air', 'flare', 'comet']);
/** A shove sets the hull spinning by this much per unit of closing speed (rad/s per units/s; 3.2 rad/s at 40 m/s), up to SHOVE_SPIN_MAX; the flight computer catches it within a fraction of a second. */
const SHOVE_SPIN = 0.004;
const SHOVE_SPIN_MAX = 6;
/**
 * The longest step the round runs in (s): a longer frame is split into steps this short, so a
 * laser's cadence, a collision's sweep and a bot's thinking come out the same at 20 frames a
 * second or in a time-lapse as at 60.
 */
const MAX_STEP = 1 / 30;
/** Under a planet's cloud deck that is the haze's light, darkening towards its depths' over this depth (units, 1.2 km; see view/haze). */
const BACKGROUND_DEPTH = 24000;
/**
 * In a planet's air (see airWeather): sound runs at SOUND_SPEED (units/s, 900 m/s, as in cold
 * hydrogen and helium); thunder is at its loudest THUNDER_LOUD close by and a quarter of that at
 * THUNDER_REACH (units, 1 km, also how far its crack carries); the wind roars at full strength
 * once the air's push on the hull (density times speed squared) is WIND_FULL of its push at the
 * deck at the speed limit.
 */
const SOUND_SPEED = 18000;
const THUNDER_LOUD = 1;
const THUNDER_REACH = 20000;
const WIND_FULL = 0.8;
/**
 * The air's heat alarm (see airAlarm): WARNING from AIR_HOT of the laser's heat on, Nicole warns
 * again once the hull has cooled below AIR_COOL; the screen's glow by level (0..1).
 */
const AIR_HOT = 70;
const AIR_COOL = 40;
const AIR_GLOW = { caution: 0.12, warning: 0.3, critical: 0.6 } as const;
/** The clog alarm (see clogAlarm): CAUTION from CLOG_CAUTION of a full clog, WARNING from CLOG_WARNING; Nicole may warn again once it is under CLOG_QUIET. */
const CLOG_CAUTION = 0.25;
const CLOG_WARNING = 0.6;
const CLOG_QUIET = 0.1;
/** Nicole warns of friendly fire (a trigger pulled with the nose on a ship of the own side, or a hit on one) at most this often (s). */
const FRIEND_WARNING = 15;
/** The on-target tick sounds at most this often (s), so a nose on the edge of a hull does not chatter. */
const ON_TARGET_TICK = 0.25;
/** The ease fades away over this many seconds of game time. */
const EASE_FADE = 90;
/** Explosions closer than this pelt the own hull with audible debris. */
const DEBRIS_HEARING = 6000;
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
/** The impact warning starts this many seconds before the last chance to flip and brake (in the campaign earlier by the Host's Stone Memory, see campaign/scars). */
const IMPACT_MARGIN = 2;
/** A scar's tier as the screen numbers it. */
const ROMAN = ['', 'I', 'II', 'III'];
/** Assumed duration of a flip for the impact warning (s): half a turn at full rate, plus spin-up and settling. */
const FLIP_SECONDS = Math.PI / MAX_TURN_RATE + 0.35;
/** Without a rock or ship in the way, the crosshair shows the nose at this distance (units, 2 km). */
const AIM_DEPTH = 40000;
/** Random places on the edge of the field a respawn chooses from. */
const SPAWN_CANDIDATES = 12;
/** Where a clone is printed when no place in the field is clear: this share of the field's layout radius out, beyond its rocks, and never beyond 95 % of the arena's edge. */
const SPAWN_BEYOND = 1.1;
/**
 * Nicole's free drift tip in a deathmatch (see crossingTip): an enemy within CROSSING_RANGE
 * (units, 500 m), more than CROSSING_ANGLE (rad, 60°) off the own nose and crossing faster than
 * CROSSING_SPEED (units/s, 60 m/s) across the line between them, while the autopilot holds the
 * nose on the path: free drift lets the nose follow it while the ship slides on.
 */
const CROSSING_RANGE = 10000;
const CROSSING_ANGLE = Math.PI / 3;
const CROSSING_SPEED = 1200;
/**
 * The camera sees this far (units, 35 km): the horizon of Jupiter's cloud deck, 40 km in
 * radius, lies up to 17 km off for a ship at the arena's edge (see arenas.ts), and its auroras
 * and moons are drawn on the sky within it (see world/jupiter).
 */
const CAMERA_FAR = 700000;
/** A full burn widens the view by this much (degrees) and shakes the chase camera by this share of the ship radius: the drive is felt. */
const DRIVE_FOV_KICK = 7;
const DRIVE_SHAKE = 0.012;
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
const OVERDRIVE_RECHARGE = 60;
/** The flight ahead of a well's alarm (see wellEscape) runs again this often (s): a fifth of a second late at most. */
const ESCAPE_EVERY = 0.2;
/**
 * The dodge (a thruster key tapped twice, LB): the maneuvering thrusters fire all at once at
 * overload, a kick of DODGE_SPEED (units/s, 60 m/s) sideways or up or down: strong enough to leave
 * a line of fire, and to throw the ship back onto a racing line after a missed ring. The autopilot
 * lets the drift be for DODGE_DRIFT seconds, so the ship plainly leaves the line of fire (about
 * 70 m, two ship lengths, before the autopilot takes the drift out), and the thrusters
 * need DODGE_RECHARGE seconds before the next one. It presses the clone into the side of the
 * seat (DODGE_STRAIN).
 */
const DODGE_SPEED = 1200;
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
/** What the Host owns: Solar Coins, the upgrades of its ships, the ship it flies (see game/hangar). */
const HANGAR_KEY = 'solartournament.hangar';
/** The ships as the menu names them. */
const SHIP_NAMES: Record<ShipType, string> = { human: msg('Human Interceptor'), alien: msg('Alien Interceptor'), sovereign: msg('The Sovereign'), magpie: 'Magpie' };
const CALLSIGN_KEY = 'solartournament.callsign';
/** The flight school's courses a Host has completed (a list); once the basic training is among them, the menu leads with the solo round. */
const SCHOOL_DONE_KEY = 'solartournament.school';
/** How often the hangar's and the completed courses' entries are looked at for a change made in the own tab, which raises no storage event (ms). */
const EARNED_WATCH_MS = 2000;
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

/** The drill a Host has reached in each course, kept by its name (see FlightSchool.reached). */
function schoolSteps(): Partial<Record<SchoolCourse, number>> {
  try {
    const kept: unknown = JSON.parse(storageGet(SCHOOL_STEP_KEY) ?? '{}');
    const steps: Partial<Record<SchoolCourse, number>> = {};
    if (kept && typeof kept === 'object') {
      for (const course of SCHOOL_COURSES) {
        const step = FlightSchool.reached(course, (kept as Record<string, unknown>)[course]);
        if (step !== undefined) steps[course] = step;
      }
    }
    return steps;
  } catch {
    return {};
  }
}

/** Keeps the drill a Host has reached in each course, by its name; a course without one has none kept. */
function keepSchoolSteps(steps: Partial<Record<SchoolCourse, number>>) {
  const kept: Partial<Record<SchoolCourse, string>> = {};
  for (const course of SCHOOL_COURSES) if (steps[course] !== undefined) kept[course] = FlightSchool.keep(course, steps[course]);
  storageSet(SCHOOL_STEP_KEY, JSON.stringify(kept));
}
/** The solo round a Host chose last: mode, arena (none: by chance) and rivals. */
const SOLO_KEY = 'solartournament.solo';
/** The best lap of each arena's course: its time and splits (see game/laps). */
const LAPS_KEY = 'solartournament.laps';

/** What a solo round plays: a race unless the Host asks for another mode, its arena (the default arena unless the Host asks for another; null: by chance), and the bots it flies against: a full grid unless the Host picks fewer (the rivals chosen set how fast and how hard it is). */
type SoloChoice = { mode: RoundMode; arena: ArenaId | null; rivals: string[] };
const SOLO_DEFAULT: SoloChoice = { mode: 'race', arena: DEFAULT_ARENA.id, rivals: ['Laika', 'Sputnik', 'Juno', 'Ceres', 'Kessler', 'Orion', 'Vega'] };
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
      // null is a choice of its own: by chance
      arena: kept.arena === null ? null : ARENAS.some((a) => a.id === kept.arena) ? kept.arena! : SOLO_DEFAULT.arena,
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
/** The link's static at its strongest (a share of a full glitch), and how long each frame's lingers (s): a flicker that follows the strength from frame to frame. */
const STATIC_GLITCH = 0.7;
const STATIC_SECONDS = 0.12;
/** A hull worn down to this (of 100) by a raider who spares clones takes no more from him: he never finishes a clone (The Quiet Man). */
const SPARED_HULL = 30;
type DeathCause = 'rock' | 'wreck' | 'space' | 'well' | 'air' | 'flare' | 'battery' | 'exhaust' | 'blast' | 'nova' | 'self' | 'plume' | 'shower' | 'comet' | 'ram' | 'knockout' | null;
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
 * cover behind an asteroid is the best answer, the armored nose turned into it the next. Each
 * piece weighs SHOWER_WEIGHT laser hits: 3 hull on the armor, 0.3 of the thrust in the drive,
 * so the fourth piece into the drive sends its reactor critical.
 */
const SHOWER_COVER = 6000;
const SHOWER_WEIGHT = 1.5;
/** The share of a shower's pieces bursting on armor, rock or anything else solid that throws sparks (the rest go to dust unseen, so a swarm's worth does not fill the screen). */
const SHOWER_SPARKS = 0.25;
/** How far a well bends a comet's route off its course over the swarm's length, at most (units, 300 m: the black hole's pull, see Comets in the README): what may stand in its way is looked for this much wider. */
const SHOWER_BEND = 6000;
/** A bot this close to a comet's route (units, 500 m beyond the swarm's width) as the head nears or the swarm passes flies away from it, sideways. */
const COMET_DANGER = 10000;
/**
 * In a comet's tail (see Game.cometTail), deepest on its axis at the head: bursts of dust
 * patter on the hull about TAIL_PATTER times a second, the link crackles about TAIL_STATIC
 * times a second, with a glitch of TAIL_GLITCH strength (a slight one: a hit is 0.4 and more).
 */
const TAIL_PATTER = 25;
const TAIL_STATIC = 1.5;
const TAIL_GLITCH = 0.15;
/**
 * Flying through a ring's layer of ice grains (see ArenaProfile.grains, Game.hullPatter): grains
 * patter on the hull about GRAIN_PATTER times a second at GRAIN_PATTER_SPEED (units/s, 100 m/s)
 * and faster, the fewer the slower the ship flies and the nearer the layer's faces.
 */
const GRAIN_PATTER = 12;
const GRAIN_PATTER_SPEED = 2000;
/** The mist of ice crystals at the derelict's break (see world/derelict) patters on the hull about MIST_PATTER times a second where it is thickest, at GRAIN_PATTER_SPEED and faster. */
const MIST_PATTER = 15;
/** Enceladus's plumes (see world/enceladus) patter on the hull about PLUME_PATTER times a second at a plume's foot, at GRAIN_PATTER_SPEED and faster. */
const PLUME_PATTER = 20;
/**
 * Flying through the dust a drill hole blows on the Belt's rocks (see Mining.dustAt, Game.hullPatter):
 * it patters on the hull about DUST_PATTER times a second in the heart of a plume at
 * DUST_PATTER_SPEED (units/s, 50 m/s) and faster, the fewer the thinner the dust and the slower the ship.
 */
const DUST_PATTER = 18;
const DUST_PATTER_SPEED = 1000;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** The label of a menu mode button: the text of its first line, without the Enter key. */
const modeName = (id: string) => $(id).querySelector<HTMLElement>('.mode-label')!;

/** One of several lines, at random; only the local voice says it. */
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const scratch = new THREE.Vector3();
const forward = new THREE.Vector3();
const upward = new THREE.Vector3();
/** Up from a planet's center, through the camera or a ship (see airWeather, airAlarm). */
const up = new THREE.Vector3();
/** A planet's up at the watched ship, for the attitude in its air. */
const skyUp = new THREE.Vector3();
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
const closingVelocity = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const toAim = new THREE.Vector3();
const decoyAt = new THREE.Vector3();
const decoyVelocity = new THREE.Vector3();
const sweep = new THREE.Vector3();
/** A ray's hit into the field, reused: one per place that casts every step, each read before that place casts again. */
const rayHit = (): RayHit => ({ asteroid: null, distance: 0, center: new THREE.Vector3() });
const shadeHit = rayHit();
const sweepHit = rayHit();
const impactHit = rayHit();
const aimHit = rayHit();
const laserHit = rayHit();
/** Scratch of a claim-jumper's sight of its rig and where it starts (see Game.sawPoint, spawnJumpers). */
const sawHit = rayHit();
const sawWay = new THREE.Vector3();
const jumperAt = new THREE.Vector3();
/**
 * A claim-jumper (see Game.jumpers) holds SAW_DISTANCE off its rig (units, 400 m) and takes it
 * for in sight when its rock is the first thing within SAW_REACH (units, 10 m) past the rig's
 * middle; it heeds a ship only within JUMPER_NOTICE of it (units, 800 m) and saws on until one
 * comes that close.
 */
const SAW_DISTANCE = 8000;
const SAW_REACH = 200;
const JUMPER_NOTICE = 16000;
/** The claim-jumpers' side (see Ship.team): the three brothers fight together, the Host stays on none. */
const JUMPER_TEAM = 1;
/** The side the Host and a mission's wingman fly on (see SchoolContext.wingman), apart from the raiders'. */
const ALLY_TEAM = 2;
/** How long the screen stays black when the last clone dies, with no printer for the next (see Drill.lastClone; s). */
const NO_CLONE_SECONDS = 4;
/** A mission's race rivals (see Game.racers): their names, the Rockborn kids', and how far apart they start beside the Host (units, 60 m). */
const RIVAL_NAMES = ['Nix', 'Bean', 'Spark'];
const RIVAL_GAP = 1200;
const rivalOffset = new THREE.Vector3();
const rivalAt = new THREE.Vector3();
/** A laser beam's ends, reused shot after shot. */
const beamEnd = new THREE.Vector3();
/** An actor's blank shot (see SchoolContext.blanks) flies BLANK_MISS (rad, some 4°) over the nose's line: wide of whatever it is aimed at. */
const BLANK_MISS = 0.07;
const blankUp = new THREE.Vector3();
const beamStart = new THREE.Vector3();
const surface = new THREE.Vector3();
const ringNormal = new THREE.Vector3();
/** A beam is felt along for a ring's solid parts in steps this long (units, 2 m): thinner than its struts (3 m). */
const RAY_STEP = 40;
const cometHead = new THREE.Vector3();
const cometVelocity = new THREE.Vector3();
const cometOffset = new THREE.Vector3();
const cometPiece = new THREE.Vector3();
const cometCover = new THREE.Vector3();
const cometRelative = new THREE.Vector3();
const cometAway = new THREE.Vector3();
const cometCourse = new THREE.Vector3();
const showerOffset = new THREE.Vector3();
const showerWay = new THREE.Vector3();
const showerRay: RayHit = { asteroid: null, distance: 0, center: new THREE.Vector3() };
/** A point a ring's housing is felt for at along a beam (see Game.ringRay). */
const solidProbe = new THREE.Vector3();
/** No sponsor cores, outside Capture the Flag (see Game.solids). */
const NO_BALLS: readonly { position: THREE.Vector3; velocity: THREE.Vector3 }[] = [];
/** The comet's head's velocity is taken from where it is this much field time before and after (s): its route bends slowly, even near a well. */
const HEAD_PACE = 0.05;
const headBefore = new THREE.Vector3();
/** Where the lead's battleship pushed a piece it rammed (see remoteRam). */
const rammedTo = new THREE.Vector3();
/** The velocity of what does not move: a ring of the tournament holds its place. */
const STILL = new THREE.Vector3();
/** Two ships in contact: the way from the first to the second, and where they touch. */
const ramApart = new THREE.Vector3();
const ramPoint = new THREE.Vector3();
const VENT_COLOR = new THREE.Color(1, 0.6, 0.25);
/** The beams of the flight school's gunner: red, the color of danger. */
const DRILL_GUNNER_COLOR = new THREE.Color(1, 0.2, 0.25);
/** A nozzle puffing less than this share of its full push shows nothing (see showJets). */
const JET_SHOWN = 0.05;
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

/** A rock (or what else a hook holds that is not a ship) as the body at a cable's end. */
const heldBody = { position: new THREE.Vector3(), velocity: new THREE.Vector3(), mass: IMMOVABLE };
function rockBody(mass: number, at: THREE.Vector3, velocity: THREE.Vector3): Body {
  heldBody.mass = mass;
  heldBody.position.copy(at);
  heldBody.velocity.copy(velocity);
  return heldBody;
}
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

const crossingPoint = new THREE.Vector3();
/** How fast an enemy crosses the own line of sight to it (see crossingTip). */
const crossingAcross = new THREE.Vector3();

/** The turn of a ship at `eye` that looks at `target`, `up` as up; a fresh quaternion for a new clone. */
/** Where a flock's ship looks as it is set out (see SchoolContext.flock). */
const flockAhead = new THREE.Vector3();
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
  readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 10, CAMERA_FAR);
  private readonly space = new Space();
  private readonly arena = new Arena();
  private readonly belt: Belt;
  readonly field: AsteroidField;
  /** The field's pieces meeting each other and the rings, decided by the lead browser or a solo round (see world/contacts). */
  private readonly contacts = new FieldContacts();
  private readonly effects: Effects;
  /** Ships flying hot through a planet's air: their plasma, glowing hulls and fireballs (see view/reentry). */
  private readonly reentry: Reentry;
  private readonly replayEffects: Effects;
  private readonly killcam: KillCam;
  private readonly torpedoes: Torpedoes;
  /** The decoys in flight (see game/decoys), and how many the own ship has dropped, for their ids. */
  private readonly decoys: Decoys;
  private decoysDropped = 0;
  /** The shells of novas going off (see novaBlast). */
  private readonly shockwaves: { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; born: number }[] = [];
  private readonly shockwaveGeometry = new THREE.SphereGeometry(1, 48, 24);
  /** The item probes of the round (see game/items). */
  private readonly probes = new Probes();
  /** The last picture was the kill cam's. */
  private replaying = false;
  private readonly wrecks = new Wrecks();
  /** The arena the round is played in (see enterArena), and its scenery. */
  private venue: ArenaProfile = DEFAULT_ARENA;
  private readonly landmarks: Landmarks;
  /** The Rockborn's mining on the Belt's rocks (see world/mining). */
  readonly mining = new Mining();
  /** The haze of an arena's air in the picture (see view/haze). */
  readonly haze = new Haze();
  /** What the screen shows where nothing is drawn: the arena's space (see Space.setMood), or under a planet's cloud deck its haze (see airWeather). */
  private readonly background = new THREE.Color();
  /** Tone mapping, the arena's color grade and the screen's encoding, in one pass (see view/grade). */
  private readonly output = new GradedOutputPass();
  /** The light that reaches a sheet of cloud this deep (units) under the deck (see world/jupiter). */
  private readonly sheetLight = (depth: number) => skyLight(-depth);
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
  /** The same moment on the round's real-time clock, once known (see followStart); null before a round's first clock. */
  private roundStartWall: number | null = null;
  /** Online: when this browser arrived in the running round (game time; see DECIDE_GRACE). */
  private roundArrivedAt = -Infinity;
  /** The same moment on the round's real-time clock (see setRoundEnd, roundClock). */
  private roundEndsAtWall = 0;
  /** How far a solo round's clock runs ahead of real time (s): the game time a time-lapse added, or a freeze held back (see roundClock). */
  private lapse = 0;
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
  /** The own public tournament as the lobby announces it: one listing, brought up to date every frame in place (the lobby keeps it and sends it as it stands). */
  private readonly listing: Listing = { code: '', name: '', hosts: 0, bots: false, mode: 'race', left: 0 };
  /** The rows of the list of tournaments, by room code (see renderTournaments). */
  private readonly tournamentRows = new Map<string, { item: HTMLLIElement; name: HTMLElement; meta: HTMLElement; join: HTMLButtonElement; listing: Listing }>();
  /** Counts down the time left of the listed tournaments while the list is open. */
  private tournamentClock = 0;
  /** The lead browser's word to /push that its public tournament is open. */
  private readonly openBeat = new OpenBeat();
  /** The server's VAPID key once asked for (null: no notifications to offer), undefined before. */
  private pushKey: string | null | undefined;
  /** The choices of the form that starts a tournament. */
  private roomPublic = true;
  private roomBots = true;
  private roomMode: RoomMode = 'race';
  /** What the game master chose on the plate of a new round; online the lead browser starts it once the scoreboard of the round cut short has been shown. */
  private nextRound: { arena: ArenaId; mode: RoomMode } | null = null;
  /** The plate of a new round is open, with the choices on it. */
  private choosingRound = false;
  private roundChoice: { arena: ArenaId; mode: RoomMode } = { arena: DEFAULT_ARENA.id, mode: 'deathmatch' };
  /** The round whose arena the game master chose, instead of the room's order. */
  private pickedArena: { round: number; arena: ArenaId } | null = null;
  /** The game master is cutting the running round short for a new one. */
  private roundCut = false;
  /** This browser's Host was last told it is the game master. */
  private toldGameMaster = false;
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
  /**
   * What the Host owns (see game/hangar) and the courses of the flight school it completed (see
   * readEarned), the ship it flies, the ship on show above the logo, and whether the hangar's
   * plate is open.
   */
  private hangar = emptyHangar();
  private coursesDone = new Set<SchoolCourse>();
  /** The campaign as the browser keeps it, and the mission of it flown now (null: none). */
  private campaign = campaignFrom(storageGet(CAMPAIGN_KEY));
  private mission: Mission | null = null;
  /** The mission whose trial round is being flown (see Mission.trial), its drills done. */
  private trialOf: Mission | null = null;
  /** The last clone dead and the screen black (see Drill.lastClone). */
  private noClone = false;
  /** The mission flown is one done before, flown again for nothing: it keeps no drill reached and runs on into no other. */
  private flyingAgain = false;
  /** The timer that ends a link lost in a drill (see the school context's linkLost), cleared when another starts. */
  private linkLostTimer = 0;
  /** The campaign's job board is open (see showBoard). */
  private atBoard = false;
  /** The Gullet's plate is shown over the scene in person (see showGullet), and the Host left by it since it was shown. */
  private gulletOpen = false;
  private gulletLeft = false;
  /** The black boxes and data chips of the place flown at in the campaign (see campaign/hunt), and those Nicole has named on this visit to it. */
  private readonly hunt = new Hunt();
  private readonly pinged = new Set<string>();
  /** A data chip's track the campaign plays from `since` (wall clock, s) in place of the mood's (see musicCue); null for none. */
  private chipTrack: { title: string; since: number } | null = null;

  /** The Host's habits are counted (see campaign/campaign, Habits): in a mission's fight against raiders who fire in earnest, until Blackout is done. */
  private get learning(): boolean {
    return !!this.school?.mission && !!this.jumpers && !this.jumpers.blanks && !this.campaign.done.includes('blackout');
  }

  /** A beam of the Host's in a fight: a shot, and a hit if it ended on a raider. Kept with the campaign's next change. */
  private countShot(struck: Ship | null) {
    if (!this.learning) return;
    const habits = this.campaign.habits;
    habits.shots++;
    if (struck && this.jumpers!.bots.some((bot) => bot.ship === struck)) habits.hits++;
  }

  /** The seconds of fight while a raider is alive, and those of them with the nearest within HABIT_NEAR. Kept with the campaign's next change. */
  private watchHabits(me: Ship | null, dt: number) {
    if (!me?.alive || this.state !== 'playing' || !this.learning) return;
    let nearest = Infinity;
    for (const bot of this.jumpers!.bots) if (bot.ship.alive) nearest = Math.min(nearest, bot.ship.flight.position.distanceTo(me.flight.position));
    if (nearest === Infinity) return;
    this.campaign.habits.fight += dt;
    if (nearest < HABIT_NEAR) this.campaign.habits.near += dt;
  }

  /** Changes the campaign and keeps it. */
  private keepCampaign(change: (campaign: Campaign) => void) {
    change(this.campaign);
    storageSet(CAMPAIGN_KEY, JSON.stringify(this.campaign));
  }

  /** Whether the own flight computer has a module (see campaign/campaign, Module): every one but in a mission of the campaign, where Nicole has only those installed. */
  private aid(module: Module): boolean {
    return !this.school?.mission || this.campaign.modules.includes(module);
  }
  /** The browser keeps values no Host can own: the screen says what it thinks of that, and nothing is kept over them. */
  private tampered = false;
  /** The hangar's and the completed courses' entries as last read, so a change to them is noticed. */
  private earnedRead: [string | null, string | null] = [null, null];
  private selectedShip: TournamentShip = 'human';
  private shipShown: TournamentShip = 'human';
  private showcase: Showcase | null = null;
  private inHangar = false;
  /**
   * The share button at the end of the radio box, on every screen: the game's link, or in a
   * running tournament the tournament's. While its menu is open the mouse does not steer, so the
   * Host can reach it; the round runs on.
   */
  private readonly share = new ShareButton(
    $('now-playing'),
    () => this.shareWhere(),
    (open) => this.input.steerWithMouse(this.state === 'playing' && !open && !this.gulletOpen),
  );
  /** The drive lights, always in the scene; ships borrow them (see lendLight). */
  private readonly engineLights: THREE.PointLight[] = [];
  /** X is held: the flight computer turns the own ship towards `flipGoal`, fixed when the flip started. */
  private flipping = false;
  private readonly flipGoal = new THREE.Vector3();
  /** The nose points at the flip's goal (it beeps once when it gets there). */
  private flipAligned = false;
  /**
   * The autopilot flies the own ship where its nose points (see flyByNose); in free drift the
   * input turns the nose and nothing else, and the ship slides on. On at the start of a round; T
   * switches to free drift and back at once.
   */
  private autopilot = false;
  /** How much the bots go easy on the Host in a solo round, 0..1 (see DEATH_EASE). */
  private ease = 0;
  /** The nose is on a ship: the laser would hit now (see assistAim). */
  private onTarget: 'drive' | 'armor' | 'friend' | null = null;
  /** When the on-target tick last sounded (see ON_TARGET_TICK). */
  private onTargetTickAt = -Infinity;
  /** The flight school's marker as the frame's last step left it (see teach), or null; the screen shows it once a frame (see showSchoolHud). */
  /** Who calls the ship as a hologram right now (see showCaller). */
  private caller: Cast | null = null;
  private schoolMark: THREE.Vector3 | null = null;
  /** The racing line the flight school's HUD draws to its marker or through its rings, as the frame's last step left it (see teach), or null. */
  private schoolTrack: { line: RacingLine; next: number } | null = null;
  /** When Nicole last warned of friendly fire (see FRIEND_WARNING). */
  private friendWarnedAt = -Infinity;
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
  /** The brake (it beeps once at rest). */
  private readonly brake = new Brake();
  /**
   * The brake as a switch (see brakeManeuver): off, braking, or turning back to the attitude the
   * ship had when it began (`brakeHome`); and whether its key was down last frame.
   */
  private brakePhase: 'off' | 'brake' | 'return' = 'off';
  /** The ships that hit the own one and when (game time, s), the last of them, and the one Nicole last named and when (see attacked). */
  private readonly attackers = new Map<Ship, number>();
  private lastAttacker: Ship | null = null;
  private namedAttacker: Ship | null = null;
  private namedAt = -Infinity;
  private brakeHeld = false;
  /** Since when the self-destruct's button is held (game time, s), or null (see selfDestructOwn). */
  private selfDestructSince: number | null = null;
  private readonly brakeHome = new THREE.Quaternion();
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
  /** What still gets the own ship out of the well, as last flown ahead (see wellAlarm), and when it is flown ahead again. */
  private escape: WellEscape = 'drive';
  private escapeAt = 0;
  /** The orbit readout of the frame before (null: no orbit about the arena's well possible, or no clone) and its conic (see game/orbit). */
  private orbitState: OrbitState | null = null;
  private readonly orbit: Orbit = { periapsis: 0, apoapsis: 0, circular: 0, radial: 0 };
  /** When Nicole speaks of the orbit. */
  private readonly orbitCalls = new OrbitCalls();
  /** How far Nicole has warned of the air's heat (1 heating, 2 burning), reset once the hull has cooled (see airAlarm). */
  private airSaid = 0;
  /** Whether Nicole has warned of the clogged radiators this dive (see clogAlarm). */
  private clogSaid = false;
  /** How much the screen glows with a solar flare's heat and with the air's (0..1), the larger shown (see showFlare, airAlarm). */
  private flareGlow = 0;
  private airGlow = 0;
  /** Whether the air's wind and plasma may be sounding (see airWeather, quietAir): only then are they turned down. */
  private airHeard = false;
  private hullWarned = false;
  /** The torpedo Nicole counts down (see torpedoAlarm): the next of TORPEDO_MARKS, and whether she called the break. */
  private torpedoCall: { torpedo: Torpedo; mark: number; broke: boolean } | null = null;
  /** When the radio may fall silent again before an imminent death. */
  private silenceReadyAt = 0;
  /** Whether the camera sees a ship past the asteroids, for the HUD markers. */
  // the HUD marks a ship its sensors find: in sight, and not running silent beyond SILENT_RANGE (see Ship.silent)
  private readonly inSight = (ship: Ship) => detectable(ship, this.camera.position, this.time) && this.field.lineOfSight(this.camera.position, ship.flight.position);
  /** Whether the own ship's sensors see a ship past the asteroids (and through the haze, see world/air), for the radar. */
  private readonly sensed = (ship: Ship) => detectable(ship, this.subject().flight.position, this.time) && this.field.lineOfSight(this.subject().flight.position, ship.flight.position, RADAR_DEPTH);
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
  /** The comets of the round (see roundComets), and of which room, round, arena and venue they are. */
  private comets: Comet[] = [];
  private cometsOfKey = '';
  /** The comet the flight computer has warned of while it comes, and the one whose shower flies now. */
  private cometCalled: Comet | null = null;
  /** The comet whose tail the own clone has been told is harmless, and whether it is in a tail now. */
  private tailCalled: Comet | null = null;
  private inTail = false;
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
  /** When the Hosts' tints are settled next (s, real time, see tintShips). */
  private tintedAt = 0;
  /** The tint the Host chose in the menu, an index into TINTS. */
  private tint = loadTint();
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
  /** Rocks the own clone broke so far (the campaign's mining missions count them). */
  private rocksBroken = 0;
  /** The own clone's beams that struck what stands on a rock, a rig or a buoy, so far (see SchoolContext.rigBeams). */
  private rigBeams = 0;
  /** What the running mission's pay is cut by, as its attempt stands (see SchoolContext.fine). */
  private missionFine = 0;
  /** The ratings the running mission's moments earned from style so far (see campaign/campaign, styleRatings). */
  private missionStyle = 0;
  /** The running mission is flown clean so far: from its first drill, not one clone lost (see campaign/campaign, medal). */
  private cleanRun = false;
  /** The running mission is flown untouched so far: not one hit on the own hull (see campaign/campaign, master). */
  private untouched = false;
  /** The own ship flies the campaign's hull this round (a mission's drills or a trial's round): its clones lost count as scars and cost their print (see cloneLost). */
  private campaignHull = false;
  /** The next own clone comes from PrintMe's back room (see campaign/campaign, BLACK_GLITCH); its hands tremble until `tremorUntil` (game time). */
  private blackPrinted = false;
  private tremorUntil = -Infinity;
  /** The running mission's time trial was flown within its gold time (see campaign/campaign, gold). */
  private goldRun = false;
  /** Where the own clone last broke a rock (the campaign's ore glints spring from it), and which piece it was. */
  private readonly brokenAt = new THREE.Vector3();
  private brokenId = '';
  /** The scene in person the clone stands in (see campaign/scenes), or null in the cockpit. */
  private stage: Stage | null = null;
  /** The scene in person the clone stands in, if any (its music, see SCENE_MUSIC). */
  private stageName: SceneName | null = null;
  /** The campaign's music as it stands: its track and since when (wall clock, s) it plays. */
  private mood = { key: '', since: 0 };
  /** Torpedoes of the own pilot that hit a ship, for the flight school's drill. */
  private torpedoesHit = 0;
  /** Dodges the own pilot has fired, for the flight school's drill. */
  private dodges = 0;
  /** The flight school's line to its marker (see lineTo). */
  private schoolLine: { line: RacingLine; next: number; to: THREE.Vector3 } | null = null;
  /** Target drone of the flight school. */
  private drone: Ship | null = null;
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
  /** Counts frames on the medium tier, where shadows are still on but a device may be weak (see paint): the sun's shadow map is refreshed only every other one, since what casts it barely moves between two frames. */
  private shadowFrame = 0;
  private readonly glitch = new Glitch();
  private readonly datamosh = new Datamosh(this.camera);
  private readonly bloom = new Bloom(new THREE.Vector2(256, 256), 0.6, 0.4, BLOOM_THRESHOLD);
  /** The picture's quality: the rung of the ladder, the governor, the Host's choice (see view/graphics). */
  readonly graphics: Graphics;
  /**
   * What the benchmark (bench.ts) switches off, or for the occasional effects on, one at a
   * time, to see what each costs; empty while the game is played.
   */
  private readonly bench = new Set<BenchFeature>();
  /** The benchmark's camera: it flies a fixed path instead of following a ship (see bench.ts). */
  benchCamera: ((camera: THREE.PerspectiveCamera) => void) | null = null;
  /** The frame's own work (ms): script, simulation and the draw calls' submission. */
  lastFrameMs = 0;
  /** The racing line to the next gate. */
  private readonly guide = new GuideLine();
  /** The reference plane's grid and the drop lines to it (see orient). */
  private readonly plane = new ReferencePlane();
  /** The flight computer's lines in space (the reference plane, the orbit), drawn after the lens (see the composer). */
  private readonly hudScene = new THREE.Scene();
  /** The orbit the readout sees, drawn into space (see view/orbitpath). */
  private readonly orbitPath = new OrbitPath();
  /** The sun as a fixed reference: always in the same direction, far beyond the arena. */
  private readonly sunReference: Reference = { glyph: 'sun', label: msg('Sun'), position: new THREE.Vector3(), distance: false };
  /** The bases of Capture the Flag and the President's battleship as fixed references. */
  private readonly baseReferences: Reference[] = [
    { glyph: 'base', label: msg('Orange base'), position: new THREE.Vector3(), distance: true },
    { glyph: 'base', label: msg('Blue base'), position: new THREE.Vector3(), distance: true },
  ];
  private readonly fleetReference: Reference = { glyph: 'battleship', label: msg('Battleship'), position: new THREE.Vector3(), distance: true };
  /** The arena's own fixed references, its center among them (see referencesOf). */
  private arenaReferences: Reference[] = referencesOf(DEFAULT_ARENA);
  /** The fixed references the HUD marks this frame (see orient). */
  private readonly shownReferences: Reference[] = [];
  /** The hooks out, by the ship that fired them, and their cables (see game/hook); when the own hook is ready again, and whether it was held last frame. */
  private readonly tethers = new Map<Ship, Tether>();
  private readonly cables = new Cables();
  private hookReadyAt = 0;
  private hookHeld = false;
  /** The own ship was let go by its hook: until then the flight computer turns it onto its new course (see FLING_SECONDS). */
  private flungUntil = 0;
  /** The own laps in a race, against the best lap of the arena. */
  private laps: LapTimer | null = null;
  private readonly radio: Radio;
  /** The stadium on Earth, heard through the broadcast (see Crowd). */
  private readonly crowd: Crowd;
  /** The flight computer's voice: reads out what the screen shows. */
  private readonly speaker: Speaker;
  /** Nicole's briefings and tips in real rounds. */
  private readonly coach = new Coach();
  /** The own pilot's grudges, for its big moments. */
  private readonly moments = new Moments();
  /** The kill streaks of the ships this browser runs, for their bonus and the own pilot's moments. */
  private readonly streaks = new Streaks();
  /** The development log (see devlog.ts): `game.log` in the console; null in production. */
  readonly log = devlog;
  /** The input recorder (see recorder.ts): `game.recorder` in the console; null in production. */
  readonly recorder = recorder;
  /** What the flight computer flew the own ship by in the last step, for the recorder. */
  private flightMode: FlightMode = 'dead';
  private recording: InputFrame | null = null;
  /** The rings of the round (see Bot.rings). */
  private rings: Ring[] = [];
  /** The race's gate a ship touched last (see touchesRing), -1 for none: where a gate crash happened, for the log. */
  private gateStruck = -1;
  /** The impact warning is on (the flight school watches it). */
  private impactAhead = false;
  /** The flight school's sparring bot, and whether it may fire. */
  private sparring: { bot: Bot; armed: boolean } | null = null;
  /** A drill's flock (see SchoolContext.flock): ships held where the drill puts them, flying no will of their own (the Parade's other new Hosts' clones). */
  private flockShips: Ship[] = [];
  /** A mission's wingman (see SchoolContext.wingman): a bot on the Host's side, ALLY_TEAM, no clone after its death. */
  private wingman: Bot | null = null;
  /**
   * A mission's raiders at a target (see campaign/missions): the Saw Brothers sawing at a rig
   * (`rock` the rock it stands on), or scrappers at an ore barge (no rock: the hull the drill set
   * out), or guards of a hull (the Tallymen at their tug), who fight every ship they see, or the
   * Loose at a convoy of ice tugs (`hooks`), whose shots at it are harpoons; their bots, the
   * target's middle (moved with it), how far off it they hold, their hits on it so far; with
   * `spares`, they never finish a clone (see SPARED_HULL).
   */
  private jumpers: { bots: Bot[]; rock: string | null; rig: THREE.Vector3; hold: number; hits: number; guard: boolean; hooks: boolean; spares: boolean; blanks: boolean } | null = null;
  /**
   * A mission's race (see campaign/missions, The Peak Run): its rival bots, the rings and their
   * facings and the radius of their openings, the racing line round them, the laps; each rival's rings passed and the side of its
   * next ring's plane it was on; the rivals that finished.
   */
  private racers: { bots: Bot[]; rings: THREE.Vector3[]; normals: THREE.Vector3[]; radius: number; line: RacingLine; laps: number; passed: number[]; sides: number[]; finished: number } | null = null;
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // draw calls and triangles count for the whole frame, all passes together (see paint)
    this.renderer.info.autoReset = false;
    container.append(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    // the scene's depth stays readable, so the black hole's lens bends only what lies behind it
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) target.depthTexture = new THREE.DepthTexture(1, 1);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(this.lensing.pass);
    // the flight computer's lines in space go straight into the display, after the lens: it bends
    // the picture of space, never the HUD (they are drawn over everything, so they need no depth)
    const hud = new RenderPass(this.hudScene, this.camera);
    hud.clear = false;
    this.composer.addPass(hud);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.datamosh);
    this.composer.addPass(this.glitch.pass);
    this.glitch.onStatic = (strength) => this.sound.crackle(strength);
    this.radio = new Radio(sound.context, sound.headset, (song) => this.announceSong(song), (spoken, delay) => this.subtitle(spoken, delay));
    this.crowd = new Crowd(sound.context, this.radio.input);
    this.speaker = new Speaker(sound.context, sound.headset);
    this.speaker.prepare();

    this.scene.background = this.background;
    // the haze of an arena's air goes into the shaders before any compiles (see view/haze)
    installHaze();
    this.field = new AsteroidField(assets.fieldSets);
    this.belt = new Belt(assets.belt.near, assets.belt.impostor);
    this.landmarks = new Landmarks(assets.planets);
    this.space.setStarmap(assets.sky);
    this.graphics = new Graphics(this.renderer, this.bloom, this.space, this.field, this.belt, this.plane, this.landmarks, this.mining, this.lensing, () => this.resize());
    this.effects = new Effects(assets.textures);
    this.reentry = new Reentry(this.effects);
    // the kill cam fires the beams of its replay in effects of their own
    this.replayEffects = new Effects(assets.textures);
    this.replayEffects.group.visible = false;
    this.scene.add(this.replayEffects.group);
    this.killcam = new KillCam(this.replayEffects);
    this.torpedoes = new Torpedoes(this.effects);
    this.decoys = new Decoys(assets.textures.glow);
    this.scene.add(this.torpedoes.group, this.decoys.group, this.probes.group, this.guide.ribbon, this.cables.group, this.cometView.root, this.hunt.group);
    this.hudScene.add(this.plane.group, this.orbitPath.line);
    this.scene.add(this.space.sky, this.space.dust, this.space.streaks, this.arena.mesh, this.belt.group, this.landmarks.group, this.mining.group, this.flare.mesh, this.space.lights, this.field.group, this.wrecks.group, this.effects.group, this.reentry.group);
    for (let i = 0; i < ENGINE_LIGHTS; i++) {
      const light = new THREE.PointLight(0x88bbff, 0, 2500, 2);
      this.engineLights.push(light);
      this.scene.add(light);
    }

    this.input = new Input(this.renderer.domElement);
    this.input.onAction((action) => this.onAction(action));
    this.readEarned();
    // another tab changed what is kept, or the Host did by hand (no event in the own tab: looked at every two seconds)
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key === HANGAR_KEY || event.key === SCHOOL_DONE_KEY) this.readEarned();
    });
    setInterval(() => this.watchEarned(), EARNED_WATCH_MS);
    this.bindMenu();
    // the controls and the pause screen name the keys as the Host's keyboard prints them
    void learnKeyboardLayout().then(() => {
      for (const key of document.querySelectorAll<HTMLElement>('.controls dt, #pause kbd')) key.textContent = keyLabel(key.textContent ?? '');
    });

    window.addEventListener('resize', () => this.resize());
    // a hidden tab runs no frames: a solo round pauses instead of running out unseen
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      // a hidden tab draws no frames, so nothing would turn the drive's roar, the air's wind and
      // plasma or the stadium down: an online round runs on without the picture, and they fall
      // silent until the tab is back (the next frame sounds them again)
      this.sound.setEngine(0, 0);
      this.quietAir();
      this.crowd.air(false);
      if (this.state === 'playing' && !this.online) this.pause();
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
    // the Host's tint, one of the palette's
    $('tints').append(
      ...TINTS.map((tint, index) => {
        const button = Object.assign(document.createElement('button'), { type: 'button', title: t(tint.name) });
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-label', t(tint.name));
        button.style.setProperty('--tint', tint.hex);
        button.addEventListener('click', () => {
          this.tint = index;
          saveTint(index);
          this.renderTints();
        });
        return button;
      }),
    );
    // the languages, each named in itself
    $('languages').append(
      ...LOCALES.map((locale) => {
        const button = Object.assign(document.createElement('button'), { type: 'button', textContent: LOCALE_NAMES[locale], lang: locale });
        button.classList.toggle('selected', locale === currentLocale());
        button.addEventListener('click', () => chooseLocale(locale));
        return button;
      }),
    );
    // the picture's quality: auto (the governor) or a tier pinned by hand
    $('quality').append(
      ...(['auto', ...TIERS] as const).map((choice) => {
        const button = Object.assign(document.createElement('button'), { type: 'button' });
        button.dataset.value = choice;
        button.addEventListener('click', () => {
          this.graphics.choose(choice);
          this.showQuality();
        });
        return button;
      }),
    );
    this.showQuality();
    // the ship on show above the logo, and the hangar
    this.showcase = new Showcase($<HTMLCanvasElement>('crest'), this.assets);
    this.graphics.setShowcase(this.showcase);
    $('ship-prev').addEventListener('click', () => this.turnShowcase(-1));
    $('ship-next').addEventListener('click', () => this.turnShowcase(1));
    $('hangar').addEventListener('click', () => this.showHangar(true));
    $('hangar-back').addEventListener('click', () => this.showHangar(false));
    this.renderShowcase();
    // the modes to choose from, for a solo round and for a room, each a button with its name
    for (const [choice, modes] of [['solo-mode', ROUND_MODES], ['room-mode', [...ROUND_MODES, 'mixed']], ['new-round-mode', [...ROUND_MODES, 'mixed']]] as const) {
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
    // the campaign is in the making: playable on the address with ?campaign while it is built
    if (new URLSearchParams(location.search).has('campaign')) $<HTMLButtonElement>('campaign').disabled = false;
    $('campaign').addEventListener('click', () => this.showBoard(true));
    $('board-back').addEventListener('click', () => this.showBoard(false));
    $('gullet-leave').addEventListener('click', () => this.leaveGullet());
    // Nicole's voice clean or through the old board's crackle, once her own is back (see Campaign.crackle)
    $('board-voice').addEventListener('click', () => {
      this.keepCampaign((campaign) => (campaign.crackle = !campaign.crackle));
      this.showVoiceChoice();
    });
    // PrintMe's counter or its back room for the next clones (see campaign/campaign, PRINT_PRICE)
    $('board-print').addEventListener('click', () => {
      this.keepCampaign((campaign) => (campaign.blackPrint = !campaign.blackPrint));
      this.showPrintChoice();
    });
    $('room-create').addEventListener('click', () => this.createTournament());
    $('tournaments-back').addEventListener('click', () => this.showTournaments(false));
    $('push-toggle').addEventListener('click', () => void this.togglePush());
    for (let n = 1; n <= MAX_FROM; n++) {
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: String(n) });
      button.dataset.from = String(n);
      button.addEventListener('click', async () => {
        await setPushFrom(n, currentLocale());
        await this.renderPush();
      });
      $('push-from-choice').append(button);
    }
    // a pause of the notifications: an hour, until tomorrow morning, or none any more
    const pause = (until: () => number) => async () => {
      await pausePush(until());
      await this.renderPush();
    };
    $('push-pause-hour').addEventListener('click', pause(() => snoozeUntil('hour', Date.now())));
    $('push-pause-morning').addEventListener('click', pause(() => snoozeUntil('morning', Date.now())));
    $('push-resume').addEventListener('click', pause(() => 0));
    // a notification of an open tournament leads here
    if (location.hash === '#tournaments') {
      history.replaceState(null, '', location.pathname + location.search);
      queueMicrotask(() => this.showTournaments(true));
    }
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
    this.buildControlsSheet();
    this.placePadControls();
    window.matchMedia(TITLE_WIDE).addEventListener('change', () => this.placePadControls());
    this.buildNewRound();
    $('again').addEventListener('click', () => this.showMenu());
    $('invite').addEventListener('click', () => void this.share.share());
    $('radio').addEventListener('click', () => this.toggleRadio());
    // the radio page opens in this tab, so the game is left and only the radio page plays; a
    // click on the title while a round is flown (a shot aimed into the corner) pauses the round
    // instead, and from the pause menu the click leaves
    $('now-playing-link').addEventListener('click', (event) => {
      if (this.state !== 'playing' || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      this.pause();
    });
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
    return this.coursesDone.has('basic') ? 'start' : 'school';
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
        keepSchoolSteps(steps);
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
    const done = this.coursesDone;
    return SCHOOL_COURSES.find((course) => !done.has(course)) ?? 'basic';
  }

  private startSchool(course: SchoolCourse) {
    this.schoolCourse = course;
    this.mission = null;
    this.startRound('school');
  }

  /**
   * What the controls sheet shows grey and struck through: what the ship flown now lacks (in the
   * menu, the ship picked as the hangar fits it): gear not bought, or what the campaign's hull is
   * not fitted with yet.
   */
  private lacking(): Set<Command> {
    const me = this.state !== 'menu' ? this.me : null;
    const perks = me?.perks ?? perksOf(this.hangar, this.selectedShip, false);
    const hook = me ? this.hookCarried(me) : perks.hook;
    const missing: [Command, boolean][] = [
      ['fire', !perks.laser],
      ['dodge', !perks.dodge],
      ['overdrive', !perks.overdrive],
      ['torpedo', TORPEDOES + perks.torpedoes <= 0],
      ['hook', !hook],
      ['selfDestruct', !perks.selfDestruct],
    ];
    return new Set(missing.filter(([, lacks]) => lacks).map(([command]) => command));
  }

  /** The campaign's button says where the story stands: the next mission and the wallet, or that all that is built is flown. */
  private showCampaign() {
    const button = $<HTMLButtonElement>('campaign');
    if (button.disabled) return;
    const next = nextMission(this.campaign);
    const note = button.querySelector<HTMLElement>('.mode-note')!;
    const where = next && { mission: t(next.name), coins: coinText(this.campaign.coins), bond: coinText(this.campaign.bond), rank: t(rankOf(this.campaign.ratings)) };
    note.textContent = where
      ? this.campaign.held
        ? t('Next: {mission} · {coins} ☉ · debt held · {rank}', where)
        : t('Next: {mission} · {coins} ☉ · you owe {bond} ☉ · {rank}', where)
      : t('All that is built is flown. More of the story is in the making.');
  }

  /** A ship has the hook: gear bought in the hangar, or lent by the flight school for its drills (never in a mission of the campaign, whose ship has what it was fitted with). */
  private hookCarried(ship: Ship): boolean {
    return ship.perks.hook || (!!this.school && !this.mission);
  }

  /**
   * The campaign's job board, where the story stands between its jobs: the place, the wallet,
   * the debt and the rank, the next job (Enter takes it), the jobs done to fly again for nothing,
   * and what the hull and Nicole have come to.
   */
  private showBoard(open: boolean) {
    this.atBoard = open;
    $('menu').hidden = open || this.state !== 'menu';
    $('board').hidden = !open;
    // Pim's pad: Lot 7731 stands on it as far as it is fitted while the board is open, the ship of the Games again after
    if (!open) {
      this.renderShowcase();
      return;
    }
    const campaign = this.campaign;
    this.showcase?.show('magpie', hullOf(campaign), false);
    const next = nextMission(campaign);
    // where the next job goes on: the drill reached in it, as the Host comes back to it
    const place = arenaById(next?.drills[Math.min(this.campaign.step, next.drills.length - 1)].arena ?? next?.drills[0].arena ?? [...MISSIONS].reverse().find(keepsStep)?.drills[0].arena ?? '');
    $('board-place').textContent = place ? t(place.name) : '';
    const wallet = { coins: coinText(campaign.coins), bond: coinText(campaign.bond), rank: t(rankOf(campaign.ratings)) };
    $('board-wallet').textContent = campaign.held ? t('{coins} ☉ in the wallet · your debt of {bond} ☉ is held, nobody takes a cut · {rank}', wallet) : t('{coins} ☉ in the wallet · you owe {bond} ☉ · {rank}', wallet);
    const job = (mission: Mission, note: string) => {
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'mode' });
      button.innerHTML = `<span class="mode-name"><span class="mode-label"></span></span><span class="mode-note"></span>`;
      button.querySelector('.mode-label')!.textContent = t(mission.name);
      button.querySelector('.mode-note')!.textContent = note;
      button.addEventListener('click', () => this.startMission(mission));
      return button;
    };
    const goldNote = (mission: Mission) => {
      const time = goldOf(mission);
      return time === null ? '' : ` ${t('Gold time: {seconds} s, for {bonus} ☉.', { seconds: time, bonus: coinText(Math.round(mission.pay * MEDAL_SHARE)) })}`;
    };
    const pays = (mission: Mission) => (mission.pay ? t('Pays {pay} ☉ before the yard’s cut, {ratings} ratings.', { pay: coinText(mission.pay), ratings: ratingsOf(mission, campaign) }) + goldNote(mission) : t('Pays nothing.'));
    $('board-next').replaceChildren(next ? job(next, campaign.step ? `${pays(next)} ${t('Taken up where you left it.')}` : pays(next)) : Object.assign(document.createElement('p'), { className: 'plate-note', textContent: t('All that is built is flown. More of the story is in the making.') }));
    // the bars the Host can go to in person, whenever and however often it likes (see Mission.bar)
    const inPerson = bars(campaign);
    $('board-bar-label').hidden = !inPerson.length;
    $('board-bar').replaceChildren(...inPerson.map((mission) => job(mission, t(mission.bar!))));
    const trips = sideTrips(campaign);
    $('board-side-label').hidden = !trips.length;
    // a side job names its place, for every place has its own
    const placeOf = (mission: Mission) => t(arenaById(sideJobAt(mission)!)!.name);
    const tripNote = (mission: Mission) =>
      mission.courier
        ? `${t('Six beacons in order against the clock.')} ${pays(mission)}`
        : mission.ambush
          ? `${t('Three bandits on a client’s lane.')} ${pays(mission)}`
          : mission.mining
            ? `${t('Rock broken and its ore flown in against the clock.')} ${pays(mission)}`
            : mission.bounty
              ? `${t('Wanted: {name}, and friends.', { name: wantedName(mission) })} ${pays(mission)}`
              : mission.smuggle
                ? `${t('Cargo past two Ministry patrols, running silent.')} ${pays(mission)}`
                : `${pays(mission)} ${t('A side trip: fly it whenever you like.')}`;
    // the side trips first, then the side jobs place by place, each place under its name
    const places = [...new Set(trips.map((mission) => sideJobAt(mission)).filter((place) => place !== null))];
    $('board-side').replaceChildren(
      ...trips.filter((mission) => !sideJobAt(mission)).map((mission) => job(mission, tripNote(mission))),
      ...places.map((place) => {
        const group = Object.assign(document.createElement('div'), { className: 'board-group' });
        group.append(Object.assign(document.createElement('p'), { className: 'plate-label', textContent: t('At {place}:', { place: t(arenaById(place)!.name) }) }), ...trips.filter((mission) => sideJobAt(mission) === place).map((mission) => job(mission, tripNote(mission))));
        return group;
      }),
    );
    // a free flight at every place the story has reached, with what it still hides; and Patience's galley once she has taken the Host aboard
    const reached = HUNT_PLACES.filter((place) => {
      const first = firstJobAt(place);
      return !!first && campaign.done.includes(first.id);
    });
    const hidden = (place: HuntPlace) => {
      const tags = { n: this.tagsAt(place), total: TAGS_PER_PLACE };
      return campaign.chips.includes(place) ? t('Black boxes {n}/{total} · chip found', tags) : t('Black boxes {n}/{total} · chip not found', tags);
    };
    const visits = campaign.done.includes('rheasilvia') ? [job(GALLEY_VISIT, t('Climb up and look round: the shelf keeps what the road has left, the rail a tag for every black box found.'))] : [];
    $('board-free-label').hidden = !reached.length;
    $('board-free').replaceChildren(
      ...reached.map((place) => {
        const button = job(freeFlight(place), `${hidden(place)}. ${t('No clock, nothing to fail; the pause menu brings you back.')}`);
        button.querySelector('.mode-label')!.textContent = t('Free flight: {place}', { place: t(arenaById(place)!.name) });
        return button;
      }),
      ...visits,
    );
    $('board-finds').hidden = !reached.length;
    $('board-finds').textContent = t('Black boxes {n}/{total} · data chips {chips}/{places}', { n: campaign.tags.length, total: TAG_IDS.length, chips: campaign.chips.length, places: HUNT_PLACES.length });
    const done = MISSIONS.filter((mission) => campaign.done.includes(mission.id));
    $('board-done-label').hidden = !done.length;
    const again = (mission: Mission) => {
      const bonus = coinText(Math.round(mission.pay * MEDAL_SHARE));
      // a side job's client pays again; any other job only its medals
      const note = sideJobAt(mission)
        ? `${t('Flown again, the client pays {fee} ☉.', { fee: coinText(Math.round(mission.pay * AGAIN_SHARE)) })} ${campaign.medals.includes(mission.id) ? t('★ Medal: flown clean.') : t('Its medal: {bonus} ☉ for a clean run, not one clone lost.', { bonus })}`
        : !hasMedal(mission)
          ? t('Flown again, it pays nothing.')
          : campaign.medals.includes(mission.id)
            ? t('Flown again, it pays nothing. ★ Medal: flown clean.')
            : t('Flown again, it pays only its medal: {bonus} ☉ for a clean run, not one clone lost.', { bonus });
      const mastery = !hasMedal(mission) ? '' : campaign.masters.includes(mission.id) ? ` ${t('★ Master: clean, untouched and in time.')}` : ` ${t('Master: {bonus} ☉ for a run clean, untouched and in time.', { bonus })}`;
      const time = goldOf(mission);
      if (time === null) return note + mastery;
      return (campaign.golds.includes(mission.id) ? `${note} ${t('★ Gold time: {seconds} s, flown.', { seconds: time })}` : `${note}${goldNote(mission)}`) + mastery;
    };
    $('board-done').replaceChildren(...done.map((mission) => job(mission, sideJobAt(mission) ? `${t('At {place}.', { place: placeOf(mission) })} ${again(mission)}` : again(mission))));
    const parts = campaign.parts.map((part) => t(PART_NAMES[part]));
    const modules = campaign.modules.map((module) => t(MODULE_NAMES[module]));
    $('board-ship').textContent = `${parts.length ? t('Fitted: {parts}.', { parts: parts.join(', ') }) : t('Nothing fitted yet: no laser, no torpedoes, a cracked drive bell, one fin.')} ${modules.length ? t('Nicole’s modules: {modules}.', { modules: modules.join(', ') }) : t('Nicole is a salvaged unit, none of her modules installed.')}`;
    this.showRecord();
    this.showCounter();
    this.showPrintChoice();
    this.showVoiceChoice();
    (next ? $('board-next').querySelector('button')! : $('board-back')).focus();
  }

  /** The job board's scars and standing: what the Host learned dying, and who counts the Host as theirs (see campaign/scars, campaign/standing). */
  private showRecord() {
    const campaign = this.campaign;
    const scars = SCAR_KINDS.filter((kind) => scarTier(campaign.scars[kind])).map((kind) => this.scarText(kind, scarTier(campaign.scars[kind])));
    const standing = PEOPLES.filter((people) => standingTier(campaign.standing[people])).map((people) => t('{people}: {tier}', { people: t(PEOPLE_NAMES[people]), tier: t(STANDING_NAMES[standingTier(campaign.standing[people])]) }));
    $('board-record').hidden = !scars.length && !standing.length;
    $('board-record').textContent = [...scars, standing.length ? t('Standing: {list}.', { list: standing.join(', ') }) : ''].filter(Boolean).join(' ');
  }

  /** Rask's counter on the job board: the racks' parts on offer and the peoples' own, each with what it changes and its price (see campaign/salvage). */
  private showCounter() {
    const campaign = this.campaign;
    const offer = counterOf(campaign);
    $('board-counter-label').hidden = !offer.length && !campaign.salvage.length;
    const fitted = campaign.salvage.map((id) => salvageById(id)!);
    const part = (salvage: Salvage) => {
      const button = Object.assign(document.createElement('button'), { type: 'button', className: 'mode' });
      button.innerHTML = `<span class="mode-name"><span class="mode-label"></span></span><span class="mode-note"></span>`;
      button.querySelector('.mode-label')!.textContent = t(salvage.name);
      const replaces = fitted.find((other) => other.slot === salvage.slot);
      button.querySelector('.mode-note')!.textContent = [t(salvage.story), this.salvageChange(salvage), t('{price} ☉ from the wallet.', { price: coinText(salvage.price) }), replaces ? t('Replaces {part}.', { part: t(replaces.name) }) : ''].filter(Boolean).join(' ');
      button.disabled = campaign.coins < salvage.price;
      button.addEventListener('click', () => {
        let bought = false;
        this.keepCampaign((kept) => (bought = buySalvage(kept, salvage.id)));
        if (bought) this.showBoard(true);
      });
      return button;
    };
    const holding = fitted.length ? Object.assign(document.createElement('p'), { className: 'plate-note', textContent: t('From the racks: {parts}.', { parts: fitted.map((salvage) => t(salvage.name)).join(', ') }) }) : null;
    $('board-counter').replaceChildren(...offer.map(part), ...(holding ? [holding] : []));
  }

  /** What a part off Rask's counter changes, in words: each share as a percentage, plus for the better, minus for the worse. */
  private salvageChange(salvage: Salvage): string {
    const words = { laserReach: msg('laser reach'), laserHeat: msg('laser heat'), drive: msg('drive'), thrusters: msg('thrusters'), damage: msg('damage taken'), cooling: msg('cooling'), torpedoes: msg('torpedoes') } as const;
    return (Object.entries(salvage.change) as [keyof typeof words, number][])
      .map(([key, value]) => (key === 'torpedoes' ? t('{sign}{n} {what}', { sign: value > 0 ? '+' : '−', n: Math.abs(value), what: t(words[key]) }) : t('{sign}{n} % {what}', { sign: value > 0 ? '+' : '−', n: Math.round(Math.abs(value) * 100), what: t(words[key]) })))
      .join(', ');
  }

  /** The job board's choice of where the next clones are printed (see Campaign.blackPrint). */
  private showPrintChoice() {
    $('board-print').textContent = this.campaign.blackPrint
      ? t('Prints: PrintMe’s back room, {price} ☉ a clone, booted ragged', { price: BLACK_PRINT_PRICE })
      : t('Prints: PrintMe’s counter, {price} ☉ a clone', { price: PRINT_PRICE });
  }

  /** The job board's choice of Nicole's voice, once her own is back (see Campaign.crackle). */
  private showVoiceChoice() {
    const button = $('board-voice');
    button.hidden = !this.campaign.modules.includes('voice');
    button.textContent = this.campaign.crackle ? t('Nicole’s voice: through the old board’s crackle') : t('Nicole’s voice: her own, clean');
  }

  /**
   * Flies a mission of the campaign: the next one from the drill the Host reached in it, or one
   * done before from its start, for nothing (see campaign/campaign); on the flight school's
   * machinery.
   */
  private startMission(mission = nextMission(this.campaign)) {
    if (!mission) return;
    this.flyingAgain = this.campaign.done.includes(mission.id);
    if (this.atBoard) this.showBoard(false);
    // the people who call in, fetched ahead of their first call
    for (const who of Object.keys(CAST_NAMES) as Cast[]) loadBust(who).catch((error) => console.warn('Bust failed', error));
    this.mission = mission;
    // a bet in Kesh's book on another job is lost the moment a job is taken (see campaign/gullet)
    if (isJob(mission) && this.campaign.bet && this.campaign.bet.mission !== mission.id) this.keepCampaign((campaign) => settleBet(campaign, mission, false));
    // clean only from its first drill; what the job came to before the Host left it holds (see Campaign.run)
    this.cleanRun = this.missionStep() === 0;
    this.untouched = this.cleanRun;
    const run = this.missionStep() > 0 ? this.campaign.run : freshRun();
    this.missionFine = run.fine;
    this.goldRun = run.gold;
    this.missionStyle = run.style;
    this.trialOf = null;
    this.startRound('school');
  }

  /**
   * A trial's round (see Mission.trial): a solo round of its mode in its arena against the Games'
   * default rivals, in the campaign's hull; the Host's own choice of a solo round is left as it was.
   */
  private startTrial(mission: Mission) {
    // a round of the Games hides no finds: the last place's are taken out of the scene
    this.hunt.leave();
    const trial = mission.trial!;
    const chosen = this.solo;
    this.trialOf = mission;
    this.schoolMark = this.schoolTrack = null;
    this.solo = { mode: trial.mode, arena: trial.arena, rivals: [...SOLO_DEFAULT.rivals] };
    this.startRound('solo');
    this.solo = chosen;
  }

  /**
   * A trial's round over (see Mission.trial): flown to its end and passed, the mission is done and
   * paid as any other (nothing when flown again); else it waits on the job board to be flown again.
   * What the results screen says of it.
   */
  private judgeTrial(): string {
    const mission = this.trialOf!;
    const trial = mission.trial!;
    this.trialOf = this.mission = null;
    const me = this.me!;
    const passed = this.time >= this.roundEndsAt && trialPassed(trial, { place: this.standings().indexOf(me) + 1, sideLeads: !!this.flags && this.flags.leading === me.team, battleshipDown: !!this.fleet?.down });
    if (!passed) return t('{mission} failed. It waits on the job board.', { mission: t(mission.name) });
    if (this.flyingAgain) {
      this.flyingAgain = false;
      return t('{mission} done.', { mission: t(mission.name) });
    }
    let paid: ReturnType<typeof complete> = { kept: 0, cut: 0, ratings: 0, rank: null, standing: null };
    this.keepCampaign((campaign) => (paid = complete(campaign, mission, 0)));
    const done = t('{mission} done: {kept} ☉ for you, {ratings} ratings.', { mission: t(mission.name), kept: coinText(paid.kept), ratings: paid.ratings });
    return paid.rank ? `${done} ${t('The feeds rank you: {rank}.', { rank: t(paid.rank) })}` : done;
  }

  /** The Host's stick through a back-room clone's trembling hands (see campaign/campaign, BLACK_SHAKE). */
  private tremble(read: Readonly<Controls>): Controls {
    const shake = () => (Math.random() * 2 - 1) * BLACK_SHAKE;
    return { ...read, yaw: Math.max(-1, Math.min(1, read.yaw + shake())), pitch: Math.max(-1, Math.min(1, read.pitch + shake())) };
  }

  /**
   * The campaign's own clone lost (see campaign/scars, campaign/campaign printClone): the death
   * counted towards its scar, the next clone's print paid, the hull outfitted with what the Host
   * learned, and a back-room print booted ragged when it comes.
   */
  private cloneLost(cause: DeathCause, what: string | undefined) {
    let scarred: ReturnType<typeof scar> = null;
    let print = { paid: 0, owed: 0 };
    // the Pit's clone is the night's one: none printed after it (see endPit)
    const printing = !this.mission?.pit;
    this.keepCampaign((campaign) => {
      scarred = scar(campaign.scars, scarOf(cause, what));
      if (printing) print = printClone(campaign);
    });
    this.blackPrinted = printing && this.campaign.blackPrint;
    this.me!.outfit(hullOf(this.campaign));
    const printed = !printing ? '' : print.owed ? t('Next clone printed: {paid} ☉ paid, {owed} ☉ on the debt.', { paid: coinText(print.paid), owed: coinText(print.owed) }) : t('Next clone printed: {paid} ☉.', { paid: coinText(print.paid) });
    if (!scarred) {
      if (printed) this.hud.flashMessage(this.time, printed, 3);
      return;
    }
    const { kind, tier } = scarred as NonNullable<ReturnType<typeof scar>>;
    this.speaker.say(CAMPAIGN.scar);
    this.hud.flashMessage(this.time, `${this.scarText(kind, tier)} ${printed}`.trim(), 5);
  }

  /** A scar at its tier in words: its name, the tier and what it does (see campaign/scars). */
  private scarText(kind: (typeof SCAR_KINDS)[number], tier: number): string {
    return t('Scar: {scar} {tier}, {effect}.', { scar: t(SCAR_NAMES[kind]), tier: ROMAN[tier], effect: t(SCAR_EFFECTS[kind], { ...scarNumbers(kind, tier), seconds: coinText(scarNumbers(kind, tier).seconds) }) });
  }

  /** A night in the Pit over (see campaign/gullet, pitNight): paid, its record kept, and the board again. */
  private endPit() {
    let night = { purse: 0, record: false };
    const waves = pitWaves();
    this.keepCampaign((campaign) => (night = pitNight(campaign, waves)));
    if (night.record) this.speaker.say(KESH.pitRecord);
    this.mission = null;
    this.schoolMark = this.schoolTrack = null;
    this.showMenu();
    this.showBoard(true);
    this.notice(night.record ? t('The Pit: {waves} waves, a new record. {purse} ☉ from Kesh’s purse.', { waves, purse: coinText(night.purse) }) : t('The Pit: {waves} waves. {purse} ☉ from Kesh’s purse.', { waves, purse: coinText(night.purse) }));
  }

  /** What the screen says of a master's run (see campaign/campaign, master) and its bonus as kept. */
  private masterText(bonus: number): string {
    return t('Master: clean, untouched and in time. {bonus} ☉ bonus.', { bonus: coinText(bonus) });
  }

  /** What the screen says of a people's standing newly reached (see campaign/standing), or nothing. */
  private standingText(reached: { people: (typeof PEOPLES)[number]; tier: number } | null): string {
    return reached ? t('{people} count you as {tier}.', { people: t(PEOPLE_NAMES[reached.people]), tier: t(STANDING_NAMES[reached.tier]) }) : '';
  }

  /** What the screen says of a medal won (see campaign/campaign, medal): the clean run and its bonus as kept. */
  private medalText(bonus: number): string {
    return t('Medal: flown clean, not one clone lost. {bonus} ☉ bonus.', { bonus: coinText(bonus) });
  }

  /** What the screen says of a gold time won (see campaign/campaign, gold): its bonus as kept. */
  private goldText(bonus: number): string {
    return t('Gold time. {bonus} ☉ bonus.', { bonus: coinText(bonus) });
  }

  /** The drill a mission of the campaign starts at: where the Host left the story's next one, a mission flown again from its start. */
  private missionStep(): number {
    return this.flyingAgain || (this.mission && !keepsStep(this.mission)) ? 0 : this.campaign.step;
  }

  /**
   * The flight school says where a Host left off in each course, with a way to start it over,
   * and a course once completed says so for good: a Host who made it through keeps the badge.
   * The menu's button sums it up.
   */
  private showSchoolProgress() {
    const steps = schoolSteps();
    const done = this.coursesDone;
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
        button(`${swatch(botTint(name)).outerHTML}${name}${skillScales(skillsOf(name))}`, () => {
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
      void this.renderPush();
    }
    this.updateLobby();
  }

  /** The plate's notification button: shown only where the browser and the server can do it, saying what a press does. */
  private async renderPush() {
    this.pushKey ??= await pushKey();
    const button = $('push-toggle');
    button.hidden = $('push-note').hidden = !this.pushKey;
    if (!this.pushKey) return;
    const status = await pushStatus();
    const from = status?.from ?? null;
    const on = from !== null;
    const paused = on && status!.snoozed > Date.now() / 1000;
    $('push-paused').hidden = !paused;
    $('push-resume').hidden = !paused;
    if (paused) $('push-paused').textContent = t('Quiet until {time}', { time: new Date(status!.snoozed * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) });
    button.textContent = on ? t('Notifications on: stop them') : t('Notify me when a public tournament opens');
    button.setAttribute('aria-pressed', String(on));
    $('push-from').hidden = !on;
    for (const choice of $('push-from-choice').children) choice.classList.toggle('selected', (choice as HTMLElement).dataset.from === String(from));
  }

  private async togglePush() {
    if (!this.pushKey) return;
    const button = $<HTMLButtonElement>('push-toggle');
    button.disabled = true;
    if ((await pushStatus()) !== null) await unsubscribePush();
    else if (!(await subscribePush(this.pushKey, currentLocale()))) $('room-note').textContent = t('No notifications: this browser refused them.');
    button.disabled = false;
    await this.renderPush();
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
    this.openBeat.beat(announcing ? this.room!.code : null, performance.now());
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
    if (!announcing) {
      this.lobby.announce(null);
      return;
    }
    const listing = this.listing;
    listing.code = this.room!.code;
    listing.name = this.room!.name;
    listing.hosts = this.online!.pilots;
    listing.bots = this.room!.bots;
    listing.mode = this.room!.mode;
    listing.left = Number.isFinite(this.roundEndsAt) ? this.roundEndsAt - this.time : ROUND_SECONDS;
    this.lobby.announce(listing);
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
      // the creator's link is copied at once, to be sent to friends
      if (created && (await this.share.copy())) this.hud.flashMessage(this.time, t('Invite link copied. Send it to your friends.'), 3);
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

  /** A line in the menu for what went wrong; empty hides it. */
  private notice(text: string) {
    $('menu-notice').textContent = text;
    $('menu-notice').hidden = !text;
  }

  /**
   * A solo round of `mode` in `arena` (null: by chance) against the rivals chosen, started at
   * once, without the menu: what the browser tests and the balance runs start their rounds with,
   * so no click on a button decides which scenario runs.
   */
  playSolo(mode: RoundMode, arena: ArenaId | null) {
    this.solo = { ...this.solo, mode, arena };
    this.startRound('solo');
  }

  /**
   * The benchmark's round (see bench.ts): a solo round of `mode` in `arena` against the default
   * rivals, the Host's clone watching, so the bots fight and nothing ends the round early.
   */
  benchRound(arena: ArenaId, mode: RoundMode) {
    this.solo = { mode, arena, rivals: [...SOLO_DEFAULT.rivals] };
    this.startRound('solo');
    this.spectate(true);
  }

  /** Back to the menu, as the benchmark measures the title screen. */
  benchMenu() {
    this.showMenu();
  }

  /** The benchmark switches a feature off (or an occasional effect on, see BENCH_ON); `active` false restores it. */
  setBench(feature: BenchFeature, active: boolean) {
    if (active) this.bench.add(feature);
    else this.bench.delete(feature);
    const knobs: Partial<Record<BenchFeature, Partial<Look>>> = {
      bloom: { bloom: 0 },
      shadows: { shadows: 0 },
      lacquer: { lacquer: false },
      detail: { rocks: 0 },
      resolution: { pixelRatio: this.graphics.pixelRatio / 2 },
    };
    const knob = knobs[feature];
    if (knob) {
      const override = { ...this.graphics.override };
      for (const key of Object.keys(knob) as (keyof Look)[]) delete override[key];
      this.graphics.override = active ? { ...override, ...knob } : override;
      this.graphics.apply(true, true);
    }
    if (feature === 'audio') void (active ? this.sound.context.suspend() : this.sound.context.resume());
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
      if (distance < LOCK_RANGE && ship.flight.noseAngleTo(line) < 0.2) threat += 1;
      if (distance < LOCK_RANGE && other.flight.noseAngleTo(line.negate()) < 0.2) threat += ship.tailToward(line) ? 2 : 1;
    }
    return 20000 / (nearest + 2000) + threat + (1 - ship.hull / 100) + (this.course ? ship.gates / GATES : 0);
  }

  /**
   * Where the share button shares from: a running tournament shares its own link (on the page
   * the game runs on, with the room in the fragment), everything else the game.
   */
  private shareWhere(): ShareWhere {
    if (this.online && this.room) return { name: this.room.name, public: this.room.public, link: roomLink(this.room, `${location.origin}${location.pathname}${location.search}`) };
    if (this.state === 'menu') return this.choosingSchool ? 'school' : this.choosingSolo ? 'solo' : 'menu';
    return this.school ? 'school' : 'solo';
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
    // a kill of the own side he never lets pass: he scolds the killer
    if (killer && killer !== victim && killer.allyOf(victim)) {
      this.announce(ANNOUNCER_TEAM_KILL[(roll >>> 4) % ANNOUNCER_TEAM_KILL.length], killer);
      return;
    }
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
   * Nicole has the cockpit to herself; the campaign plays its music by situation (campaignMood),
   * each track from its start when the situation turns.
   */
  private musicCue(): MusicCue | null {
    if (this.school) {
      const mood = this.campaignMood();
      if (!mood || !this.mission) return null;
      // a data chip's track, once found, from its start to its end, unless a scene has music of its own
      const chip = this.chipTrack;
      if (chip && !this.stageName && wallClock() - chip.since < ROUND_SECONDS) return { title: chip.title, energy: 'round', elapsed: wallClock() - chip.since, roundLength: ROUND_SECONDS, voiceless: true };
      const title = this.stageName ? `${this.mission.name} · ${this.stageName}` : this.mission.name;
      const key = `${title}:${mood}`;
      if (key !== this.mood.key) this.mood = { key, since: wallClock() };
      const sound = PLACE_MUSIC[this.venue.id];
      return moodCue(mood, title, wallClock() - this.mood.since, ROUND_SECONDS, sound && (mood === 'fight' ? sound.fight : sound.calm));
    }
    const inRound = this.state === 'playing' || this.state === 'results' || (this.state === 'paused' && !!this.online);
    if (inRound && Number.isFinite(this.roundEndsAtWall)) {
      // a browser that started over plays on the round it was in until it hears the round again
      const round = this.roundId < 0 ? (this.rejoinedFrom ?? 0) : this.roundId;
      const seed = this.online ? mixSeed(textSeed(this.online.session.room), round) : this.soloSeed;
      return { title: titleFor(seed), energy: 'round', elapsed: ROUND_SECONDS - (this.roundEndsAtWall - this.roundClock()), roundLength: ROUND_SECONDS };
    }
    return { title: titleFor(LOUNGE_SEED), energy: 'lounge', elapsed: wallClock() - this.loungeEpoch, roundLength: ROUND_SECONDS };
  }

  /** The campaign's music now: a scene's, else the drill's, else its mission's (calm without); none in the flight school. */
  private campaignMood(): Mood | null {
    if (!this.mission || !this.school) return null;
    if (this.stageName) return SCENE_MUSIC[this.stageName];
    const drill = this.school.music;
    return drill === undefined ? (this.mission.music ?? 'calm') : drill;
  }

  /** A blow to the clone shakes the link to it: the picture breaks up, the radio drops out. */
  private linkHit(strength: number, seconds: number) {
    this.glitch.trigger(strength, seconds);
    this.radio.dropout(0.05 + 0.2 * strength);
  }

  /** The controls sheet's tabs (one per device), its close button and the pause menu's way to it. */
  private buildControlsSheet() {
    const tabs = $('quicksheet-tabs');
    for (const [device, name] of SHEET_TABS) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.dataset.device = device;
      tab.textContent = t(name);
      tab.addEventListener('click', () => this.showControlsSheet(true, device));
      tabs.append(tab);
    }
    $('quicksheet-close').addEventListener('click', () => this.showControlsSheet(false));
    $('pause-controls').addEventListener('click', () => this.showControlsSheet(true));
  }

  /** Shows the controls sheet at a device's tab (the one the Host steered with last), or hides it. */
  private showControlsSheet(open: boolean, device: Device = this.input.device) {
    const sheet = $('quicksheet');
    sheet.hidden = !open;
    if (!open) return;
    const tabs = $('quicksheet-tabs').children as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      // in the language chosen now
      tab.textContent = t(SHEET_TABS[i][1]);
      const selected = tab.dataset.device === device;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-selected', String(selected));
    }
    fillSheet($('quicksheet-list'), device, this.lacking());
    sheet.dataset.device = device;
  }

  private onAction(action: Action) {
    if (action === 'radio') {
      this.toggleRadio();
      return;
    }
    // F1 lays the controls over any screen, the running game included
    if (action === 'help') {
      this.showControlsSheet($('quicksheet').hidden !== false);
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
        // on the campaign's job board Enter takes the next job
        if (this.atBoard) {
          if (action === 'confirm') this.startMission();
          if (action === 'back' || action === 'pause') this.showBoard(false);
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
        // in the Gullet Escape leaves by its plate, as its button does; nothing else is asked of a key there
        if (this.gulletOpen) {
          if (action === 'pause' || action === 'back') this.leaveGullet();
          break;
        }
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
        if (action === 'autopilot' && this.me?.alive && !this.stage) this.toggleAutopilot();
        // Enter skips a round's intro
        if (action === 'confirm' && this.introOpen) this.skipIntro();
        // the clamps of the opening hold the overdrive and the torpedoes too, and so does a scene
        // in person: the clone is out of the cockpit (see stage)
        if (action === 'overdrive' && !this.clamped && !this.stage) this.overdrive();
        if (action === 'torpedo' && !this.spectating && this.me && !this.clamped && !this.stage) this.fireTorpedo(this.me);
        if (action === 'decoy' && !this.spectating && this.me && !this.clamped && !this.stage) this.dropDecoy(this.me);
        if (action === 'watch' && this.watching()) this.watchNext();
        break;
      case 'paused':
        // on the plate of a new round Enter starts it and Escape goes back
        if (this.choosingRound) {
          if (action === 'confirm') this.startChosenRound();
          if (action === 'back' || action === 'pause') this.showNewRound(false);
          break;
        }
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
    if (state !== 'menu') this.endPreview();
    $('menu').hidden = state !== 'menu';
    $('crest').hidden = state !== 'menu';
    $('pause').hidden = state !== 'paused';
    $('new-round').hidden = true;
    this.choosingRound = false;
    $('results').hidden = state !== 'results';
    // a phone held upright is asked to turn sideways while a round is flown (see #turn-phone)
    document.body.classList.toggle('playing', state === 'playing');
    $('invite').hidden = !this.online;
    this.share.close();
    // the A button that changed the screen does not also fire
    this.input.holdFire();
    if (state !== 'playing') this.sponsors.hide();
    this.hud.show(state === 'playing');
    this.input.steerWithMouse(state === 'playing' && !this.gulletOpen);
    if (state !== 'playing') {
      this.sound.setEngine(0, 0);
      // the look of a nova core belongs to the round; the next frame of play brings it back
      document.body.classList.remove('nova-held', 'alarm-critical');
    }
    if (state === 'menu' || state === 'results') {
      this.datamosh.stop();
      this.guide.hide();
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
    this.arenaReferences = referencesOf(arena);
    devlog?.begin(this.roundMode, arena.id);
    recorder?.clear();
    this.field.generate(arena.layout);
    // the Belt's rigs and buoys stand on their rocks before a course or a lane is laid out around them
    this.mining.dress(arena.id === 'belt' || arena.id === 'rheasilvia' ? this.field : null);
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
    // flying clear of the field's pieces, its lane laid out from the field as generated, before a snapshot breaks any, and clear of the ring's sheet
    this.fleet = this.roundMode === 'fleet' ? new Fleet(arena.layout.seed, this.field, arena.sheet) : null;
    if (this.fleet) this.scene.add(this.fleet.root);
    // its hull hides what is behind it and stops torpedoes
    this.field.obstacle = this.fleet;
    this.fleetCalled = false;
    this.fleetPhase = 1;
    // against the President every ship is on one side
    for (const ship of this.ships) ship.team = this.fleet ? 0 : -1;
    // the course of an arena is always the same: its best lap races along; the browser keeps only
    // what parseLaps reads back of the kept laps
    const kept = this.course ? parseLaps(storageGet(LAPS_KEY)) : null;
    if (kept) storageSet(LAPS_KEY, JSON.stringify(kept));
    this.laps = kept ? new LapTimer(kept[arena.id] ?? null) : null;
    this.leader = null;
    this.lastLapCalled = this.winCalled = false;
    this.flareCalled = this.survivorCalled = false;
    this.outAt.clear();
    this.flare.hide();
    this.pocket.set(0, 0, 0);
    this.pocketRadius = ARENA_LIMIT;
    this.place = -1;
    if (state) this.field.restore(state, arena.layout);
    // the field's pieces bounce off the rings as they do off each other
    this.contacts.fixtures = this.rings.map((ring) => ringFixture(ring.center, ring.facing, ring.radius));
    this.contacts.reset();
    this.space.setSun(arena.sun);
    this.space.setMood(arena.mood);
    this.output.set(arena.mood.grade);
    setGlint(arena.sun.intensity);
    this.landmarks.show(arena);
    setHullFrost(arena.id === 'derelict');
    // a planet's air: its haze in every shader that draws the world (see view/haze)
    const air = arena.layout.air ?? null;
    this.scene.fog = air ? this.haze.fog : null;
    this.haze.setAir(air, arena.hazeLight?.deck ?? this.landmarks.jupiter.deckLight, arena.hazeLight?.deep ?? this.landmarks.jupiter.deepLight);
    this.belt.group.visible = arena.id === 'belt';
    this.mining.setSun(arena.sun.color, arena.sun.intensity);
    if (!keepWreckage) {
      this.wrecks.clear();
      this.torpedoes.clear();
      this.decoys.clear();
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
    const round = Math.max(0, this.roundId);
    const picked = this.pickedArena?.round === round ? arenaById(this.pickedArena.arena) : undefined;
    return picked ?? arenaOfRound(this.online!.session.room, round);
  }

  /** This browser's Host decides what is played: online the Host of the lead browser, alone the Host itself; the flight school has its own course. */
  private get gameMaster() {
    return !this.school && !this.trialOf && (!this.online || this.online.isLead);
  }

  /** The plate of a new round: the arenas and the modes to choose from. */
  private buildNewRound() {
    $('new-round-arenas').append(
      ...ARENAS.map((arena) => {
        const button = Object.assign(document.createElement('button'), { type: 'button', innerHTML: `${t(arena.name)}<small>${t(arena.tagline)}</small>` });
        button.dataset.value = arena.id;
        button.addEventListener('click', () => {
          this.roundChoice.arena = arena.id;
          this.renderNewRound();
        });
        return button;
      }),
    );
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-choice="new-round-mode"] button[data-value]')) {
      button.addEventListener('click', () => {
        this.roundChoice.mode = button.dataset.value as RoomMode;
        this.renderNewRound();
      });
    }
    $('new-round-open').addEventListener('click', () => this.showNewRound(true));
    $('new-round-start').addEventListener('click', () => this.startChosenRound());
    $('new-round-back').addEventListener('click', () => this.showNewRound(false));
  }

  /** Marks the choices on the plate of a new round. */
  private renderNewRound() {
    const { arena, mode } = this.roundChoice;
    [...$('new-round-arenas').children].forEach((b, i) => b.classList.toggle('selected', ARENAS[i].id === arena));
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-choice="new-round-mode"] button[data-value]')) {
      button.classList.toggle('selected', button.dataset.value === mode);
      // every mode in turn is a rule of a tournament's rounds
      if (button.dataset.value === 'mixed') button.hidden = !this.online;
    }
  }

  /** Opens the plate of a new round on what is played now, or goes back to the pause menu. */
  private showNewRound(open: boolean) {
    this.choosingRound = open;
    $('new-round').hidden = !open;
    $('pause').hidden = open;
    if (open) {
      this.roundChoice = { arena: this.venue.id, mode: this.online ? (this.room?.mode ?? this.roundMode) : this.roundMode };
      $('new-round-note').textContent = this.online ? t('You are the game master: the round is cut short for every Host, its points paid out as usual.') : t('The round so far is paid out as usual.');
      this.renderNewRound();
    }
    $(open ? 'new-round-start' : 'resume').focus();
  }

  /**
   * Starts the round chosen on the plate. Alone at once. In a tournament the running round ends
   * for everyone with a short scoreboard, by the lead's clock as a round decided early does, so
   * every browser pays out its points; the next round then starts as any next round does.
   */
  private startChosenRound() {
    const { arena, mode } = this.roundChoice;
    if (!this.online) {
      this.renderScoreboard();
      this.solo.arena = arena;
      this.solo.mode = mode === 'mixed' ? this.solo.mode : mode;
      this.startRound('solo');
      return;
    }
    // the job of the lead browser may have gone to another while the plate was open
    if (this.online.isLead) {
      this.nextRound = { arena, mode };
      this.roundCut = true;
      this.setRoundEnd(Math.min(this.roundEndsAtWall - this.roundClock(), CUT_RESULTS_SECONDS - RESULTS_SECONDS));
    }
    this.resume();
  }

  /** The HUD says who decides: it names the game master on this browser, and the pause menu offers a new round only there. */
  private showGameMaster(online: Online) {
    if (online.isLead === this.toldGameMaster) return;
    this.toldGameMaster = online.isLead;
    $('new-round-open').hidden = !online.isLead;
    $('hud-room').classList.toggle('game-master', online.isLead);
    if (online.isLead) this.hud.flashMessage(this.time, t('You are the game master: the pause menu starts a new round, with any arena and mode'), 8);
    else if (this.choosingRound) this.showNewRound(false);
  }

  /** Shows where the round is played and what it is: the arena's name, a race's laps, what makes the arena special; the opening's intro card says it while it runs. */
  private announceArena() {
    if (this.introOpen || (!this.school && Number.isFinite(this.roundEndsAt) && this.roundSeconds() < START_AT)) return;
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


  /** The quality's buttons: the choice lit, auto naming the tier the governor is on. */
  private showQuality() {
    const choice: Quality['choice'] = this.graphics.quality.choice;
    for (const button of $('quality').querySelectorAll<HTMLButtonElement>('button')) {
      const value = button.dataset.value as Quality['choice'];
      button.classList.toggle('selected', value === choice);
      button.textContent = value === 'auto' ? (choice === 'auto' ? t('Auto: {tier}', { tier: t(TIER_NAMES[this.graphics.tier]) }) : t('Auto')) : t(TIER_NAMES[value]);
    }
  }

  /**
   * The clone climbs out of the cockpit into a scene in person (see campaign/scenes): the set and
   * the people put into the world, the camera its eyes, the HUD but its panel of what is said off
   * (nothing is projected on a clone's eyes), the people's lines said in the room; null climbs back in.
   */
  private setStage(name: SceneName | null) {
    if (this.stage) {
      this.stage.remove();
      this.stage = null;
    }
    this.speaker.inPerson = !!name;
    this.stageName = name;
    if (name) {
      // Patience's galley keeps on its shelf what the jobs done have left, and a tag for every black box found
      showShelf(this.campaign.done, this.campaign.tags.length);
      this.stage = stageOf(name);
      this.scene.add(this.stage.root);
    }
    this.hud.inPerson(!!this.stage);
    // the reference plane's grid and the drop lines are the flight computer's too
    this.hudScene.visible = !this.stage;
  }

  /**
   * The Gullet's plate over the scene in person (see campaign/missions, the Gullet): what the bar
   * offers (`#gullet-offers`) and the way out (Leave, Escape). While it is shown the mouse is a
   * pointer for it; the keys and a gamepad's stick still turn the clone's head.
   */
  private showGullet(open: boolean) {
    if (open) this.gulletLeft = false;
    this.gulletOpen = open;
    $('gullet').hidden = !open;
    this.input.steerWithMouse(this.state === 'playing' && !open);
    if (open) {
      this.showGulletOffers();
      $('gullet-leave').focus();
    }
  }

  /**
   * What Kesh offers on the Gullet's plate (see campaign/gullet): a bet in her book on a job done
   * with a gold time (the job, then the stake; with one placed, the job to fly now), a rumor for a
   * drink, and the Pit downstairs with its record.
   */
  private showGulletOffers(word = '') {
    const campaign = this.campaign;
    const button = (label: string, note: string, act: () => void, disabled = false) => {
      const element = Object.assign(document.createElement('button'), { type: 'button', className: 'mode', disabled });
      element.innerHTML = `<span class="mode-name"><span class="mode-label"></span></span><span class="mode-note"></span>`;
      element.querySelector('.mode-label')!.textContent = label;
      element.querySelector('.mode-note')!.textContent = note;
      element.addEventListener('click', act);
      return element;
    };
    const fly = (mission: Mission) => {
      this.showGullet(false);
      this.startMission(mission);
    };
    const offers: HTMLElement[] = [];
    const bet = campaign.bet;
    const betOn = bet ? MISSIONS.find((mission) => mission.id === bet.mission)! : null;
    if (bet && betOn) {
      offers.push(button(t('Fly your bet: {mission}', { mission: t(betOn.name) }), t('{stake} ☉ in Kesh’s book. Inside the gold time of {seconds} s she pays {coins} ☉.', { stake: coinText(bet.stake), seconds: goldOf(betOn)!, coins: coinText(bet.stake * BET_ODDS) }), () => fly(betOn)));
    } else {
      const timed = MISSIONS.filter((mission) => campaign.done.includes(mission.id) && goldOf(mission) !== null);
      if (timed.length) {
        const select = Object.assign(document.createElement('select'), { id: 'gullet-bet-job' });
        select.setAttribute('aria-label', t('The job to bet on'));
        for (const mission of timed) select.append(Object.assign(document.createElement('option'), { value: mission.id, textContent: [t(mission.name), sideJobAt(mission) ? t(arenaById(sideJobAt(mission)!)!.name) : '', t('gold {seconds} s', { seconds: goldOf(mission)! })].filter(Boolean).join(' · ') }));
        const stakes = Object.assign(document.createElement('div'), { className: 'gullet-stakes' });
        for (const stake of BET_STAKES) {
          const chip = Object.assign(document.createElement('button'), { type: 'button', textContent: `${coinText(stake)} ☉`, disabled: campaign.coins < stake });
          chip.addEventListener('click', () => {
            const mission = MISSIONS.find((m) => m.id === select.value)!;
            let placed = false;
            this.keepCampaign((kept) => (placed = placeBet(kept, mission, stake)));
            if (!placed) return;
            this.speaker.say(KESH.betTaken, 'lesson');
            this.showGulletOffers();
          });
          stakes.append(chip);
        }
        const label = Object.assign(document.createElement('p'), { className: 'plate-label', textContent: t('A bet in Kesh’s book: inside the gold time she pays double') });
        offers.push(label, select, stakes);
      }
    }
    const rumorsLeft = campaign.rumors < RUMORS.length;
    offers.push(
      button(
        t('A rumor for a drink'),
        rumorsLeft ? t('{price} ☉. Kesh hears what the jobs under the counter are before the people trust you with them.', { price: RUMOR_PRICE }) : t('Kesh has told you all she knows.'),
        () => {
          let told: string | null = null;
          this.keepCampaign((kept) => (told = buyRumor(kept)));
          if (!told) return;
          this.speaker.say(KESH.rumor, 'lesson');
          this.showGulletOffers(told);
        },
        !rumorsLeft || campaign.coins < RUMOR_PRICE,
      ),
    );
    if (word) offers.push(Object.assign(document.createElement('p'), { className: 'plate-note', textContent: t(word) }));
    const pit = MISSIONS.find((mission) => mission.pit)!;
    offers.push(
      button(
        t('Down to the Pit'),
        `${t('Wave after wave, one clone, {purse} ☉ cash a wave.', { purse: PIT_PURSE })} ${campaign.pit ? t('Record: {waves} waves.', { waves: campaign.pit }) : ''}`.trim(),
        () => {
          this.speaker.say(KESH.pit, 'lesson');
          fly(pit);
        },
      ),
    );
    $('gullet-offers').replaceChildren(...offers);
  }

  /** The Host leaves the Gullet by its plate: the mission's drill waiting in the bar is done (see SchoolContext.gulletLeft). */
  private leaveGullet() {
    if (!this.gulletOpen) return;
    this.gulletLeft = true;
    this.showGullet(false);
  }

  /**
   * One of the campaign's people calls the ship: their bust as a hologram in the comm panel,
   * their name under it, while their line stands; null ends the call.
   */
  private showCaller(who: Cast | null) {
    if (who === this.caller) return;
    this.caller = who;
    const panel = $('comm');
    const hologram = Hologram.shared();
    panel.hidden = !who || !hologram;
    if (!who || !hologram) {
      if (hologram && panel.contains(hologram.canvas)) hologram.stop();
      return;
    }
    panel.querySelector<HTMLElement>('.comm-name')!.textContent = t(CAST_NAMES[who]);
    const model = portraitModel(who);
    if (model) hologram.show(panel.querySelector<HTMLElement>('.comm-show')!, model, CAST_COLORS[who], PORTRAIT_SWING);
    // a bust not fetched yet: the name stands, the hologram comes on once it is there
    else
      loadBust(who).then(
        () => {
          if (this.caller !== who) return;
          this.caller = null;
          this.showCaller(who);
        },
        (error) => console.warn('Bust failed', error),
      );
  }

  private showMenu() {
    // a mission or a trial's round left for the menu ends there (see endRound, judgeTrial),
    // so no round after it spawns at its start
    this.trialOf = this.mission = null;
    this.flyingAgain = false;
    // the finds of a place stay out there, and a chip's track ends with the job
    this.hunt.leave();
    this.pingedAt = null;
    this.chipTrack = null;
    this.showCaller(null);
    this.showQuality();
    this.leaveOnline();
    this.clearShips();
    // the hangar is no race: no gates behind the menu
    this.roundMode = 'deathmatch';
    this.enterArena(DEFAULT_ARENA);
    const best = Number(storageGet(BEST_SCORE_KEY) ?? 0);
    $('best-score').textContent = best ? t('Personal best: {points} pts', { points: best }) : '';
    this.showSchoolProgress();
    this.showCampaign();
    this.markLeadMode();
    // a clone that died last leaves no muffled radio behind in the hangar
    this.radio.setMuffled(false);
    // the broadcast has left the stadium, a cheer of the round's end included
    this.crowd.hush();
    $('now-playing').classList.remove('silent');
    this.setScreen('menu');
  }

  private clearShips() {
    this.killcam.stop();
    this.clearShockwaves();
    this.cues.length = 0;
    this.torpedoes.clear();
    this.decoys.clear();
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
    // the ships' ids come again in the next round (a solo round's 'me' and bots): nothing they
    // did is avenged or carries a streak there
    this.moments.reset();
    this.streaks.reset();
    this.me = null;
    this.drone = null;
    this.flockShips = [];
    this.watchedShip = null;
    this.sparring = null;
    this.wingman = null;
    this.jumpers = null;
    this.racers = null;
    // the clone climbs back in: no scene outlives its round, nor the Gullet's plate
    this.setStage(null);
    if (this.gulletOpen) this.showGullet(false);
    if (this.school) {
      this.speaker.stop();
      this.scene.remove(this.school.root);
      this.school.dispose();
      this.school = null;
      this.schoolContext = null;
    }
    // the comet called belongs to the round that ends: the next venue's field time starts over
    this.cometCalled = null;
    this.tailCalled = null;
  }

  /**
   * Starts a round: solo against bots, the flight school without opponents, or an online
   * tournament (where the lead browser adds bots for free places).
   */
  private startRound(mode: 'solo' | 'school' | 'online') {
    if (this.input.touchActive) this.enterFullscreen();
    this.showLinkLost(false);
    $('no-clone').hidden = true;
    this.noClone = false;
    // a back-room print's trembling ends with its round
    this.tremorUntil = -Infinity;
    // cleaned as every peer cleans it, so no callsign leaves nothing visible
    const callsign = cleanName($<HTMLInputElement>('callsign').value) || 'Host';
    $<HTMLInputElement>('callsign').value = callsign;
    storageSet(CALLSIGN_KEY, callsign);
    if (mode !== 'online') this.leaveOnline();
    if (this.choosingSolo) this.showSolo(false);
    if (this.choosingSchool) this.showSchool(false);

    this.clearShips();
    // the flight school trains in the default arena; a solo round is in the arena chosen; online the
    // room and round decide, so a first round starts in the room's first arena (see arriveInRound)
    this.roundId = mode === 'online' ? -1 : 0;
    this.nextRound = this.pickedArena = null;
    this.roundCut = this.toldGameMaster = false;
    $('hud-room').classList.remove('game-master');
    // a solo round plays what the Host chose, in the arena chosen or one by chance
    this.roundMode = mode === 'online' ? this.onlineRoundMode() : mode === 'solo' ? this.solo.mode : 'deathmatch';
    if (mode === 'online') this.enterArena(arenaOfRound(this.online!.session.room, 0));
    // a mission of the campaign starts at the place of the drill it goes on from
    else if (mode === 'school' && this.mission) this.enterArena(arenaById(this.mission.drills[Math.min(this.missionStep(), this.mission.drills.length - 1)].arena ?? '') ?? DEFAULT_ARENA);
    else this.enterArena(mode === 'school' ? DEFAULT_ARENA : (ARENAS.find((a) => a.id === this.solo.arena) ?? pick(ARENAS)));
    this.hud.reset();
    this.resetOpening();
    $('hud-room').textContent = '';

    // the campaign flies its own hull (Lot 7731), never one of the Games
    const campaignHull = (this.campaignHull = !!this.mission && (mode === 'school' || !!this.trialOf));
    this.me = this.addShip(this.online ? `p:${this.online.selfId}` : 'me', callsign, campaignHull ? 'magpie' : this.selectedShip, true);
    this.me.wish = this.tint;
    this.me.setTint(TINTS[this.tint].hex);
    // the own ship flies with its upgrades, online only up to their cap
    // in the campaign the hull it has come to (see campaign/campaign), never the tournament's hangar
    this.me.outfit(campaignHull ? hullOf(this.campaign) : perksOf(this.hangar, this.selectedShip, !!this.online));
    // the HUD shows only what the ship has: no overdrive's readout on a hull without one, no tubes' without torpedoes
    $('hud-overdrive').parentElement!.hidden = !this.me.perks.overdrive;
    $('hud-torpedo').parentElement!.hidden = TORPEDOES + this.me.perks.torpedoes <= 0;
    this.school =
      mode !== 'school' ? null : this.mission ? new FlightSchool(null, this.missionStep(), this.mission) : new FlightSchool(this.schoolCourse, schoolSteps()[this.schoolCourse] ?? 0);
    if (this.school) this.scene.add(this.school.root);
    // the flight school has no radio (the campaign has, its music by situation, and its volume); the share button stays in its corner
    $('now-playing').classList.toggle('silent', mode === 'school' && !this.mission);
    if (mode === 'solo') this.setBotCount(this.solo.rivals.length, [], this.solo.rivals);
    this.respawn(this.me);

    // online the round is unknown until the lead browser tells it (see syncRound)
    this.rejoinedFrom = null;
    this.resultsShownFor = null;
    this.pendingRocks.length = 0;
    this.soloSeed = 1 + Math.floor(Math.random() * 2147483000);
    // online, the lead browser's clock decides (see leadRound and syncRound)
    this.roundStartWall = null;
    if (mode === 'solo') this.setRoundEnd(ROUND_SECONDS);
    else this.roundEndsAt = this.roundEndsAtWall = Infinity;
    this.cockpit = false;
    this.flipping = false;
    this.brakePhase = 'off';
    this.kick = 0;
    this.autopilot = false;
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
    this.me!.strain = 0;
    this.setScreen('playing');
    // the link to the clone comes first, then the hint for the mouse (not for touch or gamepad):
    // every time in the flight school's basic training, where steering is taught; in real rounds
    // it is one of Nicole's tips (see Coach), given only in a Host's first rounds with the mouse
    const mouse = !this.input.touchActive && !this.input.gamepadActive;
    let hint = mouse && this.school?.course === 'basic';
    // the flight school starts with its briefing; a tournament clone just reports in, and
    // once Nicole is through, the announcer opens the broadcast
    if (mode !== 'school') {
      this.coach.newRound();
      // the hint counts as given once it is on screen, whether the voice could say it or not
      hint =
        mouse &&
        this.coach.give('mouse', (line) => {
          this.speaker.say([COMPUTER.launch, line], 'urgent');
          return true;
        });
      if (!hint) this.speaker.say(COMPUTER.launch, 'urgent');
      // online the round's mode is known once the lead tells it (see arriveInRound)
      if (mode === 'solo') this.briefRound();
      this.broadcastOpened = false;
      this.cue(ARENA_TITLE_DELAY, () => this.announceArena());
      this.cue(ANNOUNCER_OPEN_DELAY, () => !this.broadcastOpened && this.openBroadcast());
    }
    // cues of this round run on its own clock: a pause holds them, clearShips drops them
    if (hint) this.cue(2.2, () => this.hud.flashMessage(this.time, t('The ship turns towards the mouse pointer'), 4));
  }

  /** A round of a known mode begins: every tip may come once more, and the first round of a mode opens with its briefing, after whatever Nicole is saying. */
  private briefRound() {
    this.coach.newRound();
    this.coach.give(this.roundMode, (line) => this.speaker.say(line, 'lesson'));
  }

  /**
   * A big moment of the own pilot (see game/moments.ts): its banner above the crosshair, the
   * crowd (on its feet for the biggest, a cheer that settles again for the rest) and, for the
   * biggest, the announcer; a streak's `bonus` (points, see game/streaks) beneath the banner.
   * Not in the flight school, which is on no broadcast.
   */
  private moment(moment: Moment, bonus = 0) {
    if (!this.me) return;
    const { banner, crowd, lines, rank } = MOMENTS[moment];
    // in a job of the campaign a moment earns ratings from style (see campaign/campaign, styleRatings), once
    if (this.school) {
      if (!this.mission || this.flyingAgain) return;
      const ratings = styleRatings(rank, this.mission);
      this.missionStyle += ratings;
      this.hud.banner(this.time, t(banner), rank, t('+{ratings} ratings', { ratings }));
      return;
    }
    this.hud.banner(this.time, t(banner), rank, bonus > 0 ? t('Streak bonus +{points}', { points: bonus }) : '');
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
    // a place of the campaign has no line of its own: no broadcast greets it
    const arena = (ANNOUNCER_ARENA as Partial<Record<ArenaId, string>>)[this.venue.id];
    this.radio.announce(pick(arena ? [arena, ...ANNOUNCER_OPEN] : [...ANNOUNCER_OPEN]), null);
  }

  /**
   * Settles the tints of the round's Hosts (see assignTints) in the order they joined the
   * tournament, so every browser comes to the same; the Sovereign and the bots keep their own.
   * Join times settle over the first seconds in a room, so it runs again every TINT_SECONDS.
   */
  private tintShips(now: number) {
    this.tintedAt = now + TINT_SECONDS;
    const hosts = this.ships.filter((ship) => ship.kind === 'host' && !ship.trophy);
    const session = this.online?.session;
    if (session) hosts.sort((a, b) => session.joinedTime(ownerOf(a.id)) - session.joinedTime(ownerOf(b.id)) || (a.id < b.id ? -1 : 1));
    assignTints(hosts.map((ship) => ship.wish)).forEach((index, i) => hosts[i].setTint(TINTS[index].hex));
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
      // a bot that takes over a Host's Magpie flies it as the Magpie it is
      ship.outfit(hullLooks(ship.type, BOT_GEAR));
      this.bots.push(new Bot(ship, skillsOf(ship.name)));
      if (!heir) this.respawn(ship);
      else {
        ship.adopt(heir, this.time);
        if (!ship.alive) ship.respawnAt = this.time + BOT_RESPAWN_SECONDS;
      }
    }
  }

  showBeam(shooter: Ship, from: THREE.Vector3, to: THREE.Vector3) {
    // a shot is loud: the shooter shows up on the sensors again (see Ship.silent)
    shooter.loudAt = this.time;
    if (shooter.owner !== null) shooter.warm();
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
    // the lead's clock may differ from the one this browser ran alone: its start comes with it
    this.roundStartWall = null;
    this.pendingRocks.length = 0;
  }

  syncRound(round: RoundState) {
    // the room's modes are the lead's: a link or a lobby listing may have named others
    if (round.m && this.room && round.m !== this.room.mode) this.room.mode = round.m;
    // so is the choice of the game master, known before the arena is entered
    if (round.a && round.id >= this.roundId) this.pickedArena = { round: round.id, arena: round.a };
    if (round.id === this.roundId) this.roundCut = round.c === 1;
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
      // has nothing to say about this one, unless its game master chose the new round
      if (!round.a && this.roundClock() < this.roundEndsAtWall - ROUND_END_SLACK) return;
      this.roundId = round.id;
      this.startNextRound();
    } else if (round.id < this.roundId) return;
    // the asteroids follow the lead browser's field time: jump when far off, otherwise smooth
    // out the jitter of the network
    const drift = round.field - this.field.clock;
    this.field.setClock(Math.abs(drift) > FIELD_SNAP ? round.field : this.field.clock + drift * 0.1);
    // the sides and cores of Capture the Flag are the lead's, and so is the President's
    // battleship: followed before the clock, so a round the lead ends early (a side won, the
    // battleship went down) is decided here too when its shortened clock arrives
    if (round.f && this.flags) this.flags.follow(round.f, this.time);
    if (round.b && this.fleet) this.fleetEvents(this.fleet.follow(round.b), null);
    // the radio plays on this clock, so it follows the lead browser closely the same way
    const endsAt = this.roundClock() + round.left;
    if (Math.abs(endsAt - this.roundEndsAtWall) > ROUND_SNAP || !Number.isFinite(this.roundEndsAtWall)) this.setRoundEnd(round.left);
    else this.setRoundEnd(this.roundEndsAtWall + (endsAt - this.roundEndsAtWall) * 0.05 - this.roundClock());
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
    if (this.roundClock() >= this.roundEndsAtWall + RESULTS_SECONDS) {
      this.roundId++;
      // what the game master chose: the mode stays the room's rule from here on, the arena is this round's
      if (this.nextRound) {
        if (this.room) this.room.mode = this.nextRound.mode;
        this.pickedArena = { round: this.roundId, arena: this.nextRound.arena };
        this.nextRound = null;
      }
      this.startNextRound();
      this.setRoundEnd(ROUND_SECONDS);
    }
    if (this.decided() && this.roundEndsAtWall - this.roundClock() > DECIDED_SECONDS) this.setRoundEnd(DECIDED_SECONDS);
    const left = this.roundEndsAtWall - this.roundClock();
    this.roundEndsAt = this.time + left;
    this.followStart();
    const round: RoundState = { id: this.roundId, left: +left.toFixed(3), field: +this.field.clock.toFixed(3), ...(this.room ? { m: this.room.mode } : {}), ...(this.pickedArena?.round === this.roundId ? { a: this.pickedArena.arena } : {}), ...(this.roundCut ? { c: 1 as const } : {}) };
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
    this.roundEndsAtWall = this.roundClock() + left;
    this.followStart();
  }

  /**
   * The clock a round runs on: real time, so a slow frame rate does not stretch it. A solo
   * round whose game time runs at another speed (the time-lapse of the balance runs, a freeze
   * for a screenshot: see timeScale) runs with the game's time instead, its opening and its
   * probes included, so a time-lapse plays the round as it is played.
   */
  private roundClock() {
    return wallClock() + this.lapse;
  }

  /**
   * The round started ROUND_SECONDS before its end, on the same real-time clock; once it is
   * decided early it ends sooner, but keeps its start (race times and the probes count from
   * there). Online the start is known from the round's first clock on: the lead's clock may
   * smooth it by a jitter's worth (ROUND_SNAP), never jump it, so an end the lead brings forward
   * (a race all finished, a side that won) never moves the race's time or the probes' schedule,
   * even before this browser sees the round decided itself.
   */
  private followStart() {
    const start = this.roundEndsAtWall - ROUND_SECONDS;
    if (this.decided() || !takesStart(this.online !== null, this.roundStartWall, start, ROUND_SNAP)) return;
    this.roundStartWall = start;
    this.roundStartedAt = this.roundEndsAt - ROUND_SECONDS;
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
    // the new round's start comes with its first clock (see followStart)
    this.roundStartWall = null;
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

  /** What every round starts with on screen and in the cockpit: no replay, no old marks, free drift. */
  private freshRound() {
    this.killcam.stop();
    this.hud.reset();
    this.resetOpening();
    this.autopilot = false;
    this.attackers.clear();
    this.lastAttacker = this.namedAttacker = null;
    this.namedAt = -Infinity;
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
      ship.finish = ship.skipLap = -1;
    }
    this.brokenHere.clear();
    this.lastRockHit.clear();
    this.moments.reset();
    this.streaks.reset();
    this.wrecks.clear();
    this.probes.reset();
    this.roundCut = false;
    $('results').hidden = true;
  }

  /** Spawns a ship on the edge of the field, facing the center, away from asteroids; no cable comes along. */
  private respawn(ship: Ship) {
    this.dropCables(ship);
    // a back-room print boots ragged: its link glitching, its hands trembling (see campaign/campaign, BLACK_GLITCH)
    if (ship === this.me && this.blackPrinted && this.campaignHull) {
      this.blackPrinted = false;
      this.glitch.trigger(1, BLACK_GLITCH);
      this.tremorUntil = this.time + BLACK_TREMOR;
    }
    const position = new THREE.Vector3();
    const candidate = new THREE.Vector3();
    let best = -Infinity;
    const course = this.course;
    if (course) {
      // a racer starts on the grid before the first gate, and a new clone takes up the race
      // where the last one died, facing the next gate; where the last one passed its last gate
      // when that spot lies in rock, in a well or its grip, or out of the arena
      const spot = ship.flight.position;
      if (ship.gates > 0 && ship.outsideSince === null && !this.field.overlap(spot, ship.radius * 4) && !this.field.insideWell(spot, ship.radius * 40) && !inGrip(this.field.well, spot, WELL_CAUTION)) position.copy(spot);
      else course.startOf(ship.gates, Math.max(0, this.ships.indexOf(ship)) % 8, position);
      candidate.copy(course.points[ship.gates % GATES]);
      best = 0;
    }
    // a place of the campaign prints the own clone where its story starts, facing on (see ArenaProfile.start)
    const start = ship === this.me && !course ? (this.mission?.start ?? this.venue.start) : undefined;
    if (start) {
      position.set(...start.at);
      candidate.set(...start.toward);
      best = 0;
    }
    // of a dozen random places on the edge of the field (in Last Clone Standing around the middle
    // of a solar flare's safe pocket and clear of its plasma; in Capture the Flag around the own
    // side's base), clear of rock and of a massive body's grip (no alarm at the start), the one farthest from the nearest enemy, preferably hidden
    // from every enemy behind the asteroids
    const clock = this.field.clock;
    const edge = this.survival ? Math.min(FIELD_RADIUS, flarePocket(clock, spawnMiddle) * FLARE_KEEP) : FIELD_RADIUS;
    if (!this.survival) spawnMiddle.set(0, 0, 0);
    const scorched = (point: THREE.Vector3) => this.survival && flareClearance(point, clock) < ship.radius * 10;
    const base = this.flags && ship.team >= 0 ? this.flags.bases[ship.team] : null;
    for (let attempt = 0; attempt < SPAWN_CANDIDATES && !course && !start; attempt++) {
      if (base) candidate.randomDirection().multiplyScalar(BASE_RADIUS * (2 + Math.random() * 2)).add(base);
      else candidate.randomDirection().multiplyScalar(edge * (0.9 + Math.random() * 0.2)).add(spawnMiddle);
      if (this.field.overlap(candidate, ship.radius * 10) || this.field.insideWell(candidate, ship.radius * 40) || inGrip(this.field.well, candidate, WELL_CAUTION) || scorched(candidate)) continue;
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
    // rock, well and grip at all, and as a last resort the open space just beyond the field's rocks
    for (let attempt = 0; attempt < SPAWN_CANDIDATES * 4 && best === -Infinity; attempt++) {
      candidate.randomDirection().multiplyScalar(edge * (0.9 + Math.random() * 0.2)).add(spawnMiddle);
      if (this.field.overlap(candidate, ship.radius * 2) || this.field.insideWell(candidate, ship.radius * 40) || inGrip(this.field.well, candidate, WELL_CAUTION) || scorched(candidate)) continue;
      best = 0;
      position.copy(candidate);
    }
    // (in Last Clone Standing the open space behind the field, away from the sun, which no flare reaches)
    if (best === -Infinity && this.survival) position.copy(SUN_DIRECTION).multiplyScalar(-ARENA_LIMIT * 0.85);
    else if (best === -Infinity) position.randomDirection().multiplyScalar(Math.min(ARENA_LIMIT * 0.95, (this.field.layout?.radius ?? FIELD_RADIUS) * SPAWN_BEYOND));
    ship.spawn(position, lookingAt(position, course || start ? candidate : spawnMiddle, UP), this.time);
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
    // the kill again as a clip to share: one run of the replay from its start, picture and sound
    const type = clipType();
    if (type && this.killcam.canReplay)
      this.sponsors.offerClip(async () => {
        this.killcam.again();
        try {
          return await recordClip(this.renderer.domElement, this.sound.headset, REPLAY_SECONDS, type);
        } catch (error) {
          console.warn('Clip failed', error);
          return null;
        }
      }, `${t('My last clone, in slow motion. Die for the President too. SolarTournament')} ${GAME_URL}`);
  }

  private pause() {
    // the handbook opens at the section of what is being flown (its sections are named after the modes)
    ($('pause-handbook') as HTMLAnchorElement).hash = this.school ? 'flying' : this.roundMode;
    $('new-round-open').hidden = !this.gameMaster;
    this.setScreen('paused');
    // Enter resumes, so the keyboard's focus starts there too
    $('resume').focus();
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
    // a flight with no end of its own (a free flight, the galley) is left for the job board
    // a night in the Pit left: Kesh pays the waves cleared, as when its clone falls
    if (this.school && this.mission?.pit) {
      this.endPit();
      return;
    }
    if (this.school && this.mission?.open) {
      this.mission = null;
      this.schoolMark = this.schoolTrack = null;
      this.showMenu();
      this.showBoard(true);
      return;
    }
    // a round flown to its end is cheered; one left from the pause menu is not
    if (this.time >= this.roundEndsAt) this.crowd.finale();
    this.renderScoreboard();
    $('results-next').textContent = this.trialOf ? this.judgeTrial() : '';
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
    // nor is a trial of the campaign, which pays in the campaign's own coin
    if (me && !this.school && !this.trialOf && me.score > Number(storageGet(BEST_SCORE_KEY) ?? 0)) storageSet(BEST_SCORE_KEY, String(me.score));
    const coins = me && !this.school && !this.trialOf && !this.spectating ? payOut(this.hangar, me.score) : 0;
    if (coins > 0) this.saveHangar();
    $('results-coins').textContent = coins > 0 ? t('+{coins} Solar Coins · {total} in the hangar', { coins: coinText(coins), total: coinText(this.hangar.coins) }) : '';
  }

  private saveHangar() {
    this.keepEarned(HANGAR_KEY);
    this.renderShowcase();
  }

  /**
   * Reads the hangar and the completed courses as the browser keeps them. A value only a hand
   * puts there (see hangarFrom) is named on screen and not used: the game goes on with what it
   * last read (stock, when it read nothing yet), until the entry holds possible values again or
   * is cleared. What cannot be read counts as stock, with a warning in development only.
   */
  private readEarned() {
    this.earnedRead = [storageGet(HANGAR_KEY), storageGet(SCHOOL_DONE_KEY)];
    const { hangar, cheated, unreadable } = hangarFrom(this.earnedRead[0]);
    const courses = coursesFrom(this.earnedRead[1]);
    if (import.meta.env.DEV && unreadable.length > 0) console.warn(`unreadable in ${HANGAR_KEY}, taken as stock: ${unreadable.join(', ')}`);
    if (import.meta.env.DEV && !courses) console.warn(`${SCHOOL_DONE_KEY} unreadable, taken as no course`);
    this.coursesDone = courses ?? new Set();
    this.tampered = cheated;
    $('tampered').hidden = !cheated;
    if (cheated) return;
    this.hangar = hangar;
    if (hangar.ship === 'magpie' && !this.magpieEarned()) hangar.ship = 'human';
    this.selectedShip = this.shipShown = hangar.ship;
    if (this.showcase) {
      this.renderShowcase();
      this.showSchoolProgress();
    }
  }

  /** Reads the kept entries again when they changed since. */
  private watchEarned() {
    if (storageGet(HANGAR_KEY) !== this.earnedRead[0] || storageGet(SCHOOL_DONE_KEY) !== this.earnedRead[1]) this.readEarned();
  }

  /** Keeps the hangar (put right, see keepable) or the completed courses; never over a hangar a hand edited, which is named first and stays until the Host puts it right. */
  private keepEarned(key: typeof HANGAR_KEY | typeof SCHOOL_DONE_KEY) {
    this.watchEarned();
    if (this.tampered && key === HANGAR_KEY) return;
    storageSet(key, key === HANGAR_KEY ? JSON.stringify(keepable(this.hangar)) : JSON.stringify([...this.coursesDone]));
    this.earnedRead = [storageGet(HANGAR_KEY), storageGet(SCHOOL_DONE_KEY)];
  }

  /** The Magpie is the Host's for the Games once the campaign is done (its last mission flown). */
  private magpieEarned() {
    return this.campaign.done.includes('firstRound');
  }

  /** Whether the Host has earned a ship: the interceptors always, the trophies once won. */
  private earned(ship: TournamentShip) {
    return ship === 'sovereign' ? sovereignEarned(this.hangar) : ship === 'magpie' ? this.magpieEarned() : true;
  }

  /** The ship on show above the logo, its name and what it is; the hangar's note on its button. */
  private renderShowcase() {
    const ship = this.shipShown;
    const locked = !this.earned(ship);
    this.showcase?.show(ship, perksOf(this.hangar, ship, false), locked);
    $('ship-name').textContent = t(SHIP_NAMES[ship]);
    const how = ship === 'magpie' ? t('Bring Lot 7731 through the campaign, and it is yours.') : t('Make both interceptors complete in the hangar, and it is yours.');
    $('ship-note').textContent = locked ? how : ship === this.selectedShip ? t('Your ship') : '';
    $('hangar-note').textContent = t('{coins} Solar Coins · upgrade your ships', { coins: coinText(this.hangar.coins) });
    if (this.inHangar) this.renderHangar();
    this.renderTints();
  }

  /** Marks the Host's tint in the menu and names it; a trophy flies in its own colors instead (the Sovereign's ivory and gold, the Magpie's chalk white and flip paint). */
  private renderTints() {
    const trophy = TROPHY_MARKS[this.selectedShip] ?? null;
    [...$('tints').children].forEach((button, i) => {
      button.classList.toggle('selected', i === this.tint);
      button.setAttribute('aria-checked', String(i === this.tint));
    });
    $('tints').classList.toggle('trophy', !!trophy);
    if (trophy) {
      $('tint-name').style.setProperty('--trophy', trophy.tint);
      $('tint-name').style.setProperty('--trophy-glow', trophy.glow);
    }
    $('tint-name').textContent = this.selectedShip === 'sovereign' ? t('The Sovereign flies in ivory and gold') : this.selectedShip === 'magpie' ? t('The Magpie flies in chalk white and flip paint') : t(TINTS[this.tint].name);
  }

  /** The next or the previous ship on show; one that is earned is the one the Host flies. */
  private turnShowcase(step: number) {
    const ships: TournamentShip[] = ['human', 'alien', 'sovereign', 'magpie'];
    this.shipShown = ships[(ships.indexOf(this.shipShown) + step + ships.length) % ships.length];
    if (this.earned(this.shipShown)) {
      this.selectedShip = this.hangar.ship = this.shipShown;
      this.saveHangar();
    } else this.renderShowcase();
  }

  /** The hangar's plate: the coins, and every upgrade of the ship on show with its steps and the price of the next. */
  private renderHangar() {
    const ship = this.shipShown;
    const coins = { coins: coinText(this.hangar.coins) };
    $('hangar-coins').textContent = this.hangar.coins >= WALLET ? t('{coins} Solar Coins. The wallet is full: rounds pay nothing until you spend.', coins) : t('{coins} Solar Coins. Every point of a round pays one.', coins);
    const list = $('hangar-upgrades');
    if (ship === 'sovereign') {
      list.textContent = sovereignEarned(this.hangar) ? t('The Sovereign flies with every upgrade, and wears every look.') : t('The Sovereign is the President’s gift for both interceptors made complete.');
      return;
    }
    if (ship === 'magpie') {
      list.textContent = this.magpieEarned() ? t('The Magpie flies with every upgrade, and wears every look.') : t('The Magpie is Lot 7731 as Pim finished it, yours once the campaign is done.');
      return;
    }
    // the ship on show: its gear, then its upgrades
    const gear = GEAR.map((piece) => {
      const owned = this.hangar.gear[ship][piece.id];
      const row = Object.assign(document.createElement('button'), { type: 'button', className: 'upgrade gear' });
      row.disabled = owned || piece.price > this.hangar.coins;
      row.innerHTML = `<span class="upgrade-name">${t(piece.name)}<small>${t(piece.note)}</small></span><span class="upgrade-price">${owned ? t('Owned') : `${coinText(piece.price)} ☉`}</span>`;
      row.addEventListener('click', () => {
        if (buyGear(this.hangar, ship, piece.id)) this.saveHangar();
      });
      return row;
    });
    list.replaceChildren(
      ...gear,
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

  /**
   * The ship's arrows and the hangar's button: under the pad on a wide screen (#pad-controls);
   * on a narrow one, where the menu's plate covers the pad, at the head of the menu's plate (or
   * the hangar's, while it is open) and among the Games.
   */
  private placePadControls() {
    const showcase = $('showcase');
    const hangar = $('hangar');
    if (window.matchMedia(TITLE_WIDE).matches) {
      $('pad-controls').append(showcase, hangar);
      return;
    }
    if (this.inHangar) $('hangar-plate').insertBefore(showcase, $('hangar-coins'));
    else $('menu').prepend(showcase);
    $('menu-games').append(hangar);
  }

  private showHangar(open: boolean) {
    this.inHangar = open;
    $('menu').hidden = open || this.state !== 'menu';
    $('hangar-plate').hidden = !open;
    this.placePadControls();
    this.renderShowcase();
    if (open) $('hangar-back').focus();
  }

  /** The standings as a table: the scoreboard at the round's end, and the one Tab holds open. */
  private fillStandings(table: HTMLTableElement) {
    const race = this.roundMode === 'race';
    const survival = this.survival;
    const flags = this.flags;
    const online = this.online;
    const heads = ['#', t('Host'), race && t('Race'), survival && t('Clones'), flags && t('Side'), t('Kills'), t('Deaths'), t('Score'), online && t('Ping')];
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
      const name = row.insertCell();
      name.append(swatch(shownTint(ship), ship.trophy?.glow ?? null));
      if (online && isLeadHost(ship.id, online.session.leadId)) name.append(markLead());
      name.append(...markedName(ship.kind, ship.name));
      if (race) row.insertCell().textContent = ship.finish >= 0 ? t('{time} s', { time: ship.finish.toFixed(1) }) : t('Lap {lap}/{laps}', { lap: lapOf(ship.gates), laps: LAPS });
      if (survival) row.insertCell().textContent = isOut(ship) ? t('Out') : t('{n} left', { n: clonesLeft(ship) });
      if (flags) {
        const side = row.insertCell();
        side.textContent = TEAM_NAMES[ship.team] ? t(TEAM_NAMES[ship.team]) : '–';
        side.style.color = TEAM_TINTS[ship.team] ?? '';
      }
      for (const value of [ship.kills, ship.deaths, ship.score]) row.insertCell().textContent = String(value);
      if (online) row.insertCell().append(this.pingReading(online, ship));
    });
  }

  /**
   * A Host's reading in the standings' ping column: its browser's measured delay (a bot's, the
   * lead's, since the lead runs it), in the HUD's azure, orange and red once it grows enough to
   * matter; a dash for this own browser (and, while it leads, its own bots), and before the
   * first pong has come back.
   */
  private pingReading(online: Online, ship: Ship): Node {
    const peer = pingPeerOf(ship.id, online.selfId);
    const ms = peer === null ? null : online.session.pingTo(peer);
    if (ms === null) return document.createTextNode('–');
    const reading = document.createElement('span');
    reading.className = 'ping' + (ms >= PING_CRITICAL_MS ? ' critical' : ms >= PING_WARN_MS ? ' warn' : '');
    reading.textContent = t('{ms} ms', { ms: Math.round(ms) });
    return reading;
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
      this.crowd.finale();
      this.renderScoreboard();
      $('again').textContent = t('Leave tournament');
      this.speaker.say(COMPUTER.roundOver, 'urgent');
    }
    $('results').hidden = this.state !== 'playing';
    const seconds = Math.ceil(Math.max(0, this.roundEndsAt + RESULTS_SECONDS - this.time));
    const next = this.roundCut ? t('The game master ended the round · next round in {seconds} s', { seconds }) : t('Next round in {seconds} s', { seconds });
    if ($('results-next').textContent !== next) $('results-next').textContent = next;
  }

  private resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // a zoom or another screen changes the pixel ratio as well, and so does the picture's quality
    this.renderer.setPixelRatio(this.graphics.pixelRatio);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.hud.setViewport(width, height, this.renderer.getPixelRatio());
    this.guide.setViewport(width, height);
    this.redraw = true;
    this.glitch.setSize(width * this.renderer.getPixelRatio(), height * this.renderer.getPixelRatio());
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.effects.setViewport(height * this.renderer.getPixelRatio(), this.camera.fov);
    this.cometView.setViewport(height * this.renderer.getPixelRatio());
    this.landmarks.setViewport(height * this.renderer.getPixelRatio());
    this.mining.setViewport(height * this.renderer.getPixelRatio());
  }

  private frame() {
    const began = performance.now();
    this.timer.update();
    const drawn = this.draw();
    this.lastFrameMs = performance.now() - began;
    // the governor watches the frame rate where the picture moves: the menu and a running round, each on a rung of its own
    if (drawn && (this.state === 'menu' || this.state === 'playing')) {
      const safe = this.state !== 'playing' || !this.me?.alive || this.sponsors.visible;
      this.graphics.frame(this.timer.getDelta(), this.lastFrameMs / 1000, safe, this.state === 'playing' ? 'round' : 'menu');
    } else {
      this.graphics.pause();
    }
  }

  /**
   * The broadcast shows the stadium while a round of the tournament is flown and seen: not in
   * the flight school, under a pause menu or a sponsor break (the broadcast cuts to the ads), nor
   * once the round is over (see Crowd.finale) or in the menu.
   */
  private stadiumOnAir() {
    return this.state === 'playing' && !this.school && !this.sponsors.visible && this.time < this.roundEndsAt;
  }

  /** One frame of the game: input, simulation, sound and the picture; false when a still pause draws nothing. */
  private draw(): boolean {
    this.input.poll();
    this.holdUpright();
    const real = this.timer.getDelta();
    const dt = Math.min(real, 0.05) * this.timeScale;
    if (this.timeScale !== 1 && !this.online) this.lapse += dt - real;
    // a long frame (a slow device, a time-lapse) runs as several steps of at most MAX_STEP, so
    // shots, collisions and bots play the same game at any frame rate
    const steps = Math.max(1, Math.ceil(dt / MAX_STEP - 1e-9));
    this.crowd.air(this.stadiumOnAir());
    let stepped = false;
    for (let i = 0; i < steps; i++) {
      // an online tournament does not stop for one pilot's pause menu
      const running = this.state === 'playing' || (this.state === 'paused' && !!this.online);
      if (this.state === 'paused' && !running) break;
      this.time += dt / steps;
      if (running) this.updateRound(dt / steps);
      stepped ||= running;
      this.field.update(dt / steps);
      if (running) this.knock();
      // after the contacts of the step, which still meet a piece up to the field time it crumbles
      for (const piece of this.field.crumble()) this.effects.crumble(piece.object.position, piece.meanRadius, piece.velocity);
    }
    // the screen shows the round as the last step left it, once a frame
    if (stepped && this.me && (this.state === 'playing' || (this.state === 'paused' && !!this.online))) this.presentRound();
    if (this.state !== 'paused' || this.online) {
      this.reentry.update(dt, this.ships, this.field.air, this.me ? this.subject() : null, this.camera);
      this.effects.update(dt);
    }
    if (this.state === 'menu' || this.state === 'results') this.updateMenuCamera();
    this.airWeather(dt);
    // the ship on show, while the menu or the hangar shows it
    if (this.state === 'menu' && !this.choosingSolo && !this.choosingSchool && !this.browsing && !this.bench.has('showcase')) this.showcase?.render(wallClock());

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
    // the benchmark keeps the occasional effects running to see what they cost
    if (this.bench.has('glitch') && !this.glitch.pass.enabled) this.glitch.trigger(1, 30);
    if (this.bench.has('datamosh') && !this.datamosh.enabled) this.datamosh.trigger();
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
    if (still && !this.redraw) return false;
    this.redraw = false;
    this.benchCamera?.(this.camera);
    // in a scene in person the camera is the clone's eyes
    this.stage?.pose(this.camera);
    // the kill cam borrows the ships' pictures and the camera for this one picture, from the
    // second picture after the death on: the first one is the cockpit's last, which rots
    const replaying = this.state === 'playing' && !this.datamosh.freezing && this.killcam.pose(this.camera);
    if (replaying !== this.replaying) {
      this.replaying = replaying;
      this.effects.group.visible = !replaying;
      this.replayEffects.group.visible = replaying;
      this.hud.show(!replaying && this.state === 'playing' && !this.sponsors.visible);
    }
    // the air's scenery follows the kill cam's eye (the next frame lays it out for the cockpit's again)
    if (replaying) this.airScene();
    this.paint();
    if (replaying) this.killcam.restore();
    return true;
  }

  private readonly halves = JET_WELDS.map(() => new THREE.Matrix4());

  /** The derelict's mist leaves the torn ends where the halves of the hull have drifted to. */
  private moveBreak() {
    JET_WELDS.forEach((weld, i) => {
      if (!this.field.weldMotion(weld, this.halves[i])) this.halves[i].identity();
    });
    this.landmarks.moveBreak(this.halves);
  }

  /** Draws the scene as the camera sees it: the sky around it, the arena's edge, its landmarks, a black hole's lens. */
  private paint() {
    this.space.follow(this.camera, this.state === 'menu' ? null : this.riding);
    this.arena.mesh.visible = !this.venue.open;
    this.arena.update(this.state !== 'menu' && this.me?.alive ? this.me.flight.position : null);
    this.landmarks.update(this.field.clock);
    if (this.venue.id === 'derelict') this.moveBreak();
    this.mining.update(this.field, this.field.clock);
    this.landmarks.follow(this.camera, this.state === 'menu' ? null : this.riding);
    if (this.venue.id === 'derelict') animateHull(this.field.clock);
    const well = this.field.well;
    // the scene is drawn into the composer's read buffer, which the lens reads right after
    this.lensing.update(this.camera, this.venue.id === 'hole' && well && !this.bench.has('lens') ? well.position : null, well?.radius ?? 0, this.composer.readBuffer.depthTexture);
    this.renderer.info.reset();
    this.updateShadowMap();
    if (!this.bench.size) {
      this.composer.render();
      return;
    }
    // the benchmark hides what it measures for this one picture
    const hidden = this.benchHidden().filter((object) => object.visible);
    for (const object of hidden) object.visible = false;
    if (this.bench.has('post')) this.renderer.render(this.scene, this.camera);
    else this.composer.render();
    for (const object of hidden) object.visible = true;
  }

  /**
   * On the medium tier (shadows still on, a device that may still be weak), the sun's shadow
   * map is refreshed only every other frame: a rock's spin and a ship's flight barely change
   * its shadows between two frames, so the saved pass goes unseen. A frame without the map (the
   * first, or after it changed size) always refreshes it: without one, whatever takes the sun's
   * shadows fails to draw. Elsewhere the renderer refreshes it itself (the default), including
   * during the benchmark, which measures features one frame at a time.
   */
  private updateShadowMap() {
    const medium = !this.bench.size && this.graphics.look.shadows > 0 && this.graphics.rung >= TIER_RUNGS.medium;
    this.renderer.shadowMap.autoUpdate = !medium;
    if (!medium) return;
    this.shadowFrame = (this.shadowFrame + 1) % 2;
    this.renderer.shadowMap.needsUpdate = this.shadowFrame === 0 || !this.space.hasShadowMap;
  }

  /** The parts of the scene the benchmark switched off. */
  private benchHidden(): THREE.Object3D[] {
    const parts: Partial<Record<BenchFeature, THREE.Object3D[]>> = {
      field: [this.field.group],
      belt: [this.belt.group],
      landmark: [this.landmarks.group, this.mining.group],
      sky: [this.space.sky],
      dust: [this.space.dust, this.space.streaks],
      particles: [this.effects.group],
      ships: this.ships.map((ship) => ship.root),
      wrecks: [this.wrecks.group],
      guide: [this.guide.ribbon],
    };
    return [...this.bench].flatMap((feature) => parts[feature] ?? []);
  }

  private updateRound(dt: number) {
    const me = this.me!;
    const now = this.time;
    this.runCues();

    // solo rounds run on real time too, like the radio, so a slow frame rate does not stretch
    // them and the finale of the music meets the end of the round
    if (!this.online && Number.isFinite(this.roundEndsAtWall)) {
      this.roundEndsAt = now + (this.roundEndsAtWall - this.roundClock());
      this.followStart();
    }

    this.ease = Math.max(0, this.ease - dt / EASE_FADE);
    this.weather(dt, now);
    this.direct(now);
    const read = this.state === 'playing' ? this.input.read() : IDLE;
    // in a scene in person the Host's stick turns the clone's head, the ship waits in its clamps
    if (this.stage) this.stage.turnHead(read.yaw, read.pitch, dt);
    const hand = this.stage ? IDLE : this.time < this.tremorUntil ? this.tremble(read) : read;
    if (recorder) this.record(hand, dt);
    const myControls = this.flightComputer(hand);
    if (recorder) this.recorded(myControls);
    this.ignite(myControls);
    const dodge = this.input.takeDodge();
    if (dodge && this.state === 'playing' && !this.spectating && !this.stage) this.dodge(dodge);
    const clamped = (this.clamped = this.startCountdown(myControls));
    // Last Clone Standing: the solar flare, the same on every browser by the field time
    this.showFlare(dt);
    this.playComet(dt, me);
    this.hullPatter(me, dt);
    this.watchHabits(me, dt);
    // a mission's raiders: two press the fight, the rest held back (see bots, pressOn)
    if (this.jumpers) pressOn(this.jumpers.bots, me);
    // removing a ship replaces the list, so the loop safely runs over the list it started with
    for (const ship of this.ships) {
      if (ship.owner !== null) {
        if (ship.alive) this.outside(ship.flight, dt, ship.pull);
        ship.updateRemote(dt, now);
        // the synced throttle is all the drive's trail needs
        if (ship.alive) this.exhaust(ship, dt);
        continue;
      }
      if (!ship.alive) {
        // a mission's claim-jumper (or race rival) shot down stays down
        if (now < ship.respawnAt || ship === this.drone || ship === this.sparring?.bot.ship || ship === this.wingman?.ship || this.jumpers?.bots.some((b) => b.ship === ship) || this.racers?.bots.some((b) => b.ship === ship) || this.out(ship)) continue;
        // the last clone, no printer: black first, then the attempt again (see Drill.lastClone)
        if (ship === me && this.school?.lastClone && !this.noClone) {
          this.noClone = true;
          ship.respawnAt = now + NO_CLONE_SECONDS;
          $('no-clone').hidden = false;
          continue;
        }
        if (ship === me && this.noClone) {
          this.noClone = false;
          $('no-clone').hidden = true;
        }
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
        const aim = this.course && ship.finish < 0 ? this.aimGate(ship, this.course) : -1;
        bot.through = this.course && aim >= 0 ? this.rings[aim] : null;
        bot.waypoint = this.course && aim >= 0 ? this.approach(this.course, ship, this.course.line.target(ship.flight.position, aim, ship.flight.velocity.length(), this.field, this.botPoint(bot))) : null;
        // a probe it sees, as a Host's eyes would, not one behind rock
        bot.lure = this.probes.nearest(ship.flight.position, PROBE_LURE, this.field)?.position ?? null;
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
        // a mission's raiders keep to the place they raid (it has no edge, see keepInArena)
        if (this.jumpers?.bots.includes(bot)) bot.homeAt = this.jumpers.rig;
        bot.prey = null;
        bot.siege = this.fleet ? this.siegePoint(bot, this.fleet) : this.jumpers?.bots.includes(bot) && !this.jumpers.guard ? this.sawPoint(bot, this.jumpers) : null;
        // a mission's rival races its rings
        if (this.racers?.bots.includes(bot)) this.raceRival(bot, this.racers);
        // a race at the bot's own pace, by how good it is; a raid in Capture the Flag at the raiders'
        bot.raceSpeed = this.flags ? FLAG_RAID_SPEED : raceSpeedOf(bot.skills);
        if (this.flags) this.flagRole(bot, this.flags);
      }
      // a claim-jumper keeps sawing until a ship comes within JUMPER_NOTICE of it; then it fights
      const thought = bot ? bot.think(now, this.jumpers?.bots.includes(bot) && !this.jumpers.guard ? this.noticed(ship) : this.ships, this.field) : null;
      // the flight school's unarmed sparring bot only flies
      if (thought && bot === this.sparring?.bot && !this.sparring.armed) thought.fire = false;
      // a bot with a nova core saves it for a crowd of rivals or the battleship's parts, with
      // none of its own side near, and sets it off on less the longer it holds it
      if (bot) bot.novaSince = ship.nova ? Math.min(bot.novaSince, now) : Infinity;
      if (bot && thought?.fire && ship.nova) {
        const siege = this.fleet?.present(this.field.clock) ? this.fleet.novaDamage(ship.flight.position) : 0;
        if (!novaWorth(ship, this.ships, NOVA_RADIUS, now - bot.novaSince, siege)) thought.fire = false;
      }
      // a bot with its target locked, or a part of the battleship it attacks, sends a torpedo
      // now and then (never the flight school's), unless one of its own side is in the way
      if (bot && !clamped && bot !== this.sparring?.bot && (bot.target || bot.siege) && ship.torpedoes > 0 && Math.random() < dt * BOT_TORPEDO_RATE) {
        // against the battleship every ship is on one side: whatever it locks on is a part
        const lock = this.torpedoTarget(ship);
        const line = lock ? toAim.subVectors(lock.flight.position, ship.flight.position) : null;
        const reach = line ? line.length() : 0;
        if (lock && line && (!bot.target || lock === bot.target) && !allyInLine(ship, this.ships, this.field, ship.flight.position, line.divideScalar(Math.max(reach, 1)), reach, TORPEDO_CLEARANCE)) {
          this.fireTorpedo(ship);
          devlog?.add({ kind: 'act', t: now, ship: ship.name, act: 'torpedo', detail: bot.target?.name ?? 'battleship' });
        }
      }
      if (bot && !clamped) this.botHook(bot, dt, now);
      if (bot && !clamped && ship.decoys > 0) this.botDecoy(ship, dt);
      if (bot?.shove && !clamped) this.thrusterKick(ship, bot.shove);
      // the target drone keeps its drive turned to the pilot, wherever the pilot flies: the
      // drills train hitting the drive, not getting around the armor
      if (ship === this.drone && me.alive) ship.flight.orientation.setFromRotationMatrix(facing.lookAt(me.flight.position, ship.flight.position, me.flight.up(upward)));
      // in the clamps of a round's opening the ship is held: no push, no pull, no shot
      if (clamped) ship.flight.velocity.set(0, 0, 0);
      const steered = clamped ? IDLE : ship === me ? myControls : (thought ?? IDLE);
      // a raider who spares clones fires only into a drive (see jumpers); the Loose, harpooning tugs, never into the Magpie's
      const holds = steered.fire && ((this.sparesClones(ship) && !this.onDrive(ship)) || (this.sparesDrives(ship) && this.onDrive(ship)));
      const controls = holds ? { ...steered, fire: false } : steered;
      this.outside(ship.flight, dt, gravity);
      if (clamped) gravity.set(0, 0, 0);
      // under a planet's cloud deck the clouds hide the sun, as a rock does
      ship.inShadow = this.underDeck(ship.flight.position) || this.field.raycast(ship.flight.position, this.space.sunDirection, LASER_RANGE, false, shadeHit) !== null;
      ship.sunCooling = this.venue.cooling;
      if (ship.update(dt, now, controls, gravity)) this.fireLaser(ship);
      this.friction(ship, dt, now);
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
    this.selfDestructOwn(now);
    this.updateHooks(dt);
    this.wrecks.update(dt, now, this.field, this.grinds);
    this.killcam.record(now, this.ships);
    this.replayEffects.update(dt);
    this.decoys.update(dt, now);
    this.torpedoes.update(dt, now, this.field, this.ships, (torpedo, hit) => this.detonate(torpedo, hit), this.touchesSolid);
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
    // the drill judged and the calls of the mode, every step; what the HUD shows of them, once a frame (see presentRound)
    if (this.school) this.teach(dt, myControls);
    else if (this.survival) this.callSurvival(me);
    const racing = !!this.course && !this.school && !this.clamped;
    if (racing) this.callRace(subject);
    this.pushRadio(racing && !this.spectating && me.finish < 0 && lapOf(me.gates) === LAPS);
    // the trigger pulled with the nose on a ship of the own side: Nicole warns
    if (me.alive && this.onTarget === 'friend' && myControls.fire) this.warnFriend(COMPUTER.friend);

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
    } else if (this.brakePhase !== 'off' && me.alive) {
      this.hud.flashMessage(now, this.brakePhase === 'return' ? t('Back on target') : this.brake.rested ? t('At rest') : t('Braking'), 0.2);
    } else if (me.mending && me.alive) {
      this.hud.flashMessage(now, t('Nanobots repairing'), 0.2);
    }

    if (this.online) {
      this.online.update(now);
      this.updateLobby();
      // the room code is in the invite link; the HUD names the tournament, how many Hosts fly and why the relay is missing, if it is
      const relayOff = this.online.session.relayOff;
      const pilots = { name: this.room?.name ?? t('Online'), n: this.online.pilots };
      const hosts = pilots.n === 1 ? t('{name} · {n} Host', pilots) : t('{name} · {n} Hosts', pilots);
      const relayed = relayOff ? t('{hosts} · Relay off: {reason}', { hosts, reason: t(relayOff) }) : hosts;
      const room = this.online.isLead ? t('{room} · You are the game master', { room: relayed }) : relayed;
      if ($('hud-room').textContent !== room) $('hud-room').textContent = room;
      this.showGameMaster(this.online);
      if (now >= this.roundEndsAt) this.showOnlineResults();
    } else {
      if (this.decided() && this.roundEndsAt - now > DECIDED_SECONDS) this.setRoundEnd(DECIDED_SECONDS);
      if (now >= this.roundEndsAt) this.endRound();
    }
  }

  /**
   * What the screen shows of the round, once a frame after its steps (see draw): the ships'
   * tints, the mode's plate and waypoint, a course's rings and racing line, the crosshair, the
   * HUD's gauges and markers, the reference plane and the fixed references, the radar, the
   * attitude and the g-force strain. A slow frame runs several steps, but the DOM, the canvases
   * and the racing line are written only for the last.
   */
  private presentRound() {
    const me = this.me!;
    const now = this.time;
    const subject = this.subject();
    // its gauges too: the own clone is not printed while the Host watches
    if (wallClock() >= this.tintedAt) this.tintShips(wallClock());
    // the mode's plate and where to fly, of the pilot on screen (a watching Host's too); only a
    // course of rings has its rings bracketed and its racing line (see showRace, showSchoolHud)
    this.hud.setGates(this.camera, null, null, 0);
    const waypoint = this.school ? this.showSchoolHud(me) : this.course ? this.showRace(this.course, subject) : this.flags ? this.showFlags(this.flags, subject) : this.fleet ? this.showFleet(this.fleet, subject) : this.survival ? this.showSurvival(me, subject) : null;
    if (!this.course && !this.school) this.guide.hide();
    if (me.alive && this.state === 'playing') this.aimCrosshair(waypoint);
    this.hud.showCrosshair(me.alive);
    // without the targeting module the crosshair never knows a hull under it
    const onTarget = me.alive && this.aid('targeting') ? this.onTarget : null;
    // the nose comes onto a hull: a short tick, as the crosshair turns orange; onto a ship of
    // the own side no tick, the crosshair crossed out (see Hud.setOnTarget)
    if (onTarget && onTarget !== 'friend' && !this.hud.onTarget && now - this.onTargetTickAt > ON_TARGET_TICK) {
      this.onTargetTickAt = now;
      this.sound.beep(1760, 0.03, 0.07);
    }
    this.hud.setOnTarget(onTarget);
    // (the benchmark leaves out the HUD, the radar or the attitude to see what each costs)
    if (!this.bench.has('hud')) {
      this.hud.update(now, Math.max(0, this.roundEndsAt - now), subject);
      // the velocity markers first: the names at the screen's edge keep clear of the Course arrow
      this.hud.updateVelocityMarkers(this.camera, subject, subject === me, !this.autopilot);
      this.hud.updateReturnMark(this.camera, subject === me && this.brakePhase !== 'off' ? returnAt.set(0, 0, -1).applyQuaternion(this.brakeHome) : null);
      // a solar storm blinds the sensors, and a flight computer without the targeting module marks no ship
      const marking = !this.storming && this.aid('targeting');
      this.hud.updateMarkers(this.camera, this.ships, subject, marking ? this.inSight : blind, marking ? this.cueTarget(subject) : null, subject === me ? this.attackerOf : undefined);
    }
    // the fixed references' labels after the ships' names, keeping clear of them
    this.orient(subject, waypoint);
    const radar = this.aid('radar');
    // Nicole's own voice only once the campaign gives it back (see Speaker.thin), and only if the Host keeps it clean
    this.speaker.thin = !this.aid('voice') || (!!this.school?.mission && this.campaign.crackle);
    if ($('radar').hidden === radar) $('radar').hidden = !radar;
    if (radar && !this.bench.has('radar')) this.radar.update(wallClock(), subject, this.ships, this.field, this.sensed, this.radarMarks(subject), this.storming);
    // in a planet's air the horizon is the planet's, from the ship's place (see world/air)
    const air = airAround(this.field.air, subject.flight.position);
    if (!this.bench.has('attitude')) this.hud.updateAttitude(this.camera, subject.alive, this.input.touchActive, air ? upIn(air, subject.flight.position, skyUp) : null);
    // the motion streaks, fewer on a cheaper picture (see view/streaks)
    if (!this.bench.has('streaks')) this.hud.updateStreaks(now, this.camera, subject.flight.velocity, subject.alive, Math.round(STREAKS * Math.max(STREAKS_LEAST, this.graphics.look.particles)));
    this.hud.setAutopilot(this.autopilot);
    this.hud.setOverdrive(Math.max(0, this.overdriveReadyAt - now));
    const hook = this.tethers.get(me);
    this.hud.setHook(hook && hook.flying <= 0 && hook.anchor ? hook.length * METERS_PER_UNIT : null, Math.max(0, this.hookReadyAt - now), this.hookCarried(me));
    this.hud.setArsenal(me.torpedoes, me.twin, me.plating, me.nova, me.decoys);
    this.hud.setKeys(this.input.device);
    // the own ship runs silent: the sensors find it only up close (see Ship.silent)
    const silent = me.alive && me.silent(this.time);
    if ($('hud-silent').hidden === silent) $('hud-silent').hidden = !silent;
    this.hud.setStrain(me.alive ? me.strain : 0);
    this.showJets();
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

  /** Last Clone Standing as it runs: the announcer and Nicole call the flare and the last one standing. */
  private callSurvival(me: Ship) {
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
  }

  /**
   * Last Clone Standing in the HUD: the clones left, who still stands and the flare (how far the
   * front is from the pilot on screen, or how deep it is in the plasma), the safe pocket marked
   * once the flare comes. Returns the pocket's middle for the crosshair, or null before the flare.
   */
  private showSurvival(me: Ship, subject: Ship): THREE.Vector3 | null {
    const clock = this.field.clock;
    const ships = this.standings();
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
      this.flareGlow = 0;
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
    this.flareGlow = strength * (1 - THREE.MathUtils.smoothstep(clearance, -FLARE_GLOW, FLARE_GLOW));
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
      if (!fresh || team < 0 || !ship.alive) continue;
      // every browser sees the side given, and lets go of the cables on the clone printed anew
      this.dropCables(ship);
      if (ship.owner === null) this.respawn(ship);
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
      // a carrier still alive lost it because its tow cable snapped
      if (ship === me && me.alive) this.snapCue();
      else this.hud.flashMessage(now, ours ? t('Your core adrift') : t('{side} core adrift', named), 2);
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
   * What a bot of Capture the Flag does: with the other side's core in tow it flies home, through
   * the middle of its base's ring and on until the core on its cable is through (see
   * Flags.homeRun); its
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
      bot.waypoint = flags.homeRun(side, ship, this.botPoint(bot));
      // the core on its rope would whip around in a tight turn: it eases off until it is round
      const turn = angleTo(ship.flight.velocity, toAim.subVectors(bot.waypoint, ship.flight.position));
      bot.raceSpeed = turn > FLAG_TOW_TURN ? FLAG_RAID_SPEED : FLAG_HOME_SPEED;
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

  /** Whether a racer is past its next gate's plane without having gone through it, and still moving away from it. */
  private missedGate(ship: Ship, course: Course): boolean {
    const next = ship.gates % GATES;
    return scratch.subVectors(ship.flight.position, course.points[next]).dot(course.normals[next]) > GATE_RADIUS && ship.flight.velocity.dot(course.normals[next]) > 0;
  }

  /** The gate a racer flies for: its next, or, past that one with the lap's skip still to spend (see canSkip), the one after it. */
  private aimGate(ship: Ship, course: Course): number {
    const next = ship.gates % GATES;
    return canSkip(ship.gates, ship.skipLap) && this.missedGate(ship, course) ? (next + 1) % GATES : next;
  }

  /** Where a racer flies for near the gate it aims at, clear of the coil's housings (see approachGate). */
  private approach(course: Course, ship: Ship, waypoint: THREE.Vector3): THREE.Vector3 {
    const next = this.aimGate(ship, course);
    return approachGate(course.points[next], course.normals[next], GATE_RADIUS, ship.flight.position, ship.flight.velocity, ship.radius, waypoint);
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
    // a core the hook may bite from here: the harpoon takes it from afar
    if (me.alive && flags.hookable(me).some((mark) => mark.position === goal) && me.flight.position.distanceTo(goal) < HOOK_RANGE) label = goal === own.position ? t('Your core · in hook range') : t('Their core · in hook range');
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
    // what its hull rammed aside, for the other browsers
    for (const state of fleet.rams) {
      this.online?.sendRam(state, this.roundId);
      this.scrape(fleet, state.id);
    }
    fleet.rams.length = 0;
    fleet.update(clock, now);
    fleet.view(this.camera.position);
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
      if (d < distance && fleet.sees(zone, ship.flight.position, this.field)) {
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
   * An own ship's laser (one hit), torpedo (TORPEDO_HITS) or nova core (by its distance, see
   * Fleet.novaHits) hit a part of the battleship: every browser counts it; the shooter scores
   * each hit and the part it breaks.
   */
  private hitFleet(fleet: Fleet, zone: number, shooter: Ship, point: THREE.Vector3, count = 1, weapon: FleetWeapon = 'laser') {
    this.effects.sparks(point, shooter.color, 60);
    if (this.roundOver) return;
    this.online?.sendFleetHit(zone, this.roundId, shooter, count, weapon === 'nova');
    shooter.score += FLEET_HIT_POINTS * count;
    devlog?.add({ kind: 'fleet', t: this.time, event: 'hit', ship: shooter.name, part: fleet.zones[zone].kind, zone, weapon, count });
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

  /**
   * The field's pieces meet each other and the rings (see world/contacts): the lead browser, or
   * a solo round, decides on the grid of field time and sends each motion it gave; the others
   * take the lead's (see remoteKnock) and start afresh should they become the lead.
   */
  private knock() {
    if (this.online && !this.online.isLead) {
      this.contacts.reset();
      return;
    }
    for (const state of this.contacts.run(this.field)) this.online?.sendKnock(state, this.roundId);
    this.sendFieldSync();
  }

  /** The next slice of the lead's field it sends (see world/fieldsync), and the field time it is due. */
  private syncSlice = 0;
  private syncDue = 0;

  /** The lead browser sends a slice of its field every SYNC_EVERY seconds of field time, the slices in turn, with when the round's comets' heads broke up. */
  private sendFieldSync() {
    const online = this.online;
    const clock = this.field.clock;
    if (!online || this.roundId < 0) return;
    // a new round's field starts its clock over
    if (this.syncDue - clock > SYNC_EVERY) this.syncDue = clock;
    if (clock < this.syncDue) return;
    this.syncDue = clock + SYNC_EVERY;
    online.sendFieldSync(fieldSlice(this.field, this.syncSlice), this.roundId, this.comets.map((comet) => (comet.broken === Infinity ? null : comet.broken)));
    this.syncSlice = (this.syncSlice + 1) % SYNC_SLICES;
  }

  /**
   * A slice of the lead's field (see world/fieldsync): this browser sets its own to it, every
   * motion within the bounds of syncShare, and its comets' heads to where the lead's broke up
   * (one the lead has whole, broken here longer than SYNC_GRACE ago, flies on).
   */
  syncField(slice: FieldSlice, round: number, heads: (number | null)[]) {
    if (this.online?.isLead || (this.roundId >= 0 && round !== this.roundId)) return;
    const result = syncField(this.field, slice, (state) => syncShare(hypot(state.v[0], state.v[1], state.v[2]), state.s[3]) <= 1);
    if (result.rebuilt || result.eased || result.set) devlog?.add({ kind: 'sync', t: this.time, slice: slice.i, ...result });
    heads.forEach((at, i) => {
      const comet = this.comets[i];
      if (!comet) return;
      if (at === null) {
        if (comet.broken < slice.t - SYNC_GRACE) comet.broken = Infinity;
      } else if (Math.abs(comet.broken - at) > 1e-3) {
        const whole = comet.broken === Infinity;
        comet.broken = at;
        if (whole && this.shower?.comet === comet) this.headBroke(comet);
      }
    });
  }

  /** A piece of the field struck another or a ring as the lead decided: it takes the motion the lead gave it, if that lies close to where this browser has it (see knockShare). */
  remoteKnock(state: ShovedState, round: number) {
    const piece = this.field.asteroids.get(state.id);
    if (!piece || !this.fieldMotion(piece, state, round)) return;
    const before = this.field.positionOf(piece, state.b, scratch);
    const age = state.b - this.field.clock;
    // the cheap bounds first, the search for what it struck only for a blow they pass
    if (knockShare(before, rammedTo.fromArray(state.p), hypot(state.v[0], state.v[1], state.v[2]), age, 0) > 1) return;
    if (knockShare(before, rammedTo, 0, age, this.contacts.gap(this.field, piece, state.b)) > 1) return;
    this.field.move(state);
  }

  /**
   * Whether a motion the lead gave a piece belongs to this browser's field: of its round (a
   * newcomer that does not know the round yet takes it for the field it has, as a rock's break),
   * and no older than the motion the piece has (a knock and a ram arriving out of order, or
   * after a comet's shove here). What the order loses, the lead's sync of the field sets right
   * (see syncField).
   */
  private fieldMotion(piece: Asteroid, state: ShovedState, round: number): boolean {
    return (this.roundId < 0 || round === this.roundId) && state.b >= piece.born - STALE_MOTION;
  }

  /** The lead's battleship rammed a piece of the field: it takes the motion the lead gave it, if it lay at the hull as this browser sees them (see ramShare). */
  remoteRam(state: ShovedState, round: number) {
    const fleet = this.fleet;
    const piece = this.field.asteroids.get(state.id);
    if (!fleet || !piece || !this.fieldMotion(piece, state, round)) return;
    const before = this.field.positionOf(piece, state.b, scratch);
    if (ramShare(before, rammedTo.fromArray(state.p), hypot(state.v[0], state.v[1], state.v[2]), fleet.position, fleet.reach + piece.radius, state.b - this.field.clock) > 1) return;
    this.field.move(state);
    this.scrape(fleet, state.id);
  }

  /** The battleship's armor grinds against a piece it rams: sparks and grit where the hull meets it on the way from the piece to its center, heard as debris is. */
  private scrape(fleet: Fleet, id: string) {
    const piece = this.field.asteroids.get(id);
    if (!piece) return;
    const center = piece.object.position;
    rammedTo.subVectors(fleet.position, center);
    const way = rammedTo.length();
    if (way < 1) return;
    rammedTo.divideScalar(way);
    const hull = fleet.ray(center, rammedTo, way) ?? piece.meanRadius;
    scratch.copy(center).addScaledVector(rammedTo, hull);
    // as large as the piece, up to a big chunk's (100 m)
    const size = Math.min(piece.meanRadius, 2000);
    this.effects.sparks(scratch, SCRAPE_COLOR, size * 0.5);
    this.effects.debris(scratch, rammedTo.negate(), size * 0.4);
    this.hearDebris(scratch, size);
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
        devlog?.add({ kind: 'fleet', t: Math.round(this.time), event: 'broken', ship: shooter?.name ?? null, part: kind, zone: event.zone, weapon: null, count: 0 });
        this.effects.explosion(event.position, 1500, fleet.velocity);
        this.hearDebris(event.position, 1500);
        if (shooter?.owner === null) shooter.score += ZONE_POINTS[kind];
        if (shooter?.isLocal) this.hud.popup(this.camera, event.position, `+${ZONE_POINTS[kind]}`, 'points');
        this.hud.flashMessage(this.time, t('{part} destroyed', { part: t(ZONE_NAMES[kind]) }), 2);
      } else if (event.kind === 'sunk') {
        // the reactor goes critical; SINK_SECONDS later the battleship goes up
        const position = event.position.clone();
        devlog?.add({ kind: 'fleet', t: Math.round(this.time), event: 'sunk', ship: shooter?.name ?? null, part: 'reactor', zone: -1, weapon: null, count: 0 });
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

  /**
   * Where a claim-jumper saws at its rig (see jumpers): it holds SAW_DISTANCE off the rig on its
   * own side, and has it in sight when the first thing its beam would meet is the rig's rock.
   */
  private sawPoint(bot: Bot, jumpers: { rock: string | null; rig: THREE.Vector3; hold: number }): THREE.Vector3 {
    const from = bot.ship.flight.position;
    bot.siegeHold.subVectors(from, jumpers.rig).normalize().multiplyScalar(jumpers.hold).add(jumpers.rig);
    sawWay.subVectors(jumpers.rig, from);
    const distance = sawWay.length();
    const first = this.field.raycast(from, sawWay.divideScalar(Math.max(distance, 1)), distance + SAW_REACH, false, sawHit);
    // a rig: its rock is the first thing in the way; a hull of the drill's: no rock before it
    bot.siegeClear = jumpers.rock !== null ? first?.asteroid?.id === jumpers.rock : !first;
    return jumpers.rig;
  }

  /** The ships a claim-jumper heeds: itself, and the others within JUMPER_NOTICE of it. */
  private noticed(jumper: Ship): Ship[] {
    return this.ships.filter((ship) => ship === jumper || ship.flight.position.distanceTo(jumper.flight.position) < JUMPER_NOTICE);
  }

  /**
   * Raiders at a target (see jumpers): `count` bots of `skill` named from `names` around it,
   * `hold` off it, each firing at it while no ship comes near (see sawPoint); `rock` the rock a
   * rig stands on, or null for a hull of the drill's; `guard`: guarding it instead.
   */
  private spawnJumpers(rock: string | null, rig: THREE.Vector3, count: number, skill: Skill | readonly Skill[], names: readonly string[] = ['Saw'], hold = SAW_DISTANCE, guard = false, hooks = false) {
    this.removeJumpers();
    const bots: Bot[] = [];
    for (let i = 0; i < count; i++) {
      const ship = this.addShip(`jumper${i}`, names[i % names.length], i % 2 ? 'alien' : 'human', false);
      // brothers: one side, never at each other
      ship.team = JUMPER_TEAM;
      const bot = new Bot(ship, skillsFrom(Array.isArray(skill) ? (skill[i] ?? skill[skill.length - 1]) : (skill as Skill)));
      this.bots.push(bot);
      bots.push(bot);
      const angle = (i / count) * Math.PI * 2;
      const at = jumperAt.set(cos(angle) * hold, hold * 0.5, sin(angle) * hold).add(rig);
      ship.spawn(at, lookingAt(at, rig, upward.set(0, 1, 0)), this.time);
      ship.protectedUntil = this.time;
    }
    this.jumpers = { bots, rock, rig: rig.clone(), hold, hits: 0, guard, hooks, spares: false, blanks: false };
  }

  /**
   * A mission's rival in its race (see racers): it flies the racing line to its next ring and
   * through it, counts a ring when it crosses the ring's plane inside it, and once it has flown
   * every lap it is done and loiters.
   */
  private raceRival(bot: Bot, racers: NonNullable<Game['racers']>) {
    const i = racers.bots.indexOf(bot);
    const total = racers.rings.length * racers.laps;
    if (racers.passed[i] >= total) {
      bot.through = bot.waypoint = null;
      return;
    }
    const k = racers.passed[i] % racers.rings.length;
    const flight = bot.ship.flight;
    const side = rivalOffset.subVectors(flight.position, racers.rings[k]).dot(racers.normals[k]);
    const before = racers.sides[i];
    racers.sides[i] = side;
    if (Number.isFinite(before) && before < 0 !== side < 0 && rivalOffset.addScaledVector(racers.normals[k], -side).length() < racers.radius) {
      racers.passed[i]++;
      racers.sides[i] = NaN;
      if (racers.passed[i] >= total) racers.finished++;
      return;
    }
    bot.through = { center: racers.rings[k], facing: racers.normals[k], radius: racers.radius };
    const ahead = racers.line.target(flight.position, k, flight.velocity.length(), this.field, this.botPoint(bot));
    bot.waypoint = approachGate(racers.rings[k], racers.normals[k], racers.radius, flight.position, flight.velocity, bot.ship.radius, ahead);
    bot.raceSpeed = raceSpeedOf(bot.skills);
  }

  /** A mission's rivals at the start of their race (see racers): `count` bots of `skill` (or each of its own `skills`) named from `names`, beside `start`, facing the first of the openings (`radius` theirs). */
  private spawnRacers(rings: THREE.Vector3[], normals: THREE.Vector3[], radius: number, laps: number, count: number, skill: number, start: THREE.Vector3, names: readonly string[] = RIVAL_NAMES, skills?: readonly number[]) {
    this.removeRacers();
    const bots: Bot[] = [];
    for (let i = 0; i < count; i++) {
      const ship = this.addShip(`racer${i}`, names[i % names.length], i % 2 ? 'human' : 'alien', false);
      const bot = new Bot(ship, evenSkills(skills?.[i] ?? skill));
      this.bots.push(bot);
      bots.push(bot);
      const at = rivalAt.set((i + 1) * RIVAL_GAP * (i % 2 ? 1 : -1), 0, 0).applyQuaternion(lookingAt(start, rings[0], upward.set(0, 1, 0))).add(start);
      ship.spawn(at, lookingAt(at, rings[0], upward.set(0, 1, 0)), this.time);
      ship.protectedUntil = this.time;
    }
    this.racers = { bots, rings, normals, radius, line: new RacingLine(rings, true), laps, passed: bots.map(() => 0), sides: bots.map(() => NaN), finished: 0 };
  }

  private removeRacers() {
    for (const bot of this.racers?.bots ?? []) this.removeShip(bot.ship);
    this.racers = null;
  }

  /** The white of a cut link over the picture, with its words (see SchoolContext.linkLost), or gone. */
  private showLinkLost(on: boolean) {
    $('link-lost').hidden = !on;
  }

  /** The wingman gone, and the Host on no side again. */
  private removeWingman() {
    if (this.wingman) this.removeShip(this.wingman.ship);
    this.wingman = null;
    if (this.me) this.me.team = -1;
  }

  private removeJumpers() {
    for (const bot of this.jumpers?.bots ?? []) this.removeShip(bot.ship);
    this.jumpers = null;
  }

  /** The part of the battleship a bot attacks: the nearest it can hurt; none while the battleship is away. */
  private siegePoint(bot: Bot, fleet: Fleet): THREE.Vector3 | null {
    if (!fleet.present(this.field.clock)) return null;
    const zone = fleet.nearestZone(bot.ship.flight.position);
    if (zone < 0) return null;
    // where it shows itself, and whether it does from where the bot is, as a pilot sees it
    fleet.siegeFrom(zone, bot.ship.flight.position, SIEGE_DISTANCE, bot.siegeHold);
    bot.siegeClear = fleet.inSight(zone, bot.ship.flight.position, this.field);
    return fleet.zoneAt(zone, this.botPoint(bot));
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
      const next = this.aimGate(subject, course);
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
      headAt(this.shower.comet, Math.min(this.field.clock, headEnd(this.shower.comet)), this.cometMark.position);
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
    let gate = ship.gates % GATES;
    let off = course.crossing(gate, ship.previous, ship.flight.position);
    // the gate after the next counts too while the lap's skip is not spent (see canSkip): the
    // next one is left out, without its points
    if (off === null && canSkip(ship.gates, ship.skipLap)) {
      const after = (gate + 1) % GATES;
      off = course.crossing(after, ship.previous, ship.flight.position);
      if (off === null) return;
      ship.skipLap = lapOf(ship.gates);
      if (ship === this.me) {
        this.timeLap(gate);
        this.hud.flashMessage(this.time, t('Gate {n} skipped · your one skip this lap', { n: gate + 1 }), 2);
      }
      ship.gates++;
      gate = after;
    }
    if (off === null) return;
    if (off < BOOST_RADIUS) this.boost(ship, course, gate);
    ship.gates++;
    ship.score += GATE_POINTS;
    if (ship === this.me) this.timeLap(gate);
    if (ship.gates >= FINISH_GATES) {
      ship.finish = +this.raceSeconds().toFixed(2);
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
    const t = this.roundSeconds();
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
      pilots: pilots.map((ship) => ({ name: ship.name, kind: ship.kind, tint: shownTint(ship), glow: ship.trophy?.glow ?? null, skills: ship.kind === 'bot' ? skillScales(skillsOf(ship.name)) : '', own: ship === this.me })),
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
    const left = INTRO_SECONDS - this.roundSeconds();
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
    // a bot lights its drive as a Host does, by its own timing: a perfect start within the
    // window, a stall when too early, nothing when too late
    for (const bot of this.bots) {
      if (bot.ship.owner !== null || !bot.ship.alive || bot === this.sparring?.bot) continue;
      const lit = startTiming(bot.skills.reflexes, Math.random());
      if (lit < -START_WINDOW) this.stall(bot.ship);
      else if (lit <= START_LATE) this.perfectStart(bot.ship);
      devlog?.add({ kind: 'act', t: this.time, ship: bot.ship.name, act: 'start', detail: lit < -START_WINDOW ? 'false start' : lit <= START_LATE ? 'perfect' : 'late' });
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
    if (ship !== this.me) return;
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
    ship.strain = Math.max(ship.strain, BOOST_STRAIN);
    if (ship !== this.me) return;
    this.boostKick = 1;
    this.effects.sparks(ship.flight.position, BOOST_COLOR, 120);
    this.sound.play('boost', { volume: 1.3 });
    this.sound.beep(1568, 0.05, 0.1);
    this.sound.beep(2093, 0.09, 0.1, 0.06);
    this.hud.flashMessage(this.time, t('Coil boost'), 1);
  }

  /** Seconds since the round started; 0 while an online round is not known yet. */
  roundSeconds() {
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

  /** The next ring of a course in the HUD: its brackets, the ring after it, and where the own flight crosses its plane (see Hud.setGates). */
  private markRings(me: Ship, next: THREE.Vector3 | null, normal: THREE.Vector3 | null, after: THREE.Vector3 | null, radius: number) {
    const off = next && normal && me.alive ? pathCrossing(me.flight.position, me.flight.velocity, next, normal, CROSSING_HORIZON, crossingPoint) : null;
    this.hud.setGates(this.camera, next, after, radius, off === null ? null : crossingPoint, off !== null && off < radius);
  }

  /** The racing line from a ship on to gate `next` of an ideal line: it leaves along the flight, or along the nose of a ship that hardly moves. */
  private showGuide(me: Ship, line: RacingLine, next: number, missed: boolean) {
    if (!this.aid('racingLine')) {
      this.guide.hide();
      return;
    }
    const speed = me.flight.velocity.length();
    const heading = speed > 20 ? scratch.copy(me.flight.velocity).divideScalar(speed) : me.flight.forward(scratch);
    this.guide.show(me.flight.position, heading, speed, me.flight, line, this.field, next, missed, wallClock());
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
    const lap = lapOf(me.gates);
    // past its next gate with the lap's skip still to spend, the racer flies on for the one after
    // it (see canSkip); past it with the skip spent, it has to turn back
    const next = this.aimGate(me, course);
    const skipping = next !== me.gates % GATES;
    const missed = !skipping && this.missedGate(me, course);
    course.highlight(next, this.time);
    const gate = { n: next + 1, gates: GATES };
    const label = missed ? t('Missed · turn back') : next === 0 ? (me.gates === 0 ? t('Start') : lap === LAPS ? t('Finish') : t('Lap')) : t('Gate {n}/{gates}', gate);
    this.hud.setWaypoint(this.camera, course.points[next], label);
    this.markRings(me, course.points[next], course.normals[next], course.points[(next + 1) % GATES], GATE_RADIUS);
    if (me.alive) this.showGuide(me, course.line, next, missed);
    else this.guide.hide();
    // the running lap's clock, and the best lap of this arena to beat
    const lapTime = this.laps?.lapTime(this.raceSeconds());
    const best = this.laps?.best ? ` · ${t('best {time}', { time: lapClock(this.laps.best.time) })}` : '';
    const timing = lapTime != null ? ` · ${lapClock(lapTime)}${best}` : '';
    const text = missed
      ? t('Missed gate {n}: turn back and fly through it', gate)
      : skipping
        ? t('Missed gate {missed}: fly on through gate {n}, your one skip this lap', { missed: (me.gates % GATES) + 1, n: next + 1 })
        : `${t('Gate {n} of {gates}', gate)}${timing}`;
    this.hud.setSchool({ step: t('Race · lap {lap}/{laps} · {place}', { lap, laps: LAPS, place }), text, keys: [] });
    return course.points[next];
  }

  /** Seconds since BURN!: the race time every finish and lap is measured in. */
  raceSeconds() {
    return this.roundSeconds() - START_AT;
  }

  /**
   * The own racer flew through gate `gate` of the lap: the split against the best lap, or the
   * lap's time; a new best lap is kept in this browser.
   */
  private timeLap(gate: number) {
    const event = this.laps?.pass(gate, this.raceSeconds());
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

  /**
   * A planet's air around the camera, once a frame (see airScene), and what the own pilot hears
   * of the air outside: the wind by its push on the hull, thunder after lightning, coming as fast
   * as sound runs through hydrogen (SOUND_SPEED), only while the own ship is in the air.
   */
  private airWeather(dt: number) {
    const struck = this.airScene();
    const air = this.field.air;
    const jupiter = this.landmarks.jupiter;
    if (!air) {
      this.quietAir();
      return;
    }
    // the own ship in the air hears it: none in the menu, none for a dead clone
    const me = this.state === 'playing' ? this.me : null;
    const inAir = !!me?.alive && altitudeIn(air, me.flight.position) < 0;
    if (!me || !inAir) {
      this.quietAir();
      return;
    }
    this.airHeard = true;
    const speed = me.flight.velocity.length() / MAX_SPEED;
    this.sound.setPlasma(this.reentry.plasmaOf(me), this.reentry.burning(me), dt);
    this.sound.setWind(Math.min(1, (density(altitudeIn(air, me.flight.position)) * speed * speed) / WIND_FULL), Math.min(1, speed));
    if (struck) {
      const distance = jupiter.strikePoint.distanceTo(me.flight.position);
      this.sound.thunder(Math.min(1, THUNDER_LOUD / pow(1 + distance / THUNDER_REACH, 2)), distance / SOUND_SPEED, exp(-distance / THUNDER_REACH));
    }
  }

  /**
   * A planet's air as the camera sees it where it is now (see world/jupiter, view/haze): the
   * sheets of cloud, the sky and the lightning; the sun's and the sky's light as the haze lets
   * them through; where nothing is drawn, the deep haze's color under the deck. Laid out again
   * for the kill cam's eye while it replays. Returns whether a strike of lightning began.
   */
  private airScene(): boolean {
    const air = this.field.air;
    const jupiter = this.landmarks.jupiter;
    // a room shut in rock: no sun, a trace of the sky, no weather
    if (this.stage?.indoors) {
      this.space.shade(0, INDOORS_SKY, null, null);
      this.background.copy(this.space.background);
      return false;
    }
    if (!air) {
      this.space.shade(1, 1, null, null);
      this.background.copy(this.space.background);
      return false;
    }
    const eye = this.camera.position;
    const shade = this.haze.shadeAt(eye, this.space.sunDirection.dot(up.subVectors(eye, air.center).normalize()));
    this.space.shade(shade.sun, shade.sky, jupiter.deckLight, jupiter.deepLight);
    const depth = altitudeIn(air, eye);
    if (depth < 0) this.background.copy(jupiter.deepLight).lerp(jupiter.deckLight, exp(depth / BACKGROUND_DEPTH));
    else this.background.copy(this.space.background);
    return jupiter.update(this.field.clock, eye, this.sheetLight);
  }

  /** Turns the air's wind and plasma down, once: not again every frame while nothing sounds. */
  private quietAir() {
    if (!this.airHeard) return;
    this.airHeard = false;
    this.sound.setWind(0, 0);
    this.sound.setPlasma(0, false, 0);
  }

  /**
   * The air's heat on the own hull (see world/air): CAUTION once the air heats it faster than its
   * radiators shed, naming the safe speed at its depth (see safeSpeed), WARNING once the heat has
   * the laser nearly locked, CRITICAL while the hull burns; the alarm points up, out of the air.
   * Nicole speaks once for each level until the hull has cooled again; the screen glows with the heat.
   */
  private airAlarm(me: Ship) {
    const air = this.field.air;
    this.airGlow = 0;
    if (!air || !me.alive) {
      this.airSaid = 0;
      return;
    }
    const altitude = altitudeIn(air, me.flight.position);
    up.subVectors(me.flight.position, air.center);
    this.clogAlarm(me, up);
    // what the radiators shed beyond the reactor's waste heat a clog holds in is left for the air
    const cooling = Math.max(0, me.cooling - REACTOR_WASTE * me.clog);
    if (heatInto(altitude, me.flight.velocity.length(), me.clog) <= me.cooling) {
      if (me.heat < AIR_COOL) this.airSaid = 0;
      return;
    }
    const level = me.heat >= MAX_HEAT ? 'critical' : me.heat >= AIR_HOT ? 'warning' : 'caution';
    const safe = Math.round(safeSpeed(altitude, cooling) * METERS_PER_UNIT);
    this.alarms.raise({ id: 'air', level, text: t('HULL HEAT · SAFE {speed} m/s', { speed: safe }), direction: up });
    this.airGlow = AIR_GLOW[level];
    const said = level === 'critical' ? 2 : 1;
    // a line Nicole could not say yet (she was speaking) is tried again the next frame
    if (said > this.airSaid && level !== 'warning' && this.speaker.say(said === 2 ? COMPUTER.airBurn : COMPUTER.airHot, said === 2 ? 'urgent' : undefined)) this.airSaid = said;
  }

  /**
   * The clouds' crust on the own radiators (see world/air, clogging): CAUTION from CLOG_CAUTION,
   * WARNING from CLOG_WARNING, pointing up, out of the clouds; Nicole says it once a dive, when
   * the warning comes, and again only once the radiators were nearly clean.
   */
  private clogAlarm(me: Ship, out: THREE.Vector3) {
    if (me.clog < CLOG_QUIET) this.clogSaid = false;
    if (me.clog < CLOG_CAUTION) return;
    const level = me.clog >= CLOG_WARNING ? 'warning' : 'caution';
    this.alarms.raise({ id: 'clog', level, text: t('RADIATORS CLOGGED {n} %', { n: Math.round(me.clog * 100) }), direction: out });
    if (level === 'warning' && !this.clogSaid && this.speaker.say(COMPUTER.clog)) this.clogSaid = true;
  }

  /** Runs the flight school for this step: judges the drill, and leaves its marker and racing line for the HUD (see showSchoolHud). */
  private teach(dt: number, controls: Controls) {
    const school = this.school!;
    const context = (this.schoolContext ??= this.createSchoolContext());
    context.controls = controls;
    context.braking = this.brakePhase === 'brake';
    const hook = this.tethers.get(this.me!);
    context.hooked = !!hook?.anchor && hook.flying <= 0;
    context.hookedShip = context.hooked ? (hook!.anchor!.ship ?? null) : null;
    context.hookedRock = context.hooked ? (hook!.anchor!.rock ?? null) : null;
    context.autopilot = this.autopilot;
    context.cockpit = this.cockpit;
    context.impactAhead = this.impactAhead;
    context.device = this.input.device;
    context.now = this.time;
    context.dt = dt;
    context.orbit = this.orbitState;
    // a drill flown in another arena (the orbit's at the Event Horizon): the Host's link goes to a
    // clone printed there, out of the well's grip, and back home after it
    const arena = school.arena ? arenaById(school.arena)! : DEFAULT_ARENA;
    if (arena !== this.venue) {
      this.enterArena(arena);
      if (this.me!.alive) this.respawn(this.me!);
    }
    // a night in the Pit ends with its clone: Kesh's purse for the waves cleared, the record kept, back to the board
    if (this.mission?.pit && !this.me!.alive) {
      this.endPit();
      return;
    }
    const step = school.stepIndex;
    const waypoint = school.update(context);
    const course = school.course;
    if (school.stepIndex !== step) {
      this.sound.beep(880, 0.1, 0.15);
      if (course) keepSchoolSteps({ ...schoolSteps(), [course]: school.stepIndex });
      else if (!this.flyingAgain && (!this.mission || keepsStep(this.mission))) {
        this.keepCampaign((campaign) => {
          campaign.step = school.stepIndex;
          campaign.run = { fine: this.missionFine, style: this.missionStyle, gold: this.goldRun };
        });
      }
    }
    // a trial's drills done: its round is flown next (see Mission.trial, endRound)
    if (school.finished && this.mission?.trial && !this.trialOf) {
      this.startTrial(this.mission);
      return;
    }
    // a visit to a bar over (see Mission.bar): nothing paid or counted, back to the job board
    if (school.finished && this.mission?.bar) {
      this.mission = null;
      this.schoolMark = this.schoolTrack = null;
      this.showMenu();
      this.showBoard(true);
      return;
    }
    // a mission flown again done: nothing paid but its medals (a side job its fee), back to the job board
    if (school.finished && this.mission && this.flyingAgain) {
      const mission = this.mission;
      let bonus: number | null = null;
      let golden: number | null = null;
      let mastered: number | null = null;
      let fee: ReturnType<typeof flownAgain> = { kept: 0, cut: 0, standing: null };
      let bet: number | null = null;
      this.keepCampaign((campaign) => {
        bonus = medal(campaign, mission, this.cleanRun);
        golden = gold(campaign, mission, this.goldRun);
        mastered = master(campaign, mission, this.cleanRun, this.untouched, this.goldRun);
        fee = flownAgain(campaign, mission, this.missionFine);
        bet = settleBet(campaign, mission, this.goldRun);
      });
      this.flyingAgain = false;
      this.mission = null;
      this.schoolMark = this.schoolTrack = null;
      this.showMenu();
      this.showBoard(true);
      const paid = fee.kept + fee.cut ? (this.campaign.held ? t('{mission} done again: {kept} ☉ for you.', { mission: t(mission.name), kept: coinText(fee.kept) }) : t('{mission} done again: {kept} ☉ for you, {cut} ☉ for the yard.', { mission: t(mission.name), kept: coinText(fee.kept), cut: coinText(fee.cut) })) : '';
      const won = [paid, bonus !== null ? this.medalText(bonus) : '', golden !== null ? this.goldText(golden) : '', mastered !== null ? this.masterText(mastered) : '', this.standingText(fee.standing), bet === null ? '' : bet ? t('Kesh pays your bet: {coins} ☉.', { coins: coinText(bet) }) : t('No gold: the book keeps your stake.')].filter(Boolean).join(' ');
      if (won) this.notice(won);
      if (bet !== null) this.speaker.say(bet ? KESH.betWon : KESH.betLost);
      return;
    }
    // a mission of the campaign done: paid (its medal too, if flown clean), and back to the menu
    if (school.finished && this.mission) {
      const mission = this.mission;
      let paid: ReturnType<typeof complete> = { kept: 0, cut: 0, ratings: 0, rank: null, standing: null };
      let bonus: number | null = null;
      let golden: number | null = null;
      let mastered: number | null = null;
      this.keepCampaign((campaign) => {
        paid = complete(campaign, mission, this.missionFine, this.missionStyle);
        bonus = medal(campaign, mission, this.cleanRun);
        golden = gold(campaign, mission, this.goldRun);
        mastered = master(campaign, mission, this.cleanRun, this.untouched, this.goldRun);
      });
      this.missionFine = 0;
      this.cleanRun = true;
      this.untouched = true;
      this.goldRun = false;
      this.missionStyle = 0;
      // the story runs on into its next mission without the menu, from the pad; the menu only
      // once all that is built is flown, and the job board after a side trip
      this.mission = mission.side ? null : nextMission(this.campaign);
      this.schoolMark = this.schoolTrack = null;
      if (this.mission) this.startRound('school');
      else this.showMenu();
      if (mission.side) this.showBoard(true);
      const done =
        paid.kept + paid.cut === 0
          ? t('{mission} done.', { mission: t(mission.name) })
          : this.campaign.held
            ? t('{mission} done: {kept} ☉ for you, {ratings} ratings.', { mission: t(mission.name), kept: coinText(paid.kept), ratings: paid.ratings })
            : t('{mission} done: {kept} ☉ for you, {cut} ☉ for the yard, {ratings} ratings. You still owe {bond} ☉.', { mission: t(mission.name), kept: coinText(paid.kept), cut: coinText(paid.cut), ratings: paid.ratings, bond: coinText(this.campaign.bond) });
      const ranked = paid.rank ? `${done} ${t('The feeds rank you: {rank}.', { rank: t(paid.rank) })}` : done;
      this.notice([ranked, bonus !== null ? this.medalText(bonus) : '', golden !== null ? this.goldText(golden) : '', mastered !== null ? this.masterText(mastered) : '', this.standingText(paid.standing)].filter(Boolean).join(' '));
      this.schoolMark = this.schoolTrack = null;
      return;
    }
    if (school.finished && course) {
      this.coursesDone.add(course);
      this.keepEarned(SCHOOL_DONE_KEY);
      keepSchoolSteps({ ...schoolSteps(), [course]: undefined });
      // back on the school's plate: the next course is a key away
      this.showMenu();
      this.showSchool(true);
      this.schoolMark = this.schoolTrack = null;
      return;
    }
    const me = this.me!;
    this.seekFinds(me);
    // a hit on the own hull, and the run is no master's (see campaign/campaign, master)
    if (me.alive && me.hull < MAX_HULL) this.untouched = false;
    // in person the people stand in the room: no hologram calls in
    this.showCaller(me.alive && !this.stage ? school.caller : null);
    this.schoolMark = waypoint;
    // a ring course has its racing line, as a race does; any other marker a line to it, from
    // where the pilot was in the step the marker came up
    if (!waypoint) this.schoolLine = null;
    this.schoolTrack = school.track ?? (waypoint && me.flight.position.distanceTo(waypoint) > SCHOOL_LINE_MIN ? this.lineTo(me, waypoint) : null);
  }

  /**
   * The black boxes and data chips of the place a job of the campaign is flown at (see
   * campaign/hunt), in the cockpit only: Nicole names the nearest within its ping once a visit, and
   * the hull takes what it flies within reach of. A black box's last words go up on screen, its
   * place's last one brings the families' reward over Rask's comm; a chip's track plays next.
   */
  private seekFinds(me: Ship) {
    const place = this.mission && !this.stage && isHuntPlace(this.venue.id) ? this.venue.id : null;
    // each find named once a visit: a scene in person on the way (no place) keeps what was named
    if (place && place !== this.pingedAt) {
      this.pinged.clear();
      this.pingedAt = place;
    }
    const found = (id: string) => this.campaign.tags.includes(id) || this.campaign.chips.some((chip) => chipId(chip) === id);
    const { near, take } = this.hunt.update(place, this.field, found, me.alive ? me.flight.position : null, this.time);
    if (near && !this.pinged.has(near.id) && this.speaker.say(near.kind === 'tag' ? CAMPAIGN.blackBoxPing : CAMPAIGN.chipPing, 'chatter')) this.pinged.add(near.id);
    if (take && place) this.takeFind(take, place);
  }

  /** The place of the visit whose finds Nicole has named (see seekFinds). */
  private pingedAt: HuntPlace | null = null;

  /** A find taken: kept with the campaign, and what it holds shown, played or paid. */
  private takeFind(find: Find, place: HuntPlace) {
    this.pinged.add(find.id);
    this.sound.beep(1320, 0.12, 0.15);
    if (find.kind === 'chip') {
      this.keepCampaign((campaign) => takeChip(campaign, place));
      this.speaker.say(CAMPAIGN.chipTaken, 'urgent');
      showRecorded('Radio 2584', t('Found on a data chip: {title}', { title: CHIPS[place] }), 8);
      this.chipTrack = { title: CHIPS[place], since: wallClock() };
      return;
    }
    let paid: ReturnType<typeof takeTag> = null;
    this.keepCampaign((campaign) => (paid = takeTag(campaign, find.id)));
    const { tag } = tagOf(find.id)!;
    this.speaker.say(CAMPAIGN.blackBoxTaken, 'urgent');
    showRecorded(`${tag.name} · ${t(tag.role)}`, t(tag.words), 10);
    const reward = paid as ReturnType<typeof takeTag>;
    if (!reward?.complete) {
      this.hud.flashMessage(this.time, t('Black box {n} of {total} here', { n: this.tagsAt(place), total: TAGS_PER_PLACE }), 3);
      return;
    }
    // the families' reward, over Rask's comm once Nicole has said her line
    this.speaker.say(RASK.families, 'lesson');
    this.hud.flashMessage(this.time, this.campaign.held ? t('The families pay {kept} ☉.', { kept: coinText(reward.kept) }) : t('The families pay {kept} ☉ for you, {cut} ☉ for the yard.', { kept: coinText(reward.kept), cut: coinText(reward.cut) }), 5);
  }

  /** How many of a place's black boxes the campaign has found. */
  private tagsAt(place: HuntPlace): number {
    return Array.from({ length: TAGS_PER_PLACE }, (_, index) => tagId(place, index)).filter((id) => this.campaign.tags.includes(id)).length;
  }

  /** The flight school in the HUD, as the frame's last step left it (see teach): its plate, marker, rings and racing line; returns the marker for the crosshair. */
  private showSchoolHud(me: Ship): THREE.Vector3 | null {
    const school = this.school!;
    // a mission that just ran on into the next has no context yet: the Host's device as it is
    const device = this.schoolContext?.device ?? this.input.device;
    this.hud.setSchool(school.status(device), device === 'keyboard');
    this.hud.setWaypoint(this.camera, this.schoolMark, school.mark);
    this.markRings(me, school.nextRing, school.nextNormal, school.ringAfter, RING_RADIUS);
    const track = this.schoolTrack;
    if (track && me.alive) this.showGuide(me, track.line, track.next, false);
    else this.guide.hide();
    return this.schoolMark;
  }

  /** The flight school's line to a marker: from where the pilot was when the marker came up (or last moved by SCHOOL_LINE_MOVE), ending at it. */
  private lineTo(me: Ship, waypoint: THREE.Vector3): { line: RacingLine; next: number } {
    if (!this.schoolLine || this.schoolLine.to.distanceTo(waypoint) > SCHOOL_LINE_MOVE) {
      this.schoolLine = { line: new RacingLine([waypoint], false, me.flight.position, 0), next: 0, to: waypoint.clone() };
    }
    return this.schoolLine;
  }

  /** What the flight school sees of the game; created once, the values of each step are filled in by teach(). */
  private createSchoolContext(): SchoolContext {
    const game = this;
    return {
      get me() {
        return game.me!;
      },
      controls: IDLE,
      braking: false,
      hooked: false,
      hookedShip: null,
      hookedRock: null,
      impactAhead: false,
      orbit: null,
      autopilot: false,
      setAutopilot: (on) => {
        if (this.autopilot !== on) this.toggleAutopilot();
      },
      keepDrift: false,
      towDrone: false,
      readyOverdrive: () => {
        this.overdriveReadyAt = 0;
      },
      cockpit: false,
      device: 'keyboard',
      field: this.field,
      now: 0,
      dt: 0,
      get drone() {
        return game.drone;
      },
      spawnDrone: (position, velocity, name, mass) => this.spawnDrone(position, velocity, name, mass),
      removeDrone: () => {
        if (this.drone) this.removeShip(this.drone);
        this.drone = null;
      },
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
      crash: () => {
        // the voice cut off mid-word, the picture torn, a falling tone and the crackle of a dead unit
        this.speaker.stop();
        this.glitch.trigger(1, 2.2);
        this.sound.beep(660, 0.12, 0.2);
        this.sound.beep(330, 0.3, 0.2, 0.14);
        this.sound.crackle(1);
      },
      fireAt: (from, through) => this.drillShot(from, through),
      fine: (coins) => (this.missionFine = coins),
      // a new print on the campaign's debt (see campaign/campaign), as far as the debt may grow
      owe: (coins) => this.keepCampaign((campaign) => (campaign.bond = Math.min(BOND_MAX, campaign.bond + coins))),
      get selfDestructing() {
        return game.input.selfDestructing;
      },
      // pain streams into the Host for `seconds`: the link's picture breaking up, a low drone of it
      linkLost: (seconds) => {
        // the voice cut off where it was, the picture white, nothing rotting: the link is simply gone
        this.speaker.stop();
        this.showLinkLost(true);
        window.clearTimeout(this.linkLostTimer);
        this.linkLostTimer = window.setTimeout(() => this.showLinkLost(false), seconds * 1000);
      },
      linkStatic: (strength) => {
        if (strength > 0) this.glitch.trigger(Math.min(1, strength) * STATIC_GLITCH, STATIC_SECONDS);
      },
      agony: (seconds) => {
        this.glitch.trigger(AGONY_GLITCH, seconds);
        this.linkHit(1, seconds);
        this.sound.beep(70, seconds, 0.3);
      },
      claims: () => this.mining.claims(this.field),
      stage: (name) => this.setStage(name),
      gulletPlate: (open) => this.showGullet(open),
      get gulletLeft() {
        return game.gulletLeft;
      },
      get gulletRegular() {
        return game.campaign.gullet;
      },
      visitGullet: () => this.keepCampaign((campaign) => (campaign.gullet = true)),
      // a touch the clone feels streams into the Host: a jolt in the link, a dull thump
      feel: () => {
        this.glitch.trigger(FEEL_GLITCH, FEEL_SECONDS);
        this.sound.beep(90, 0.18, 0.25);
      },
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
      get rocksBroken() {
        return game.rocksBroken;
      },
      get rigBeams() {
        return game.rigBeams;
      },
      spawnJumpers: (rock, rig, count, skill, names, hold, guard, hooks) => this.spawnJumpers(rock, rig, count, skill, names, hold, guard, hooks),
      moveJumpers: (to) => game.jumpers?.rig.copy(to),
      removeJumpers: () => this.removeJumpers(),
      spawnRacers: (rings, normals, radius, laps, count, skill, start, names, skills) => this.spawnRacers(rings, normals, radius, laps, count, skill, start, names, skills),
      removeRacers: () => this.removeRacers(),
      get racersFinished() {
        return game.racers?.finished ?? 0;
      },
      get jumpersDown() {
        return game.jumpers?.bots.filter((b) => !b.ship.alive).length ?? 0;
      },
      get rigWear() {
        return game.jumpers?.hits ?? 0;
      },
      brawl: () => {
        for (const bot of game.jumpers?.bots ?? []) bot.ship.team = -1;
      },
      blanks: () => {
        if (game.jumpers) game.jumpers.blanks = true;
      },
      wingman: (name, skill, at) => {
        this.removeWingman();
        const me = game.me!;
        const ship = this.addShip('wingman', name, 'human', false);
        const bot = new Bot(ship, skillsFrom(skill));
        this.bots.push(bot);
        this.wingman = bot;
        ship.team = me.team = ALLY_TEAM;
        ship.spawn(at, lookingAt(at, me.flight.position, me.flight.up(upward)), this.time);
        ship.protectedUntil = this.time;
      },
      removeWingman: () => this.removeWingman(),
      get spare() {
        return spareSkills(game.campaign.habits);
      },
      flock: (positions, names, velocity) => {
        while (this.flockShips.length > positions.length) this.removeShip(this.flockShips.pop()!);
        positions.forEach((at, i) => {
          let ship = this.flockShips[i];
          if (!ship) {
            ship = this.addShip(`flock${i}`, names[i % names.length], i % 2 ? 'alien' : 'human', false);
            ship.spawn(at, lookingAt(at, flockAhead.copy(at).add(velocity), upward.set(0, 1, 0)), this.time);
            // in formation, never a target
            ship.protectedUntil = Infinity;
            this.flockShips.push(ship);
          }
          ship.flight.position.copy(at);
          ship.flight.velocity.copy(velocity);
        });
      },
      armLeader: () => {
        const leader = game.jumpers?.bots[0]?.ship;
        leader?.outfit(hullLooks(leader.type, BOT_GEAR));
      },
      announce: (line) => this.radio.announce(line, null),
      goldTime: () => {
        this.goldRun = true;
      },
      pelt: (at, direction, ship) => {
        const hull = ship ?? game.me;
        if (hull?.alive) this.applyLaserHit(hull, at, direction, null, undefined, 'shower', SHOWER_WEIGHT);
      },
      ambush: (count, skill, names, hold) => {
        const actors = game.jumpers?.bots.map((bot) => bot.ship) ?? [];
        const rig = game.jumpers?.rig ?? new THREE.Vector3();
        // the actors stay out of the new raiders' removal: they go down to them instead
        game.jumpers = null;
        this.spawnJumpers(null, rig, count, skill, names, hold);
        const raiders = game.jumpers!.bots;
        actors.forEach((actor, i) => {
          if (actor.alive) this.shipDestroyed(actor, raiders[i % raiders.length].ship, null, 'laser');
          this.removeShip(actor);
        });
      },
      get jumperKills() {
        return game.jumpers?.bots.map((bot) => bot.ship.kills) ?? [];
      },
      get leaderHull() {
        return game.jumpers?.bots[0]?.ship.hull ?? 0;
      },
      spareClones: () => {
        if (game.jumpers) game.jumpers.spares = true;
      },
      standDown: (to) => {
        if (!game.jumpers) return;
        game.jumpers.guard = false;
        game.jumpers.rig.copy(to);
        game.jumpers.hold = 0;
      },
      jumperNear: (point, reach) => !!game.jumpers?.bots.some((bot) => bot.ship.alive && bot.ship.flight.position.distanceTo(point) < reach),
      choose: (choice) =>
        this.keepCampaign((campaign) => {
          if (!campaign.choices.includes(choice)) campaign.choices.push(choice);
        }),
      get leaderDown() {
        return !!game.jumpers && !game.jumpers.bots[0].ship.alive;
      },
      get brokenAt() {
        return game.brokenAt;
      },
      get brokenId() {
        return game.brokenId;
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
      spawnProbe: (position, kind) => {
        // a probe of its own each time: one taken is never shown again; it waits where it is
        // until the pilot comes for it
        this.probes.drop('school', Math.floor(this.time * 1000), [kind], position, new THREE.Vector3(), this.time);
        const probe = this.probes.list[this.probes.list.length - 1];
        this.probes.park(probe, position);
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
  private drillShot(from: THREE.Vector3, through: THREE.Vector3): boolean {
    const me = this.me!;
    const direction = forward.subVectors(through, from).normalize();
    const end = aimPoint.copy(from).addScaledVector(direction, from.distanceTo(through) * 2);
    this.effects.beam(from, end, DRILL_GUNNER_COLOR);
    const distance = raySphere(from, direction, me.flight.position, me.radius);
    if (distance === null) return false;
    this.effects.sparks(scratch.copy(from).addScaledVector(direction, distance), DRILL_GUNNER_COLOR, 40);
    this.glitch.trigger(0.35, 0.3);
    this.sound.beep(220, 0.1, 0.2);
    return true;
  }

  /** A defenseless target for the flight school, its drive towards the pilot: the one place a laser hurts. */
  private spawnDrone(position: THREE.Vector3, velocity: THREE.Vector3, name = t('Target drone'), mass: number = MASS.ship) {
    const me = this.me!;
    this.drone ??= this.addShip('drone', name, me.type === 'human' ? 'alien' : 'human', false);
    this.drone.name = name;
    this.drone.body.mass = mass;
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
   * The brake, a switch like the hook, so the hands stay free: pressed, it remembers the ship's
   * whole attitude and brakes (see flightComputer); pressed again, or at rest, it turns the ship
   * back to that attitude, so the Host looks exactly where it looked before; pressed during the
   * turn back, it brakes again towards the same attitude. The drive (W) breaks the whole maneuver
   * off at once, and so does steering past BRAKE_TAKEOVER during the turn back: the Host has the
   * nose then. Returns the phase this frame.
   */
  private brakeManeuver(controls: Readonly<Controls>): 'off' | 'brake' | 'return' {
    const me = this.me!;
    const live = this.state === 'playing' && me.alive;
    const held = live && !this.stage && this.input.braking;
    const pressed = held && !this.brakeHeld;
    this.brakeHeld = held;
    if (!live) return (this.brakePhase = 'off');
    if (pressed) {
      if (this.brakePhase === 'off') this.brakeHome.copy(me.flight.orientation);
      this.brakePhase = this.brakePhase === 'brake' ? 'return' : 'brake';
    }
    if (this.brakePhase !== 'off' && controls.thrust > 0) this.brakePhase = 'off';
    if (this.brakePhase === 'brake' && this.brake.rested) this.brakePhase = 'return';
    if (this.brakePhase === 'return' && Math.abs(controls.yaw) + Math.abs(controls.pitch) > BRAKE_TAKEOVER) this.brakePhase = 'off';
    return this.brakePhase;
  }

  /**
   * The own ship's flight computer. The brake (see brakeManeuver) turns the ship about flat and
   * burns against the flight with the full drive until the Host ends it or the ship is at rest;
   * the Host may steer meanwhile (to shoot, say), the drive burning only while the nose points
   * within BRAKE_AIM of against the flight, and let go of the stick the brake turns the nose back
   * against it; then the flight computer turns the ship back to the attitude it had. While the
   * flip is held, it only turns the nose against the flight and keeps it there; the pilot's drive
   * pushes once the nose points the right way. Otherwise it keeps the ship upright and, with the
   * autopilot, flies the ship where its nose points (see flyByNose).
   */
  private flightComputer(controls: Readonly<Controls>): Controls {
    const me = this.me!;
    const flight = me.flight;
    const phase = this.brakeManeuver(controls);
    if (phase === 'brake') {
      this.flightMode = 'brake';
      this.flipping = false;
      this.aimTarget();
      const rested = this.brake.rested;
      const out = this.brake.fly(flight, controls, me.drive, this.computed);
      if (this.brake.rested && !rested) this.sound.beep(660, 0.08);
      if (Math.abs(controls.yaw) + Math.abs(controls.pitch) > BRAKE_STEER) {
        // the Host steers: the nose is the Host's, and the drive only burns against the flight
        out.yaw = controls.yaw;
        out.pitch = controls.pitch;
        if (flight.noseAngleTo(retrograde.copy(flight.velocity).negate()) > BRAKE_AIM) out.thrust = 0;
        return this.assistAim(out);
      }
      return out;
    }
    this.brake.release();
    if (phase === 'return') {
      this.flightMode = 'brake';
      this.flipping = false;
      this.aimTarget();
      const turn = flight.attitude(this.brakeHome, 2.5, homeTurn);
      const out = Object.assign(this.computed, controls, { yaw: turn.yaw, pitch: turn.pitch, roll: turn.roll, thrust: 0 });
      if (turn.off < BRAKE_HOME) {
        this.brakePhase = 'off';
        this.sound.beep(880, 0.06);
      }
      return out;
    }
    const flipping = this.state === 'playing' && this.input.flipping && me.alive && !this.stage;
    if (!flipping) {
      this.flipping = false;
      // flung off the hook: the flight computer turns the nose onto the new course, unless the
      // pilot steers, and the autopilot does not brake the swing meanwhile
      const flung = this.time < this.flungUntil && me.alive;
      // in free drift the pointer turns the nose and the ship slides on
      this.flightMode = !me.alive ? 'dead' : !this.autopilot ? 'free' : flung ? 'swing' : 'autopilot';
      const out = this.autopilot && me.alive && !flung ? this.trimDrift(controls) : Object.assign(this.computed, controls);
      if (flung && Math.abs(controls.yaw) + Math.abs(controls.pitch) < FLING_STEER && flight.velocity.lengthSq() > 1) flight.steer(flight.velocity, 3, out);
      return this.assistAim(keepUpright(flight, out));
    }
    this.flightMode = 'flip';
    if (!this.flipping) {
      // the goal is fixed when the flip starts: against the flight, or straight behind the nose
      // at rest; so a burn held past standstill speeds the ship up backwards instead of flipping again
      this.flipping = true;
      this.flipAligned = false;
      if (flight.velocity.lengthSq() > BRAKE_REST * BRAKE_REST) this.flipGoal.copy(flight.velocity).negate().normalize();
      else flight.forward(this.flipGoal).negate();
    }
    this.aimTarget();
    const aligned = flight.noseAngleTo(this.flipGoal) < BRAKE_BURN_ANGLE;
    if (aligned && !this.flipAligned) this.sound.beep(660, 0.08);
    this.flipAligned = aligned;
    // a flat turn, the ship held upright meanwhile (see FlightModel.flip)
    const out = keepUpright(flight, flight.flip(this.flipGoal, 3, Object.assign(this.computed, controls)));
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
    toAim.subVectors(target.flight.position, flight.position);
    if (this.recording) this.recording.aim = toAim.toArray();
    return assistAim(flight, toAim, out);
  }

  /**
   * The ship in sight closest to the nose within AIM_ASSIST_ANGLE, not of the own side, or null;
   * sets `onTarget` to what the laser would hit now: the closest hull, whoever's,
   * in sight within the laser's reach whose radius covers the nose, as the laser's own hit test
   * sees it. Only the nose counts, never the pointer.
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
    // the hull the laser would hit: the nose within its radius as seen from here, the closest
    let hit: Ship | null = null;
    let hitRange = LASER_RANGE;
    for (const ship of this.ships) {
      if (ship === me || !ship.alive) continue;
      const line = toAim.subVectors(ship.flight.position, flight.position);
      const range = line.length();
      if (range > LASER_RANGE) continue;
      const off = angleTo(nose, line);
      const onHull = off < ship.radius / Math.max(range, 1) && range < hitRange;
      // the assist never pulls the nose onto the own side, though the laser hits it as any other
      const assist = off < angle && range <= AIM_ASSIST_RANGE && !ship.allyOf(me);
      if ((!onHull && !assist) || !this.field.lineOfSight(flight.position, ship.flight.position)) continue;
      if (onHull) {
        hit = ship;
        hitRange = range;
      }
      if (assist) {
        target = ship;
        angle = off;
      }
    }
    if (hit) this.onTarget = hit.allyOf(me) ? 'friend' : hit.tailToward(toAim.subVectors(hit.flight.position, flight.position)) ? 'drive' : 'armor';
    return target;
  }

  /** E: the overdrive, a last resort; see OVERDRIVE_STRAIN. */
  private overdrive() {
    const me = this.me!;
    if (!me.alive || !me.perks.overdrive || this.time < this.overdriveReadyAt) return;
    this.overdriveReadyAt = this.time + OVERDRIVE_RECHARGE;
    me.flight.velocity.addScaledVector(me.flight.forward(forward), OVERDRIVE_PUSH);
    me.overheatDrive(this.time + OVERDRIVE_DRIVE_COOLDOWN);
    // about sixty g at once: the clone is pressed to the edge of blacking out
    me.strain = Math.max(me.strain, OVERDRIVE_STRAIN);
    this.kick = 2;
    this.effects.engineTrail(me.toWorld(scratch.set(0, 0, me.radius * 0.9)), me.toWorld(relative.set(0, 0, me.radius * 4)), me.flight.velocity, 1);
    this.sound.play('explosion', { volume: 1.4, rate: 0.7 });
    this.hud.flashMessage(this.time, t('Overdrive'), 1.2);
  }

  /**
   * V, the right mouse button: pressed, the own hook fires along the nose, and the winch reels
   * in while it holds; pressed again, it lets go (see game/hook). A toggle, so the hands stay
   * free for every other maneuver on the cable. Not in the clamps of a round's opening.
   */
  private hookOwn(now: number) {
    const me = this.me!;
    const held = this.state === 'playing' && me.alive && !this.spectating && !this.clamped && !this.stage && this.input.hooking;
    const pressed = held && !this.hookHeld;
    this.hookHeld = held;
    if (!pressed) return;
    if (this.tethers.has(me)) this.unhook(me);
    // the hook is gear bought in the hangar; the flight school lends its training clones one
    else if (now >= this.hookReadyAt && this.hookCarried(me)) this.fireHook(me);
  }

  /**
   * B (the D-pad left, SELF-DESTRUCT on touch) held for SELF_DESTRUCT_HOLD seconds: the own ship
   * blows itself up (see selfDestruct), every browser told. Only a ship that carries one (gear
   * bought in the hangar), never in a race or the flight school, never in the clamps. The touch
   * buttons of the gear show only for a ship that carries it.
   */
  private selfDestructOwn(now: number) {
    const me = this.me!;
    const allowed = me.perks.selfDestruct && !this.school && this.roundMode !== 'race';
    const touch = $('touch-selfDestruct');
    if (touch.hidden === allowed) touch.hidden = !allowed;
    const hook = $('touch-hook');
    const hooks = this.hookCarried(me);
    if (hook.hidden === hooks) hook.hidden = !hooks;
    const decoy = $('touch-decoy');
    const decoys = me.alive && me.decoys > 0;
    if (decoy.hidden === decoys) decoy.hidden = !decoys;
    if (!allowed || this.state !== 'playing' || !me.alive || this.spectating || this.clamped || this.stage || !this.input.selfDestructing) {
      this.selfDestructSince = null;
      return;
    }
    this.selfDestructSince ??= now;
    const left = SELF_DESTRUCT_HOLD - (now - this.selfDestructSince);
    if (left > 0) {
      this.hud.flashMessage(now, t('Self-destruct in {s} s', { s: left.toFixed(1) }), 0.2);
      return;
    }
    this.selfDestructSince = null;
    this.online?.sendSelfDestruct(me, me.flight.position);
    this.selfDestruct(me, me.flight.position);
  }

  /**
   * A self-destruct goes off where `holder` is: a small blast that destroys every ship this
   * browser runs within SELF_DESTRUCT_RADIUS (a kill of the holder's) and the holder itself, a
   * death of its own as a crash is, its sponsor break and all; the torpedoes and wreckage in it
   * go too. Every browser hears of it and does the same for the ships it runs.
   */
  selfDestruct(holder: Ship, position: THREE.Vector3) {
    const now = this.time;
    this.effects.explosion(position, holder.radius * 6, holder.flight.velocity);
    this.shockwave(position);
    for (const ship of [...this.ships]) {
      if (ship === holder || ship.owner !== null || !ship.alive || ship.flight.position.distanceTo(position) > SELF_DESTRUCT_RADIUS) continue;
      ship.protectedUntil = Math.min(ship.protectedUntil, now);
      if (ship.structural(Infinity, now) === 'destroyed') this.shipDestroyed(ship, holder, 'self');
    }
    this.dropCables(holder);
    if (holder.owner === null && holder.alive) {
      holder.protectedUntil = Math.min(holder.protectedUntil, now);
      if (holder.structural(Infinity, now) === 'destroyed') this.shipDestroyed(holder, null, 'self');
    }
    for (const torpedo of [...this.torpedoes.list]) if (torpedo.position.distanceTo(position) < SELF_DESTRUCT_RADIUS) this.blowUp(torpedo);
    for (const wreck of [...this.wrecks.list]) if (wreck.mesh.position.distanceTo(position) < SELF_DESTRUCT_RADIUS) this.shatterWreck(wreck);
    if (holder !== this.me) this.hud.flashMessage(now, t('SELF-DESTRUCT · {name}', { name: holder.name }), 2.5);
  }

  /**
   * A bot's hook: now and then it hooks the ship it hunts, dead ahead within reach, reels it in
   * for a moment and lets go (see BOT_HOOK_RATE); never the flight school's bots, never racing.
   */
  private botHook(bot: Bot, dt: number, now: number) {
    const ship = bot.ship;
    // the hook is gear: a round's bots carry it (BOT_GEAR), the flight school's sparring bot not
    if (!ship.perks.hook) return;
    const target = bot.target;
    const tether = this.tethers.get(ship);
    if (tether) {
      // the ship it hooked, whichever it hunts now
      const hooked = tether.anchor?.ship;
      if (now >= bot.hookUntil || (hooked && !hooked.alive)) this.unhook(ship);
      return;
    }
    if (this.flags && bot.waypoint && now >= bot.hookReadyAt && this.botHookCore(bot, this.flags, now)) return;
    if (!target || bot === this.sparring?.bot || bot.waypoint || now < bot.hookReadyAt || Math.random() >= dt * BOT_HOOK_RATE * bot.skills.daring * (1 - bot.ease)) return;
    const distance = target.flight.position.distanceTo(ship.flight.position);
    if (distance < BOT_HOOK_MIN || distance > HOOK_RANGE * 0.9 || aimHook(ship, this.field, this.ships)?.anchor.ship !== target) return;
    this.fireHook(ship);
    devlog?.add({ kind: 'act', t: now, ship: ship.name, act: 'hook', detail: target.name });
    bot.hookUntil = now + flightTime(distance) + BOT_HOOK_HOLD;
    bot.hookReadyAt = bot.hookUntil + BOT_HOOK_PAUSE;
  }

  /**
   * A bot of Capture the Flag flying for a core it may take (the other side's, or its own
   * adrift) fires its harpoon at it once the core lies within BOT_CORE_CONE of its nose,
   * between BOT_HOOK_MIN and nine tenths of the hook's reach, with nothing in between: a raider
   * need not dive through the guards to the core. True when it fired.
   */
  private botHookCore(bot: Bot, flags: Flags, now: number): boolean {
    const ship = bot.ship;
    const marks = flags.hookable(ship);
    for (const mark of marks) {
      const line = toAim.subVectors(mark.position, ship.flight.position);
      const distance = line.length();
      if (distance < BOT_HOOK_MIN || distance > HOOK_RANGE * 0.9 || ship.flight.noseAngleTo(line) > BOT_CORE_CONE) continue;
      if (aimHook(ship, this.field, this.ships, marks)?.anchor.mark?.team !== mark.team) return false;
      this.fireHook(ship);
      bot.hookUntil = now + flightTime(distance) + 0.1;
      bot.hookReadyAt = bot.hookUntil + BOT_HOOK_PAUSE;
      return true;
    }
    return false;
  }

  /** The harpoon leaves the nose: it bites what lies ahead within reach (in Capture the Flag a core it may take too), or flies out and is reeled back. */
  private fireHook(ship: Ship) {
    const marks: Mark[] = [];
    for (const probe of this.probes.list) if (!probe.holder) marks.push({ team: -1, probe, position: probe.position });
    for (const torpedo of this.torpedoes.list) if (!torpedo.holder) marks.push({ team: -1, torpedo, position: torpedo.position });
    if (this.flags) marks.push(...this.flags.hookable(ship));
    const aim = aimHook(
      ship,
      this.field,
      // a target drone is no ship to hook, unless the drill has it there to be towed (Scout One)
      this.ships.filter((other) => other !== this.drone || (this.school !== null && this.schoolContext?.towDrone === true)),
      marks,
    );
    const end = aim ? aim.at : ship.nose(new THREE.Vector3()).addScaledVector(ship.flight.forward(forward), HOOK_RANGE);
    this.tethers.set(ship, newTether(ship, aim?.anchor ?? null, flightTime(aim?.distance ?? HOOK_RANGE), end, 0, this.cables.take()));
    if (ship === this.me) this.sound.play('laser', { volume: 0.7, rate: 0.3 });
  }

  /** A hook lets go: the cable is reeled back. The own hook is ready again after HOOK_RECHARGE; a hook this browser fired and that held is told to the others. */
  private unhook(ship: Ship) {
    const tether = this.tethers.get(ship);
    if (!tether) return;
    this.tethers.delete(ship);
    this.cables.give(tether.line);
    // a torpedo let go flies on from the string, still the flinger's for a moment (see FLING_CREDIT)
    const torpedo = tether.flying <= 0 ? tether.anchor?.mark?.torpedo : undefined;
    if (torpedo?.holder === ship) {
      torpedo.holder = null;
      torpedo.flinger = ship;
      torpedo.releasedAt = this.time;
    }
    // a probe let go before it arrived flies back to its slot (see PROBE_THRUST)
    const probe = tether.flying <= 0 ? tether.anchor?.mark?.probe : undefined;
    if (probe) this.probes.letGo(probe, ship);
    // a core bitten was handed on to the rules: nothing held, nothing to fling; a probe is too
    // light to fling a ship
    const held = !!tether.anchor && (!tether.anchor.mark || !!torpedo || !!probe) && tether.flying <= 0;
    if (ship.owner === null && held) this.online?.sendHook(ship, null);
    if (ship !== this.me) return;
    this.hookReadyAt = this.time + HOOK_RECHARGE;
    if (held && !probe && ship.alive) this.flungUntil = this.time + FLING_SECONDS;
  }

  private clearHooks() {
    for (const ship of [...this.tethers.keys()]) this.unhook(ship);
  }

  /**
   * A ship's clone is printed afresh where it was not: no cable survives it, its own nor one
   * hooked on its hull. Each browser lets go of what it has; one that runs a hook tells the
   * others (see unhook), so every browser that learns of the reprint (the holder's own, or all
   * of them for a nova or a side given) is enough.
   */
  private dropCables(ship: Ship) {
    this.unhook(ship);
    for (const tether of [...this.tethers.values()]) if (tether.anchor?.ship === ship) this.unhook(tether.owner);
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
      let bit = false;
      if (tether.flying > 0) {
        tether.flying -= dt;
        if (tether.flying <= 0) {
          bit = true;
          // a miss is reeled back; so is a harpoon whose rock broke or whose ship died on the way
          const at = tether.anchor ? anchorPoint(tether.anchor, hookPoint) : null;
          if (!at || !tether.anchor) {
            this.unhook(owner);
            continue;
          }
          // as much cable out as the way to the bite over what the cable lies on already (a rock
          // come across it while the harpoon flew): the rope starts slack, never with a jerk by
          // the way round the rock
          tether.cable.follow(this.field, at, owner.flight.position, false);
          tether.length = tether.cable.length(at, owner.flight.position);
          // a core bitten goes to the rules, its cable the tow cable from then on; a torpedo or
          // a probe hangs on the rope (see hookedTorpedo, hookedProbe)
          const mark = tether.anchor.mark;
          if (mark?.torpedo || mark?.probe) {
            if (!(mark.torpedo ? this.hookedTorpedo(owner, mark.torpedo, tether.length) : this.hookedProbe(owner, mark.probe!, tether.length))) {
              this.unhook(owner);
              continue;
            }
          } else if (mark) {
            this.hookedCore(owner, mark.team);
            this.unhook(owner);
            continue;
          } else this.hooked(owner, tether.anchor, tether.length);
        }
      }
      const nose = owner.nose(hookNose);
      if (tether.flying > 0 || !tether.anchor) {
        Cables.draw(tether.line, nose, cableEnd(tether, nose, hookEnd));
        continue;
      }
      const at = anchorPoint(tether.anchor, hookPoint);
      // a torpedo gone off, or a probe taken (by the hooker on arrival, or by a ship that
      // touched it first on the way): nothing left on the line
      const torpedo = tether.anchor.mark?.torpedo;
      const probe = tether.anchor.mark?.probe;
      const held = torpedo ?? probe;
      if (!at || (torpedo && !this.torpedoes.list.includes(torpedo)) || (probe && (!this.probes.list.includes(probe) || probe.holder !== owner))) {
        this.unhook(owner);
        continue;
      }
      // the cable lies on whatever comes across it, every browser following it for itself (see
      // game/cable); it snaps where wrapping is no answer on the browser that runs the hook (the
      // others are told it let go), never in the step it bit, which lays it as the ship moved
      // while the harpoon flew
      const owns = owner.owner === null;
      // (nor for the jump of another browser's ship on it, set right as this browser predicts it)
      if (!tether.cable.follow(this.field, at, owner.flight.position, owns && !bit, tether.anchor.ship?.corrected ?? 0)) {
        this.cableSnapped(owner);
        continue;
      }
      Cables.draw(tether.line, nose, at, tether.cable);
      // a ship hooked to a ship: one rope between two bodies of the same mass, each end pulled
      // on the browser that runs it (both at once where one browser runs both); a torpedo or a
      // probe, which every browser has, pulled everywhere (another browser's ship as it last
      // told of it); hooked to a rock, the rock is the anchor, far too heavy to move. Each end
      // pulls along its own stretch, the winch keeping it clear of the piece it lies on.
      const target = tether.anchor.ship;
      let length: number | null = tether.length;
      const rock = tether.anchor.rock;
      const anchor = target ? target.body : held ? held : rockBody(rock ? massOf(rock) : IMMOVABLE, at, rock ? this.field.surfaceVelocity(rock, at, hookVelocity) : hookVelocity.set(0, 0, 0));
      const runsAnchor = held ? true : target?.owner === null;
      const path = owns || runsAnchor ? tether.cable.path(owns) : null;
      const farFloor = path ? clearOf(owner, path.farRock) : 0;
      const floor = path ? clearOf(owner, path.nearRock) : floorOf(owner, tether.anchor);
      // the winch yanks as hard as a coil throws: up to the limit plus a coil's push; a probe's
      // thrusters burn against its swing (see PROBE_STEADY)
      const limit = MAX_SPEED + BOOST_PUSH;
      const steady = probe ? PROBE_STEADY : 0;
      if (owns) length = pullOn(owner.body, anchor, length, true, floor, limit, dt, runsAnchor ? 'moved' : target ? 'elsewhere' : 'fixed', path, farFloor, steady);
      else if (runsAnchor && (target || held)) length = pullOn(anchor, owner.body, length, true, floor, limit, dt, 'elsewhere', path, farFloor, steady);
      if (length === null) {
        this.cableSnapped(owner);
        continue;
      }
      tether.length = length;
    }
  }

  /** Nicole warns of friendly fire, at most every FRIEND_WARNING seconds and never in the flight school. */
  private warnFriend(line: string) {
    if (this.school || this.time - this.friendWarnedAt < FRIEND_WARNING) return;
    if (this.speaker.say(line, 'urgent')) this.friendWarnedAt = this.time;
  }

  /** A hook's cable snapped: it lets go, and the own pilot feels the jerk and hears it. */
  private cableSnapped(owner: Ship) {
    this.unhook(owner);
    if (owner === this.me) this.snapCue();
  }

  /** The cue of a cable that snapped under the own ship: a word, and a crack through the hull. */
  private snapCue() {
    this.hud.flashMessage(this.time, t('Cable snapped'), 1.5);
    this.sound.play('explosion', { volume: 0.4, rate: 3 });
    this.kick = Math.max(this.kick, 0.5);
  }

  /**
   * A harpoon of this browser bit a core of Capture the Flag: the lead's rules decide whether it
   * is taken (see Flags.claim); another browser's lead is told. The own pilot hears it bite.
   */
  private hookedCore(owner: Ship, team: number) {
    if (owner.owner !== null || !this.flags) return;
    if (!this.online || this.online.isLead) this.flags.claim(owner.id, team);
    else this.online.sendHook(owner, { core: team });
    if (owner !== this.me) return;
    this.sound.play('explosion', { volume: 0.5, rate: 2.4 });
    this.sound.beep(523, 0.08, 0.12);
  }

  /**
   * A harpoon of this browser bit a sponsor probe: it hangs on the rope, and the winch reels it
   * in to the ship, which takes it when it arrives (see items). Until then it is anyone's who
   * touches it first. The others are told, and pull it on the same cable from the ship's
   * states. False when it is gone or another hook holds it already.
   */
  private hookedProbe(owner: Ship, probe: Probe, length: number): boolean {
    if (owner.owner !== null || probe.holder || !this.probes.list.includes(probe)) return false;
    this.probes.hook(probe, owner);
    this.online?.sendHook(owner, { probe: probe.id }, length);
    if (owner === this.me) {
      this.sound.play('explosion', { volume: 0.5, rate: 2.4 });
      this.hud.flashMessage(this.time, t('PROBE ON THE LINE'), 2);
    }
    return true;
  }

  /**
   * A ship of another browser hooked a probe (checked against the hook's reach where it
   * arrives): it hangs on that ship's rope here too, pulled from that ship's states. Two hooks
   * that bit the same probe at once: the ship with the lower id keeps it, on every browser.
   */
  remoteProbeHook(owner: Ship, id: string, length: number) {
    const probe = this.probes.find(id);
    if (!probe || (probe.holder && probe.holder !== owner && keepsHold(probe.holder.id, owner.id))) return;
    if (probe.holder && probe.holder !== owner) this.unhook(probe.holder);
    this.unhook(owner);
    this.probes.hook(probe, owner);
    this.tethers.set(owner, newTether(owner, { rock: null, local: null, ship: null, mark: { team: -1, probe, position: probe.position } }, 0, new THREE.Vector3(), length, this.cables.take()));
  }

  /** Where a probe is now, as this browser has it, or null. */
  probeAt(id: string): THREE.Vector3 | null {
    return this.probes.find(id)?.position ?? null;
  }

  /**
   * A harpoon of this browser bit a torpedo (see FLING_CREDIT): it hangs on the rope, its motor
   * still pushing for its target, and this browser decides from now on where it goes off; the
   * others are told, its shooter's browser lets go of it. False when it is gone or someone else
   * holds it already.
   */
  private hookedTorpedo(owner: Ship, torpedo: Torpedo, length: number): boolean {
    if (owner.owner !== null || torpedo.holder || !this.torpedoes.list.includes(torpedo)) return false;
    torpedo.holder = owner;
    torpedo.own = true;
    this.online?.sendHook(owner, { torpedo: torpedo.id }, length);
    if (owner === this.me) {
      this.sound.play('explosion', { volume: 0.5, rate: 2.4 });
      this.hud.flashMessage(this.time, t('TORPEDO ON THE LINE'), 2);
    }
    return true;
  }

  /**
   * A ship of another browser hooked a torpedo (checked against the hook's reach where it
   * arrives): it hangs on that ship's rope here too, and that browser decides where it goes off.
   * Two hooks that bit the same torpedo at once: the ship with the lower id keeps it, on every
   * browser, so exactly one browser is in charge of it.
   */
  remoteTorpedoHook(owner: Ship, id: string, length: number) {
    const torpedo = this.torpedoes.find(id);
    if (!torpedo || (torpedo.holder && torpedo.holder !== owner && keepsHold(torpedo.holder.id, owner.id))) return;
    if (torpedo.holder && torpedo.holder !== owner) this.unhook(torpedo.holder);
    this.unhook(owner);
    torpedo.holder = owner;
    torpedo.own = false;
    this.tethers.set(owner, newTether(owner, { rock: null, local: null, ship: null, mark: { team: -1, torpedo, position: torpedo.position } }, 0, new THREE.Vector3(), length, this.cables.take()));
  }

  /** A ship of another browser says its harpoon bit a core: the lead's rules decide (see Flags.claim). */
  remoteCoreHook(owner: Ship, team: number) {
    if (this.flags && this.online?.isLead) this.flags.claim(owner.id, team);
  }

  /** A hook of this browser bit: the others are told, and the own pilot feels and hears it. */
  private hooked(owner: Ship, anchor: Anchor, length: number) {
    if (owner.owner !== null || anchor.mark) return;
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
    const anchor: Anchor | null = asteroid && local ? { rock: asteroid, local: local.clone(), ship: null, mark: null } : target ? { rock: null, local: null, ship: target, mark: null } : null;
    if (!anchor) return;
    this.tethers.set(owner, newTether(owner, anchor, 0, new THREE.Vector3(), length, this.cables.take()));
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

  /**
   * Z (the D-pad right, DECOY on touch): a ship this browser runs drops one of its decoys (see
   * game/decoys); the torpedoes homing on it close by turn to it, and every browser is told.
   */
  dropDecoy(ship: Ship) {
    if (!ship.alive || ship.decoys <= 0) return;
    ship.decoys--;
    // a flare of heat: the ship shows on the sensors again (see Ship.silent)
    ship.loudAt = this.time;
    decoyLaunch(ship, decoyAt, decoyVelocity);
    const id = `${ship.id}:d${++this.decoysDropped}`;
    this.decoys.drop(id, ship, decoyAt, decoyVelocity, this.time, this.torpedoes.list);
    this.online?.sendDecoy(ship, decoyAt, decoyVelocity);
    if (ship.isLocal) {
      this.hud.flashMessage(this.time, t('Decoy away'), 1.2);
      this.sound.beep(660, 0.08, 0.12);
    }
  }

  /**
   * A bot with a decoy drops it when a torpedo homing on it comes within BOT_DECOY_AT (a share of
   * DECOY_LURE), as a Host who hears TORPEDO INBOUND does, a moment late (BOT_DECOY_RATE a second).
   */
  private botDecoy(ship: Ship, dt: number) {
    for (const torpedo of this.torpedoes.list) {
      if (torpedo.target !== ship || torpedo.position.distanceTo(ship.flight.position) > DECOY_LURE * BOT_DECOY_AT) continue;
      if (Math.random() < dt * BOT_DECOY_RATE) this.dropDecoy(ship);
      return;
    }
  }

  /** Another browser's ship dropped a decoy: here too the torpedoes homing on it close by turn to it. */
  remoteDecoy(ship: Ship, position: THREE.Vector3, velocity: THREE.Vector3) {
    ship.loudAt = this.time;
    this.decoys.drop(`${ship.id}:r${++this.decoysDropped}`, ship, position, velocity, this.time, this.torpedoes.list);
  }

  /** What a torpedo of `ship` would lock on: the ship or part of the battleship in sight closest to its nose (see LOCK_ANGLE). */
  private torpedoTarget(ship: Ship): Homing | null {
    let best: Homing | null = null;
    let angle = LOCK_ANGLE;
    const consider = (other: Homing) => {
      const line = toAim.subVectors(other.flight.position, ship.flight.position);
      if (line.length() > LOCK_DISTANCE) return;
      // a ship running silent is found only up close (see Ship.silent)
      if (other instanceof Ship && !detectable(other, ship.flight.position, this.time)) return;
      const off = ship.flight.noseAngleTo(line);
      if (off < angle && seesTarget(other, ship.flight.position, this.field)) {
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
    // one taken on a hook is its holder's to tell of (see Torpedoes.FLING_CREDIT), and its kill
    const holder = torpedo.holder ?? torpedo.flinger;
    this.online?.sendTorpedoGone(torpedo.id, torpedo.position, null, holder);
    const credit = creditOf(torpedo, this.time);
    // every part of the battleship close to where it went off takes it
    const parts = this.fleet ? this.fleet.blast(torpedo.position) : [];
    for (const zone of parts) this.hitFleet(this.fleet!, zone, credit, torpedo.position, TORPEDO_HITS, 'torpedo');
    if (devlog) {
      const outcome = hit ? 'on a ship' : parts.length ? 'on a part' : this.time - torpedo.bornAt >= TORPEDO_LIFETIME ? 'burnt out' : this.fleet?.touches(torpedo.position, TORPEDO_RADIUS) ? 'on the hull' : 'on rock';
      devlog.add({ kind: 'act', t: this.time, ship: torpedo.shooter.name, act: 'torpedo gone', detail: `${outcome}${torpedo.target ? '' : ', lock lost'}${torpedo.shooter.alive ? '' : ', shooter dead'}` });
    }
    if (!hit) return;
    if (hit.owner === null) this.applyTorpedoHit(hit, credit);
    else this.online?.sendTorpedoHit(hit, credit, torpedo.id);
    if (credit.isLocal) {
      this.hud.hit();
      this.landed(hit.flight.position, t('TORPEDO'));
    }
    if (credit === this.me && hit.allyOf(credit)) this.warnFriend(COMPUTER.friendHit);
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
    if (!this.school && this.roundId >= 0) this.probes.schedule(seed, this.roundId, this.roundSeconds(), now, this.field, this.course?.points);
    const shared = (this.slotSolids ??= [fieldSolid(this.field), obstacleSolid(this.field), ...pushesOf(this.solids, SLOT_BOUNCES)]);
    this.probes.update(dt, now, this.field, (this.probeSolids ??= [...shared, ...pushesOf(this.solids, PROBE_BOUNCES.filter((kind) => !SLOT_BOUNCES.includes(kind)))]), shared);
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
      case 'decoys':
        ship.decoys = Math.min(DECOYS_HELD, ship.decoys + DECOYS_PER_PROBE);
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
  remoteProbe(id: string, ship: Ship | null, bucket: number, take = true): ItemKind | null | undefined {
    const deathsOf = (s: string) => this.ships.find((other) => other.id === s)?.deaths ?? null;
    if (!this.probes.plausible(id, this.roundId, deathsOf)) return undefined;
    const probe = take ? this.probes.takeId(id) : this.probes.find(id);
    if (!probe) return null;
    const seen = ship ? this.bucketOf(ship) : 1;
    return contents(probe, Math.abs(bucket - seen) <= 1 ? bucket : seen);
  }

  probeWithin(id: string, ship: Ship): boolean {
    const probe = this.probes.find(id);
    // the taker flew through it on its own screen: here it may be a moment behind, at full
    // speed, and the probe may still lie where a hook took it from (a cable this browser has
    // not heard of yet), up to the hook's reach away
    return !probe || probe.position.distanceTo(ship.flight.position) < HOOK_RANGE + PROBE_RADIUS + ship.radius + PROBE_LAG + ship.flight.velocity.length() * 0.5;
  }

  rockAt(id: string): { position: THREE.Vector3; radius: number } | null {
    const rock = this.field.asteroids.get(id);
    if (rock) return { position: rock.object.position, radius: rock.radius };
    return this.brokenHere.get(id) ?? null;
  }

  fleetZoneAt(zone: number): THREE.Vector3 | null {
    return this.fleet?.present(this.field.clock) && zone < this.fleet.zones.length ? this.fleet.zoneAt(zone, new THREE.Vector3()) : null;
  }

  fleetNovaHit(zone: number, distance: number): number {
    return this.fleet && zone < this.fleet.zones.length ? this.fleet.novaHit(zone, distance) : 0;
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
   * runs inside it is gone, whatever protects it and whichever side it is on (each browser
   * destroys its own and says so, as with every death), together with torpedoes and wreckage
   * there. The holder's clone burns up too and is printed again at once.
   */
  novaBlast(holder: Ship, position: THREE.Vector3) {
    const now = this.time;
    this.effects.explosion(position, holder.radius * 12, holder.flight.velocity);
    this.shockwave(position);
    for (const ship of [...this.ships]) {
      if (ship === holder || ship.owner !== null || !ship.alive || ship.flight.position.distanceTo(position) > NOVA_RADIUS) continue;
      ship.protectedUntil = Math.min(ship.protectedUntil, now);
      if (ship.structural(Infinity, now) === 'destroyed') this.shipDestroyed(ship, holder, 'nova');
    }
    if (this.fleet?.present(this.field.clock)) this.novaOnFleet(this.fleet, holder, position);
    // the holder's clone burns up in its own core, leaving nothing behind; no one is blamed for
    // it, and the sponsors are so thrilled by the show that the next clone comes without an ad.
    // Every browser hears of the nova and lets go of the cables on it, the hooks it runs
    // telling the others
    this.dropCables(holder);
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
   * A nova core went off near the battleship: every part it reaches burns, the closer the
   * fiercer, on every browser; the holder's browser counts the hits (see Fleet.novaHits) and
   * tells every browser, as with a torpedo's.
   */
  private novaOnFleet(fleet: Fleet, holder: Ship, position: THREE.Vector3) {
    for (const { zone, count } of fleet.novaHits(position)) {
      const at = fleet.zoneAt(zone, new THREE.Vector3());
      const share = count / fleet.hitsOf(zone);
      this.effects.explosion(at, 400 + 800 * share, fleet.velocity);
      this.effects.sparks(at, SCRAPE_COLOR, 60 + 120 * share);
      if (holder.owner === null) this.hitFleet(fleet, zone, holder, at, count, 'nova');
    }
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

  /** A flight school drill's torpedo: from a ship (the drone), homing on the own pilot, launched straight at it as from a tube. */
  private drillTorpedo(from: Ship) {
    const me = this.me!;
    const position = from.flight.position.clone();
    const velocity = toAim.subVectors(me.flight.position, position).setLength(TORPEDO_LAUNCH).clone();
    this.torpedoes.launch(`${from.id}.${from.torpedoesFired++}`, from, me, position, velocity, this.time, true);
  }

  private blowUp(torpedo: Torpedo) {
    this.effects.explosion(torpedo.position, TORPEDO_RADIUS * 4, torpedo.velocity);
    this.hearDebris(torpedo.position, TORPEDO_RADIUS * 4);
    this.torpedoes.remove(torpedo);
  }

  /** A torpedo went off on a ship this browser runs, whichever side the shooter is on (friendly fire). */
  applyTorpedoHit(ship: Ship, shooter: Ship | null) {
    const now = this.time;
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
      if (shooter && shooter !== ship) this.attacked(shooter);
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
    if (!me.alive || !me.perks.dodge || this.time < this.dodgeReadyAt) return;
    this.dodgeReadyAt = this.time + DODGE_RECHARGE;
    this.dodges++;
    this.thrusterKick(me, direction);
    this.kick = Math.min(2, this.kick + 0.8);
    this.sound.play('explosion', { volume: 0.5, rate: 2.6 });
  }

  /** A ship kicks its thrusters, sideways or up or down in its own frame: the dodge, and a bot's shove (see Bot.shove). */
  private thrusterKick(ship: Ship, direction: { x: number; y: number }) {
    // a damaged thruster kicks weaker
    const push = relative.set(direction.x, direction.y, 0).normalize().multiplyScalar(DODGE_SPEED * (0.25 + 0.75 * ship.thrusters));
    ship.flight.velocity.add(push.applyQuaternion(ship.flight.orientation));
    ship.strain = Math.min(1, ship.strain + DODGE_STRAIN);
    ship.kickJets(scratch.set(direction.x, direction.y, 0));
  }

  /**
   * The puffs of gas from every living ship's firing nozzles (see Ship.fireJets), white-blue and
   * tiny, laid anew each frame at the nozzles' mouths, so they stay on the hull however it moves.
   */
  private showJets() {
    for (const ship of this.ships) {
      if (!ship.alive || !ship.root.visible) continue;
      const { nozzles } = ship.nozzles;
      for (let i = 0; i < nozzles.length; i++) {
        const strength = ship.jets[i];
        if (strength < JET_SHOWN) continue;
        const mouth = ship.toWorld(nozzles[i].mouth, scratch);
        this.effects.jet(mouth, relative.copy(nozzles[i].exhaust).applyQuaternion(ship.flight.orientation), strength);
      }
    }
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

  /** The recorder's step (see recorder.ts): the own ship and the Host's hand before the flight computer. */
  private record(hand: Readonly<Controls>, dt: number) {
    const flight = this.me!.flight;
    this.recording = {
      t: this.time,
      dt,
      mode: this.flightMode,
      controls: { ...hand },
      pointer: this.input.pointer,
      out: { ...IDLE },
      gravity: this.outside(flight, dt, gravity).toArray(),
      position: flight.position.toArray(),
      velocity: flight.velocity.toArray(),
      orientation: flight.orientation.toArray() as [number, number, number, number],
      drive: flight.driveFactor,
      thrusters: flight.thrusterFactor,
    };
  }

  /** The recorder's step, finished with what the flight computer flew. */
  private recorded(out: Readonly<Controls>) {
    const frame = this.recording;
    if (!frame) return;
    frame.mode = this.flightMode;
    frame.out = { ...out };
    recorder?.add(frame);
    this.recording = null;
  }

  /** T: the autopilot on or off. */
  private toggleAutopilot() {
    this.autopilot = !this.autopilot;
    // nose and flight part from here on: the Course marker shows where the ship really flies
    if (!this.autopilot) this.hud.flashCourse();
    this.sound.beep(this.autopilot ? 880 : 440, 0.08);
  }

  /**
   * The autopilot: the ship flies where its nose points (see flyByNose). Right after a dodge and
   * on a swing the drift is the point: the input turns the nose as in free drift; so it is in a
   * flight school drill that asks for it (the hook's drift past its rock, see Drill.keepsDrift).
   */
  private trimDrift(controls: Readonly<Controls>): Controls {
    const out = Object.assign(this.computed, controls);
    const me = this.me!;
    if (this.time < this.dodgeReadyAt - DODGE_RECHARGE + DODGE_DRIFT || this.tethers.has(me) || (this.school && this.schoolContext?.keepDrift)) {
      this.flightMode = 'swing';
      return out;
    }
    return flyByNose(me.flight, controls, this.outside(me.flight, MAX_STEP, gravity), out);
  }

  /** What pulls and brakes a ship from outside over a step of `dt` (units/s²): the field's gravity, and the drag of an arena's air (see world/air). */
  private outside(flight: FlightModel, dt: number, target: THREE.Vector3): THREE.Vector3 {
    this.field.gravity(flight.position, target);
    if (this.field.air) dragOn(this.field.air, flight.position, flight.velocity, dt, target);
    return target;
  }

  /** Whether a point lies under the cloud deck of an arena's air. */
  private underDeck(position: THREE.Vector3): boolean {
    return !!this.field.air && altitudeIn(this.field.air, position) < 0;
  }

  /**
   * The air of an arena heats a ship this browser runs by its speed and depth (see world/air):
   * the heat goes into its radiators as the laser's does (see world/air, airBurn), and what the full
   * radiators cannot shed burns the hull. Under the deck the clouds clog its radiators, and the
   * reactor's waste heat builds up in them (see world/air, clogging). A clone that burns up counts
   * as a knockout of whoever shoved it last (see KNOCKOUTS).
   */
  private friction(ship: Ship, dt: number, now: number) {
    const air = this.field.air;
    if (!air || !ship.alive) {
      ship.finSpin.set(0, 0, 0);
      return;
    }
    const burn = airStep(ship, air, dt, MAX_HEAT);
    if (burn > 0 && ship.structural(burn, now) === 'destroyed') this.shipDestroyed(ship, null, 'air');
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
    // the maneuvering thrusters' nozzles that push and turn the ship (see ship/thrusters); drawn
    // once a frame by showJets
    ship.fireJets(dt, this.time);
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
   * Hitscan laser along the nose. The beam ends at the first thing in its path: a ship (of
   * either side), a torpedo, the battleship, a wreck or an asteroid, which takes one hit, or
   * whatever else is solid (see solidRay); each is looked for only before the nearest found so far.
   */
  /** Whether a ship is a raider who spares clones (see jumpers, The Quiet Man). */
  private sparesClones(ship: Ship): boolean {
    return !!this.jumpers?.spares && this.jumpers.bots.some((bot) => bot.ship === ship);
  }

  /** Whether a ship is one of the Loose harpooning a convoy (see jumpers, hooks): they spare the Magpie's drive, the drive of one of their own. */
  private sparesDrives(ship: Ship): boolean {
    return !!this.jumpers?.hooks && this.jumpers.bots.some((bot) => bot.ship === ship);
  }

  /** Whether the first hull on a ship's nose within the laser's reach shows it its drive. */
  private onDrive(shooter: Ship): boolean {
    const direction = shooter.flight.forward(forward);
    const hull = firstHull(this.ships, shooter, shooter.nose(muzzle), direction, LASER_RANGE * shooter.perks.laserReach);
    return !!hull?.ship && hull.ship.tailToward(direction);
  }

  private fireLaser(shooter: Ship) {
    shooter.loudAt = this.time;
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
    // an actor's shot for the cameras (see SchoolContext.blanks): wide of its mark, harmless
    if (this.jumpers?.blanks && this.jumpers.bots.some((bot) => bot.ship === shooter)) {
      direction.addScaledVector(shooter.flight.up(blankUp), BLANK_MISS).normalize();
      const start = shooter.muzzle(beamStart);
      this.effects.beam(start, beamEnd.copy(origin).addScaledVector(direction, LASER_RANGE), shooter.color);
      return;
    }
    // in an arena's haze the beam scatters: it reaches as far as the eye sees (see world/air)
    // a cutter reaches short (see Perks.laserReach)
    const range = LASER_RANGE * shooter.perks.laserReach;
    const reach = this.field.air ? reachIn(this.field.air, origin, direction, SIGHT_DEPTH, range) : range;
    let asteroidHit = this.field.raycast(origin, direction, reach, false, laserHit);
    let wreckHit = this.wrecks.raycast(origin, direction, asteroidHit?.distance ?? reach);
    if (wreckHit) asteroidHit = null;
    let beamLength = wreckHit?.distance ?? asteroidHit?.distance ?? reach;
    // the first hull in the way takes the beam, whichever side its ship is on (friendly fire)
    const hull = firstHull(this.ships, shooter, origin, direction, beamLength);
    let struck = hull?.ship ?? null;
    if (hull) {
      asteroidHit = wreckHit = null;
      beamLength = hull.distance;
    }
    // the President's battleship stops it: on its armor, or on a part it breaks
    let fleetHit = this.fleet?.raycast(origin, direction, beamLength, this.field.clock) ?? null;
    if (fleetHit) {
      asteroidHit = wreckHit = struck = null;
      beamLength = fleetHit.distance;
    }
    // and so does whatever else is solid: a ring's housing, a core, a probe, the comet's head
    let blocked = this.solidRay(origin, direction, beamLength);
    if (blocked !== null) {
      asteroidHit = wreckHit = struck = fleetHit = null;
      beamLength = blocked;
    }
    // a torpedo before all of it takes the beam and goes off
    const torpedoHit = this.torpedoes.raycast(origin, direction, beamLength, shooter, this.time);
    if (torpedoHit) {
      asteroidHit = wreckHit = struck = fleetHit = blocked = null;
      beamLength = torpedoHit.distance;
    }
    if (blocked !== null) this.effects.sparks(beamEnd.copy(origin).addScaledVector(direction, beamLength), shooter.color, 30);
    // a raider's beam on the hull it raids, the drill's barge, wears it down (see jumpers)
    const raid = this.jumpers;
    if (raid && raid.rock === null && blocked !== null && raid.bots.some((b) => b.ship === shooter)) {
      // the Loose fire harpoons, never beams, at the tugs they raid: the cable holds the tug (see Markers.hook)
      if (raid.hooks) {
        if (this.school?.harpoonAlong(origin, direction, blocked + 1, shooter)) return;
      } else if (this.school?.bargeRay(origin, direction, blocked + 1) !== null) raid.hits++;
    }

    // the beam's ends are copied wherever they are kept (the effects, the kill cam, the message)
    const end = beamEnd.copy(origin).addScaledVector(direction, beamLength);
    // the Host's beam on a hull the drill set out: the drill hears where it ended (a tug's winch)
    if (blocked !== null && shooter === this.me) this.school?.struck(end);
    const start = shooter.muzzle(beamStart);
    this.effects.beam(start, end, shooter.color);
    this.killcam.recordBeam(this.time, start, end, shooter.color);
    this.online?.sendFire(shooter, start, end);
    if (shooter.isLocal) this.sound.play('laser', { volume: 0.7 });
    // after the beam: the other browsers take a torpedo shot down only with the beam that did it
    if (torpedoHit) this.shootDown(torpedoHit.torpedo, shooter);

    // the ship the beam ended on: another peer simulates it and applies the damage, or this one
    if (struck && struck.owner !== null) {
      if (this.time >= struck.protectedUntil) {
        this.online?.sendHit(struck, origin, direction, shooter);
        this.effects.sparks(end, shooter.color, 60);
        if (shooter.isLocal) {
          this.hud.hit();
          this.sound.beep(1320);
          this.landed(end, t(struck.tailToward(direction) ? HIT_WORDS.drive : HIT_WORDS.armor), struck.tailToward(direction));
        }
      }
    } else if (struck) this.applyLaserHit(struck, origin, direction, shooter, beamLength);
    if (struck && shooter === this.me && struck.allyOf(shooter)) this.warnFriend(COMPUTER.friendHit);
    if (shooter === this.me) this.countShot(struck);

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
      // a beam on a rig or a buoy, not on the rock it stands on (the campaign fines it)
      if (shooter === this.me && asteroidHit!.part) this.rigBeams++;
      // a claim-jumper's beam on the rig it saws at wears the rig down, never the rock (see jumpers)
      const jumpers = this.jumpers;
      if (jumpers && asteroidHit!.part && asteroid.id === jumpers.rock && jumpers.bots.some((b) => b.ship === shooter)) {
        jumpers.hits++;
        this.effects.sparks(end, shooter.color, 40);
        return;
      }
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
        if (shooter === this.me) {
          this.rocksBroken++;
          this.brokenAt.copy(destroyed.object.position);
          this.brokenId = destroyed.id;
        }
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
   * A ship hit the own one (a beam, a torpedo): it is marked as an attacker on the HUD for
   * ATTACK_MEMORY seconds (see attackerOf). Nicole names it ("Vega is shooting at you!", another
   * Host by its number) when it is out of sight ahead (more than ATTACK_UNSEEN off the nose) or
   * a new one, but the same ship at most every ATTACK_REPEAT seconds and any at most every
   * ATTACK_GAP seconds. Whether she named it.
   */
  private attacked(shooter: Ship): boolean {
    const now = this.time;
    const me = this.me!;
    this.attackers.set(shooter, now);
    this.lastAttacker = shooter;
    const seen = me.flight.noseAngleTo(scratch.subVectors(shooter.flight.position, me.flight.position)) < ATTACK_UNSEEN;
    const fresh = shooter !== this.namedAttacker || now - this.namedAt > ATTACK_REPEAT;
    if (seen || !fresh || now - this.namedAt < ATTACK_GAP) return false;
    const line = shooter.kind === 'bot' ? ATTACKED.bot[shooter.name] : ATTACKED.host[this.hostNumber(shooter) - 1];
    if (!line || !this.speaker.say(line, 'urgent')) return false;
    this.namedAttacker = shooter;
    this.namedAt = now;
    return true;
  }

  /** Another Host's number in the round: its place among the Hosts besides the own one, in the order the round lists them. */
  private hostNumber(ship: Ship): number {
    let n = 0;
    for (const other of this.ships) {
      if (other === this.me || other.kind !== 'host') continue;
      n++;
      if (other === ship) return n;
    }
    return n;
  }

  /** How the HUD marks a ship that hit the own one (see attacked): the latest attacker, another within ATTACK_MEMORY seconds, or none. */
  private readonly attackerOf = (ship: Ship): 'latest' | 'recent' | null => {
    const at = this.attackers.get(ship);
    if (at === undefined || this.time - at > ATTACK_MEMORY) return null;
    return ship === this.lastAttacker ? 'latest' : 'recent';
  };

  /**
   * A laser beam struck a ship this browser simulates: damage, feedback, destruction, whichever
   * side the shooter is on (friendly fire). Also called for beams from other peers.
   */
  applyLaserHit(ship: Ship, origin: THREE.Vector3, direction: THREE.Vector3, shooter: Ship | null, distance?: number, cause: DeathCause = null, weight = 1) {
    // plating (an item) takes a hit into the drive
    // where the beam meets the ship
    const along = distance ?? scratch.subVectors(ship.flight.position, origin).dot(direction);
    if (ship.plating > 0 && ship.tailToward(direction) && ship.alive && this.time >= ship.protectedUntil) {
      ship.plating--;
      this.effects.sparks(scratch.copy(origin).addScaledVector(direction, along), PLATING_COLOR, 80);
      if (ship.isLocal) this.hud.flashMessage(this.time, ship.plating ? t('Plating holds') : t('Plating gone'), 1.2);
      return;
    }
    // a raider who spares clones (see jumpers) only scorches a hull he has worn down
    if (shooter && ship.hull <= SPARED_HULL && this.sparesClones(shooter)) {
      this.effects.sparks(scratch.copy(origin).addScaledVector(direction, along), shooter.color, 30);
      return;
    }
    const { status, zone } = ship.laserHit(origin, direction, this.time, weight);
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
      if (!(shooter && shooter !== ship && this.attacked(shooter))) this.speaker.say(COMPUTER[zone], serious ? 'urgent' : 'chatter');
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
    if (victim === this.me) this.cleanRun = false;
    // a crash soon after a shove is the shover's knockout; the victim's browser decides it
    const shover = victim.shovedBy;
    if (!killer && shover && victim.owner === null && KNOCKOUTS.has(cause) && this.time - victim.shovedAt <= KNOCKOUT_SECONDS) {
      killer = shover;
      what ??= cause ?? undefined;
      cause = 'knockout';
    }
    if (victim === this.me && this.campaignHull) this.cloneLost(cause, what);
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
    victim.respawnAt = this.time + (victim === this.me ? RESPAWN_SECONDS : BOT_RESPAWN_SECONDS);
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
        const line =
          cause === 'nova'
            ? t('Vaporized by the nova of {name}')
            : cause === 'self'
              ? t('Taken along by the self-destruct of {name}')
            : cause === 'plume'
              ? t('Grilled in the drive plume of {name}')
              : cause === 'ram'
                ? t('Rammed by {name}')
                : cause === 'knockout'
                  ? t('Knocked out by {name}')
                  : killer.allyOf(victim)
                    ? t('Friendly fire · shot down by {name}')
                    : t('Shot down by {name}');
        const [before, after = ''] = line.split('{name}');
        this.deathCause = [before, ...markedName(killer.kind, killer.name), after];
      } else if (cause === 'self') this.deathCause = t('Self-destructed');
      else if (cause === 'well') this.deathCause = t(WELL_DEATHS[this.venue.id] ?? msg('Crashed'));
      else if (cause === 'air') this.deathCause = t('Burned up in the clouds');
      else if (cause === 'flare') this.deathCause = t('Burned up in the solar flare');
      else if (fleetDeath || cometDeath) this.deathCause = t((fleetDeath || cometDeath)!);
      else this.deathCause = victim.outsideSince !== null ? t('Lost in deep space') : t('Crashed');
    }
    // a kill of the Host's own is bigger: more fire, a jolt, and the points where it happened
    // a kill of the own side (friendly fire, a shove, a plume, a ram) costs the killer as much
    // (see game/friendly); none counts after the round's end
    const counts = !!killer && killer !== victim && !this.roundOver;
    const teamKill = counts && killer!.allyOf(victim);
    const scored = counts && !teamKill;
    const ownKill = scored && killer?.isLocal === true && killer === this.me;
    const credit = cause === 'nova' ? NOVA_KILL_CREDIT : 1;
    // a kill of the other side by a ship this browser runs counts in its streak and earns its
    // bonus (see game/streaks); a dead clone's streak is over
    const streak = scored && killer!.owner === null ? this.streaks.kill(killer!.id, this.time) : 0;
    const bonus = streakBonus(streak, this.killPoints(), cause === 'nova');
    this.streaks.end(victim.id);
    this.effects.explosion(victim.flight.position, victim.radius * (ownKill ? 3 : 2), victim.flight.velocity.clone().multiplyScalar(0.3));
    if (ownKill) {
      this.hud.popup(this.camera, victim.flight.position, credit > 1 ? t('Nova kill +{points}', { points: this.killPoints() * credit }) : `+${this.killPoints() + bonus}`, 'kill');
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
    if (counts && killer && killer.owner === null) {
      const points = killScore(teamKill, this.killPoints(), credit);
      killer.score += points + bonus;
      if (scored) killer.kills += credit;
      if (scored && killer.isLocal) {
        this.sound.beep(1320, 0.07, 0.15);
        this.sound.beep(1760, 0.12, 0.15, 0.09);
      }
      // the own pilot killed one of its own side: the points it costs, where it happened
      if (teamKill && killer === this.me) {
        this.hud.popup(this.camera, victim.flight.position, t('FRIENDLY FIRE {points}', { points }), 'hit');
        this.hud.flashMessage(this.time, t('Friendly fire · {name} down', { name: victim.name }), 2);
        this.sound.beep(220, 0.25, 0.15);
      }
    }
    // an own side's killer is no one to take revenge on
    if (victim === this.me) this.moments.died(killer && killer !== victim && !killer.allyOf(victim) ? killer.id : null);
    if (ownKill) {
      const moment = this.moments.ownKill(victim.id, streak, cause === 'nova') ?? (cause === 'knockout' ? 'knockout' : null);
      if (moment) this.moment(moment, bonus);
    }
    // remote ships do not report how they crashed: "Crash" covers rocks and wreckage alike
    const killedBy =
      cause === 'well' || cause === 'air' ? t(this.venue.name) : cause === 'flare' ? t('Solar flare') : fleetDeath ? t('Battleship') : cometDeath ? t('Comet') : victim.outsideSince !== null ? t('Deep space') : t('Crash');
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
    const angle = THREE.MathUtils.radToDeg(angleTo(ship.flight.velocity, course.normals[i]));
    return `gate ${i} out ${Math.round(out * METERS_PER_UNIT)} m along ${Math.round(along * METERS_PER_UNIT)} m at ${Math.round(angle)}° next ${ship.gates % course.points.length}`;
  }

  /** The skill of a bot (see meanSkill), null for a Host's ship. */
  private skillOf(ship: Ship): number | null {
    const bot = this.bots.find((b) => b.ship === ship);
    return bot ? meanSkill(bot.own) : null;
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
    // the depths of a planet's air crush a ship, a black hole swallows it; no protection holds
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
      const hit = this.field.raycast(ship.previous, sweep, moved, false, sweepHit);
      if (hit) flight.position.copy(ship.previous).addScaledVector(sweep, Math.max(0, hit.distance - 1));
    }
    const asteroid = this.field.overlap(flight.position, ship.radius);
    if (asteroid && this.field.resolve(asteroid, flight.position, ship.radius, normal)) {
      // the rock's surface moves with its drift and its spin; the tip of a long rock sweeps fast
      this.field.surfaceVelocity(asteroid, scratch.copy(flight.position).addScaledVector(normal, -ship.radius), surface);
      this.bounce(ship, surface, now, 'rock');
    } else if (this.fleet?.resolve(flight.position, ship.radius, this.field.clock, normal)) this.bounce(ship, this.fleet.velocity, now, 'hull');
    else if (this.touchesRing(flight.position, ship.radius)) this.bounce(ship, STILL, now, 'gate');
    // a hull a drill moored (Patience in the campaign): a hull as the battleship's is
    else if (this.school?.touchesHull(flight.position, ship.radius, normal)) this.bounce(ship, STILL, now, 'hull');
  }

  /** The solids besides the field and the battleship (see game/solids): every use below is taken from this one table. */
  private readonly solids = solidTable({
    rings: {
      touch: (position, radius, out) => {
        if (!this.touchesRing(position, radius)) return false;
        out.copy(normal);
        return true;
      },
      ray: (origin, direction, max) => this.ringsRay(origin, direction, max),
    },
    cores: () => this.flags?.cores ?? NO_BALLS,
    hulls: {
      touch: (position, radius, out) => !!this.school?.touchesHull(position, radius, out),
      ray: (origin, direction, max) => this.school?.hullRay(origin, direction, max) ?? null,
    },
    wreck: (position, radius) => this.wrecks.overlap(position, radius),
    probes: () => this.probes.list,
    torpedoes: () => this.torpedoes.list,
    head: (out, velocity) => this.headNow(out, velocity),
  });

  /** What a probe bounces off: the field, the battleship, and the solids of PROBE_BOUNCES (see game/items, bounce). */
  private probeSolids: readonly Solid[] | null = null;
  /** What a probe's slot bounces off: the field, the rings and the battleship, which every browser has (nearly) alike (see Probes.update). */
  private slotSolids: readonly Solid[] | null = null;

  /** How far along a beam (within `max`) the first of the solids of BEAM_STOPS lies; null when none does (see fireLaser). */
  private readonly solidRay = rayOf(this.solids, BEAM_STOPS);

  /**
   * How far along a beam from `origin` along `direction` (within `max`) the first ring's housing
   * lies (its band, housings and struts, felt for along the beam in steps of RAY_STEP where it
   * passes the ring): the race's gates, the bases, the flight school's rings still standing.
   */
  private ringsRay(origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
    let best = max;
    let found = false;
    const take = (distance: number | null) => {
      if (distance !== null && distance < best) {
        best = distance;
        found = true;
      }
    };
    for (const ring of this.rings) take(this.ringRay(ring.center, ring.facing, ring.radius, origin, direction, best));
    this.school?.eachRing((center, facing, radius) => take(this.ringRay(center, facing, radius, origin, direction, best)));
    return found ? best : null;
  }

  /**
   * Where the comet's head is now (into `out`) while it flies whole, or null: solid as long as it
   * lasts; its velocity into `velocity` when given, over HEAD_PACE of field time either side.
   */
  private headNow(out: THREE.Vector3, velocity?: THREE.Vector3): THREE.Vector3 | null {
    const comet = this.shower?.comet;
    const clock = this.field.clock;
    if (!comet || clock >= headEnd(comet)) return null;
    if (velocity) velocity.subVectors(headAt(comet, clock + HEAD_PACE, out), headAt(comet, clock - HEAD_PACE, headBefore)).divideScalar(2 * HEAD_PACE);
    return headAt(comet, clock, out);
  }

  /** Where a beam first meets a ring's solid parts (see touchRing), felt for in steps of RAY_STEP through the ring's reach; null when it passes. */
  private ringRay(center: THREE.Vector3, facing: THREE.Vector3, radius: number, origin: THREE.Vector3, direction: THREE.Vector3, max: number): number | null {
    const reach = ringRim(radius).outer;
    const enter = raySphere(origin, direction, center, reach);
    if (enter === null || enter > max) return null;
    const leave = Math.min(max, origin.distanceTo(center) + reach);
    for (let along = enter; along <= leave; along += RAY_STEP) {
      if (touchRing(center, facing, radius, solidProbe.copy(origin).addScaledVector(direction, along), RAY_STEP / 2, ringNormal)) return along;
    }
    return null;
  }

  /** Whether a sphere touches one of the solids of WRECK_GRINDS: what wreckage grinds to dust on besides rock and hull. */
  private readonly grinds: (position: THREE.Vector3, radius: number) => boolean = touchOf(this.solids, WRECK_GRINDS);

  private readonly fuse = touchOf(this.solids, TORPEDO_FUSE);

  /**
   * Whether a sphere touches one of the solids of TORPEDO_FUSE (a torpedo in flight only of
   * another shooter than `skip`'s, whose salvo flies together): what sets off a torpedo where it
   * flies, besides rock and hull.
   */
  private readonly touchesSolid = (position: THREE.Vector3, radius: number, skip: Torpedo | null = null): boolean => this.fuse(position, radius, undefined, skip?.shooter);

  /** Whether a piece of the shower touches one of the solids of SHOWER_BURSTS, and where it bursts (into `at`). */
  private readonly showerBursts = touchOf(this.solids, SHOWER_BURSTS);

  /**
   * Whether a ship touches the housings of a ring (see touchRing): a race's gates, the bases of
   * Capture the Flag (both in `rings`), the flight school's rings still standing. Flying through
   * is the point; flying into the coil is a crash. Moves the ship out and sets `normal` when it
   * does, and `gateStruck` to the race's gate.
   */
  private touchesRing(position: THREE.Vector3, radius: number): boolean {
    this.gateStruck = -1;
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      if (!touchRing(ring.center, ring.facing, ring.radius, position, radius, normal)) continue;
      if (this.course) this.gateStruck = i;
      return true;
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
        const closing = ram(a.body, b.body, ramApart, ownA, ownB);
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
    // the clone's body takes the strain in Ship.update, a bot's alike (the HUD shows it, see presentRound)
    const strain = me.alive ? me.strain : 0;
    const alarms = this.alarms;
    let impact = Infinity;
    const speed = flight.velocity.length();
    if (me.alive && speed > 100) {
      const heading = scratch.copy(flight.velocity).divideScalar(speed);
      // a rock, the well's body or the battleship's hull
      const hit = this.field.raycast(flight.position, heading, speed * 20, true, impactHit);
      if (hit) {
        const timeToImpact = Math.max(0, hit.distance - me.radius) / speed;
        const thrust = MAIN_THRUST * Math.max(me.drive * me.perks.drive, 0.01);
        // damaged thrusters turn the ship more slowly
        const turning = flight.noseAngleTo(retrograde.copy(heading).negate());
        const turnRate = 0.3 + 0.7 * (0.25 + 0.75 * me.thrusters);
        const flipTime = ((turning / Math.PI) * FLIP_SECONDS) / turnRate;
        const brakeTime = flipTime + speed / thrust / 2;
        if (timeToImpact < brakeTime + IMPACT_MARGIN + (this.campaignHull ? stoneSeconds(this.campaign.scars) : 0)) {
          impact = timeToImpact;
          alarms.raise({ id: 'impact', level: timeToImpact < IMPACT_CRITICAL ? 'critical' : 'warning', text: t('IMPACT'), direction: heading, seconds: timeToImpact, tone: 'impact' });
        }
      }
    }
    this.impactAhead = impact < Infinity;
    this.lockWarning();
    this.crossingTip(me);
    if (me.alive && me.overheated) {
      alarms.raise({ id: 'laser', level: 'caution', text: t('LASER OVERHEATED') });
      this.tip('hot');
    }
    this.novaAlarm(me);
    this.torpedoAlarm(me);
    if (me.alive && me.driveOffline(now)) alarms.raise({ id: 'drive', level: 'caution', text: t('DRIVE OVERHEATED') });
    this.cometAlarm(me);
    this.flareAlarm(me);
    this.airAlarm(me);
    this.hud.setFlareHeat(Math.max(this.flareGlow, this.airGlow));
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
    const beat = Math.max(strain, hullCritical ? HEART_HULL : 0, well >= WELL_CRITICAL ? HEART_WELL : 0);
    if (beat > 0.4 && now >= this.nextHeartbeat) {
      this.sound.beep(55, 0.12, 0.25 * beat);
      this.sound.beep(48, 0.14, 0.2 * beat, 0.16);
      this.nextHeartbeat = now + 1.1 - 0.5 * beat;
    }
    if (alarms.top?.level === 'critical') {
      // the link frays in a panic: short and seldom, never long enough to hide a warning
      if (Math.random() < dt * CRITICAL_GLITCHES) this.glitch.trigger(0.2 + Math.random() * 0.2, 0.06 + Math.random() * 0.1);
      // death is a breath away: the music drops out, only the heart and the alarm remain
      if ((impact < SILENCE_BEFORE || (well > 0 && this.escape === 'lost')) && now >= this.silenceReadyAt) {
        this.radio.dropout(SILENCE_SECONDS);
        this.silenceReadyAt = now + SILENCE_COOLDOWN;
      }
    }
    alarms.begin();
  }

  /**
   * A gravity well's hold on the own ship (see escapeLoad): the escape gauge, its alarm towards
   * the well, and Nicole, once for each level it reaches until the pull lets go again: the well
   * is near, it is pulling, full burn now (the overdrive, now, while it is ready), past the drive's
   * point of no return the overdrive as long as its shove away would still get the ship out (see
   * overdriveEscapes), and only then a quiet goodbye.
   * Returns the load (0 without a well).
   */
  private wellAlarm(me: Ship): number {
    const well = this.field.well;
    if (!me.alive || !well) {
      this.hud.setEscape(null);
      this.showOrbit(null, null, 0);
      this.orbitPath.show(null, me.flight.position, me.flight.velocity);
      return 0;
    }
    const thrust = MAIN_THRUST * Math.max(me.drive * me.perks.drive, 0.01);
    const load = escapeLoad(well, me.flight.position, me.flight.velocity, thrust);
    // the orbit readout, recomputed every frame: whatever changed the path (a burn, a ram, a hit) shows at once
    // (a flight computer without the wells module has no escape gauge and reads no orbit; the alarm it sounds all the same)
    const gauged = this.aid('wells');
    const orbit = gauged && orbitable(well) ? readOrbit(well, me.flight.position, me.flight.velocity, thrust, !this.autopilot, this.orbitState === 'ready' || this.orbitState === 'stable', this.orbit) : null;
    this.showOrbit(orbit, well, gauged ? load : 0);
    this.orbitPath.show(orbit === 'ready' || orbit === 'stable' ? well : null, me.flight.position, me.flight.velocity);
    this.hud.setEscape(gauged ? load : null, orbit === 'stable');
    // the warnings come again once the well has let go of the ship for good
    if (load < WELL_RELEASE) this.wellSaid = 0;
    const level = wellAlarmLevel(load, orbit);
    // in a stable orbit the ship falls around the body, never into it: the alarms are quiet
    if (!level) return orbit === 'stable' ? 0 : load;
    const hole = this.venue.id === 'hole';
    // from WARNING on the flight ahead says what still gets the ship out (see wellEscape), a few
    // times a second: the drive alone, only the overdrive's shove first, or nothing
    if (load < WELL_WARNING) this.escape = 'drive';
    else if (this.time >= this.escapeAt) {
      this.escapeAt = this.time + ESCAPE_EVERY;
      const drive = me.drive * me.perks.drive;
      const nose = me.flight.forward(forward);
      // the drive burning (its flame, as the flight model keeps it) with the nose away from the well
      const burning = me.flight.throttle > 0.5 && angleTo(nose, relative.subVectors(me.flight.position, well.position)) < BURNING_AWAY;
      this.escape = wellEscape(well, me.flight.position, me.flight.velocity, nose, drive, me.driveColdFor(this.time), burning, me.perks.overdrive && this.time >= this.overdriveReadyAt);
    }
    const rescue = this.escape === 'overdrive';
    const lost = this.escape === 'lost';
    this.alarms.raise({ id: 'well', level: rescue || lost ? 'critical' : level, text: rescue ? t('OVERDRIVE · AWAY FROM IT') : lost ? t('NO RETURN') : hole ? t('BLACK HOLE · BURN AWAY') : t('GRAVITY WELL · BURN AWAY'), direction: relative.subVectors(well.position, me.flight.position) });
    const said = rescue || lost ? ALARM_RANK.critical + (rescue ? 1 : 2) : ALARM_RANK[level];
    if (said > this.wellSaid) {
      this.wellSaid = said;
      // the overdrive only where nothing else gets the ship out: where the drive still does, its
      // shove and the cold drive after it would leave the ship weaker than a burn
      const line = rescue ? COMPUTER.wellOverdrive : lost ? COMPUTER.wellLost : level === 'critical' ? COMPUTER.wellTight : level === 'warning' ? (hole ? COMPUTER.holePull : COMPUTER.jupiterPull) : hole ? COMPUTER.holeNear : COMPUTER.jupiterNear;
      this.speaker.say(line, 'urgent');
    }
    return load;
  }

  /**
   * The orbit readout (see game/orbit): shown where the escape gauge shows, or wherever the
   * path is an orbit, and Nicole's word when it becomes one (see OrbitCalls).
   */
  private showOrbit(state: OrbitState | null, well: Well | null, load: number) {
    this.orbitState = state;
    const shown = state === 'ready' || state === 'stable' || load >= WELL_GAUGE ? state : null;
    this.hud.setOrbit(shown, this.orbit, well?.radius ?? 0);
    this.orbitCalls.update(shown, this.time, this.sayOrbit);
  }

  /** Nicole's orbit line (see OrbitCalls); whether she said it. */
  private readonly sayOrbit = (line: 'ready' | 'stable') => this.speaker.say(line === 'ready' ? COMPUTER.orbitReady : COMPUTER.orbitStable);

  /**
   * The comet of the round (see comet.ts): its route, the warning before it comes, its shower
   * shown at the field time and its head running down the rock in its way. The flight school
   * sees none (see roundComets), so nothing there warns of one either.
   */
  private playComet(dt: number, me: Ship) {
    const clock = this.field.clock;
    const seed = this.online ? textSeed(this.online.session.room) : this.soloSeed;
    const key = `${seed}.${this.roundId}.${this.venue.id}.${!!this.school}`;
    if (key !== this.cometsOfKey) {
      this.cometsOfKey = key;
      this.comets = roundComets(seed, this.roundId, this.field.well, !!this.school);
    }
    const comet = cometAt(this.comets, clock);
    // the alarm follows only the comet that comes now
    if (!comet) this.cometCalled = null;
    // the warning, once, as the head nears the arena's edge
    if (comet && comet !== this.cometCalled && clock >= comet.edge - COMET_WARNING && clock < comet.at) {
      this.cometCalled = comet;
      this.speaker.say(COMPUTER.comet, 'urgent');
      this.radio.announce(pick(ANNOUNCER_COMET), null);
      this.hud.flashMessage(this.time, t('Comet inbound · take cover behind a rock, or turn your nose into its shower'), 5);
      this.sound.beep(980, 0.3, 0.2);
    }
    const flying = comet && clock >= cometStart(comet) && clock <= cometEnd(comet) ? comet : null;
    if (this.shower?.comet !== flying) {
      this.shower = flying ? new Shower(flying) : null;
      this.struck.clear();
    }
    this.cometView.setDetail(this.graphics.look.rocks);
    this.cometView.update(this.shower, clock, this.camera.position);
    this.cometTail(me, dt);
    if (!flying) return;
    const whole = flying.broken === Infinity;
    runDown(flying, this.field, clock, (rock) => this.burstRock(rock), (piece, point) => this.cometShove(piece, point));
    if (whole && flying.broken !== Infinity) this.headBroke(flying);
    // a core adrift in the head's way is lost to it (the lead browser decides, as for every core)
    if (this.flags && clock < headEnd(flying) && (!this.online || this.online.isLead)) this.flags.runDown(headAt(flying, clock, cometHead), HEAD_RADIUS);
    if (this.shower) this.showerMeetsSolids(flying, this.shower, clock, dt);
    const fleet = this.fleet;
    if (fleet) this.cometMeetsFleet(flying, fleet, clock, dt);
  }

  /**
   * The shower bursts on what stands in its way (see meetSolids): the field's pieces near the
   * swarm (swept along each piece's way since the last step, so none slips through a thin piece
   * of junk), the rings, wreckage and the sponsor cores, sparks flying as on the battleship's
   * armor. Each browser sees it for the ships it runs; rock is cover from the swarm.
   */
  private showerMeetsSolids(comet: Comet, shower: Shower, clock: number, dt: number) {
    const rocks = this.showerRocks;
    rocks.length = 0;
    headAt(comet, clock, cometHead);
    courseAt(comet, clock, cometCourse);
    // the swarm trails the head along its course; a well bends the route by a few hundred meters
    const margin = COMET_SPEED * dt * 2 + SHOWER_BEND;
    for (const rock of this.field.asteroids.values()) {
      showerOffset.subVectors(rock.object.position, cometHead);
      const along = showerOffset.dot(cometCourse);
      if (along > rock.radius + margin || along < -(SHOWER_LENGTH + rock.radius + margin)) continue;
      if (showerOffset.addScaledVector(cometCourse, -along).length() > SHOWER_WIDE + PIECE_RADIUS + rock.radius + margin) continue;
      rocks.push(rock);
    }
    // the solids a piece is held against besides the field's: only those near the swarm are looked at, for each of its 800 pieces
    this.showerMargin = margin;
    const near = this.showerNear;
    near.ring = near.wreck = near.core = false;
    for (const ring of this.rings) if (this.nearShower(ring.center, ringReach(ring.radius))) near.ring = true;
    this.school?.eachRing(this.markRingNear);
    for (const wreck of this.wrecks.list) if (this.nearShower(wreck.mesh.position, wreck.radius + PIECE_RADIUS)) near.wreck = true;
    if (this.flags) for (const core of this.flags.cores) if (this.nearShower(core.position, CORE_REACH + PIECE_RADIUS)) near.core = true;
    meetSolids(shower, clock, dt, this.showerHit, (point) => {
      if (Math.random() < SHOWER_SPARKS) this.effects.sparks(point, SCRAPE_COLOR, PIECE_RADIUS * 4);
    });
  }

  /** Whether something of `reach` around `center` may touch the swarm this step (the swarm as showerMeetsSolids lays it out). */
  private nearShower(center: THREE.Vector3, reach: number): boolean {
    showerOffset.subVectors(center, cometHead);
    const along = showerOffset.dot(cometCourse);
    if (along > reach + this.showerMargin || along < -(SHOWER_LENGTH + reach + this.showerMargin)) return false;
    return showerOffset.addScaledVector(cometCourse, -along).length() <= SHOWER_WIDE + PIECE_RADIUS + reach + this.showerMargin;
  }

  private readonly markRingNear = (center: THREE.Vector3, _facing: THREE.Vector3, radius: number) => {
    if (this.nearShower(center, ringReach(radius))) this.showerNear.ring = true;
  };

  /** The field's pieces near the comet's swarm this step (see showerMeetsSolids). */
  private readonly showerRocks: Asteroid[] = [];
  /** Whether any ring, wreck or core lies near the swarm this step (see showerMeetsSolids): else none is looked at. */
  private showerMargin = 0;
  private readonly showerNear: Record<'ring' | 'wreck' | 'core', boolean> = { ring: false, wreck: false, core: false };

  /** Whether a piece of the shower meets something solid on its way from `from` to `to`, and where (into `at`). */
  private readonly showerHit = (from: THREE.Vector3, to: THREE.Vector3, at: THREE.Vector3): boolean => {
    const way = from.distanceTo(to);
    showerWay.subVectors(to, from).divideScalar(Math.max(way, 1e-6));
    for (const rock of this.showerRocks) {
      // the point of its way nearest the rock's center, against the rock's reach
      const along = THREE.MathUtils.clamp(showerOffset.subVectors(rock.object.position, from).dot(showerWay), 0, way);
      if (showerOffset.addScaledVector(showerWay, -along).length() > rock.radius + PIECE_RADIUS) continue;
      const hit = way > 1 ? this.field.raycast(from, showerWay, way, false, showerRay) : null;
      if (hit) {
        at.copy(from).addScaledVector(showerWay, hit.distance);
        return true;
      }
      if (this.field.overlap(to, PIECE_RADIUS)) {
        at.copy(to);
        return true;
      }
      break;
    }
    return this.showerBursts(to, PIECE_RADIUS, at, undefined, this.showerNear);
  };

  /**
   * A comet meets the President's battleship: its head breaks up on the hull (see Comet.broken)
   * where the lead browser's battleship meets it (a solo round's own), as the lead says, and the
   * battleship that did not get out of its way goes down (the lead browser decides); each piece
   * of its shower bursts where it meets the hull, so the hull is cover from it.
   */
  private cometMeetsFleet(comet: Comet, fleet: Fleet, clock: number, dt: number) {
    const whole = comet.broken === Infinity;
    const told = fleet.rammedAt;
    if (told !== null && told >= cometStart(comet) && told <= cometEnd(comet)) comet.broken = told;
    const sparks = (point: THREE.Vector3) => {
      if (Math.random() < SHOWER_SPARKS) this.effects.sparks(point, SCRAPE_COLOR, PIECE_RADIUS * 4);
    };
    // only the lead's battleship ends the head: each browser glides its own a little apart
    if (meetObstacle(comet, this.shower, fleet, clock, dt, sparks, !this.online || this.online.isLead)) {
      fleet.rammedAt = clock;
      if (fleet.present(clock)) {
        this.hud.flashMessage(this.time, t('The comet rams the battleship'), 3);
        this.fleetEvents(fleet.sink(), null);
      }
    }
    if (whole && comet.broken !== Infinity) this.headBroke(comet);
  }

  /** A comet's head broke up on the battleship: a flash and its shards where it struck. */
  private headBroke(comet: Comet) {
    const at = comet.broken;
    headAt(comet, at, cometHead);
    this.effects.explosion(cometHead, HEAD_RADIUS * 3, STILL);
    this.effects.debris(cometHead, normal.copy(courseAt(comet, at, cometCourse)).negate(), HEAD_RADIUS * 2);
    this.hearDebris(cometHead, HEAD_RADIUS * 4);
    this.witnessBlast(cometHead, HEAD_RADIUS * 30, 1);
  }

  /**
   * The own clone in a comet's tail (see CometView.feel): harmless dust and gas, felt all the
   * same. The dust patters on the hull, the link crackles now and then, the dust streaks past;
   * the first time in a comet's tail the flight computer says it is harmless, so the Host keeps
   * fearing the shower and not the tail.
   */
  private cometTail(me: Ship, dt: number) {
    const depth = this.cometView.feel(me.alive && !this.spectating ? me.flight.position : null, this.riding);
    const inside = depth > 0;
    if (inside && !this.inTail) {
      this.linkHit(TAIL_GLITCH, 0.25);
      const comet = this.shower?.comet ?? null;
      if (comet !== this.tailCalled) {
        this.tailCalled = comet;
        this.hud.flashMessage(this.time, t('Comet tail · only dust and gas, harmless'), 3);
      }
    }
    this.inTail = inside;
    if (!inside) return;
    if (Math.random() < dt * TAIL_PATTER * depth) this.sound.patter(depth);
    if (Math.random() < dt * TAIL_STATIC * depth) this.glitch.trigger(TAIL_GLITCH * (0.5 + Math.random() * 0.5), 0.05 + Math.random() * 0.1);
  }

  /**
   * The own clone flying through something thin and harmless that patters on the hull: a ring's
   * layer of ice grains, the ice crystals escaping at the derelict's break, Enceladus's plumes, the dust a drill hole
   * blows (see Mining.dustAt). The thicker it is and the faster the ship flies, the more.
   */
  private hullPatter(me: Ship, dt: number) {
    if (!me.alive || this.spectating) return;
    const position = me.flight.position;
    const layer = this.venue.grains;
    if (layer) this.patter(me, dt, 1 - THREE.MathUtils.smoothstep(Math.abs(position.y), 0.8 * layer, layer), GRAIN_PATTER, GRAIN_PATTER_SPEED, 0.5);
    this.patter(me, dt, this.landmarks.mistAt(position), MIST_PATTER, GRAIN_PATTER_SPEED, 0.4);
    this.patter(me, dt, this.landmarks.plumeAt(position), PLUME_PATTER, GRAIN_PATTER_SPEED, 0.5);
    this.patter(me, dt, this.mining.dustAt(position), DUST_PATTER, DUST_PATTER_SPEED, 0.6);
  }

  /** Patter on the hull out of a cloud `thick` (0..1): `rate` bursts a second at `fullSpeed` and faster, as loud as `loudness` there. */
  private patter(me: Ship, dt: number, thick: number, rate: number, fullSpeed: number, loudness: number) {
    if (thick <= 0) return;
    const pace = Math.min(1, me.flight.velocity.length() / fullSpeed);
    if (Math.random() < dt * rate * thick * pace) this.sound.patter(loudness * thick * pace);
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
    if (clock < headEnd(comet) && position.distanceTo(headAt(comet, clock, cometHead)) < HEAD_RADIUS + ship.radius) {
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
    const near = (ship.radius + PIECE_RADIUS) * (ship.radius + PIECE_RADIUS);
    for (let i = 0; i < SHOWER_PIECES; i++) {
      if (struck[i] || shower.gone(i, clock) || shower.pieceAt(i, clock, cometPiece).distanceToSquared(position) > near) continue;
      struck[i] = 1;
      // only rock gives cover, haze does not
      if (!this.field.lineOfSight(cometCover.copy(position).addScaledVector(cometCourse, -SHOWER_COVER), position, Infinity)) continue;
      cometRelative.subVectors(cometVelocity, ship.flight.velocity).normalize();
      this.applyLaserHit(ship, cometPiece, cometRelative, null, undefined, 'shower', SHOWER_WEIGHT);
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
    const direction = relative.subVectors(headAt(comet, Math.min(clock, headEnd(comet)), cometHead), me.flight.position);
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
  private tip(tip: Tip): boolean {
    return !this.school && this.coach.give(tip, (line) => this.speaker.say(line, 'urgent'));
  }

  /**
   * The closest torpedo homing on the own ship within TORPEDO_WARNING: TORPEDO INBOUND with the
   * seconds to its hit at the closing speed (the warning tone beats faster as they run out), and
   * Nicole counting it down: "Torpedo!" as it comes into range (unless a tip of hers is being
   * said, or the coach's tip of the torpedo comes now), the distance marks while there is time
   * to hear them, and "Break!" when a hard turn now makes it overshoot. One that went past
   * starts the count over when it comes round.
   */
  private torpedoAlarm(me: Ship) {
    let torpedo: Torpedo | null = null;
    let distance = TORPEDO_WARNING;
    // (a flight computer without the threat module sees no torpedo coming)
    if (me.alive && this.aid('threat')) {
      for (const candidate of this.torpedoes.list) {
        if (candidate.target !== me) continue;
        const away = candidate.position.distanceTo(me.flight.position);
        if (away < distance) {
          torpedo = candidate;
          distance = away;
        }
      }
    }
    if (!torpedo) {
      this.torpedoCall = null;
      return;
    }
    const toward = relative.subVectors(torpedo.position, me.flight.position);
    const closing = toward.dot(closingVelocity.subVectors(me.flight.velocity, torpedo.velocity)) / Math.max(distance, 1);
    const seconds = closing > 0 ? distance / closing : null;
    this.alarms.raise({ id: 'torpedo', level: distance < TORPEDO_CRITICAL ? 'critical' : 'warning', text: t('TORPEDO INBOUND'), direction: toward, seconds, tone: 'torpedo' });
    let call = this.torpedoCall;
    if (call && (call.torpedo !== torpedo || seconds === null)) call = this.torpedoCall = null;
    if (seconds === null) return;
    let line: string | null = null;
    if (!call) {
      // the marks already behind it pass unsaid
      let mark = 0;
      while (mark < TORPEDO_MARKS.length && distance < TORPEDO_MARKS[mark][0]) mark++;
      call = this.torpedoCall = { torpedo, mark, broke: false };
      if (seconds > TORPEDO_BREAK && !this.tip('torpedo') && !this.speaker.sayingAny(TIP_LINES)) this.speaker.say(COMPUTER.torpedo, 'urgent');
    }
    while (call.mark < TORPEDO_MARKS.length && distance < TORPEDO_MARKS[call.mark][0]) line = TORPEDO_MARKS[call.mark++][1];
    if (!call.broke && seconds <= TORPEDO_BREAK) {
      call.broke = true;
      this.speaker.say(COMPUTER.torpedoBreak, 'urgent');
    } else if (line && seconds >= TORPEDO_MARK_SECONDS) {
      this.speaker.say(line, 'chatter');
    }
  }

  /** In a deathmatch with the autopilot on, an enemy close by crossing the own flight (see CROSSING_RANGE): Nicole suggests free drift. */
  private crossingTip(me: Ship) {
    if (this.roundMode !== 'deathmatch' || !this.autopilot || !me.alive || !this.coach.due('crossing')) return;
    for (const ship of this.ships) {
      if (ship === me || !ship.alive || ship.allyOf(me)) continue;
      const line = relative.subVectors(ship.flight.position, me.flight.position);
      const distance = line.length();
      if (distance > CROSSING_RANGE || distance < 1 || me.flight.noseAngleTo(line) < CROSSING_ANGLE) continue;
      const across = crossingAcross.subVectors(ship.flight.velocity, me.flight.velocity);
      across.addScaledVector(line, -across.dot(line) / (distance * distance));
      if (across.length() < CROSSING_SPEED) continue;
      this.tip('crossing');
      return;
    }
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
    // a solar storm blinds the sensors that would see a nose on the own ship, and a flight computer without the threat module never reads them
    if (!me.alive || this.storming || !this.aid('threat')) {
      this.hud.setLock('', null);
      return;
    }
    let level = 0;
    let shooter: Ship | null = null;
    for (const ship of this.ships) {
      // the target drone and the unarmed sparring bot never shoot
      if (ship === me || !ship.alive || ship === this.drone || (ship === this.sparring?.bot.ship && !this.sparring.armed)) continue;
      const sighted = noseOn(ship.flight, me.flight.position, me.radius);
      if (sighted > level && this.field.lineOfSight(ship.flight.position, me.flight.position, LOCK_DEPTH)) {
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
   * The flight computer's aids to orientation (see world/reference): the reference plane's grid,
   * drop lines to it from the other ships in sight, the course's rings and the waypoint, the
   * height and the climb, and the fixed references (the field's center, the sun, the arena's big
   * things, the bases and the battleship). The benchmark's HUD left out leaves them out too.
   */
  private orient(subject: Ship, waypoint: THREE.Vector3 | null) {
    const hud = !this.bench.has('hud');
    const shown = hud && subject.alive && this.state === 'playing' && !this.replaying;
    const plane = this.plane;
    plane.clearDrops();
    if (shown) {
      if (!this.storming) for (const ship of this.ships) if (ship !== subject && ship.alive && this.inSight(ship)) plane.drop(ship.flight.position, this.camera);
      if (this.course && !this.school) for (const point of this.course.points) plane.drop(point, this.camera);
      if (waypoint) plane.drop(waypoint, this.camera);
    }
    const aim = this.me?.alive ? aimPoint : this.camera.getWorldDirection(scratch).multiplyScalar(AIM_DEPTH).add(this.camera.position);
    plane.update(shown, subject.flight.position, this.camera, aim, window.innerWidth, window.innerHeight, this.renderer.getPixelRatio());
    if (!hud) return;
    this.hud.setAltitude(subject, airAround(this.field.air, subject.flight.position));
    const references = this.shownReferences;
    references.length = 0;
    for (const reference of this.arenaReferences) references.push(reference);
    // the sun lies beyond everything: its mark points along its direction from wherever the camera is
    this.sunReference.position.copy(this.space.sunDirection).multiplyScalar(ARENA_LIMIT * 100).add(this.camera.position);
    references.push(this.sunReference);
    for (let team = 0; this.flags && team < this.baseReferences.length; team++) {
      this.baseReferences[team].position.copy(this.flags.bases[team]);
      references.push(this.baseReferences[team]);
    }
    if (this.fleet?.present(this.field.clock)) {
      this.fleetReference.position.copy(this.fleet.position);
      references.push(this.fleetReference);
    }
    // the campaign's finds within their ping (see seekFinds)
    if (this.school) for (const reference of this.hunt.references) references.push(reference);
    this.hud.setReferences(this.camera, subject, references);
  }

  /** The ship whose range and closure rate the HUD shows: what a torpedo would lock on now, else the nearest rival in sight. */
  private cueTarget(subject: Ship): Ship | null {
    if (!subject.alive) return null;
    const locked = this.torpedoTarget(subject);
    if (locked instanceof Ship) return locked;
    let nearest: Ship | null = null;
    let best = Infinity;
    for (const ship of this.ships) {
      if (ship === subject || !ship.alive || ship.allyOf(subject)) continue;
      const distance = ship.flight.position.distanceToSquared(subject.flight.position);
      if (distance < best && this.inSight(ship)) {
        nearest = ship;
        best = distance;
      }
    }
    return nearest;
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
    let depth = waypoint ? waypoint.distanceTo(flight.position) : (this.field.raycast(flight.position, direction, AIM_DEPTH, false, aimHit)?.distance ?? AIM_DEPTH);
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
    // a place of the campaign has no edge: space goes on, empty, as far as a ship cares to fly
    if (this.venue.open || ship.flight.position.length() < ARENA_LIMIT) {
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
      this.camera.position.lerp(cameraGoal, 1 - exp(-CAMERA_FOLLOW * 0.4 * dt));
      look.lookAt(this.camera.position, flight.position, flight.up(scratch));
      slerp(this.camera.quaternion, aim.setFromRotationMatrix(look), 1 - exp(-CAMERA_TURN * 0.5 * dt));
    } else {
      // a burn presses the ship ahead of the camera, which hangs back a little; in cinema mode
      // it hangs farther back, follows softer and drifts slowly around the ship
      const lag = me.alive ? flight.throttle * DRIVE_LAG : 0;
      const film = this.cinema ? 1 : 0;
      const drift = this.time * CINEMA_DRIFT;
      flight.toWorld(cameraGoal.set(film * me.radius * sin(drift), me.radius * (CHASE_HEIGHT + film * (0.35 + 0.25 * cos(drift * 0.7))), me.radius * (CHASE_DISTANCE + film * CINEMA_DISTANCE + lag)), cameraGoal);
      const soft = this.cinema ? CINEMA_SOFTNESS : 1;
      this.camera.position.lerp(cameraGoal, 1 - exp(-CAMERA_FOLLOW * soft * dt));
      slerp(this.camera.quaternion, flight.orientation, 1 - exp(-CAMERA_TURN * soft * dt));
    }
    this.riding = me.alive ? flight.velocity : null;
    // the drive kicks: the view widens while it burns and with speed, and the chase camera trembles
    const burn = me.alive ? flight.throttle : 0;
    const fast = me.alive ? Math.min(1, flight.velocity.length() / MAX_SPEED) : 0;
    const fov = this.camera.fov + (CAMERA_FOV + DRIVE_FOV_KICK * burn + SPEED_FOV * fast + BOOST_FOV * this.boostKick - this.camera.fov) * (1 - exp(-6 * dt));
    this.boostKick *= exp(-BOOST_FADE * dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) this.setFov(fov);
    if (!this.cockpit && !reducedMotion.matches) {
      if (burn > 0.05) this.camera.position.add(scratch.randomDirection().multiplyScalar(me.radius * DRIVE_SHAKE * burn));
      // a jolt for every hit the own laser lands, bigger for a kill; it fades in a fraction of a second
      if (this.kick > 0.01) this.camera.position.add(scratch.randomDirection().multiplyScalar(me.radius * KICK_SHAKE * this.kick));
    }
    this.kick *= exp(-KICK_FADE * dt);
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
    const progress = THREE.MathUtils.clamp(this.roundSeconds() / INTRO_SECONDS, 0, 1);
    const at = introTarget.fromArray(this.venue.preview?.at ?? [0, 0, 0]);
    const from = applyAxisAngle(introFrom.fromArray(this.venue.preview?.from ?? PREVIEW_FROM).sub(at), UP, (progress - 0.5) * INTRO_SWING).add(at);
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

  /**
   * Ends the solo plate's view beside it (see updateMenuCamera): the camera shows the whole
   * picture again, in the picture's own shape (cutting a view from a wider one sets the
   * camera's aspect to the wider one's, and clearing the cut leaves it there).
   */
  private endPreview() {
    if (!this.camera.view?.enabled) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.clearViewOffset();
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
      this.camera.position.fromArray(chosen.preview?.from ?? PREVIEW_FROM).sub(at);
      applyAxisAngle(this.camera.position, UP, this.time * PREVIEW_DRIFT).add(at);
      this.camera.lookAt(at);
      // the landmark beside the plate, not behind it: the picture is cut from a wider one
      const { width, height } = this.renderer.domElement;
      const shift = width * PREVIEW_SHIFT;
      this.camera.setViewOffset(width + 2 * shift, height, 2 * shift, 0, width, height);
      return;
    }
    this.endPreview();
    const t = this.time * 0.08;
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(cos(t), sin(t * 0.7) * 0.2, sin(t));
  }
}
