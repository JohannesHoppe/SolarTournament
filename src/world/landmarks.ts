import * as THREE from 'three';
import { Randomizer } from '../random';
import { SUN_DIRECTION } from './space';
import { sternAt, type ArenaId, type ArenaProfile } from './arenas';
import { canvas, toTexture } from '../view/textures';

/**
 * What an arena shows beyond its field: the ringed planet whose ring the arena lies in, the
 * planet below the Kessler field, the gas giant, the sun up close, the black hole with its
 * disk, the neon sign on the derelict. Scenery only; what pulls and blocks is the field's well.
 */

/** Distance of the ringed planet from the arena (units, 13 km) and its radius; its ring runs through the arena. */
const KRONOS_DISTANCE = 260000;
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

/** A gas giant: bands of cloud by latitude, stirred by noise and slowly turning, lit by the sun, with a glowing rim of atmosphere. */
const bandsFragment = /* glsl */ `
  uniform float time;
  uniform vec3 sun;
  uniform vec3 colorA;
  uniform vec3 colorB;
  uniform vec3 colorC;
  uniform vec3 rim;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  ${noise3}
  void main() {
    vec3 p = normalize(vLocal);
    float angle = time * 0.004;
    p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
    float swirl = noise(p * 6.0) * 0.5 + noise(p * 17.0) * 0.25;
    float band = sin(p.y * 22.0 + swirl * 3.0) * 0.5 + 0.5;
    vec3 color = mix(colorA, colorB, band);
    color = mix(color, colorC, smoothstep(0.55, 0.8, noise(p * 3.0 + vec3(0.0, time * 0.002, 0.0))) * 0.6);
    float light = clamp(dot(normalize(vNormal), normalize(sun)), 0.0, 1.0);
    float edge = 1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    gl_FragColor = vec4(color * (0.04 + 1.1 * light) + rim * pow(edge, 3.0) * (0.25 + light), 1.0);
  }
`;

/** The surface of a sun up close: boiling cells of plasma, hotter towards the middle. */
const sunFragment = /* glsl */ `
  uniform float time;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vView;
  ${noise3}
  void main() {
    vec3 p = normalize(vLocal);
    float cells = noise(p * 14.0 + time * 0.05) * 0.6 + noise(p * 40.0 - time * 0.11) * 0.4;
    float center = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    vec3 color = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.85, 0.5), cells * 0.7 + center * 0.5);
    gl_FragColor = vec4(color * (1.6 + 1.4 * center), 1.0);
  }
`;

const diskVertex = /* glsl */ `
  varying vec2 vPlane;
  void main() {
    vPlane = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** The black hole's disk: hot gas spiraling in, white-hot at the inner edge, orange and dark further out. */
const diskFragment = /* glsl */ `
  uniform float time;
  uniform float inner;
  uniform float outer;
  varying vec2 vPlane;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float r = length(vPlane);
    float t = clamp((r - inner) / (outer - inner), 0.0, 1.0);
    float angle = atan(vPlane.y, vPlane.x);
    // the inner gas circles faster: the spiral winds up towards the hole
    float spin = angle + time * (0.9 / (0.15 + t)) ;
    float streaks = noise(vec2(spin * 6.0, t * 18.0)) * 0.6 + noise(vec2(spin * 19.0, t * 50.0)) * 0.4;
    float heat = pow(1.0 - t, 2.2);
    vec3 color = mix(vec3(0.9, 0.25, 0.04), vec3(1.0, 0.85, 0.65), heat);
    float fade = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.6, 1.0, t));
    // dark lanes between the bright streams, so the spiral reads
    float lanes = smoothstep(0.35, 0.75, streaks);
    gl_FragColor = vec4(color * (0.08 + 0.9 * heat) * lanes * fade, 1.0);
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

  private planet(radius: number, colors: [number, number, number], rim: number): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        sun: { value: SUN_DIRECTION.clone() },
        colorA: { value: new THREE.Color(colors[0]) },
        colorB: { value: new THREE.Color(colors[1]) },
        colorC: { value: new THREE.Color(colors[2]) },
        rim: { value: new THREE.Color(rim) },
      },
      vertexShader: bandsVertex,
      fragmentShader: bandsFragment,
    });
    this.timed.push(material);
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), material);
  }

  private rings(): THREE.Group {
    const group = new THREE.Group();
    const center = new THREE.Vector3(-0.85, 0, 0.5).normalize().multiplyScalar(KRONOS_DISTANCE);
    const planet = this.planet(KRONOS_RADIUS, [0xcdb58a, 0xe8dcc0, 0xa98a62], 0x9fc4ff);
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
    // the world the station circled, far below, blue with white cloud
    const planet = this.planet(180000, [0x1f4f9a, 0x2a6cc8, 0xe8f0ff], 0x6fa8ff);
    planet.position.set(-120000, -330000, -60000);
    group.add(planet);
    return group;
  }

  private giant(): THREE.Group {
    const group = new THREE.Group();
    const planet = this.planet(50000, [0xb5652c, 0xe2b07a, 0x7a3a1c], 0xffb070);
    planet.position.set(0, -95000, 0);
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
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(3500, 48, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
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
