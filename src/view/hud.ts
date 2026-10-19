import * as THREE from 'three';
import { MAX_HEAT, MAX_HULL, type Ship } from '../ship/ship';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const projected = new THREE.Vector3();
const KILLFEED_SECONDS = 5;
/** Display scale: one world unit is 5 cm, a ship is about 35 m long. */
const METERS_PER_UNIT = 0.05;

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
  private readonly vignette = $('g-vignette');
  private readonly speed = $('hud-speed');
  private readonly prograde = $('prograde');
  private readonly retrograde = $('retrograde');
  private readonly message = $('hud-message');
  private readonly hitmarker = $('hitmarker');
  private readonly damageFlash = $('damage-flash');
  private readonly killfeed = $('killfeed');
  private readonly schoolPanel = $('school-panel');
  private readonly schoolStep = $('school-step');
  private readonly schoolText = $('school-text');
  private readonly schoolKeys = $('school-keys');
  private readonly waypoint = $('waypoint');
  private readonly markers = new Map<string, HTMLElement>();
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
  }

  reset() {
    this.killfeed.replaceChildren();
    this.markerLayer.replaceChildren();
    this.markers.clear();
    this.message.textContent = '';
    this.setSchool(null);
    this.waypoint.hidden = true;
  }

  /** secondsLeft is Infinity in rounds without a time limit. */
  update(now: number, secondsLeft: number, me: Ship) {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = Math.floor(secondsLeft % 60);
    this.time.textContent = Number.isFinite(secondsLeft) ? `${minutes}:${String(seconds).padStart(2, '0')}` : '';
    this.score.textContent = `${me.score} pts`;
    setBar(this.hull, me.hull / MAX_HULL);
    setBar(this.drive, me.drive);
    setBar(this.thrusters, me.thrusters);
    this.heat.style.width = `${Math.min(1, me.heat / MAX_HEAT) * 100}%`;
    this.heat.classList.toggle('overheated', me.overheated);
    this.shadow.hidden = !me.alive || !me.inShadow;
    this.speed.textContent = `${Math.round(me.flight.velocity.length() * METERS_PER_UNIT)} m/s`;

    if (!me.alive) this.message.textContent = 'Live link lost';
    else if (now > this.messageUntil) this.message.textContent = '';

    for (const item of [...this.killfeed.children] as HTMLElement[]) {
      if (now - Number(item.dataset.at) > KILLFEED_SECONDS) item.remove();
    }
  }

  /** Flight school instruction; null hides the panel. */
  setSchool(status: { step: string; text: string; keys: string[] } | null) {
    this.schoolPanel.hidden = !status;
    if (!status) return;
    if (this.schoolStep.textContent !== status.step) this.schoolStep.textContent = status.step;
    if (this.schoolText.textContent !== status.text) this.schoolText.textContent = status.text;
    const keys = status.keys.join('|');
    if (this.schoolKeys.dataset.keys !== keys) {
      this.schoolKeys.dataset.keys = keys;
      this.schoolKeys.replaceChildren(...status.keys.map((key) => Object.assign(document.createElement('kbd'), { textContent: key })));
    }
  }

  /** Blinking diamond on a point in space, clamped to the screen edge when off screen. */
  setWaypoint(camera: THREE.Camera, point: THREE.Vector3 | null) {
    this.waypoint.hidden = !point;
    if (!point) return;
    projected.copy(point).project(camera);
    let { x, y } = projected;
    const behind = projected.z > 1;
    if (behind) {
      x = -x;
      y = -y;
    }
    // points behind the camera always sit on the edge
    const scale = 1 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.85, behind ? 1e-6 : 1);
    this.waypoint.style.translate = `${((x * scale + 1) / 2) * window.innerWidth}px ${((1 - y * scale) / 2) * window.innerHeight}px`;
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

  kill(now: number, killer: string, victim: string) {
    const item = document.createElement('li');
    item.dataset.at = String(now);
    const k = document.createElement('b');
    k.textContent = killer;
    item.append(k, ' ✦ ', victim);
    this.killfeed.prepend(item);
  }

  /**
   * Prograde marker where the ship is drifting to, retrograde marker where to point the
   * drive to brake.
   */
  updateVelocityMarkers(camera: THREE.Camera, me: Ship) {
    const velocity = me.flight.velocity;
    const show = me.alive && velocity.lengthSq() > 400;
    for (const [element, sign] of [[this.prograde, 1], [this.retrograde, -1]] as const) {
      projected.copy(velocity).normalize().multiplyScalar(sign * 100000).add(camera.position).project(camera);
      const visible = show && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
      element.hidden = !visible;
      if (visible) element.style.transform = `translate(${((projected.x + 1) / 2) * window.innerWidth}px, ${((1 - projected.y) / 2) * window.innerHeight}px)`;
    }
  }

  /** Marks other ships in line of sight with their name; ships off screen get an arrow at the screen edge. */
  updateMarkers(camera: THREE.Camera, ships: Ship[], me: Ship, visible: (ship: Ship) => boolean) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const seen = new Set<string>();
    for (const ship of ships) {
      if (ship === me || !ship.alive || !visible(ship)) continue;
      seen.add(ship.id);
      let marker = this.markers.get(ship.id);
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'marker';
        marker.style.setProperty('--tint', '#' + ship.color.getHexString());
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
      const distance = Math.round(ship.flight.position.distanceTo(me.flight.position) / 100) / 10;
      marker.classList.toggle('offscreen', offscreen);
      marker.style.transform = `translate(${((x + 1) / 2) * width}px, ${((1 - y) / 2) * height}px)`;
      if (offscreen) marker.style.setProperty('--angle', `${Math.atan2(-y, x)}rad`);
      marker.textContent = offscreen ? '' : `${ship.name} · ${distance}k`;
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
