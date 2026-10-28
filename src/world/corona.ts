import * as THREE from 'three';
import { Randomizer } from '../random';
import { SUN_DIRECTION } from './space';
import { bandsVertex, noise3 } from './landmarks';

/**
 * The sun of the Corona up close: its face boiling with cells, its spots drifting across it as
 * it turns, the glow of its chromosphere and inner corona along the limb, and the prominences:
 * arcs of plasma rising over the limb along magnetic loops, swelling and fading over minutes,
 * their plasma raining back down along them in bright knots. Around it the sky a star lights:
 * its scattered light filling the whole sky, never black, and the veil its glare lays over the
 * picture through the camera's lens. Scenery only, five draw calls; everything moves on the
 * field time, so every browser shows the same sun. Nothing in it distorts the picture behind
 * it: no heat shimmer, which would read as flicker on a phone.
 */

/** The sun: a sphere this large at this distance (units, 3.1 km in radius, 12 km off): it fills about 30° of the sky. */
export const CORONA_RADIUS = 62000;
export const CORONA_DISTANCE = 240000;
const CENTER = SUN_DIRECTION.clone().multiplyScalar(CORONA_DISTANCE);
/** The axis the sun turns about: roughly the arena's up, tilted a little towards the arena. */
const AXIS = new THREE.Vector3(0.2, 1, 0.15).normalize();
/**
 * How fast its face turns (rad/s): 0.45 rad in a round of five minutes, so a spot near the
 * middle of the face drifts by almost half the sun's radius over a round and never visibly
 * within a second. The real sun takes about 25 days for a turn; the Games' is sped up so its
 * spots are seen to move.
 */
const SPIN = 0.0015;
/** Groups of sunspots, two spots each (a leader and its follower, as real spots come in pairs). */
const SPOT_GROUPS = 4;
const SPOTS = SPOT_GROUPS * 2;
/** A spot's radius with its penumbra (a share of the sun's radius); the umbra takes the inner 42 %. */
const SPOT_SIZE: readonly [number, number] = [0.045, 0.1];
/** The prominences: so many loops in each active region along the limb (see setDetail for how many a cheaper picture draws). */
const REGIONS = [3, 3, 3, 3, 2, 2];
const LOOPS = REGIONS.reduce((sum, loops) => sum + loops, 0);
/** Points along a loop: enough that its arc stays round at the sun's distance. */
const LOOP_SEGMENTS = 48;
/** A knot of coronal rain is at least this long (units, 90 m), and never less than a few pixels (see prominenceFragment). */
const KNOT_SIZE = 1800;
/** The glow around the limb reaches out to this many sun radii. */
const GLOW_REACH = 2.1;

/** Turns a direction about AXIS by `angle`. */
function turned(direction: THREE.Vector3, angle: number): THREE.Vector3 {
  return direction.clone().applyAxisAngle(AXIS, angle);
}

/**
 * The sunspot groups in the face's own frame (at field time 0), each spot a direction from the
 * sun's middle and its radius: in two belts north and south of the equator, at longitudes from
 * beyond the limb the face turns in from to past its middle, so over a round some spots turn
 * into view and others drift towards the far limb.
 */
function sunspots(): THREE.Vector4[] {
  const r = new Randomizer(2584);
  // the meridian that faces the arena, and the way the face turns from it
  const front = CENTER.clone().negate().projectOnPlane(AXIS).normalize();
  const spots: THREE.Vector4[] = [];
  for (let g = 0; g < SPOT_GROUPS; g++) {
    const latitude = (g % 2 === 0 ? 1 : -1) * r.range(0.14, 0.5);
    const longitude = -1.3 + (g / SPOT_GROUPS) * 1.7 + r.range(-0.15, 0.15);
    const size = r.range(SPOT_SIZE[0], SPOT_SIZE[1]);
    const at = (lat: number, lon: number) => turned(front, lon).multiplyScalar(Math.cos(lat)).addScaledVector(AXIS, Math.sin(lat));
    const leader = at(latitude, longitude);
    spots.push(new THREE.Vector4(leader.x, leader.y, leader.z, size));
    // the follower trails the leader along its belt, a little nearer the pole, a little smaller
    const follower = at(latitude * 1.08, longitude - size * r.range(1.6, 2.6));
    spots.push(new THREE.Vector4(follower.x, follower.y, follower.z, size * r.range(0.55, 0.85)));
  }
  return spots;
}

