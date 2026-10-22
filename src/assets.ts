import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRocks, DISTANT_DETAIL, FAR_DETAIL } from './world/rocks';
import { debrisSet, hullSet, iceSet } from './world/shapes';
import { alienInterceptor, humanInterceptor, sovereign } from './ship/models';
import type { TemplateKind, TemplateSet } from './world/asteroids';
import { synthesizeSounds } from './sound/sounds';
import { radialTexture, smokeTexture, sparkTexture } from './view/textures';

/** The ships a Host can fly: the two interceptors, and the Sovereign once earned (see game/hangar). */
export type ShipType = 'human' | 'alien' | 'sovereign';

export interface Assets {
  ships: Record<ShipType, THREE.Object3D>;
  /** The rock shapes in low detail, for the belt beyond the arena. */
  belt: THREE.Mesh[];
  /** Every kind of shape the arenas' fields are built from (see world/shapes); the rocks also in less detail for afar. */
  fieldSets: Record<TemplateKind, TemplateSet>;
  textures: {
    flameFrames: THREE.Texture[];
    smoke: THREE.Texture;
    spark: THREE.Texture;
    glow: THREE.Texture;
  };
  sounds: Record<'laser' | 'explosion', AudioBuffer | null>;
}

const base = import.meta.env.BASE_URL + 'assets/';

/** Share of the sprite's width over which the flame fades out towards each edge. */
const FLAME_EDGE_FADE = 0.25;

/**
 * The flame sprites burn almost up to their borders, so the quad would cut them off with a
 * visible edge: fade every side out smoothly.
 */
function softEdges(texture: THREE.Texture): THREE.Texture {
  const image = texture.image as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const fade = (t: number) => THREE.MathUtils.smoothstep(Math.min(t, 1 - t), 0, FLAME_EDGE_FADE);
  for (let y = 0; y < canvas.height; y++) {
    const fy = fade((y + 0.5) / canvas.height);
    for (let x = 0; x < canvas.width; x++) {
      pixels.data[(y * canvas.width + x) * 4 + 3] *= fy * fade((x + 0.5) / canvas.width);
    }
  }
  context.putImageData(pixels, 0, 0);
  const soft = new THREE.CanvasTexture(canvas);
  soft.colorSpace = texture.colorSpace;
  texture.dispose();
  return soft;
}

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

  // every file is requested at once, and the rocks are generated while they are on their way
  const ships = Promise.all(['human-interceptor.glb', 'alien-interceptor.glb'].map(model));
  const flames = Promise.all(['driveflame.png', 'driveflametwo.png', 'driveflamethree.png', 'driveflamefour.png'].map(texture));
  const asteroids = createRocks();
  const asteroidsFar = createRocks(FAR_DETAIL);
  const belt = createRocks(DISTANT_DETAIL);
  const [human, alien] = await ships;
  const flameFrames = (await flames).map(softEdges);
  flameFrames.forEach((t) => (t.flipY = false));
  // the drive glow: a round, soft, cool-blue light on black for additive blending, without
  // rays, so it neither turns into a star nor blows out under the bloom
  const glow = radialTexture([
    [0, '#6f93d6'],
    [0.12, '#3f63a8'],
    [0.4, '#1b2b52'],
    [0.75, '#060a14'],
    [1, '#000000'],
  ]);

  const rock = { near: asteroids, far: asteroidsFar };
  return {
    // the hulls are built in code; the model files give collider, drive flame and glows
    ships: { human: humanInterceptor(human), alien: alienInterceptor(alien), sovereign: sovereign(human) },
    belt,
    fieldSets: { rock, ice: iceSet(rock), debris: debrisSet(), hull: hullSet() },
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
