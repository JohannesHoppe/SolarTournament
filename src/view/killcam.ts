import * as THREE from 'three';
import type { Ship } from '../ship/ship';
import type { Effects } from './effects';
import { TOURNAMENT_SIZE } from '../net/session';

/** Frames the kill cam keeps: four seconds at 60 frames a second, more on slower devices. */
const FRAMES = 240;
/** Frames come at most this often (s, 60 a second, with room for jitter): a 144 Hz screen keeps the same four seconds. */
const MIN_FRAME_GAP = 1 / 64;
/** Ships a frame holds at most: a full tournament, a watching Host's clone, and the flight school's drone and sparring bot. */
const MAX_SHIPS = TOURNAMENT_SIZE + 3;
/** Beams the kill cam keeps. */
const MAX_BEAMS = 64;
/** The replay shows the last WINDOW seconds before the kill at SPEED: slow motion, REPLAY_SECONDS long, no longer than the next clone takes to print (see RESPAWN_SECONDS), so a Host who watches it to its end waits no longer than a bot. */
const WINDOW = 2;
const SPEED = 2 / 3;
export const REPLAY_SECONDS = WINDOW / SPEED;
/** Floats per ship and frame: position, orientation, alive. */
const STRIDE = 8;

const position = new THREE.Vector3();
const orientation = new THREE.Quaternion();
const to = new THREE.Vector3();
const offset = new THREE.Vector3();
const between = new THREE.Vector3();
const turned = new THREE.Quaternion();

type Frame = { time: number; ships: (Ship | null)[]; data: Float32Array };
type Beam = { time: number; from: THREE.Vector3; to: THREE.Vector3; color: THREE.Color };
type Replay = { killer: Ship; victim: Ship; start: number; end: number; startedAt: number; lastBeam: number; loop: boolean };

/**
 * The kill cam: the game keeps the last few seconds of every ship's flight and every beam;
 * when the own clone is shot down, the moments before the kill play again in slow motion,
 * seen from behind the shooter, with its beams. It only moves the ships' pictures, never the
 * ships, so the round goes on underneath; the live effects are hidden meanwhile.
 */
