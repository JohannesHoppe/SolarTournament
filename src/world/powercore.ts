import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxUv, industrialSurface, shine, signTexture, surfaced, windingSurface, WIRE_GLOW } from '../view/surfaces';

/**
 * A sponsor's power core, the flag of Capture the Flag, as a thing of the tournament: a
 * machined reactor cell, an octagonal canister 14 m long, its armor dark and oily. Its heart, a
 * coil of copper wound tight, glows in its side's color through four windings and between six
 * armor staves, every turn of their wire showing; two plates carry the sponsor's lit sign;
 * chamfered caps close both ends, and on top two crossed bails form the cage the tow cable
 * grips; a vent glows at the bottom. Low poly and built once: every core is a few meshes over
 * the kit's geometries, with materials of its own, so each fades alone (see CoreLook.fade).
 *
 * The canister lies along its own y axis, its center at the origin; GRIP is where the cable
 * takes hold. All of it is look only: the rules of a core know only its position.
 */
/** Half the length of the staves and the radius they stand at (units: 11 m, 3.2 m). */
const HALF = 220 / 2;
const RADIUS = 64;
/** The chamfered caps: how long, and their outer radius (units: 1.5 m, 3.5 m). */
const CAP = 30;
const CAP_RADIUS = 70;
/** The bails' radius (units, 1.7 m): the cable grips at their top. */
const BAIL = 34;
/** Where the tow cable grips the core (units along its axis, 8.7 m from its center). */
export const GRIP = HALF + CAP + BAIL;
/**
 * The heart, a coil wound tight, glows at this brightness (above 1 it blooms), the windings
 * brighter; both show their turns of copper (see windingSurface), a tile every WIND_AROUND units
 * around them and every WIND_ALONG along them (a turn every 20 cm).
 */
const HEART_GLOW = 0.8;
const WINDING_GLOW = 2.2;
const WIND_AROUND = 120;
const WIND_ALONG = 32;
/** The armor's paint: dark, oily gunmetal, so the glow stands out against it rather than washing over it. */
const ARMOR = 0x5a6069;
/** The outline a faded core keeps (see CoreLook.fade): this opacity at the faintest. */
const OUTLINE = 0.45;
/** The seed of the canister's plating (see industrialSurface), the rings': the same depots built both. */
const PLATING_SEED = 2584;

const matrix = new THREE.Matrix4();
const turn = new THREE.Quaternion();
const place = new THREE.Vector3();
const unit = new THREE.Vector3(1, 1, 1);
const Y = new THREE.Vector3(0, 1, 0);

/** A coil of `radius` and `height` along the axis, its texture coordinates tiling its turns (see WIND_AROUND). */
function wound(radius: number, height: number): THREE.BufferGeometry {
  const coil = new THREE.CylinderGeometry(radius, radius, height, 8);
  const uv = coil.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * radius) / WIND_AROUND, (uv.getY(i) * height) / WIND_ALONG);
  return coil;
}

/** A box standing along the axis, `out` from it at `angle` around it, facing outwards. */
function stave(width: number, height: number, depth: number, angle: number, out: number, y = 0) {
  turn.setFromAxisAngle(Y, -angle);
  place.set(Math.cos(angle) * out, y, Math.sin(angle) * out);
  return new THREE.BoxGeometry(depth, height, width).applyMatrix4(matrix.compose(place, turn, unit));
}

/** What a core looks like in the world, and how it fades. */
export interface CoreLook {
  readonly root: THREE.Group;
  /** 1 shows the core whole; towards 0 it fades to a faint outline in its side's color. */
  fade(amount: number): void;
}

