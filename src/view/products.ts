import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { atan2, cos, sin } from '../detmath';
import { Randomizer } from '../random';

/**
 * The sponsors' products, modelled in code for their holograms (see view/hologram): a can of
 * Victory Cola with its pull tab, a stacked Space Burger, a ribeye of Orange Steaks with its
 * crescent of fat and its marbling, and so on, one for every sponsor of game/satire-ads. Each is a single
 * geometry of a few hundred to a few thousand triangles, centered and scaled so its largest
 * side is one unit long, with an attribute `tone` per vertex: how brightly a part glows and how
 * far towards white, so a burger's patty, cheese and bun read apart in one color.
 */
export type Product = 'can' | 'burger' | 'bottle' | 'clone' | 'oxygen' | 'bond' | 'headset' | 'steak' | 'medkit';

/** Most triangles a product may have: a hologram in a small window, drawn while a clone is printed. */
export const PRODUCT_TRIANGLES = 3000;

/** Segments around a turned part: round at the hologram's size, light enough for the budget. */
const ROUND = 40;

/** A part of a product: its triangles, without index and texture coordinates, with its tone. */
function part(geometry: THREE.BufferGeometry, glow = 1, white = 0): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
  if (!flat.attributes.normal) flat.computeVertexNormals();
  const count = flat.attributes.position.count;
  const tone = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) tone.set([glow, white], i * 2);
  flat.setAttribute('tone', new THREE.BufferAttribute(tone, 2));
  return flat;
}

/** A body turned about the vertical from its profile, (radius, height) pairs from the bottom up. */
const lathe = (profile: [number, number][], segments = ROUND) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);

/** A dome's profile from its rim (radius, height) to its top, `steps` points along a quarter ellipse. */
function dome(radius: number, base: number, height: number, steps = 7): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 0.5;
    points.push([radius * cos(a), base + height * sin(a)]);
  }
  return points;
}

/** A thin open band around the vertical axis, `radius` out, from `low` to `high`. */
const band = (radius: number, low: number, high: number) =>
  new THREE.CylinderGeometry(radius, radius, high - low, ROUND, 1, true).translate(0, (low + high) / 2, 0);

/** A box at a place. */
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A flat shape pushed out `depth` along z (from z = 0), its edges rounded by `bevel`. */
function extrude(shape: THREE.Shape, depth: number, bevel = 0): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 10 });
}

