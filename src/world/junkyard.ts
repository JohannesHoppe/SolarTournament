import * as THREE from 'three';
import { Randomizer } from '../random';
import { SUN_DIRECTION } from './space';
import { EARTH_ALTITUDE, EARTH_CENTER, EARTH_DOWN, EARTH_RADIUS } from './arenas';
import { BELT_INNER } from './belt';
import { fbm, noise3 } from './landmarks';
import { signTexture } from '../view/surfaces';

/**
 * The scenery of the Satellite Junkyard: Earth below at night, its air glowing along the rim,
 * now and then a satellite burning up in it, and the thousands of dead satellites, spent upper
 * stages and clouds of fragments of the Orbital Freedom Network rotting in their orbits beyond
 * the arena, with a billboard satellite still flickering the network's name. Scenery only: none
 * of it can be reached, so none of it collides, pulls or breaks; the arena's solid junk is its
 * field (see world/shapes, debrisSet).
 */

/**
 * The region of Earth's night map (`public/assets/planets/earth-*.jpg`, a crop of NASA's Black
 * Marble 2016): longitude and latitude of its west and south edges and its spans (rad), so it
 * covers the whole cap a pilot sees around the point beneath the arena (14° west to 54° east,
 * 7° to 63° north).
 */
const MAP_WEST = THREE.MathUtils.degToRad(-14);
const MAP_SOUTH = THREE.MathUtils.degToRad(7);
const MAP_WIDTH = THREE.MathUtils.degToRad(68);
const MAP_HEIGHT = THREE.MathUtils.degToRad(56);
/** The point beneath the arena: over the Ionian Sea (35° north, 20° east), Europe, Africa's north and the Middle East at night around it, the sun set beyond Spain. */
const BELOW_LATITUDE = THREE.MathUtils.degToRad(35);
const BELOW_LONGITUDE = THREE.MathUtils.degToRad(20);
/** How the map packs land and light into one grey value: 0 ocean, MAP_LAND land without light, up to 1 the brightest light. */
const MAP_LAND = 0.12;
/** The cap of Earth that is built (rad, 26° around the point beneath the arena): its horizon lies 23° around it. */
const EARTH_CAP = 0.45;
/**
 * Earth lies far beyond the camera's far plane: it is drawn behind everything else, at this
 * depth (clip space, a share of the way to the far plane), in front of the stars, which it hides.
 */
const BEHIND_ALL = 0.99999;
/**
 * The air above Earth, as shares of its radius: the blue of the day side scattered within
 * HAZE (51 km, its densest part), the green airglow of the night side in a thin layer from
 * GLOW_LOW to GLOW_HIGH (90 to 105 km, as the real one: seen along the horizon from 550 km up
 * a line of a few pixels, never a flickering hairline). The shell drawn around it reaches AIR.
 */
const HAZE = 0.008;
const GLOW_LOW = 0.0141;
const GLOW_HIGH = 0.0165;
const AIR = 0.022;
/**
 * Satellites burning up in the air: two lanes take a turn every BURN_EVERY seconds of field time
 * (16 s, half a turn apart) and light a streak in BURN_SHARE of their turns (60 %), so one starts
 * about every 13 s, somewhere in the cap beneath the arena; each runs BURN_SECONDS (12 s) across
 * about 160 km, faster than a real one (some 7.5 km/s), so it shows within a fight.
 */
const BURN_EVERY = 16;
const BURN_SHARE = 0.6;
const BURN_SECONDS = 12;

/**
 * The junk on its orbits about Earth, from JUNK_BELOW (12 km) below the arena's orbit to
 * JUNK_ABOVE (15 km) above it: every piece on a circle about Earth's center that passes the
 * field's center no closer than BELT_INNER (where no ship reaches) and no farther than
 * JUNK_REACH (19 km), and is shown within JUNK_WINDOW (24 km) on either side of that pass (it
 * fades out at the window's edge and back in at the other, so the sky never empties, and stays
 * within the camera's far plane). They drift on at 25 m/s, as the field does (a deliberate
 * deviation, see README).
 */
