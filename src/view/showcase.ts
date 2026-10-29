import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Assets, ShipType } from '../assets';
import type { Perks } from '../game/hangar';
import { Ship } from '../ship/ship';
import { hazardSurface, lacquer, shine } from './surfaces';
import { canvas, radialTexture, toTexture } from './textures';

/** The ship on show hovers level above the pad's middle and turns on the spot, once in TURN_SECONDS: an exhibit on a turntable. */
const TURN_SECONDS = 30;
/** The top of the pad's rim lies this high (units); the ship hovers HOVER above the pad's middle. */
const PAD_TOP = 35;
const HOVER = 280;
/** The camera looks down on the pad from this far and this steeply (rad). */
const CAMERA_DISTANCE = 2700;
const CAMERA_ELEVATION = 0.5;
/** Where the pad stands on screen, as shares of the width and the height: left of the menu on a wide screen, above it on a narrow one. */
const WIDE_SPOT = { x: 0.27, y: 0.56, scale: 1 };
const NARROW_SPOT = { x: 0.5, y: 0.2, scale: 1.5 };
/** The same screens CSS calls wide (see style.css, the title screen). */
const WIDE = '(min-width: 900px) and (min-aspect-ratio: 5/4)';

/**
 * The pad's cross-section from its middle underneath out and up over its rim to the seal (units,
 * radius and height below the rim's top), a heavy turned platform 56 m across and 6.5 m thick.
 * Every step is a face of its own with a hard edge, and every edge is chamfered, so the light
 * catches it as a bright line; each step names its finish (see PAD_FINISHES).
 */
const PAD_PROFILE: readonly [radius: number, height: number, finish: Finish][] = [
  [0, -130, 'dark'],
  [520, -130, 'dark'],
  [556, -112, 'skirt'],
  [556, -58, 'edge'],
  [548, -48, 'hazard'],
  [514, -48, 'steel'],
  [514, -14, 'edge'],
  [500, 0, 'rim'],
  [450, 0, 'edge'],
  [438, -12, 'dark'],
];
type Finish = 'dark' | 'skirt' | 'edge' | 'hazard' | 'steel' | 'rim';
/** The seal lies sunk into the rim this deep (units), as wide as the rim leaves it. */
const SEAL_DEPTH = 12;
const SEAL_RADIUS = 438;
/** Around the pad: plates of the rim (each with two bolts), lamps on the step, vents in the skirt. */
const RIM_PLATES = 24;
/** The rim's texture holds this many plates, each worn its own way (see rimTexture); RIM_PLATES is a multiple of it. */
const RIM_TILE = 4;
/** The worn hazard paint (see hazardSurface) repeats this often around the step, the grime of the turned faces (see usedTexture) this often. */
const HAZARD_TILES = 8;
const USED_TILES = 6;
const LAMPS = 16;
const VENTS = 48;
/** Polygons around the pad: enough that its rim and the seal's edge stay round up close. */
const ROUND = 192;
/** The seal's texture (px): drawn from the vector seal at this size, so its lines stay sharp. */
const SEAL_SIZE = 2048;
/** The floodlight's strength behind the pad (see Showcase). */
const FLOOD = 1.8;
/** The lamps' running light goes around the pad once in this many seconds. */
const LAMP_SECONDS = 4;

/**
 * The ship on show in the menu: the seal of the Ministry of War inlaid in a landing pad seen
 * from above at a slant, and the chosen ship hovers above it and turns slowly, an exhibit in its
 * upgrades' looks, its drive burning low. A ship not earned yet (the Sovereign) shows as a black
 * silhouette against a rim of light: it is there, but not yet the Host's. A view of its own,
 * behind the menu's plates.
 */
