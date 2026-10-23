import * as THREE from 'three';
import { Randomizer } from '../random';
import { SUN_DIRECTION } from './space';
import { ARENAS, HOLE_RADIUS, KESSLER_WORLD, KRONOS_CENTER, sternAt, type ArenaId, type ArenaProfile } from './arenas';
import { canvas, toTexture } from '../view/textures';

/**
 * What an arena shows beyond its field: the ringed planet whose ring the arena lies in, the
 * planet below the Kessler field, the gas giant, the sun up close, the black hole with its
 * disk, the neon sign on the derelict. Scenery only; what pulls and blocks is the field's well.
 */

/** The ringed planet's radius (units); it lies at KRONOS_CENTER, its ring runs through the arena. */
const KRONOS_RADIUS = 90000;
/** The ring around it, from and to (units). */
const RING_INNER = 150000;
const RING_OUTER = 330000;
/** The ring's sheet fades in between these distances from the pilot (units, 1.5 to 6 km). */
const RING_FADE_NEAR = 30000;
const RING_FADE_FAR = 120000;
/** Specks of ice drifting around the pilot in the ring, and the slab they fill (units). */
const ICE_SPECKS = 2500;
const ICE_SLAB = 60000;
/** The ringed planet's axis leans this far towards the arena (rad), so its bands lie askew. */
const KRONOS_TILT = 0.35;
/**
 * The gas giant shows only the cap around the point below the arena, this far around (rad, 35°):
 * its horizon lies within 29° for a ship at the arena's top edge, a little more off to the side.
 */
const GIANT_CAP = 0.62;
/** The arena hangs over this latitude of the gas giant (rad, 15° north): its belts run across the view. */
const GIANT_LATITUDE = 0.26;
/** The sun of the corona arena: a sphere this large at this distance (units). */
const CORONA_RADIUS = 62000;
const CORONA_DISTANCE = 240000;
/** The black hole's disk: from and to (units, 300 m to 1.4 km). */
const DISK_INNER = 6000;
const DISK_OUTER = 28000;

/** Smooth value noise in 3D for the shaders of planets, suns and the solar flare (visuals only, so float hashing is fine). */
export const noise3 = /* glsl */ `
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;

export const bandsVertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vLocal = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vView = -view.xyz;
    gl_Position = projectionMatrix * view;
  }
`;

/**
 * Noise in octaves (fractal Brownian motion) over noise3: the first three octaves always, the
 * finer ones weighed by `fine`, so detail that would only shimmer far off fades out there.
 */
export const fbm = /* glsl */ `
  float fbm(vec3 p, float fine) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 6; i++) {
      if (i >= 3 && fine <= 0.0) break;
      sum += amplitude * (i < 3 ? 1.0 : fine) * noise(p);
      p = p * 2.03 + 17.1;
      amplitude *= 0.5;
    }
    return sum;
  }
`;

/** A planet's vertex shader for the shaders below: its own point (for the pattern), its normal and position in the world (for light and view). */
const planetVertex = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * A gas giant's clouds: bands by latitude (in the planet's own frame, turned by `frame`, slowly
 * spinning), bent by large flows and curling into eddies and festoons along their edges, drawn
 * out into streaks by the winds, with fine cloud grain for a pilot just above the tops; a great storm turning in an oval (`spot`),
 * white ovals along a band; sunlight with a soft terminator where the upper air scatters it red;
 * lightning in the night side's storms and aurora over the poles (`storms`); haze along the limb.
 */
