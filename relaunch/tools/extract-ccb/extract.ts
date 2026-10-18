/**
 * Converts the CopperCube scene (scene1.ccbjs) into glTF assets for the three.js game.
 *
 * Run with `npm run dev` and open /tools/extract-ccb/ — the page loads the scene with the
 * original CopperLicht engine, rebuilds every template as a three.js object and writes
 * GLB files into public/assets/models via the dev server's /__save endpoint.
 *
 * CopperLicht is left-handed (+Z forward), three.js right-handed (-Z forward):
 * positions and normals get their Z mirrored, triangle winding is reversed.
 * UVs stay in top-left convention, which is what glTF expects.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

declare const CL3D: any;

const MATERIAL_ADD_COLOR = 12;
const MATERIAL_ALPHA_CHANNEL = 13;
const MIRROR_Z = new THREE.Matrix4().makeScale(1, 1, -1);

const NORMAL_MAPS: Record<string, string> = {
  'meteoronetexture.png': 'meteoronenormalmap.png',
  'meteortwotexture.png': 'meteortwonormal.png',
  'meteorthreetexture.png': 'meteorthreenormal.png',
};

/** Templates with their file name in public/assets/models. */
const TEMPLATES: Record<string, string> = {
  humanInterceptor: 'human-interceptor.glb',
  alienInterceptor: 'alien-interceptor.glb',
  asteroid1: 'asteroid-1.glb',
  asteroid2: 'asteroid-2.glb',
  asteroid3: 'asteroid-3.glb',
  photonBlue: 'photon.glb',
};

const logEl = document.getElementById('log')!;
const log = (line: string) => (logEl.textContent += line + '\n');

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, Promise<THREE.Texture>>();

const fileName = (path: string) => path.split('/').pop()!;

function loadTexture(name: string, colorSpace: THREE.ColorSpace): Promise<THREE.Texture> {
  const key = name + colorSpace;
  if (!textureCache.has(key)) {
    textureCache.set(key, textureLoader.loadAsync('/legacy/' + name).then((texture) => {
      texture.flipY = false;
      texture.colorSpace = colorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.name = name;
      texture.userData.mimeType = name.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
      return texture;
    }));
  }
  return textureCache.get(key)!;
}

function toThreeMatrix(m: any): THREE.Matrix4 {
  const raw = new THREE.Matrix4().fromArray([
    m.m00, m.m01, m.m02, m.m03, m.m04, m.m05, m.m06, m.m07,
    m.m08, m.m09, m.m10, m.m11, m.m12, m.m13, m.m14, m.m15,
  ]);
  return MIRROR_Z.clone().multiply(raw).multiply(MIRROR_Z);
}

function applyTransform(target: THREE.Object3D, node: any, isRoot: boolean) {
  // Root nodes are positioned and rotated by the game; only their scale is part of the asset.
  if (!isRoot) {
    const rotation = new CL3D.Matrix4();
    rotation.setRotationDegrees(node.Rot);
    target.quaternion.setFromRotationMatrix(toThreeMatrix(rotation));
    target.position.set(node.Pos.X, node.Pos.Y, -node.Pos.Z);
  }
  // Flat effect quads carry a zero Z scale, which would make the node matrix non-invertible.
  target.scale.set(node.Scale.X || 1, node.Scale.Y || 1, node.Scale.Z || 1);
}