const JUNK_BELOW = 240000;
const JUNK_ABOVE = 300000;
const JUNK_REACH = 380000;
const JUNK_WINDOW = 480000 / (EARTH_RADIUS + EARTH_ALTITUDE);
const JUNK_SPEED = 500;
/** What is out there: strings of satellites still in their launch formation, dead satellites tumbling one by one, shredded ones, spent upper stages, and clouds of fragments. */
const STRINGS = 70;
const STRING_LENGTH = 24;
/** Satellites in a string sit this far apart along their orbit (units, 600 m). */
const STRING_SPACING = 12000;
const TUMBLING = 1300;
const SHREDDED = 300;
const STAGES = 120;
const CLOUDS = 45;
const CLOUD_SIZE = 40;
/** How large each kind is (units): a satellite's wing 160 m, a stage 60 to 110 m, a fragment 4 to 12 m. */
const WING = 3200;
/** Kinds, as the shader tells them apart. */
const SATELLITE = 0;
const SHRED = 1;
const STAGE = 2;
const FRAGMENT = 3;
/** A piece is drawn at least this many device pixels wide and at most so many (see junkVertex). */
const MIN_PIXELS = 2;
const MAX_PIXELS = 64;

/** Where the billboard satellite of the Orbital Freedom Network hangs: away from the sun, above the horizon, 11 km from the field's center (units). */
const BILLBOARD_AT = new THREE.Vector3(-0.35, 0.25, 1).normalize().multiplyScalar(220000);

/** A number as a GLSL float literal. */
const f = (x: number) => x.toFixed(7);

const earthVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_Position.z = gl_Position.w * ${f(BEHIND_ALL)};
  }
