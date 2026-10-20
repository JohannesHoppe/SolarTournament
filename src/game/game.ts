import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Assets, ShipType } from '../assets';
import { ASTEROID_POINTS, AsteroidField, FIELD_RADIUS, raySphere } from '../world/asteroids';
import { Sound } from '../sound/audio';
import { Bot, BOT_NAMES } from '../ship/bots';
import { Effects } from '../view/effects';
import { Glitch } from '../view/glitch';
import { Hud, METERS_PER_UNIT, meters } from '../view/hud';
import { bindVolume, Radio, type MusicCue } from '../music/radio';
import type { Spoken } from '../music/band';
import { COMPUTER, ANNOUNCER_ALIEN, ANNOUNCER_ARENA, ANNOUNCER_KILL, ANNOUNCER_NAMES, ANNOUNCER_OPEN, ANNOUNCER_ROCK, SPONSOR_BREAK, SPONSOR_HAPPY } from '../music/lines';
import { Speaker } from '../sound/speaker';
import { hash, mixSeed, ROUND_SECONDS, textSeed, titleFor, type Song } from '../music/songs';
import { showTransmission } from '../music/transmission';
import { IDLE, Input, keyLabel, learnKeyboardLayout, type Action, type Controls } from '../input/input';
import { Ship, type ShipState, type Zone } from '../ship/ship';
import { MAIN_THRUST, MAX_SPEED, MAX_TURN_RATE, OVERDRIVE_PUSH, RCS_THRUST } from '../ship/flight';
import { Session, TOURNAMENT_SIZE, type RoundState } from '../net/session';
import { Online, type OnlineGame } from '../net/online';
import { Lobby, type Listing } from '../net/lobby';
import { newRoom, roomFragment, roomFromFragment, type Room } from '../net/room';
import { cleanName } from '../net/validate';
import { Space, SUN_DIRECTION } from '../world/space';
import { Arena, ARENA_GRACE, ARENA_LIMIT } from '../world/arena';
import { Belt, BELT_INNER } from '../world/belt';
import { FlightSchool, type SchoolContext } from './school';
import { SponsorBreak } from './sponsors';
import { Wrecks, type Wreck, type WreckState } from '../world/wrecks';
import { ARENAS, arenaByKey, arenaOfRound, type ArenaId, type ArenaProfile } from '../world/arenas';
import { Landmarks } from '../world/landmarks';
import { Lensing } from '../view/lensing';
import { Radar, type RadarMark } from '../view/radar';
import { KillCam } from '../view/killcam';
import { LOCK_ANGLE, LOCK_DISTANCE, TORPEDO_DAMAGE, TORPEDO_RADIUS, Torpedoes, type Torpedo } from './torpedoes';
import { Probes, ITEM_NAMES, ITEM_HINTS, type Probe, type ItemKind } from './items';
import type { FieldState } from '../world/asteroids';
import { Course, GATE_POINTS, GATE_RADIUS, GATES, LAPS, modeOfRound, PLACE_POINTS, type RoomMode, type RoundMode } from './race';
import { markedName } from '../view/marks';

/** Online tournaments show the scoreboard this long before the next round starts. */
const RESULTS_SECONDS = 12;
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
const MODE_NAMES: Record<RoomMode, string> = { deathmatch: 'Deathmatch', race: 'Race', mixed: 'Deathmatch and race' };
/** A solo round is one of these, by chance. */
const SOLO_MODES: readonly RoundMode[] = ['deathmatch', 'race'];
/** A kill in a race is worth less than in a deathmatch: the gates and the finish decide. */
const RACE_KILL_POINTS = 200;
/** Points for shooting down a torpedo, and how often a bot with a lock fires one (per second). */
const TORPEDO_DOWN_POINTS = 50;
const BOT_TORPEDO_RATE = 0.08;
/**
 * A nova core destroys every other ship within NOVA_RADIUS (units, 800 m) of its holder; its
 * shell runs out there in NOVA_EXPANSION seconds. A bot that holds one only sets it off with
 * at least NOVA_CROWD enemies inside, and bots flee a nova holder within NOVA_FLEE radii.
 */
const NOVA_RADIUS = 16000;
const NOVA_EXPANSION = 0.8;
const NOVA_CROWD = 2;
const NOVA_FLEE = 1.5;
/** An idle bot goes for a probe within this distance (units, 1.5 km). */
const PROBE_LURE = 30000;
/** Plating (an item) turns this many hits into the drive, or one torpedo. */
const PLATING_CHARGES = 2;
/** A torpedo homing on the own ship within this distance sets off TORPEDO INBOUND (units, 2 km). */
const TORPEDO_WARNING = 40000;
/** How a ship that touches an arena's massive body dies, for the sponsor break. */
const WELL_DEATHS: Partial<Record<ArenaId, string>> = { giant: 'Burned up in the clouds', hole: 'Crossed the event horizon' };
/** A client's round clock jumps to the lead browser's when it is this far off (s), and drifts towards it otherwise. */
const ROUND_SNAP = 0.25;
/** Online, the asteroids jump to the lead browser's field time when they are this far off (s), and otherwise glide towards it. */
const FIELD_SNAP = 0.5;
/** The announcer comments on a death at most this often (s). */
const ANNOUNCER_COOLDOWN = 7;
/** Song of the menu. The flight school plays no music, so Nicole is heard clearly. */
const LOUNGE_SEED = 2584;
/** The idle link to the clone hangar glitches now and then, every 5 to 14 s. */
const IDLE_GLITCH_MIN = 5;
const IDLE_GLITCH_RANGE = 9;
/** Bots of a solo round: enough for a dogfight, few enough to follow. */
const BOT_COUNT = 3;
/** Reach of the laser (units, 10 km), far beyond the arena; also the length of the rays that find the shadow of the rocks. */
const LASER_RANGE = 200000;
/** Points for destroying a ship: a kill is worth more than any rock. */
const KILL_POINTS = 500;
/** Bots respawn after this delay; the own pilot sees the sponsor break after it. */
const RESPAWN_SECONDS = 3;
/** Impacts slower than this (units/s) only scratch the paint. */
const SAFE_IMPACT = 250;
/** Hull damage per unit/s of impact speed above SAFE_IMPACT. */
const IMPACT_DAMAGE = 1 / 12;
/** Share of the impact speed a ship keeps when it bounces off a rock. */
const RESTITUTION = 0.3;
/** Each death of the Host by an enemy raises the bots' ease (see Bot.ease) by this much in a solo round; a kill by the Host lowers it by KILL_EASE. */
const DEATH_EASE = 0.35;
const KILL_EASE = 0.1;
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
/** The announcer opens a round this long after the launch (ms), once the flight computer is through. */
const ANNOUNCER_OPEN_DELAY_MS = 7000;
/** The arena's name shows this long after the launch (ms), once the link and the hint for the mouse are through. */
const ARENA_TITLE_DELAY_MS = 4500;
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
/** Ships farther away than this never set off the lock warning (units, 3 km). */
const LOCK_RANGE = 60000;
/** A nose within this many times the own ship's angular radius counts as TRACKED. */
const LOCK_TRACKING = 4;
/** Vertical field of view of the camera (degrees). */
const CAMERA_FOV = 70;
/** A full burn widens the view by this much (degrees) and shakes the chase camera by this share of the ship radius: the drive is felt. */
const DRIVE_FOV_KICK = 7;
const DRIVE_SHAKE = 0.012;
/** How fast the chase camera follows the ship's position and turns (1/s): tight, so the ship feels direct. */
const CAMERA_FOLLOW = 20;
const CAMERA_TURN = 18;
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
 * overload, a kick of DODGE_SPEED (units/s, 25 m/s) sideways or up or down. The autopilot lets
 * the drift be for DODGE_DRIFT seconds, so the ship really leaves the line of fire (about
 * 25 m, more than half a ship length), and the thrusters need DODGE_RECHARGE seconds before
 * the next one. It presses the clone into the side of the seat (DODGE_STRAIN).
 */
const DODGE_SPEED = 500;
const DODGE_DRIFT = 0.7;
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
/** The camera hangs back by this share of the ship radius at a full burn, and the view widens by SPEED_FOV degrees at the speed limit. */
const DRIVE_LAG = 0.6;
const SPEED_FOV = 6;
/** Hosts who ask for less motion get no camera shake. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
/** What a landed hit says where it struck, by the zone it broke. */
const HIT_WORDS: Record<Zone, string> = { reactor: 'REACTOR', drive: 'DRIVE', thrusters: 'ARMOR', armor: 'ARMOR' };
const ZONE_MESSAGES: Record<Zone, string> = {
  reactor: 'Reactor breach',
  drive: 'Main drive damaged',
  thrusters: 'Thrusters damaged',
  armor: 'Armor hit',
};
const BEST_SCORE_KEY = 'solartournament.best';
const CALLSIGN_KEY = 'solartournament.callsign';
/** Set once the flight school is complete; the menu then leads with the solo round. */
const SCHOOL_DONE_KEY = 'solartournament.school';
/** The drill a Host has reached in the flight school, so a reload continues there; cleared when the school is complete or started over. */
const SCHOOL_STEP_KEY = 'solartournament.school-step';

type State = 'menu' | 'playing' | 'paused' | 'results';
/** What killed a ship without a killer, where this browser saw it happen: a rock, wreckage, deep space, the arena's massive body. */
type DeathCause = 'rock' | 'wreck' | 'space' | 'well' | null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** The label of a menu mode button: the text of its first line, without the Enter key. */
const modeName = (id: string) => $(id).querySelector<HTMLElement>('.mode-label')!;

/** One of several lines, at random; only the local voice says it. */
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const scratch = new THREE.Vector3();
const forward = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();
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

/** 1st, 2nd, 3rd, 4th … */
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/** The sensors see nothing (a solar storm). */
const blind = () => false;

/** Real time in seconds; unlike game time it never slows down or pauses. */
const wallClock = () => performance.now() / 1000;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): the value just isn't remembered
  }
}

function storageRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // storage unavailable: there is nothing to remove
  }
}