export class Showcase {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 10, 20000);
  private readonly ships = new Map<ShipType, Ship>();
  private readonly silhouette: THREE.Object3D;
  private readonly wide = window.matchMedia(WIDE);
  private readonly still = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** The light of the ship's lift on the pad below it: a pool on the seal, and a lamp. */
  private readonly pool: THREE.Mesh;
  private readonly lift = new THREE.PointLight(0x4d91ff, 3, 900, 1.3);
  /** The floodlight behind the pad (see the constructor); turned low behind a silhouette, which stays black. */
  private readonly flood = new THREE.DirectionalLight(0xfff3e0, FLOOD);
  private readonly lamps: THREE.Points;
  private shown: Ship | null = null;
  private locked = false;
  private last = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: Assets,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x2a1a08, 1.2));
    const sun = new THREE.DirectionalLight(0xfff0dd, 3);
    sun.position.set(-1, 2, 1.5);
    this.scene.add(sun);
    // a floodlight high behind the pad: its sheen runs over the metal towards the viewer, so the
    // pad reads as an object, and it throws the ship's shadow onto the seal
    const flood = this.flood;
    flood.position.set(-300, 1300, -1500);
    flood.castShadow = true;
    flood.shadow.mapSize.set(1024, 1024);
    const reach = 650;
    Object.assign(flood.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1000, far: 3200 });
    flood.shadow.camera.updateProjectionMatrix();
    flood.shadow.bias = -0.0008;
    // soft and not black: the floodlight is one light of several, the sun and the sky still reach under the ship
    flood.shadow.radius = 6;
    flood.shadow.intensity = 0.7;
    this.scene.add(flood);
    // the rim of light behind a silhouette, from below the pad's plane, so it leaves the pad's top dark
    const rim = new THREE.DirectionalLight(0xff9d00, 2.5);
    rim.position.set(0, -0.4, -2);
    this.scene.add(rim);
    const { pad, pool, lamps } = this.pad(this.renderer.capabilities.getMaxAnisotropy());
    this.pool = pool;
    this.lamps = lamps;
    this.scene.add(pad, this.lift);
    this.silhouette = assets.ships.sovereign.clone(true);
    const black = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.4, metalness: 0.9 });
    this.silhouette.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const name = o.name.toLowerCase();
      // no flame and no glow: nothing of it burns yet
      if (name.startsWith('drive') || name.includes('glow')) o.visible = false;
      else o.material = black;
    });
    castsShadow(this.silhouette);
    this.scene.add(this.silhouette);
  }

  /** Puts a ship on show in its looks, or its silhouette while it is `locked`. */
  show(type: ShipType, perks: Perks, locked: boolean) {
    this.locked = locked;
    this.flood.intensity = locked ? FLOOD * 0.2 : FLOOD;
    this.silhouette.visible = locked;
    for (const ship of this.ships.values()) ship.root.visible = false;
    this.shown = null;
    if (locked) return;
    let ship = this.ships.get(type);
    if (!ship) {
      ship = new Ship('showcase-' + type, '', type, this.assets, false);
      ship.alive = true;
      castsShadow(ship.root);
      this.ships.set(type, ship);
      this.scene.add(ship.root);
    }
    ship.outfit(perks);
    ship.root.visible = true;
    this.shown = ship;
  }

  /** The pad's look (see Look.showcase in view/quality): pixel ratio, the floodlight's shadow, every how many frames it is drawn. */
  setLook(look: { pixelRatio: number; shadows: boolean; every: number }) {
    this.renderer.setPixelRatio(Math.min(look.pixelRatio, window.devicePixelRatio));
    this.flood.castShadow = look.shadows;
    this.every = look.every;
  }

  private every = 1;
  private frames = 0;

  /** Draws a frame at `time` (s): the ship turned a little further on its pad. */
  render(time: number) {
    if (++this.frames % this.every) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (this.canvas.width !== Math.round(width * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(height * this.renderer.getPixelRatio())) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
    }
    // the pad where the screen has room for it: the picture is cut so its middle lands there
    const spot = this.wide.matches ? WIDE_SPOT : NARROW_SPOT;
    const distance = CAMERA_DISTANCE * spot.scale;
    this.camera.position.set(0, Math.sin(CAMERA_ELEVATION) * distance, Math.cos(CAMERA_ELEVATION) * distance);
    this.camera.lookAt(0, HOVER * 0.5, 0);
    this.camera.setViewOffset(width, height, (0.5 - spot.x) * width, (0.5 - spot.y) * height, width, height);
    const dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    const root = this.locked ? this.silhouette : this.shown?.root;
    if (root) {
      root.position.set(0, HOVER, 0);
      root.rotation.set(0, (time / TURN_SECONDS) * Math.PI * 2, 0);
      // its lift lights the seal below it; a silhouette lifts unlit
      this.pool.position.set(0, this.pool.position.y, 0);
      (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.5;
      this.pool.visible = !this.locked;
      this.lift.position.set(0, HOVER - 120, 0);
      this.lift.intensity = this.locked ? 0 : 3;
    }
    this.runLamps(time);
    this.shown?.idle(dt, 0.35);
    this.renderer.render(this.scene, this.camera);
  }

  /** The lamps around the pad: a light runs around it, the others glow low (all low when motion is reduced). */
  private runLamps(time: number) {
    const color = this.lamps.geometry.attributes.color as THREE.BufferAttribute;
    const lead = (time / LAMP_SECONDS) % 1;
    for (let i = 0; i < LAMPS; i++) {
      const behind = (lead - i / LAMPS + 1) % 1;
      const level = this.still.matches ? 0.5 : 0.35 + 0.65 * Math.max(0, 1 - behind * 5);
      color.setXYZ(i, level, level * 0.62, level * 0.1);
    }
    color.needsUpdate = true;
  }

  /**
   * The landing pad: a heavy turned platform of dark gunmetal, a raised rim of brushed steel in
   * bolted plates, a step with hazard stripes and recessed lamps, vents in its skirt glowing with
   * the azure of its lift, and sunk into its top the seal, inlaid in gold in lacquered gunmetal.
   */
  private pad(anisotropy: number) {
    const group = new THREE.Group();
    group.position.y = PAD_TOP;
    const reflection = shine();
    const metal = (color: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness: 1, envMap: reflection, envMapIntensity: 1.4, ...extra });
    const rimTile = rimTexture(anisotropy);
    const used = usedTexture(anisotropy);
    const worn = { map: used.color, roughnessMap: used.orm, metalnessMap: used.orm };
    const paint = hazardSurface();
    const stripes = (texture: THREE.Texture) => {
      const copy = texture.clone();
      copy.repeat.set(HAZARD_TILES, 1);
      copy.anisotropy = anisotropy;
      return copy;
    };
    const finishes: Record<Finish, THREE.Material> = {
      dark: metal(0x30343b, 0.55, worn),
      edge: metal(0xd8dde6, 0.18),
      steel: metal(0x6d737d, 0.4, worn),
      rim: metal(0xa9afb9, 1, { roughnessMap: rimTile.orm, metalnessMap: rimTile.orm, bumpMap: rimTile.bump, bumpScale: 1.5, map: rimTile.color }),
      hazard: new THREE.MeshStandardMaterial({ map: stripes(paint.map), roughnessMap: stripes(paint.orm), metalnessMap: stripes(paint.orm), bumpMap: stripes(paint.bump), bumpScale: 1, roughness: 1, metalness: 1, envMap: reflection }),
      skirt: metal(0x23262c, 0.5, { ...worn, emissive: 0x0062ff, emissiveMap: ventTexture(anisotropy), emissiveIntensity: 1.6 }),
    };
    // each step of the profile turned on its own, so its edges stay hard
    const steps: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    for (let i = 0; i + 1 < PAD_PROFILE.length; i++) {
      const [r0, y0, finish] = PAD_PROFILE[i];
      const [r1, y1] = PAD_PROFILE[i + 1];
      steps.push(new THREE.LatheGeometry([new THREE.Vector2(r0, y0), new THREE.Vector2(r1, y1)], ROUND));
      materials.push(finishes[finish]);
    }
    const body = new THREE.Mesh(mergeGeometries(steps, true), materials);
    body.receiveShadow = true;
    group.add(body);
    group.add(bolts(finishes.edge));
    // the seal, sunk into the rim: a disk mapped flat (u along x, v against z), so it lies
    // upright and unmirrored as seen from the front
    const seal = lacquer(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, metalness: 1, clearcoat: 0.7, clearcoatRoughness: 0.12, envMap: reflection, emissive: 0xff9d00, emissiveIntensity: 0 }));
    const face = new THREE.Mesh(new THREE.CircleGeometry(SEAL_RADIUS, ROUND), seal);
    face.rotation.x = -Math.PI / 2;
    face.position.y = -SEAL_DEPTH;
    face.receiveShadow = true;
    group.add(face);
    const image = new Image();
    image.onload = () => {
      const inlay = sealTextures(image, anisotropy);
      Object.assign(seal, { map: inlay.color, roughnessMap: inlay.orm, metalnessMap: inlay.orm, bumpMap: inlay.bump, bumpScale: 2, emissiveMap: inlay.glow, emissiveIntensity: 0.25 });
      seal.needsUpdate = true;
    };
    image.src = import.meta.env.BASE_URL + 'crest.svg';
    // a thin neon tube along the rim's wall, in the groove above the step
    const neon = new THREE.Mesh(new THREE.TorusGeometry(516, 2.5, 8, ROUND), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.05).multiplyScalar(2.5), toneMapped: false }));
    neon.rotation.x = Math.PI / 2;
    neon.position.y = -32;
    group.add(neon);
    // the lamps set into the step: a glow each, all in one draw call
    const lampPositions = new Float32Array(LAMPS * 3);
    for (let i = 0; i < LAMPS; i++) {
      const a = ((i + 0.5) / LAMPS) * Math.PI * 2;
      lampPositions.set([Math.sin(a) * 531, -45, Math.cos(a) * 531], i * 3);
    }
    const lampGeometry = new THREE.BufferGeometry();
    lampGeometry.setAttribute('position', new THREE.BufferAttribute(lampPositions, 3));
    lampGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(LAMPS * 3), 3));
    const lamps = new THREE.Points(
      lampGeometry,
      new THREE.PointsMaterial({ size: 110, map: radialTexture([[0, '#ffffff'], [0.12, '#ffffff'], [0.3, 'rgba(255, 255, 255, 0.35)'], [1, 'rgba(0, 0, 0, 0)']], 128), vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    );
    group.add(lamps);
    // the pool of the lift's light on the seal under the ship
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(260, 48),
      new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(120, 170, 255, 0.6)'], [0.4, 'rgba(0, 98, 255, 0.25)'], [1, 'rgba(0, 0, 0, 0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -SEAL_DEPTH + 1;
    group.add(pool);
    return { pad: group, pool, lamps };
  }
}

/** Every mesh of a ship on show throws its shadow onto the pad. */
function castsShadow(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
}

/** Hex bolts holding the rim's plates down, two at every seam: one draw call. */
function bolts(material: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(5, 5, 4, 6), material, RIM_PLATES * 2);
  const place = new THREE.Object3D();
  for (let i = 0; i < RIM_PLATES * 2; i++) {
    const a = ((Math.floor(i / 2) + 0.04) / RIM_PLATES) * Math.PI * 2;
    const r = i % 2 === 0 ? 464 : 486;
    place.position.set(Math.sin(a) * r, 2, Math.cos(a) * r);
    place.rotation.y = a;
    place.updateMatrix();
    mesh.setMatrixAt(i, place.matrix);
  }
  return mesh;
}

