import * as THREE from 'three';
import type { Assets, ShipType } from '../assets';
import type { Perks } from '../game/hangar';
import { Ship } from '../ship/ship';

/**
 * The ship on show circles above the pad once in CIRCLE_SECONDS, CIRCLE_RADIUS (units) out,
 * banked by BANK (rad) into its turn, and rises and sinks by BOB (units) every BOB_SECONDS, its
 * nose following the rise a little: slow, smooth, never still.
 */
const CIRCLE_SECONDS = 26;
const CIRCLE_RADIUS = 170;
const BANK = 0.22;
const BOB = 40;
const BOB_SECONDS = 7;
/** The pad: the seal as a coin (units), this wide and this thick; the ship hovers HOVER above it. */
const PAD_RADIUS = 520;
const PAD_THICKNESS = 70;
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
 * The ship on show in the menu: the seal of the Ministry of War lies as a coin, a docking pad
 * seen from above at a slant, and the chosen ship hovers above it and turns slowly, an exhibit
 * in its upgrades' looks, its drive burning low. A ship not earned yet (the Sovereign) shows as
 * a black silhouette against a rim of light: it is there, but not yet the Host's. A view of its
 * own, behind the menu's plates.
 */
export class Showcase {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 10, 20000);
  private readonly ships = new Map<ShipType, Ship>();
  private readonly silhouette: THREE.Object3D;
  private readonly wide = window.matchMedia(WIDE);
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
    this.scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x2a1a08, 1.2));
    const sun = new THREE.DirectionalLight(0xfff0dd, 3);
    sun.position.set(-1, 2, 1.5);
    this.scene.add(sun);
    // the rim of light behind a silhouette, and the pad's orange glow from below
    const rim = new THREE.DirectionalLight(0xff9d00, 2.5);
    rim.position.set(0, 0.5, -2);
    this.scene.add(rim);
    const glow = new THREE.PointLight(0xff7a00, 4, PAD_RADIUS * 3, 1.2);
    glow.position.set(0, PAD_THICKNESS, 0);
    this.scene.add(glow);
    this.scene.add(this.pad());
    this.silhouette = assets.ships.sovereign.clone(true);
    const black = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.4, metalness: 0.9 });
    this.silhouette.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const name = o.name.toLowerCase();
      // no flame and no glow: nothing of it burns yet
      if (name.startsWith('drive') || name.includes('glow')) o.visible = false;
      else o.material = black;
    });
    this.scene.add(this.silhouette);
  }

  /** Puts a ship on show in its looks, or its silhouette while it is `locked`. */
  show(type: ShipType, perks: Perks, locked: boolean) {
    this.locked = locked;
    this.silhouette.visible = locked;
    for (const ship of this.ships.values()) ship.root.visible = false;
    this.shown = null;
    if (locked) return;
    let ship = this.ships.get(type);
    if (!ship) {
      ship = new Ship('showcase-' + type, '', type, this.assets, false);
      ship.alive = true;
      this.ships.set(type, ship);
      this.scene.add(ship.root);
    }
    ship.outfit(perks);
    ship.root.visible = true;
    this.shown = ship;
  }

  /** Draws a frame at `time` (s): the ship turned a little further on its pad. */
  render(time: number) {
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
      // along its circle, nose ahead, banked into the turn; the nose lifts while it rises
      const angle = (time / CIRCLE_SECONDS) * Math.PI * 2;
      const bob = (time / BOB_SECONDS) * Math.PI * 2;
      root.position.set(Math.cos(angle) * CIRCLE_RADIUS, HOVER + Math.sin(bob) * BOB, Math.sin(angle) * CIRCLE_RADIUS);
      root.rotation.set(0, Math.PI - angle, 0);
      root.rotateZ(BANK);
      root.rotateX(Math.cos(bob) * 0.06);
    }
    this.shown?.idle(dt, 0.35);
    this.renderer.render(this.scene, this.camera);
  }

  /** The seal as a coin: its face the seal, its edge dark metal, a neon ring around its rim. */
  private pad(): THREE.Group {
    const group = new THREE.Group();
    const face = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.5, metalness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.55 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.35, metalness: 0.8 });
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, PAD_THICKNESS, 96), edge));
    // the face is a disk of its own, mapped flat (u along x, v against z), so the seal lies on
    // it upright and unmirrored as seen from the front
    const disk = new THREE.Mesh(new THREE.CircleGeometry(PAD_RADIUS, 96), face);
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = PAD_THICKNESS / 2 + 0.5;
    group.add(disk);
    // the seal drawn onto the face: crest.svg, as the station pages show it
    const image = new Image();
    image.onload = () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 });
      canvas.getContext('2d')!.drawImage(image, 0, 0, 1024, 1024);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      face.emissiveMap = texture;
      face.map = texture;
      face.needsUpdate = true;
    };
    image.src = import.meta.env.BASE_URL + 'crest.svg';
    const neon = new THREE.Mesh(new THREE.TorusGeometry(PAD_RADIUS + 6, 7, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.55, 0.05).multiplyScalar(2.5), toneMapped: false }));
    neon.rotation.x = Math.PI / 2;
    neon.position.y = PAD_THICKNESS / 2;
    group.add(neon);
    return group;
  }
}