export class Game implements OnlineGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 10, 400000);
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
  private roomMode: RoomMode = 'deathmatch';
  /** What the running round is, and its course when it is a race. */
  private roundMode: RoundMode = 'deathmatch';
  private course: Course | null = null;
  /** The tournament was full: the own Host watches a pilot (watchIndex, Tab switches) instead of flying. */
  private spectating = false;
  private watchIndex = 0;
  /** The pilot the watching Host follows, when the director cut to it, and until when a pilot picked by hand holds. */
  private watchedShip: Ship | null = null;
  private cutAt = -Infinity;
  private handPickedUntil = -Infinity;
  /** The director's shot of the pilot: the chase camera, or a wide shot from the side. */
  private wideShot = false;
  /** Number of the running online round; a new number resets the scores. */
  private roundId = 0;
  /** The round this browser was in when it started over in the tournament (see rejoin), until it knows the round again. */
  private rejoinedFrom: number | null = null;
  private ships: Ship[] = [];
  private bots: Bot[] = [];
  private me: Ship | null = null;
  private cockpit = false;
  private selectedShip: ShipType = 'human';
  /** The drive lights, always in the scene; ships borrow them (see lendLight). */
  private readonly engineLights: THREE.PointLight[] = [];
  /** X is held: the flight computer turns the own ship towards `flipGoal`, fixed when the flip started. */
  private flipping = false;
  private readonly flipGoal = new THREE.Vector3();
  /** The nose points at the flip's goal (it beeps once when it gets there). */
  private flipAligned = false;
  /** The autopilot keeps the own ship flying where its nose points: the thrusters take out every sideways drift. On at the start of a round; T switches to free drift and back. */
  private autopilot = false;
  /** How much the bots go easy on the Host in a solo round, 0..1 (see DEATH_EASE). */
  private ease = 0;
  /** The nose is on a ship: the laser would hit now (see assistAim). */
  private onTarget: 'drive' | 'armor' | null = null;
  /** Angle between the nose and the aim target (see aimTarget). */
  private aimAngle = 0;
  /** Strength of the camera jolt after the own laser hit something, 0..2. */
  private kick = 0;
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
  /** Warnings below the crosshair, rebuilt every frame in the same array. */
  private readonly warnings: string[] = [];
  /** Whether the camera sees a ship past the asteroids, for the HUD markers. */
  private readonly inSight = (ship: Ship) => this.field.lineOfSight(this.camera.position, ship.flight.position);
  /** Whether the own ship's sensors see a ship past the asteroids, for the radar. */
  private readonly sensed = (ship: Ship) => this.field.lineOfSight((this.watched() ?? this.me!).flight.position, ship.flight.position);
  private readonly radar = new Radar($<HTMLCanvasElement>('radar'));
  /** The radar's marks besides ships and rocks, reused from frame to frame. */
  private readonly marks: RadarMark[] = [
    { position: new THREE.Vector3(), label: 'Center', color: '#4d91ff' },
    { position: new THREE.Vector3(), label: '', color: '#ff9d00' },
  ];
  private readonly torpedoMarks: RadarMark[] = Array.from({ length: 16 }, () => ({ position: new THREE.Vector3(), label: 'Torpedo', color: '#ff3b30' }));
  private readonly probeMarks: RadarMark[] = Array.from({ length: 12 }, () => ({ position: new THREE.Vector3(), label: '', color: '#3dff9a' }));
  /** The ship holding a nova core, in white, so everyone sees where not to be. */
  private readonly novaMark: RadarMark = { position: new THREE.Vector3(), label: 'NOVA', color: '#ffffff' };
  /** The marks the radar shows this frame (see radarMarks). */
  private readonly shownMarks: RadarMark[] = [];
  /** How the own clone died last, for the sponsor break. */
  private deathCause: string | (string | Node)[] = 'Your clone is dead';
  /** When the current screen (menu, playing, paused, results) came up (performance.now, ms). */
  private screenSince = 0;
  /** Online round whose scoreboard has been shown and announced. */
  private resultsShownFor: number | null = null;
  /** Rock hits from other browsers for a round this browser has not started yet. */
  private readonly pendingRocks: { id: string; at: number; round: number }[] = [];
  /** Rocks this browser's ships broke online: when, by whom, for how many points. */
  private readonly brokenHere = new Map<string, { at: number; ship: Ship; points: number }>();
  /** The last hit this browser's ships landed on each rock online that did not break it: when, by whom. */
  private readonly lastRockHit = new Map<string, { at: number; ship: Ship }>();
  /** The running flight school, or null in a tournament round. */
  private school: FlightSchool | null = null;
  private schoolContext: SchoolContext | null = null;
  /** Target drone of the flight school. */
  private drone: Ship | null = null;
  /** G-force strain of the own pilot, 0..1. */
  private strain = 0;
  private nextHeartbeat = 0;
  private nextWarningBeep = 0;
  /** The nova holder the own pilot was last warned about, and when the siren sounds next. */
  private novaWarned: Ship | null = null;
  private nextNovaSiren = 0;
  private nextLockBeep = 0;
  /** Speed of game time; 0 freezes the simulation while rendering continues. */
  timeScale = 1;
  /** The picture has to be drawn again even in a still pause (see frame). */
  private redraw = true;
  private glitched = false;
  private readonly glitch = new Glitch();
  private readonly radio: Radio;
  /** The flight computer's voice: reads out what the screen shows. */
  private readonly speaker: Speaker;
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
    this.composer.addPass(this.glitch.pass);
    this.glitch.onStatic = (strength) => this.sound.crackle(strength);
    this.radio = new Radio(sound.context, sound.headset, (song) => this.announceSong(song), (spoken, delay) => this.subtitle(spoken, delay));
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
    this.scene.add(this.torpedoes.group, this.probes.group);
    this.scene.add(this.space.sky, this.space.dust, this.space.streaks, this.arena.mesh, this.belt.group, this.landmarks.group, this.space.lights, this.field.group, this.wrecks.group, this.effects.group);
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
    callsign.placeholder = 'Host';
    // only the ship buttons carry data-ship; the tournament switches share their look
    const shipButtons = document.querySelectorAll<HTMLButtonElement>('.ship-select button[data-ship]');
    for (const button of shipButtons) {
      button.addEventListener('click', () => {
        this.selectedShip = button.dataset.ship as ShipType;
        shipButtons.forEach((b) => b.classList.toggle('selected', b === button));
      });
    }
    $('start').addEventListener('click', () => this.startRound('solo'));
    $('school').addEventListener('click', () => this.startRound('school'));
    $('school-reset').addEventListener('click', () => {
      storageRemove(SCHOOL_STEP_KEY);
      this.showSchoolProgress();
    });
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
      for (const id of ['fullscreen', 'fullscreen-pause']) $(id).textContent = document.fullscreenElement ? 'Leave fullscreen' : 'Fullscreen';
    });
    this.showRadioState();

    if (this.invitedRoom()) modeName('online').textContent = 'Join tournament';
    this.markLeadMode();
  }

  /**
   * The main action of the menu, started by Enter: joining when invited, the flight school
   * until it is complete, then the solo round.
   */
  private leadMode(): 'online' | 'school' | 'start' {
    if (this.invitedRoom()) return 'online';
    return storageGet(SCHOOL_DONE_KEY) ? 'start' : 'school';
  }

  /**
   * The flight school button says where a Host left off, with a way to start over, and once
   * the school is complete it says so for good: a Host who made it through keeps the badge.
   */
  private showSchoolProgress() {
    const step = Number(storageGet(SCHOOL_STEP_KEY) ?? 0);
    const cleared = storageGet(SCHOOL_DONE_KEY) !== null;
    const note = $('school').querySelector<HTMLElement>('.mode-note')!;
    if (step > 0) note.textContent = `Continue at drill ${step + 1} of ${FlightSchool.drills}.${cleared ? ' Completed before.' : ''}`;
    else note.textContent = cleared ? '✓ Completed. Cleared for the tournament.' : 'Learn to fly. Training clones are free.';
    $('school').classList.toggle('cleared', cleared);
    $('school-reset').hidden = step <= 0;
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
      const text = this.lobby?.settled ? 'No public tournament right now. Start one.' : 'Looking for tournaments…';
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
      const meta = `${MODE_NAMES[listing.mode]} · ${listing.hosts} of ${TOURNAMENT_SIZE} Hosts${listing.bots ? ' · bots' : ''} · ${minutes}:${seconds} left`;
      const join = listing.hosts >= TOURNAMENT_SIZE ? 'Watch' : 'Join';
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
    const who = this.roomPublic ? 'Listed here for every Host; anyone can join or watch.' : 'Not listed: only who has your invite link finds it.';
    const bots = this.roomBots ? `Bots fill the ${TOURNAMENT_SIZE} places; every Host who joins takes a bot's place.` : 'No bots: only Hosts fly.';
    const rounds = { deathmatch: 'Every round a deathmatch.', race: `Every round a race: ${LAPS} laps through ${GATES} gates, lasers on.`, mixed: 'Deathmatch and race take turns.' }[this.roomMode];
    $('room-note').textContent = `${who} ${bots} ${rounds} The link works for good: whoever follows it later starts the tournament again.`;
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
          this.lobbyOpening = false;
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
    modeName('online').textContent = 'Connecting…';
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
      this.notice('Could not connect to the tournament. Try again in a moment.');
      this.speaker.say(COMPUTER.noLink, 'urgent');
    } finally {
      this.connecting = false;
      button.disabled = false;
      modeName('online').textContent = this.invitedRoom() ? 'Join tournament' : 'Online tournament';
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
      this.watchIndex = 0;
      // a sponsor break in progress ends without booting a clone; HUD and mouse come back
      if (this.sponsors.visible) {
        this.sponsors.hide();
        if (this.state === 'playing') {
          this.hud.show(true);
          this.input.steerWithMouse(true);
        }
      }
    } else {
      this.respawn(me);
    }
  }

  /** The pilot a watching Host follows (see direct). */
  private watched(): Ship | null {
    return this.watchedShip?.alive ? this.watchedShip : null;
  }

  /**
   * The director of the broadcast a watching Host sees: it follows the pilot in the thick of
   * it (another ship close, one on its tail, its nose on an enemy, its hull battered) and cuts
   * to another only after a while, or at once when the followed one dies. Tab picks the next
   * pilot by hand; the director takes over again after a while without a key.
   */
  private direct(now: number) {
    if (!this.spectating) return;
    const pilots = this.ships.filter((ship) => ship !== this.me && ship.alive);
    if (!pilots.length) {
      this.watchedShip = null;
      return;
    }
    if (now < this.handPickedUntil) {
      this.watchedShip = pilots[this.watchIndex % pilots.length];
      return;
    }
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
    const text = `Fly with me in the SolarTournament "${this.room?.name ?? 'Tournament'}"`;
    try {
      if (navigator.share && this.input.touchActive) {
        await navigator.share({ title: 'SolarTournament', text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      button.textContent = 'Invite link copied';
      this.hud.flashMessage(this.time, 'Invite link copied. Send it to your friends.', 3);
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
    modeName('online').textContent = 'Online tournament';
  }

  private toggleRadio() {
    this.radio.toggle();
    this.showRadioState();
  }

  private showRadioState() {
    $('radio').classList.toggle('off', !this.radio.enabled);
    $('now-playing').classList.toggle('off', !this.radio.enabled);
    if (!this.radio.enabled) $('radio-title').textContent = 'Radio off';
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
    showTransmission(spoken, delay, this.radio.song?.title ?? null, this.announcedName ?? 'pilot');
  }

  /**
   * The announcer revels in every death: a line about the victim, the president's joy or
   * the dead "alien". Not every death, and never two comments on top of each other.
   */
  private commentOnDeath(victim: Ship, killer: Ship | null, cause: DeathCause) {
    // the flight school is on no broadcast; a death the announcer has no line for goes uncommented
    if (this.school || (!killer && cause !== 'rock')) return;
    const now = wallClock();
    if (now < this.nextAnnouncement) return;
    const roll = hash(textSeed(victim.id), victim.deaths, 7);
    if (roll % 10 >= 7) return;
    this.nextAnnouncement = now + ANNOUNCER_COOLDOWN;
    const lines = victim.type === 'alien' && roll % 2 === 0 ? ANNOUNCER_ALIEN : killer ? ANNOUNCER_KILL : ANNOUNCER_ROCK;
    const line = lines[(roll >>> 4) % lines.length];
    const spoken = victim.name.toLowerCase();
    // bots have rendered names; the clone of a human Host is spoken as "pilot" and shown in the subtitle
    this.announcedName = victim.name;
    this.radio.announce(line, ANNOUNCER_NAMES.includes(spoken) ? spoken : null);
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
      const seed = this.online ? mixSeed(textSeed(this.online.session.room), this.roundId) : this.soloSeed;
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
        if (action === 'confirm') {
          const lead = this.leadMode();
          if (lead === 'online') this.openOnline();
          else this.startRound(lead === 'school' ? 'school' : 'solo');
        }
        break;
      case 'playing':
        if (action === 'pause') this.pause();
        if (this.killcam.active) {
          if (action === 'confirm') this.killcam.stop();
          break;
        }
        if (this.sponsors.visible) {
          if (action === 'confirm') this.sponsors.confirm();
          break;
        }
        // a watching Host has no cockpit of its own
        if (action === 'camera' && !this.spectating) this.cockpit = !this.cockpit;
        if (action === 'autopilot' && this.me?.alive) this.toggleAutopilot();
        if (action === 'overdrive') this.overdrive();
        if (action === 'torpedo' && !this.spectating && this.me) this.fireTorpedo(this.me);
        if (action === 'watch' && this.spectating) {
          this.watchIndex++;
          this.handPickedUntil = this.time + DIRECTOR_PAUSE;
        }
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
    $('menu').hidden = state !== 'menu';
    $('crest').hidden = state !== 'menu';
    $('pause').hidden = state !== 'paused';
    $('results').hidden = state !== 'results';
    $('invite').hidden = !this.online;
    $('invite').textContent = 'Invite friends';
    // the A button that changed the screen does not also fire
    this.input.holdFire();
    if (state !== 'playing') this.sponsors.hide();
    this.hud.show(state === 'playing');
    this.input.steerWithMouse(state === 'playing');
    if (state !== 'playing') this.sound.setEngine(0, 0);
  }

  /**
   * Builds an arena: its field, its sun and scenery. A field restored from a snapshot is
   * built by the snapshot (see restoreField) and only takes the rest here.
   */
  private enterArena(arena: ArenaProfile, state?: FieldState) {
    this.venue = arena;
    this.field.generate(arena.layout);
    // a race's course is laid out in the field as generated, the same on every browser
    if (this.course) {
      this.scene.remove(this.course.root);
      this.course.dispose();
    }
    this.course = this.roundMode === 'race' ? new Course(this.field, arena.layout.seed) : null;
    if (this.course) this.scene.add(this.course.root);
    if (state) this.field.restore(state, arena.layout);
    this.space.setSun(arena.sun);
    this.landmarks.show(arena);
    this.belt.group.visible = arena.id === 'belt';
    this.wrecks.clear();
    this.torpedoes.clear();
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

  /** Shows where the round is played and what it is: the arena's name, a race's laps, what makes the arena special. */
  private announceArena() {
    const race = this.roundMode === 'race' ? ` · Race: ${LAPS} laps through ${GATES} gates` : '';
    this.hud.flashMessage(this.time, `${this.venue.name}${race} · ${this.venue.tagline}`, 5);
  }

  /** What an online round is, by the room's rule and the round number. */
  private onlineRoundMode(): RoundMode {
    return modeOfRound(this.room?.mode ?? 'deathmatch', Math.max(0, this.roundId));
  }

  /** Points for a kill: less in a race, where the gates and the finish decide. */
  private killPoints() {
    return this.roundMode === 'race' ? RACE_KILL_POINTS : KILL_POINTS;
  }

  private showMenu() {
    this.leaveOnline();
    this.clearShips();
    this.enterArena(ARENAS[0]);
    const best = Number(storageGet(BEST_SCORE_KEY) ?? 0);
    $('best-score').textContent = best ? `Personal best: ${best} pts` : '';
    this.showSchoolProgress();
    this.markLeadMode();
    // a clone that died last leaves no muffled radio behind in the hangar
    this.radio.setMuffled(false);
    $('now-playing').hidden = false;
    this.setScreen('menu');
  }

  private clearShips() {
    this.killcam.stop();
    this.torpedoes.clear();
    this.probes.reset();
    this.wrecks.clear();
    this.brokenHere.clear();
    this.lastRockHit.clear();
    for (const ship of this.ships) {
      this.returnLight(ship);
      this.scene.remove(ship.root);
    }
    this.ships = [];
    this.bots = [];
    this.me = null;
    this.drone = null;
    this.sparring = null;
    if (this.school) {
      this.speaker.stop();
      this.scene.remove(this.school.root);
      this.school.dispose();
      this.school = null;
      this.schoolContext = null;
    }
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

    this.clearShips();
    // the flight school trains in the belt; a solo round is in an arena of chance; online the
    // room and round decide, so a first round starts in the room's first arena (see arriveInRound)
    // online the round is unknown until the lead browser tells it (see syncRound)
    this.roundId = mode === 'online' ? -1 : 0;
    // a solo round needs no choices: arena and mode come by chance
    this.roundMode = mode === 'online' ? this.onlineRoundMode() : mode === 'solo' ? pick(SOLO_MODES) : 'deathmatch';
    if (mode === 'online') this.enterArena(arenaOfRound(this.online!.session.room, 0));
    else this.enterArena(mode === 'school' ? ARENAS[0] : pick(ARENAS));
    this.hud.reset();
    $('hud-room').textContent = '';

    this.me = this.addShip(this.online ? `p:${this.online.selfId}` : 'me', callsign, this.selectedShip, true);
    this.school = mode === 'school' ? new FlightSchool(Number(storageGet(SCHOOL_STEP_KEY) ?? 0)) : null;
    if (this.school) this.scene.add(this.school.root);
    $('now-playing').hidden = mode === 'school';
    if (mode === 'solo') this.setBotCount(BOT_COUNT);
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
    if (mouse) {
      window.setTimeout(() => {
        if (this.state === 'playing') this.hud.flashMessage(this.time, 'The ship turns towards the mouse pointer', 4);
      }, 2200);
    }
    // the flight school starts with its briefing; a tournament clone just reports in, and
    // once Nicole is through, the announcer opens the broadcast
    if (mode !== 'school') {
      this.speaker.say(mouse ? [COMPUTER.launch, COMPUTER.mouse] : COMPUTER.launch, 'urgent');
      window.setTimeout(() => {
        if (this.state === 'playing' && !this.school) this.announceArena();
      }, ARENA_TITLE_DELAY_MS);
      window.setTimeout(() => {
        if (this.state === 'playing' && !this.school) this.openBroadcast();
      }, ANNOUNCER_OPEN_DELAY_MS);
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
    this.returnLight(ship);
    this.scene.remove(ship.root);
    this.ships = this.ships.filter((s) => s !== ship);
    this.bots = this.bots.filter((b) => b.ship !== ship);
  }

  /**
   * Adds or removes own bots until this browser runs `count` of them. The first new ones adopt
   * the `heirs` (bots another browser ran, see Ship.adopt), which leave the scene in their favor.
   */
  setBotCount(count: number, heirs: readonly Ship[] = []) {
    while (this.bots.length > count) this.removeShip(this.bots[this.bots.length - 1].ship);
    for (const heir of heirs) this.removeShip(heir);
    const taken = new Set(this.ships.map((s) => s.name));
    const names = BOT_NAMES.filter((n) => !taken.has(n) && !heirs.some((heir) => heir.name === n));
    for (let i = this.bots.length, next = 0, free = 0; i < count; i++) {
      const id = this.online ? `b:${this.online.selfId}:${i}` : `bot${i}`;
      const heir = heirs[next++];
      const ship = heir
        ? this.addShip(id, heir.name, heir.type, false)
        : this.addShip(id, names[free++] ?? `Bot ${i + 1}`, i % 2 === 0 ? 'alien' : 'human', false);
      this.bots.push(new Bot(ship, 0.2 + (i % 3) * 0.2));
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

  remoteDestroyed(victim: Ship, killer: Ship | null, deaths: number, position: THREE.Vector3 | null, velocity: THREE.Vector3 | null) {
    victim.alive = false;
    victim.root.visible = false;
    // the owner counted this death already; its wreckage is seeded with that count and flies
    // from where the owner saw the ship break up, not from where it was predicted here
    victim.deaths = deaths;
    if (position) victim.flight.position.copy(position);
    if (velocity) victim.flight.velocity.copy(velocity);
    this.shipDestroyed(victim, killer);
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
      const points = ASTEROID_POINTS[destroyed.generation];
      own.ship.score += points;
      this.brokenHere.set(id, { at: own.at, ship: own.ship, points });
    }
    this.effects.explosion(destroyed.object.position, destroyed.meanRadius * 0.6, destroyed.velocity);
    this.hearDebris(destroyed.object.position, destroyed.meanRadius);
  }

  rejoin() {
    if (this.roundId >= 0) this.rejoinedFrom = this.roundId;
    this.roundId = -1;
    this.pendingRocks.length = 0;
  }

  syncRound(round: RoundState) {
    // the first round state a newcomer hears only tells it which round runs: its field is the
    // lead's snapshot already (see Online's onSync), not a fresh one. A browser that started
    // over in another round than its own leaves its own behind.
    if (this.roundId < 0) {
      if (this.rejoinedFrom !== null && this.rejoinedFrom !== round.id) this.clearRound();
      this.roundId = round.id;
      this.rejoinedFrom = null;
      this.arriveInRound();
    } else if (round.id > this.roundId) {
      this.roundId = round.id;
      this.startNextRound();
    }
    // the radio plays on this clock, so it follows the lead browser closely: jumps when far
    // off, otherwise smooths out the jitter of the network
    const endsAt = wallClock() + round.left;
    if (Math.abs(endsAt - this.roundEndsAtWall) > ROUND_SNAP || !Number.isFinite(this.roundEndsAtWall)) this.setRoundEnd(round.left);
    else this.setRoundEnd(this.roundEndsAtWall + (endsAt - this.roundEndsAtWall) * 0.05 - wallClock());
    // the asteroids follow the lead browser's field time the same way
    const drift = round.field - this.field.clock;
    this.field.setClock(Math.abs(drift) > FIELD_SNAP ? round.field : this.field.clock + drift * 0.1);
  }

  leadRound(): RoundState {
    // the first lead browser of a room starts the clock; a new one continues the synced clock,
    // and one that started over without hearing another lead continues its own round
    if (this.roundId < 0) {
      this.roundId = this.rejoinedFrom ?? 0;
      this.arriveInRound();
    }
    this.rejoinedFrom = null;
    if (!Number.isFinite(this.roundEndsAtWall)) this.setRoundEnd(ROUND_SECONDS);
    // the lead browser starts the next round once the scoreboard has been shown
    if (wallClock() >= this.roundEndsAtWall + RESULTS_SECONDS) {
      this.roundId++;
      this.startNextRound();
      this.setRoundEnd(ROUND_SECONDS);
    }
    const left = this.roundEndsAtWall - wallClock();
    this.roundEndsAt = this.time + left;
    return { id: this.roundId, left: +left.toFixed(3), field: +this.field.clock.toFixed(3) };
  }

  /**
   * Sets the end of the round on both clocks. Online rounds run on real time, so a slow
   * frame rate or a hidden tab does not hold them back; game time follows.
   */
  private setRoundEnd(left: number) {
    this.roundEndsAt = this.time + left;
    this.roundEndsAtWall = wallClock() + left;
  }

  /**
   * Online: scores of the own ships start from zero, the scoreboard closes, the field and its
   * wreckage come back fresh, as in a solo round.
   */
  private startNextRound() {
    this.clearRound();
    this.roundMode = this.onlineRoundMode();
    this.enterArena(this.roundArena());
    this.reprintOwn();
    this.announceArena();
    this.openBroadcast();
    // hits that arrived before this browser started the round
    const pending = this.pendingRocks.splice(0);
    for (const rock of pending) if (rock.round >= this.roundId) this.remoteRock(rock.id, rock.at, rock.round);
  }

  /**
   * Online, the round's arena is known: a browser whose field is another one moves there,
   * and its ships with it, freshly printed, since where they flew may be rock in the new one.
   */
  private arriveInRound() {
    const arena = this.roundArena();
    const mode = this.onlineRoundMode();
    if (this.field.layout?.key === arena.layout.key) {
      // the field is right (a snapshot built it); only the round's mode, and with it the course, may change
      if (mode === this.roundMode) return;
      this.roundMode = mode;
      this.enterArena(arena, this.field.snapshot());
      return;
    }
    this.roundMode = mode;
    this.enterArena(arena);
    this.reprintOwn();
    this.announceArena();
  }

  /** Every ship this browser runs starts the arena with a fresh clone on its edge; a sponsor break in progress ends. */
  private reprintOwn() {
    for (const ship of this.ships) {
      if (ship.owner !== null || ship === this.drone || (this.spectating && ship === this.me)) continue;
      if (ship === this.me && this.sponsors.visible) {
        this.sponsors.hide();
        if (this.state === 'playing') {
          this.hud.show(true);
          this.input.steerWithMouse(true);
        }
      }
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
      // a racer starts on the grid before the first gate, and a new clone where the last one
      // passed its last gate, facing the next
      course.startOf(ship.gates, Math.max(0, this.ships.indexOf(ship)) % 8, position);
      candidate.copy(course.points[ship.gates % GATES]);
      best = 0;
    }
    // of a dozen random places on the edge of the field, clear of rock, the one farthest from
    // the nearest enemy, preferably hidden from every enemy behind the asteroids
    for (let attempt = 0; attempt < SPAWN_CANDIDATES && !course; attempt++) {
      candidate.randomDirection().multiplyScalar(FIELD_RADIUS * (0.9 + Math.random() * 0.2));
      if (this.field.overlap(candidate, ship.radius * 10) || this.field.insideWell(candidate, ship.radius * 40)) continue;
      let nearest = Infinity;
      let seen = false;
      for (const other of this.ships) {
        if (other === ship || !other.alive) continue;
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
    if (best === -Infinity) position.copy(candidate);
    const look = new THREE.Matrix4().lookAt(position, course ? candidate : scratch.set(0, 0, 0), new THREE.Vector3(0, 1, 0));
    ship.spawn(position, new THREE.Quaternion().setFromRotationMatrix(look), this.time);
    if (ship === this.me) {
      // the Host's mind locks onto the freshly printed clone: from here on we are the clone
      this.hud.flashMessage(this.time, 'Establishing live link to your clone…', 2);
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
    const kills = `${me.kills} ${me.kills === 1 ? 'kill' : 'kills'}`;
    const clones = `${me.deaths} ${me.deaths === 1 ? 'clone' : 'clones'} lost`;
    this.sponsors.show(this.deathCause, `This round: ${kills} · ${me.score} pts · ${clones}`, () => {
      this.speaker.say(pick(SPONSOR_HAPPY), 'urgent');
      this.hud.show(true);
      this.respawn(this.me!);
      this.input.steerWithMouse(true);
      this.input.holdFire();
    });
  }

  private pause() {
    this.setScreen('paused');
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
    $('again').innerHTML = 'Back to hangar <kbd>Enter</kbd>';
    this.speaker.say(COMPUTER.roundOver, 'urgent');
    this.setScreen('results');
  }

  private renderScoreboard() {
    const me = this.me;
    const race = this.roundMode === 'race';
    const table = $<HTMLTableElement>('scoreboard');
    table.innerHTML = `<tr><th>#</th><th>Host</th>${race ? '<th>Race</th>' : ''}<th>Kills</th><th>Deaths</th><th>Score</th></tr>`;
    // a race ranks by the finish, a deathmatch by the score (see standings)
    this.standings().forEach((ship, i) => {
      const row = table.insertRow();
      row.classList.toggle('me', ship === me);
      row.insertCell().textContent = String(i + 1);
      row.insertCell().append(...markedName(ship.kind, ship.name));
      if (race) row.insertCell().textContent = ship.finish >= 0 ? `${ship.finish.toFixed(1)} s` : `Lap ${Math.min(LAPS, Math.floor(ship.gates / GATES) + 1)}`;
      for (const value of [ship.kills, ship.deaths, ship.score]) row.insertCell().textContent = String(value);
    });
    // training points from the flight school are no personal best
    if (me && !this.school && me.score > Number(storageGet(BEST_SCORE_KEY) ?? 0)) storageSet(BEST_SCORE_KEY, String(me.score));
  }

  /**
   * Online rounds end for everyone at once: the scoreboard shows over the running game
   * until the lead browser starts the next round. It is announced once per round, and the
   * pause menu covers it while it is open.
   */
  private showOnlineResults() {
    if (this.resultsShownFor !== this.roundId) {
      this.resultsShownFor = this.roundId;
      this.renderScoreboard();
      $('again').textContent = 'Leave tournament';
      this.speaker.say(COMPUTER.roundOver, 'urgent');
    }
    $('results').hidden = this.state !== 'playing';
    const next = `Next round in ${Math.ceil(Math.max(0, this.roundEndsAt + RESULTS_SECONDS - this.time))} s`;
    if ($('results-next').textContent !== next) $('results-next').textContent = next;
  }

  private resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.hud.setViewport(width, height);
    this.redraw = true;
    this.glitch.setSize(width * this.renderer.getPixelRatio(), height * this.renderer.getPixelRatio());
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.effects.setViewport(height * this.renderer.getPixelRatio(), this.camera.fov);
  }

  private frame() {
    this.timer.update();
    this.input.poll();
    const dt = Math.min(this.timer.getDelta(), 0.05) * this.timeScale;
    // an online tournament does not stop for one pilot's pause menu
    const running = this.state === 'playing' || (this.state === 'paused' && !!this.online);
    if (this.state !== 'paused' || running) this.time += dt;

    if (running) this.updateRound(dt);
    if (this.state !== 'paused' || running) {
      this.field.update(dt);
      this.effects.update(dt);
    }
    if (this.state === 'menu' || this.state === 'results') this.updateMenuCamera();

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

    // a paused solo round stands still: its picture is drawn again only while it glitches or
    // after the window changed, not 60 times a second under the pause plate
    const glitching = this.glitch.pass.enabled;
    // the frame after a glitch shows the clean picture again
    if (this.glitched && !glitching) this.redraw = true;
    this.glitched = glitching;
    const still = this.state === 'paused' && !this.online && !glitching;
    if (still && !this.redraw) return;
    this.redraw = false;
    // the kill cam borrows the ships' pictures and the camera for this one picture
    const replaying = this.state === 'playing' && this.killcam.pose(this.camera);
    if (replaying !== this.replaying) {
      this.replaying = replaying;
      this.effects.group.visible = !replaying;
      this.replayEffects.group.visible = replaying;
      this.hud.show(!replaying && this.state === 'playing' && !this.sponsors.visible);
    }
    this.space.follow(this.camera, this.state === 'menu' ? null : this.riding);
    this.arena.update(this.camera);
    this.landmarks.update(this.field.clock);
    const well = this.field.well;
    // the scene is drawn into the composer's read buffer, which the lens reads right after
    this.lensing.update(this.camera, this.venue.id === 'hole' && well ? well.position : null, well?.radius ?? 0, this.composer.readBuffer.depthTexture);
    this.composer.render();
    if (replaying) this.killcam.restore();
  }

  private updateRound(dt: number) {
    const me = this.me!;
    const now = this.time;

    // solo rounds run on real time too, like the radio, so a slow frame rate does not stretch
    // them and the finale of the music meets the end of the round
    if (!this.online && Number.isFinite(this.roundEndsAtWall)) this.roundEndsAt = now + (this.roundEndsAtWall - wallClock());

    this.ease = Math.max(0, this.ease - dt / EASE_FADE);
    this.weather(dt, now);
    this.direct(now);
    const myControls = this.flightComputer(this.state === 'playing' ? this.input.read() : IDLE);
    this.ignite(myControls);
    const dodge = this.input.takeDodge();
    if (dodge && this.state === 'playing' && !this.spectating) this.dodge(dodge);
    // removing a ship replaces the list, so the loop safely runs over the list it started with
    for (const ship of this.ships) {
      if (ship.owner !== null) {
        ship.updateRemote(dt, now);
        // the synced throttle is all the drive's trail needs
        if (ship.alive) this.exhaust(ship, dt);
        continue;
      }
      if (!ship.alive) {
        if (now < ship.respawnAt || ship === this.drone || ship === this.sparring?.bot.ship) continue;
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
        bot.waypoint = this.course && ship.finish < 0 ? this.course.points[ship.gates % GATES] : null;
        bot.lure = this.probes.nearest(ship.flight.position, PROBE_LURE)?.position ?? null;
        bot.flee = this.novaNear(ship, NOVA_RADIUS * NOVA_FLEE)?.flight.position ?? null;
      }
      const thought = bot ? bot.think(now, this.ships, this.field, this.bots) : null;
      // the flight school's unarmed sparring bot only flies
      if (thought && bot === this.sparring?.bot && !this.sparring.armed) thought.fire = false;
      // a bot with a nova core saves it for a crowd
      if (thought?.fire && ship.nova && this.crowdAround(ship, NOVA_RADIUS * 0.8) < NOVA_CROWD) thought.fire = false;
      // a bot with its target locked sends a torpedo now and then (never the flight school's)
      if (bot && bot !== this.sparring?.bot && bot.target && ship.torpedoes > 0 && Math.random() < dt * BOT_TORPEDO_RATE && this.torpedoTarget(ship) === bot.target) this.fireTorpedo(ship);
      const controls = ship === me ? myControls : (thought ?? IDLE);
      this.field.gravity(ship.flight.position, gravity);
      ship.inShadow = this.field.raycast(ship.flight.position, SUN_DIRECTION, LASER_RANGE) !== null;
      ship.sunCooling = this.venue.cooling;
      if (ship.update(dt, now, controls, gravity)) this.fireLaser(ship);
      if (this.course) this.passGates(ship, this.course);
      this.keepInArena(ship, now);
      this.collide(ship, now);
      this.hitWreckage(ship, now);
      this.exhaust(ship, dt);
    }
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
    const subject = (this.spectating ? this.watched() : null) ?? me;
    // its gauges too: the own clone is not printed while the Host watches
    this.hud.update(now, Math.max(0, this.roundEndsAt - now), subject);
    // a solar storm blinds the sensors: no ship shows a marker
    this.hud.updateMarkers(this.camera, this.ships, subject, this.storming ? blind : this.inSight);
    this.radar.update(wallClock(), subject, this.ships, this.field, this.sensed, this.radarMarks(subject), this.storming);
    this.hud.updateVelocityMarkers(this.camera, subject);
    this.hud.setCenter(this.camera, subject);
    this.hud.setAutopilot(this.autopilot);
    this.hud.setOverdrive(Math.max(0, this.overdriveReadyAt - now));
    this.hud.setArsenal(me.torpedoes, me.twin, me.plating, me.nova);
    const waypoint = this.school ? this.teach(dt, myControls) : this.course ? this.showRace(this.course) : null;
    if (me.alive && this.state === 'playing') this.aimCrosshair(waypoint);
    this.hud.showCrosshair(me.alive);
    this.hud.setOnTarget(me.alive ? this.onTarget : null);

    const outside = me.alive && me.outsideSince !== null;
    if (!outside) this.toldToReturn = false;
    if (this.spectating) {
      const by = now < this.handPickedUntil ? 'your pick' : 'live, the director cuts';
      this.hud.flashMessage(now, `Tournament full · watching ${subject === me ? 'the field' : `${subject.name} (${by})`} · Tab: next pilot · you fly as soon as a place is free`, 0.2);
    } else if (outside) {
      this.hud.flashMessage(now, `Return to the field — ${Math.max(0, ARENA_GRACE - (now - me.outsideSince!)).toFixed(1)}s`, 0.2);
      if (!this.toldToReturn) this.toldToReturn = this.speaker.say(COMPUTER.arena, 'urgent');
    } else if (this.flipping) {
      this.hud.flashMessage(now, this.flipAligned ? 'Flipped · drive brakes' : 'Flip', 0.2);
    } else if (this.input.braking && me.alive) {
      this.hud.flashMessage(now, this.braked ? 'At rest' : 'Braking', 0.2);
    }

    if (this.online) {
      this.online.update(now);
      this.updateLobby();
      // the room code is in the invite link; the HUD names the tournament and how many Hosts fly
      const room = `${this.room?.name ?? 'Online'} · ${this.online.pilots} ${this.online.pilots === 1 ? 'Host' : 'Hosts'}`;
      if ($('hud-room').textContent !== room) $('hud-room').textContent = room;
      if (now >= this.roundEndsAt) this.showOnlineResults();
    } else if (now >= this.roundEndsAt) {
      this.endRound();
    }
  }

  /** The radar's marks: the field's center, and in a race the next gate of the ship it shows. */
  private radarMarks(subject: Ship): RadarMark[] {
    const list = this.shownMarks;
    list.length = 0;
    list.push(this.marks[0]);
    const course = this.course;
    if (course && subject.finish < 0) {
      const gate = this.marks[1];
      const next = subject.gates % GATES;
      gate.position.copy(course.points[next]);
      gate.label = `Gate ${next + 1}`;
      list.push(gate);
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
      mark.label = ITEM_NAMES[probe.kind];
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
    if (!ship.alive || ship.finish >= 0 || !course.crossed(ship.gates % GATES, ship.previous, ship.flight.position)) return;
    ship.gates++;
    ship.score += GATE_POINTS;
    const lap = Math.floor(ship.gates / GATES);
    if (ship.gates >= GATES * LAPS) {
      ship.finish = +this.raceTime().toFixed(2);
      const place = this.standings().indexOf(ship);
      ship.score += PLACE_POINTS[place] ?? 0;
      if (ship === this.me) {
        this.hud.flashMessage(this.time, `Finished · ${ordinal(place + 1)} · +${PLACE_POINTS[place] ?? 0}`, 4);
        this.sound.beep(1320, 0.1, 0.18);
        this.sound.beep(1760, 0.2, 0.18, 0.12);
      }
      return;
    }
    if (ship !== this.me) return;
    this.sound.beep(1180, 0.06, 0.12);
    if (ship.gates % GATES === 0) this.hud.flashMessage(this.time, lap === LAPS - 1 ? 'Last lap' : `Lap ${lap + 1} of ${LAPS}`, 2);
  }

  /** Seconds since the round started. */
  private raceTime() {
    return Math.max(0, ROUND_SECONDS - (this.roundEndsAt - this.time));
  }

  /**
   * The race as it stands: who finished, by the time it took, then who is racing, by the
   * gates passed. In a deathmatch every ship has passed none, so the score decides.
   */
  private standings(): Ship[] {
    const finished = (ship: Ship) => (ship.finish >= 0 ? ship.finish : Infinity);
    return this.ships
      .filter((ship) => ship !== this.drone && !(this.spectating && ship === this.me))
      .sort((a, b) => finished(a) - finished(b) || b.gates - a.gates || b.score - a.score);
  }

  /** The own racer's next gate in the HUD, with lap, gate and place; returns the gate for the crosshair. */
  private showRace(course: Course): THREE.Vector3 | null {
    const me = this.me!;
    const place = ordinal(this.standings().indexOf(me) + 1);
    if (me.finish >= 0) {
      course.highlight(-1);
      this.hud.setWaypoint(this.camera, null);
      this.hud.setSchool({ step: `Finished · ${place}`, text: `${me.finish.toFixed(1)} s. Now hunt the others.`, keys: [] });
      return null;
    }
    const next = me.gates % GATES;
    const lap = Math.min(LAPS, Math.floor(me.gates / GATES) + 1);
    course.highlight(next);
    // past the gate's plane but not through it: the gate only counts from its front
    const missed = scratch.subVectors(me.flight.position, course.points[next]).dot(course.normals[next]) > GATE_RADIUS;
    const label = missed ? 'Missed · turn back' : next === 0 && me.gates > 0 ? (lap === LAPS ? 'Last lap' : 'Lap') : `Gate ${next + 1}/${GATES}`;
    this.hud.setWaypoint(this.camera, course.points[next], label);
    this.hud.setSchool({ step: `Race · lap ${lap}/${LAPS} · ${place}`, text: missed ? `Missed gate ${next + 1}: turn back and fly through it` : `Gate ${next + 1} of ${GATES}`, keys: [] });
    return course.points[next];
  }

  /**
   * Solar storms (see STORM_PERIOD): the sensors go blind, the link to the clone crackles.
   * The storm follows the shared field time, so it hits every Host at once.
   */
  private weather(dt: number, now: number) {
    const storm = this.venue.storms && this.field.clock % STORM_PERIOD > STORM_PERIOD - STORM_SECONDS;
    if (storm && !this.storming) {
      this.hud.flashMessage(now, 'SOLAR STORM · SENSORS BLIND', STORM_SECONDS);
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
    context.autopilot = this.autopilot;
    context.cockpit = this.cockpit;
    context.impactAhead = this.impactAhead;
    context.device = this.input.touchActive ? 'touch' : this.input.gamepadActive ? 'gamepad' : 'keyboard';
    context.now = this.time;
    context.dt = dt;
    const step = school.stepIndex;
    const waypoint = school.update(context);
    if (school.stepIndex !== step) {
      this.sound.beep(880, 0.1, 0.15);
      storageSet(SCHOOL_STEP_KEY, String(school.stepIndex));
    }
    if (school.finished) {
      storageSet(SCHOOL_DONE_KEY, '1');
      storageRemove(SCHOOL_STEP_KEY);
      this.showMenu();
      return null;
    }
    this.hud.setSchool(school.status(context.device), context.device === 'keyboard');
    this.hud.setWaypoint(this.camera, waypoint, school.mark);
    return waypoint;
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
    this.drone ??= this.addShip('drone', 'Target drone', me.type === 'human' ? 'alien' : 'human', false);
    const look = new THREE.Matrix4().lookAt(me.flight.position, position, me.flight.up(new THREE.Vector3()));
    this.drone.spawn(position, new THREE.Quaternion().setFromRotationMatrix(look), this.time);
    this.drone.flight.velocity.copy(velocity);
    this.drone.protectedUntil = this.time;
  }

  /** The flight school's sparring bot, facing the pilot; an unarmed one only flies. */
  private spawnSparring(position: THREE.Vector3, armed: boolean, skill: number) {
    const me = this.me!;
    if (this.sparring) this.removeShip(this.sparring.bot.ship);
    const ship = this.addShip('sparring', 'Sparring bot', me.type === 'human' ? 'alien' : 'human', false);
    const bot = new Bot(ship, skill);
    bot.armed = armed;
    this.bots.push(bot);
    this.sparring = { bot, armed };
    const look = new THREE.Matrix4().lookAt(position, me.flight.position, me.flight.up(new THREE.Vector3()));
    ship.spawn(position, new THREE.Quaternion().setFromRotationMatrix(look), this.time);
    ship.protectedUntil = this.time;
  }

  /**
   * The own ship's flight computer. While the brake is held, it flips the ship head over
   * and burns against the flight direction until the ship is at rest. While the flip is held,
   * it only turns the nose against the flight and keeps it there; the pilot's drive pushes
   * once the nose points the right way. Otherwise it keeps the ship upright and, with the
   * autopilot, takes out the drift.
   */
  private flightComputer(controls: Readonly<Controls>): Controls {
    const me = this.me!;
    const flight = me.flight;
    const braking = this.state === 'playing' && this.input.braking && me.alive;
    if (braking) {
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
      return this.assistAim(this.keepUpright(this.autopilot && me.alive ? this.trimDrift(controls) : Object.assign(this.computed, controls)));
    }
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
    this.hud.flashMessage(this.time, 'Overdrive', 1.2);
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
      this.hud.flashMessage(this.time, target ? `Torpedo away · ${target.name}` : 'Torpedo away · no lock', 1.5);
    }
  }

  /** The ship a torpedo of `ship` would lock on: the one in sight closest to its nose (see LOCK_ANGLE). */
  private torpedoTarget(ship: Ship): Ship | null {
    let best: Ship | null = null;
    let angle = LOCK_ANGLE;
    for (const other of this.ships) {
      if (other === ship || !other.alive || other === this.drone) continue;
      const line = toAim.subVectors(other.flight.position, ship.flight.position);
      if (line.length() > LOCK_DISTANCE) continue;
      const off = ship.flight.angleTo(line);
      if (off < angle && this.field.lineOfSight(ship.flight.position, other.flight.position)) {
        best = other;
        angle = off;
      }
    }
    return best;
  }

  /** An own torpedo went off: on a ship (whose browser takes the damage), on a rock, or burnt out. */
  private detonate(torpedo: Torpedo, hit: Ship | null) {
    this.blowUp(torpedo);
    this.online?.sendTorpedoGone(torpedo.id, torpedo.position);
    if (!hit) return;
    if (hit.owner === null) this.applyTorpedoHit(hit, torpedo.shooter);
    else this.online?.sendTorpedoHit(hit, torpedo.shooter);
    if (torpedo.shooter.isLocal) {
      this.hud.hit();
      this.landed(hit.flight.position, 'TORPEDO');
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
    if (this.school) return;
    const seed = this.online ? textSeed(this.online.session.room) : this.soloSeed;
    if (this.roundId >= 0) this.probes.schedule(seed, this.roundId, this.raceTime(), this.field);
    this.probes.update(dt, now, this.field);
    for (const ship of this.ships) {
      if (ship.owner !== null || !ship.alive || ship === this.drone || (this.spectating && ship === this.me)) continue;
      const probe = this.probes.touching(ship.flight.position, ship.radius);
      if (probe) this.takeProbe(ship, probe);
    }
  }

  private takeProbe(ship: Ship, probe: Probe) {
    this.probes.take(probe);
    this.online?.sendProbe(probe.id, ship);
    this.useItem(ship, probe.kind);
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
        break;
    }
    if (ship.isLocal) {
      this.hud.flashMessage(this.time, `${ITEM_NAMES[kind]} · ${ITEM_HINTS[kind]}`, kind === 'nova' ? 4 : 2.5);
      if (kind === 'nova') this.speaker.say(COMPUTER.nova, 'urgent');
      this.sound.beep(988, 0.07, 0.15);
      this.sound.beep(1319, 0.07, 0.15, 0.07);
      this.sound.beep(1976, 0.12, 0.15, 0.14);
    }
  }

  remoteProbe(id: string) {
    this.probes.takeId(id);
  }

  probesTaken() {
    return this.probes.takenIds();
  }

  restoreProbes(taken: string[]) {
    for (const id of taken) this.probes.takeId(id);
  }

  /**
   * A nova core goes off: a shockwave runs out to NOVA_RADIUS, and every ship this browser
   * runs inside it is gone, whatever protects it (each browser destroys its own and says so,
   * as with every death), together with torpedoes and wreckage there. The holder stays.
   */
  novaBlast(holder: Ship, position: THREE.Vector3) {
    const now = this.time;
    this.effects.explosion(position, holder.radius * 12, holder.flight.velocity);
    this.shockwaves.push(this.shockwave(position));
    for (const ship of [...this.ships]) {
      if (ship === holder || ship.owner !== null || !ship.alive || ship.flight.position.distanceTo(position) > NOVA_RADIUS) continue;
      ship.protectedUntil = Math.min(ship.protectedUntil, now);
      if (ship.structural(Infinity, now) === 'destroyed') this.shipDestroyed(ship, holder);
    }
    for (const torpedo of [...this.torpedoes.list]) if (torpedo.position.distanceTo(position) < NOVA_RADIUS) this.blowUp(torpedo);
    for (const wreck of [...this.wrecks.list]) if (wreck.mesh.position.distanceTo(position) < NOVA_RADIUS) this.shatterWreck(wreck);
    // whoever sees it is blinded for a moment, and hears its debris from far
    const seen = this.camera.position.distanceTo(position);
    if (seen < NOVA_RADIUS * 3) {
      this.linkHit(Math.max(0.4, 1 - seen / (NOVA_RADIUS * 3)), 1);
      this.kick = 2;
      this.sound.play('explosion', { volume: 2, rate: 0.4 });
      document.body.classList.remove('nova-flash');
      void document.body.offsetWidth;
      document.body.classList.add('nova-flash');
    }
    this.hud.flashMessage(now, holder === this.me ? 'NOVA' : `NOVA · ${holder.name}`, 2.5);
  }

  /**
   * Panic in the own cockpit while another ship with a nova core is close: a two-tone siren,
   * the warning, the tint of an alarm on the screen, and Nicole urging the pilot away, once
   * each time a holder comes close.
   */
  private novaAlarm(me: Ship, warnings: string[], now: number) {
    const holder = me.alive ? this.novaNear(me, NOVA_RADIUS * NOVA_FLEE) : null;
    if (document.body.classList.contains('nova-alarm') !== !!holder) document.body.classList.toggle('nova-alarm', !!holder);
    if (!holder) {
      this.novaWarned = null;
      return;
    }
    warnings.push(`NOVA CORE ACTIVATED · ${meters(holder.flight.position.distanceTo(me.flight.position))} · GET OUT`);
    if (now >= this.nextNovaSiren) {
      const high = Math.floor(now * 4) % 2 === 0;
      this.sound.beep(high ? 1320 : 880, 0.2, 0.18);
      this.nextNovaSiren = now + 0.25;
    }
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
    mesh.scale.setScalar(1);
    this.scene.add(mesh);
    return { mesh, born: this.time };
  }

  private updateShockwaves() {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const { mesh, born } = this.shockwaves[i];
      const t = (this.time - born) / NOVA_EXPANSION;
      if (t >= 1) {
        this.scene.remove(mesh);
        mesh.material.dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      mesh.scale.setScalar(NOVA_RADIUS * Math.sqrt(t));
      mesh.material.opacity = 0.6 * (1 - t);
    }
  }

  /** A beam went through a torpedo: it goes off where it is, on every browser. */
  private shootDown(torpedo: Torpedo, shooter: Ship) {
    this.blowUp(torpedo);
    this.online?.sendTorpedoGone(torpedo.id, torpedo.position);
    if (shooter.owner !== null) return;
    shooter.score += TORPEDO_DOWN_POINTS;
    if (shooter.isLocal) this.hud.popup(this.camera, torpedo.position, `TORPEDO DOWN +${TORPEDO_DOWN_POINTS}`, 'points');
  }

  private blowUp(torpedo: Torpedo) {
    this.effects.explosion(torpedo.position, TORPEDO_RADIUS * 4, torpedo.velocity);
    this.hearDebris(torpedo.position, TORPEDO_RADIUS * 4);
    this.torpedoes.remove(torpedo);
  }

  applyTorpedoHit(ship: Ship, shooter: Ship | null) {
    const now = this.time;
    // plating (an item) takes a whole torpedo and is gone
    if (ship.plating > 0 && now >= ship.protectedUntil) {
      ship.plating = 0;
      this.effects.sparks(ship.flight.position, PLATING_COLOR, 160);
      if (ship.isLocal) this.hud.flashMessage(now, 'Plating took the torpedo', 1.5);
      return;
    }
    const status = ship.structural(TORPEDO_DAMAGE, now);
    if (status === 'protected') return;
    // the blast shakes the thrusters too
    ship.thrusters = Math.max(0, ship.thrusters - 0.3);
    if (ship.isLocal) {
      this.hud.damaged();
      this.hud.flashMessage(now, 'Torpedo hit', 1.5);
      this.sound.play('explosion', { volume: 1.5, rate: 0.9 });
      this.linkHit(0.9, 0.6);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, shooter);
  }

  remoteTorpedo(id: string, shooter: Ship, target: Ship | null, position: THREE.Vector3, velocity: THREE.Vector3) {
    this.torpedoes.launch(id, shooter, target, position, velocity, this.time, false);
  }

  remoteTorpedoGone(id: string, position: THREE.Vector3) {
    const torpedo = this.torpedoes.find(id);
    if (!torpedo) return;
    torpedo.position.copy(position);
    this.blowUp(torpedo);
  }

  /** A thruster key tapped twice, or LB: the dodge; see DODGE_SPEED. */
  private dodge(direction: { x: number; y: number }) {
    const me = this.me!;
    if (!me.alive || this.time < this.dodgeReadyAt) return;
    this.dodgeReadyAt = this.time + DODGE_RECHARGE;
    // a damaged thruster kicks weaker
    const push = relative.set(direction.x, direction.y, 0).normalize().multiplyScalar(DODGE_SPEED * (0.25 + 0.75 * me.thrusters));
    me.flight.velocity.add(push.applyQuaternion(me.flight.orientation));
    this.strain = Math.min(1, this.strain + DODGE_STRAIN);
    this.kick = Math.min(2, this.kick + 0.8);
    // the gas leaves on the side opposite to the kick
    const nozzle = me.toWorld(scratch.set(-direction.x, -direction.y, 0).multiplyScalar(me.radius * 0.7), scratch);
    for (let i = 0; i < 6; i++) this.effects.puff(nozzle, aimPoint.copy(push).multiplyScalar(-1.5).add(me.flight.velocity), me.radius * 0.25);
    this.sound.play('explosion', { volume: 0.5, rate: 2.6 });
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
    this.hud.popup(this.camera, scratch.copy(flight.position).addScaledVector(flight.forward(forward), me.radius * 4), `CLOSE CALL +${CLOSE_CALL_POINTS}`, 'points');
    this.sound.beep(1180, 0.05, 0.12);
    this.sound.beep(1570, 0.08, 0.12, 0.06);
  }

  /** T: the autopilot on or off. */
  private toggleAutopilot() {
    this.autopilot = !this.autopilot;
    this.sound.beep(this.autopilot ? 880 : 440, 0.08);
  }

  /**
   * The autopilot: the thrusters push against every drift across the nose, so the ship flies
   * where it points and the main drive (W) pushes it exactly that way. The pilot's own
   * thruster input on an axis goes first.
   */
  private trimDrift(controls: Readonly<Controls>): Controls {
    const out = Object.assign(this.computed, controls);
    // right after a dodge the drift is the point
    if (this.time < this.dodgeReadyAt - DODGE_RECHARGE + DODGE_DRIFT) return out;
    const drift = this.me!.flight.toLocalDirection(this.me!.flight.velocity, relative).divideScalar(RCS_THRUST * AUTOPILOT_EASE);
    if (!controls.strafeX) out.strafeX = THREE.MathUtils.clamp(-drift.x, -1, 1);
    if (!controls.strafeY) out.strafeY = THREE.MathUtils.clamp(-drift.y, -1, 1);
    return out;
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
      this.shootDown(torpedoHit.torpedo, shooter);
    }

    const end = new THREE.Vector3().copy(origin).addScaledVector(direction, beamLength);
    const start = shooter.muzzle(new THREE.Vector3());
    this.effects.beam(start, end, shooter.color);
    this.killcam.recordBeam(this.time, start, end, shooter.color);
    this.online?.sendFire(shooter, start, end);
    if (shooter.isLocal) this.sound.play('laser', { volume: 0.7 });

    for (const ship of [...this.ships]) {
      if (ship === shooter || !ship.alive) continue;
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
          this.landed(scratch, ship.tailToward(direction) ? 'DRIVE' : 'ARMOR', ship.tailToward(direction));
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
      this.online?.sendRock(asteroid.id, this.field.clock, this.roundId >= 0 ? this.roundId : (this.rejoinedFrom ?? 0));
      if (destroyed) {
        shooter.score += ASTEROID_POINTS[destroyed.generation];
        // online, another Host may have broken the same rock a moment earlier (see remoteRock)
        if (this.online) this.brokenHere.set(asteroid.id, { at: this.field.clock, ship: shooter, points: ASTEROID_POINTS[destroyed.generation] });
        this.effects.explosion(destroyed.object.position, destroyed.meanRadius * 0.6, destroyed.velocity);
        this.hearDebris(destroyed.object.position, destroyed.meanRadius);
        if (shooter.isLocal) {
          this.hud.hit();
          this.hud.popup(this.camera, destroyed.object.position, `+${ASTEROID_POINTS[destroyed.generation]}`, 'points');
          this.kick = Math.min(2, this.kick + 0.6);
          this.hud.flashMessage(this.time, `Asteroid cracked +${ASTEROID_POINTS[destroyed.generation]}`, 1.5);
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
  applyLaserHit(ship: Ship, origin: THREE.Vector3, direction: THREE.Vector3, shooter: Ship | null, distance?: number) {
    // plating (an item) takes a hit into the drive
    if (ship.plating > 0 && ship.tailToward(direction) && ship.alive && this.time >= ship.protectedUntil) {
      ship.plating--;
      const along = distance ?? scratch.subVectors(ship.flight.position, origin).dot(direction);
      this.effects.sparks(scratch.copy(origin).addScaledVector(direction, along), PLATING_COLOR, 80);
      if (ship.isLocal) this.hud.flashMessage(this.time, ship.plating ? 'Plating holds' : 'Plating gone', 1.2);
      return;
    }
    const { status, zone } = ship.laserHit(origin, direction, this.time);
    if (status === 'protected') return;
    const along = distance ?? scratch.subVectors(ship.flight.position, origin).dot(direction);
    this.effects.sparks(scratch.copy(origin).addScaledVector(direction, along), shooter?.color ?? SCRAPE_COLOR, 60);
    if (shooter?.isLocal) {
      this.hud.hit();
      // the drive rings out, the armor only clinks
      const hurt = zone === 'drive' || zone === 'reactor';
      this.sound.beep(zone === 'reactor' ? 1760 : hurt ? 1320 : 660, hurt ? 0.08 : 0.04);
      this.landed(scratch, HIT_WORDS[zone], hurt);
    }
    if (ship.isLocal) {
      // a hit into the drive hurts and is told at once; the armor's scorch marks are chatter
      const serious = zone === 'drive' || zone === 'reactor';
      this.hud.damaged();
      this.hud.flashMessage(this.time, ZONE_MESSAGES[zone], 1.5);
      this.speaker.say(COMPUTER[zone], serious ? 'urgent' : 'chatter');
      this.sound.play('explosion', { volume: serious ? 1.2 : 0.6, rate: 1.5 });
      this.sound.beep(220, 0.25, 0.12);
      this.linkHit(zone === 'reactor' ? 1 : serious ? 0.7 : 0.3, serious ? 0.5 : 0.2);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, shooter);
  }

  /** `cause` says what killed a ship without a killer, where this browser saw it happen. */
  private shipDestroyed(victim: Ship, killer: Ship | null, cause: DeathCause = null) {
    victim.respawnAt = this.time + RESPAWN_SECONDS;
    if (victim.engineLight) victim.engineLight.intensity = 0;
    if (victim === this.me && killer && killer !== victim) {
      this.ease = Math.min(1, this.ease + DEATH_EASE);
      // the moments before the kill, again, in slow motion, from behind the shooter
      if (!this.school && this.state === 'playing') {
        this.killcam.start(killer, victim, this.time);
        this.hud.flashMessage(this.time, `Kill cam · ${killer.name} · Enter skips`, 3);
      }
    }
    if (killer === this.me && victim !== this.me) this.ease = Math.max(0, this.ease - KILL_EASE);
    if (victim === this.me) {
      if (killer) this.deathCause = ['Shot down by ', ...markedName(killer.kind, killer.name)];
      else if (cause === 'well') this.deathCause = WELL_DEATHS[this.venue.id] ?? 'Crashed';
      else this.deathCause = victim.outsideSince !== null ? 'Lost in deep space' : 'Crashed';
    }
    // a kill of the Host's own is bigger: more fire, a jolt, and the points where it happened
    const ownKill = killer?.isLocal === true && killer === this.me;
    this.effects.explosion(victim.flight.position, victim.radius * (ownKill ? 3 : 2), victim.flight.velocity.clone().multiplyScalar(0.3));
    if (ownKill) {
      this.hud.popup(this.camera, victim.flight.position, `+${this.killPoints()}`, 'kill');
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
      // the clone dies: its link breaks down, its radio fades out
      this.glitch.trigger(1, 1.4);
      this.radio.setMuffled(true);
    } else {
      this.hearDebris(victim.flight.position, victim.radius);
    }
    // online, the owner of the victim announces the destruction; each peer scores its own ships
    if (victim.owner === null) this.online?.sendDestroyed(victim, killer);
    if (killer && killer.owner === null) {
      killer.kills++;
      killer.score += this.killPoints();
      if (killer.isLocal) {
        this.sound.beep(1320, 0.07, 0.15);
        this.sound.beep(1760, 0.12, 0.15, 0.09);
      }
    }
    // remote ships do not report how they crashed: "Crash" covers rocks and wreckage alike
    const killedBy = cause === 'well' ? this.venue.name : victim.outsideSince !== null ? 'Deep space' : 'Crash';
    this.hud.kill(this.time, killer ?? { kind: null, name: killedBy }, victim);
    if (victim !== this.drone) this.commentOnDeath(victim, killer, cause);
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
    if (!asteroid || !this.field.resolve(asteroid, flight.position, ship.radius, normal)) return;
    const velocity = flight.velocity;
    // the rock's surface moves with its drift and its spin; the tip of a long rock sweeps fast
    this.field.surfaceVelocity(asteroid, scratch.copy(flight.position).addScaledVector(normal, -ship.radius), surface);
    relative.subVectors(velocity, surface);
    const approach = -relative.dot(normal);
    if (approach <= 0) return;
    if (ship === this.me) this.lastScrape = now;
    velocity.addScaledVector(normal, approach * (1 + RESTITUTION));
    // friction: scraping along the rock bleeds off some sideways speed
    relative.subVectors(velocity, surface);
    velocity.addScaledVector(relative.addScaledVector(normal, -relative.dot(normal)), -0.2);
    ship.syncTransform();

    if (approach < SAFE_IMPACT * 0.4) return;
    this.effects.sparks(scratch.copy(ship.flight.position).addScaledVector(normal, -ship.radius), SCRAPE_COLOR, 40 + approach * 0.05);
    if (ship.isLocal) this.sound.play('explosion', { volume: Math.min(1.4, approach / 800), rate: 1.9 });
    if (approach < SAFE_IMPACT) return;
    const status = ship.structural((approach - SAFE_IMPACT) * IMPACT_DAMAGE, now);
    if (ship.isLocal && status !== 'protected') {
      this.hud.damaged();
      this.hud.flashMessage(now, `Impact at ${Math.round(approach * METERS_PER_UNIT)} m/s`, 1.5);
      this.speaker.say(COMPUTER.impact, 'urgent');
      this.linkHit(Math.min(1, 0.4 + (approach - SAFE_IMPACT) / 1000), 0.6);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, null, 'rock');
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
    const status = ship.structural(Math.max(0, impact - SAFE_IMPACT) * IMPACT_DAMAGE * 0.6, now);
    if (ship.isLocal && status !== 'protected') {
      this.sound.play('explosion', { volume: Math.min(1.4, 0.3 + impact / 1000), rate: 2.1 });
      this.hud.damaged();
      this.hud.flashMessage(now, 'Debris impact', 1.2);
      this.speaker.say(COMPUTER.debris);
      this.linkHit(0.5, 0.35);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, null, 'wreck');
  }

  /**
   * What the own pilot feels and the flight computer reports: g-force strain with tunnel
   * vision, impact warnings, an overheated laser.
   */
  private pilot(dt: number, now: number) {
    const me = this.me!;
    const flight = me.flight;
    const load = me.alive ? flight.properAcceleration / G : 0;
    if (load > G_TOLERANCE) this.strain += ((load - G_TOLERANCE) / (MAIN_THRUST / G - G_TOLERANCE)) * (dt / G_ONSET);
    else this.strain -= dt / G_RECOVERY;
    this.strain = THREE.MathUtils.clamp(this.strain, 0, 1);
    this.hud.setStrain(this.strain);
    if (this.strain > 0.4 && now >= this.nextHeartbeat) {
      // heartbeat: faster and louder the harder the pilot is pressed into the seat
      this.sound.beep(55, 0.12, 0.25 * this.strain);
      this.sound.beep(48, 0.14, 0.2 * this.strain, 0.16);
      this.nextHeartbeat = now + 1.1 - 0.5 * this.strain;
    }

    const warnings = this.warnings;
    warnings.length = 0;
    const speed = flight.velocity.length();
    if (me.alive && speed > 100) {
      const heading = scratch.copy(flight.velocity).divideScalar(speed);
      const hit = this.field.raycast(flight.position, heading, speed * 20);
      if (hit) {
        const timeToImpact = Math.max(0, hit.distance - me.radius) / speed;
        const thrust = MAIN_THRUST * Math.max(me.drive, 0.01);
        // the head-over flip rolls first, and damaged thrusters turn the ship more slowly
        const turning = flight.angleTo(retrograde.copy(heading).negate());
        const turnRate = 0.3 + 0.7 * (0.25 + 0.75 * me.thrusters);
        const flipTime = ((turning / Math.PI) * FLIP_SECONDS + (turning > 0.35 ? FLIP_ROLL_SECONDS : 0)) / turnRate;
        const brakeTime = flipTime + speed / thrust / 2;
        if (timeToImpact < brakeTime + IMPACT_MARGIN) {
          warnings.push(`IMPACT IN ${timeToImpact.toFixed(1)} s`);
          if (now >= this.nextWarningBeep) {
            this.sound.beep(980, 0.05, 0.12);
            this.nextWarningBeep = now + THREE.MathUtils.clamp(timeToImpact / 6, 0.1, 0.5);
          }
        }
      }
    }
    this.impactAhead = warnings.length > 0;
    this.lockWarning(now);
    if (me.alive && me.overheated) warnings.push('LASER OVERHEATED');
    this.novaAlarm(me, warnings, now);
    // a torpedo homing on the own ship: shoot it down or dodge
    for (const torpedo of this.torpedoes.list) {
      if (!me.alive || torpedo.target !== me || torpedo.position.distanceTo(flight.position) > TORPEDO_WARNING) continue;
      warnings.push('TORPEDO INBOUND');
      if (now >= this.nextWarningBeep) {
        this.sound.beep(1480, 0.05, 0.16);
        this.nextWarningBeep = now + 0.12;
      }
      break;
    }
    if (me.alive && me.driveOffline(now)) warnings.push('DRIVE OVERHEATED');
    this.hud.setWarning(warnings.join('\n'));
  }

  /**
   * Another ship's nose on the own ship: LOCKED when its laser would hit now, TRACKED when
   * the nose is close to it, ON YOUR TAIL when it sits behind, where it reaches the drive. The
   * ship's sensors see where every other hull points; the faster beeping is the cue to act.
   */
  private lockWarning(now: number) {
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
    this.hud.setLock(tail ? 'ON YOUR TAIL' : level === 2 ? 'LOCKED' : 'TRACKED', shooter);
    if (now >= this.nextLockBeep) {
      this.sound.beep(tail ? 1760 : level === 2 ? 1560 : 1170, 0.04, tail ? 0.14 : 0.1);
      this.nextLockBeep = now + (tail ? 0.08 : level === 2 ? 0.1 : 0.35);
    }
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
    // the belt beyond is scenery: a ship that reaches it before its time is up is lost there
    if (now - ship.outsideSince < ARENA_GRACE && ship.flight.position.length() < BELT_INNER) return;
    ship.structural(Infinity, now);
    if (!ship.alive) this.shipDestroyed(ship, null, 'space');
  }

  private updateCamera(dt: number) {
    // the chase camera follows the own ship, or the pilot a watching Host follows
    const me = (this.spectating ? this.watched() : null) ?? this.me!;
    const flight = me.flight;
    if (this.cockpit) {
      this.camera.position.copy(flight.position).addScaledVector(flight.forward(scratch), me.radius * 0.3);
      this.camera.quaternion.copy(flight.orientation);
    } else if (this.spectating && this.wideShot && me !== this.me) {
      // the director's wide shot: off to the side and behind, the pilot in the frame
      flight.toWorld(cameraGoal.set(me.radius * 6, me.radius * 2.5, me.radius * 5), cameraGoal);
      this.camera.position.lerp(cameraGoal, 1 - Math.exp(-CAMERA_FOLLOW * 0.4 * dt));
      look.lookAt(this.camera.position, flight.position, flight.up(scratch));
      this.camera.quaternion.slerp(aim.setFromRotationMatrix(look), 1 - Math.exp(-CAMERA_TURN * 0.5 * dt));
    } else {
      // a burn presses the ship ahead of the camera, which hangs back a little
      const lag = me.alive ? flight.throttle * DRIVE_LAG : 0;
      flight.toWorld(cameraGoal.set(0, me.radius * 0.75, me.radius * (2.6 + lag)), cameraGoal);
      this.camera.position.lerp(cameraGoal, 1 - Math.exp(-CAMERA_FOLLOW * dt));
      this.camera.quaternion.slerp(flight.orientation, 1 - Math.exp(-CAMERA_TURN * dt));
    }
    this.riding = me.alive ? flight.velocity : null;
    // the drive kicks: the view widens while it burns and with speed, and the chase camera trembles
    const burn = me.alive ? flight.throttle : 0;
    const fast = me.alive ? Math.min(1, flight.velocity.length() / MAX_SPEED) : 0;
    const fov = this.camera.fov + (CAMERA_FOV + DRIVE_FOV_KICK * burn + SPEED_FOV * fast - this.camera.fov) * (1 - Math.exp(-6 * dt));
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    if (!this.cockpit && !reducedMotion.matches) {
      if (burn > 0.05) this.camera.position.add(scratch.randomDirection().multiplyScalar(me.radius * DRIVE_SHAKE * burn));
      // a jolt for every hit the own laser lands, bigger for a kill; it fades in a fraction of a second
      if (this.kick > 0.01) this.camera.position.add(scratch.randomDirection().multiplyScalar(me.radius * KICK_SHAKE * this.kick));
    }
    this.kick *= Math.exp(-KICK_FADE * dt);
    // the HUD projects with this frame's camera, not the one of the last rendered frame
    this.camera.updateMatrixWorld();
  }

  private updateMenuCamera() {
    this.riding = null;
    if (this.camera.fov !== CAMERA_FOV) {
      this.camera.fov = CAMERA_FOV;
      this.camera.updateProjectionMatrix();
    }
    const t = this.time * 0.08;
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(Math.cos(t), Math.sin(t * 0.7) * 0.2, Math.sin(t));
  }
}
