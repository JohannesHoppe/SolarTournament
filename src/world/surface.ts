import * as THREE from 'three';

/**
 * The shape of a rock as its collisions see it: for every direction from the rock's center,
 * how far its surface reaches, measured from the mesh itself, so a ship touches the rock where
 * it sees the rock. The directions are the cells of a cube's six faces (CELLS × CELLS each);
 * a cell keeps the farthest vertex in it, and a lookup blends the four nearest cells of its
 * face. Only additions, multiplications and divisions find a cell, and the rock meshes are the
 * same on every browser, so every browser measures the same surface. With 32 cells a face, a
 * ship gets at most 2 % of a rock's radius into its visible surface, and touches it a little
 * early only above a crater (a cell keeps the crater's rim): 1 % of the radius in the median.
 */
const CELLS = 32;

const corner = new THREE.Vector3();
const toLocal = new THREE.Matrix4();

/** A direction's face of the cube (0..5) and its two coordinates on that face (-1..1), written into `out`. */
function cubeFace(x: number, y: number, z: number, out: { face: number; s: number; t: number }) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  if (ax >= ay && ax >= az) {
    out.face = x >= 0 ? 0 : 1;
    out.s = y / ax;
    out.t = z / ax;
  } else if (ay >= az) {
    out.face = y >= 0 ? 2 : 3;
    out.s = x / ay;
    out.t = z / ay;
  } else {
    out.face = z >= 0 ? 4 : 5;
    out.s = x / az;
    out.t = y / az;
  }
  return out;
}

const cell = (s: number) => Math.min(CELLS - 1, Math.max(0, Math.floor(((s + 1) / 2) * CELLS)));
const where = { face: 0, s: 0, t: 0 };

/**
 * Two directions across `direction` (itself a unit vector), for estimating by finite
 * differences how a surface indexed by direction (a measured Surface, or an analytic one, e.g.
 * a rock's noise function) slopes there: used for collision normals and for baking a rock's
 * normal map alike.
 */
export function tangentDirections(direction: THREE.Vector3, side: THREE.Vector3, across: THREE.Vector3) {
  side.set(Math.abs(direction.x) < 0.9 ? 1 : 0, Math.abs(direction.x) < 0.9 ? 0 : 1, 0).cross(direction).normalize();
  across.crossVectors(direction, side);
}

/** Keeps a point (relative to the center) in the cell of `radii` it lies in, if it reaches farther than what the cell holds. */
function keepFarthest(radii: Float32Array, x: number, y: number, z: number) {
  const length = Math.sqrt(x * x + y * y + z * z);
  if (length < 1e-6) return;
  cubeFace(x, y, z, where);
  const index = where.face * CELLS * CELLS + cell(where.t) * CELLS + cell(where.s);
  radii[index] = Math.max(radii[index], Math.ceil(length));
}

/** A coarse mesh leaves cells without a vertex: they take the mean of their filled neighbours on the face. */
function fillGaps(radii: Float32Array) {
  for (let pass = 0; pass < CELLS && radii.includes(0); pass++) {
    const before = radii.slice();
    for (let f = 0; f < 6; f++) {
      for (let j = 0; j < CELLS; j++) {
        for (let i = 0; i < CELLS; i++) {
          const index = f * CELLS * CELLS + j * CELLS + i;
          if (before[index]) continue;
          let sum = 0;
          let filled = 0;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const ni = i + di;
              const nj = j + dj;
              const r = ni >= 0 && ni < CELLS && nj >= 0 && nj < CELLS ? before[f * CELLS * CELLS + nj * CELLS + ni] : 0;
              if (r) {
                sum += r;
                filled++;
              }
            }
          }
          if (filled) radii[index] = Math.ceil(sum / filled);
        }
      }
    }
  }
}

/** A surface's cells (see Surface) measured from points (xyz, a flat list) around `center`: what a worker hands over for Surface.from (a piece of a broken rock, see world/fracture). */
export function measureRadii(points: ArrayLike<number>, center: THREE.Vector3): Float32Array {
  const radii = new Float32Array(6 * CELLS * CELLS);
  for (let k = 0; k < points.length; k += 3) keepFarthest(radii, points[k] - center.x, points[k + 1] - center.y, points[k + 2] - center.z);
  fillGaps(radii);
  return radii;
}

