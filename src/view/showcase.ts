import * as THREE from 'three';
import type { Assets, ShipType } from '../assets';
import type { Perks } from '../game/hangar';
import { Ship } from '../ship/ship';

/** The ship on show circles once in this many seconds, banking into its turn. */
const CIRCLE_SECONDS = 14;
/** How far out it circles and how far the camera stands back (units). */
const CIRCLE_RADIUS = 200;
const CAMERA_DISTANCE = 1400;

/**
 * The ship on show above the logo of the menu: a small view of its own, where the chosen ship
 * circles slowly with its drive burning, in its upgrades' looks. A ship not earned yet (the
 * Sovereign) shows as a black silhouette against a faint rim of light: it is there, but not yet
 * the Host's.
 */
export class Showcase {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 10, 10000);
  private readonly ships = new Map<ShipType, Ship>();
  private readonly silhouette: THREE.Object3D;
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
    // the rim of light behind a silhouette
    const rim = new THREE.DirectionalLight(0xff9d00, 2.5);
    rim.position.set(0, 0.5, -2);
    this.scene.add(rim);
    this.camera.position.set(0, CAMERA_DISTANCE * 0.22, CAMERA_DISTANCE);
    this.camera.lookAt(0, 0, 0);
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

  /** Draws a frame at `time` (s): the ship one step further around its circle. */
  render(time: number) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (this.canvas.width !== Math.round(width * this.renderer.getPixelRatio())) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    const dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    const angle = (time / CIRCLE_SECONDS) * Math.PI * 2;
    const root = this.locked ? this.silhouette : this.shown?.root;
    if (root) {
      // along its circle, nose ahead, banked into the turn
      root.position.set(Math.cos(angle) * CIRCLE_RADIUS, Math.sin(angle * 2) * 30, Math.sin(angle) * CIRCLE_RADIUS);
      root.rotation.set(0, Math.PI - angle, 0);
      root.rotateZ(0.35);
    }
    this.shown?.idle(dt, 0.6);
    this.renderer.render(this.scene, this.camera);
  }
}