const sunFragment = () => /* glsl */ `
  uniform float time;
  uniform float fine;
  uniform mat3 turn;
  uniform vec4 spots[${SPOTS}];
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  const mat3 TURN_A = mat3(0.8, 0.6, 0.0, -0.48, 0.64, 0.6, 0.36, -0.48, 0.8);
  const mat3 TURN_B = mat3(0.64, 0.0, 0.77, 0.46, 0.8, -0.38, -0.61, 0.6, 0.51);
  ${noise3}
  void main() {
    // the point of the face in its own frame, which turns with the sun
    vec3 q = turn * normalize(vLocal);
    float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    // a pixel's size on the unit sphere: detail finer than a few pixels fades out, so the face
    // never crawls as the camera moves
    float pixel = length(fwidth(q));
    float detail2 = 1.0 - smoothstep(0.12, 0.3, pixel * 55.0);
    float detail3 = fine * (1.0 - smoothstep(0.12, 0.3, pixel * 160.0));
    // the boiling cells, large and small, boiling slowly; each octave turned against the others
    // so the noise's grid never shows
    float coarse = 0.6 * noise(q * 8.0 + time * 0.03) + 0.4 * noise(TURN_A * q * 19.0 - time * 0.05);
    float cells = noise(TURN_B * q * 55.0 + time * 0.08);
    float grain = noise(TURN_A * q * 160.0 + time * 0.15);
    float boil = 0.55 * coarse + 0.3 * mix(0.5, cells, detail2) + 0.15 * mix(0.5, grain, detail3);
    // sunspots: a dark umbra in a penumbra of radial filaments, bright faculae around them
    float umbra = 0.0;
    float penumbra = 0.0;
    float faculae = 0.0;
    for (int i = 0; i < ${SPOTS}; i++) {
      vec4 spot = spots[i];
      vec3 d = q - spot.xyz;
      float r = length(d) / spot.w;
      if (r > 3.0) continue;
      faculae = max(faculae, 1.0 - smoothstep(1.2, 3.0, r));
      if (r > 1.4) continue;
      float rough = r + (noise(q * 40.0 + float(i) * 7.3) - 0.5) * 0.45;
      vec3 radial = normalize(d - spot.xyz * dot(d, spot.xyz) + 1e-6);
      float strands = smoothstep(2.0, 5.0, spot.w * 0.4 / pixel);
      float filament = mix(0.5, noise(radial * 7.0 + float(i) * 3.1), strands);
      penumbra = max(penumbra, (1.0 - smoothstep(0.88, 1.0, rough)) * (0.75 + 0.5 * filament));
      umbra = max(umbra, 1.0 - smoothstep(0.36, 0.46, rough));
    }
    penumbra = min(penumbra, 1.0);
    vec3 color = mix(vec3(1.0, 0.24, 0.03), vec3(1.0, 0.62, 0.24), smoothstep(0.15, 0.85, boil) * 0.85 + mu * 0.25);
    // faculae show near the limb, where the face around them darkens
    color *= 1.0 + 0.5 * faculae * (1.0 - mu) * smoothstep(0.45, 0.7, coarse);
    color = mix(color, color * vec3(0.5, 0.27, 0.14), penumbra);
    color = mix(color, vec3(0.16, 0.05, 0.02), umbra);
    // the limb darkens and reddens: the eye sees cooler layers there
    float limb = 0.55 + 0.45 * sqrt(mu);
    color = mix(color, vec3(1.0, 0.28, 0.08), pow(1.0 - mu, 4.0) * 0.6);
    // bright enough to bloom in the middle, not so bright that cells and spots wash out to white
    // the chromosphere's red rim begins on the face's very edge, so the limb shows no dark seam
    float rim = 1.0 - smoothstep(0.0, 0.12, mu);
    gl_FragColor = vec4(color * limb + vec3(1.0, 0.3, 0.12) * rim * 0.8, 1.0);
  }
`;

