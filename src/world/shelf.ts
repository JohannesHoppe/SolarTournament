import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cos, sin } from '../detmath';
import { rotateX, rotateY, rotateZ } from '../detthree';
import { TAG_IDS } from '../campaign/finds';
import { boxUv, hazardSurface, industrialSurface, signTexture, surfaced } from '../view/surfaces';
import { canvas, toTexture } from '../view/textures';
import { brandFinish } from './yacht';

/**
 * The shelf in Patience's galley (docs/campaign/STORY.md, "Something to collect"): mementos of the
 * road on two boards bolted to the wall left of the porthole, each there once the job it comes
 * from is done, and right of it a rail of small stamped tags, one for every black box of the dead
 * the Host has found (see campaign/finds), under the crew's hand-painted NOT FORGOTTEN. Low poly,
 * in the galley's frame (the floor's middle at the origin, y up, the porthole's wall at x = -90).
 */

/** The porthole's wall, inside (units). */
const WALL = -90;
/** The boards' tops (units over the floor: 1.2 m and 1.9 m) and the stretch of wall they run along (z). */
const LOW = 24.5;
const HIGH = 38.5;
const FROM = -57;
const TO = -21;
/** The rails of tags: their heights (units), the stretch of wall right of the porthole (z) and how many tags a rail takes. */
const RAILS = [37, 31, 25, 19];
const RAIL_FROM = 22;
const RAIL_TO = 57;
const PER_RAIL = Math.ceil(TAG_IDS.length / RAILS.length);
/** A tag (units: 5.5 by 9 cm) on its short chain, and the vertices each takes in the rail's mesh. */
const TAG = { width: 1.1, height: 1.8, chain: 1.2 };
const TAG_VERTICES = 72;
const SHELF_SEED = 7351;

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
/** A plane (facing +z) turned to face into the room from the porthole's wall (+x). */
const intoRoom = (plane: THREE.PlaneGeometry) => rotateY(plane, Math.PI / 2);

/** The shelf, built once: its group, each memento by the job it comes from, and the rail's tags. */
let built: { root: THREE.Group; mementos: Map<string, THREE.Object3D>; tags: THREE.BufferGeometry } | null = null;

