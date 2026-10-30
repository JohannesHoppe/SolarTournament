import * as THREE from 'three';

/**
 * The ghost of the own best lap: the own ship's hull as a faint blue hologram, with no drive
 * flame and no glow, flying the best lap again (see LapTimer.ghostAt). It is only seen, never
 * hit: rocks, lasers and other ships pass through it.
 */
export class Ghost {
  readonly root = new THREE.Group();
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x4d91ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  private model: THREE.Object3D | null = null;
  /** The hull the ghost has, so a new round of the same ship keeps it. */
  private source: THREE.Object3D | null = null;

  constructor() {
    this.root.visible = false;
  }

  /** The hull the ghost takes: the Host's own ship. */
  wear(source: THREE.Object3D) {
    if (source === this.source) return;
    this.source = source;
    if (this.model) this.root.remove(this.model);
    const model = source.clone(true);
    model.traverse((part) => {
      if (part instanceof THREE.Mesh) {
        // the drive's flame and glows have no hull to show, paint on the hull (a decal) no shape of its own
        part.visible = !part.name.toLowerCase().startsWith('drive') && !(part.material as THREE.Material).transparent && !part.userData.decal;
        part.material = this.material;
        part.castShadow = part.receiveShadow = false;
      } else if (part instanceof THREE.Sprite) {
        part.visible = false;
      }
    });
    this.model = model;
    this.root.add(model);
  }

  /** Shows the ghost at a pose, or hides it (null). */
  show(position: THREE.Vector3 | null, orientation?: THREE.Quaternion) {
    this.root.visible = !!position;
    if (!position) return;
    this.root.position.copy(position);
    if (orientation) this.root.quaternion.copy(orientation);
  }
}
