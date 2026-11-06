import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { atan2, cos, hypot, sin, tan } from '../detmath';
import { boxUv, industrialSurface, signTexture, surfaced } from '../view/surfaces';
import { withCollider } from './boneyard';
import { behindAll } from './horizon';
import { LIGHT_ANGLE, LIGHT_REACH, LIGHTS, lightAim, lightAt, WALL_LENGTH, WALL_TOP } from './wall';

/**
 * How the Solar Wall looks (where things are in world/wall): its stretch by the field as the
 * field's piece (girders, the mesh hung between them, the searchlights' housings on its top
 * edge, red beacons, its neon sign THE SOLAR WALL · MARS PAYS on both faces), the stretch beyond
 * out to its ends drawn behind everything, and the searchlights' cones of light sweeping the
 * lane as world/wall says they look.
 */

/** Posts every POST_STEP (units, 200 m) along the wall, the top chord and rails every RAIL_STEP down it (units, 400 m). */
const POST_STEP = 4000;
const RAIL_STEP = 8000;
/** The President's colors on the sign: his gold in neon. */
const SIGN_COLOR = '#ffb000';

/** The mesh hung between the girders: a fine grid of wire, see-through, drawn once on a canvas. */
function meshTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    g.clearRect(0, 0, size, size);
    g.strokeStyle = 'rgba(150, 156, 166, 0.9)';
    g.lineWidth = 3;
    for (let k = 0; k <= size; k += 32) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, size);
      g.moveTo(0, k);
      g.lineTo(size, k);
      g.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * The stretch of the wall by the field in its box's frame (`half` its half extents, its top
 * edge at +half.y): the top chord and rails down it, posts, braces in the top bays, the mesh,
 * the searchlights' housings with their lenses, red beacons, the sign on both faces.
 */
export function wallPiece(half: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(4401), 2), color: 0x9aa0a8 });
  const girders: THREE.BufferGeometry[] = [];
  const top = half.y;
  const block = (x: number, y: number, z: number, cx: number, cy: number, cz: number) => girders.push(new THREE.BoxGeometry(x, y, z).translate(cx, cy, cz).toNonIndexed());
  // the top chord, and rails down the wall as far as one sees it
  block(half.x * 2, 600, half.z * 2, 0, top - 300, 0);
  for (let y = top - RAIL_STEP; y > -half.y; y -= RAIL_STEP) block(half.x * 1.6, 200, half.z * 2, 0, y, 0);
  // posts the whole way down, and braces in the top bays
  for (let z = -half.z; z <= half.z; z += POST_STEP) {
    block(half.x * 1.8, half.y * 2, 160, 0, 0, z);
    if (z + POST_STEP <= half.z) {
      const brace = new THREE.BoxGeometry(80, hypot(POST_STEP, RAIL_STEP), 80);
      const lean = atan2(POST_STEP, RAIL_STEP);
      brace.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, cos(lean), -sin(lean), 0, 0, sin(lean), cos(lean), 0, 0, 0, 0, 1));
      girders.push(brace.translate(0, top - RAIL_STEP / 2, z + POST_STEP / 2).toNonIndexed());
    }
  }
  group.add(new THREE.Mesh(boxUv(mergeGeometries(girders), 400), steel));
  // the mesh between them, both faces, its wires every 2 m
  const net = meshTexture();
  net.repeat.set((half.z * 2) / 2560, (half.y * 2) / 2560);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(half.z * 2, half.y * 2).applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1)), new THREE.MeshStandardMaterial({ map: net, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.8 }));
  group.add(mesh);
  // the searchlights' housings on the top edge, their lenses lit, and red beacons between them
  const lenses: THREE.BufferGeometry[] = [];
  const housings: THREE.BufferGeometry[] = [];
  const beacons: THREE.BufferGeometry[] = [];
  const foot = new THREE.Vector3();
  for (let i = 0; i < LIGHTS; i++) {
    lightAt(i, foot);
    const y = foot.y - (WALL_TOP - half.y);
    housings.push(new THREE.CylinderGeometry(70, 90, 200, 12).translate(0, y - 40, foot.z).toNonIndexed());
    lenses.push(new THREE.CylinderGeometry(60, 60, 10, 16).translate(0, y + 65, foot.z).toNonIndexed());
    beacons.push(new THREE.SphereGeometry(40, 8, 6).translate(0, top + 40, foot.z + 4000).toNonIndexed());
  }
  group.add(new THREE.Mesh(mergeGeometries(housings), steel));
  group.add(new THREE.Mesh(mergeGeometries(lenses), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.9).multiplyScalar(4), toneMapped: false })));
  group.add(new THREE.Mesh(mergeGeometries(beacons), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.06).multiplyScalar(3), toneMapped: false })));
  // the sign on both faces, under the top chord, 1.6 km wide
  for (const side of [-1, 1]) {
    const plane = new THREE.PlaneGeometry(32000, 8000);
    // facing -x on the near face, +x on the far one
    plane.applyMatrix4(new THREE.Matrix4().set(0, 0, side, 0, 0, 1, 0, 0, -side, 0, 0, 0, 0, 0, 0, 1));
    const sign = new THREE.Mesh(plane.translate(side * (half.x + 30), top - 5400, 0), new THREE.MeshBasicMaterial({ map: signTexture('THE SOLAR WALL · MARS PAYS', SIGN_COLOR), transparent: true, toneMapped: false, side: THREE.FrontSide }));
    group.add(sign);
  }
  return withCollider(group, half);
}

