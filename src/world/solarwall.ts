import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { atan2, cos, hypot, sin, tan } from '../detmath';
import { boxUv, industrialSurface, signTexture, surfaced } from '../view/surfaces';
import { withCollider } from './boneyard';
import { behindAll } from './horizon';
import { LIGHT_ANGLE, LIGHT_REACH, LIGHTS, lightAim, lightAt, lightHolds, WALL_LENGTH, WALL_TOP } from './wall';

/**
 * How the Solar Wall looks (where things are in world/wall): its stretch by the field as the
 * field's piece (girders, the mesh hung between them, the searchlights' housings on its top
 * edge, red beacons, its neon sign THE SOLAR WALL · MARS PAYS on both faces), the stretch beyond
 * out to its ends drawn behind everything, and the searchlights' cones sweeping the lane as
 * world/wall says they look, drawn by the flight computer (see sensorCone).
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
  // the mesh between them, both faces (flat: either, never both, so one pass), its wires every 2 m
  const net = meshTexture();
  net.repeat.set((half.z * 2) / 2560, (half.y * 2) / 2560);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(half.z * 2, half.y * 2).applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1)), new THREE.MeshStandardMaterial({ map: net, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide, forceSinglePass: true, roughness: 0.6, metalness: 0.8 }));
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

/** The HUD's azure and its orange for what the pilot acts on now, as glows (see style.css, --hud and --neon-orange). */
const HUD_AZURE = new THREE.Color(0x0062ff);
const HUD_ORANGE = new THREE.Color(0xff9d00);
/** Rings drawn round a sensor's cone every this far along it (units, 1 km), so it reads as a volume. */
const CONE_RING = 20000;

/**
 * Where a searchlight or a sensor looks (the Solar Wall's searchlights, the Feeders' tugs at
 * Granary), as the flight computer draws it. In vacuum a searchlight's beam shows nothing from the
 * side (there is no dust in the lane to scatter it), and a sensor's never shows: the flight
 * computer knows where each one points and draws its cone into space as a warning volume in the
 * HUD's style, a faint azure veil with thin lines along its silhouette and rings along it, fading
 * towards its far end; orange while it holds the own ship (`held`, set each frame, 0 to 1).
 * `angle` its half opening (rad), `reach` its length (units) along +y from its foot, open at its
 * far end.
 */
export function sensorCone(angle: number, reach: number): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const radius = tan(angle) * reach;
  const shape = new THREE.CylinderGeometry(radius, 30, reach, 48, 8, true).translate(0, reach / 2, 0);
  const cone = new THREE.ShaderMaterial({
    uniforms: { azure: { value: HUD_AZURE }, orange: { value: HUD_ORANGE }, held: { value: 0 }, reach: { value: reach }, ring: { value: CONE_RING } },
    vertexShader: `
      varying float vFacing;
      varying float vAlong;
      void main() {
        vec4 eye = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-eye.xyz)));
        vAlong = position.y;
        gl_Position = projectionMatrix * eye;
      }`,
    fragmentShader: `
      uniform vec3 azure;
      uniform vec3 orange;
      uniform float held;
      uniform float reach;
      uniform float ring;
      varying float vFacing;
      varying float vAlong;
      void main() {
        float fade = 1.0 - vAlong / reach;
        // the silhouette's line: where the eye grazes the cone's face, a couple of pixels wide
        float grazing = 1.0 - vFacing;
        float edge = smoothstep(1.0 - 2.5 * fwidth(grazing), 1.0, grazing);
        // rings along the axis, a pixel and a half wide whatever their distance
        float d = abs(fract(vAlong / ring + 0.5) - 0.5) * ring;
        float rings = 1.0 - smoothstep(0.0, 1.5 * fwidth(vAlong), d);
        float glow = 0.012 + 0.4 * max(edge, rings * 0.5);
        gl_FragColor = vec4(mix(azure, orange, held) * glow * fade, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(shape, cone);
  mesh.frustumCulled = false;
  mesh.userData.shadowless = true;
  return mesh;
}

/**
 * The wall beyond its stretch by the field, out to the ends of its 340 km, and its searchlights'
 * cones: drawn behind everything that flies, a dark band under a line of lights; and the cones,
 * each a long see-through cone of light, brightest at its foot, turned each frame to where its
 * light looks (see update).
 */
export class WallScene {
  readonly group = new THREE.Group();
  private readonly cones: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
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
    for (let i = 0; i < LIGHTS; i++) {
      const cone = sensorCone(LIGHT_ANGLE, LIGHT_REACH);
      this.cones.push(cone);
      this.group.add(cone);
    }
  }

  /** The cones where world/wall says their lights look at field time `time`, orange where one holds `pilot` (the own ship, null for none). */
  update(time: number, pilot: THREE.Vector3 | null) {
    this.cones.forEach((cone, i) => {
      cone.position.copy(lightAt(i, this.foot));
      cone.quaternion.setFromUnitVectors(WallScene.UP, lightAim(i, time, this.aim));
      cone.material.uniforms.held.value = pilot && lightHolds(i, pilot, time) ? 1 : 0;
    });
  }
}