/** A rectangle with rounded corners, centered on (cx, cy); drawn into `shape` (a hole is a path). */
function rounded<T extends THREE.Path>(width: number, height: number, radius: number, shape: T, cx = 0, cy = 0): T {
  const [x, y] = [cx - width / 2, cy - height / 2];
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

/**
 * A ribbon wound around a can or a bottle: `radius` out, swinging up and down `swing` about
 * `height` twice around, `width` tall; the brand's swoosh.
 */
function swoosh(radius: number, height: number, swing: number, width: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const at = (i: number, edge: number) => {
    const a = (i / 64) * Math.PI * 2;
    const y = height + swing * sin(a * 2) + edge * width * (0.6 + 0.4 * cos(a * 2));
    return [sin(a) * radius, y, cos(a) * radius];
  };
  for (let i = 0; i < 64; i++) positions.push(...at(i, -0.5), ...at(i + 1, -0.5), ...at(i + 1, 0.5), ...at(i, -0.5), ...at(i + 1, 0.5), ...at(i, 0.5));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A small part laid onto a surface: its z axis along the surface's normal at `point`. */
function laid(geometry: THREE.BufferGeometry, point: THREE.Vector3, normal: THREE.Vector3, spin: number): THREE.BufferGeometry {
  const turn = new THREE.Matrix4().makeRotationZ(spin);
  const face = new THREE.Matrix4().lookAt(new THREE.Vector3(), normal, Math.abs(normal.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  return geometry.applyMatrix4(turn).applyMatrix4(face).translate(point.x, point.y, point.z);
}

/** A can of Victory Cola: rolled rim, necked top with the pull tab, the brand's swoosh around it. */
function can(): THREE.BufferGeometry[] {
  const body = lathe([[0, 0.02], [0.24, 0.0], [0.29, 0.02], [0.33, 0.1], [0.33, 1.02], [0.29, 1.14], [0.27, 1.18], [0.28, 1.2], [0.265, 1.21], [0.25, 1.18], [0, 1.18]]);
  // the tab: a rounded plate with a finger hole, flat on the lid, riveted at its middle
  const plate = rounded(0.12, 0.22, 0.05, new THREE.Shape());
  plate.holes.push(rounded(0.06, 0.09, 0.025, new THREE.Path(), 0, -0.05));
  const ring = extrude(plate, 0.012).rotateX(-Math.PI / 2).translate(0, 1.19, 0.05);
  const rivet = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12).translate(0, 1.19, 0.02);
  // the drinking mouth, scored into the lid ahead of the tab
  const mouth = extrude(rounded(0.13, 0.08, 0.035, new THREE.Shape()), 0.006).rotateX(-Math.PI / 2).translate(0, 1.183, -0.11);
  return [part(body), part(swoosh(0.336, 0.6, 0.12, 0.14), 1.4, 0.35), part(band(0.334, 0.12, 0.16), 1.2, 0.2), part(ring, 1.4, 0.5), part(rivet, 1.4, 0.5), part(mouth, 0.8)];
}

/**
 * A Space Burger, as plain as space makes it: the flat bottom bun, a thick, rough patty sticking
 * out past the bun, a slice of cheese with its corners hanging over the patty, a high domed bun
 * with sesame on top. Nothing grows out there, so nothing green. Each layer apart by a dark gap,
 * standing level, so it turns without wobbling. The layers are open shells without their flat
 * inner faces: a hologram glows brightest where a face turns away, and those discs, seen almost
 * edge-on, would flood its middle with light.
 */
function burger(): THREE.BufferGeometry[] {
  const bottom = lathe([[0.38, 0], [0.47, 0.02], [0.52, 0.08], [0.5, 0.15], [0.44, 0.16]]);
  // the patty: thick, rough at its rim, sticking out past the bun
  const patty = lathe([[0.5, 0.17], [0.58, 0.2], [0.6, 0.25], [0.58, 0.3], [0.5, 0.33]], 40);
  const rough = patty.attributes.position;
  for (let i = 0; i < rough.count; i++) {
    const [x, z] = [rough.getX(i), rough.getZ(i)];
    const r = Math.sqrt(x * x + z * z);
    if (r < 0.5) continue;
    const a = atan2(x, z);
    const bump = 1 + 0.025 * sin(a * 13) + 0.02 * sin(a * 29 + 1.3);
    rough.setX(i, x * bump);
    rough.setZ(i, z * bump);
  }
  patty.computeVertexNormals();
  // the cheese: a square slice, its corners hanging down over the patty
  const cheese = new THREE.PlaneGeometry(0.9, 0.9, 12, 12).rotateX(-Math.PI / 2).rotateY(Math.PI / 4);
  const p = cheese.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const out = Math.max(0, Math.sqrt(p.getX(i) * p.getX(i) + p.getZ(i) * p.getZ(i)) - 0.48);
    p.setY(i, 0.35 - out * 1.4);
  }
  cheese.computeVertexNormals();
  const top = lathe([[0.46, 0.4], [0.53, 0.43], ...dome(0.54, 0.45, 0.3, 6)]);
  const seeds: THREE.BufferGeometry[] = [];
  const random = new Randomizer(2584);
  for (let i = 0; i < 18; i++) {
    const a = 0.45 + random.nextFloat() * 0.95;
    const around = (i / 18) * Math.PI * 2 + random.nextFloat() * 0.25;
    const normal = new THREE.Vector3(cos(a) * sin(around), sin(a), cos(a) * cos(around));
    const point = new THREE.Vector3(0.54 * cos(a) * sin(around), 0.45 + 0.3 * sin(a), 0.54 * cos(a) * cos(around));
    seeds.push(part(laid(new THREE.SphereGeometry(1, 5, 3).scale(0.034, 0.018, 0.012), point, normal, random.nextFloat() * 3), 1.7, 0.75));
  }
  const all = [
    part(bottom, 0.8),
    part(patty, 0.85),
    part(cheese, 0.7, 0.2),
    part(top, 1.05),
    ...seeds,
  ];
  return all;
}

/** Victory Cola Zero in its contour bottle: waisted body, the label with its zero, the cap. */
function bottle(): THREE.BufferGeometry[] {
  const body = lathe([[0, 0.01], [0.2, 0], [0.25, 0.03], [0.27, 0.12], [0.26, 0.3], [0.21, 0.44], [0.215, 0.55], [0.27, 0.7], [0.28, 0.86], [0.25, 1.02], [0.18, 1.2], [0.115, 1.37], [0.1, 1.45], [0.12, 1.47], [0, 1.47]]);
  const cap = new THREE.CylinderGeometry(0.12, 0.125, 0.1, 18).translate(0, 1.52, 0);
  const zero = new THREE.TorusGeometry(0.06, 0.016, 8, 24).scale(0.75, 1, 1).translate(0, 0.78, 0.29);
  return [part(body, 0.9), part(band(0.284, 0.7, 0.86), 1.3, 0.3), part(cap, 1.4, 0.4), part(zero, 1.6, 0.6)];
}

/**
 * A head and shoulders: the bust a hologram shows of a person (PrintMe's clones, DreamLink's
 * sleeper, later a caller on the radio). Its head stands 0.62 high, facing +z.
 */
export function bust(): THREE.BufferGeometry[] {
  const shoulders = lathe([[0, 0], [0.4, 0], [0.43, 0.1], [0.38, 0.2], [0.2, 0.28], [0.09, 0.31], [0, 0.31]], 32).scale(1, 1, 0.55);
  const neck = new THREE.CylinderGeometry(0.075, 0.085, 0.2, 16, 1, true).translate(0, 0.38, 0);
  const head = new THREE.SphereGeometry(0.17, 24, 16).scale(0.92, 1.2, 1).translate(0, 0.62, 0);
  const nose = new THREE.ConeGeometry(0.03, 0.08, 8).rotateX(Math.PI / 2).translate(0, 0.6, 0.18);
  const ear = (side: number) => new THREE.SphereGeometry(0.035, 8, 6).scale(0.5, 1, 1).translate(side * 0.155, 0.62, 0);
  return [part(shoulders, 0.9), part(neck, 0.9), part(head), part(nose), part(ear(-1)), part(ear(1))];
}

/** PrintMe Bodies: a fresh clone standing on the printer's bed under its gantry ring. */
function clone(): THREE.BufferGeometry[] {
  const bed = lathe([[0, 0], [0.36, 0], [0.38, 0.03], [0.36, 0.06], [0, 0.06]]);
  const torso = lathe([[0.06, 0.48], [0.13, 0.5], [0.15, 0.6], [0.13, 0.7], [0.15, 0.82], [0.19, 0.88], [0.17, 0.93], [0.06, 0.95], [0, 0.95]], 24).scale(1, 1, 0.6);
  const hips = new THREE.SphereGeometry(0.14, 16, 8).scale(1, 0.6, 0.65).translate(0, 0.5, 0);
  const head = new THREE.SphereGeometry(0.075, 16, 12).scale(0.92, 1.2, 1).translate(0, 1.06, 0);
  const neck = new THREE.CylinderGeometry(0.035, 0.04, 0.08, 10, 1, true).translate(0, 0.97, 0);
  const limb = (radius: number, length: number, x: number, y: number, tilt: number) => new THREE.CapsuleGeometry(radius, length, 3, 10).rotateZ(tilt).translate(x, y, 0);
  const gantry = new THREE.TorusGeometry(0.33, 0.012, 6, 48).rotateX(Math.PI / 2).translate(0, 1.22, 0);
  const rods = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    return new THREE.CylinderGeometry(0.008, 0.008, 1.16, 6).translate(sin(a) * 0.33, 0.64, cos(a) * 0.33);
  });
  // the printer's head on its ring, still laying down the clone's last layer
  const nozzle = new THREE.ConeGeometry(0.035, 0.08, 10).rotateX(Math.PI).translate(0.33, 1.17, 0);
  return [
    part(bed, 1.2, 0.3),
    part(torso),
    part(hips),
    part(head),
    part(neck),
    part(limb(0.034, 0.36, -0.2, 0.68, -0.1)),
    part(limb(0.034, 0.36, 0.2, 0.68, 0.1)),
    part(limb(0.05, 0.36, -0.07, 0.27, 0.02)),
    part(limb(0.05, 0.36, 0.07, 0.27, -0.02)),
    part(gantry, 1.4, 0.4),
    ...rods.map((rod) => part(rod, 1, 0.2)),
    part(nozzle, 1.5, 0.5),
  ];
}