/**
 * The wall beyond its stretch by the field, out to the ends of its 340 km, and its searchlights'
 * cones: drawn behind everything that flies, a dark band under a line of lights; and the cones,
 * each a long see-through cone of light, brightest at its foot, turned each frame to where its
 * light looks (see update).
 */
export class WallScene {
  readonly group = new THREE.Group();
  private readonly cones: THREE.Mesh[] = [];
  private readonly foot = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  constructor() {
    // the far stretch: a band 2 km tall under the top edge, both ways from 8 km to its end
    const band = new THREE.MeshBasicMaterial({ color: 0x0c0d10, transparent: true, depthWrite: false });
    const lights: number[] = [];
    for (const side of [-1, 1]) {
      const length = WALL_LENGTH / 2 - 160000;
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(length, 40000).applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1)).translate(0, WALL_TOP - 20000, side * (160000 + length / 2)), behindAll(band));
      strip.renderOrder = -2;
      strip.frustumCulled = false;
      this.group.add(strip);
      for (let z = 160000; z < WALL_LENGTH / 2; z += 8000) lights.push(0, WALL_TOP + 100, side * z);
    }
    const points = new THREE.BufferGeometry();
    points.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    const dots = new THREE.Points(points, behindAll(new THREE.PointsMaterial({ color: new THREE.Color(1, 0.95, 0.8).multiplyScalar(2), size: 2.5, sizeAttenuation: false, transparent: true, depthWrite: false, toneMapped: false })));
    dots.renderOrder = -1;
    dots.frustumCulled = false;
    this.group.add(dots);
    // the cones: open at their far end, their light fading along them (vertex colors)
    const radius = tan(LIGHT_ANGLE) * LIGHT_REACH;
    const shape = new THREE.CylinderGeometry(radius, 30, LIGHT_REACH, 32, 8, true).translate(0, LIGHT_REACH / 2, 0);
    const position = shape.getAttribute('position');
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const fade = 1 - position.getY(i) / LIGHT_REACH;
      colors.set([fade * fade, fade * fade, fade * fade * 0.9], i * 3);
    }
    shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // soft at its sides: the cone's light by how squarely the eye looks through its face, none at its silhouette
    const light = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(1, 0.96, 0.85).multiplyScalar(0.16) } },
      vertexShader: `
        attribute vec3 color;
        varying vec3 vShade;
        varying float vFacing;
        void main() {
          vec4 eye = modelViewMatrix * vec4(position, 1.0);
          vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-eye.xyz)));
          vShade = color;
          gl_Position = projectionMatrix * eye;
        }`,
      fragmentShader: `
        uniform vec3 tint;
        varying vec3 vShade;
        varying float vFacing;
        void main() {
          gl_FragColor = vec4(tint * vShade * vFacing * vFacing, 1.0);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < LIGHTS; i++) {
      const cone = new THREE.Mesh(shape, light);
      cone.frustumCulled = false;
      cone.userData.shadowless = true;
      this.cones.push(cone);
      this.group.add(cone);
    }
  }

  /** The cones where world/wall says their lights look at field time `time`. */
  update(time: number) {
    this.cones.forEach((cone, i) => {
      cone.position.copy(lightAt(i, this.foot));
      cone.quaternion.setFromUnitVectors(WallScene.UP, lightAim(i, time, this.aim));
    });
  }
}