const inside = new THREE.Vector3();
const along = new THREE.Vector3();

/**
 * Cuts a surface's cells measured around `center` (see measureRadii) back to where they leave
 * `within`, another surface around `withinCenter` in the same frame: a piece of a broken rock
 * reaches no farther than the rock did, in no direction, so a ship outside the rock is outside
 * every piece of it, to the 2 % of a radius a measured surface keeps to its mesh. Each cell's
 * point is held to it (to a unit, by halving) along its middle's direction and those a quarter
 * of a cell around it, and a little more (`margin`, units).
 */
export function clampRadii(radii: Float32Array, center: THREE.Vector3, within: Surface, withinCenter: THREE.Vector3, margin = 0) {
  const out = (r: number) => {
    inside.copy(center).addScaledVector(along, r).sub(withinCenter);
    return inside.length() > within.radius(inside) - margin;
  };
  for (let f = 0; f < 6; f++) {
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const index = f * CELLS * CELLS + j * CELLS + i;
        // over the cell's middle and a quarter of a cell around it, where it weighs most in a lookup's blend
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const s = Math.max(-1, Math.min(1, ((i + 0.5 + di / 4) / CELLS) * 2 - 1));
            const t = Math.max(-1, Math.min(1, ((j + 0.5 + dj / 4) / CELLS) * 2 - 1));
            const sign = f % 2 === 0 ? 1 : -1;
            if (f < 2) along.set(sign, s, t);
            else if (f < 4) along.set(s, sign, t);
            else along.set(s, t, sign);
            along.normalize();
            if (!out(radii[index])) continue;
            let low = 0;
            let high = radii[index];
            while (high - low > 1) {
              const middle = (low + high) / 2;
              if (out(middle)) high = middle;
              else low = middle;
            }
            radii[index] = Math.floor(low);
          }
        }
      }
    }
  }
}

export class Surface {
  /** How far the surface reaches in each cell (units, whole, in the rock's own unscaled coordinates). */
  private readonly radii: Float32Array;
  /** The farthest the surface reaches in any direction. */
  readonly reach: number;

  /** Measures the visible meshes of `root`, around `center` (in root's own coordinates without its scale); or takes cells measured already (see measureRadii). */
  constructor(root: THREE.Object3D | Float32Array, center = new THREE.Vector3()) {
    if (root instanceof Float32Array) this.radii = root;
    else {
      const radii = (this.radii = new Float32Array(6 * CELLS * CELLS));
      root.updateMatrixWorld(true);
      const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.visible) return;
        toLocal.multiplyMatrices(inverseRoot, o.matrixWorld);
        const position = o.geometry.getAttribute('position');
        for (let k = 0; k < position.count; k++) {
          corner.fromBufferAttribute(position, k).applyMatrix4(toLocal).sub(center);
          keepFarthest(radii, corner.x, corner.y, corner.z);
        }
      });
      fillGaps(radii);
    }
    this.reach = this.radii.reduce((max, r) => Math.max(max, r), 0);
  }
  /** How far the surface reaches in the direction of a point (relative to the center, the rock's own coordinates). */
  radius(local: THREE.Vector3): number {
    cubeFace(local.x, local.y, local.z, where);
    // the four nearest cell centers of the face, blended
    const gx = ((where.s + 1) / 2) * CELLS - 0.5;
    const gy = ((where.t + 1) / 2) * CELLS - 0.5;
    const i0 = Math.min(CELLS - 1, Math.max(0, Math.floor(gx)));
    const j0 = Math.min(CELLS - 1, Math.max(0, Math.floor(gy)));
    const i1 = Math.min(CELLS - 1, i0 + 1);
    const j1 = Math.min(CELLS - 1, j0 + 1);
    const fx = Math.min(1, Math.max(0, gx - i0));
    const fy = Math.min(1, Math.max(0, gy - j0));
    const base = where.face * CELLS * CELLS;
    const r = this.radii;
    const top = r[base + j0 * CELLS + i0] * (1 - fx) + r[base + j0 * CELLS + i1] * fx;
    const bottom = r[base + j1 * CELLS + i0] * (1 - fx) + r[base + j1 * CELLS + i1] * fx;
    return top * (1 - fy) + bottom * fy;
  }
}