/** Oxygen+: a gas canister with its valve, hand wheel and gauge, a hose to the breathing mask. */
function oxygen(): THREE.BufferGeometry[] {
  const tank = lathe([[0, 0], [0.16, 0], [0.2, 0.04], [0.2, 0.74], ...dome(0.2, 0.74, 0.16).slice(1, -1), [0.05, 0.92], [0.05, 0.98], [0, 0.98]]);
  const valve = box(0.11, 0.09, 0.09, 0, 1.02, 0);
  const wheel = new THREE.TorusGeometry(0.075, 0.012, 6, 24).rotateX(Math.PI / 2).translate(0, 1.1, 0);
  const spokes = [box(0.15, 0.012, 0.012, 0, 1.1, 0), box(0.012, 0.012, 0.15, 0, 1.1, 0), new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8).translate(0, 1.08, 0)];
  const gauge = new THREE.CylinderGeometry(0.065, 0.065, 0.03, 20).rotateZ(Math.PI / 2).translate(0.07, 1.02, 0);
  const rim = new THREE.TorusGeometry(0.065, 0.008, 6, 20).rotateY(Math.PI / 2).translate(0.086, 1.02, 0);
  const needle = box(0.004, 0.05, 0.008, 0.088, 1.03, 0.008);
  const hose = new THREE.TubeGeometry(new THREE.CubicBezierCurve3(new THREE.Vector3(-0.055, 1.02, 0), new THREE.Vector3(-0.35, 1.05, 0), new THREE.Vector3(-0.42, 0.5, 0.1), new THREE.Vector3(-0.33, 0.36, 0.12)), 24, 0.018, 8);
  // the mask: a cup over mouth and nose, open towards the face
  const mask = lathe([[0.02, 0], [0.04, 0.02], [0.09, 0.08], [0.11, 0.14]], 20).translate(0, -0.02, 0).rotateZ(-Math.PI / 2 - 0.4).translate(-0.33, 0.36, 0.12);
  return [
    part(tank),
    part(band(0.205, 0.18, 0.23), 1.3, 0.3),
    part(band(0.205, 0.6, 0.65), 1.3, 0.3),
    part(valve, 1.1, 0.2),
    part(wheel, 1.4, 0.4),
    ...spokes.map((spoke) => part(spoke, 1.2, 0.2)),
    part(gauge, 1.1, 0.4),
    part(rim, 1.5, 0.5),
    part(needle, 1.6, 0.8),
    part(hose, 0.9),
    part(mask, 1.3, 0.3),
  ];
}

