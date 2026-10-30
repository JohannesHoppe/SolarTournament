import * as THREE from 'three';

/**
 * The sky as astronomers map it (the celestial, ecliptic and galactic frames), and how a cube
 * map holds it. Shared by the game (see world/starmap, world/milkyway) and the tool that packs
 * the stars' file (tools/sky).
 */

/** Degrees to radians. */
const DEG = Math.PI / 180;

/**
 * A direction in the celestial frame (ICRF/J2000 equatorial) from right ascension `ra` and
 * declination `dec` (degrees): x towards 0h on the celestial equator, y towards 6h, z towards
 * the north celestial pole. Right ascension runs counterclockwise seen from the north pole, as on
 * the real sky.
 */
export function celestial(ra: number, dec: number, out = new THREE.Vector3()): THREE.Vector3 {
  const cos = Math.cos(dec * DEG);
  return out.set(cos * Math.cos(ra * DEG), cos * Math.sin(ra * DEG), Math.sin(dec * DEG));
}

/** Right ascension (degrees, 0 to 360) and declination (degrees) of a direction in the celestial frame. */
export function raDec(direction: THREE.Vector3): { ra: number; dec: number } {
  const length = direction.length();
  const ra = Math.atan2(direction.y, direction.x) / DEG;
  return { ra: ra < 0 ? ra + 360 : ra, dec: Math.asin(THREE.MathUtils.clamp(direction.z / length, -1, 1)) / DEG };
}

/**
 * The obliquity of the ecliptic at J2000 (degrees): the tilt of Earth's orbit, the plane the sun
 * and the planets wander along, against the celestial equator.
 */
export const OBLIQUITY = 23.4393;

/** A direction on the ecliptic at ecliptic longitude `longitude` (degrees), in the celestial frame. */
export function ecliptic(longitude: number, out = new THREE.Vector3()): THREE.Vector3 {
  const l = longitude * DEG;
  const e = OBLIQUITY * DEG;
  return out.set(Math.cos(l), Math.sin(l) * Math.cos(e), Math.sin(l) * Math.sin(e));
}

/**
 * The six faces of a cube map in the order WebGL takes them (+x, -x, +y, -y, +z, -z; three.js's
 * px, nx, py, ny, pz, nz), and how the GPU samples them, as OpenGL specifies it: the axis a
 * direction points along most picks the face, and the other two give the texel, `s` across the
 * face's image from its left edge, `t` down from its top row (0 to 1; three.js uploads a cube's
 * images unflipped, their top row first).
 */
export const CUBE_FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;

/** The face (index into CUBE_FACES) and the place on it (`s`, `t`, 0 to 1) the GPU reads for a direction. */
export function cubeTexel(direction: THREE.Vector3): { face: number; s: number; t: number } {
  const { x, y, z } = direction;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  let face: number;
  let sc: number;
  let tc: number;
  let ma: number;
  if (ax >= ay && ax >= az) {
    face = x >= 0 ? 0 : 1;
    sc = x >= 0 ? -z : z;
    tc = -y;
    ma = ax;
  } else if (ay >= az) {
    face = y >= 0 ? 2 : 3;
    sc = x;
    tc = y >= 0 ? z : -z;
    ma = ay;
  } else {
    face = z >= 0 ? 4 : 5;
    sc = z >= 0 ? x : -x;
    tc = -y;
    ma = az;
  }
  return { face, s: (sc / ma + 1) / 2, t: (tc / ma + 1) / 2 };
}

/** The direction (not of unit length) the GPU reads at `s`, `t` (0 to 1, may reach past the edges) of a face: the inverse of cubeTexel. */
export function cubeDirection(face: number, s: number, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = 2 * s - 1;
  const b = 2 * t - 1;
  switch (face) {
    case 0:
      return out.set(1, -b, -a);
    case 1:
      return out.set(-1, -b, a);
    case 2:
      return out.set(a, 1, b);
    case 3:
      return out.set(a, -1, -b);
    case 4:
      return out.set(a, -b, 1);
    default:
      return out.set(-a, -b, -1);
  }
}

/**
 * The galactic frame (IAU, in J2000): the north galactic pole and the galactic center, the
 * middle of the Milky Way's band in Sagittarius. Galactic longitude runs from the center
 * through Cygnus (90°), the anticenter in Auriga (180°) and Carina (about 285°).
 */
export const GALACTIC_POLE = { ra: 192.85948, dec: 27.12825 };
export const GALACTIC_CENTER = { ra: 266.40499, dec: -28.93617 };

/** The galactic frame's axes in the celestial frame: x towards the center, y towards longitude 90°, z towards the north galactic pole. */
const galacticX = celestial(GALACTIC_CENTER.ra, GALACTIC_CENTER.dec);
const galacticZ = celestial(GALACTIC_POLE.ra, GALACTIC_POLE.dec);
galacticX.addScaledVector(galacticZ, -galacticX.dot(galacticZ)).normalize();
const galacticY = galacticZ.clone().cross(galacticX);

/** The unit direction in the celestial frame at galactic longitude `l` and latitude `b` (degrees): the inverse of galactic. */
export function fromGalactic(l: number, b: number, out = new THREE.Vector3()): THREE.Vector3 {
  const cos = Math.cos(b * DEG);
  return out
    .copy(galacticX)
    .multiplyScalar(cos * Math.cos(l * DEG))
    .addScaledVector(galacticY, cos * Math.sin(l * DEG))
    .addScaledVector(galacticZ, Math.sin(b * DEG));
}

/** A direction of the celestial frame in the galactic frame's axes (x towards the center, y towards longitude 90°, z towards the north galactic pole). */
export function galacticVector(direction: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(direction.dot(galacticX), direction.dot(galacticY), direction.dot(galacticZ));
}

/** Galactic longitude `l` (degrees, 0 to 360) and latitude `b` (degrees) of a unit direction in the celestial frame. */
export function galactic(direction: THREE.Vector3): { l: number; b: number } {
  const l = Math.atan2(direction.dot(galacticY), direction.dot(galacticX)) / DEG;
  return { l: l < 0 ? l + 360 : l, b: Math.asin(THREE.MathUtils.clamp(direction.dot(galacticZ), -1, 1)) / DEG };
}
