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
import { Hud } from '../view/hud';
import { Radio, type MusicCue } from '../music/radio';
import type { Spoken } from '../music/band';
import { COMPUTER, ANNOUNCER_ALIEN, ANNOUNCER_KILL, ANNOUNCER_NAMES, ANNOUNCER_OPEN, ANNOUNCER_ROCK, SPONSOR_BREAK, SPONSOR_HAPPY } from '../music/lines';
import { Speaker } from '../sound/speaker';
import { hash, mixSeed, textSeed, titleFor, type Song } from '../music/songs';
import { IDLE, Input, keyLabel, learnKeyboardLayout, type Action, type Controls } from '../input/input';
import { Ship, type ShipState, type Zone } from '../ship/ship';
import { MAIN_THRUST, RCS_THRUST } from '../ship/flight';
import { newRoomCode, roomCode, Session, type RoundState } from '../net/session';
import { Online, TOURNAMENT_SIZE, type OnlineGame } from '../net/online';
import { Space, SUN_DIRECTION } from '../world/space';
import { Arena, ARENA_LIMIT } from '../world/arena';
import { FlightSchool, type SchoolContext } from './school';
import { SponsorBreak } from './sponsors';
import { Wrecks } from '../world/wrecks';

const ROUND_SECONDS = 5 * 60;
/** Online tournaments show the scoreboard this long before the next round starts. */
const RESULTS_SECONDS = 12;
const FIELD_SEED = 11;
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
const BOT_COUNT = 3;
const LASER_RANGE = 200000;
const KILL_POINTS = 500;
/** Bots respawn after this delay; the own pilot sees the sponsor break after it. */
const RESPAWN_SECONDS = 3;
/** Impacts slower than this (units/s) only scratch the paint. */
const SAFE_IMPACT = 250;
/** Hull damage per unit/s of impact speed above SAFE_IMPACT. */
const IMPACT_DAMAGE = 1 / 12;
/** Share of the impact speed a ship keeps when it bounces off a rock. */
const RESTITUTION = 0.3;
/** Seconds a ship may stay beyond ARENA_LIMIT before it is lost: enough to flip, burn off an outward drift of 100 m/s or more and fly back in. */
const ARENA_GRACE = 20;
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
/** Below this speed the brake stops the ship with the thrusters alone and no longer turns it (units/s, 15 m/s: the thrusters take it out in under half a second). */
const BRAKE_FINE = 300;
/** Confirm presses are ignored this long after a screen changes (ms). */
const CONFIRM_LOCK_MS = 600;
/** Drive lights in the scene: enough for a full tournament plus the flight school's drone and sparring bot. */
const ENGINE_LIGHTS = 6;
/** The announcer opens a round this long after the launch (ms), once the flight computer is through. */
const ANNOUNCER_OPEN_DELAY_MS = 7000;
/** One standard gravity in units/s² (1 unit = 5 cm). */
const G = 9.81 / 0.05;
/** Above this load the pilot starts to grey out; at the limit it takes G_ONSET seconds to tunnel vision. */
const G_TOLERANCE = 3;
const G_ONSET = 5;
const G_RECOVERY = 3;
/** The impact warning starts this many seconds before the last chance to flip and brake. */
const IMPACT_MARGIN = 2;
/** Assumed duration of a flip for the impact warning (s): half a turn at 2.2 rad/s, plus spin-up and settling. */
const FLIP_SECONDS = 1.8;
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
/** Hosts who ask for less motion get no camera shake. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
/** What a landed hit says where it struck, by the zone it broke. */
const HIT_WORDS: Record<Zone, string> = { reactor: 'REACTOR', drive: 'DRIVE', thrusters: 'THRUSTERS', hull: 'HIT' };
const ZONE_MESSAGES: Record<Zone, string> = {
  reactor: 'Reactor breach',
  drive: 'Main drive damaged',
  thrusters: 'Thrusters damaged',
  hull: 'Hull breach',
};
const BEST_SCORE_KEY = 'solartournament.best';
const CALLSIGN_KEY = 'solartournament.callsign';
/** Set once the flight school is complete; the menu then leads with the solo round. */
const SCHOOL_DONE_KEY = 'solartournament.school';
/** The drill a Host has reached in the flight school, so a reload continues there; cleared when the school is complete or started over. */
const SCHOOL_STEP_KEY = 'solartournament.school-step';

type State = 'menu' | 'playing' | 'paused' | 'results';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** The label of a menu mode button: the text of its first line, without the Enter key. */
const modeName = (id: string) => $(id).querySelector<HTMLElement>('.mode-label')!;