function buildGeometry(buffer: any): THREE.BufferGeometry {
  const count = buffer.Vertices.length;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  buffer.Vertices.forEach((v: any, i: number) => {
    position.set([v.Pos.X, v.Pos.Y, -v.Pos.Z], i * 3);
    normal.set([v.Normal.X, v.Normal.Y, -v.Normal.Z], i * 3);
    uv.set([v.TCoords.X, v.TCoords.Y], i * 2);
  });
  const index: number[] = [];
  for (let i = 0; i < buffer.Indices.length; i += 3) {
    index.push(buffer.Indices[i], buffer.Indices[i + 2], buffer.Indices[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

async function buildMaterial(mat: any, isCollider: boolean): Promise<THREE.Material> {
  const texName = mat.Tex1 ? fileName(mat.Tex1.Name) : null;
  const map = texName ? await loadTexture(texName, THREE.SRGBColorSpace) : null;
  if (isCollider) {
    return new THREE.MeshBasicMaterial({ name: 'collider', color: 0x00ff00 });
  }
  if (mat.Type === MATERIAL_ADD_COLOR || mat.Type === MATERIAL_ALPHA_CHANNEL) {
    const material = new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide });
    material.name = texName ?? 'effect';
    material.userData.blending = mat.Type === MATERIAL_ADD_COLOR ? 'additive' : 'alpha';
    return material;
  }
  const normalName = texName ? NORMAL_MAPS[texName] : undefined;
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap: normalName ? await loadTexture(normalName, THREE.NoColorSpace) : null,
    roughness: 0.75,
    metalness: 0.1,
  });
  material.name = texName ?? 'solid';
  return material;
}

function animatorData(node: any): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const animator of node.Animators) {
    if (animator.getType() === 'animatetexture') {
      data.textureFrames = animator.Textures.map((t: any) => fileName(t.Name));
      data.timePerFrame = animator.TimePerFrame;
    }
    if (animator.getType() === 'rotation') {
      // degrees per 10 ms in CopperLicht; mirrored like any other rotation
      data.rotationPer10ms = [-animator.Rotation.X, -animator.Rotation.Y, animator.Rotation.Z];
    }
  }
  return data;
}

async function convertNode(node: any, isRoot: boolean): Promise<THREE.Object3D> {
  const type = node.getType();
  const isCollider = /Collider$/.test(node.Name);
  let object: THREE.Object3D;

  if (type === 'mesh' && node.OwnedMesh) {
    const group = new THREE.Group();
    for (const buffer of node.OwnedMesh.MeshBuffers) {
      group.add(new THREE.Mesh(buildGeometry(buffer), await buildMaterial(buffer.Mat, isCollider)));
    }
    object = group.children.length === 1 ? group.children[0] : group;
  } else if (type === 'billboard') {
    object = new THREE.Object3D();
    object.userData.billboard = {
      texture: fileName(node.MeshBuffer.Mat.Tex1.Name),
      size: [node.SizeX, node.SizeY],
    };
  } else {
    object = new THREE.Object3D();
  }

  object.name = node.Name;
  applyTransform(object, node, isRoot);
  Object.assign(object.userData, animatorData(node));
  if (isCollider) object.userData.collider = true;

  for (const child of node.Children) object.add(await convertNode(child, false));
  return object;
}

async function save(path: string, body: BodyInit) {
  const response = await fetch('/__save?path=' + encodeURIComponent(path), { method: 'POST', body });
  if (!response.ok) throw new Error('save failed: ' + path);
}

async function extract(scene: any) {
  const exporter = new GLTFExporter();
  const summary: Record<string, unknown> = {};

  for (const [nodeName, file] of Object.entries(TEMPLATES)) {
    const node = scene.getSceneNodeFromName(nodeName);
    const object = await convertNode(node, true);
    const glb = (await exporter.parseAsync(object, { binary: true })) as ArrayBuffer;
    await save('models/' + file, glb);

    const box = new THREE.Box3().setFromObject(object);
    summary[nodeName] = { file, size: box.getSize(new THREE.Vector3()).toArray().map((n) => Math.round(n)) };
    log(`${file}: ${(glb.byteLength / 1024).toFixed(0)} KB`);
  }

  await save('models/extraction-summary.json', JSON.stringify(summary, null, 2));
  log('done');
  (window as any).extractionDone = true;
}

const engine = new CL3D.CopperLicht('cl', false, 30);
engine.initRenderer();
engine.OnLoadingComplete = () => extract(engine.getScene()).catch((e) => log('ERROR ' + e));
engine.load('/legacy/scene1.ccbjs');
