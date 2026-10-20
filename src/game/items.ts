import * as THREE from 'three';
import { hash } from '../music/songs';
import { textSeed } from '../random';
import { FIELD_RADIUS, type AsteroidField } from '../world/asteroids';

/**
 * Items: sponsor probes that drift in the arena, each carrying one thing, like the item boxes
 * of a party brawler. Whoever flies through one takes what it carries. Twin lasers and plating
 * stay with the clone and fly out again as probes when it dies; the rest is used at once.
 * - twin: the laser fires twice as fast at half the heat per shot.
 * - plating: two hits into the drive bounce off, or one torpedo.
 * - torpedoes: two more.
 * - overdrive: ready at once.
 * - repair: hull, drive and thrusters as new.
 */
export type ItemKind = 'twin' | 'plating' | 'torpedoes' | 'overdrive' | 'repair';
const KINDS: readonly ItemKind[] = ['twin', 'plating', 'torpedoes', 'overdrive', 'repair'];
/** How often each kind comes in a probe (relative), the coveted ones rarer. */
const WEIGHTS: Record<ItemKind, number> = { twin: 2, plating: 3, torpedoes: 3, overdrive: 2, repair: 3 };

export const ITEM_NAMES: Record<ItemKind, string> = { twin: 'Twin laser', plating: 'Plating', torpedoes: '+2 torpedoes', overdrive: 'Overdrive charged', repair: 'Repair' };
/** The neon of each kind, so a pilot sees from afar what a probe carries. */
const COLORS: Record<ItemKind, number> = { twin: 0xff3fa4, plating: 0x4d91ff, torpedoes: 0xff9d00, overdrive: 0xffe04d, repair: 0x3dff9a };

/** A probe shows up every PROBE_EVERY seconds of a round, from PROBE_FIRST on, at most PROBE_MAX at once. */
const PROBE_FIRST = 20;
const PROBE_EVERY = 25;
const PROBE_MAX = 4;
/** A probe's reach (units, 15 m): a ship that comes this close plus its own radius takes it. */
export const PROBE_RADIUS = 300;
/** A probe a dead clone dropped drifts this long (s) before it is gone. */
const DROP_LIFETIME = 45;
/** Dropped probes fly apart with up to this speed (units/s, 20 m/s) on top of the wreck's. */
const DROP_SPREAD = 400;

export interface Probe {
  /** "r<round>.<n>" for the arena's probes, "<ship id>.<deaths>.<n>" for a dead clone's: the same probe on every browser. */
  id: string;
  kind: ItemKind;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Gone after this (game time, s); Infinity for the arena's. */
  until: number;
  mesh: THREE.Group;
  /** The beacon that blinks in the color of what the probe carries. */
  beacon: THREE.Mesh;
}

const spin = new THREE.Euler();

/**
 * A small probe: a body, two wide solar wings, a dish, a beacon on a mast and a neon ring
 * around it in the color of what it carries, so it shows from afar (about 30 m wide).
 */
function probeParts() {
  const body = new THREE.CylinderGeometry(70, 90, 160, 6).rotateX(Math.PI / 2);
  const wing = new THREE.BoxGeometry(560, 8, 150);
  const dish = new THREE.ConeGeometry(70, 40, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -110);
  const mast = new THREE.CylinderGeometry(6, 6, 90, 4).translate(0, 90, 0);
  const beacon = new THREE.SphereGeometry(34, 10, 6).translate(0, 140, 0);
  const ring = new THREE.TorusGeometry(200, 10, 6, 32);
  return { body, wing, dish, mast, beacon, ring };
}

/**
 * The probes of a round. Which probe shows up when, where and with what follows from the
 * room and round and the round clock, so every browser has the same probes without a word;
 * a dead clone's probes follow from its death. Taking a probe is told to the others.
 */
export class Probes {
  readonly group = new THREE.Group();
  readonly list: Probe[] = [];
  /** Probes of the arena shown so far this round, and the ids taken, so none comes back. */
  private shown = 0;
  private readonly taken = new Set<string>();
  private readonly parts = probeParts();
  private readonly hull = new THREE.MeshStandardMaterial({ color: 0x8c9198, roughness: 0.5, metalness: 0.3, flatShading: true });
  private readonly panels = new THREE.MeshStandardMaterial({ color: 0x1b2a55, emissive: 0x0a1430, roughness: 0.3, metalness: 0.4 });
  private readonly beacons = new Map<ItemKind, THREE.MeshBasicMaterial>();

