import * as THREE from 'three';
import { withCollider } from './boneyard';
import { hazeBackdrop, hazeDeck } from './kraken';
import { Noise } from './noise';
import { pixelTexture } from '../view/textures';
import { ARMOR_TILE, lacquer, shine, signTexture } from '../view/surfaces';
import { rotateX, rotateY, rotateZ } from '../detthree';
import { brandFinish } from './yacht';
import { cos, pow, sin } from '../detmath';
import { BODY_HEIGHT, BOTTLE_HEIGHT, BOTTLE_RADIUS, NECK_RADIUS, PLATFORM_THICK, VENUS_AIR } from './venus';

/**
 * How Highball over Venus looks (where things are in world/venus): Victory Cola's floating city,
 * new as only what the rich own is: a square platform of polished plates, white over the
 * brand's red, a gold rim and the brand's neon along its edges, lamps under it; six glass halls
 * of gardens in gold frames, their air lifting the city; at its middle the tower, a Victory Cola
 * bottle 400 m high in dark red glass lit from within, its label in neon. Under the city the top
 * of the acid clouds as a sheet at the deck, the yellow haze all around the eye under it.
 */

/** The brand's colors: Victory Cola's red, the white, the gold trim, the neon. */
const RED = 0xb80d22;
const WHITE = 0xf2efe8;
const NEON = '#ff3b3b';
/** The plates' seed (see armorSurface). */
const PLATES = 21101;

let materials: { paint: (color: number) => THREE.MeshPhysicalMaterial; gold: THREE.MeshPhysicalMaterial; sign: THREE.MeshBasicMaterial } | null = null;
/** The city's materials, made once: polished plates in a color, the gold, the brand's neon sign. */
function cityMaterials() {
  if (materials) return materials;
  const { paint, gold } = brandFinish(PLATES);
  const sign = new THREE.MeshBasicMaterial({ map: signTexture('VICTORY COLA', NEON), color: new THREE.Color().setScalar(1.6), toneMapped: false });
  return (materials = { paint, gold, sign });
}

/** A geometry's texture coordinates laid on at the plates' true size, from its box projection along y (top and bottom) and round it. */
function plated(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) + position.getZ(i)) / ARMOR_TILE, (position.getY(i) + position.getZ(i)) / ARMOR_TILE);
  return geometry;
}

/** The platform in its box's frame (`half` its half extents): white on top over red flanks, a gold rim, the brand's neon twice on each flank, lamps beneath. */
export function platform(half: THREE.Vector3): THREE.Group {
  const { paint, gold, sign } = cityMaterials();
  const group = new THREE.Group();
  const deck = plated(new THREE.BoxGeometry(half.x * 2, PLATFORM_THICK, half.z * 2));
  // a box's faces: the flanks red, the top white, the bottom red
  group.add(new THREE.Mesh(deck, [paint(RED), paint(RED), paint(WHITE), paint(RED), paint(RED), paint(RED)]));
  for (const side of [-1, 1]) {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(half.x * 2 + 60, 80, 60).translate(0, half.y - 40, side * (half.z + 30)), gold));
    group.add(new THREE.Mesh(new THREE.BoxGeometry(60, 80, half.z * 2 + 60).translate(side * (half.x + 30), half.y - 40, 0), gold));
  }
  // the brand's neon, 160 m long, twice on each flank
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * Math.PI * 2;
    const out = half.x + 20;
    for (const along of [-0.45, 0.45]) {
      const board = rotateY(new THREE.PlaneGeometry(3200, 800), Math.PI / 2 - angle).translate(cos(angle) * out - sin(angle) * along * half.x, -60, sin(angle) * out + cos(angle) * along * half.x);
      group.add(new THREE.Mesh(board, sign));
    }
  }
  // lamps under the platform, warm, in a grid
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.55).multiplyScalar(2.4), toneMapped: false });
  const bulb = new THREE.SphereGeometry(60, 8, 6);
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const light = new THREE.Mesh(bulb, lamp);
      light.position.set((i / 4.5) * half.x, -half.y - 30, (j / 4.5) * half.z);
      group.add(light);
    }
  }
  return withCollider(group, half);
}

/** A piece of the city that only collides: the bottle's neck (see cityPlacements). */
export const colliderOnly = (half: THREE.Vector3): THREE.Group => withCollider(new THREE.Group(), half);

/** The gardens' beds seen through the glass: rows of crops in greens, paths between them, a few beds of red fruit. */
function gardenTexture(): THREE.CanvasTexture {
  const leaves = new Noise(21102);
  return pixelTexture(256, (x, y, rgb) => {
    const row = y % 16;
    if (row < 3) {
      rgb[0] = 0.45;
      rgb[1] = 0.4;
      rgb[2] = 0.33;
      return;
    }
    const green = 0.25 + 0.2 * leaves.fractal(x / 6, 0.2, y / 6, 3);
    const fruit = (Math.floor(y / 16) % 5 === 3 && leaves.fractal(x / 3, 0.9, y / 3, 2) > 0.25) ? 1 : 0;
    rgb[0] = fruit ? 0.75 : green * 0.45;
    rgb[1] = fruit ? 0.12 : green;
    rgb[2] = fruit ? 0.08 : green * 0.3;
  });
}

