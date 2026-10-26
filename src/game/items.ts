import * as THREE from 'three';
import { hash } from '../music/songs';
import { textSeed } from '../random';
import { FIELD_RADIUS, type AsteroidField } from '../world/asteroids';
import { MASS } from '../world/bodies';
import type { Ship } from '../ship/ship';
import { msg } from '../i18n/i18n';
import { solarCells, surfaced, wornSurface, type Wear } from '../view/surfaces';

/** The wear of a sponsor's probe (see wornSurface). */
const PROBE_WEAR: Wear = { rust: 0.15, chips: 0.3, grime: 0.3, scratches: 0.4, seams: 0.5, stencils: ['PROPERTY OF SPONSOR', 'SN 0451', 'DO NOT OPEN'], roughness: 0.5, metalness: 0.35 };

/**
 * Items: sponsor probes that drift in the arena, each carrying one thing, like the item boxes
 * of a party brawler. Whoever flies through one takes what it carries. Twin lasers and plating
 * stay with the clone and fly out again as probes when it dies; the rest is used at once.
 * - twin: the laser fires twice as fast at half the heat per shot.
 * - plating: two hits into the drive bounce off, or one torpedo.
 * - torpedoes: two more.
 * - overdrive: ready at once.
 * - repair: hull, drive and thrusters as new.
 * - nova: an overcharged reactor core, the rarest of all. The ship that holds it pulses for
 *   everyone to see, and its next shot is no laser: the core goes off, and every other ship
 *   around it is gone, and so is its own clone, printed again at once without counting as a
 *   death (see Game.novaBlast). It stays with the clone until then, and flies
 *   out when it dies.
 */
export type ItemKind = 'twin' | 'plating' | 'torpedoes' | 'overdrive' | 'repair' | 'nova';
export const KINDS: readonly ItemKind[] = ['twin', 'plating', 'torpedoes', 'overdrive', 'repair', 'nova'];

/** A probe in flight as it travels to a browser that joins: id, kind, position, velocity, seconds left, and the luck of a sealed one (see Probe.luck). */
export type ProbeState = { i: string; k: ItemKind; p: number[]; v: number[]; u: number; x?: number };
/** How often each kind comes in a probe (relative), the coveted ones rarer. */
const WEIGHTS: Record<ItemKind, number> = { twin: 2, plating: 3, torpedoes: 3, overdrive: 2, repair: 3, nova: 1 };
/** Sealed probes the radar names this way. */
export const SEALED_NAME = msg('Sealed probe');
/**
 * In a race the arena's probes are sealed: what one holds is decided when it is taken, by the
 * taker's place, so whoever lies behind catches up. The leaders' third mostly finds plating
 * and repairs, the middle the usual mix (WEIGHTS), the last third torpedoes, overdrives and
 * the nova cores, which the leaders never find.
 */
const PLACE_WEIGHTS: readonly Record<ItemKind, number>[] = [
  { twin: 1, plating: 4, torpedoes: 2, overdrive: 1, repair: 4, nova: 0 },
  WEIGHTS,
  { twin: 3, plating: 1, torpedoes: 4, overdrive: 4, repair: 2, nova: 2 },
];

/** The third of the field a place lies in: 0 the leaders, 1 the middle, 2 the last; a ship alone is the middle. */
export function placeBucket(place: number, count: number): number {
  if (count <= 1) return 1;
  const share = place / (count - 1);
  return share < 1 / 3 ? 0 : share > 2 / 3 ? 2 : 1;
}

export const ITEM_NAMES: Record<ItemKind, string> = {
  twin: msg('Twin laser'),
  plating: msg('Plating'),
  torpedoes: msg('+2 torpedoes'),
  overdrive: msg('Overdrive charged'),
  repair: msg('Repair'),
  nova: msg('Nova core'),
};
/** What each item does, in as few words as the HUD can show next to its name. */
export const ITEM_HINTS: Record<ItemKind, string> = {
  twin: msg('fires twice as fast'),
  plating: msg('stops two hits'),
  torpedoes: msg('extra torpedoes'),
  overdrive: msg('ready now'),
  repair: msg('ship as new'),
  nova: msg('next shot blows up everything around'),
};
/** A sealed probe's neon runs through the colors this often (1/s). */
const SEALED_CYCLE = 0.4;
/** The neon of each kind, so a pilot sees from afar what a probe carries. */
const COLORS: Record<ItemKind, number> = { twin: 0xff3fa4, plating: 0x4d91ff, torpedoes: 0xff9d00, overdrive: 0xffe04d, repair: 0x3dff9a, nova: 0xffffff };

