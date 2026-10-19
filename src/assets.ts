import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRocks } from './world/rocks';
import { synthesizeSounds } from './sound/sounds';
import { smokeTexture, sparkTexture } from './view/textures';

export type ShipType = 'human' | 'alien';

export interface Assets {
  ships: Record<ShipType, THREE.Object3D>;
  asteroids: THREE.Object3D[];
  textures: {
    flameFrames: THREE.Texture[];
    smoke: THREE.Texture;
    spark: THREE.Texture;
    glow: THREE.Texture;
  };
  sounds: Record<'laser' | 'explosion', AudioBuffer | null>;
}

const base = import.meta.env.BASE_URL + 'assets/';

/** Applies the blending stored in the materials' userData and hides collider meshes. */
function prepareModel(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object.userData.collider) object.visible = false;
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    if (material.userData.blending) {
      material.transparent = true;
      material.depthWrite = false;
      material.side = THREE.DoubleSide;
      if (material.userData.blending === 'additive') material.blending = THREE.AdditiveBlending;
    }
    if (material instanceof THREE.MeshStandardMaterial && material.normalMap) {
      // The normal maps were authored for a Y-down texture space.
      material.normalScale.set(1, -1);
    }
  });
  return root;
}

/**
 * The ships and their drive sprites are model files; rocks, particles and sounds are
 * generated in code.
 */
export async function loadAssets(audio: AudioContext): Promise<Assets> {
  const gltf = new GLTFLoader();
  const textures = new THREE.TextureLoader();
  const model = async (file: string) => prepareModel((await gltf.loadAsync(base + 'models/' + file)).scene.children[0]);
  const texture = async (file: string) => {
    const t = await textures.loadAsync(base + 'textures/' + file);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const [human, alien] = await Promise.all(['human-interceptor.glb', 'alien-interceptor.glb'].map(model));
  const flameFrames = await Promise.all(
    ['driveflame.png', 'driveflametwo.png', 'driveflamethree.png', 'driveflamefour.png'].map(texture),
  );
  flameFrames.forEach((t) => (t.flipY = false));
  const glow = await texture('drivelight-additive.png');
  glow.flipY = false;

  return {
    ships: { human, alien },
    asteroids: createRocks(),
    textures: { flameFrames, smoke: smokeTexture(), spark: sparkTexture(), glow },
    sounds: synthesizeSounds(audio),
  };
}

/**
 * Bounding box of an object's collider mesh (or its visible meshes when it has none),
 * in the object's own coordinates without its scale.
 */
export function colliderBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  let hasCollider = false;
  root.traverse((o) => (hasCollider ||= !!o.userData.collider));
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Line) || (hasCollider && !o.userData.collider)) return;
    o.geometry.computeBoundingBox();
    box.union(o.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, o.matrixWorld)));
  });
  return box;
}

/** Largest scale factor of an object's world transform. */
export function worldScale(root: THREE.Object3D): number {
  const scale = new THREE.Vector3().setFromMatrixScale(root.matrixWorld);
  return Math.max(scale.x, scale.y, scale.z);
}

/** Radius of the bounding sphere of an object's collider, including its scale. */
export function colliderRadius(root: THREE.Object3D): number {
  return colliderBox(root).getBoundingSphere(new THREE.Sphere()).radius * worldScale(root);
}
