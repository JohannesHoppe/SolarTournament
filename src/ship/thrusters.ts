import * as THREE from 'three';

/**
 * The maneuvering thrusters as they are built: four clusters ("quads") at the ship's corners,
 * fore and aft on both flanks, each with four nozzles pointing outward, up, down and along the
 * ship (a fore quad's forward, an aft quad's back). Gas leaving a nozzle pushes the ship the
 * other way. Nozzles on one side firing together move the ship without turning it (a sidestep
 * fires both quads of the far flank outward); two nozzles at opposite corners pushing opposite
 * ways are a couple, which turns the ship about its center without moving it. The flight model
 * reckons with the thrusters' push and turn as a whole (see flight.ts); this says which nozzles
 * give them, for the puffs of gas on screen and the Pilot's Handbook.
 */

/** Clusters of nozzles on a ship: fore and aft on both flanks. */
export const QUADS = 4;
/** Nozzles in a cluster: outward, up, down, and along the ship. */
export const NOZZLES_PER_QUAD = 4;
export const NOZZLES = QUADS * NOZZLES_PER_QUAD;
/** Half the size of a cluster's housing (units, 70 cm: a housing 1.4 m across). */
export const QUAD_SIZE = 14;
/** How far a nozzle's mouth stands off its housing (units, 50 cm). */
export const NOZZLE_LENGTH = 10;

/** Where a ship's right-hand clusters sit in ship space (units, -z ahead); the left-hand ones mirror them. */
export type QuadLayout = { fore: THREE.Vector3; aft: THREE.Vector3 };

/**
 * A nozzle: its mouth in ship space, the way its gas leaves (unit), the turn its push gives per
 * unit of push, and its share in a push the nozzles of both ends give together: the end with
 * the longer lever pushes less, so the pushes of fore and aft turn the ship neither way.
 */
export type Nozzle = { readonly mouth: THREE.Vector3; readonly exhaust: THREE.Vector3; readonly torque: THREE.Vector3; readonly balance: number };

/** The thrusters of a hull: its nozzles, and the couples that turn it about each axis either way. */
export type Thrusters = {
  readonly nozzles: readonly Nozzle[];
  /** Per axis (x pitch, y yaw, z roll) and way (0 positive, 1 negative): the nozzles whose couples turn the ship so. */
  readonly couples: readonly (readonly [readonly number[], readonly number[]])[];
};

/** The four clusters of a layout, fore left, fore right, aft left, aft right. */
export function quadsOf(layout: QuadLayout): THREE.Vector3[] {
  const left = (v: THREE.Vector3) => new THREE.Vector3(-v.x, v.y, v.z);
  return [left(layout.fore), layout.fore.clone(), left(layout.aft), layout.aft.clone()];
}

/** The ways a cluster's nozzles point: outward from the flank, up, down, and along the ship. */
function exhaustsOf(quad: THREE.Vector3, fore: boolean): THREE.Vector3[] {
  return [new THREE.Vector3(Math.sign(quad.x), 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, fore ? -1 : 1)];
}

/**
 * A couple's turn about one axis has to stand clear of the others: its turn about them may be
 * at most this share of it. A couple whose mirror image (the same nozzles on the other flank)
 * turns the same way fires together with it, and the two are judged together, since what one
 * turns about the other axes the other turns back. Couples reaching less than COUPLE_SHARE of
 * the strongest about an axis stay quiet, so a ship turns on its longest levers.
 */
const CROSS_SHARE = 0.15;
const COUPLE_SHARE = 0.75;

/** The same nozzle on the other flank: quads go fore left, fore right, aft left, aft right. */
const mirrored = (i: number) => (((i >> 2) ^ 1) << 2) | (i & 3);

/** The nozzles of a layout and the couples it turns with. */
export function thrustersOf(layout: QuadLayout): Thrusters {
  const nozzles: Nozzle[] = [];
  const fore = Math.abs(layout.fore.z);
  const aft = Math.abs(layout.aft.z);
  quadsOf(layout).forEach((quad, q) => {
    const balance = q < 2 ? Math.min(1, aft / fore) : Math.min(1, fore / aft);
    for (const exhaust of exhaustsOf(quad, q < 2)) {
      const mouth = quad.clone().addScaledVector(exhaust, QUAD_SIZE + NOZZLE_LENGTH);
      nozzles.push({ mouth, exhaust, torque: new THREE.Vector3().crossVectors(mouth, exhaust.clone().negate()), balance });
    }
  });
  const sum = new THREE.Vector3();
  /** The turn of nozzles firing together. */
  const turnOf = (set: Iterable<number>) => {
    sum.set(0, 0, 0);
    for (const i of set) sum.add(nozzles[i].torque);
    return sum;
  };
  const couples = (['x', 'y', 'z'] as const).map((axis) => {
    const ways: [number[], number[]] = [[], []];
    for (const way of [0, 1] as const) {
      const sign = way === 0 ? 1 : -1;
      const found: { set: Set<number>; turn: number }[] = [];
      for (let a = 0; a < nozzles.length; a++) {
        for (let b = a + 1; b < nozzles.length; b++) {
          // opposite pushes leave the center where it is
          if (nozzles[a].exhaust.dot(nozzles[b].exhaust) > -0.99) continue;
          const turn = turnOf([a, b])[axis] * sign;
          if (turn <= 0) continue;
          const set = new Set([a, b]);
          if (turnOf([mirrored(a), mirrored(b)])[axis] * sign > 0) set.add(mirrored(a)).add(mirrored(b));
          const together = turnOf(set);
          if (Math.sqrt(together.lengthSq() - together[axis] ** 2) > CROSS_SHARE * Math.abs(together[axis])) continue;
          found.push({ set, turn });
        }
      }
      const best = Math.max(0, ...found.map((f) => f.turn));
      const chosen = new Set<number>();
      for (const f of found) if (f.turn >= COUPLE_SHARE * best) for (const i of f.set) chosen.add(i);
      ways[way].push(...[...chosen].sort((p, q) => p - q));
    }
    return ways;
  });
  return { nozzles, couples };
}

/**
 * How hard each nozzle fires (0..1, into `out`) for a `push` in ship space (per axis a share of
 * the thrusters' full push, -1..1, -z ahead) and a `turn` (per axis a share of their full turning,
 * -1..1, x pitch, y yaw, z roll): a nozzle pushing along the push fires by its share of it,
 * balanced between the ends (see Nozzle) and the hardest at that share; a nozzle of a couple by
 * the share of the turn.
 */
export function firing(thrusters: Thrusters, push: THREE.Vector3, turn: THREE.Vector3, out: Float32Array) {
  const { nozzles, couples } = thrusters;
  let wanted = 0;
  let given = 0;
  for (let i = 0; i < nozzles.length; i++) {
    const along = Math.max(0, -nozzles[i].exhaust.dot(push));
    out[i] = along * nozzles[i].balance;
    wanted = Math.max(wanted, along);
    given = Math.max(given, out[i]);
  }
  if (given > 0) for (let i = 0; i < nozzles.length; i++) out[i] *= wanted / given;
  for (let k = 0; k < 3; k++) {
    const share = turn.getComponent(k);
    if (share === 0) continue;
    for (const i of couples[k][share > 0 ? 0 : 1]) out[i] += Math.abs(share);
  }
  for (let i = 0; i < nozzles.length; i++) out[i] = Math.min(1, out[i]);
}