/**
 * A probe shows up every PROBE_EVERY seconds of a round, from PROBE_FIRST on, and drifts for
 * PROBE_LIFETIME seconds unless taken: at most four at once, the same on every browser whatever
 * was taken when.
 */
export const PROBE_FIRST = 20;
export const PROBE_EVERY = 25;
const PROBE_LIFETIME = PROBE_EVERY * 4;
/** A dead clone drops at most this many probes: twin laser, plating, nova core. */
const MAX_DROPS = 3;
/** A probe's reach (units, 15 m): a ship that comes this close plus its own radius takes it. */
export const PROBE_RADIUS = 300;
/** In a race, a probe lies this far (units, up to 40 m on each axis) off the line between two gates: well inside a gate's 120 m radius. */
const TRACK_SPREAD = 800;
/** A probe a dead clone dropped drifts this long (s) before it is gone. */
const DROP_LIFETIME = 45;
/** Dropped probes fly apart with up to this speed (units/s, 20 m/s) on top of the wreck's. */
const DROP_SPREAD = 400;
/**
 * A probe a hook let go (its cable cut by its hooker's death, or let go before it arrived)
 * drifts on with its speed, then its thrusters fly it back to its slot (see Probe.slot): up to
 * PROBE_THRUST (units/s², 4 g), never faster than PROBE_RETURN towards it (units/s, 100 m/s),
 * and slow enough to stop there with half that thrust. Within PROBE_SETTLE of its slot (units,
 * 5 m) and as slow against it (units/s) it is back on it, where every browser has it alike
 * again. A sponsor wants its probe where the pilots look for it; and a probe's place is the
 * one thing all browsers agree on without a word.
 */
export const PROBE_THRUST = 785;
const PROBE_RETURN = 2000;
const PROBE_SETTLE = 100;

export interface Probe {
  /** "r<round>.<n>" for the arena's probes, "<ship id>.<deaths>.<n>" for a dead clone's: the same probe on every browser. */
  id: string;
  kind: ItemKind;
  /** A sealed probe's luck: what it holds is decided by it and the taker's place (see PLACE_WEIGHTS); null for a probe that shows what it carries. */
  luck: number | null;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** A probe is a body (see world/bodies) on a hook's cable: half a tonne. */
  readonly mass: number;
  /** Where the probe belongs now and how that place drifts: the same on every browser (round clock, or a dead clone's death). The probe flies there unless a hook moved it (see astray). */
  readonly slot: THREE.Vector3;
  readonly slotVelocity: THREE.Vector3;
  /** The ship whose hook reels it in, or null. */
  holder: Ship | null;
  /** Off its slot: on a cable, or flying back to it after one let go (see PROBE_THRUST). */
  astray: boolean;
  /** Gone after this (game time, s). */
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
 * a dead clone's probes follow from its death. Taking a probe is told to the others. A hook
 * moves a probe off its slot: every browser pulls it on that ship's cable (see game/hook), and
 * once the cable is gone it flies back to its slot (see PROBE_THRUST).
 */
export class Probes {
  readonly group = new THREE.Group();
  readonly list: Probe[] = [];
  /** Probes of the arena shown so far this round, and the ids taken, so none comes back. */
  private shown = 0;
  private readonly taken = new Set<string>();
  private readonly parts = probeParts();
  /** A sponsor's probe is cheap and used again and again: light wear, a serial and the sponsor's warning stenciled on. */
  private readonly hull = new THREE.MeshStandardMaterial({ ...surfaced(wornSurface(11, PROBE_WEAR), 1), color: 0xb4bac2, flatShading: true });
  private readonly panels = new THREE.MeshStandardMaterial({ map: solarCells(), emissive: 0x0a1430, roughness: 0.25, metalness: 0.5 });
  private readonly beacons = new Map<ItemKind, THREE.MeshBasicMaterial>();
  private readonly sealed = new THREE.MeshBasicMaterial({ toneMapped: false });

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
   * rock are skipped over to the next one. In a race they lie on the track: between two
   * gates of `track`, close to the straight line from one to the next.
   */
  schedule(seed: number, round: number, elapsed: number, now: number, field: AsteroidField, track: readonly THREE.Vector3[] = []) {
    while (PROBE_FIRST + this.shown * PROBE_EVERY <= elapsed) {
      const n = this.shown++;
      const id = `r${round}.${n}`;
      const left = PROBE_FIRST + n * PROBE_EVERY + PROBE_LIFETIME - elapsed;
      if (this.taken.has(id) || left <= 0) continue;
      const position = new THREE.Vector3();
      for (let attempt = 0; attempt < 8; attempt++) {
        const h = (k: number) => hash(seed, round, n, attempt, k) / 4294967296;
        if (track.length) {
          const gate = Math.floor(h(1) * track.length);
          position
            .lerpVectors(track[gate], track[(gate + 1) % track.length], 0.25 + h(2) * 0.5)
            .add(new THREE.Vector3(h(3) * 2 - 1, h(4) * 2 - 1, h(5) * 2 - 1).multiplyScalar(TRACK_SPREAD));
        } else {
          position.set(h(1) * 2 - 1, (h(2) * 2 - 1) * 0.5, h(3) * 2 - 1).multiplyScalar(FIELD_RADIUS * 0.8);
        }
        if (!field.overlap(position, PROBE_RADIUS * 4) && !field.insideWell(position, PROBE_RADIUS * 20)) break;
      }
      // in a race the probe is sealed: its luck and the taker's place decide what it holds
      const luck = hash(seed, round, n, 99);
      this.add(id, kindOf(luck), position, new THREE.Vector3(), now + left, track.length ? luck : null);
    }
  }