  constructor() {
    for (const kind of KINDS) this.beacons.set(kind, new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS[kind]).multiplyScalar(2.5), toneMapped: false }));
  }

  /** A new round: no probes, and the arena's probes count from the start. */
  reset() {
    while (this.list.length) this.remove(this.list[0]);
    this.shown = 0;
    this.taken.clear();
  }

  /**
   * The arena's probes due by `elapsed` seconds into round `round` of `seed`'s room (or solo
   * round): each at a place in the field and with a kind its number decides; places taken by
   * rock are skipped over to the next one.
   */
  schedule(seed: number, round: number, elapsed: number, field: AsteroidField) {
    while (PROBE_FIRST + this.shown * PROBE_EVERY <= elapsed) {
      const n = this.shown++;
      const id = `r${round}.${n}`;
      if (this.taken.has(id) || this.list.filter((probe) => probe.until === Infinity).length >= PROBE_MAX) continue;
      const position = new THREE.Vector3();
      for (let attempt = 0; attempt < 8; attempt++) {
        const h = (k: number) => hash(seed, round, n, attempt, k) / 4294967296;
        position.set(h(1) * 2 - 1, (h(2) * 2 - 1) * 0.5, h(3) * 2 - 1).multiplyScalar(FIELD_RADIUS * 0.8);
        if (!field.overlap(position, PROBE_RADIUS * 4) && !field.insideWell(position, PROBE_RADIUS * 20)) break;
      }
      this.add(id, kindOf(hash(seed, round, n, 99)), position, new THREE.Vector3(), Infinity);
    }
  }

  /** A dead clone's items fly out as probes, with its wreck's momentum. */
  drop(shipId: string, deaths: number, kinds: readonly ItemKind[], position: THREE.Vector3, velocity: THREE.Vector3, now: number) {
    kinds.forEach((kind, k) => {
      const h = (i: number) => hash(textSeed(shipId), deaths, k, i) / 4294967296;
      const push = new THREE.Vector3(h(1) * 2 - 1, h(2) * 2 - 1, h(3) * 2 - 1).normalize().multiplyScalar(DROP_SPREAD * (0.5 + h(4) * 0.5));
      this.add(`${shipId}.${deaths}.${k}`, kind, position.clone(), push.add(velocity), now + DROP_LIFETIME);
    });
  }

  private add(id: string, kind: ItemKind, position: THREE.Vector3, velocity: THREE.Vector3, until: number) {
    if (this.taken.has(id) || this.find(id)) return;
    const { body, wing, dish, mast, beacon: light, ring } = this.parts;
    const mesh = new THREE.Group();
    const neon = this.beacons.get(kind)!;
    const beacon = new THREE.Mesh(light, neon);
    mesh.add(new THREE.Mesh(body, this.hull), new THREE.Mesh(wing, this.panels), new THREE.Mesh(dish, this.hull), new THREE.Mesh(mast, this.hull), beacon, new THREE.Mesh(ring, neon));
    mesh.position.copy(position);
    this.group.add(mesh);
    this.list.push({ id, kind, position: mesh.position, velocity, until, mesh, beacon });
  }

  /** Probes drift, turn slowly and blink; a dropped one is gone after its time, or in the arena's massive body. */
  update(dt: number, now: number, field: AsteroidField) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const probe = this.list[i];
      probe.position.addScaledVector(probe.velocity, dt);
      probe.mesh.rotation.copy(spin.set(0.3, now * 0.4, 0.15));
      probe.beacon.visible = now % 1 < 0.6;
      if (now > probe.until || field.insideWell(probe.position, PROBE_RADIUS)) this.remove(probe);
    }
  }

  /** The probe a ship of `radius` at `position` flies through, if any. */
  touching(position: THREE.Vector3, radius: number): Probe | null {
    for (const probe of this.list) if (probe.position.distanceTo(position) < radius + PROBE_RADIUS) return probe;
    return null;
  }

  /** The nearest probe within `range` of a point, if any. */
  nearest(position: THREE.Vector3, range: number): Probe | null {
    let best: Probe | null = null;
    let distance = range;
    for (const probe of this.list) {
      const d = probe.position.distanceTo(position);
      if (d < distance) {
        best = probe;
        distance = d;
      }
    }
    return best;
  }

  find(id: string): Probe | null {
    return this.list.find((probe) => probe.id === id) ?? null;
  }

  /** A probe was taken (here or on another browser): it is gone and does not come back. */
  take(probe: Probe) {
    this.taken.add(probe.id);
    this.remove(probe);
  }

  /** The ids of the probes taken this round, for a browser that joins. */
  takenIds(): string[] {
    return [...this.taken];
  }

  /** A probe id taken on another browser, before or after this one has it. */
  takeId(id: string) {
    this.taken.add(id);
    const probe = this.find(id);
    if (probe) this.remove(probe);
  }

  private remove(probe: Probe) {
    const index = this.list.indexOf(probe);
    if (index >= 0) this.list.splice(index, 1);
    this.group.remove(probe.mesh);
  }
}

/** The kind of a probe from a hash, by the weights. */
function kindOf(h: number): ItemKind {
  const total = KINDS.reduce((sum, kind) => sum + WEIGHTS[kind], 0);
  let pick = h % total;
  for (const kind of KINDS) {
    if (pick < WEIGHTS[kind]) return kind;
    pick -= WEIGHTS[kind];
  }
  return 'repair';
}

/** The items a clone holds, as one number for its state: twin laser (1) plus plating charges (2 each). */
export const packItems = (twin: boolean, plating: number) => (twin ? 1 : 0) + plating * 2;
export const unpackItems = (packed: number) => ({ twin: (packed & 1) === 1, plating: packed >> 1 });