/**
 * Solar Wall Bonds: the bond itself, an engraved certificate between two scroll rods: its double
 * border with corner rosettes, the title, the lines of its promise, the sun of the United Solar
 * States in the middle, the gold seal with its ribbons, and along the bottom the coupons to tear
 * off for the interest Mars pays. Presented upright, facing the Host.
 */
function bond(): THREE.BufferGeometry[] {
  const [width, height] = [1, 0.7];
  const face = 0.012;
  const sheet = new THREE.PlaneGeometry(width, height);
  const back = new THREE.PlaneGeometry(width, height).rotateY(Math.PI);
  const rod = (y: number) => new THREE.CylinderGeometry(0.035, 0.035, width + 0.06, 12).rotateZ(Math.PI / 2).translate(0, y, -0.02);
  const knobs = [-1, 1].flatMap((side) => [-1, 1].map((end) => new THREE.SphereGeometry(0.05, 8, 5).translate(end * (width / 2 + 0.05), side * (height / 2 + 0.01), -0.02)));
  // the frame: a heavy outer border and a fine inner one, rosettes at the corners
  const frame = (inset: number, thickness: number) => {
    const [w, h] = [width - inset * 2, height - inset * 2];
    return [box(w, thickness, face, 0, h / 2), box(w, thickness, face, 0, -h / 2), box(thickness, h, face, -w / 2, 0), box(thickness, h, face, w / 2, 0)];
  };
  const rosettes = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => new THREE.TorusGeometry(0.025, 0.008, 6, 16).translate(sx * (width / 2 - 0.05), sy * (height / 2 - 0.05), face)));
  // the title and the lines of the promise, engraved across the upper half
  const title = box(0.5, 0.055, face * 1.5, 0, 0.23);
  const lines = [0.15, 0.115, 0.08].map((y, i) => box(0.62 - i * 0.12, 0.014, face, 0, y));
  // the sun of the United Solar States: a disc in a ring, its rays around it
  const sun = new THREE.CylinderGeometry(0.06, 0.06, face * 2, 24).rotateX(Math.PI / 2).translate(-0.24, -0.04, face);
  const halo = new THREE.TorusGeometry(0.085, 0.008, 6, 20).translate(-0.24, -0.04, face);
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return box(0.05, 0.012, face).translate(0.13, 0, 0).rotateZ(a).translate(-0.24, -0.04, face);
  });
  // the amount, written large as bars beside the sun
  const amount = [0.04, -0.005, -0.05].map((y, i) => box(i === 1 ? 0.3 : 0.22, i === 1 ? 0.04 : 0.016, face * 1.5, 0.12, y - 0.04));
  // the seal: a gold disc with a scalloped rim, two ribbon tails hanging from it
  const seal = new THREE.CylinderGeometry(0.075, 0.075, 0.02, 24).rotateX(Math.PI / 2).translate(0.36, -0.14, 0.02);
  const scallop = new THREE.TorusGeometry(0.075, 0.012, 6, 24).translate(0.36, -0.14, 0.02);
  const ribbons = [-1, 1].map((side) => box(0.035, 0.13, 0.008).translate(0, -0.06, 0).rotateZ(side * 0.3).translate(0.36 + side * 0.02, -0.17, 0.012));
  // the coupons along the bottom, each a framed slip, the perforation dotted above them
  const coupons = Array.from({ length: 6 }, (_, i) => {
    const x = -0.375 + i * 0.12;
    return [box(0.1, 0.006, face, x, -0.21), box(0.1, 0.006, face, x, -0.28), box(0.006, 0.07, face, x - 0.05, -0.245), box(0.006, 0.07, face, x + 0.05, -0.245), box(0.05, 0.012, face, x, -0.245)];
  }).flat();
  const perforation = Array.from({ length: 24 }, (_, i) => box(0.012, 0.006, face, -0.44 + i * 0.0383, -0.195));
  return [
    part(sheet, 0.6),
    part(back, 0.5),
    part(rod(height / 2 + 0.01), 1.2, 0.2),
    part(rod(-height / 2 - 0.01), 1.2, 0.2),
    ...knobs.map((knob) => part(knob, 1.4, 0.4)),
    ...frame(0.03, 0.016).map((bar) => part(bar, 1.5, 0.4)),
    ...frame(0.055, 0.006).map((bar) => part(bar, 1.2, 0.2)),
    ...rosettes.map((rosette) => part(rosette, 1.5, 0.4)),
    part(title, 1.7, 0.6),
    ...lines.map((line) => part(line, 1.1, 0.2)),
    part(sun, 1.8, 0.7),
    part(halo, 1.5, 0.5),
    ...rays.map((ray) => part(ray, 1.6, 0.5)),
    ...amount.map((bar) => part(bar, 1.5, 0.45)),
    part(seal, 1.8, 0.7),
    part(scallop, 1.6, 0.5),
    ...ribbons.map((ribbon) => part(ribbon, 1.4, 0.3)),
    ...coupons.map((line) => part(line, 1.2, 0.25)),
    ...perforation.map((dot) => part(dot, 1, 0.2)),
  ];
}