  /**
   * Whether a probe id taken on another browser could be one: a probe this browser has or knows
   * taken, one of this round already due (`round` -1 while the round is not known yet), or one
   * a known ship's dead clone dropped. An invented id never enters the list of probes taken.
   */
  plausible(id: string, round: number, deathsOf: (ship: string) => number | null): boolean {
    if (this.find(id) || this.taken.has(id)) return true;
    const arena = /^r(\d+)\.(\d+)$/.exec(id);
    if (arena) return round < 0 || (Number(arena[1]) === round && Number(arena[2]) <= this.shown);
    const drop = /^(.+)\.(\d+)\.(\d+)$/.exec(id);
    const deaths = drop ? deathsOf(drop[1]) : null;
    return deaths !== null && Number(drop![2]) <= deaths + 1 && Number(drop![3]) < MAX_DROPS;
  }

  /** The probes in flight, for a browser that joins: it takes them on their slots, wherever they drift (one on a cable just now is back there in a moment, see PROBE_THRUST). */
  snapshot(now: number): ProbeState[] {
    return this.list.map((probe) => ({ i: probe.id, k: probe.kind, p: probe.slot.toArray().map(Math.round), v: probe.slotVelocity.toArray().map(Math.round), u: +(probe.until - now).toFixed(1), ...(probe.luck === null ? {} : { x: probe.luck }) }));
  }

  /** Takes the probes in flight from the lead browser. */
  restore(states: readonly ProbeState[], now: number) {
    for (const state of states) {
      const existing = this.find(state.i);
      if (existing) this.remove(existing);
      this.add(state.i, state.k, new THREE.Vector3().fromArray(state.p), new THREE.Vector3().fromArray(state.v), now + state.u, state.x ?? null);
    }
  }

  /** A dead clone's items fly out as probes, with its wreck's momentum. */
  drop(shipId: string, deaths: number, kinds: readonly ItemKind[], position: THREE.Vector3, velocity: THREE.Vector3, now: number) {
    kinds.forEach((kind, k) => {
      const h = (i: number) => hash(textSeed(shipId), deaths, k, i) / 4294967296;
      const push = new THREE.Vector3(h(1) * 2 - 1, h(2) * 2 - 1, h(3) * 2 - 1).normalize().multiplyScalar(DROP_SPREAD * (0.5 + h(4) * 0.5));
      this.add(`${shipId}.${deaths}.${k}`, kind, position.clone(), push.add(velocity), now + DROP_LIFETIME, null);
    });
  }

  private add(id: string, kind: ItemKind, position: THREE.Vector3, velocity: THREE.Vector3, until: number, luck: number | null) {
    if (this.taken.has(id) || this.find(id)) return;
    const { body, wing, dish, mast, beacon: light, ring } = this.parts;
    const mesh = new THREE.Group();
    // a sealed probe runs through every color: nobody knows what it holds
    const neon = luck === null ? this.beacons.get(kind)! : this.sealed;
    const beacon = new THREE.Mesh(light, neon);
    mesh.add(new THREE.Mesh(body, this.hull), new THREE.Mesh(wing, this.panels), new THREE.Mesh(dish, this.hull), new THREE.Mesh(mast, this.hull), beacon, new THREE.Mesh(ring, neon));
    mesh.position.copy(position);
    this.group.add(mesh);
    this.list.push({ id, kind, luck, position: mesh.position, velocity, mass: MASS.probe, slot: position.clone(), slotVelocity: velocity.clone(), holder: null, astray: false, until, mesh, beacon });
  }

  /** A probe of this round with its slot moved to `position` and at rest there (the flight school's probes wait where its drills put them). */
  park(probe: Probe, position: THREE.Vector3) {
    probe.position.copy(position);
    probe.slot.copy(position);
    probe.velocity.set(0, 0, 0);
    probe.slotVelocity.set(0, 0, 0);
  }