const gasFragment = /* glsl */ `
  uniform float time;
  uniform vec3 sun;
  uniform mat3 frame;
  uniform vec3 zone;
  uniform vec3 belt;
  uniform vec3 dark;
  uniform vec3 haze;
  uniform float spot;
  uniform float storms;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  ${noise3}
  ${fbm}
  /** An oval of half widths (lon, lat) around (lonC, latC): 1 at its rim, 0 in its middle. */
  float oval(float lon, float lat, float lonC, float latC, vec2 size) {
    float dLon = mod(lon - lonC + 3.14159265, 6.2831853) - 3.14159265;
    return length(vec2(dLon / size.x, (lat - latC) / size.y));
  }
  void main() {
    vec3 p = normalize(frame * vLocal);
    float spin = time * 0.0004;
    vec3 q = vec3(cos(spin) * p.x - sin(spin) * p.z, p.y, sin(spin) * p.x + cos(spin) * p.z);
    float fine = clamp(1.0 - distance(cameraPosition, vWorld) / 250000.0, 0.0, 1.0);
    float lat = asin(clamp(q.y, -1.0, 1.0));
    float lon = atan(q.z, q.x);
    // large flows bend the bands, swirls curl them into festoons, eddies fray their edges
    float flow = fbm(q * 8.0, 0.0);
    float swirl = fbm(q * 40.0 + flow * 3.0, 1.0);
    float eddies = fbm(q * 160.0 + vec3(swirl * 6.0, 0.0, time * 0.002), fine);
    float bent = lat + 0.04 * (flow - 0.5) + 0.02 * (swirl - 0.5) + 0.008 * (eddies - 0.5);
    float profile = 0.6 * sin(bent * 70.0) + 0.4 * sin(bent * 23.0 + 1.0);
    // the winds draw everything out along the bands: streaks long in longitude, thin in latitude
    float streaks = fbm(vec3(q.x * 50.0, bent * 1200.0, q.z * 50.0), fine);
    float inBelt = smoothstep(-0.3, 0.3, profile);
    float tint = 0.5 + 0.5 * sin(bent * 9.0 + 1.3);
    vec3 color = mix(zone, mix(belt, dark, tint * 0.5), inBelt);
    // within the belts dark streaks, within the zones bright puffs, both drawn by the eddies
    color = mix(color, dark, inBelt * smoothstep(0.45, 0.75, eddies) * 0.5);
    color = mix(color, zone * 1.15, (1.0 - inBelt) * smoothstep(0.5, 0.8, swirl) * 0.4);
    color *= 0.85 + 0.3 * streaks;
    // the grain of the cloud tops, seen from just above them
    float grain = fbm(q * 900.0 + eddies * 3.0, fine);
    color *= 0.75 + 0.5 * mix(0.5, grain, fine);
    if (spot > 0.0) {
      // the great storm: a red oval turning in itself, a pale collar around it
      float r = oval(lon, lat, -0.16, 0.18, vec2(0.12, 0.06));
      color = mix(color, zone * 1.15, smoothstep(1.4, 1.05, r) * 0.6);
      if (r < 1.05) {
        float dLon = mod(lon + 0.16 + 3.14159265, 6.2831853) - 3.14159265;
        float turn = atan(lat - 0.18, dLon * 0.5) + r * 5.0 - time * 0.02;
        float arms = 0.5 + 0.5 * sin(turn * 3.0 + fbm(q * 200.0, fine) * 4.0);
        vec3 storm = mix(vec3(0.6, 0.2, 0.1), vec3(0.88, 0.45, 0.26), arms);
        color = mix(color, storm, smoothstep(1.05, 0.8, r));
      }
      // white ovals, smaller storms of their own along a band to the north
      for (int i = 0; i < 4; i++) {
        float o = oval(lon, lat, -0.1 + float(i) * 0.11, 0.33, vec2(0.025, 0.014));
        color = mix(color, vec3(0.95, 0.93, 0.88), smoothstep(1.0, 0.6, o + 0.2 * (eddies - 0.5)));
      }
    }
    vec3 n = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    float light = dot(n, normalize(sun));
    float day = smoothstep(-0.08, 0.3, light);
    // daylight stays below the bloom's threshold, so the clouds never glow
    vec3 lit = color * (0.03 + 0.95 * day);
    // the terminator glows: sunlight scattered red through the upper air
    lit += vec3(1.0, 0.45, 0.2) * exp(-pow(light * 7.0, 2.0)) * 0.18;
    if (storms > 0.0) {
      // lightning flickering in the night side's storms
      vec3 cells = q * 260.0;
      float flash = hash(floor(cells) + floor(time * 4.0));
      float bolt = step(0.9993, flash) * smoothstep(0.5, 0.0, length(fract(cells) - 0.5));
      lit += vec3(0.75, 0.82, 1.0) * bolt * (1.0 - day) * 1.6;
      // aurora over the poles
      float polar = smoothstep(0.82, 0.95, abs(q.y));
      lit += vec3(0.3, 1.0, 0.6) * polar * (0.5 + 0.5 * sin(lon * 20.0 + time * 0.3)) * (1.0 - day) * 0.4;
    }
    // haze along the limb
    float limb = 1.0 - clamp(dot(n, view), 0.0, 1.0);
    lit = mix(lit, haze * (0.15 + day), pow(limb, 4.0) * 0.8);
    gl_FragColor = vec4(lit, 1.0);
  }
`;

/**
 * A world with air and water, worn by the regime: dark oceans with the sun's glint, grey and
 * brown continents, ice at the poles, clouds that drift, and on the night side the orange glow of
 * its sprawling cities; blue haze along the limb.
 */
