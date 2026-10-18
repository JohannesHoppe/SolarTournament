import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

/** Applies the blending stored by the extraction tool and hides collider meshes. */
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

async function loadSound(context: AudioContext, name: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(base + 'audio/' + name);
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function loadAssets(audio: AudioContext): Promise<Assets> {
  const gltf = new GLTFLoader();
  const textures = new THREE.TextureLoader();
  const model = async (file: string) => prepareModel((await gltf.loadAsync(base + 'models/' + file)).scene.children[0]);
  const texture = async (file: string) => {
    const t = await textures.loadAsync(base + 'textures/' + file);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const [human, alien, a1, a2, a3] = await Promise.all(
    ['human-interceptor.glb', 'alien-interceptor.glb', 'asteroid-1.glb', 'asteroid-2.glb', 'asteroid-3.glb'].map(model),
  );
  const flameFrames = await Promise.all(
    ['driveflame.png', 'driveflametwo.png', 'driveflamethree.png', 'driveflamefour.png'].map(texture),
  );
  flameFrames.forEach((t) => (t.flipY = false));
  const [smoke, spark, glow] = await Promise.all(['particle_smoke.jpg', 'particle_shoot.jpg', 'drivelight-additive.png'].map(texture));
  glow.flipY = false;
  const [laser, explosion] = await Promise.all([loadSound(audio, 'shoot.mp3'), loadSound(audio, 'expl.mp3')]);

  return {
    ships: { human, alien },
    asteroids: [a1, a2, a3],
    textures: { flameFrames, smoke, spark, glow },
    sounds: { laser, explosion },
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