  /** A hook took a probe on its cable: it leaves its slot. */
  hook(probe: Probe, holder: Ship) {
    probe.holder = holder;
    probe.astray = true;
  }

  /** The hook of `holder` let go of its probe, if it held one: it flies back to its slot. */
  letGo(probe: Probe, holder: Ship) {
    if (probe.holder === holder) probe.holder = null;
  }

  /**
   * Probes drift, turn slowly and blink; one a hook let go flies back to its slot; a dropped
   * one is gone after its time, or in the arena's massive body.
   */
  update(dt: number, now: number, field: AsteroidField) {
    this.sealed.color.setHSL((now * SEALED_CYCLE) % 1, 1, 0.6).multiplyScalar(2.5);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const probe = this.list[i];
      probe.slot.addScaledVector(probe.slotVelocity, dt);
      const returning = probe.astray && !probe.holder;
      if (returning) homeIn(probe, dt);
      probe.position.addScaledVector(probe.velocity, dt);
      if (returning && probe.position.distanceTo(probe.slot) < PROBE_SETTLE && probe.velocity.distanceTo(probe.slotVelocity) < PROBE_SETTLE) {
        probe.position.copy(probe.slot);
        probe.velocity.copy(probe.slotVelocity);
        probe.astray = false;
      }
      probe.mesh.rotation.copy(spin.set(0.3, now * 0.4, 0.15));
      probe.beacon.visible = now % 1 < 0.6;
      if (now >= probe.until || field.insideWell(probe.position, PROBE_RADIUS)) this.remove(probe);
    }
  }

  /** The probe a ship of `radius` at `position` flies through, if any. */
  touching(position: THREE.Vector3, radius: number): Probe | null {
    for (const probe of this.list) if (probe.position.distanceTo(position) < radius + PROBE_RADIUS) return probe;
    return null;
  }

  /** The nearest probe within `range` of a point, if any; with a `field`, only one in sight of the point (no rock between). */
  nearest(position: THREE.Vector3, range: number, field?: Pick<AsteroidField, 'lineOfSight'>): Probe | null {
    let best: Probe | null = null;
    let distance = range;
    for (const probe of this.list) {
      const d = probe.position.distanceTo(position);
      if (d < distance && (!field || field.lineOfSight(position, probe.position))) {
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

  /** A probe id taken on another browser, before or after this one has it: the probe, if this one has it. */
  takeId(id: string): Probe | null {
    this.taken.add(id);
    const probe = this.find(id);
    if (probe) this.remove(probe);
    return probe;
  }

  private remove(probe: Probe) {
    const index = this.list.indexOf(probe);
    if (index >= 0) this.list.splice(index, 1);
    this.group.remove(probe.mesh);
  }
}

const toSlot = new THREE.Vector3();
const change = new THREE.Vector3();

/** A probe off its slot burns towards the speed that brings it back there (see PROBE_THRUST). */
function homeIn(probe: Probe, dt: number) {
  toSlot.subVectors(probe.slot, probe.position);
  const distance = toSlot.length();
  const speed = Math.min(Math.sqrt(PROBE_THRUST * distance), PROBE_RETURN);
  change.copy(probe.slotVelocity);
  if (distance > 1e-6) change.addScaledVector(toSlot, speed / distance);
  change.sub(probe.velocity);
  const burn = change.length();
  probe.velocity.addScaledVector(change, burn > 0 ? Math.min(1, (PROBE_THRUST * dt) / burn) : 0);
}

/** What a probe gives a taker in the `bucket` third of the field (see placeBucket): its kind, or for a sealed one what its luck and the place make of it. */
export const contents = (probe: Probe, bucket: number): ItemKind => (probe.luck === null ? probe.kind : kindOf(probe.luck, PLACE_WEIGHTS[bucket] ?? WEIGHTS));

/** The kind of a probe from a hash, by the weights. */
function kindOf(h: number, weights = WEIGHTS): ItemKind {
  const total = KINDS.reduce((sum, kind) => sum + weights[kind], 0);
  let pick = h % total;
  for (const kind of KINDS) {
    if (pick < weights[kind]) return kind;
    pick -= weights[kind];
  }
  return 'repair';
}

/** The items a clone holds, as one number for its state: twin laser (1), plating charges (2 each, up to 2), nova core (8). */
export const packItems = (twin: boolean, plating: number, nova: boolean) => (twin ? 1 : 0) + plating * 2 + (nova ? 8 : 0);
export const unpackItems = (packed: number) => ({ twin: (packed & 1) === 1, plating: (packed >> 1) & 3, nova: (packed & 8) === 8 });
