import * as THREE from 'three';
import { MAX_HEAT, MAX_HULL, type Ship } from '../ship/ship';
import { keyLabel } from '../input/input';
import { markedName, type Kind } from './marks';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const projected = new THREE.Vector3();
/** Kills stay in the feed this long (s). */
const KILLFEED_SECONDS = 5;
/** Display scale: one world unit is 5 cm, a ship is about 35 m long. */
export const METERS_PER_UNIT = 0.05;
/** The size of the window, as Game.resize last set it: reading it from the window after the HUD wrote to the page would force a layout. */
const viewport = { width: window.innerWidth, height: window.innerHeight };

export class Hud {
  private readonly root = $('hud');
  private readonly time = $('hud-time');
  private readonly score = $('hud-score');
  private readonly hull = $('hud-hull');
  private readonly drive = $('hud-drive');
  private readonly thrusters = $('hud-thrusters');
  private readonly heat = $('hud-heat');
  private readonly shadow = $('hud-shadow');
  private readonly warning = $('hud-warning');
  private readonly lock = $('hud-lock');
  private readonly vignette = $('g-vignette');
  private readonly speed = $('hud-speed');
  private readonly mode = $('hud-mode');
  private readonly overdrive = $('hud-overdrive');
  private readonly hook = $('hud-hook');
  private readonly torpedo = $('hud-torpedo');
  private readonly prograde = $('prograde');
  private readonly retrograde = $('retrograde');
  private readonly message = $('hud-message');
  private readonly countdownText = $('hud-countdown');
  private readonly splitText = $('hud-split');
  private splitUntil = 0;
  private readonly hitmarker = $('hitmarker');
  private readonly damageFlash = $('damage-flash');
  private readonly killfeed = $('killfeed');
  private readonly schoolPanel = $('school-panel');
  private readonly schoolStep = $('school-step');
  private readonly schoolText = $('school-text');
  private readonly schoolKeys = $('school-keys');
  private readonly waypoint = $('waypoint');
  private readonly crosshair = $('crosshair');
  private readonly waypointLabel = $('waypoint-label');
  private readonly center = $('center');
  private readonly centerDistance = $('center-distance');
  private readonly markers = new Map<string, HTMLElement>();
  /** Ships marked this frame, reused from frame to frame. */
  private readonly seen = new Set<string>();
  private readonly markerLayer = document.createElement('div');
  private messageUntil = 0;
  private hitmarkerTimer = 0;
  private flashTimer = 0;

  constructor() {
    this.markerLayer.className = 'markers';
    this.root.prepend(this.markerLayer);
  }

  show(visible: boolean) {
    this.root.hidden = !visible;
    // a hidden HUD cancels the popups' animation without ending it: they would replay later
    if (!visible) this.clearPopups();
  }

  /** The window's new size (see viewport). */
  setViewport(width: number, height: number) {
    viewport.width = width;
    viewport.height = height;
  }

  /** The crosshair shows while the own clone flies. */
  showCrosshair(visible: boolean) {
    setHidden(this.crosshair, !visible);
    setHidden(this.hitmarker, !visible);
  }

  private clearPopups() {
    for (const popup of this.root.querySelectorAll('.popup')) popup.remove();
  }

  reset() {
    this.killfeed.replaceChildren();
    this.clearPopups();
    this.setLock('', null);
    this.markerLayer.replaceChildren();
    this.markers.clear();
    this.message.textContent = '';
    this.countdownText.textContent = '';
    this.splitText.textContent = '';
    this.setSchool(null);
    this.waypoint.hidden = true;
    this.center.hidden = true;
  }

