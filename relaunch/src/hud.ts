import * as THREE from 'three';
import { LASER_CAPACITY, LASER_SHOT_COST, MAX_SHIELD, type Ship } from './ship';
import { FlightModel } from './flight';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const projected = new THREE.Vector3();
const KILLFEED_SECONDS = 5;

export class Hud {
  private readonly root = $('hud');
  private readonly time = $('hud-time');
  private readonly score = $('hud-score');
  private readonly shield = $('hud-shield');
  private readonly laser = $('hud-laser');
  private readonly speed = $('hud-speed');
  private readonly message = $('hud-message');
  private readonly hitmarker = $('hitmarker');
  private readonly damageFlash = $('damage-flash');
  private readonly killfeed = $('killfeed');
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
  }

  update(now: number, secondsLeft: number, me: Ship) {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = Math.floor(secondsLeft % 60);
    this.time.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
    this.score.textContent = `${me.score} pts`;
    this.shield.style.width = `${(me.shield / MAX_SHIELD) * 100}%`;
    this.shield.classList.toggle('low', me.shield < 35);
    this.laser.style.width = `${(me.laser / LASER_CAPACITY) * 100}%`;
    this.laser.classList.toggle('empty', me.laser < LASER_SHOT_COST);
    this.speed.style.width = `${(me.flight.speed / FlightModel.maxSpeed) * 100}%`;

    if (!me.alive) this.message.textContent = `Destroyed — respawn in ${Math.max(0, me.respawnAt - now).toFixed(1)}s`;
    else if (now > this.messageUntil) this.message.textContent = '';

    for (const item of [...this.killfeed.children] as HTMLElement[]) {
      if (now - Number(item.dataset.at) > KILLFEED_SECONDS) item.remove();
    }
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

  /** Marks other ships with their name; ships off screen get an arrow at the screen edge. */
  updateMarkers(camera: THREE.Camera, ships: Ship[], me: Ship) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const seen = new Set<string>();
    for (const ship of ships) {
      if (ship === me || !ship.alive) continue;
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