/** DreamLink: a sleeper's bust under the headset, its band over the head, the visor over the eyes, the crescent at the temple. */
function headset(): THREE.BufferGeometry[] {
  const band = new THREE.TorusGeometry(0.19, 0.018, 8, 32, Math.PI).translate(0, 0.66, 0);
  const pads = [-1, 1].map((side) => new THREE.CylinderGeometry(0.06, 0.06, 0.035, 20).rotateZ(Math.PI / 2).translate(side * 0.18, 0.64, 0));
  const visor = new THREE.CylinderGeometry(0.185, 0.185, 0.07, 24, 1, true, -Math.PI * 0.42, Math.PI * 0.84).translate(0, 0.66, 0);
  const moon = new THREE.Shape();
  moon.absarc(0, 0, 0.07, 0, Math.PI * 2, false);
  moon.holes.push(new THREE.Path().absarc(0.03, 0.02, 0.058, 0, Math.PI * 2, true));
  const crescent = extrude(moon, 0.012).rotateY(Math.PI / 2).translate(0.2, 0.64, 0);
  // the link: a cable from the headset's back down into the pillow
  const cable = new THREE.TubeGeometry(new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0.62, -0.17), new THREE.Vector3(0, 0.45, -0.4), new THREE.Vector3(0.25, 0.2, -0.35), new THREE.Vector3(0.3, 0.05, -0.2)), 20, 0.012, 6);
  return [...bust(), part(band, 1.4, 0.3), ...pads.map((pad) => part(pad, 1.3, 0.3)), part(visor, 1.6, 0.5), part(crescent, 1.7, 0.6), part(cable, 1.1, 0.2)];
}