`;

/**
 * Earth at night, from its night map (see MAP_LAND), in the 26th century: the lights of today
 * grown into megacities (their glow spread wide, white and neon in the hearts of the biggest),
 * the coasts lit end to end, new cities in what is empty land today; on the side towards the
 * sun the terminator's red and a sliver of day (oceans with the sun's glint, land, clouds).
 * Clouds drift and dim the lights below. Detail finer than the map shows only while it is a few
 * pixels large, so nothing crawls in the distance. Now and then a satellite burns up in the air
 * as a streak with a fiery head (see BURN_EVERY).
 */
const earthFragment = () => /* glsl */ `
  uniform float time;
  uniform vec3 sun;
  uniform vec3 light;
  uniform vec3 center;
  uniform vec3 below;
  uniform mat3 frame;
  uniform sampler2D map;
  uniform float texel;
  uniform vec4 region;
  varying vec3 vWorld;
  ${noise3}
  ${fbm}
  float land(float v) { return smoothstep(0.04, 0.1, v); }
  float lit(float v) { return max(v - ${f(MAP_LAND)}, 0.0) / ${f(1 - MAP_LAND)}; }
  // a satellite burning up: lane k's turn at this time, where it starts, which way it runs
  vec3 burn(vec3 n, float k) {
    float turn = time / ${f(BURN_EVERY)} + k * 0.5;
    float slot = floor(turn);
    float age = fract(turn) * ${f(BURN_EVERY)};
    if (hash(vec3(slot, k, 1.0)) > ${f(BURN_SHARE)} || age > ${f(BURN_SECONDS)}) return vec3(0.0);
    vec3 side = normalize(cross(below, vec3(0.3, 1.0, 0.2)));
    vec3 other = cross(below, side);
    float angle = hash(vec3(slot, k, 2.0)) * 6.2831853;
    vec3 start = normalize(below + (cos(angle) * side + sin(angle) * other) * (0.06 + 0.3 * hash(vec3(slot, k, 3.0))));
    float heading = hash(vec3(slot, k, 4.0)) * 6.2831853;
    vec3 east = normalize(cross(start, other));
    vec3 north = cross(east, start);
    vec3 way = cos(heading) * east + sin(heading) * north;
    float run = 0.025 * age / ${f(BURN_SECONDS)};
    vec3 off = n - start;
    float along = dot(off, way);
    float across = length(off - along * way - dot(off, start) * start);
    float behind = run - along;
    // (exp() only of what lies behind the head: ahead of it, it would overflow)
    float trail = step(0.0, behind) * exp(-max(behind, 0.0) / 0.012) * (1.0 - smoothstep(0.0, 0.04, behind));
    float flare = smoothstep(0.0, 0.4, age) * (1.0 - smoothstep(${f(BURN_SECONDS - 1)}, ${f(BURN_SECONDS)}, age));
    float width = 0.0016 + behind * 0.03;
    float line = exp(-across * across / (width * width)) * trail * flare;
    float head = exp(-(behind * behind + across * across) / 0.000004) * flare;
    // pieces breaking off: two fainter trails beside the main one
    float pieces = exp(-pow(abs(across - 0.0035) / 0.0007, 2.0)) * step(0.0, behind - 0.004) * exp(-max(behind, 0.0) / 0.008) * flare;
    return vec3(1.0, 0.55, 0.22) * (line * 2.5 + pieces * 0.8) + vec3(1.0, 0.9, 0.75) * head * 3.0;
  }
  void main() {
    vec3 n = normalize(vWorld - center);
    vec3 q = frame * n;
    float lat = asin(clamp(q.y, -1.0, 1.0));
    float lon = atan(-q.z, q.x);
    vec2 uv = vec2((lon - region.x) / region.z, (lat - region.y) / region.w);
    float inside = smoothstep(0.0, 0.02, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    float v = texture2D(map, uv).r * inside;
    // the map seen blurred, eight texels wide: how much land is around, how much light
    float wide = texture2D(map, uv, 3.0).r * inside;
    float ground = land(v);
    float coast = ground * (1.0 - smoothstep(0.06, 0.12, wide));
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 toSun = normalize(sun);
    float facing = dot(n, toSun);
    float day = smoothstep(-0.02, 0.18, facing);
    float night = 1.0 - smoothstep(-0.1, 0.03, facing);
    float clouds = smoothstep(0.52, 0.78, fbm(q * 9.0 + vec3(time * 0.002, 0.0, 0.0) + fbm(q * 18.0, 1.0), 1.0));
    // the day side: dark sea, desert towards the south, green and brown to the north, ice in the far north
    float north = smoothstep(0.5, 0.7, lat);
    vec3 dry = mix(vec3(0.5, 0.41, 0.28), vec3(0.36, 0.3, 0.22), noise(q * 60.0));
    vec3 green = mix(vec3(0.16, 0.2, 0.11), vec3(0.24, 0.23, 0.15), noise(q * 70.0));
    vec3 soil = mix(dry, green, north);
    soil = mix(soil, vec3(0.8, 0.84, 0.9), smoothstep(1.2, 1.3, lat));
    vec3 color = mix(vec3(0.015, 0.05, 0.12), soil, ground);
    color = mix(color, vec3(0.92), clouds * 0.9);
    vec3 shade = color * light * day;
    shade += vec3(1.0, 0.92, 0.8) * light * pow(max(dot(reflect(-toSun, n), view), 0.0), 90.0) * (1.0 - ground) * (1.0 - clouds) * day;
    // the night side: land faintly lit by the moon and the glow of the cities
    shade += mix(vec3(0.002, 0.004, 0.012), vec3(0.016, 0.02, 0.036), ground) * night;
    // the lights of the 26th century: today's, boosted and grown together, the coasts lit, new
    // cities in the empty land; the fine grain of streets only while it is large enough on screen
    // (districts 3.5 km across, blocks 900 m, each faded out before it is smaller than a few pixels)
    vec3 district = q * 1800.0;
    vec3 block = q * 7000.0;
    float grain = mix(1.0, 0.35 + 1.3 * noise(district), smoothstep(0.6, 0.25, length(fwidth(district))));
    grain *= mix(1.0, 0.5 + 1.0 * noise(block), smoothstep(0.6, 0.25, length(fwidth(block))));
    float today = lit(v);
    float sprawl = lit(wide);
    float settled = ground * smoothstep(0.66, 0.8, noise(q * 90.0)) * smoothstep(0.4, 0.6, noise(q * 11.0));
    float glow = pow(today, 0.85) * 1.5 * grain + sprawl * 0.9 + coast * 0.4 * (0.6 + 0.8 * noise(q * 400.0)) * grain + settled * 0.15 * grain;
    vec3 warm = vec3(1.0, 0.6, 0.27);
    vec3 white = vec3(1.0, 0.9, 0.78);
    vec3 neon = mix(vec3(0.35, 0.8, 1.0), vec3(1.0, 0.35, 0.85), step(0.5, noise(q * 140.0)));
    vec3 cities = warm * glow + white * smoothstep(0.35, 0.9, today) * 0.8 + neon * smoothstep(0.55, 0.9, sprawl) * 0.5;
    // clouds dim the lights and glow from them below
    shade += cities * night * (1.0 - clouds * 0.75) * 0.6;
    shade += warm * sprawl * clouds * night * 0.15;
    // the terminator: sunlight scattered red through the air
    float dusk = (facing + 0.02) * 16.0;
    shade += vec3(1.0, 0.38, 0.14) * light * exp(-dusk * dusk) * 0.05;
    // blue haze along the limb, lit on the day side
    float limb = 1.0 - clamp(dot(n, view), 0.0, 1.0);
    shade = mix(shade, vec3(0.25, 0.5, 1.0) * light * (0.02 + 0.6 * day), pow(limb, 5.0) * 0.6);
    shade += burn(n, 0.0) + burn(n, 1.0);
    gl_FragColor = vec4(shade, 1.0);
  }
`;

/**
 * The air above Earth seen from outside, on a shell around it: along each ray, the stretch it
 * runs through the hazy lower air and through the airglow's thin layer (analytically, as the
 * chords of their spheres; only the stretch in front of Earth where the ray meets it). Seen from
 * above they are faint, along the rim they add up to a thin bright line: blue where the sun
 * shines, red at the terminator, the faint green of the airglow on the night side, set apart
 * from the planet's dark rim by a dark band.
 */
const airFragment = /* glsl */ `
  uniform vec3 sun;
  uniform vec3 light;
  uniform vec3 center;
  uniform float radius;
  varying vec3 vWorld;
  float chord(float b2, float r) { return 2.0 * sqrt(max(r * r - b2, 0.0)); }
  float through(float b2, float low, float high) {
    float stretch = chord(b2, high) - chord(b2, low);
    return b2 < 1.0 ? 0.5 * stretch : stretch;
  }
  void main() {
    vec3 ray = normalize(vWorld - cameraPosition);
    vec3 from = (cameraPosition - center) / radius;
    float nearest = -dot(from, ray);
    vec3 closest = from + ray * nearest;
    float b2 = dot(closest, closest);
    float haze = through(b2, 1.0, ${f(1 + HAZE)}) / ${f(HAZE)};
    float glow = through(b2, ${f(1 + GLOW_LOW)}, ${f(1 + GLOW_HIGH)}) / ${f(GLOW_HIGH - GLOW_LOW)};
    // the sun on that air: where the ray meets the planet, or above the point nearest it
    vec3 at = b2 < 1.0 ? from + ray * (nearest - sqrt(1.0 - b2)) : closest;
    float facing = dot(normalize(at), normalize(sun));
    float day = smoothstep(-0.06, 0.2, facing);
    float dusk = (facing + 0.02) * 16.0;
    vec3 color = haze * light * (vec3(0.2, 0.42, 1.0) * day * 0.03 + vec3(1.0, 0.42, 0.16) * exp(-dusk * dusk) * 0.02);
    color += glow * vec3(0.45, 0.9, 0.4) * 0.0006 * (1.0 - day * 0.8);
    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * A piece of junk on its orbit (see JUNK_INNER): placed on its circle about Earth's center at the
 * field time, turned (a string keeps its formation, its wings across its orbit and its panels
 * tilted at the angle each was left at; a dead satellite, a stage or a fragment tumbles), and
 * drawn as a point sprite large enough to show its shape: the wing's or the stage's length and
 * direction on screen. Lit by the sun on whichever face the eye sees, and a panel that mirrors
 * the sun towards the eye flashes.
 */
const junkVertex = /* glsl */ `
  uniform float time;
  uniform vec3 center;
  uniform vec3 sun;
  uniform vec3 light;
  uniform float viewport;
  attribute vec4 orbit;
  attribute vec4 body;
  attribute vec4 tumble;
  varying vec3 vWing;
  varying vec3 vBus;
  varying vec2 vAxis;
  varying float vSize;
  varying float vWidth;
  varying float vKind;
  varying float vSeed;
  vec3 turn(vec3 v, vec3 axis, float angle) {
    return v * cos(angle) + cross(axis, v) * sin(angle) + axis * dot(axis, v) * (1.0 - cos(angle));
  }
  void main() {
    vec3 axis = orbit.xyz;
    vec3 arena = -center;
    vec3 u = normalize(arena - dot(arena, axis) * axis);
    vec3 w = cross(axis, u);
    float phi = mod(orbit.w + body.y * time + ${f(JUNK_WINDOW)}, ${f(2 * JUNK_WINDOW)}) - ${f(JUNK_WINDOW)};
    float fade = 1.0 - smoothstep(${f(0.8 * JUNK_WINDOW)}, ${f(JUNK_WINDOW)}, abs(phi));
    vec3 radial = cos(phi) * u + sin(phi) * w;
    vec3 world = center + radial * body.x;
    float kind = body.z;
    // its long axis and the normal of its panel
    vec3 along;
    vec3 normal;
    if (tumble.w < 0.0) {
      // in a string: wing across the orbit, panel tilted from the radial by the string's angle
      along = axis;
      normal = cos(tumble.x) * radial + sin(tumble.x) * cross(axis, radial);
    } else {
      vec3 spin = normalize(tumble.xyz);
      vec3 p = normalize(cross(spin, abs(spin.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
      float angle = tumble.w + length(tumble.xyz) * time;
      vec3 swing = turn(p, spin, angle);
      along = normalize(0.6 * spin + 0.8 * swing);
      normal = cross(spin, swing);
    }
    vec4 view = viewMatrix * vec4(world, 1.0);
    vec4 tip = projectionMatrix * viewMatrix * vec4(world + along * body.w, 1.0);
    gl_Position = projectionMatrix * view;
    float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
    vec2 screen = (tip.xy / tip.w - gl_Position.xy / gl_Position.w) * vec2(viewport * aspect, viewport) * 0.5;
    // a satellite reaches from its bus out along its wing, a stage and a fragment lie centered
    float reach = kind < 1.5 ? length(screen) : length(screen) * 0.5;
    vAxis = screen;
    vSize = clamp(2.0 * reach + 4.0, ${f(MIN_PIXELS + 2)}, ${f(MAX_PIXELS)});
    gl_PointSize = vSize;
    vWidth = max(body.w * (kind > 2.5 ? 0.6 : kind > 1.5 ? 0.22 : 0.16) * projectionMatrix[1][1] * viewport * 0.5 / -view.z, 1.0);
    vKind = kind;
    vSeed = fract(orbit.w * 13.7 + body.x * 0.001);
    // light: the face the eye sees, sunlit or not, and the sun mirrored in it
    vec3 toEye = normalize(cameraPosition - world);
    vec3 toSun = normalize(sun);
    vec3 seen = normal * sign(dot(normal, toEye));
    float sunny = max(dot(seen, toSun), 0.0);
    // (the halfway vector vanishes with the sun straight behind the piece: no glint then, never a NaN)
    vec3 halfway = toSun + toEye;
    float mirror = pow(max(dot(seen, halfway) * inversesqrt(max(dot(halfway, halfway), 1e-6)), 0.0), kind > 2.5 ? 60.0 : kind > 1.5 ? 30.0 : 400.0);
    // the cells face the sun, the panel's back is white
    vec3 face = dot(normal, toEye) > 0.0 ? vec3(0.16, 0.22, 0.42) : vec3(0.62, 0.62, 0.6);
    vec3 paint = kind > 1.5 ? vec3(0.72, 0.7, 0.66) : face;
    vWing = (paint * (0.08 + 0.92 * sunny) + vec3(1.0, 0.96, 0.9) * mirror * (kind > 2.5 ? 1.2 : 2.6)) * light * fade;
    vBus = vec3(0.55, 0.56, 0.6) * (0.35 + 0.65 * max(dot(radial, toSun), 0.0)) * light * fade;
  }
`;

const junkFragment = /* glsl */ `
  varying vec3 vWing;
  varying vec3 vBus;
  varying vec2 vAxis;
  varying float vSize;
  varying float vWidth;
  varying float vKind;
  varying float vSeed;
  void main() {
    vec2 at = (gl_PointCoord - 0.5) * vSize * vec2(1.0, -1.0);
    vec2 from = vKind < 1.5 ? vec2(0.0) : -0.5 * vAxis;
    float t = clamp(dot(at - from, vAxis) / max(dot(vAxis, vAxis), 0.0001), 0.0, 1.0);
    float away = length(at - from - vAxis * t);
    float edge = 0.5 * vWidth;
    float body = smoothstep(edge + 0.75, edge - 0.25, away);
    // a shredded wing has lost pieces
    if (vKind > 0.5 && vKind < 1.5) body *= step(0.3, fract(t * 2.7 + vSeed));
    vec3 color = vWing * body;
    float cover = body;
    if (vKind < 1.5) {
      // the bus at the wing's root
      float bus = smoothstep(1.4, 0.6, length(at));
      color = mix(color, vBus, bus);
      cover = max(cover, bus);
    }
    if (cover < 0.01) discard;
    gl_FragColor = vec4(color, cover);
  }
`;

/** The scenery of the junkyard, and what Landmarks drives of it: the materials that run on the field time, those sized by the picture's height, Earth's (its map swapped by quality), and the signs that flicker. */
export interface Junkyard {
  group: THREE.Group;
  earth: THREE.ShaderMaterial;
  timed: THREE.ShaderMaterial[];
  sized: THREE.ShaderMaterial[];
  flicker: THREE.Mesh[];
}

/** Earth's frame: from a direction out of its center in the world to the same in its own (x through latitude 0, longitude 0; y through the north pole; east along -z). */
function earthFrame(): THREE.Matrix3 {
  const up = EARTH_DOWN.clone().negate();
  // the sun has set in the west
  const toSun = new THREE.Vector3().copy(SUN_DIRECTION);
  const east = toSun.addScaledVector(up, -toSun.dot(up)).normalize().negate();
  const north = new THREE.Vector3().crossVectors(up, east);
  const [lat, lon] = [BELOW_LATITUDE, BELOW_LONGITUDE];
  const ownUp = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
  const ownEast = new THREE.Vector3(-Math.sin(lon), 0, -Math.cos(lon));
  const ownNorth = new THREE.Vector3().crossVectors(ownUp, ownEast);
  const world = new THREE.Matrix4().makeBasis(up, east, north);
  const own = new THREE.Matrix4().makeBasis(ownUp, ownEast, ownNorth);
  return new THREE.Matrix3().setFromMatrix4(own.multiply(world.transpose()));
}

/** A cap of a sphere around the point beneath the arena (see EARTH_CAP), its pole turned up towards the arena. */
function cap(radius: number, angle: number, width: number, height: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, width, height, 0, Math.PI * 2, 0, angle);
  return geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), EARTH_DOWN.clone().negate()));
}