/** The Settlers' brochure of the Ninth (Kiln): warm sea, white beach, the President's sun. */
function brochure(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const [element, g] = canvas(256, 320);
  const sky = g.createLinearGradient(0, 0, 0, 200);
  sky.addColorStop(0, '#ff9d3a');
  sky.addColorStop(1, '#ffe2a8');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 200);
  g.fillStyle = '#ffd24a';
  g.beginPath();
  g.arc(128, 150, 46, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1f78c8';
  g.fillRect(0, 170, 256, 70);
  g.fillStyle = '#f2e3c0';
  g.fillRect(0, 240, 256, 80);
  g.fillStyle = '#0b1a3a';
  g.textAlign = 'center';
  g.font = 'bold 26px sans-serif';
  g.fillText('THE PRESIDENT’S', 128, 40, 236);
  g.fillText('PLANET', 128, 72, 236);
  g.font = 'bold 18px sans-serif';
  g.fillText('BEACHFRONT PLOTS', 128, 276, 236);
  g.font = '14px sans-serif';
  g.fillText('warm seas · act now', 128, 302, 236);
  // folded, thumbed, the corner torn off: a stain over the sea
  g.fillStyle = 'rgba(70, 50, 30, 0.35)';
  g.beginPath();
  g.arc(70, 210, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(40, 30, 20, 0.25)';
  g.fillRect(126, 0, 4, 320);
  return toTexture(element);
}

/** The shelf, the mementos on it and the rail of tags, built once (see showShelf). */
export function shelf(): THREE.Group {
  if (built) return built.root;
  const root = new THREE.Group();
  const mementos = new Map<string, THREE.Object3D>();
  const steel = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(SHELF_SEED), 0.6), color: 0x6e716d });
  const rust = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(SHELF_SEED), 0.6), color: 0x9a7a5c });
  const glow = (color: THREE.Color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const metal = (parts: THREE.BufferGeometry[], material = steel) => new THREE.Mesh(mergeGeometries(parts.map((p) => boxUv(p.index ? p.toNonIndexed() : p, 12))), material);
  const memento = (job: string, ...meshes: THREE.Object3D[]) => {
    const group = new THREE.Group();
    group.add(...meshes);
    group.visible = false;
    root.add(group);
    mementos.set(job, group);
  };

  // the boards on their brackets, bolted to the wall
  const mid = (FROM + TO) / 2;
  const span = TO - FROM;
  root.add(metal([box(10, 1, span, WALL + 5, LOW - 0.5, mid), box(10, 1, span, WALL + 5, HIGH - 0.5, mid), ...[FROM + 3, TO - 3].flatMap((z) => [box(8, 1, 1, WALL + 4, LOW - 2, z), box(8, 1, 1, WALL + 4, HIGH - 2, z)])]));

  // Saw Brothers: a saw blade off their rig, its teeth worn, leaning on the wall
  const teeth = Array.from({ length: 20 }, (_, k) => {
    const a = (k / 20) * 2 * Math.PI;
    return box(0.3, 1, 1, 0, 5 * cos(a), 5 * sin(a));
  });
  memento('sawBrothers', metal([rotateZ(new THREE.CylinderGeometry(4.8, 4.8, 0.3, 24), Math.PI / 2), ...teeth], rust).translateX(WALL + 2).translateY(LOW + 5.4).translateZ(-52));

  // Wall Run: the cracked lens of a searchlight of the Solar Wall in its housing, a wedge broken out
  const lens = new THREE.Mesh(rotateZ(new THREE.CylinderGeometry(3.8, 3.8, 1, 20, 1, false, 0, 1.6 * Math.PI), Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xbfd6ea, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 }));
  const housing = metal([rotateY(new THREE.TorusGeometry(4.2, 0.6, 6, 20), Math.PI / 2), box(2, 1, 6, 1, -4.4, 0)]);
  memento('wallRun', ...[lens, housing].map((part) => part.translateX(WALL + 3).translateY(LOW + 4.8).translateZ(-42)));

  // Last of the Tallymen: Ma Tally's ledger, fat, its spine cracked, a strap round it
  const ledger = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(SHELF_SEED), 0.4), color: 0x5a2a1c, metalness: 0 });
  memento('lastTallymen', new THREE.Mesh(boxUv(box(6, 2.2, 8, WALL + 5, LOW + 1.1, -33), 6), ledger), metal([box(6.2, 2.4, 0.5, WALL + 5, LOW + 1.1, -31)]));

  // Sponsor Night: a Victory Cola bottle Crisp left on the counter, in the brand's lacquer
  const { paint } = brandFinish(10101);
  const profile = [[0, 0], [1.1, 0], [1.4, 0.4], [1.5, 2], [1.15, 3.2], [1.2, 4.2], [1.5, 5.4], [1.4, 6.6], [0.7, 8], [0.55, 9], [0.65, 9.2], [0, 9.2]].map(([r, y]) => new THREE.Vector2(r, y));
  memento('sponsorNight', new THREE.Mesh(new THREE.LatheGeometry(profile, 16).translate(WALL + 5, LOW, -25), paint(0xb3121c)));

  // Pilot Episode: Lanes Watch's ON AIR light off the camera drone
  const onAir = new THREE.Mesh(intoRoom(new THREE.PlaneGeometry(7.6, 1.9)), new THREE.MeshBasicMaterial({ map: signTexture('ON AIR', '#ff3b3b'), toneMapped: false }));
  memento('pilotEpisode', metal([box(2, 2.4, 8, WALL + 4, HIGH + 1.2, -52)]), onAir.translateX(WALL + 5.05).translateY(HIGH + 1.2).translateZ(-52));

  // Flux Tube Race: a cluster of Io's sulfur crystals from the miners
  const crystal = new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(SHELF_SEED), 0.2), color: 0xf0d640, metalness: 0, flatShading: true });
  const prisms = [[0, 3.4, 0, 0], [1.4, 2.4, 0.6, 0.5], [-1.2, 2.6, -0.5, -0.45], [0.4, 1.8, 1.3, 0.3], [-0.6, 2, -1.3, -0.35]].map(([x, h, z, lean]) => rotateX(new THREE.CylinderGeometry(0.01, 0.6, h, 6).translate(0, h / 2, 0), lean).translate(x, 0, z));
  memento('fluxTubeRace', new THREE.Mesh(mergeGeometries(prisms.map((p) => boxUv(p.toNonIndexed(), 4))).translate(WALL + 5, HIGH, -44), crystal));

  // Hollow Jack: the tip of his harpoon, barbed, lying along the board
  const tip = [new THREE.ConeGeometry(1.1, 4, 6).translate(0, 7, 0), new THREE.CylinderGeometry(0.4, 0.4, 6, 6).translate(0, 2, 0), rotateZ(box(0.3, 3, 0.8, 0, 0, 0), 0.6).translate(0.9, 5, 0), rotateZ(box(0.3, 3, 0.8, 0, 0, 0), -0.6).translate(-0.9, 5, 0)];
  memento('hollowJack', metal(tip.map((p) => rotateX(p, Math.PI / 2))).translateX(WALL + 5).translateY(HIGH + 1).translateZ(-38));

  // First Death: Perihelion's visor, cracked across, the gold film gone dull
  const visor = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 8, 0, Math.PI, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0xc89a3c, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide }));
  const crack = new THREE.Mesh(box(0.15, 0.15, 6), glow(new THREE.Color(0.1, 0.1, 0.1)));
  memento('firstDeath', ...[visor, crack].map((part) => part.translateX(WALL + 4).translateY(HIGH + 2).translateZ(-25)));

  // Trial IV: a shard of the President's carrier, its polished armor, a gilded edge, leaning below the boards
  const { paint: armor, gold } = brandFinish(4242);
  const shape = new THREE.Shape([new THREE.Vector2(-6, 0), new THREE.Vector2(5, 0), new THREE.Vector2(7, 4), new THREE.Vector2(3, 10), new THREE.Vector2(-2, 8), new THREE.Vector2(-5, 11), new THREE.Vector2(-7, 5)]);
  const shard = new THREE.Mesh(rotateY(new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }), Math.PI / 2), armor(0x5a606b));
  const edge = new THREE.Mesh(box(0.8, 0.6, 11), gold);
  memento('trialCarrier', shard.translateX(WALL + 2).translateZ(-40), edge.translateX(WALL + 2.2).translateY(0.3).translateZ(-40.5));

  // Kiln: a settler's brochure of the Ninth, pinned to the wall above the boards
  const leaflet = new THREE.Mesh(intoRoom(new THREE.PlaneGeometry(6.4, 8)), new THREE.MeshStandardMaterial({ map: brochure(), roughness: 0.9 }));
  memento('kiln', leaflet.translateX(WALL + 0.2).translateY(HIGH + 9).translateZ(-36),metal([box(0.4, 0.4, 0.4, WALL + 0.5, HIGH + 12.6, -36)]));

  // the rail of tags right of the porthole, every tag stamped steel on its chain, shown as far as found
  const railMid = (RAIL_FROM + RAIL_TO) / 2;
  root.add(metal(RAILS.map((y) => rotateX(new THREE.CylinderGeometry(0.3, 0.3, RAIL_TO - RAIL_FROM, 6), Math.PI / 2).translate(WALL + 1.5, y, railMid))));
  const pieces: THREE.BufferGeometry[] = [];
  const gap = (RAIL_TO - RAIL_FROM - 2) / PER_RAIL;
  for (let k = 0; k < TAG_IDS.length; k++) {
    const y = RAILS[Math.floor(k / PER_RAIL)];
    const z = RAIL_FROM + 1 + gap * ((k % PER_RAIL) + 0.5);
    pieces.push(box(0.1, TAG.chain, 0.1, WALL + 1.5, y - TAG.chain / 2, z), box(0.15, TAG.height, TAG.width, WALL + 1.6, y - TAG.chain - TAG.height / 2, z));
  }
  const tags = mergeGeometries(pieces.map((p) => boxUv(p, 2)));
  tags.setDrawRange(0, 0);
  root.add(new THREE.Mesh(tags, new THREE.MeshStandardMaterial({ ...surfaced(industrialSurface(SHELF_SEED), 0.3), color: 0xd8d8d0 })));
  // the crew's sign over the rail, painted by hand, and a strip of hazard paint along the wall below it
  // (under the cable tray that runs along the ceiling on this side)
  const sign = new THREE.Mesh(intoRoom(new THREE.PlaneGeometry(24, 6)), new THREE.MeshBasicMaterial({ map: signTexture('NOT FORGOTTEN', '#ff9d00'), toneMapped: false }));
  root.add(sign.translateX(WALL + 0.3).translateY(42).translateZ(railMid));
  root.add(new THREE.Mesh(boxUv(box(0.3, 1.2, RAIL_TO - RAIL_FROM, WALL + 0.2, 13, railMid), 6), new THREE.MeshStandardMaterial({ ...surfaced(hazardSurface(), 0.4) })));
  built = { root, mementos, tags };
  return root;
}

/** Shows the mementos of the jobs `done` and the first `tags` tags on the rail. */
export function showShelf(done: readonly string[], tags: number) {
  shelf();
  for (const [job, memento] of built!.mementos) memento.visible = done.includes(job);
  built!.tags.setDrawRange(0, Math.min(tags, TAG_IDS.length) * TAG_VERTICES);
}