/** A hall in its box's frame (`half` its half extents): gardens under a vaulted roof of warm glass in gold frames. */
export function hall(half: THREE.Vector3): THREE.Group {
  const { gold, paint } = cityMaterials();
  const group = new THREE.Group();
  const floor = -half.y;
  const wall = half.y * 1.1;
  // the beds, lit from within the glass
  const garden = gardenTexture();
  garden.wrapS = garden.wrapT = THREE.RepeatWrapping;
  garden.repeat.set(half.x / 400, half.z / 400);
  const beds = rotateX(new THREE.PlaneGeometry(half.x * 2, half.z * 2), -Math.PI / 2);
  group.add(new THREE.Mesh(beds.translate(0, floor + 10, 0), new THREE.MeshStandardMaterial({ map: garden, emissiveMap: garden, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.9 })));
  // a white plinth round its foot
  group.add(new THREE.Mesh(plated(new THREE.BoxGeometry(half.x * 2, 60, half.z * 2).translate(0, floor + 30, 0)), paint(WHITE)));
  // the glass: walls up to `wall`, a vaulted roof over them
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xfff2d8, emissive: 0x3a2a10, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, envMap: shine(), envMapIntensity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  group.add(new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, wall, half.z * 2, 1, 1, 1).translate(0, floor + wall / 2, 0), glass));
  const roof = rotateZ(new THREE.CylinderGeometry(half.z, half.z, half.x * 2, 24, 1, true, -Math.PI / 2, Math.PI), Math.PI / 2).scale(1, (half.y * 2 - wall) / half.z, 1).translate(0, floor + wall, 0);
  group.add(new THREE.Mesh(roof, glass));
  // the gold frames: ribs over the roof every 40 m, the eaves along both sides
  const ribs = Math.round(half.x / 400);
  for (let k = -ribs; k <= ribs; k++) {
    const rib = rotateY(new THREE.TorusGeometry(half.z, 14, 6, 24, Math.PI), Math.PI / 2).scale(1, (half.y * 2 - wall) / half.z, 1).translate((k / ribs) * half.x * 0.98, floor + wall, 0);
    group.add(new THREE.Mesh(rib, gold));
  }
  for (const side of [-1, 1]) group.add(new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, 30, 30).translate(0, floor + wall, side * half.z), gold));
  return withCollider(group, half);
}

/** The bottle's profile: its radius at height `h` over its foot (units): the body, its waist, the shoulders, the neck, the lip under the cap. */
function bottleRadius(h: number): number {
  if (h < BODY_HEIGHT) {
    // the body, a little waisted as the brand's bottle is
    const t = h / BODY_HEIGHT;
    return BOTTLE_RADIUS * (1 - 0.12 * sin(Math.PI * t) * sin(Math.PI * t));
  }
  const t = Math.min(1, (h - BODY_HEIGHT) / (BOTTLE_HEIGHT - BODY_HEIGHT));
  // the shoulders curve in to the neck over the first third, then the neck runs straight
  const shoulder = Math.min(1, t * 3);
  return NECK_RADIUS + (BOTTLE_RADIUS - NECK_RADIUS) * pow(1 - shoulder, 1.6);
}

/** The bottle in its body's box's frame (`half` its half extents): dark red glass lit from within, a white band of label with the brand's neon, a gold cap. */
export function bottle(half: THREE.Vector3): THREE.Group {
  const { gold, sign, paint } = cityMaterials();
  const group = new THREE.Group();
  const foot = -half.y;
  const points: THREE.Vector2[] = [new THREE.Vector2(1, 0)];
  const STEPS = 60;
  for (let i = 0; i <= STEPS; i++) {
    const h = (i / STEPS) * BOTTLE_HEIGHT;
    points.push(new THREE.Vector2(bottleRadius(h), h));
  }
  const glass = new THREE.LatheGeometry(points, 48).translate(0, foot, 0);
  group.add(new THREE.Mesh(glass, lacquer(new THREE.MeshPhysicalMaterial({ color: 0x5a0a10, emissive: 0x7a0c14, emissiveIntensity: 0.6, metalness: 0.1, roughness: 0.06, envMap: shine(), envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.03 }))));
  // the label: a white band round the body's waist, the neon on it front and back
  const middle = foot + BODY_HEIGHT * 0.5;
  const label = plated(new THREE.CylinderGeometry(bottleRadius(BODY_HEIGHT * 0.5) * 1.01, bottleRadius(BODY_HEIGHT * 0.5) * 1.01, 900, 48, 1, true).translate(0, middle, 0));
  group.add(new THREE.Mesh(label, paint(WHITE)));
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * Math.PI * 2;
    const r = bottleRadius(BODY_HEIGHT * 0.5) * 1.03;
    const board = rotateY(new THREE.PlaneGeometry(2000, 500), Math.PI / 2 - angle).translate(cos(angle) * r, middle, sin(angle) * r);
    group.add(new THREE.Mesh(board, sign));
  }
  // the cap, gold, fluted
  const cap = new THREE.CylinderGeometry(NECK_RADIUS * 1.1, NECK_RADIUS * 1.15, 300, 21).translate(0, foot + BOTTLE_HEIGHT + 150, 0);
  group.add(new THREE.Mesh(cap, gold));
  return withCollider(group, half);
}

/** The acid clouds' tops: a pale yellow, their haze's light a dull yellow under the deck and a brown far down (see view/haze). */
const VENUS_DECK = new THREE.Color(0.8, 0.74, 0.5);
export const VENUS_DECK_LIGHT = new THREE.Color(0.7, 0.6, 0.3);
export const VENUS_DEEP_LIGHT = new THREE.Color(0.22, 0.15, 0.05);

/** Highball's sky: the top of the acid clouds as a sheet at the deck, and the haze all around the eye under it. */
export function highball(): THREE.Group {
  return new THREE.Group().add(hazeDeck(VENUS_AIR, VENUS_DECK), hazeBackdrop());
}