/**
 * A quad around the sun's middle, square to the line from the camera (see glowFragment): in that
 * plane the sphere's outline is a circle, wherever on the screen the sun stands.
 */
const glowVertex = /* glsl */ `
  uniform vec3 center;
  uniform float radius;
  varying vec2 vPlane;
  varying float vLimb;
  void main() {
    vec3 ahead = normalize(center - cameraPosition);
    vec3 right = normalize(cross(ahead, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, ahead);
    vPlane = position.xy * radius * ${GLOW_REACH.toFixed(2)};
    // the sphere's outline lies a little farther out in this plane than its radius
    float distance = length(center - cameraPosition);
    vLimb = radius * distance / sqrt(distance * distance - radius * radius);
    gl_Position = projectionMatrix * viewMatrix * vec4(center + right * vPlane.x + up * vPlane.y, 1.0);
  }
`;

/**
 * The glow around the limb: the chromosphere a thin red rim, the inner corona fading out over
 * a sun's radius in slow streamers. It lies in the plane through the sun's middle, behind the
 * sphere's face, which hides all of it but what reaches past the limb.
 */
const glowFragment = () => /* glsl */ `
  uniform float time;
  varying vec2 vPlane;
  varying float vLimb;
  ${noise3}
  void main() {
    float r = length(vPlane) / vLimb;
    if (r < 0.97) discard;
    vec2 around = vPlane / length(vPlane);
    float beyond = max(r - 1.0, 0.0);
    float streamers = 0.55 + 0.45 * noise(vec3(around * 3.0, time * 0.004)) + 0.3 * noise(vec3(around * 9.0, 4.0 + time * 0.006));
    float corona = exp(-beyond / 0.16) * streamers * 0.45;
    float chromosphere = exp(-beyond / 0.018) * smoothstep(0.97, 1.0, r);
    float edge = 1.0 - smoothstep(${(GLOW_REACH * 0.75).toFixed(2)}, ${(GLOW_REACH * 0.98).toFixed(2)}, r);
    vec3 color = vec3(1.0, 0.82, 0.6) * corona + vec3(1.0, 0.3, 0.12) * chromosphere * 1.1;
    gl_FragColor = vec4(color * edge, 1.0);
  }
`;

/**
 * A prominence's ribbon: its arc rises and sinks with the loop's life (see the geometry's
 * attributes in prominences).
 */