/** A canvas texture repeated `times` around the pad (u runs around a turned step). */
function around(element: HTMLCanvasElement, times: number, anisotropy: number, color = true): THREE.CanvasTexture {
  const texture = color ? toTexture(element) : new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(times, 1);
  texture.anisotropy = anisotropy;
  return texture;
}

/** A small fixed hash (0..1) for the pad's wear: the same scuffs on every visit. */
const wear = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The rim's plates, RIM_TILE of them to a texture so no two neighbors wear alike: steel brushed
 * around the pad, a seam between plates and a finer one splitting each into two panels, the
 * brushing a shade different on either side of it; scuffed bright and smooth where boots and
 * cargo dragged, dark skid marks of landing gear sweeping across, grime gathered along the seams
 * and the edges. Its color, roughness and metalness, and bump.
 */
function rimTexture(anisotropy: number) {
  const [width, height] = [256 * RIM_TILE, 64];
  const [color, c] = canvas(width, height);
  const [orm, o] = canvas(width, height);
  const [bump, b] = canvas(width, height);
  c.fillStyle = '#fff';
  c.fillRect(0, 0, width, height);
  o.fillStyle = 'rgb(255, 90, 255)';
  o.fillRect(0, 0, width, height);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, width, height);
  for (let plate = 0; plate < RIM_TILE; plate++) {
    const x0 = plate * 256;
    // brushing: fine lines along the turn, each a little rougher or smoother, lighter or darker, its two panels apart
    for (const [from, span, shift] of [[0, 110, 0], [110, 146, 1]]) {
      for (let y = 0; y < height; y++) {
        const f = wear(y + plate * 97 + shift * 1000);
        o.fillStyle = `rgb(255, ${Math.round(70 + 50 * f)}, 255)`;
        o.fillRect(x0 + from, y, span, 1);
        c.fillStyle = `rgba(0, 0, 0, ${0.04 + 0.08 * f + shift * 0.05})`;
        c.fillRect(x0 + from, y, span, 1);
      }
    }
    // the seam between two plates, and the finer one between the panels of a plate
    c.fillStyle = 'rgba(0, 0, 0, 0.7)';
    c.fillRect(x0, 0, 3, height);
    b.fillStyle = '#202020';
    b.fillRect(x0, 0, 3, height);
    c.fillStyle = 'rgba(0, 0, 0, 0.45)';
    c.fillRect(x0 + 110, 0, 1.5, height);
    b.fillStyle = '#4a4a4a';
    b.fillRect(x0 + 110, 0, 1.5, height);
    // grime in the seams' corners and along the rim's two edges
    for (const x of [x0 + 2, x0 + 111]) {
      const dirt = c.createLinearGradient(x, 0, x + 18, 0);
      dirt.addColorStop(0, 'rgba(24, 20, 14, 0.4)');
      dirt.addColorStop(1, 'rgba(24, 20, 14, 0)');
      c.fillStyle = dirt;
      c.fillRect(x, 0, 18, height);
    }
    for (const [y, toward] of [[0, 10], [height, height - 10]]) {
      const dirt = c.createLinearGradient(0, y, 0, toward);
      dirt.addColorStop(0, 'rgba(24, 20, 14, 0.45)');
      dirt.addColorStop(1, 'rgba(24, 20, 14, 0)');
      c.fillStyle = dirt;
      c.fillRect(x0, Math.min(y, toward), 256, 10);
    }
    // scuffs: patches rubbed smooth and bright
    for (let i = 0; i < 5; i++) {
      const x = x0 + 10 + wear(plate * 31 + i) * 230;
      const y = wear(plate * 17 + i * 3) * height;
      const radius = 6 + wear(plate * 7 + i * 5) * 16;
      const rub = o.createRadialGradient(x, y, 0, x, y, radius);
      rub.addColorStop(0, 'rgba(255, 55, 255, 0.4)');
      rub.addColorStop(1, 'rgba(255, 55, 255, 0)');
      o.fillStyle = rub;
      o.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      const light = c.createRadialGradient(x, y, 0, x, y, radius);
      light.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      light.addColorStop(1, 'rgba(255, 255, 255, 0)');
      c.fillStyle = light;
      c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    // skid marks: soft, dark, dull smears of rubber sweeping across the rim, on some plates
    // (three strokes, wide to narrow, for a soft edge)
    if (wear(plate * 5 + 2) < 0.6) {
      const x = x0 + 30 + wear(plate * 13) * 160;
      const tilt = (wear(plate * 3) - 0.5) * 140;
      const width = 12 + wear(plate * 11) * 10;
      for (const share of [1, 0.7, 0.4]) {
        c.strokeStyle = `rgba(14, 12, 10, ${0.1 + 0.08 * wear(plate * 9)})`;
        o.strokeStyle = 'rgba(255, 200, 220, 0.3)';
        c.lineWidth = o.lineWidth = width * share;
        for (const g of [c, o]) {
          g.beginPath();
          g.moveTo(x, -4);
          g.quadraticCurveTo(x + tilt * 0.6, height / 2, x + tilt, height + 4);
          g.stroke();
        }
      }
    }
  }
  const plates = RIM_PLATES / RIM_TILE;
  return { color: around(color, plates, anisotropy), orm: around(orm, plates, anisotropy, false), bump: around(bump, plates, anisotropy, false) };
}