  /** secondsLeft is Infinity in rounds without a time limit. */
  update(now: number, secondsLeft: number, me: Ship) {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = Math.floor(secondsLeft % 60);
    setText(this.time, Number.isFinite(secondsLeft) ? `${minutes}:${String(seconds).padStart(2, '0')}` : '');
    setText(this.score, `${me.score} pts`);
    setBar(this.hull, me.hull / MAX_HULL);
    setBar(this.drive, me.drive);
    setBar(this.thrusters, me.thrusters);
    this.heat.style.width = `${Math.min(1, me.heat / MAX_HEAT) * 100}%`;
    this.heat.classList.toggle('overheated', me.overheated);
    setHidden(this.shadow, !me.alive || !me.inShadow);
    // at the tournament's speed limit the readout says so: the drive is held back
    setText(this.speed, `${Math.round(me.flight.velocity.length() * METERS_PER_UNIT)} m/s${me.flight.limited ? ' · MAX' : ''}`);

    if (!me.alive) setText(this.message, 'Live link lost');
    else if (now > this.messageUntil) setText(this.message, '');
    if (now > this.splitUntil) setText(this.splitText, '');

    // the newest entries come first: expired ones are at the end
    let item = this.killfeed.lastElementChild as HTMLElement | null;
    while (item && now - Number(item.dataset.at) > KILLFEED_SECONDS) {
      const previous = item.previousElementSibling as HTMLElement | null;
      item.remove();
      item = previous;
    }
  }

  /** Flight school instruction; null hides the panel. Keys of the keyboard are named as the Host's layout prints them, gamepad buttons as they are. */
  setSchool(status: { step: string; text: string; keys: string[] } | null, keyboard = true) {
    this.schoolPanel.hidden = !status;
    if (!status) return;
    if (this.schoolStep.textContent !== status.step) this.schoolStep.textContent = status.step;
    if (this.schoolText.textContent !== status.text) this.schoolText.textContent = status.text;
    const keys = `${keyboard}|${status.keys.join('|')}`;
    if (this.schoolKeys.dataset.keys !== keys) {
      this.schoolKeys.dataset.keys = keys;
      this.schoolKeys.replaceChildren(...status.keys.map((key) => Object.assign(document.createElement('kbd'), { textContent: keyboard ? keyLabel(key) : key })));
    }
  }

  /** A short word or number floating up from a point in space: a hit, a kill, points. */
  popup(camera: THREE.Camera, point: THREE.Vector3, text: string, kind: 'hit' | 'armor' | 'kill' | 'points') {
    projected.copy(point).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return;
    const popup = document.createElement('div');
    popup.className = `popup ${kind}`;
    popup.textContent = text;
    popup.style.translate = `${((projected.x + 1) / 2) * viewport.width}px ${((1 - projected.y) / 2) * viewport.height}px`;
    popup.addEventListener('animationend', () => popup.remove());
    this.root.append(popup);
  }

  /** The crosshair glows orange while the laser would hit a drive, and dims over armor, where a shot does little. */
  setOnTarget(hit: 'drive' | 'armor' | null) {
    const drive = hit === 'drive';
    const armor = hit === 'armor';
    if (this.crosshair.classList.contains('on-target') !== drive) this.crosshair.classList.toggle('on-target', drive);
    if (this.crosshair.classList.contains('on-armor') !== armor) this.crosshair.classList.toggle('on-armor', armor);
  }

  /** The crosshair and the hit marker sit where the nose points (see Game.aimCrosshair). */
  setCrosshair(camera: THREE.Camera, point: THREE.Vector3) {
    pin(this.crosshair, camera, point);
    pin(this.hitmarker, camera, point);
  }

  /** Blinking diamond on a point in space with what it is, clamped to the screen edge when off screen. */
  setWaypoint(camera: THREE.Camera, point: THREE.Vector3 | null, label = '') {
    setHidden(this.waypoint, !point);
    if (!point) return;
    setText(this.waypointLabel, label);
    pin(this.waypoint, camera, point);
  }

  /** The overdrive next to the flight mode: ready, or the seconds until it is. */
  setOverdrive(seconds: number) {
    setText(this.overdrive, seconds > 0 ? `Overdrive ${Math.ceil(seconds)} s` : 'Overdrive ready');
    if (this.overdrive.classList.contains('ready') !== (seconds <= 0)) this.overdrive.classList.toggle('ready', seconds <= 0);
  }

  /** The hook: holding with so much cable out (m), recharging for `seconds`, or ready. */
  setHook(cable: number | null, seconds: number) {
    setText(this.hook, cable !== null ? `Hooked · ${Math.round(cable)} m` : seconds > 0 ? `Hook ${seconds.toFixed(1)} s` : 'Hook ready');
    const state = cable !== null ? 'held' : seconds > 0 ? '' : 'ready';
    if (this.hook.className !== `readout ${state}`.trim()) this.hook.className = `readout ${state}`.trim();
  }