export class KillCam {
  private readonly frames: Frame[] = Array.from({ length: FRAMES }, () => ({ time: -Infinity, ships: new Array(MAX_SHIPS).fill(null), data: new Float32Array(MAX_SHIPS * STRIDE) }));
  private next = 0;
  private readonly beams: Beam[] = Array.from({ length: MAX_BEAMS }, () => ({ time: -Infinity, from: new THREE.Vector3(), to: new THREE.Vector3(), color: new THREE.Color() }));
  private nextBeam = 0;
  /** The running replay: whom it follows, the span of the past it shows, when it started (real time), and whether it starts over at its end. */
  private replay: Replay | null = null;
  /** The last replay that ran to its end, kept for the sponsor break (see again). */
  private kept: Replay | null = null;
  /** Where the ships really are, kept while the replay borrows their pictures (`savedCount` of them). */
  private readonly saved = Array.from({ length: MAX_SHIPS }, () => ({ ship: null as Ship | null, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), visible: false }));
  private savedCount = 0;

  constructor(private readonly effects: Effects) {}

  get active() {
    return this.replay !== null;
  }

  /**
   * Keeps this frame's ships, at game time `time`; at most 60 frames a second, so fast screens
   * keep the same span. Nothing is kept while a replay runs or waits for the sponsor break, so
   * the moments before the kill stay.
   */
  record(time: number, ships: readonly Ship[]) {
    if (this.replay || this.kept) return;
    const last = this.frames[(this.next + FRAMES - 1) % FRAMES];
    if (time - last.time < MIN_FRAME_GAP) return;
    const frame = this.frames[this.next];
    this.next = (this.next + 1) % FRAMES;
    frame.time = time;
    for (let i = 0; i < MAX_SHIPS; i++) {
      const ship = ships[i] ?? null;
      frame.ships[i] = ship;
      if (!ship) continue;
      const f = ship.flight;
      const d = frame.data;
      const at = i * STRIDE;
      f.position.toArray(d, at);
      f.orientation.toArray(d, at + 3);
      d[at + 7] = ship.alive ? 1 : 0;
    }
  }

  /** Keeps a beam, at game time `time`. */
  recordBeam(time: number, start: THREE.Vector3, end: THREE.Vector3, color: THREE.Color) {
    if (this.replay || this.kept) return;
    const beam = this.beams[this.nextBeam];
    this.nextBeam = (this.nextBeam + 1) % MAX_BEAMS;
    beam.time = time;
    beam.from.copy(start);
    beam.to.copy(end);
    beam.color.copy(color);
  }

  /** The own clone was shot down at game time `time`: replays the moments before. */
  start(killer: Ship, victim: Ship, time: number) {
    let oldest = Infinity;
    for (const frame of this.frames) oldest = Math.min(oldest, frame.time);
    // beams from before the window are not fired again at its start
    const start = Math.max(oldest, time - WINDOW);
    this.replay = { killer, victim, start, end: time, startedAt: performance.now() / 1000, lastBeam: start, loop: false };
    this.kept = null;
  }

  /** The sponsor break: the last replay runs again behind the ad, over and over, until stop. */
  again() {
    if (!this.kept) return;
    this.replay = { ...this.kept, startedAt: performance.now() / 1000, lastBeam: this.kept.start, loop: true };
  }

  stop() {
    this.replay = null;
    this.kept = null;
  }

  /**
   * Before the picture is drawn: puts every ship's picture where it was at the replay's
   * moment, fires the beams of that moment, and places the camera behind the shooter, looking
   * at the victim. Returns false when the replay is over (or none runs).
   */
  pose(camera: THREE.Camera): boolean {
    const replay = this.replay;
    if (!replay) return false;
    let time = replay.start + (performance.now() / 1000 - replay.startedAt) * SPEED;
    if (time > replay.end) {
      if (!replay.loop) {
        this.kept = replay;
        this.replay = null;
        return false;
      }
      replay.startedAt = performance.now() / 1000;
      replay.lastBeam = time = replay.start;
    }
    const frame = this.frameAt(time);
    if (!frame) return false;
    // the slow motion falls between the kept frames: each ship is put between the frame before
    // and the one after, so it glides instead of jumping from frame to frame
    const after = this.frameAfter(time);
    const share = after ? (time - frame.time) / (after.time - frame.time) : 0;
    this.savedCount = 0;
    let killerSeen = false;
    for (let i = 0; i < MAX_SHIPS; i++) {
      const ship = frame.ships[i];
      if (!ship) continue;
      const d = frame.data;
      const at = i * STRIDE;
      const saved = this.saved[this.savedCount++];
      saved.ship = ship;
      saved.position.copy(ship.root.position);
      saved.quaternion.copy(ship.root.quaternion);
      saved.visible = ship.root.visible;
      ship.root.position.fromArray(d, at);
      ship.root.quaternion.fromArray(d, at + 3);
      // the same ship, alive in both frames (a respawn would sweep it across the field)
      if (after && after.ships[i] === ship && d[at + 7] > 0 && after.data[at + 7] > 0) {
        ship.root.position.lerp(between.fromArray(after.data, at), share);
        ship.root.quaternion.slerp(turned.fromArray(after.data, at + 3), share);
      }
      // the victim still flies in the replay; it breaks up when the replay ends
      ship.root.visible = d[at + 7] > 0 || ship === replay.victim;
      if (ship === replay.killer) {
        position.copy(ship.root.position);
        orientation.copy(ship.root.quaternion);
        killerSeen = true;
      }
      if (ship === replay.victim) to.copy(ship.root.position);
    }
    for (const beam of this.beams) {
      if (beam.time > replay.lastBeam && beam.time <= time) this.effects.beam(beam.from, beam.to, beam.color);
    }
    replay.lastBeam = time;
    if (killerSeen) {
      const radius = replay.killer.radius;
      camera.position.copy(offset.set(0, radius * 1.2, radius * 4).applyQuaternion(orientation).add(position));
      camera.lookAt(to);
      camera.updateMatrixWorld();
    }
    return true;
  }

  /** After the picture is drawn: the ships' pictures go back to where the ships are. */
  restore() {
    for (let i = 0; i < this.savedCount; i++) {
      const { ship, position: p, quaternion: q, visible } = this.saved[i];
      ship!.root.position.copy(p);
      ship!.root.quaternion.copy(q);
      ship!.root.visible = visible;
    }
    this.savedCount = 0;
  }

  /** The kept frame closest before a moment. */
  private frameAt(time: number): Frame | null {
    let best: Frame | null = null;
    for (const frame of this.frames) if (frame.time <= time && (!best || frame.time > best.time)) best = frame;
    return best;
  }

  /** The kept frame closest after a moment, or null past the last. */
  private frameAfter(time: number): Frame | null {
    let best: Frame | null = null;
    for (const frame of this.frames) if (frame.time > time && (!best || frame.time < best.time)) best = frame;
    return best;
  }
}