const worldFragment = /* glsl */ `
  uniform float time;
  uniform vec3 sun;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vWorld;
  ${noise3}
  ${fbm}
  void main() {
    vec3 p = normalize(vLocal);
    float fine = clamp(1.0 - distance(cameraPosition, vWorld) / 600000.0, 0.0, 1.0);
    float height = fbm(p * 3.0 + fbm(p * 6.0, 1.0) * 0.6, fine);
    float land = smoothstep(0.49, 0.52, height);
    float ice = smoothstep(0.78, 0.86, abs(p.y) + (height - 0.5) * 0.2);
    vec3 ocean = mix(vec3(0.02, 0.07, 0.2), vec3(0.04, 0.16, 0.34), smoothstep(0.3, 0.49, height));
    vec3 ground = mix(vec3(0.32, 0.29, 0.24), vec3(0.2, 0.22, 0.17), fbm(p * 30.0, fine));
    vec3 color = mix(mix(ocean, ground, land), vec3(0.9, 0.93, 0.97), ice);
    float clouds = smoothstep(0.56, 0.8, fbm(p * 7.0 + vec3(time * 0.003, 0.0, 0.0) + fbm(p * 14.0, fine), fine));
    color = mix(color, vec3(0.9), clouds * 0.85);
    vec3 n = normalize(vNormal);
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 toSun = normalize(sun);
    float light = dot(n, toSun);
    float day = smoothstep(-0.05, 0.25, light);
    vec3 lit = color * (0.02 + 0.8 * day);
    // the sun's glint on open water
    lit += vec3(1.0, 0.92, 0.8) * pow(max(dot(reflect(-toSun, n), view), 0.0), 60.0) * (1.0 - land) * (1.0 - clouds) * day * 0.8;
    // the cities at night: the regime never switches off the lights of its sprawl
    float cities = step(0.62, noise(p * 260.0)) * smoothstep(0.55, 0.7, noise(p * 40.0));
    lit += vec3(1.0, 0.6, 0.25) * cities * land * (1.0 - ice) * (1.0 - clouds) * (1.0 - day) * 0.9;
    float limb = 1.0 - clamp(dot(n, view), 0.0, 1.0);
    lit = mix(lit, vec3(0.3, 0.55, 1.0) * (0.1 + 0.8 * day), pow(limb, 3.0) * 0.7);
    gl_FragColor = vec4(lit, 1.0);
  }
`;

/**
 * The surface of a sun up close: boiling cells of plasma, a fine granulation over them, groups of
 * dark sunspots with their paler rims, hotter towards the middle.
 */
const sunFragment = /* glsl */ `
  uniform float time;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  ${noise3}
  void main() {
    vec3 p = normalize(vLocal);
    float cells = noise(p * 14.0 + time * 0.05) * 0.5 + noise(p * 40.0 - time * 0.11) * 0.3 + noise(p * 160.0 + time * 0.3) * 0.2;
    float center = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    vec3 color = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.5), cells * 0.7 + center * 0.5);
    float spots = noise(p * 5.0 + 11.0) * 0.7 + noise(p * 24.0) * 0.3;
    float penumbra = smoothstep(0.7, 0.73, spots);
    float umbra = smoothstep(0.75, 0.78, spots);
    color *= 1.0 - 0.45 * penumbra - 0.45 * umbra;
    // bright enough to bloom, not so bright that the cells and spots wash out to white
    gl_FragColor = vec4(color * (0.75 + 0.55 * center), 1.0);
  }
`;

const diskVertex = /* glsl */ `
  varying vec2 vPlane;
  varying vec3 vToCamera;
  void main() {
    vPlane = position.xy;
    vToCamera = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The black hole's disk: hot gas spiraling in, white-hot at the inner edge, orange and dark further out. */
const diskFragment = /* glsl */ `
  uniform float time;
  uniform float inner;
  uniform float outer;
  varying vec2 vPlane;
  varying vec3 vToCamera;
  ${noise3}
  void main() {
    float r = length(vPlane);
    float t = clamp((r - inner) / (outer - inner), 0.0, 1.0);
    float angle = atan(vPlane.y, vPlane.x);
    // the inner gas circles faster: the spiral winds up towards the hole; the streams are drawn
    // on a circle, so they close without a seam
    float spin = angle + time * (0.9 / (0.15 + t));
    vec2 around = vec2(cos(spin), sin(spin));
    float streaks = noise(vec3(around * 6.0, t * 18.0)) * 0.5 + noise(vec3(around * 19.0, t * 50.0)) * 0.3 + noise(vec3(around * 60.0, t * 160.0)) * 0.2;
    float heat = pow(1.0 - t, 2.2);
    vec3 color = mix(vec3(0.9, 0.25, 0.04), vec3(1.0, 0.85, 0.65), heat);
    float fade = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.6, 1.0, t));
    // dark lanes between the bright streams, so the spiral reads
    float lanes = smoothstep(0.35, 0.75, streaks);
    // where the gas streams towards the pilot it shines brighter and bluer, where it streams away dimmer
    float beaming = dot(vec3(-sin(angle), cos(angle), 0.0), normalize(vToCamera));
    color = mix(color, color * vec3(0.8, 0.9, 1.3), max(beaming, 0.0) * (1.0 - t));
    gl_FragColor = vec4(color * (0.08 + 0.9 * heat) * lanes * fade * (1.0 + 0.5 * beaming), 1.0);
  }