const prominenceVertex = /* glsl */ `
  uniform float time;
  attribute vec3 foot;
  attribute vec3 rise;
  attribute vec3 side;
  attribute vec2 place;
  attribute vec4 loop;
  varying vec2 vPlace;
  varying float vSeed;
  varying float vLength;
  varying float vBody;
  varying float vRain;
  void main() {
    // loop: its life's length (s), where in it the round starts, its seed and its length (units)
    float life = fract(time / loop.x + loop.y);
    // a loop rises as it fills with plasma, then fades while its plasma rains back down
    float height = mix(0.7, 1.12, smoothstep(0.0, 0.8, life));
    vBody = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.7, 0.97, life));
    vRain = 0.35 + 0.65 * smoothstep(0.45, 0.8, life) * (1.0 - smoothstep(0.93, 1.0, life));
    vPlace = place;
    vSeed = loop.z;
    vLength = loop.w;
    vec3 world = foot + rise * height + side * (0.8 + 0.4 * height);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

/**
 * A prominence's plasma: strands along the loop, hot in the middle and red at the edges, and
 * the knots of coronal rain sliding down from the top towards both feet, falling faster as they
 * go. Detail finer than a few pixels fades out (strands) or is drawn larger (knots), so a
 * prominence never crawls on a small screen.
 */
const prominenceFragment = () => /* glsl */ `
  uniform float time;
  varying vec2 vPlace;
  varying float vSeed;
  varying float vLength;
  varying float vBody;
  varying float vRain;
  ${noise3}
  void main() {
    float s = vPlace.x;
    float v = vPlace.y;
    float across = exp(-v * v * 2.2);
    float strandsShow = 1.0 - smoothstep(0.15, 0.4, fwidth(v) * 3.0);
    float strands = mix(0.6, noise(vec3(s * 7.0 + vSeed * 5.0, v * 3.0, vSeed * 11.0 + time * 0.02)), strandsShow);
    float clumps = noise(vec3(s * 3.0 - time * 0.01, vSeed * 17.0, 2.0));
    float body = across * (0.3 + 0.7 * strands) * (0.25 + smoothstep(0.3, 0.75, clumps)) * vBody;
    // a pixel's length along the loop (units): a knot is never shorter than three of them
    float pixel = fwidth(s) * vLength;
    float knot = max(${KNOT_SIZE.toFixed(1)}, pixel * 3.0) / vLength;
    float rain = 0.0;
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float fall = fract(time * (0.024 + 0.014 * fract(vSeed * 7.1 + fk * 0.37)) + fract(vSeed * 3.7 + fk * 0.29));
      // from the top towards one foot, falling faster as it goes
      float at = 0.5 + (mod(fk, 2.0) < 0.5 ? -1.0 : 1.0) * 0.47 * fall * fall;
      float d = (s - at) / knot;
      rain += exp(-d * d) * smoothstep(0.0, 0.12, fall) * (1.0 - smoothstep(0.85, 1.0, fall));
    }
    rain *= exp(-v * v * 5.0) * vRain;
    vec3 hot = mix(vec3(0.8, 0.08, 0.03), vec3(1.0, 0.36, 0.08), across * strands);
    vec3 color = hot * body * 0.75 + vec3(1.0, 0.6, 0.25) * rain * 1.3;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * The prominences as one mesh: LOOPS arcs on the limb as the arena sees it (the ring of the
 * sun's surface whose normal meets the line of sight at a right angle), a few just in front of
 * it, most just behind, so some show whole over the limb and others only their tops. Each is a
 * ribbon in the plane of its arc, turned a little out of the face-on view; its vertices carry
 * where they stand on the arc's base (`foot`), how far the arc lifts them at full height
 * (`rise`), their offset across the ribbon (`side`), where on the ribbon they are (`place`:
 * along 0..1, across -1..1) and their loop's life, seed and length (`loop`).
 */
function prominences(): THREE.BufferGeometry {
  const r = new Randomizer(59);
  const toSun = SUN_DIRECTION.clone();
  // the limb: where a normal of the surface leans away from the arena by this much
  const limb = -CORONA_RADIUS / CORONA_DISTANCE;
  const reference = new THREE.Vector3().crossVectors(toSun, AXIS).normalize();
  const columns = LOOP_SEGMENTS + 1;
  const count = LOOPS * columns * 2;
  const foot = new Float32Array(count * 3);
  const rise = new Float32Array(count * 3);
  const side = new Float32Array(count * 3);
  const place = new Float32Array(count * 2);
  const loop = new Float32Array(count * 4);
  const index: number[] = [];
  // the loops of each active region: an arcade of arcs over one stretch of the limb, the
  // lower ones nested under the tallest
  type Spec = { height: number; half: number; width: number; around: number; lean: number; tilt: number; skew: number };
  const specs: Spec[] = [];
  for (let g = 0; g < REGIONS.length; g++) {
    const around = (g / REGIONS.length) * Math.PI * 2 + r.range(-0.35, 0.35);
    const lean = limb + r.range(-0.03, 0.18);
    const tilt = r.range(-0.7, 0.7);
    const tallest = CORONA_RADIUS * (g === 0 ? 0.5 : r.range(0.15, 0.34));
    for (let k = 0; k < REGIONS[g]; k++) {
      const height = tallest * (1 - 0.3 * k) * r.range(0.9, 1.1);
      specs.push({
        height,
        half: height * r.range(0.55, 1.25),
        width: height * r.range(0.1, 0.18),
        around: around + r.range(-0.05, 0.05),
        lean: lean + r.range(-0.02, 0.02),
        tilt: tilt + r.range(-0.25, 0.25),
        skew: r.range(-0.45, 0.45),
      });
    }
  }
  // the tallest first, so a cheaper picture drops the small ones
  specs.sort((a, b) => b.height - a.height);
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const base = new THREE.Vector3();
  const across = new THREE.Vector3();
  const lift = new THREE.Vector3();
  for (let l = 0; l < LOOPS; l++) {
    const { height, half, width, around, lean, tilt, skew } = specs[l];
    const ring = reference.clone().applyAxisAngle(toSun, around);
    normal.copy(toSun).multiplyScalar(lean).addScaledVector(ring, Math.sqrt(1 - lean * lean)).normalize();
    // the arc's feet stand along the limb, turned out of the face-on view by `tilt`
    tangent.crossVectors(normal, toSun).normalize().applyAxisAngle(normal, tilt);
    // it leans to one side by `skew`: its top stands off the middle between its feet
    lift.copy(normal).addScaledVector(tangent, skew);
    // the feet sink into the surface as it curves away below the arc's middle
    base.copy(CENTER).addScaledVector(normal, CORONA_RADIUS * Math.cos(half / CORONA_RADIUS));
    const life = r.range(150, 420);
    const phase = r.nextFloat();
    const seed = r.nextFloat();
    const length = Math.PI * Math.sqrt((half * half + height * height) / 2);
    for (let i = 0; i < columns; i++) {
      const s = i / LOOP_SEGMENTS;
      const x = -Math.cos(Math.PI * s) * half;
      const y = Math.sin(Math.PI * s) * height;
      // across the ribbon: the arc's outward normal in its plane, thicker at the top
      across.copy(tangent).multiplyScalar(-Math.cos(Math.PI * s) / half).addScaledVector(normal, Math.sin(Math.PI * s) / height).normalize();
      const thick = width * (0.55 + 0.45 * Math.sin(Math.PI * s));
      for (let j = 0; j < 2; j++) {
        const v = (l * columns + i) * 2 + j;
        const sign = j === 0 ? -1 : 1;
        foot.set([base.x + tangent.x * x, base.y + tangent.y * x, base.z + tangent.z * x], v * 3);
        rise.set([lift.x * y, lift.y * y, lift.z * y], v * 3);
        side.set([across.x * thick * sign, across.y * thick * sign, across.z * thick * sign], v * 3);
        place.set([s, sign], v * 2);
        loop.set([life, phase, seed, length], v * 4);
      }
      if (i > 0) {
        const a = (l * columns + i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  // the shader places the vertices; position is only their resting place, for the bounds
  const position = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) for (let k = 0; k < 3; k++) position[v * 3 + k] = foot[v * 3 + k] + rise[v * 3 + k];
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('foot', new THREE.BufferAttribute(foot, 3));
  geometry.setAttribute('rise', new THREE.BufferAttribute(rise, 3));
  geometry.setAttribute('side', new THREE.BufferAttribute(side, 3));
  geometry.setAttribute('place', new THREE.BufferAttribute(place, 2));
  geometry.setAttribute('loop', new THREE.BufferAttribute(loop, 4));
  geometry.setIndex(index);
  return geometry;
}

/**
 * A quad over the whole picture, drawn straight in clip space at `depth` (1 for the far plane,
 * behind everything; any for an overlay): each pixel gets its ray in the camera's frame and the
 * way to the sun's middle in it, and the sun's angular radius from where the camera is.
 */
const screenVertex = (depth: number) => /* glsl */ `
  uniform vec3 center;
  uniform float radius;
  uniform float behind;
  varying vec3 vRay;
  varying vec3 vSun;
  varying float vSize;
  varying vec2 vScreen;
  void main() {
    vec3 toSun = center - cameraPosition;
    vSun = normalize(mat3(viewMatrix) * toSun);
    vSize = asin(radius / length(toSun));
    vRay = vec3(position.x / projectionMatrix[0][0], position.y / projectionMatrix[1][1], -1.0);
    vScreen = position.xy;
    // an overlay that has nothing to add with the sun this far behind is never drawn
    gl_Position = vSun.z > behind ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(position.xy, ${depth.toFixed(1)}, 1.0);
  }
`;

/** A pixel's angle from the sun's middle, in sun radii (1 on the limb). */
const SUN_ANGLE = /* glsl */ `
  float sunAngle() {
    return acos(clamp(dot(normalize(vRay), vSun), -1.0, 1.0)) / vSize;
  }
`;

/**
 * The sky next to a star: never black. The outer corona and the dust around the sun (seen from
 * Earth far out as the zodiacal light) scatter its light into every direction, brightest along
 * the limb (SCATTER_STRENGTH, linear) and falling off with the angle from the sun's middle about
 * as its square does (SCATTER_FALL, in sun radii), white near the sun and orange farther out;
 * facing away, a dim warm floor (SCATTER_FLOOR, linear) remains. Smooth in every direction,
 * nothing in it to shimmer.
 */
const SCATTER_NEAR = [1.0, 0.86, 0.66] as const;
const SCATTER_FAR = [0.9, 0.42, 0.13] as const;
const SCATTER_FLOOR = [0.05, 0.022, 0.008] as const;
const SCATTER_STRENGTH = 1.6;
const SCATTER_FALL = 2.1;
const vec3 = (rgb: readonly number[]) => `vec3(${rgb.map((c) => c.toFixed(3)).join(', ')})`;
const scatterFragment = /* glsl */ `
  varying vec3 vRay;
  varying vec3 vSun;
  varying float vSize;
  varying vec2 vScreen;
  ${SUN_ANGLE}
  void main() {
    float e = max(sunAngle(), 1.0);
    float near = pow(e, -${SCATTER_FALL.toFixed(1)});
    vec3 color = mix(${vec3(SCATTER_FAR)}, ${vec3(SCATTER_NEAR)}, near) * near * ${SCATTER_STRENGTH.toFixed(2)};
    // the floor, a little warmer on the sun's side of the sky
    float side = 0.5 + 0.5 * dot(normalize(vRay), vSun);
    gl_FragColor = vec4(color + ${vec3(SCATTER_FLOOR)} * (0.6 + 0.8 * side), 1.0);
  }
`;

/**
 * The lens's veil: the sun's light scattered in the camera's own optics over the whole picture,
 * rocks and ships included, by each pixel's angle from the sun (GLARE_STRENGTH, linear, at the
 * sun's middle, falling to about a third over GLARE_REACH sun radii), so it shows as much when the sun stands just past the picture's edge as when it
 * is in view; the edge of the picture on the sun's side flares up more (GLARE_EDGE). It depends
 * on nothing but the camera's direction: no flicker, nothing hidden or revealed by a rock.
 */
const GLARE = [1.0, 0.8, 0.55] as const;
const GLARE_STRENGTH = 0.14;
const GLARE_REACH = 2.2;
const GLARE_EDGE = 0.8;
/** The veil fades out as the sun goes behind the camera and is not drawn at all from here on (the cosine of the sun's angle to straight back: 0.35 is 110° off the view). */
const GLARE_BEHIND = 0.35;
const glareFragment = /* glsl */ `
  varying vec3 vRay;
  varying vec3 vSun;
  varying float vSize;
  varying vec2 vScreen;
  ${SUN_ANGLE}
  void main() {
    float e = sunAngle();
    float veil = exp(-e / ${GLARE_REACH.toFixed(1)});
    // the picture's edge, towards the sun
    vec2 toward = normalize(vSun.xy + 1e-5);
    float edge = smoothstep(0.55, 1.0, max(abs(vScreen.x), abs(vScreen.y))) * max(dot(normalize(vScreen + 1e-5), toward), 0.0);
    float fade = 1.0 - smoothstep(${(GLARE_BEHIND - 0.3).toFixed(2)}, ${GLARE_BEHIND.toFixed(2)}, vSun.z);
    gl_FragColor = vec4(${vec3(GLARE)} * veil * (1.0 + ${GLARE_EDGE.toFixed(1)} * edge) * fade * ${GLARE_STRENGTH.toFixed(2)}, 1.0);
  }
`;

/** Indices a loop takes in the prominences' mesh. */
const LOOP_INDICES = LOOP_SEGMENTS * 6;

/** The Corona's sun: its face, the glow along its limb, its prominences, the sky it lights and its glare in the lens (see the top of this file). */
export class Corona {
  readonly group = new THREE.Group();
  private readonly face: THREE.ShaderMaterial;
  private readonly glow: THREE.ShaderMaterial;
  private readonly loops: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly turn = new THREE.Matrix3();
  private readonly spin = new THREE.Matrix4();

  constructor() {
    this.face = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, fine: { value: 1 }, turn: { value: this.turn }, spots: { value: sunspots() } },
      vertexShader: bandsVertex,
      fragmentShader: sunFragment(),
      toneMapped: false,
    });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(CORONA_RADIUS, 96, 48), this.face);
    sun.position.copy(CENTER);

    const additive = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false } as const;
    this.glow = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, center: { value: CENTER }, radius: { value: CORONA_RADIUS } },
      vertexShader: glowVertex,
      fragmentShader: glowFragment(),
      ...additive,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.glow);
    // the quad is placed in the shader, around the sun, wherever the camera is
    glow.frustumCulled = false;

    const loops = new THREE.Mesh(prominences(), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: prominenceVertex,
      fragmentShader: prominenceFragment(),
      side: THREE.DoubleSide,
      ...additive,
    }));
    // the ribbons rise and fall in the shader, a little beyond their resting bounds
    loops.frustumCulled = false;
    this.loops = loops;

    // the scattered light: at the far plane, where nothing else is drawn, and before every other
    // see-through thing, so they lie over it as over black space; the stars beneath it drown in it
    const screen = new THREE.PlaneGeometry(2, 2);
    const scatter = new THREE.Mesh(screen, new THREE.ShaderMaterial({
      uniforms: { center: { value: CENTER }, radius: { value: CORONA_RADIUS }, behind: { value: 2 } },
      vertexShader: screenVertex(1),
      fragmentShader: scatterFragment,
      ...additive,
    }));
    scatter.renderOrder = -1000;
    // the lens's veil: over everything, last
    const glare = new THREE.Mesh(screen, new THREE.ShaderMaterial({
      uniforms: { center: { value: CENTER }, radius: { value: CORONA_RADIUS }, behind: { value: GLARE_BEHIND } },
      vertexShader: screenVertex(0),
      fragmentShader: glareFragment,
      depthTest: false,
      ...additive,
    }));
    glare.renderOrder = 1000;
    // both are placed in clip space, wherever the camera looks
    scatter.frustumCulled = glare.frustumCulled = false;
    this.group.add(scatter, sun, glow, loops, glare);
  }

  /** The sun at field time `time`: its face turned by SPIN, the glow's streamers and the prominences' lives. */
  update(time: number) {
    // into the face's own frame: back by the angle it has turned since field time 0
    this.turn.setFromMatrix4(this.spin.makeRotationAxis(AXIS, -SPIN * time));
    this.face.uniforms.time.value = time;
    this.glow.uniforms.time.value = time;
    this.loops.material.uniforms.time.value = time;
  }

  /**
   * The picture's quality (see view/quality, Look.landmark): every prominence and the face's
   * finest grain on the full picture; from three quarters of the share down the twelve tallest
   * prominences, below 0.375 eight, and below half the face without its finest grain.
   */
  setDetail(share: number) {
    const loops = share >= 0.75 ? LOOPS : share >= 0.375 ? 12 : 8;
    this.loops.geometry.setDrawRange(0, loops * LOOP_INDICES);
    this.face.uniforms.fine.value = share >= 0.5 ? 1 : 0;
  }
}