/** A smooth line through points in the plane, `count` points along it. */
const smooth = (points: number[][], count: number) => new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(count);

/**
 * A band along a line in the plane, `width(t)` wide at the share `t` of the way along it, set
 * off `offset(t)` to its left (the line's normal turned a quarter counterclockwise).
 */
function ribbon(line: THREE.Vector2[], width: (t: number) => number, offset: (t: number) => number = () => 0): THREE.Shape {
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  line.forEach((p, i) => {
    const prev = line[Math.max(0, i - 1)];
    const next = line[Math.min(line.length - 1, i + 1)];
    const normal = new THREE.Vector2(prev.y - next.y, next.x - prev.x).normalize();
    const t = i / (line.length - 1);
    const middle = p.clone().addScaledVector(normal, offset(t));
    left.push(middle.clone().addScaledVector(normal, width(t) / 2));
    right.push(middle.clone().addScaledVector(normal, -width(t) / 2));
  });
  return new THREE.Shape([...left, ...right.reverse()]);
}

/** A band's width that tapers to a point at both ends, `most` at its middle. */
const tapered = (most: number) => (t: number) => most * Math.min(1, 4 * t * (1 - t) * 1.6);

/**
 * Orange Steaks: a thick ribeye as the butcher cuts it. A slab with a flat top and straight sides,
 * its outline a rounded, uneven oblong; on its top the big eye of lean meat, parted from the cap
 * on its left by a bright crescent of fat, a rim of fat along the cap's edge running down its
 * side, and threads of marbling through the meat. The fat glows white over the dim meat, so it
 * reads like the drawings on every butcher's wall. Lying flat, tilted towards the Host.
 */
