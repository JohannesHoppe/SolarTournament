import * as THREE from 'three';
import { cos, sin } from '../detmath';
import { flatGrid, withCollider } from './boneyard';
import { pixelTexture } from '../view/textures';
import { Noise } from './noise';
import { SEA, seaHeight, TITAN_AIR } from './titan';

/**
 * How Kraken Mare on Titan looks (where things are in world/titan): the sea of liquid methane,
 * dark and glassy, still but for a slow swell of ripples, the field's piece it collides as; the
 * top of the orange haze as a sheet at the deck, curving away as Titan does; the haze's light.
 */

/** The haze's light (see view/haze): a dull orange right under the deck, a deep brown towards the sea. */
export const TITAN_DECK_LIGHT = new THREE.Color(0.55, 0.3, 0.1);
export const TITAN_DEEP_LIGHT = new THREE.Color(0.12, 0.06, 0.025);

/** The sea's grid: cells of SEA_CELL (units, 100 m), its ripples a normal map tiled every RIPPLE_TILE (units, 40 m). */
const SEA_CELL = 2000;
const RIPPLE_TILE = 800;

/** The sea of the field in its box's frame (`half` its half extents): dark, glossy liquid methane, rippled a little by the slow wind. */
export function seaPiece(half: THREE.Vector3): THREE.Group {
  const geometry = flatGrid(half, SEA_CELL);
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    position.setY(i, half.y + seaHeight(position.getX(i), position.getZ(i)) - SEA);
    uv.setXY(i, position.getX(i) / RIPPLE_TILE, position.getZ(i) / RIPPLE_TILE);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 0.12, metalness: 0.7, normalMap: rippleTexture(), normalScale: new THREE.Vector2(0.25, 0.25) });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return withCollider(new THREE.Group().add(mesh), half);
}

/** The ripples of the sea as a normal map: soft swells from a tiling noise. */
function rippleTexture(): THREE.CanvasTexture {
  const noise = new Noise(9009);
  const height = (x: number, y: number) => noise.fractal(x / 16, 0.3, y / 16, 3);
  // the slope of the swells as a normal: x and y tilted, z up
  return pixelTexture(128, (x, y, rgb) => {
    rgb[0] = 0.5 - (height(x + 1, y) - height(x - 1, y)) * 0.8;
    rgb[1] = 0.5 - (height(x, y + 1) - height(x, y - 1)) * 0.8;
    rgb[2] = 1;
  }, true);
}

/**
 * Under the deck, a sphere BACKDROP around the eye (units, 15 km), drawn behind everything,
 * catches every view the haze would otherwise leave open to the sky: only the haze's light along
 * it shows (see view/haze), so every view ends in the orange. Over the deck it draws nothing.
 */
const BACKDROP = 300000;
const backdropVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    gl_Position.z = gl_Position.w * 0.999999;
  }
`;
const backdropFragment = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_FOG
      if (length(cameraPosition - hazeCenter) > hazeRadius) discard;
      gl_FragColor.rgb = hazeAlong(cameraPosition, vWorld).rgb;
    #else
      discard;
    #endif
  }
`;

/** The haze all around the eye under the deck (see BACKDROP), following the camera. */
export function hazeBackdrop(): THREE.Mesh {
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(BACKDROP, 32, 16), new THREE.ShaderMaterial({ vertexShader: backdropVertex, fragmentShader: backdropFragment, fog: true, side: THREE.BackSide, depthWrite: false }));
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  backdrop.onBeforeRender = (_, __, camera) => {
    backdrop.position.copy(camera.position);
    backdrop.updateMatrixWorld();
  };
  return backdrop;
}

/** The haze's deck: a sheet RINGS rings and SPOKES spokes out to DECK_REACH (units, 30 km), curving down as Titan's deck does, seen through at about four parts in five. */
const RINGS = 60;
const SPOKES = 96;
const DECK_REACH = 600000;
const DECK_OPACITY = 0.78;
/** The deck's color, a dim orange, and its cloud tops: soft billows from a tiling noise, one tile every CLOUD_TILE (units, 2 km). */
const DECK_COLOR = new THREE.Color(0.34, 0.16, 0.05);
const CLOUD_TILE = 40000;

/** The haze's cloud tops: soft billows, brighter crests over darker troughs. */
function cloudTexture(): THREE.CanvasTexture {
  const billows = new Noise(9010);
  return pixelTexture(256, (x, y, rgb) => rgb.fill(0.75 + 0.45 * billows.fractal(x / 32, 0.6, y / 32, 4)));
}

/** The top of Titan's haze, a sheet at its deck (see TITAN_AIR): a dull orange, the same seen from over and under it. */
export function hazeDeck(): THREE.Mesh {
  const positions: number[] = [];
  const index: number[] = [];
  positions.push(0, 0, 0);
  for (let ring = 1; ring <= RINGS; ring++) {
    // rings farther apart the farther out, the curve's drop computed small, never from the sphere's far middle
    const r = DECK_REACH * (ring / RINGS) * (ring / RINGS);
    for (let spoke = 0; spoke < SPOKES; spoke++) {
      const angle = (spoke / SPOKES) * Math.PI * 2;
      positions.push(r * cos(angle), -(r * r) / (2 * TITAN_AIR.radius), r * sin(angle));
    }
  }
  for (let spoke = 0; spoke < SPOKES; spoke++) index.push(0, 1 + ((spoke + 1) % SPOKES), 1 + spoke);
  for (let ring = 1; ring < RINGS; ring++) {
    for (let spoke = 0; spoke < SPOKES; spoke++) {
      const a = 1 + (ring - 1) * SPOKES + spoke;
      const b = 1 + (ring - 1) * SPOKES + ((spoke + 1) % SPOKES);
      index.push(a, b, a + SPOKES, b, b + SPOKES, a + SPOKES);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // the cloud tops laid on from above, one tile every CLOUD_TILE
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i] / CLOUD_TILE, positions[i + 2] / CLOUD_TILE);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const deck = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: cloudTexture(), color: DECK_COLOR, transparent: true, opacity: DECK_OPACITY, side: THREE.DoubleSide, depthWrite: false }));
  deck.userData.shadowless = true;
  deck.position.y = TITAN_AIR.center.y + TITAN_AIR.radius;
  return deck;
}