/** Earth below, and the air above it. */
function earth(map: THREE.Texture, light: THREE.Color): { planet: THREE.Mesh; air: THREE.Mesh; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sun: { value: SUN_DIRECTION.clone() },
      light: { value: light },
      center: { value: EARTH_CENTER },
      below: { value: EARTH_DOWN.clone().negate() },
      frame: { value: earthFrame() },
      map: { value: map },
      texel: { value: 1 / (map.image as { width: number }).width },
      region: { value: new THREE.Vector4(MAP_WEST, MAP_SOUTH, MAP_WIDTH, MAP_HEIGHT) },
    },
    vertexShader: earthVertex,
    fragmentShader: earthFragment(),
    // drawn with the transparent things, first of them after the sky's glows, which it hides
    // (see BEHIND_ALL); everything nearer is drawn over it
    transparent: true,
    depthWrite: false,
  });
  const planet = new THREE.Mesh(cap(EARTH_RADIUS, EARTH_CAP, 192, 48), material);
  planet.position.copy(EARTH_CENTER);
  planet.renderOrder = -2;
  planet.frustumCulled = false;
  const air = new THREE.Mesh(
    cap(EARTH_RADIUS * (1 + AIR), EARTH_CAP + 0.02, 192, 48),
    new THREE.ShaderMaterial({
      uniforms: { sun: { value: SUN_DIRECTION.clone() }, light: { value: light }, center: { value: EARTH_CENTER }, radius: { value: EARTH_RADIUS } },
      vertexShader: earthVertex,
      fragmentShader: airFragment,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  air.position.copy(EARTH_CENTER);
  air.renderOrder = -1;
  air.frustumCulled = false;
  return { planet, air, material };
}

/**
 * A circle about Earth's center for a piece of junk: its axis and radius, such that its pass by
 * the field's center (see JUNK_REACH) lies beyond BELT_INNER (with a margin): the circle's plane
 * runs within a few kilometers of the arena, its radius within the junk's heights.
 */
function junkOrbit(r: Randomizer): { axis: THREE.Vector3; radius: number } {
  const height = EARTH_RADIUS + EARTH_ALTITUDE;
  const up = EARTH_DOWN.clone().negate();
  const across = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize();
  for (;;) {
    // an axis square to the way up, turned about it at random, then tilted off the arena a little
    const turn = r.range(0, Math.PI * 2);
    const axis = across.clone().applyAxisAngle(up, turn).addScaledVector(up, r.range(-1, 1) * (JUNK_REACH / height)).normalize();
    const radius = height + r.range(-JUNK_BELOW, JUNK_ABOVE);
    // the circle's nearest pass: its plane tilted by asin(|axis·up|) from the arena
    const tilt = Math.asin(Math.min(1, Math.abs(axis.dot(up))));
    const nearest = Math.sqrt((radius - height) ** 2 + 2 * radius * height * (1 - Math.cos(tilt)));
    if (nearest > BELT_INNER * 1.1 && nearest < JUNK_REACH) return { axis, radius };
  }
}

/**
 * The junk beyond the arena, from a fixed seed, so every Host sees the same sky: per piece its
 * circle's axis and its angle at field time 0 (`orbit`), its circle's radius, angular speed,
 * kind and size (`body`), and how it turns (`tumble`: a spin axis scaled by its rate and the
 * angle at time 0; for a satellite in a string the tilt of its panel and -1).
 */
export function junkData(): { orbit: number[]; body: number[]; tumble: number[] } {
  const r = new Randomizer(4041);
  const orbit: number[] = [];
  const body: number[] = [];
  const tumble: number[] = [];
  const speed = (radius: number) => (JUNK_SPEED / radius) * (r.nextFloat() < 0.5 ? 1 : -1);
  const tumbling = (rate: number) => {
    const spin = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize().multiplyScalar(r.range(0.2, 1) * rate);
    return [spin.x, spin.y, spin.z, r.range(0, Math.PI * 2)];
  };
  const add = (axis: THREE.Vector3, angle: number, radius: number, rate: number, kind: number, size: number, turn: number[]) => {
    orbit.push(axis.x, axis.y, axis.z, angle);
    body.push(radius, rate, kind, size);
    tumble.push(...turn);
  };
  for (let s = 0; s < STRINGS; s++) {
    const { axis, radius } = junkOrbit(r);
    const rate = speed(radius);
    const start = r.range(-JUNK_WINDOW, JUNK_WINDOW);
    const tilt = r.range(-1.2, 1.2);
    for (let i = 0; i < STRING_LENGTH; i++) {
      // now and then a gap where a satellite of the string died or drifted off
      if (r.nextFloat() < 0.08) continue;
      add(axis, start + (i * STRING_SPACING) / radius, radius + r.range(-300, 300), rate, SATELLITE, WING * r.range(0.95, 1.05), [tilt + r.range(-0.05, 0.05), 0, 0, -1]);
    }
  }
  for (let i = 0; i < TUMBLING + SHREDDED; i++) {
    const { axis, radius } = junkOrbit(r);
    add(axis, r.range(-JUNK_WINDOW, JUNK_WINDOW), radius, speed(radius), i < TUMBLING ? SATELLITE : SHRED, WING * r.range(0.8, 1.1), tumbling(0.6));
  }
  for (let i = 0; i < STAGES; i++) {
    const { axis, radius } = junkOrbit(r);
    add(axis, r.range(-JUNK_WINDOW, JUNK_WINDOW), radius, speed(radius), STAGE, r.range(1200, 2200), tumbling(0.15));
  }
  for (let c = 0; c < CLOUDS; c++) {
    const { axis, radius } = junkOrbit(r);
    const rate = speed(radius);
    const middle = r.range(-JUNK_WINDOW, JUNK_WINDOW);
    for (let i = 0; i < CLOUD_SIZE; i++) {
      // the cloud of what one collision left: spread 250 m across and up its orbit, 500 m along it
      const tilted = axis.clone().add(new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).multiplyScalar(5000 / radius)).normalize();
      add(tilted, middle + r.range(-10000, 10000) / radius, radius + r.range(-5000, 5000), rate * r.range(0.98, 1.02), FRAGMENT, r.range(80, 240), tumbling(1.5));
    }
  }
  return { orbit, body, tumble };
}

/** The junk beyond the arena (see junkData): one draw call of point sprites (see junkVertex). */
function junk(light: THREE.Color): THREE.Points {
  const { orbit, body, tumble } = junkData();
  const geometry = new THREE.BufferGeometry();
  const count = body.length / 4;
  // the points lie where the shader puts them; the attribute only sizes the draw
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('orbit', new THREE.Float32BufferAttribute(orbit, 4));
  geometry.setAttribute('body', new THREE.Float32BufferAttribute(body, 4));
  geometry.setAttribute('tumble', new THREE.Float32BufferAttribute(tumble, 4));
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, center: { value: EARTH_CENTER }, sun: { value: SUN_DIRECTION.clone() }, light: { value: light }, viewport: { value: 1000 } },
    vertexShader: junkVertex,
    fragmentShader: junkFragment,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/** The billboard satellite of the Orbital Freedom Network: a dark frame with the network's name in neon, its power failing, a solar wing beside it. */
function billboard(): { group: THREE.Group; sign: THREE.Mesh } {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(34000, 9500, 600), new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.8, metalness: 0.3 }));
  frame.position.z = -400;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(32000, 8000),
    new THREE.MeshBasicMaterial({ map: signTexture('ORBITAL FREEDOM', '#ff4fd8'), color: new THREE.Color().setScalar(1.6), toneMapped: false, transparent: true }),
  );
  const wing = new THREE.Mesh(new THREE.BoxGeometry(30000, 5000, 120), new THREE.MeshStandardMaterial({ color: 0x1d2a55, roughness: 0.35, metalness: 0.3 }));
  wing.position.set(0, -11000, -400);
  wing.rotation.x = 0.5;
  group.add(frame, sign, wing);
  group.position.copy(BILLBOARD_AT);
  group.lookAt(0, 0, 0);
  group.rotateZ(-0.12);
  return { group, sign };
}

/** Builds the junkyard's scenery around Earth's night map and the arena's sunlight (see Landmarks.show). */
export function junkyard(map: THREE.Texture, light: THREE.Color): Junkyard {
  const group = new THREE.Group();
  const { planet, air, material } = earth(map, light);
  const scrap = junk(light);
  const { group: sign, sign: neon } = billboard();
  group.add(planet, air, scrap, sign);
  const junkMaterial = scrap.material as THREE.ShaderMaterial;
  return { group, earth: material, timed: [material, junkMaterial], sized: [junkMaterial], flicker: [neon] };
}