/** The geometries every core shares; `build` makes one core in its side's color. */
export class CoreKit {
  private readonly hull: THREE.BufferGeometry;
  private readonly heart: THREE.BufferGeometry;
  private readonly windings: THREE.BufferGeometry;
  private readonly plate: THREE.BufferGeometry;
  private readonly outline: THREE.BufferGeometry;
  private readonly surface = surfaced(industrialSurface(PLATING_SEED), 1.2);
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];

  constructor() {
    const hull: THREE.BufferGeometry[] = [];
    const windings: THREE.BufferGeometry[] = [];
    // six armor staves around the heart, two sign plates in the gaps left for them
    for (let i = 0; i < 6; i++) if (i % 3 !== 0) hull.push(stave(24, HALF * 2, 16, (i * Math.PI) / 3, RADIUS));
    for (const angle of [0, Math.PI]) hull.push(stave(52, HALF * 1.5, 10, angle, RADIUS - 2));
    // armor collars at both ends of the staves, and the chamfered caps beyond them
    for (const side of [1, -1]) {
      hull.push(new THREE.CylinderGeometry(CAP_RADIUS + 4, CAP_RADIUS + 4, 14, 8).translate(0, side * (HALF - 7), 0));
      const cap = new THREE.CylinderGeometry(CAP_RADIUS * 0.6, CAP_RADIUS, CAP, 8);
      if (side < 0) cap.rotateX(Math.PI);
      hull.push(cap.translate(0, side * (HALF + CAP / 2), 0));
    }
    // the cage on top: two crossed bails, a hub where they meet the cap
    for (const angle of [0, Math.PI / 2]) hull.push(new THREE.TorusGeometry(BAIL, 6, 4, 8, Math.PI).rotateY(angle).translate(0, HALF + CAP, 0));
    hull.push(new THREE.CylinderGeometry(10, 10, 14, 6).translate(0, GRIP, 0));
    // the heart, its windings, and the vent at the bottom
    const heart = wound(RADIUS - 14, HALF * 1.8);
    for (let w = 0; w < 4; w++) windings.push(wound(RADIUS - 6, 16).translate(0, ((w + 0.5) / 4 - 0.5) * HALF * 1.5, 0));
    windings.push(wound(CAP_RADIUS * 0.4, 8).translate(0, -(HALF + CAP + 2), 0));
    this.hull = boxUv(mergeGeometries(hull), 180);
    this.heart = heart;
    this.windings = mergeGeometries(windings);
    // the sign reads along the axis, on both plates
    this.plate = mergeGeometries([0, Math.PI].map((angle) => new THREE.PlaneGeometry(HALF * 1.4, HALF * 0.35).rotateZ(Math.PI / 2).rotateY(Math.PI / 2 - angle).translate(Math.cos(angle) * (RADIUS + 4), 0, Math.sin(angle) * (RADIUS + 4))));
    this.outline = new THREE.EdgesGeometry(new THREE.CylinderGeometry(CAP_RADIUS, CAP_RADIUS, (HALF + CAP) * 2, 8));
    for (const parts of [hull, windings]) for (const part of parts) part.dispose();
  }

  /** A core in a side's color (`tint`, CSS), carrying a sponsor's sign. */
  build(tint: string, brand: string): CoreLook {
    const color = new THREE.Color(tint);
    const material = <T extends THREE.Material>(made: T): T => {
      made.transparent = true;
      this.materials.push(made);
      return made;
    };
    const sign = signTexture(brand, tint);
    this.textures.push(sign);
    const metal = material(new THREE.MeshStandardMaterial({ ...this.surface, color: ARMOR, flatShading: true, emissive: color.clone().multiplyScalar(0.04), envMap: shine(), envMapIntensity: 0.45 }));
    const wire = windingSurface();
    const glows = [HEART_GLOW, WINDING_GLOW].map((glow) =>
      material(new THREE.MeshStandardMaterial({ map: wire.map, normalMap: wire.normal, roughness: 0.35, metalness: 1, envMap: shine(), envMapIntensity: 0.8, emissive: color, emissiveMap: wire.glow, emissiveIntensity: glow * WIRE_GLOW, toneMapped: false })),
    );
    const plate = material(new THREE.MeshBasicMaterial({ map: sign, color: new THREE.Color(1, 1, 1).multiplyScalar(1.4), toneMapped: false }));
    const solid = [metal, ...glows, plate];
    const lines = material(new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(2), toneMapped: false, depthWrite: false }));
    const body = new THREE.Group();
    body.add(new THREE.Mesh(this.hull, metal), new THREE.Mesh(this.heart, glows[0]), new THREE.Mesh(this.windings, glows[1]), new THREE.Mesh(this.plate, plate));
    const outline = new THREE.LineSegments(this.outline, lines);
    const root = new THREE.Group();
    root.add(body, outline);
    let shown = -1;
    const fade = (amount: number) => {
      if (amount === shown) return;
      shown = amount;
      body.visible = amount > 0.02;
      for (const part of solid) {
        part.opacity = amount;
        part.depthWrite = amount > 0.98;
      }
      outline.visible = amount < 0.98;
      lines.opacity = OUTLINE * (1 - amount);
    };
    fade(1);
    return { root, fade };
  }

  dispose() {
    for (const geometry of [this.hull, this.heart, this.windings, this.plate, this.outline]) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