/** One of several lines, at random; only the local voice says it. */
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
const scratch = new THREE.Vector3();
const forward = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();
const gravity = new THREE.Vector3();
const retrograde = new THREE.Vector3();
const normal = new THREE.Vector3();
const relative = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const toAim = new THREE.Vector3();
const assistSteer = { yaw: 0, pitch: 0 };
const inverseOrientation = new THREE.Quaternion();
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
  readonly field: AsteroidField;
  private readonly effects: Effects;
  private readonly wrecks = new Wrecks();
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
  /** Number of the running online round; a new number resets the scores. */
  private roundId = 0;
  private ships: Ship[] = [];
  private bots: Bot[] = [];
  private me: Ship | null = null;
  private cockpit = false;
  private shotCounter = 0;
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
  private onTarget = false;
  /** Strength of the camera jolt after the own laser hit something, 0..2. */
  private kick = 0;
  /** The brake has brought the ship to rest (it beeps once). */
  private braked = false;
  /** The flight computer's output, reused from frame to frame. */
  private readonly computed: Controls = { ...IDLE };
  /** Warnings below the crosshair, rebuilt every frame in the same array. */
  private readonly warnings: string[] = [];
  /** Whether the camera sees a ship past the asteroids, for the HUD markers. */
  private readonly inSight = (ship: Ship) => this.field.lineOfSight(this.camera.position, ship.flight.position);
  /** How the own clone died last, for the sponsor break. */
  private deathCause = 'Your clone is dead';
  /** When the current screen (menu, playing, paused, results) came up (performance.now, ms). */
  private screenSince = 0;
  /** Online round whose scoreboard has been shown and announced. */
  private resultsShownFor = -1;
  /** Rocks this browser's ships broke online: when, by whom, for how many points. */
  private readonly brokenHere = new Map<string, { at: number; ship: Ship; points: number }>();
  /** The running flight school, or null in a tournament round. */
  private school: FlightSchool | null = null;
  private schoolContext: SchoolContext | null = null;
  /** Target drone of the flight school. */
  private drone: Ship | null = null;
  /** G-force strain of the own pilot, 0..1. */
  private strain = 0;
  private nextHeartbeat = 0;
  private nextWarningBeep = 0;
  private nextLockBeep = 0;
  /** Speed of game time; 0 freezes the simulation while rendering continues. */
  timeScale = 1;
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
  /** Clock of the lounge songs in menu and flight school (s). */
  private readonly loungeEpoch = wallClock();
  private nextIdleGlitch = 0;
  private radioTitleTimer = 0;
  private transmissionTimer = 0;
  /** Real time before which the announcer stays quiet (s). */
  private nextAnnouncement = 0;
  /** The name the announcer's current line is about, for the subtitle. */
  private announcedName: string | null = null;

  constructor(
    container: HTMLElement,
    private readonly assets: Assets,
    private readonly sound: Sound,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.append(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.88));
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.glitch.pass);
    this.glitch.onStatic = (strength) => this.sound.crackle(strength);
    this.radio = new Radio(sound.context, sound.headset, (song) => this.announceSong(song), (spoken, delay) => this.subtitle(spoken, delay));
    this.speaker = new Speaker(sound.context, sound.headset);
    this.speaker.prepare();

    this.scene.background = new THREE.Color(0x01020a);
    this.field = new AsteroidField(assets.asteroids);
    this.effects = new Effects(assets.textures);
    this.scene.add(this.space.sky, this.space.dust, this.arena.mesh, this.space.lights, this.field.group, this.wrecks.group, this.effects.group);
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
    for (const button of document.querySelectorAll<HTMLButtonElement>('.ship-select button')) {
      button.addEventListener('click', () => {
        this.selectedShip = button.dataset.ship as ShipType;
        document.querySelectorAll('.ship-select button').forEach((b) => b.classList.toggle('selected', b === button));
      });
    }
    $('start').addEventListener('click', () => this.startRound('solo'));
    $('school').addEventListener('click', () => this.startRound('school'));
    $('school-reset').addEventListener('click', () => {
      storageRemove(SCHOOL_STEP_KEY);
      this.showSchoolProgress();
    });
    $('online').addEventListener('click', () => void this.goOnline());
    $('resume').addEventListener('click', () => this.resume());
    $('quit').addEventListener('click', () => this.endRound());
    $('again').addEventListener('click', () => this.showMenu());
    $('invite').addEventListener('click', () => void this.copyInvite());
    $('radio').addEventListener('click', () => this.toggleRadio());
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
   * Room code from an invitation link (#t=code). The code travels in the fragment, so it never
   * reaches the web server's logs or another site's Referer header.
   */
  private invitedRoom(): string | null {
    return roomCode(new URLSearchParams(location.hash.slice(1)).get('t'));
  }

  /** Joins the invited tournament or opens a new one, then starts playing in it. */
  private async goOnline() {
    if (this.connecting) return;
    this.connecting = true;
    // still inside the click: later, after connecting, the browser would refuse
    if (this.input.touchActive) this.enterFullscreen();
    const attempt = ++this.joinAttempt;
    const button = $<HTMLButtonElement>('online');
    button.disabled = true;
    modeName('online').textContent = 'Connecting…';
    this.notice('');
    try {
      const room = this.invitedRoom() ?? newRoomCode();
      history.replaceState(null, '', `${location.pathname}${location.search}#t=${room}`);
      // ?local=1 connects tabs of this browser instead of going over the internet
      const session = await Session.join(room, new URLSearchParams(location.search).has('local'));
      // the Host started something else while the connection was being set up
      if (attempt !== this.joinAttempt) {
        session.leave();
        return;
      }
      this.online = new Online(session, this);
      this.startRound('online');
    } catch (error) {
      console.error(error);
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

  /** All places of the tournament are taken by Hosts who came first: back to the hangar. */
  tournamentFull() {
    this.showMenu();
    this.notice(`This tournament is full: ${TOURNAMENT_SIZE} Hosts are already flying.`);
  }

  private async copyInvite() {
    const button = $('invite');
    try {
      await navigator.clipboard.writeText(location.href);
      button.textContent = 'Link copied';
    } catch {
      button.textContent = location.href;
    }
  }

  /** Leaves the tournament, and forgets its code, so the menu leads with the own choice again. */
  private leaveOnline() {
    // a connection still being set up is dropped when it arrives
    this.joinAttempt++;
    if (!this.online) return;
    this.online.leave();
    this.online = null;
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
    const speaker = spoken.language === 'mod' ? 'Announcer' : spoken.line.startsWith('radio') ? 'Radio 2584' : spoken.language === 'de' ? 'Der Präsident' : 'The Orange President';
    const announcement = spoken.line.startsWith('radio') && this.radio.song;
    const text = announcement ? `${spoken.language === 'de' ? 'Es läuft' : 'Now playing'}: ${this.radio.song!.title}` : spoken.line
      .replace('{name}', this.announcedName ?? 'pilot')
      .split(/(?<=[.?!])\s+/)
      .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1))
      .join(' ');
    window.setTimeout(() => {
      const box = $('transmission');
      box.className = spoken.language === 'mod' ? 'announcer' : 'regime';
      $('transmission-speaker').textContent = speaker;
      $('transmission-text').textContent = /[.?!]$/.test(text) ? text : text + '.';
      box.hidden = false;
      clearTimeout(this.transmissionTimer);
      this.transmissionTimer = window.setTimeout(() => (box.hidden = true), spoken.duration * 1000 + 1800);
    }, Math.max(0, delay));
  }

  /**
   * The announcer revels in every death: a line about the victim, the president's joy or
   * the dead "alien". Not every death, and never two comments on top of each other.
   */
  private commentOnDeath(victim: Ship, killer: Ship | null) {
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
   * What the radio plays. A tournament round has its own song on the round clock: online,
   * the room and round number pick it, so every pilot hears the same song at the same beat.
   * Menu and flight school play calm songs on a local clock.
   */
  /** What the radio plays now; null in the flight school, where Nicole has the cockpit to herself. */
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
        if (action === 'confirm') {
          const lead = this.leadMode();
          if (lead === 'online') void this.goOnline();
          else this.startRound(lead === 'school' ? 'school' : 'solo');
        }
        break;
      case 'playing':
        if (action === 'pause') this.pause();
        if (this.sponsors.visible) {
          if (action === 'confirm') this.sponsors.confirm();
          break;
        }
        if (action === 'camera') this.cockpit = !this.cockpit;
        if (action === 'autopilot' && this.me?.alive) this.toggleAutopilot();
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
    this.state = state;
    $('menu').hidden = state !== 'menu';
    $('crest').hidden = state !== 'menu';
    $('pause').hidden = state !== 'paused';
    $('results').hidden = state !== 'results';
    $('invite').hidden = !this.online;
    $('invite').textContent = 'Copy invite link';
    if (state !== 'playing') this.sponsors.hide();
    this.hud.show(state === 'playing');
    this.input.steerWithMouse(state === 'playing');
    if (state !== 'playing') this.sound.setEngine(0, 0);
  }

  private showMenu() {
    this.leaveOnline();
    this.clearShips();
    this.field.generate(FIELD_SEED);
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
    this.wrecks.clear();
    this.brokenHere.clear();
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
    const callsign = $<HTMLInputElement>('callsign').value.trim() || 'Host';
    storageSet(CALLSIGN_KEY, callsign);
    if (mode !== 'online') this.leaveOnline();

    this.clearShips();
    this.field.generate(FIELD_SEED);
    this.hud.reset();
    $('hud-room').textContent = '';

    this.me = this.addShip(this.online ? `p:${this.online.selfId}` : 'me', callsign, this.selectedShip, true);
    this.school = mode === 'school' ? new FlightSchool(Number(storageGet(SCHOOL_STEP_KEY) ?? 0)) : null;
    if (this.school) this.scene.add(this.school.root);
    $('now-playing').hidden = mode === 'school';
    if (mode === 'solo') this.setBotCount(BOT_COUNT);
    this.respawn(this.me);

    this.roundId = 0;
    this.soloSeed = 1 + Math.floor(Math.random() * 2147483000);
    // online, the lead browser's clock decides (see leadRound and syncRound)
    if (mode === 'solo') this.setRoundEnd(ROUND_SECONDS);
    else this.roundEndsAt = this.roundEndsAtWall = Infinity;
    this.cockpit = false;
    this.flipping = false;
    this.autopilot = true;
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
        if (this.state === 'playing' && !this.school) this.radio.announce(pick(ANNOUNCER_OPEN), null);
      }, ANNOUNCER_OPEN_DELAY_MS);
    }
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
   * free ones dark and unattached, because a change in the number of lights makes three.js
   * recompile every lit material, which stutters when a ship joins or leaves.
   */
  private lendLight(ship: Ship) {
    const light = this.engineLights.find((l) => l.parent === this.scene);
    if (!light) return;
    light.position.set(0, 0, 400);
    ship.root.add(light);
    ship.engineLight = light;
  }

  private returnLight(ship: Ship) {
    const light = ship.engineLight;
    if (!light) return;
    light.intensity = 0;
    this.scene.add(light);
    ship.engineLight = null;
  }

  // ---- OnlineGame: what the online layer uses ----

  allShips() {
    return this.ships;
  }

  ownedShips() {
    return this.ships.filter((ship) => ship.owner === null);
  }

  addRemoteShip(state: ShipState, owner: string): Ship {
    const ship = this.addShip(state.id, state.n, state.k, false);
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

  /** Adds or removes own bots until this browser runs `count` of them. */
  setBotCount(count: number) {
    while (this.bots.length > count) this.removeShip(this.bots[this.bots.length - 1].ship);
    const taken = new Set(this.ships.map((s) => s.name));
    const names = BOT_NAMES.filter((n) => !taken.has(n));
    for (let i = this.bots.length; i < count; i++) {
      const id = this.online ? `b:${this.online.selfId}:${i}` : `bot${i}`;
      const ship = this.addShip(id, names[i] ?? `Bot ${i + 1}`, i % 2 === 0 ? 'alien' : 'human', false);
      this.bots.push(new Bot(ship, 0.2 + (i % 3) * 0.2));
      this.respawn(ship);
    }
  }

  showBeam(shooter: Ship, from: THREE.Vector3, to: THREE.Vector3) {
    this.effects.beam(from, to, shooter.color);
  }

  remoteDestroyed(victim: Ship, killer: Ship | null, deaths: number) {
    victim.alive = false;
    victim.root.visible = false;
    // the owner counted this death already; its wreckage is seeded with that count
    victim.deaths = deaths;
    this.shipDestroyed(victim, killer);
  }

  remoteRock(id: string, at: number) {
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
    this.effects.explosion(destroyed.object.position, destroyed.meanRadius * 0.6, destroyed.velocity);
    this.hearDebris(destroyed.object.position, destroyed.meanRadius);
  }

  syncRound(round: RoundState) {
    if (round.id !== this.roundId) {
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
    // the first lead browser of a room starts the clock; a new one continues the synced clock
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
    for (const ship of this.ownedShips()) ship.score = ship.kills = ship.deaths = 0;
    this.field.generate(FIELD_SEED);
    this.brokenHere.clear();
    this.wrecks.clear();
    $('results').hidden = true;
  }

  /** Spawns a ship on the edge of the field, facing the center, away from asteroids. */
  private respawn(ship: Ship) {
    // of a dozen random places on the edge of the field, clear of rock, the one farthest from
    // the nearest enemy, preferably hidden from every enemy behind the asteroids
    const position = new THREE.Vector3();
    const candidate = new THREE.Vector3();
    let best = -Infinity;
    for (let attempt = 0; attempt < SPAWN_CANDIDATES; attempt++) {
      candidate.randomDirection().multiplyScalar(FIELD_RADIUS * (0.9 + Math.random() * 0.2));
      if (this.field.overlap(candidate, ship.radius * 10)) continue;
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
    const look = new THREE.Matrix4().lookAt(position, scratch.set(0, 0, 0), new THREE.Vector3(0, 1, 0));
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
    this.renderScoreboard();
    $('results-next').textContent = '';
    $('again').innerHTML = 'Back to hangar <kbd>Enter</kbd>';
    this.speaker.say(COMPUTER.roundOver, 'urgent');
    this.setScreen('results');
  }

  private renderScoreboard() {
    const me = this.me;
    const ranking = this.ships.filter((s) => s !== this.drone).sort((a, b) => b.score - a.score);
    const table = $<HTMLTableElement>('scoreboard');
    table.innerHTML = '<tr><th>#</th><th>Host</th><th>Kills</th><th>Deaths</th><th>Score</th></tr>';
    ranking.forEach((ship, i) => {
      const row = table.insertRow();
      row.classList.toggle('me', ship === me);
      for (const value of [i + 1, ship.name, ship.kills, ship.deaths, ship.score]) row.insertCell().textContent = String(value);
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

    this.space.follow(this.camera);
    this.arena.update(this.camera);
    this.composer.render();
  }

  private updateRound(dt: number) {
    const me = this.me!;
    const now = this.time;

    // solo rounds run on real time too, like the radio, so a slow frame rate does not stretch
    // them and the finale of the music meets the end of the round
    if (!this.online && Number.isFinite(this.roundEndsAtWall)) this.roundEndsAt = now + (this.roundEndsAtWall - wallClock());

    this.ease = Math.max(0, this.ease - dt / EASE_FADE);
    const myControls = this.flightComputer(this.state === 'playing' ? this.input.read() : IDLE);
    // removing a ship replaces the list, so the loop safely runs over the list it started with
    for (const ship of this.ships) {
      if (ship.owner !== null) {
        ship.updateRemote(dt, now);
        continue;
      }
      if (!ship.alive) {
        if (now < ship.respawnAt || ship === this.drone || ship === this.sparring?.bot.ship) continue;
        // training clones are free; tournament clones cost an ad
        if (ship !== me || this.school) this.respawn(ship);
        else if (!this.sponsors.visible && this.state === 'playing') this.sponsorBreak();
        continue;
      }
      let bot: Bot | null = null;
      for (const b of this.bots) if (b.ship === ship) bot = b;
      if (bot) bot.ease = this.online ? 0 : this.ease;
      const thought = bot ? bot.think(now, this.ships, this.field, this.bots) : null;
      // the flight school's unarmed sparring bot only flies
      if (thought && bot === this.sparring?.bot && !this.sparring.armed) thought.fire = false;
      const controls = ship === me ? myControls : (thought ?? IDLE);
      this.field.gravity(ship.flight.position, gravity);
      ship.inShadow = this.field.raycast(ship.flight.position, SUN_DIRECTION, LASER_RANGE) !== null;
      if (ship.update(dt, now, controls, gravity)) this.fireLaser(ship);
      this.keepInArena(ship, now);
      this.collide(ship, now);
      this.hitWreckage(ship, now);
      this.exhaust(ship, dt);
    }
    this.wrecks.update(dt, now, this.field);
    this.pilot(dt, now);

    if (me.alive) {
      const rcs = Math.min(1, me.flight.rcs.length() + Math.abs(myControls.yaw) * 0.5 + Math.abs(myControls.pitch) * 0.5 + Math.abs(myControls.roll) * 0.5);
      this.sound.setEngine(me.flight.throttle, rcs * (0.25 + 0.75 * me.thrusters));
    } else {
      this.sound.setEngine(0, 0);
    }

    this.updateCamera(dt);
    me.root.visible = me.alive && !this.cockpit;
    this.hud.update(now, Math.max(0, this.roundEndsAt - now), me);
    this.hud.updateMarkers(this.camera, this.ships, me, this.inSight);
    this.hud.updateVelocityMarkers(this.camera, me);
    this.hud.setCenter(this.camera, me);
    this.hud.setAutopilot(this.autopilot);
    const waypoint = this.school ? this.teach(dt, myControls) : null;
    if (me.alive && this.state === 'playing') this.aimCrosshair(waypoint);
    this.hud.setOnTarget(me.alive && this.onTarget);

    const outside = me.alive && me.outsideSince !== null;
    if (!outside) this.toldToReturn = false;
    if (outside) {
      this.hud.flashMessage(now, `Return to the field — ${Math.max(0, ARENA_GRACE - (now - me.outsideSince!)).toFixed(1)}s`, 0.2);
      if (!this.toldToReturn) this.toldToReturn = this.speaker.say(COMPUTER.arena, 'urgent');
    } else if (this.flipping) {
      this.hud.flashMessage(now, this.flipAligned ? 'Flipped · drive brakes' : 'Flip', 0.2);
    } else if (this.input.braking && me.alive) {
      this.hud.flashMessage(now, this.braked ? 'At rest' : 'Braking', 0.2);
    }

    if (this.online) {
      this.online.update(now);
      // the room code is in the invite link; the HUD only says how many Hosts fly
      const room = `Online · ${this.online.pilots} ${this.online.pilots === 1 ? 'Host' : 'Hosts'}`;
      if ($('hud-room').textContent !== room) $('hud-room').textContent = room;
      if (now >= this.roundEndsAt) this.showOnlineResults();
    } else if (now >= this.roundEndsAt) {
      this.endRound();
    }
  }

  /** Runs the flight school: the current drill, its instruction, keys and waypoint. */
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
    this.hud.setSchool(school.status(context.device));
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

  /** A defenseless target for the flight school, facing the pilot. */
  private spawnDrone(position: THREE.Vector3, velocity: THREE.Vector3) {
    const me = this.me!;
    this.drone ??= this.addShip('drone', 'Target drone', me.type === 'human' ? 'alien' : 'human', false);
    const look = new THREE.Matrix4().lookAt(position, me.flight.position, me.flight.up(new THREE.Vector3()));
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
      const speed = flight.velocity.length();
      // at rest the brake holds still until gravity has pulled the ship clearly out of rest,
      // so it does not flicker between resting and burning
      if (speed < (this.braked ? BRAKE_RESUME : BRAKE_REST)) {
        if (!this.braked) this.sound.beep(660, 0.08);
        this.braked = true;
        const resting = Object.assign(this.computed, controls);
        resting.thrust = 0;
        return resting;
      }
      this.braked = false;
      // the drift in ship space (the nose is -Z): +Z is the speed the drive brakes once flipped
      inverseOrientation.copy(flight.orientation).invert();
      const drift = relative.copy(flight.velocity).applyQuaternion(inverseOrientation);
      let burn: Controls;
      if (speed > BRAKE_FINE) {
        retrograde.copy(flight.velocity).negate();
        burn = flight.flip(retrograde, 3, Object.assign(this.computed, controls));
        // the burn eases off at the end, so the ship comes to rest instead of reversing; a
        // damaged drive pushes less, so it eases off later
        const aligned = flight.angleTo(retrograde) < BRAKE_BURN_ANGLE;
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
   * with a computer too; the pilot still pulls the trigger. Sets `onTarget` when the laser
   * would hit now.
   */
  private assistAim(out: Controls): Controls {
    const me = this.me!;
    const flight = me.flight;
    this.onTarget = false;
    if (!me.alive) return out;
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
    if (!target) return out;
    this.onTarget = angle < target.radius / Math.max(distance, 1);
    flight.steer(toAim.subVectors(target.flight.position, flight.position), AIM_ASSIST_GAIN, assistSteer);
    const pull = AIM_ASSIST_STRENGTH * (1 - angle / AIM_ASSIST_ANGLE) * (1 - THREE.MathUtils.smoothstep(Math.hypot(out.yaw, out.pitch), 0.3, 0.8));
    out.yaw += (assistSteer.yaw - out.yaw) * pull;
    out.pitch += (assistSteer.pitch - out.pitch) * pull;
    return out;
  }

  /**
   * The pilot does not roll; the flight computer keeps the ship upright to the arena (its
   * north pole is up), so there is always a horizon. In steep climbs and dives it lets go,
   * so a loop is not fought halfway through.
   */
  private keepUpright(out: Controls): Controls {
    inverseOrientation.copy(this.me!.flight.orientation).invert();
    const up = scratch.set(0, 1, 0).applyQuaternion(inverseOrientation);
    // the ship's nose is -Z, so |up.z| is how steeply it points up or down
    const hold = 1 - THREE.MathUtils.smoothstep(Math.abs(up.z), UPRIGHT_LET_GO, UPRIGHT_FREE);
    out.roll = THREE.MathUtils.clamp(Math.atan2(up.x, up.y) * UPRIGHT_GAIN, -1, 1) * hold;
    return out;
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
    inverseOrientation.copy(this.me!.flight.orientation).invert();
    const drift = relative.copy(this.me!.flight.velocity).applyQuaternion(inverseOrientation).divideScalar(RCS_THRUST * AUTOPILOT_EASE);
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
    const origin = shooter.nose(muzzle);
    const direction = shooter.flight.forward(forward);
    let asteroidHit = this.field.raycast(origin, direction, LASER_RANGE);
    const wreckHit = this.wrecks.raycast(origin, direction, asteroidHit?.distance ?? LASER_RANGE);
    if (wreckHit) asteroidHit = null;
    const beamLength = wreckHit?.distance ?? asteroidHit?.distance ?? LASER_RANGE;

    const end = new THREE.Vector3().copy(origin).addScaledVector(direction, beamLength);
    const start = shooter.muzzle(this.shotCounter++, new THREE.Vector3());
    this.effects.beam(start, end, shooter.color);
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
          this.landed(scratch, 'HIT');
        }
        continue;
      }
      this.applyLaserHit(ship, origin, direction, shooter, distance);
    }

    if (wreckHit) {
      this.effects.sparks(end, shooter.color, 40);
      this.effects.explosion(wreckHit.wreck.mesh.position, wreckHit.wreck.radius, wreckHit.wreck.velocity);
      this.wrecks.remove(wreckHit.wreck);
    }

    if (asteroidHit) {
      const asteroid = asteroidHit.asteroid;
      normal.subVectors(end, asteroid.object.position).normalize();
      this.effects.sparks(end, shooter.color, 40);
      this.effects.debris(end, normal, 120);
      const destroyed = this.field.hit(asteroid.id);
      this.online?.sendRock(asteroid.id, this.field.clock);
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

  /** Feedback for a hit the own laser landed: a word where it struck, and a jolt. */
  private landed(point: THREE.Vector3, word: string) {
    this.hud.popup(this.camera, point, word, 'hit');
    this.kick = Math.min(2, this.kick + 0.5);
  }

  /**
   * A laser beam went through a ship this browser simulates: damage, feedback, destruction.
   * Also called for beams from other peers.
   */
  applyLaserHit(ship: Ship, origin: THREE.Vector3, direction: THREE.Vector3, shooter: Ship | null, distance?: number) {
    const { status, zone } = ship.laserHit(origin, direction, this.time);
    if (status === 'protected') return;
    const along = distance ?? scratch.subVectors(ship.flight.position, origin).dot(direction);
    this.effects.sparks(scratch.copy(origin).addScaledVector(direction, along), shooter?.color ?? SCRAPE_COLOR, 60);
    if (shooter?.isLocal) {
      this.hud.hit();
      this.sound.beep(zone === 'reactor' ? 1760 : 1320);
      this.landed(scratch, HIT_WORDS[zone]);
    }
    if (ship.isLocal) {
      this.hud.damaged();
      this.hud.flashMessage(this.time, ZONE_MESSAGES[zone], 1.5);
      this.speaker.say(COMPUTER[zone], 'urgent');
      this.sound.play('explosion', { volume: 1.2, rate: 1.5 });
      this.sound.beep(220, 0.25, 0.12);
      this.linkHit(zone === 'reactor' ? 1 : 0.7, 0.5);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, shooter);
  }

  private shipDestroyed(victim: Ship, killer: Ship | null) {
    victim.respawnAt = this.time + RESPAWN_SECONDS;
    if (victim === this.me && killer && killer !== victim) this.ease = Math.min(1, this.ease + DEATH_EASE);
    if (killer === this.me && victim !== this.me) this.ease = Math.max(0, this.ease - KILL_EASE);
    if (victim === this.me) this.deathCause = killer ? `Shot down by ${killer.name}` : victim.outsideSince !== null ? 'Lost in deep space' : 'Crashed';
    // a kill of the Host's own is bigger: more fire, a jolt, and the points where it happened
    const ownKill = killer?.isLocal === true && killer === this.me;
    this.effects.explosion(victim.flight.position, victim.radius * (ownKill ? 3 : 2), victim.flight.velocity.clone().multiplyScalar(0.3));
    if (ownKill) {
      this.hud.popup(this.camera, victim.flight.position, `+${KILL_POINTS}`, 'kill');
      this.kick = 2;
    }
    this.wrecks.spawn(victim.id, victim.deaths, victim.flight.position, victim.flight.velocity, victim.radius, this.time);
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
      killer.score += KILL_POINTS;
      if (killer.isLocal) {
        this.sound.beep(1320, 0.07, 0.15);
        this.sound.beep(1760, 0.12, 0.15, 0.09);
      }
    }
    // remote ships do not report how they crashed: "Crash" covers rocks and wreckage alike
    this.hud.kill(this.time, killer?.name ?? (victim.outsideSince !== null ? 'Deep space' : 'Crash'), victim.name);
    if (victim !== this.drone) this.commentOnDeath(victim, killer);
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
      this.hud.flashMessage(now, `Impact at ${Math.round(approach * 0.05)} m/s`, 1.5);
      this.speaker.say(COMPUTER.impact, 'urgent');
      this.linkHit(Math.min(1, 0.4 + (approach - SAFE_IMPACT) / 1000), 0.6);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, null);
  }

  /** Ship vs debris: the piece is pulverized, the hull takes damage by the impact speed. */
  private hitWreckage(ship: Ship, now: number) {
    if (!ship.alive) return;
    const wreck = this.wrecks.overlap(ship.flight.position, ship.radius * 0.8);
    if (!wreck) return;
    const impact = relative.subVectors(ship.flight.velocity, wreck.velocity).length();
    this.effects.sparks(wreck.mesh.position, SCRAPE_COLOR, 60);
    this.wrecks.remove(wreck);
    const status = ship.structural(Math.max(0, impact - SAFE_IMPACT) * IMPACT_DAMAGE * 0.6, now);
    if (ship.isLocal && status !== 'protected') {
      this.sound.play('explosion', { volume: Math.min(1.4, 0.3 + impact / 1000), rate: 2.1 });
      this.hud.damaged();
      this.hud.flashMessage(now, 'Debris impact', 1.2);
      this.speaker.say(COMPUTER.debris);
      this.linkHit(0.5, 0.35);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, null);
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
    this.lockWarning(warnings, now);
    if (me.alive && me.overheated) warnings.push('LASER OVERHEATED');
    this.hud.setWarning(warnings.join('\n'));
  }

  /**
   * Another ship's nose on the own ship: LOCKED when its laser would hit now, TRACKED when
   * the nose is close to it. The ship's sensors see where every other hull points; the
   * faster beeping is the cue to jink.
   */
  private lockWarning(warnings: string[], now: number) {
    const me = this.me!;
    if (!me.alive) return;
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
    if (!shooter) return;
    warnings.push(`${level === 2 ? 'LOCKED' : 'TRACKED'} · ${shooter.name}`);
    if (now >= this.nextLockBeep) {
      this.sound.beep(level === 2 ? 1560 : 1170, 0.04, 0.1);
      this.nextLockBeep = now + (level === 2 ? 0.1 : 0.35);
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
    if (now - ship.outsideSince < ARENA_GRACE) return;
    ship.structural(Infinity, now);
    if (!ship.alive) this.shipDestroyed(ship, null);
  }

  private updateCamera(dt: number) {
    const me = this.me!;
    const flight = me.flight;
    if (this.cockpit) {
      this.camera.position.copy(flight.position).addScaledVector(flight.forward(scratch), me.radius * 0.3);
      this.camera.quaternion.copy(flight.orientation);
      return;
    }
    cameraGoal.set(0, me.radius * 0.75, me.radius * 2.6).applyQuaternion(flight.orientation).add(flight.position);
    this.camera.position.lerp(cameraGoal, 1 - Math.exp(-CAMERA_FOLLOW * dt));
    this.camera.quaternion.slerp(flight.orientation, 1 - Math.exp(-CAMERA_TURN * dt));
    // the drive kicks: the view widens and trembles while it burns
    const burn = me.alive ? flight.throttle : 0;
    const fov = this.camera.fov + (CAMERA_FOV + DRIVE_FOV_KICK * burn - this.camera.fov) * (1 - Math.exp(-6 * dt));
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    if (burn > 0.05 && !reducedMotion.matches) this.camera.position.add(scratch.randomDirection().multiplyScalar(me.radius * DRIVE_SHAKE * burn));
    // a jolt for every hit the own laser lands, bigger for a kill; it fades in a fraction of a second
    if (this.kick > 0.01 && !reducedMotion.matches) this.camera.position.add(scratch.randomDirection().multiplyScalar(me.radius * KICK_SHAKE * this.kick));
    this.kick *= Math.exp(-KICK_FADE * dt);
  }

  private updateMenuCamera() {
    if (this.camera.fov !== CAMERA_FOV) {
      this.camera.fov = CAMERA_FOV;
      this.camera.updateProjectionMatrix();
    }
    const t = this.time * 0.08;
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(Math.cos(t), Math.sin(t * 0.7) * 0.2, Math.sin(t));
  }
}
