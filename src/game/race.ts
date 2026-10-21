import * as THREE from 'three';
import { Randomizer } from '../random';
import type { AsteroidField } from '../world/asteroids';

/** Gates of a lap, and laps of a race. */
export const GATES = 8;
export const LAPS = 3;
/** The grid lies before the pink gate, and its first crossing starts the race: the race ends at the pink gate, LAPS laps later. */
export const FINISH_GATES = GATES * LAPS + 1;

/** The lap a ship flies after passing `gates` gates (1 to LAPS). */
export const lapOf = (gates: number) => Math.min(LAPS, Math.floor(Math.max(0, gates - 1) / GATES) + 1);
/** Radius of a gate (units, 80 m): wide enough for a pack of 35 m ships. */
export const GATE_RADIUS = 1600;
/** The course loops around the field's center at about this distance (units, 1.6 km), 300 m more or less. */
const COURSE_RADIUS = 32000;
const COURSE_SPREAD = 6000;
/** Up and down along the loop (units, up to 400 m), so the course is not flat. */
const COURSE_RISE = 8000;
/** A gate keeps this many of its radii clear of rock, and four times as much of an arena's massive body. */
const GATE_CLEARANCE = 1.5;
/** Points for every gate passed, and for the places at the finish; a kill in a race is worth less (see Game). */
export const GATE_POINTS = 20;
export const PLACE_POINTS = [1000, 800, 650, 500, 400, 300, 200, 100];

/** The modes a round can be played in, and what a tournament room plays: one of them, or both in turn. */
export type RoundMode = 'deathmatch' | 'race';
export type RoomMode = RoundMode | 'mixed';

/** The mode of a round: a mixed room starts with a deathmatch and then takes turns. */
export const modeOfRound = (mode: RoomMode, round: number): RoundMode => (mode === 'mixed' ? (round % 2 === 0 ? 'deathmatch' : 'race') : mode);

const crossing = new THREE.Vector3();
const toGate = new THREE.Vector3();

/**
 * A race course: GATES rings in a loop around the field's center, rising and falling, each
 * facing the way from the gate before. It is built from the arena's freshly generated field
 * and the arena's seed, so every browser builds the same course; gates keep clear of rock as
 * the field starts out (rocks that circle may cross the course later: mind them).
 */
export class Course {
  readonly root = new THREE.Group();
  readonly points: THREE.Vector3[] = [];
  readonly normals: THREE.Vector3[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly geometry = new THREE.TorusGeometry(GATE_RADIUS, 70, 12, 72);
  /** The next gate glows in the tournament's orange, the one after it in blue, the rest faintly; the start and finish is pink. */
  private readonly next = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0).multiplyScalar(1.4), toneMapped: false });
  private readonly after = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.57, 1).multiplyScalar(1.6), toneMapped: false });
  private readonly faint = new THREE.MeshBasicMaterial({ color: 0x2a4e8c, transparent: true, opacity: 0.35, toneMapped: false });
  private readonly finish = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.25, 0.65).multiplyScalar(2), toneMapped: false });

  constructor(field: AsteroidField, seed: number) {
    const r = new Randomizer(seed * 7 + 3);
    const start = r.range(0, Math.PI * 2);
    for (let i = 0; i < GATES; i++) {
      const angle = start + (i / GATES) * Math.PI * 2 + r.range(-0.15, 0.15);
      const distance = COURSE_RADIUS + r.range(-COURSE_SPREAD, COURSE_SPREAD);
      const point = new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle * 2 + start) * COURSE_RISE, Math.sin(angle) * distance);
      // up or down, away from rock and from the arena's massive body, in turns
      for (let attempt = 1; attempt < 24 && (field.overlap(point, GATE_RADIUS * GATE_CLEARANCE) || field.insideWell(point, GATE_RADIUS * GATE_CLEARANCE * 4)); attempt++) {
        point.y += (attempt % 2 ? 1 : -1) * attempt * GATE_RADIUS;
      }
      this.points.push(point);
    }
    for (let i = 0; i < GATES; i++) {
      // each gate faces along the loop: from the gate before towards the gate after
      this.normals.push(this.points[(i + 1) % GATES].clone().sub(this.points[(i + GATES - 1) % GATES]).normalize());
      const ring = new THREE.Mesh(this.geometry, this.faint);
      ring.position.copy(this.points[i]);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.normals[i]);
      this.rings.push(ring);
      this.root.add(ring);
    }
  }

  /** Whether a ship moving from `from` to `to` this frame flew through a gate, either way: a ring is a ring. */
  crossed(gate: number, from: THREE.Vector3, to: THREE.Vector3): boolean {
    const point = this.points[gate];
    const normal = this.normals[gate];
    const before = toGate.subVectors(from, point).dot(normal);
    const after = crossing.subVectors(to, point).dot(normal);
    if (before < 0 === after < 0) return false;
    // where the path pierces the gate's plane, inside the ring
    crossing.subVectors(to, from).multiplyScalar(before / (before - after)).add(from);
    return crossing.distanceTo(point) < GATE_RADIUS;
  }

  /** Shows the own pilot's next gates: the next one bright, the one after in blue. */
  highlight(next: number) {
    this.rings.forEach((ring, i) => {
      ring.material = i === next ? this.next : i === (next + 1) % GATES ? this.after : i === 0 ? this.finish : this.faint;
    });
  }

  /** Where a ship (re)starts that has passed `passed` gates, and which way it looks: before the start, or at the last gate passed, towards the next. */
  startOf(passed: number, slot: number, position: THREE.Vector3): THREE.Vector3 {
    const gate = passed === 0 ? 0 : (passed - 1) % GATES;
    const behind = passed === 0 ? -6000 : 0;
    // ships side by side, so a grid of eight does not start in one place
    const side = toGate.set(0, 1, 0).cross(this.normals[gate]).normalize();
    return position
      .copy(this.points[gate])
      .addScaledVector(this.normals[gate], behind)
      .addScaledVector(side, ((slot % 4) - 1.5) * 1400)
      .addScaledVector(crossing.set(0, 1, 0), (Math.floor(slot / 4) - 0.5) * 1400);
  }

  dispose() {
    this.root.clear();
    this.geometry.dispose();
    for (const material of [this.next, this.after, this.faint, this.finish]) material.dispose();
  }
}