`;

/** A neon sign: the text as a tube of white with layered glow, on black for additive blending. */
function neonSign(text: string, color: string, glow: string): THREE.Mesh {
  const [element, ctx] = canvas(1024, 256);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, element.width, element.height);
  ctx.font = '700 150px Michroma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [blur, style] of [[60, glow], [28, glow], [10, color], [0, '#fff']] as const) {
    ctx.shadowBlur = blur;
    ctx.shadowColor = style;
    ctx.fillStyle = style;
    ctx.fillText(text, element.width / 2, element.height / 2);
  }
  const material = new THREE.MeshBasicMaterial({ map: toTexture(element), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(10000, 2500), material);
}

/** The scenery of every arena, built once; only the one of the arena in play is shown. */
export class Landmarks {
  readonly group = new THREE.Group();
  private readonly scenes = new Map<ArenaId, THREE.Group>();
  private readonly timed: THREE.ShaderMaterial[] = [];
  private readonly flicker: THREE.Mesh[] = [];
  private shown: ArenaId | null = null;

  constructor() {
    this.scenes.set('rings', this.rings());
    this.scenes.set('kessler', this.kessler());
    this.scenes.set('giant', this.giant());
    this.scenes.set('corona', this.corona());
    this.scenes.set('hole', this.hole());
    this.scenes.set('derelict', this.derelict());
    for (const scene of this.scenes.values()) {
      scene.visible = false;
      this.group.add(scene);
    }
  }

  show(arena: ArenaProfile) {
    if (this.shown === arena.id) return;
    this.shown = arena.id;
    for (const [id, scene] of this.scenes) scene.visible = id === arena.id;
  }

  update(time: number) {
    for (const material of this.timed) material.uniforms.time.value = time;
    // the neon of the derelict stutters now and then, as a sign on emergency power does
    for (const sign of this.flicker) (sign.material as THREE.MeshBasicMaterial).opacity = Math.random() < 0.03 ? 0.25 : 1;
  }

  /**
   * A gas planet over `geometry`: its bands in `palette` (zone, belt, dark, haze), its own frame
   * turned by `frame`; `storms` adds the great storm, lightning and aurora.
   */
  private gas(geometry: THREE.BufferGeometry, palette: [number, number, number, number], frame: THREE.Matrix3, storms: boolean): THREE.Mesh {
    const [zone, belt, dark, haze] = palette.map((color) => new THREE.Color(color));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        sun: { value: SUN_DIRECTION.clone() },
        frame: { value: frame },
        zone: { value: zone },
        belt: { value: belt },
        dark: { value: dark },
        haze: { value: haze },
        spot: { value: storms ? 1 : 0 },
        storms: { value: storms ? 1 : 0 },
      },
      vertexShader: planetVertex,
      fragmentShader: gasFragment,
    });
    this.timed.push(material);
    return new THREE.Mesh(geometry, material);
  }

  /** A world with air and water (see worldFragment). */
  private world(radius: number): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, sun: { value: SUN_DIRECTION.clone() } },
      vertexShader: planetVertex,
      fragmentShader: worldFragment,
    });
    this.timed.push(material);
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 64), material);
  }

  private rings(): THREE.Group {
    const group = new THREE.Group();
    const center = KRONOS_CENTER;
    // pale bands, its axis tilted a little towards the arena, so the ring and the bands lie askew
    const planet = this.gas(new THREE.SphereGeometry(KRONOS_RADIUS, 128, 64), [0xe8dcc0, 0xcdb58a, 0x9c7c56, 0x9fc4ff], new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationX(KRONOS_TILT)), false);
    planet.position.copy(center);
    // the ring: bands of ice in the planet's equator plane, which is the arena's horizon
    const [element, ctx] = canvas(1024, 1);
    const r = new Randomizer(1610);
    for (let x = 0; x < element.width; x++) {
      const density = 0.25 + 0.75 * r.nextFloat() * (0.6 + 0.4 * Math.sin(x * 0.05));
      const gap = x > 610 && x < 650 ? 0.05 : 1;
      ctx.fillStyle = `rgba(220, 230, 255, ${(density * gap * 0.55).toFixed(3)})`;
      ctx.fillRect(x, 0, 1, 1);
    }
    const texture = toTexture(element);
    const ring =new THREE.RingGeometry(RING_INNER, RING_OUTER, 256, 1);
    // the texture runs from the inner to the outer edge
    const uv = ring.attributes.uv;
    const p = new THREE.Vector3();
    for (let i = 0; i < uv.count; i++) {
      p.fromBufferAttribute(ring.attributes.position, i);
      uv.setXY(i, (p.length() - RING_INNER) / (RING_OUTER - RING_INNER), 0.5);
    }
    // seen from inside the ring the sheet would fill the view: up close it fades out, and the
    // chunks of ice and the specks around the pilot are the ring
    const disk = new THREE.Mesh(
      ring,
      new THREE.ShaderMaterial({
        uniforms: { map: { value: texture }, near: { value: RING_FADE_NEAR }, far: { value: RING_FADE_FAR } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            vUv = uv;
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D map;
          uniform float near;
          uniform float far;
          varying vec2 vUv;
          varying vec3 vWorld;
          void main() {
            vec4 color = texture2D(map, vUv);
            color.a *= smoothstep(near, far, distance(vWorld, cameraPosition));
            gl_FragColor = color;
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.copy(center);
    // specks of ice all around the pilot, flat like the ring
    const specks = new Float32Array(ICE_SPECKS * 3);
    for (let i = 0; i < ICE_SPECKS; i++) specks.set([r.range(-1, 1) * ICE_SLAB * 1.6, r.range(-1, 1) * 2500, r.range(-1, 1) * ICE_SLAB * 1.6], i * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(specks, 3));
    const ice = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 60, transparent: true, opacity: 0.8, depthWrite: false }));
    group.add(planet, disk, ice);
    return group;
  }

  private kessler(): THREE.Group {
    const group = new THREE.Group();
    // the world the station circled, far below: oceans, clouds, the lights of its cities
    const planet = this.world(180000);
    planet.position.copy(KESSLER_WORLD);
    group.add(planet);
    return group;
  }

  /**
   * The gas giant, where the arena's well is: only the cap a pilot can see is built, the rest lies
   * beyond the horizon; its frame turns its bands so the arena hangs over its northern belts, the
   * great storm, 10 km wide, turning some 7 km off and drifting past as the planet spins.
   */
  private giant(): THREE.Group {
    const group = new THREE.Group();
    const well = ARENAS.find((arena) => arena.id === 'giant')!.layout.well!;
    const cap = new THREE.SphereGeometry(well.radius, 256, 96, 0, Math.PI * 2, 0, GIANT_CAP);
    const frame = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationZ(GIANT_LATITUDE - Math.PI / 2));
    const planet = this.gas(cap, [0xead8b4, 0xb0683a, 0x6e3418, 0xffc490], frame, true);
    planet.position.copy(well.position);
    group.add(planet);
    return group;
  }

  private corona(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: bandsVertex, fragmentShader: sunFragment, toneMapped: false });
    this.timed.push(material);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(CORONA_RADIUS, 96, 48), material);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(CORONA_DISTANCE);
    group.add(sun);
    return group;
  }

  private hole(): THREE.Group {
    const group = new THREE.Group();
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(HOLE_RADIUS, 48, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, inner: { value: DISK_INNER }, outer: { value: DISK_OUTER } },
      vertexShader: diskVertex,
      fragmentShader: diskFragment,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.timed.push(material);
    const disk = new THREE.Mesh(new THREE.RingGeometry(DISK_INNER, DISK_OUTER, 256, 8), material);
    disk.rotation.x = -Math.PI / 2;
    group.add(horizon, disk);
    return group;
  }

  private derelict(): THREE.Group {
    const group = new THREE.Group();
    // a sponsor's sign on both flanks of the bow, still lit, and one on the stern
    const sign = neonSign('VICTORY COLA', '#ff3fa4', '#ff0080');
    sign.position.set(-30000, 0, 2300);
    const back = sign.clone();
    back.position.z = -2300;
    back.rotation.y = Math.PI;
    const name = neonSign('SOLAR WALL', '#7fb2ff', '#0062ff');
    const [x, y] = sternAt(25000);
    name.position.set(x, y, 5400);
    name.rotation.z = 0.22;
    this.flicker.push(sign, back);
    group.add(sign, back, name);
    return group;
  }
}
