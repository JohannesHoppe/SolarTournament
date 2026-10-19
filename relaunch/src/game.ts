import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { Assets, ShipType } from './assets';
import { ASTEROID_POINTS, AsteroidField, FIELD_RADIUS, raySphere } from './asteroids';
import { Sound } from './audio';
import { Bot, BOT_NAMES } from './bots';
import { Effects } from './effects';
import { Glitch } from './glitch';
import { Hud } from './hud';
import { Radio, type MusicCue } from './music/radio';
import type { Spoken } from './music/band';
import { COMPUTER, ANNOUNCER_ALIEN, ANNOUNCER_KILL, ANNOUNCER_NAMES, ANNOUNCER_ROCK, SCHOOL_SPEECH } from './music/lines';
import { Speaker } from './speaker';
import { hash, mixSeed, textSeed, titleFor, type Song } from './music/songs';
import { IDLE, Input, type Action, type Controls } from './input';
import { Ship, type ShipState, type Zone } from './ship';
import { MAIN_THRUST } from './flight';
import { newRoomCode, Session, type RoundState } from './net/session';
import { Online, type OnlineGame } from './online';
import { Space, SUN_DIRECTION } from './space';
import { FlightSchool } from './school';
import { SponsorBreak } from './sponsors';
import { Wrecks } from './wrecks';

const ROUND_SECONDS = 5 * 60;
/** Online tournaments show the scoreboard this long before the next round starts. */
const RESULTS_SECONDS = 12;
const FIELD_SEED = 11;
/** A client's round clock jumps to the host's when it is this far off (s), and drifts towards it otherwise. */
const ROUND_SNAP = 0.25;
/** The announcer comments on a death at most this often (s). */
const ANNOUNCER_COOLDOWN = 7;
/** Song of the menu; the flight school plays the next one. */
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
/** Ships beyond this distance from the center have ARENA_GRACE seconds to come back. */
const ARENA_LIMIT = FIELD_RADIUS * 1.5;
const ARENA_GRACE = 8;
/** Explosions closer than this pelt the own hull with audible debris. */
const DEBRIS_HEARING = 6000;
/** The flip assist lets go once the nose is this close to retrograde (rad). */
const FLIP_DONE_ANGLE = 0.04;
/** One standard gravity in units/s² (1 unit = 5 cm). */
const G = 9.81 / 0.05;
/** Above this load the pilot starts to grey out; at the limit it takes G_ONSET seconds to tunnel vision. */
const G_TOLERANCE = 3;
const G_ONSET = 5;
const G_RECOVERY = 3;
/** The impact warning starts this many seconds before the last chance to flip and brake. */
const IMPACT_MARGIN = 2;
/** Assumed duration of a flip for the impact warning (s). */
const FLIP_SECONDS = 2.5;
const ZONE_MESSAGES: Record<Zone, string> = {
  reactor: 'Reactor breach',
  drive: 'Main drive damaged',
  thrusters: 'Thrusters damaged',
  hull: 'Hull breach',
};
const BEST_SCORE_KEY = 'solartournament.best';
const CALLSIGN_KEY = 'solartournament.callsign';

type State = 'menu' | 'playing' | 'paused' | 'results';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const scratch = new THREE.Vector3();
const forward = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();
const gravity = new THREE.Vector3();
const retrograde = new THREE.Vector3();
const normal = new THREE.Vector3();
const relative = new THREE.Vector3();
const VENT_COLOR = new THREE.Color(1, 0.6, 0.25);
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

