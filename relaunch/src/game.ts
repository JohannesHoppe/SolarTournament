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
import { Hud } from './hud';
import { IDLE, Input, type Action, type Controls } from './input';
import { Ship, type Zone } from './ship';
import { MAIN_THRUST } from './flight';
import { Space, SUN_DIRECTION } from './space';
import { SponsorBreak } from './sponsors';
import { Wrecks } from './wrecks';

const ROUND_SECONDS = 5 * 60;
const FIELD_SEED = 11;
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

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 10, 400000);
  private readonly space = new Space();
  private readonly field: AsteroidField;
  private readonly effects: Effects;
  private readonly wrecks = new Wrecks();
  private readonly sponsors = new SponsorBreak();
  private readonly hud = new Hud();
  private readonly input: Input;
  private readonly timer = new THREE.Timer();

  private state: State = 'menu';
  private time = 0;
  private roundEndsAt = 0;
  private ships: Ship[] = [];
  private bots: Bot[] = [];
  private me: Ship | null = null;
  private cockpit = false;
  private shotCounter = 0;
  private selectedShip: ShipType = 'human';
  /** The flight computer turns the own ship to retrograde while this is set. */
  private flipAssist = false;
  /** G-force strain of the own pilot, 0..1. */
  private strain = 0;
  private nextHeartbeat = 0;
  private nextWarningBeep = 0;
  /** Speed of game time; 0 freezes the simulation while rendering continues. */
  timeScale = 1;

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
    callsign.placeholder = 'Pilot';
    for (const button of document.querySelectorAll<HTMLButtonElement>('.ship-select button')) {
      button.addEventListener('click', () => {
        this.selectedShip = button.dataset.ship as ShipType;
        document.querySelectorAll('.ship-select button').forEach((b) => b.classList.toggle('selected', b === button));
      });
    }
    $('start').addEventListener('click', () => this.startRound());
    $('resume').addEventListener('click', () => this.resume());
    $('quit').addEventListener('click', () => this.endRound());
    $('again').addEventListener('click', () => this.showMenu());
  }

  private onAction(action: Action) {
    switch (this.state) {
      case 'menu':
        if (action === 'confirm') this.startRound();
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
    $('pause').hidden = state !== 'paused';
    $('results').hidden = state !== 'results';
    if (state !== 'playing') this.sponsors.hide();
    this.hud.show(state === 'playing');
    if (state !== 'playing') this.sound.setEngine(0, 0);
  }

  private showMenu() {
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
  }

  private startRound() {
    const callsign = $<HTMLInputElement>('callsign').value.trim() || 'Pilot';
    storageSet(CALLSIGN_KEY, callsign);

    this.clearShips();
    this.field.generate(FIELD_SEED);
    this.hud.reset();

    this.me = this.addShip('me', callsign, this.selectedShip, true);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < BOT_COUNT; i++) {
      const ship = this.addShip('bot' + i, names[i], i % 2 === 0 ? 'alien' : 'human', false);
      this.bots.push(new Bot(ship, 0.2 + i * 0.2));
    }
    for (const ship of this.ships) this.respawn(ship);

    this.roundEndsAt = this.time + ROUND_SECONDS;
    this.cockpit = false;
    this.flipAssist = false;
    this.strain = 0;
    this.setScreen('playing');
    this.input.resetMouse();
    this.input.lockPointer();
    if (!this.input.touchActive) this.hud.flashMessage(this.time, 'Click to steer with the mouse', 4);
  }

  private addShip(id: string, name: string, type: ShipType, isLocal: boolean): Ship {
    const ship = new Ship(id, name, type, this.assets, isLocal);
    this.ships.push(ship);
    this.scene.add(ship.root);
    return ship;
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
  }

  /** The next clone only boots after the pilot has watched an ad. */
  private sponsorBreak() {
    this.input.releasePointer();
    this.hud.show(false);
    this.sponsors.show(() => {
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
    this.setScreen('playing');
    this.input.resetMouse();
    this.input.lockPointer();
  }

  private endRound() {
    const me = this.me;
    const ranking = [...this.ships].sort((a, b) => b.score - a.score);
    const table = $<HTMLTableElement>('scoreboard');
    table.innerHTML = '<tr><th>#</th><th>Pilot</th><th>Kills</th><th>Deaths</th><th>Score</th></tr>';
    ranking.forEach((ship, i) => {
      const row = table.insertRow();
      row.classList.toggle('me', ship === me);
      for (const value of [i + 1, ship.name, ship.kills, ship.deaths, ship.score]) row.insertCell().textContent = String(value);
    });
    if (me && me.score > Number(storageGet(BEST_SCORE_KEY) ?? 0)) storageSet(BEST_SCORE_KEY, String(me.score));
    this.setScreen('results');
    this.input.releasePointer();
  }

  private resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.effects.setViewport(height * this.renderer.getPixelRatio(), this.camera.fov);
  }

  private frame() {
    this.timer.update();
    this.input.poll();
    const dt = Math.min(this.timer.getDelta(), 0.05) * this.timeScale;
    if (this.state !== 'paused') this.time += dt;

    if (this.state === 'playing') this.updateRound(dt);
    if (this.state !== 'paused') {
      this.field.update(dt);
      this.effects.update(dt);
    }
    if (this.state === 'menu' || this.state === 'results') this.updateMenuCamera();

    this.space.follow(this.camera);
    this.composer.render();
  }

  private updateRound(dt: number) {
    const me = this.me!;
    const now = this.time;

    const myControls = this.flightComputer(this.input.read(dt));
    for (const ship of this.ships) {
      if (!ship.alive) {
        if (now < ship.respawnAt) continue;
        if (ship !== me) this.respawn(ship);
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

    if (me.alive && me.outsideSince !== null) {
      this.hud.flashMessage(now, `Return to the field — ${Math.max(0, ARENA_GRACE - (now - me.outsideSince)).toFixed(1)}s`, 0.2);
    } else if (this.flipAssist) {
      this.hud.flashMessage(now, 'Flip', 0.2);
    }
    if (now >= this.roundEndsAt) this.endRound();
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
    this.effects.beam(shooter.muzzle(this.shotCounter++, scratch), end, shooter.color);
    if (shooter.isLocal) this.sound.play('laser', { volume: 0.7 });

    for (const ship of this.ships) {
      if (ship === shooter || !ship.alive) continue;
      const distance = raySphere(origin, direction, ship.flight.position, ship.radius);
      if (distance === null || distance > beamLength) continue;
      const { status, zone } = ship.laserHit(origin, direction, this.time);
      if (status === 'protected') continue;
      this.effects.sparks(scratch.copy(origin).addScaledVector(direction, distance), shooter.color, 60);
      if (shooter.isLocal) {
        this.hud.hit();
        this.sound.beep(zone === 'reactor' ? 1760 : 1320);
      }
      if (ship.isLocal) {
        this.hud.damaged();
        this.hud.flashMessage(this.time, ZONE_MESSAGES[zone], 1.5);
        this.sound.play('explosion', { volume: 1.2, rate: 1.5 });
        this.sound.beep(220, 0.25, 0.12);
      }
      if (status === 'destroyed') this.shipDestroyed(ship, shooter);
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
      if (destroyed) {
        shooter.score += ASTEROID_POINTS[destroyed.generation];
        this.effects.explosion(destroyed.object.position, destroyed.meanRadius * 0.6, destroyed.velocity);
        this.hearDebris(destroyed.object.position, destroyed.meanRadius);
        if (shooter.isLocal) {
          this.hud.hit();
          this.hud.flashMessage(this.time, `Asteroid cracked +${ASTEROID_POINTS[destroyed.generation]}`, 1.5);
        }
      }
    }
  }

  private shipDestroyed(victim: Ship, killer: Ship | null) {
    victim.respawnAt = this.time + RESPAWN_SECONDS;
    if (victim.isLocal) this.flipAssist = false;
    this.effects.explosion(victim.flight.position, victim.radius * 2, victim.flight.velocity.clone().multiplyScalar(0.3));
    this.wrecks.spawn(victim.id, victim.deaths, victim.flight.position, victim.flight.velocity, victim.radius, this.time);
    if (victim.isLocal) this.sound.play('explosion', { volume: 1.6, rate: 0.6 });
    else this.hearDebris(victim.flight.position, victim.radius);
    if (killer) {
      killer.kills++;
      killer.score += KILL_POINTS;
      if (killer.isLocal) {
        this.sound.beep(1320, 0.07, 0.15);
        this.sound.beep(1760, 0.12, 0.15, 0.09);
      }
    }
    this.hud.kill(this.time, killer?.name ?? (victim.outsideSince !== null ? 'Deep space' : 'Asteroid'), victim.name);
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