/**
 * The pad's turned faces of gunmetal and steel as used: grime run down in streaks from the
 * edges above, oily patches a little darker and smoother, the rest a shade rougher; a color to
 * multiply with the finish's own and a roughness (green) to multiply with its roughness, the
 * metal left whole (blue). USED_TILES tiles around the pad.
 */
function usedTexture(anisotropy: number) {
  const [width, height] = [512, 64];
  const [color, c] = canvas(width, height);
  const [orm, o] = canvas(width, height);
  c.fillStyle = '#fff';
  c.fillRect(0, 0, width, height);
  o.fillStyle = 'rgb(255, 225, 255)';
  o.fillRect(0, 0, width, height);
  for (let i = 0; i < 70; i++) {
    const x = wear(i * 3.1) * width;
    const length = 10 + wear(i * 7.7) * 50;
    const streak = c.createLinearGradient(0, 0, 0, length);
    streak.addColorStop(0, `rgba(30, 24, 16, ${0.2 + 0.3 * wear(i * 1.3)})`);
    streak.addColorStop(1, 'rgba(30, 24, 16, 0)');
    c.fillStyle = streak;
    c.fillRect(x, 0, 1 + wear(i * 5.3) * 5, length);
  }
  for (let i = 0; i < 12; i++) {
    const x = wear(i * 9.7 + 1) * width;
    const y = wear(i * 4.9 + 2) * height;
    const radius = 10 + wear(i * 2.3) * 30;
    const oil = c.createRadialGradient(x, y, 0, x, y, radius);
    oil.addColorStop(0, 'rgba(10, 10, 14, 0.25)');
    oil.addColorStop(1, 'rgba(10, 10, 14, 0)');
    c.fillStyle = oil;
    c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    const slick = o.createRadialGradient(x, y, 0, x, y, radius);
    slick.addColorStop(0, 'rgba(255, 150, 255, 0.6)');
    slick.addColorStop(1, 'rgba(255, 150, 255, 0)');
    o.fillStyle = slick;
    o.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  return { color: around(color, USED_TILES, anisotropy), orm: around(orm, USED_TILES, anisotropy, false) };
}

/** The vents in the skirt: slots glowing with the lift's azure, black between them. */
function ventTexture(anisotropy: number): THREE.CanvasTexture {
  const [element, g] = canvas(64, 64);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  const glow = g.createLinearGradient(0, 12, 0, 52);
  glow.addColorStop(0, '#000');
  glow.addColorStop(0.5, '#fff');
  glow.addColorStop(1, '#000');
  g.fillStyle = glow;
  for (const x of [14, 26, 38]) g.fillRect(x, 12, 6, 40);
  return around(element, VENTS, anisotropy);
}

/**
 * The seal as an inlay, drawn from the vector seal at SEAL_SIZE: its lines gold (metal, polished,
 * raised a little), its field dark gunmetal under a clear coat, and the gold
 * glowing faintly, as the tournament's neon catches it.
 */
function sealTextures(image: HTMLImageElement, anisotropy: number) {
  const [color, c] = canvas(SEAL_SIZE);
  c.drawImage(image, 0, 0, SEAL_SIZE, SEAL_SIZE);
  const pixels = c.getImageData(0, 0, SEAL_SIZE, SEAL_SIZE);
  const [orm, o] = canvas(SEAL_SIZE);
  const [bump, b] = canvas(SEAL_SIZE);
  const ormPixels = o.createImageData(SEAL_SIZE, SEAL_SIZE);
  const bumpPixels = b.createImageData(SEAL_SIZE, SEAL_SIZE);
  const p = pixels.data;
  // written channel by channel: millions of pixels, no array per pixel
  const ormData = ormPixels.data;
  const bumpData = bumpPixels.data;
  for (let i = 0; i < p.length; i += 4) {
    // how much of the gold lies here: the seal's lines are orange, its field near black
    const gold = Math.min(1, Math.max(p[i], p[i + 1]) / 200);
    ormData[i] = 255;
    ormData[i + 1] = Math.round(255 * (0.38 - 0.16 * gold));
    ormData[i + 2] = Math.round(255 * (0.45 + 0.55 * gold));
    ormData[i + 3] = 255;
    const height = Math.round(90 + 140 * gold);
    bumpData[i] = bumpData[i + 1] = bumpData[i + 2] = height;
    bumpData[i + 3] = 255;
    // gold where the seal's lines run, dark gunmetal under the lacquer everywhere else
    const field = 1 - gold;
    p[i] = Math.round(255 * gold + 46 * field);
    p[i + 1] = Math.round(190 * gold + 46 * field);
    p[i + 2] = Math.round(92 * gold + 52 * field);
    p[i + 3] = 255;
  }
  c.putImageData(pixels, 0, 0);
  o.putImageData(ormPixels, 0, 0);
  b.putImageData(bumpPixels, 0, 0);
  const sharp = (texture: THREE.CanvasTexture) => {
    texture.anisotropy = anisotropy;
    return texture;
  };
  // the glow: the seal itself, its gold lines on black
  const [glow, g] = canvas(SEAL_SIZE);
  g.drawImage(image, 0, 0, SEAL_SIZE, SEAL_SIZE);
  return { color: sharp(toTexture(color)), orm: sharp(new THREE.CanvasTexture(orm)), bump: sharp(new THREE.CanvasTexture(bump)), glow: sharp(toTexture(glow)) };
}