  /** The torpedoes left and the items held, each with what it does, next to the overdrive. */
  setArsenal(torpedoes: number, twin: boolean, plating: number, nova: boolean) {
    const items = `${twin ? ' · Twin: fires twice as fast' : ''}${plating ? ` · Plating ${plating}: stops hits` : ''}${nova ? ' · Nova: next shot blows up everything around' : ''}`;
    setText(this.torpedo, `${torpedoes > 0 ? `Torpedo ${torpedoes}` : 'No torpedo'}${items}`);
    if (this.torpedo.classList.contains('ready') !== torpedoes > 0) this.torpedo.classList.toggle('ready', torpedoes > 0);
  }

  /** The flight mode next to the velocity: AUTOPILOT in blue, FREE DRIFT in orange. */
  setAutopilot(on: boolean) {
    if (this.mode.classList.contains('free') !== on) return;
    this.mode.textContent = on ? 'Autopilot' : 'Free drift';
    this.mode.classList.toggle('free', !on);
  }

  /**
   * The zero point: the center of the field, where the asteroids are densest and the arena
   * ends farthest away, with its distance. Always on screen, at the edge when behind.
   */
  setCenter(camera: THREE.Camera, me: Ship) {
    this.center.hidden = !me.alive;
    if (!me.alive) return;
    pin(this.center, camera, origin);
    setText(this.centerDistance, `Center · ${meters(me.flight.position.length())}`);
  }

  /** Persistent warning below the crosshair (impact, overheating); empty text hides it. */
  setWarning(text: string) {
    if (this.warning.textContent !== text) this.warning.textContent = text;
  }

  /** Tunnel vision under sustained acceleration, 0..1. */
  setStrain(strain: number) {
    this.vignette.style.opacity = String(strain);
    this.vignette.style.setProperty('--tunnel', `${Math.round(70 - strain * 45)}%`);
  }

  /** A split or lap time against the best lap, for a few seconds: ahead in green, behind in red, without a best in white. */
  split(now: number, text: string, ahead: boolean | null, seconds = 3) {
    setText(this.splitText, text);
    this.splitText.classList.toggle('ahead', ahead === true);
    this.splitText.classList.toggle('behind', ahead === false);
    this.splitUntil = now + seconds;
  }

  /** A number of a race's countdown, or GO, in big neon: it pops in and fades out by itself. */
  countdown(text: string) {
    const element = this.countdownText;
    element.textContent = text;
    element.classList.remove('pop');
    // a reflow between removing and adding the class restarts the animation
    void element.offsetWidth;
    element.classList.add('pop');
  }

  flashMessage(now: number, text: string, seconds = 2) {
    this.message.textContent = text;
    this.messageUntil = now + seconds;
  }

  hit() {
    this.hitmarker.classList.add('on');
    clearTimeout(this.hitmarkerTimer);
    this.hitmarkerTimer = window.setTimeout(() => this.hitmarker.classList.remove('on'), 80);
  }