export class Game implements OnlineGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 10, 400000);
  private readonly space = new Space();
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
  /** Number of the running online round; a new number resets the scores. */
  private roundId = 0;
  private ships: Ship[] = [];
  private bots: Bot[] = [];
  private me: Ship | null = null;
  private cockpit = false;
  private shotCounter = 0;
  private selectedShip: ShipType = 'human';
  /** The flight computer turns the own ship to retrograde while this is set. */
  private flipAssist = false;
  /** The running flight school, or null in a tournament round. */
  private school: FlightSchool | null = null;
  /** Target drone of the flight school. */
  private drone: Ship | null = null;
  /** G-force strain of the own pilot, 0..1. */
  private strain = 0;
  private nextHeartbeat = 0;
  private nextWarningBeep = 0;
  /** Speed of game time; 0 freezes the simulation while rendering continues. */
  timeScale = 1;
  private readonly glitch = new Glitch();
  private readonly radio: Radio;
  /** The flight computer's voice: reads out what the screen shows. */
  private readonly speaker: Speaker;
  /** Flight school step the computer has read out. */
  private spokenStep = -1;
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
  /** The name the host's current line is about, for the subtitle. */
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
    this.scene.add(this.space.sky, this.space.dust, this.space.lights, this.field.group, this.wrecks.group, this.effects.group);

    this.input = new Input(this.renderer.domElement);
    this.input.onAction((action) => this.onAction(action));
    this.bindMenu();

    window.addEventListener('resize', () => this.resize());
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
    $('online').addEventListener('click', () => void this.goOnline());
    $('resume').addEventListener('click', () => this.resume());
    $('quit').addEventListener('click', () => this.endRound());
    $('again').addEventListener('click', () => this.showMenu());
    $('invite').addEventListener('click', () => void this.copyInvite());
    $('radio').addEventListener('click', () => this.toggleRadio());
    this.showRadioState();

    // an invitation link opens the menu with "Join" as the main action
    const invited = this.invitedRoom();
    if (invited) {
      $('online').textContent = `Join tournament ${invited}`;
      $('online').classList.add('primary');
      $('start').classList.remove('primary');
    }
  }

  /** Room code from an invitation link (?t=code). */
  private invitedRoom(): string | null {
    return new URLSearchParams(location.search).get('t');
  }

  /** Joins the invited tournament or opens a new one, then starts playing in it. */
  private async goOnline() {
    const button = $<HTMLButtonElement>('online');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Connecting…';
    try {
      const params = new URLSearchParams(location.search);
      const room = params.get('t') ?? newRoomCode();
      params.set('t', room);
      history.replaceState(null, '', `${location.pathname}?${params}`);
      // ?local=1 connects tabs of this browser instead of going over the internet
      const session = await Session.join(room, params.has('local'));
      this.online = new Online(session, this);
      this.startRound('online');
    } catch (error) {
      console.error(error);
      this.hud.flashMessage(this.time, 'Could not connect', 3);
      this.speaker.say(COMPUTER.noLink, true);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
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

  private leaveOnline() {
    this.online?.leave();
    this.online = null;
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
      .replace('{name}', this.announcedName ?? 'host')
      .split(/(?<=[.?!])\s+/)
      .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1))
      .join(' ');
    window.setTimeout(() => {
      const box = $('transmission');
      box.className = spoken.language === 'mod' ? 'host' : 'regime';
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
    // bots have rendered names; a human callsign is spoken as "host" and shown in the subtitle
    this.announcedName = victim.name;
    this.radio.announce(line, ANNOUNCER_NAMES.includes(spoken) ? spoken : null);
  }

  /**
   * What the radio plays. A tournament round has its own song on the round clock: online,
   * the room and round number pick it, so every pilot hears the same song at the same beat.
   * Menu and flight school play calm songs on a local clock.
   */
  private musicCue(): MusicCue {
    const inRound = this.state === 'playing' || this.state === 'results' || (this.state === 'paused' && !!this.online);
    if (inRound && !this.school && Number.isFinite(this.roundEndsAtWall)) {
      const seed = this.online ? mixSeed(textSeed(this.online.session.room), this.roundId) : this.soloSeed;
      return { title: titleFor(seed), energy: 'round', elapsed: ROUND_SECONDS - (this.roundEndsAtWall - wallClock()), roundLength: ROUND_SECONDS };
    }
    const seed = this.school && this.state !== 'menu' ? LOUNGE_SEED + 1 : LOUNGE_SEED;
    return { title: titleFor(seed), energy: 'lounge', elapsed: wallClock() - this.loungeEpoch, roundLength: ROUND_SECONDS };
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
    switch (this.state) {
      case 'menu':
        if (action === 'confirm') {
          if (this.invitedRoom()) void this.goOnline();
          else this.startRound('solo');
        }
        break;
      case 'playing':
        if (this.sponsors.visible) {
          if (action === 'confirm') this.sponsors.confirm();
          break;
        }
        if (action === 'pause' || action === 'pointer-released') this.pause();
        if (action === 'camera') this.cockpit = !this.cockpit;
        if (action === 'flip' && this.me?.alive) this.flipAssist = !this.flipAssist;
        break;
      case 'paused':
        if (action === 'confirm' || action === 'pause') this.resume();
        if (action === 'quit') this.endRound();
        break;
      case 'results':
        if (action === 'confirm') this.showMenu();
        break;
    }
  }

  private setScreen(state: State) {
    this.state = state;
    $('menu').hidden = state !== 'menu';
    $('crest').hidden = state !== 'menu';
    $('pause').hidden = state !== 'paused';
    $('results').hidden = state !== 'results';
    $('invite').hidden = !this.online;
    $('invite').textContent = 'Copy invite link';
    if (state !== 'playing') this.sponsors.hide();
    this.hud.show(state === 'playing');
    if (state !== 'playing') this.sound.setEngine(0, 0);
  }

  private showMenu() {
    this.leaveOnline();
    this.clearShips();
    this.field.generate(FIELD_SEED);
    const best = Number(storageGet(BEST_SCORE_KEY) ?? 0);
    $('best-score').textContent = best ? `Personal best: ${best} pts` : '';
    this.setScreen('menu');
    this.input.releasePointer();
  }

  private clearShips() {
    this.wrecks.clear();
    for (const ship of this.ships) this.scene.remove(ship.root);
    this.ships = [];
    this.bots = [];
    this.me = null;
    this.drone = null;
  }

  /**
   * Starts a round: solo against bots, the flight school without opponents, or an online
   * tournament (where the host adds bots for free places).
   */
  private startRound(mode: 'solo' | 'school' | 'online') {
    const callsign = $<HTMLInputElement>('callsign').value.trim() || 'Host';
    storageSet(CALLSIGN_KEY, callsign);
    if (mode !== 'online') this.leaveOnline();

    this.clearShips();
    this.field.generate(FIELD_SEED);
    this.hud.reset();
    $('hud-room').textContent = '';

    this.me = this.addShip(this.online ? `p:${this.online.selfId}` : 'me', callsign, this.selectedShip, true);
    this.school = mode === 'school' ? new FlightSchool() : null;
    this.spokenStep = -1;
    if (mode === 'solo') this.setBotCount(BOT_COUNT);
    this.respawn(this.me);

    this.roundId = 0;
    this.soloSeed = 1 + Math.floor(Math.random() * 2147483000);
    // online, the host's clock decides (see hostRound and syncRound)
    if (mode === 'solo') this.setRoundEnd(ROUND_SECONDS);
    else this.roundEndsAt = this.roundEndsAtWall = Infinity;
    this.cockpit = false;
    this.flipAssist = false;
    this.strain = 0;
    this.setScreen('playing');
    this.input.resetMouse();
    this.input.lockPointer();
    if (!this.input.touchActive) this.hud.flashMessage(this.time, 'Click to steer with the mouse', 4);
    // the flight school starts with its briefing; a tournament clone just reports in
    if (mode !== 'school') this.speaker.say(this.input.touchActive ? COMPUTER.launch : [COMPUTER.launch, COMPUTER.mouse], true);
  }

  private addShip(id: string, name: string, type: ShipType, isLocal: boolean): Ship {
    const ship = new Ship(id, name, type, this.assets, isLocal);
    this.ships.push(ship);
    this.scene.add(ship.root);
    return ship;
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

  remoteDestroyed(victim: Ship, killer: Ship | null) {
    victim.alive = false;
    victim.root.visible = false;
    this.shipDestroyed(victim, killer);
  }

  remoteRock(id: string) {
    const destroyed = this.field.hit(id);
    if (!destroyed) return;
    this.effects.explosion(destroyed.object.position, destroyed.meanRadius * 0.6, destroyed.velocity);
    this.hearDebris(destroyed.object.position, destroyed.meanRadius);
  }

  syncRound(round: RoundState) {
    if (round.id !== this.roundId) {
      this.roundId = round.id;
      this.startNextRound();
    }
    // the radio plays on this clock, so it follows the host closely: jumps when far off,
    // otherwise smooths out the jitter of the network
    const endsAt = wallClock() + round.left;
    if (Math.abs(endsAt - this.roundEndsAtWall) > ROUND_SNAP || !Number.isFinite(this.roundEndsAtWall)) this.setRoundEnd(round.left);
    else this.setRoundEnd(this.roundEndsAtWall + (endsAt - this.roundEndsAtWall) * 0.05 - wallClock());
  }

  hostRound(): RoundState {
    // the first host of a room starts the clock; a new host continues the synced one
    if (!Number.isFinite(this.roundEndsAtWall)) this.setRoundEnd(ROUND_SECONDS);
    // the host starts the next round once the scoreboard has been shown
    if (wallClock() >= this.roundEndsAtWall + RESULTS_SECONDS) {
      this.roundId++;
      this.startNextRound();
      this.setRoundEnd(ROUND_SECONDS);
    }
    const left = this.roundEndsAtWall - wallClock();
    this.roundEndsAt = this.time + left;
    return { id: this.roundId, left: +left.toFixed(3) };
  }

  /**
   * Sets the end of the round on both clocks. Online rounds run on real time, so a slow
   * frame rate or a hidden tab does not hold them back; game time follows.
   */
  private setRoundEnd(left: number) {
    this.roundEndsAt = this.time + left;
    this.roundEndsAtWall = wallClock() + left;
  }

  /** Online: scores of the own ships start from zero, the scoreboard closes. */
  private startNextRound() {
    for (const ship of this.ownedShips()) ship.score = ship.kills = ship.deaths = 0;
    $('results').hidden = true;
  }

  /** Spawns a ship on the edge of the field, facing the center, away from asteroids. */
  private respawn(ship: Ship) {
    const position = new THREE.Vector3();
    for (let attempt = 0; attempt < 20; attempt++) {
      position.randomDirection().multiplyScalar(FIELD_RADIUS * (0.9 + Math.random() * 0.2));
      if (!this.field.overlap(position, ship.radius * 10)) break;
    }
    const look = new THREE.Matrix4().lookAt(position, scratch.set(0, 0, 0), new THREE.Vector3(0, 1, 0));
    ship.spawn(position, new THREE.Quaternion().setFromRotationMatrix(look), this.time);
    if (ship === this.me) {
      // the link locks onto the freshly printed clone
      this.glitch.trigger(0.5, 0.5);
      this.radio.setMuffled(false);
    }
  }

  /** The next clone only boots after the pilot has watched an ad. */
  private sponsorBreak() {
    this.input.releasePointer();
    this.hud.show(false);
    this.speaker.say(COMPUTER.cloneLost, true);
    this.sponsors.show(() => {
      this.speaker.say(COMPUTER.sponsorHappy, true);
      this.hud.show(true);
      this.respawn(this.me!);
      this.input.resetMouse();
      this.input.lockPointer();
    });
  }

  private pause() {
    this.setScreen('paused');
    this.input.releasePointer();
  }

  private resume() {
    // a solo round stood still during the pause; its real-time end moves on accordingly
    if (!this.online && Number.isFinite(this.roundEndsAt)) this.setRoundEnd(this.roundEndsAt - this.time);
    this.setScreen('playing');
    this.input.resetMouse();
    this.input.lockPointer();
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
    this.speaker.say(COMPUTER.roundOver, true);
    this.setScreen('results');
    this.input.releasePointer();
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
    if (me && me.score > Number(storageGet(BEST_SCORE_KEY) ?? 0)) storageSet(BEST_SCORE_KEY, String(me.score));
  }

  /**
   * Online rounds end for everyone at once: the scoreboard shows over the running game
   * until the host starts the next round.
   */
  private showOnlineResults() {
    const results = $('results');
    if (results.hidden) {
      this.renderScoreboard();
      $('again').textContent = 'Leave tournament';
      results.hidden = false;
      this.speaker.say(COMPUTER.roundOver, true);
    }
    const next = Math.max(0, this.roundEndsAt + RESULTS_SECONDS - this.time);
    $('results-next').textContent = `Next round in ${Math.ceil(next)} s`;
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

    this.radio.setCue(this.musicCue());
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
    this.composer.render();
  }

  private updateRound(dt: number) {
    const me = this.me!;
    const now = this.time;

    const myControls = this.flightComputer(this.state === 'playing' ? this.input.read(dt) : { ...IDLE });
    for (const ship of [...this.ships]) {
      if (ship.owner !== null) {
        ship.updateRemote(dt, now);
        continue;
      }
      if (!ship.alive) {
        if (now < ship.respawnAt || ship === this.drone) continue;
        // training clones are free; tournament clones cost an ad
        if (ship !== me || this.school) this.respawn(ship);
        else if (!this.sponsors.visible) this.sponsorBreak();
        continue;
      }
      const bot = this.bots.find((b) => b.ship === ship);
      const controls = ship === me ? myControls : bot ? bot.think(now, this.ships, this.field) : IDLE;
      this.field.gravity(ship.flight.position, gravity);
      ship.inShadow = this.field.raycast(ship.flight.position, SUN_DIRECTION, LASER_RANGE) !== null;
      if (ship.update(dt, now, controls, gravity)) this.fireLaser(ship);
      this.keepInArena(ship, now);
      this.collide(ship, now);
      this.hitWreckage(ship, now);
      this.exhaust(ship, controls, dt);
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
    this.hud.updateMarkers(this.camera, this.ships, me, (ship) => this.field.lineOfSight(this.camera.position, ship.flight.position));
    this.hud.updateVelocityMarkers(this.camera, me);
    if (this.school) this.teach(dt, myControls);

    const outside = me.alive && me.outsideSince !== null;
    if (!outside) this.toldToReturn = false;
    if (outside) {
      this.hud.flashMessage(now, `Return to the field — ${Math.max(0, ARENA_GRACE - (now - me.outsideSince!)).toFixed(1)}s`, 0.2);
      if (!this.toldToReturn) this.toldToReturn = this.speaker.say(COMPUTER.arena, true);
    } else if (this.flipAssist) {
      this.hud.flashMessage(now, 'Flip', 0.2);
    }

    if (this.online) {
      this.online.update(now);
      $('hud-room').textContent = `Tournament ${this.online.session.room} · ${this.online.pilots} ${this.online.pilots === 1 ? 'host' : 'hosts'}`;
      if (now >= this.roundEndsAt) this.showOnlineResults();
    } else if (now >= this.roundEndsAt) {
      this.endRound();
    }
  }

  /** Runs the flight school: checks the current step, shows the instruction and waypoint. */
  private teach(dt: number, controls: Controls) {
    const school = this.school!;
    const me = this.me!;
    const step = school.stepIndex;
    const waypoint = school.update({
      me,
      controls,
      field: this.field,
      now: this.time,
      dt,
      drone: this.drone,
      spawnDrone: () => this.spawnDrone(),
      speaking: this.speaker.speaking,
    });
    if (school.stepIndex !== step) this.sound.beep(880, 0.1, 0.15);
    // the flight computer reads every step out; a new step cuts the old one off
    if (school.stepIndex !== this.spokenStep && !school.finished) {
      if (this.speaker.say(SCHOOL_SPEECH[school.stepIndex], true)) this.spokenStep = school.stepIndex;
    }
    if (school.finished) {
      this.showMenu();
      return;
    }
    this.hud.setSchool(school.status);
    this.hud.setWaypoint(this.camera, waypoint);
  }

  /** A defenseless target for the flight school, placed in front of the pilot. */
  private spawnDrone() {
    const me = this.me!;
    this.drone ??= this.addShip('drone', 'Target drone', me.type === 'human' ? 'alien' : 'human', false);
    const position = me.flight.forward(new THREE.Vector3()).multiplyScalar(6000).add(me.flight.position);
    const look = new THREE.Matrix4().lookAt(position, me.flight.position, me.flight.up(new THREE.Vector3()));
    this.drone.spawn(position, new THREE.Quaternion().setFromRotationMatrix(look), this.time);
    this.drone.protectedUntil = this.time;
  }

  /**
   * The own ship's flight computer: while the flip assist is on, it turns the nose to
   * retrograde, until it gets there or the pilot takes over the stick.
   */
  private flightComputer(controls: Controls): Controls {
    const flight = this.me!.flight;
    if (!this.flipAssist) return controls;
    if (!this.me!.alive || Math.hypot(controls.yaw, controls.pitch) > 0.35 || flight.velocity.lengthSq() < 400) {
      this.flipAssist = false;
      return controls;
    }
    retrograde.copy(flight.velocity).negate();
    if (flight.angleTo(retrograde) < FLIP_DONE_ANGLE && flight.angularVelocity.length() < 0.1) {
      this.flipAssist = false;
      this.sound.beep(660, 0.08);
      return controls;
    }
    return { ...controls, ...flight.steer(retrograde, 3) };
  }

  /** Drive trail, thruster puffs, and venting holes in damaged hulls. */
  private exhaust(ship: Ship, controls: Controls, dt: number) {
    const flight = ship.flight;
    if (flight.throttle > 0.3) {
      this.effects.engineTrail(ship.toWorld(scratch.set(0, 0, ship.radius * 0.9)), flight.velocity, flight.throttle);
    }
    const rcs = flight.rcs;
    if (rcs.lengthSq() > 0.01 && Math.random() < dt * 30) {
      // the exhaust leaves on the side opposite to the push
      const nozzle = ship.toWorld(scratch.copy(rcs).normalize().multiplyScalar(-ship.radius * 0.7));
      relative.copy(rcs).normalize().applyQuaternion(flight.orientation).multiplyScalar(-600).add(flight.velocity);
      this.effects.puff(nozzle, relative, ship.radius * 0.12);
    }
    if ((Math.abs(controls.yaw) > 0.2 || Math.abs(controls.pitch) > 0.2) && Math.random() < dt * 20) {
      const side = scratch.set(Math.sign(controls.yaw) * ship.radius * 0.5, Math.sign(controls.pitch) * ship.radius * 0.3, -ship.radius * 0.6);
      const nozzle = ship.toWorld(side);
      relative.copy(side).normalize().applyQuaternion(flight.orientation).multiplyScalar(500).add(flight.velocity);
      this.effects.puff(nozzle, relative, ship.radius * 0.08);
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
      this.online?.sendRock(asteroid.id);
      if (destroyed) {
        shooter.score += ASTEROID_POINTS[destroyed.generation];
        this.effects.explosion(destroyed.object.position, destroyed.meanRadius * 0.6, destroyed.velocity);
        this.hearDebris(destroyed.object.position, destroyed.meanRadius);
        if (shooter.isLocal) {
          this.hud.hit();
          this.hud.flashMessage(this.time, `Asteroid cracked +${ASTEROID_POINTS[destroyed.generation]}`, 1.5);
          this.speaker.say(COMPUTER.asteroid);
        }
      }
    }
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
    }
    if (ship.isLocal) {
      this.hud.damaged();
      this.hud.flashMessage(this.time, ZONE_MESSAGES[zone], 1.5);
      this.speaker.say(COMPUTER[zone], true);
      this.sound.play('explosion', { volume: 1.2, rate: 1.5 });
      this.sound.beep(220, 0.25, 0.12);
      this.linkHit(zone === 'reactor' ? 1 : 0.7, 0.5);
    }
    if (status === 'destroyed') this.shipDestroyed(ship, shooter);
  }

  private shipDestroyed(victim: Ship, killer: Ship | null) {
    victim.respawnAt = this.time + RESPAWN_SECONDS;
    if (victim.isLocal) this.flipAssist = false;
    this.effects.explosion(victim.flight.position, victim.radius * 2, victim.flight.velocity.clone().multiplyScalar(0.3));
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
    this.hud.kill(this.time, killer?.name ?? (victim.outsideSince !== null ? 'Deep space' : 'Asteroid'), victim.name);
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
    const asteroid = this.field.overlap(ship.flight.position, ship.radius);
    if (!asteroid || !this.field.resolve(asteroid, ship.flight.position, ship.radius, normal)) return;
    const velocity = ship.flight.velocity;
    relative.subVectors(velocity, asteroid.velocity);
    const approach = -relative.dot(normal);
    if (approach <= 0) return;
    velocity.addScaledVector(normal, approach * (1 + RESTITUTION));
    // friction: scraping along the rock bleeds off some sideways speed
    relative.subVectors(velocity, asteroid.velocity);
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
      this.speaker.say(COMPUTER.impact, true);
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

    const warnings: string[] = [];
    const speed = flight.velocity.length();
    if (me.alive && speed > 100) {
      const heading = scratch.copy(flight.velocity).divideScalar(speed);
      const hit = this.field.raycast(flight.position, heading, speed * 20);
      if (hit) {
        const timeToImpact = Math.max(0, hit.distance - me.radius) / speed;
        const thrust = MAIN_THRUST * Math.max(me.drive, 0.01);
        const flipTime = (flight.angleTo(retrograde.copy(heading).negate()) / Math.PI) * FLIP_SECONDS;
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
    if (me.alive && me.overheated) warnings.push('LASER OVERHEATED');
    this.hud.setWarning(warnings.join('\n'));
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
    const blend = 1 - Math.exp(-14 * dt);
    this.camera.position.lerp(cameraGoal, blend);
    this.camera.quaternion.slerp(flight.orientation, 1 - Math.exp(-10 * dt));
  }

  private updateMenuCamera() {
    const t = this.time * 0.08;
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(Math.cos(t), Math.sin(t * 0.7) * 0.2, Math.sin(t));
  }
}
