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
import { Input, type Action, type Controls } from './input';
import { Ship } from './ship';
import { Space } from './space';

const ROUND_SECONDS = 5 * 60;
const FIELD_LEVEL = 11;
const BOT_COUNT = 3;
const LASER_RANGE = 60000;
const LASER_DAMAGE = 34;
const KILL_POINTS = 500;
const COLLISION_DAMAGE = 25;
const RESPAWN_SECONDS = 3;
/** Beyond this distance from the center, ships are steered back into the arena. */
const ARENA_LIMIT = FIELD_RADIUS * 1.6;
const ARENA_WARNING = FIELD_RADIUS * 1.35;
const BEST_SCORE_KEY = 'solartournament.best';
const CALLSIGN_KEY = 'solartournament.callsign';

type State = 'menu' | 'playing' | 'paused' | 'results';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const IDLE: Controls = { yaw: 0, pitch: 0, boost: false, brake: false, fire: false };

const scratch = new THREE.Vector3();
const forward = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();

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
    container.append(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.88));
    this.composer.addPass(new OutputPass());

    this.scene.background = new THREE.Color(0x01020a);
    this.field = new AsteroidField(assets.asteroids);
    this.effects = new Effects(assets.textures);
    this.scene.add(this.space.sky, this.space.lights, this.field.group, this.effects.group);

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
        if (action === 'pause' || action === 'pointer-released') this.pause();
        if (action === 'camera') this.cockpit = !this.cockpit;
        break;
      case 'paused':
        if (action === 'confirm') this.resume();
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
    this.hud.show(state === 'playing');
  }

  private showMenu() {
    this.clearShips();
    this.field.generate(FIELD_LEVEL);
    const best = Number(storageGet(BEST_SCORE_KEY) ?? 0);
    $('best-score').textContent = best ? `Personal best: ${best} pts` : '';
    this.setScreen('menu');
    this.input.releasePointer();
  }

  private clearShips() {
    for (const ship of this.ships) this.scene.remove(ship.root);
    this.ships = [];
    this.bots = [];
    this.me = null;
  }

  private startRound() {
    const callsign = $<HTMLInputElement>('callsign').value.trim() || 'Pilot';
    storageSet(CALLSIGN_KEY, callsign);

    this.clearShips();
    this.field.generate(FIELD_LEVEL);
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
    this.setScreen('playing');
    this.input.resetMouse();
    this.input.lockPointer();
    this.hud.flashMessage(this.time, 'Click to steer with the mouse', 4);
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
      if (!this.field.overlap(position, ship.radius * 4)) break;
    }
    const look = new THREE.Matrix4().lookAt(position, scratch.set(0, 0, 0), new THREE.Vector3(0, 1, 0));
    ship.spawn(position, new THREE.Quaternion().setFromRotationMatrix(look), this.time);
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

    const myControls = this.input.read(dt);
    for (const ship of this.ships) {
      if (!ship.alive) {
        if (now >= ship.respawnAt) this.respawn(ship);
        continue;
      }
      const bot = this.bots.find((b) => b.ship === ship);
      const controls = ship === me ? myControls : bot ? bot.think(now, this.ships, this.field) : IDLE;
      if (ship.update(dt, now, controls)) this.fireLaser(ship);
      this.keepInArena(ship, dt);
      this.collide(ship, now);
      if (ship.flight.throttle > 0.55) {
        this.effects.engineTrail(scratch.set(0, 0, ship.radius * 0.9).applyQuaternion(ship.flight.orientation).add(ship.flight.position), ship.flight.velocity, ship.flight.throttle);
      }
    }

    this.updateCamera(dt);
    me.root.visible = me.alive && !this.cockpit;
    this.hud.update(now, Math.max(0, this.roundEndsAt - now), me);
    this.hud.updateMarkers(this.camera, this.ships, me);

    if (me.alive && me.flight.position.length() > ARENA_WARNING) this.hud.flashMessage(now, 'Leaving the arena', 0.2);
    if (now >= this.roundEndsAt) this.endRound();
  }

  /** Hitscan laser: hits the first asteroid or ship along the beam, up to LASER_RANGE. */
  private fireLaser(shooter: Ship) {
    const origin = shooter.muzzle(this.shotCounter++, muzzle);
    const direction = shooter.flight.forward(forward);

    let hitDistance = LASER_RANGE;
    let hitShip: Ship | null = null;
    const asteroidHit = this.field.raycast(origin, direction, LASER_RANGE);
    if (asteroidHit) hitDistance = asteroidHit.distance;
    for (const ship of this.ships) {
      if (ship === shooter || !ship.alive) continue;
      const distance = raySphere(origin, direction, ship.flight.position, ship.radius);
      if (distance !== null && distance < hitDistance) {
        hitDistance = distance;
        hitShip = ship;
      }
    }

    const end = scratch.copy(origin).addScaledVector(direction, hitDistance);
    this.effects.beam(origin, end, shooter.color);
    const listener = this.camera.position;
    this.sound.play('laser', { volume: shooter.isLocal ? 0.5 : 0.8, at: origin, listener });

    if (hitShip) {
      this.effects.sparks(end, shooter.color, 60);
      const result = hitShip.damage(LASER_DAMAGE, this.time);
      if (result !== 'protected') {
        if (shooter.isLocal) this.hud.hit();
        if (hitShip.isLocal) this.hud.damaged();
      }
      if (result === 'destroyed') this.shipDestroyed(hitShip, shooter);
    } else if (asteroidHit) {
      this.effects.sparks(end, shooter.color, 40);
      const asteroid = this.field.destroy(asteroidHit.asteroid.id);
      if (asteroid) {
        shooter.score += ASTEROID_POINTS[asteroid.generation];
        this.effects.explosion(asteroid.object.position, asteroid.radius, asteroid.velocity);
        this.sound.play('explosion', { volume: 1, rate: 1.2 - asteroid.generation * 0.15, at: end, listener });
        if (shooter.isLocal) this.hud.hit();
      }
    }
  }

  private shipDestroyed(victim: Ship, killer: Ship | null) {
    victim.respawnAt = this.time + RESPAWN_SECONDS;
    this.effects.explosion(victim.flight.position, victim.radius * 2, victim.flight.velocity.clone().multiplyScalar(0.3));
    this.sound.play('explosion', { volume: 1.4, rate: 0.7, at: victim.flight.position, listener: this.camera.position });
    if (killer) {
      killer.kills++;
      killer.score += KILL_POINTS;
    }
    this.hud.kill(this.time, killer?.name ?? 'Asteroid', victim.name);
  }

  /** Ship vs asteroid: damage and push the ship out of the rock. */
  private collide(ship: Ship, now: number) {
    const asteroid = this.field.overlap(ship.flight.position, ship.radius);
    if (!asteroid) return;
    const normal = scratch.subVectors(ship.flight.position, asteroid.object.position).normalize();
    ship.flight.position.copy(asteroid.object.position).addScaledVector(normal, asteroid.radius + ship.radius + 5);
    ship.flight.steerTowards(muzzle.copy(ship.flight.position).addScaledVector(normal, 10000), 0.5);
    this.effects.sparks(ship.flight.position, new THREE.Color(1, 0.7, 0.3), 80);
    this.sound.play('explosion', { volume: 0.5, rate: 1.6, at: ship.flight.position, listener: this.camera.position });
    const result = ship.damage(COLLISION_DAMAGE, now);
    if (ship.isLocal && result !== 'protected') this.hud.damaged();
    if (result === 'destroyed') this.shipDestroyed(ship, null);
  }

  private keepInArena(ship: Ship, dt: number) {
    if (ship.flight.position.length() > ARENA_LIMIT) ship.flight.steerTowards(scratch.set(0, 0, 0), 1 - Math.exp(-2 * dt));
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