function steak(): THREE.BufferGeometry[] {
  const [thickness, top] = [0.2, 0.2 + 0.02];
  const outline = smooth(
    [[-0.5, 0.06], [-0.44, 0.26], [-0.24, 0.34], [0.04, 0.3], [0.3, 0.33], [0.48, 0.22], [0.53, 0.0], [0.44, -0.2], [0.2, -0.29], [0.0, -0.26], [-0.22, -0.33], [-0.43, -0.22], [-0.5, 0.06]],
    72,
  );
  outline.pop();
  const meat = extrude(new THREE.Shape(outline), thickness, 0.02);
  // a flat patch of fat laid on the top, a hair proud of the meat
  const onTop = (shape: THREE.Shape) => extrude(shape, 0.008).translate(0, 0, top - 0.004);
  // the crescent of fat parting the cap from the eye, with its kernel where it bends
  const seam = onTop(ribbon(smooth([[-0.36, 0.3], [-0.16, 0.2], [-0.08, 0.03], [-0.14, -0.14], [-0.34, -0.27]], 24), tapered(0.07)));
  const kernel = onTop(rounded(0.09, 0.06, 0.03, new THREE.Shape(), -0.07, 0.04));
  // the rim of fat along the cap's edge: on the top, and down the side as a band standing proud of it
  // (the outline begins on the cap's side, so it is read from its far end round to keep the edge in one piece)
  const half = outline.length >> 1;
  const edge = [...outline.slice(half), ...outline.slice(0, half)].filter((p) => p.x < -0.16);
  const rimTop = onTop(ribbon(edge, tapered(0.07), () => 0.035));
  const rind = extrude(ribbon(edge, tapered(0.03), () => -0.008), thickness + 0.03).translate(0, 0, -0.005);
  // the marbling: a few veins of fat, laid by hand as a butcher's drawing shows them: one long
  // wave across the eye with a branch off it, shorter streaks of different lengths and bends
  // here and there, one in the cap; each thinning out at both ends
  const veins: [number, number[][]][] = [
    [0.014, [[0.04, 0.17], [0.14, 0.1], [0.27, 0.13], [0.41, 0.05]]],
    [0.01, [[0.15, 0.1], [0.19, 0.02], [0.27, -0.04]]],
    [0.012, [[0.01, -0.06], [0.08, -0.02], [0.15, -0.09]]],
    [0.011, [[0.24, -0.06], [0.31, -0.13], [0.4, -0.15]]],
    [0.008, [[0.33, 0.0], [0.38, 0.06]]],
    [0.01, [[-0.34, 0.04], [-0.3, 0.12], [-0.27, 0.15]]],
  ];
  const marbling = veins.map(([width, points]) => onTop(ribbon(smooth(points, 14), tapered(width))));
  const all = [
    part(meat, 0.6),
    part(seam, 1.25, 0.6),
    part(kernel, 1.25, 0.6),
    part(rimTop, 1.1, 0.55),
    part(rind, 0.55, 0.35),
    ...marbling.map((thread) => part(thread, 1.2, 0.5)),
  ];
  // lying flat, its top tilted towards the Host as on a menu's photo
  for (const geometry of all) geometry.rotateX(-1.0);
  return all;
}

/** CarrierCare: a first aid case with its handle, latches, lid seam and the cross on its front. */
function medkit(): THREE.BufferGeometry[] {
  const caseGeometry = extrude(rounded(1, 0.66, 0.1, new THREE.Shape()), 0.32, 0.04).translate(0, 0, -0.16);
  const lid = box(1.07, 0.03, 0.42, 0, 0.12, 0);
  const handle = new THREE.TorusGeometry(0.14, 0.03, 8, 20, Math.PI).translate(0, 0.37, 0);
  const latches = [-0.3, 0.3].map((x) => box(0.08, 0.1, 0.03, x, 0.14, 0.215));
  const plus = new THREE.Shape();
  const [arm, length] = [0.07, 0.2];
  for (const [x, y] of [[-arm, length], [arm, length], [arm, arm], [length, arm], [length, -arm], [arm, -arm], [arm, -length], [-arm, -length], [-arm, -arm], [-length, -arm], [-length, arm], [-arm, arm]]) {
    if (x === -arm && y === length) plus.moveTo(x, y);
    else plus.lineTo(x, y);
  }
  const cross = extrude(plus, 0.03, 0.01).translate(0, -0.08, 0.2);
  return [part(caseGeometry, 0.9), part(lid, 1.2, 0.2), part(handle, 1.3, 0.3), ...latches.map((latch) => part(latch, 1.3, 0.4)), part(cross, 1.7, 0.6)];
}

const BUILDERS: Record<Product, () => THREE.BufferGeometry[]> = { can, burger, bottle, clone, oxygen, bond, headset, steak, medkit };

/** Every product there is. */
export const PRODUCTS = Object.keys(BUILDERS) as Product[];

/** Merges parts into one geometry, centered and scaled so its largest side is one unit. */
export function fitted(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(1 / Math.max(size.x, size.y, size.z), 1 / Math.max(size.x, size.y, size.z), 1 / Math.max(size.x, size.y, size.z));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A product's model, built anew (its caller disposes it). */
export const productModel = (product: Product) => fitted(BUILDERS[product]());

/** How far (rad) a flat product swings to and fro instead of turning, so its face stays towards the Host; 0 turns all the way. */
export const productSwing = (product: Product) => (product === 'steak' || product === 'bond' ? 0.75 : 0);