  damaged() {
    this.damageFlash.classList.add('on');
    clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.damageFlash.classList.remove('on'), 60);
  }

  /** A line in the kill feed: who (a ship, or what killed it), and whom, each behind its mark. */
  kill(now: number, killer: { kind: Kind; name: string }, victim: { kind: Kind; name: string }) {
    const item = document.createElement('li');
    item.dataset.at = String(now);
    const k = document.createElement('b');
    k.append(...markedName(killer.kind, killer.name));
    item.append(k, ' ✦ ', ...markedName(victim.kind, victim.name));
    this.killfeed.prepend(item);
  }

  /** The lock warning below the other warnings: what the shooter does, and who it is, behind its mark. */
  setLock(text: string, shooter: { kind: Kind; name: string } | null) {
    const key = shooter ? `${text}|${shooter.kind}|${shooter.name}` : '';
    if (this.lock.dataset.key === key) return;
    this.lock.dataset.key = key;
    this.lock.replaceChildren(...(shooter ? [`${text} · `, ...markedName(shooter.kind, shooter.name)] : []));
    this.lock.hidden = !shooter;
  }

  /**
   * Prograde marker where the ship is drifting to, retrograde marker where to point the
   * drive to brake.
   */
  updateVelocityMarkers(camera: THREE.Camera, me: Ship) {
    const velocity = me.flight.velocity;
    const show = me.alive && velocity.lengthSq() > 400;
    placeVelocityMarker(this.prograde, camera, velocity, 1, show);
    placeVelocityMarker(this.retrograde, camera, velocity, -1, show);
  }

  /** Marks other ships in line of sight with their name; ships off screen get an arrow at the screen edge. */
  updateMarkers(camera: THREE.Camera, ships: Ship[], me: Ship, visible: (ship: Ship) => boolean) {
    const { width, height } = viewport;
    const seen = this.seen;
    seen.clear();
    for (const ship of ships) {
      if (ship === me || !ship.alive || !visible(ship)) continue;
      seen.add(ship.id);
      let marker = this.markers.get(ship.id);
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'marker';
        marker.style.setProperty('--tint', '#' + ship.color.getHexString());
        // the mark and the name stay; only the distance behind them changes from frame to frame
        const distance = document.createElement('span');
        marker.append(...markedName(ship.kind, ship.name), distance);
        this.markerLayer.append(marker);
        this.markers.set(ship.id, marker);
      }
      projected.copy(ship.flight.position).project(camera);
      const behind = projected.z > 1;
      let x = projected.x;
      let y = projected.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const offscreen = behind || Math.abs(x) > 0.95 || Math.abs(y) > 0.8;
      if (offscreen) {
        const scale = 1 / Math.max(Math.abs(x) / 0.95, Math.abs(y) / 0.8, 1e-6);
        x *= scale;
        y *= scale;
      }
      marker.classList.toggle('offscreen', offscreen);
      marker.style.transform = `translate(${((x + 1) / 2) * width}px, ${((1 - y) / 2) * height}px)`;
      if (offscreen) marker.style.setProperty('--angle', `${Math.atan2(-y, x)}rad`);
      setText(marker.lastElementChild as HTMLElement, ` · ${meters(ship.flight.position.distanceTo(me.flight.position))}`);
    }
    for (const [id, marker] of this.markers) {
      if (seen.has(id)) continue;
      marker.remove();
      this.markers.delete(id);
    }
  }
}

function setBar(bar: HTMLElement, fraction: number) {
  bar.style.width = `${Math.max(0, fraction) * 100}%`;
  bar.classList.toggle('low', fraction < 0.35);
}

const origin = new THREE.Vector3();

/** Places a marker on a point in space, clamped to the screen edge when off screen or behind. */
function pin(element: HTMLElement, camera: THREE.Camera, point: THREE.Vector3) {
  projected.copy(point).project(camera);
  let { x, y } = projected;
  const behind = projected.z > 1;
  if (behind) {
    x = -x;
    y = -y;
  }
  // points behind the camera always sit on the edge
  const scale = 1 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.85, behind ? 1e-6 : 1);
  element.style.translate = `${((x * scale + 1) / 2) * viewport.width}px ${((1 - y * scale) / 2) * viewport.height}px`;
}

/** A distance in world units as the HUD shows it: meters, kilometers from 1000 m on. */
export function meters(units: number): string {
  const m = units * METERS_PER_UNIT;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Writes text only when it changed, so an unchanged HUD costs the browser no layout work. */
function setText(element: HTMLElement, text: string) {
  if (element.textContent !== text) element.textContent = text;
}

function setHidden(element: HTMLElement, hidden: boolean) {
  if (element.hidden !== hidden) element.hidden = hidden;
}

const ahead = new THREE.Vector3();

/** The prograde (sign 1) or retrograde (sign -1) marker, where the ship drifts to or from. */
function placeVelocityMarker(element: HTMLElement, camera: THREE.Camera, velocity: THREE.Vector3, sign: number, show: boolean) {
  ahead.copy(velocity).normalize().multiplyScalar(sign * 100000).add(camera.position).project(camera);
  const visible = show && ahead.z < 1 && Math.abs(ahead.x) < 1 && Math.abs(ahead.y) < 1;
  setHidden(element, !visible);
  if (visible) element.style.transform = `translate(${((ahead.x + 1) / 2) * viewport.width}px, ${((1 - ahead.y) / 2) * viewport.height}px)`;
}
