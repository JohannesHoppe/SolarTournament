import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cos, sin } from '../detmath';
import { Randomizer } from '../random';

/**
 * The sponsors' products, modelled in code for their holograms (see view/hologram): a can of
 * Victory Cola with its pull tab, a stacked Space Burger, a T-bone of Orange Steaks with its
 * bone and fat rim, and so on, one for every sponsor of game/satire-ads. Each is a single
 * geometry of a few hundred to a few thousand triangles, centered and scaled so its largest
 * side is one unit long, with an attribute `tone` per vertex: how brightly a part glows and how
 * far towards white, so a burger's patty, cheese and bun read apart in one color.
 */
export type Product = 'can' | 'burger' | 'bottle' | 'clone' | 'oxygen' | 'wall' | 'headset' | 'steak' | 'medkit';

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

/** A Space Burger: bun, patty, cheese drooping over its corners, ruffled lettuce, tomato, a sesame-seeded top bun. */
function burger(): THREE.BufferGeometry[] {
  const bottom = lathe([[0, 0], [0.42, 0], [0.47, 0.04], [0.48, 0.11], [0.45, 0.16], [0, 0.16]]);
  const patty = lathe([[0, 0.16], [0.49, 0.16], [0.53, 0.19], [0.54, 0.24], [0.52, 0.29], [0.48, 0.31], [0, 0.31]]);
  // the cheese: a square slice turned half a corner, its corners hanging down over the patty
  const cheese = new THREE.PlaneGeometry(0.86, 0.86, 10, 10).rotateX(-Math.PI / 2).rotateY(Math.PI / 4);
  const p = cheese.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const out = Math.max(0, Math.sqrt(p.getX(i) * p.getX(i) + p.getZ(i) * p.getZ(i)) - 0.42);
    p.setY(i, 0.325 - out * out * 2.2);
  }
  cheese.computeVertexNormals();
  // the lettuce: a ring whose rim ruffles up and down
  const leaf: number[] = [];
  const leafAt = (i: number, j: number) => {
    const a = (i / 72) * Math.PI * 2;
    const r = 0.3 + j * 0.09;
    const y = 0.35 + j * j * 0.012 * sin(a * 11) - j * 0.012;
    return [sin(a) * r, y, cos(a) * r];
  };
  for (let i = 0; i < 72; i++) for (let j = 0; j < 3; j++) leaf.push(...leafAt(i, j), ...leafAt(i + 1, j), ...leafAt(i + 1, j + 1), ...leafAt(i, j), ...leafAt(i + 1, j + 1), ...leafAt(i, j + 1));
  const lettuce = new THREE.BufferGeometry();
  lettuce.setAttribute('position', new THREE.Float32BufferAttribute(leaf, 3));
  lettuce.computeVertexNormals();
  const tomato = (x: number, z: number) => new THREE.CylinderGeometry(0.2, 0.2, 0.045, 18).translate(x, 0.385, z);
  const top = lathe([[0, 0.4], [0.47, 0.4], [0.5, 0.43], ...dome(0.5, 0.44, 0.34, 6)]);
  const seeds: THREE.BufferGeometry[] = [];
  const random = new Randomizer(2584);
  for (let i = 0; i < 16; i++) {
    const a = 0.35 + random.nextFloat() * 0.9;
    const around = (i / 16) * Math.PI * 2 + random.nextFloat() * 0.3;
    const normal = new THREE.Vector3(cos(a) * sin(around), sin(a), cos(a) * cos(around));
    const point = new THREE.Vector3(0.5 * cos(a) * sin(around), 0.44 + 0.34 * sin(a), 0.5 * cos(a) * cos(around));
    seeds.push(part(laid(new THREE.SphereGeometry(1, 6, 4).scale(0.032, 0.018, 0.012), point, normal, random.nextFloat() * 3), 1.5, 0.6));
  }
  return [part(bottom), part(patty, 0.75), part(cheese, 1.3, 0.25), part(lettuce, 1.1, 0.1), part(tomato(-0.13, 0.08), 1), part(tomato(0.15, -0.06), 1), part(top), ...seeds];
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

/** Solar Wall Bonds: a stretch of the biggest wall in history, brick by brick, crenellated, its banner on a pole. */
function wall(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const [brick, course, depth, radius] = [0.24, 0.12, 0.2, 2.4];
  const random = new Randomizer(1984);
  const lay = (geometry: THREE.BufferGeometry, along: number, y: number, glow: number) => {
    // bricks follow a gentle arc, so the wall goes round something
    const a = along / radius;
    parts.push(part(geometry.translate(0, y, 0).rotateY(-a).translate(sin(a) * radius, 0, radius - cos(a) * radius), glow, 0.05));
  };
  const rows = 7;
  for (let row = 0; row < rows; row++) {
    const shift = row % 2 ? brick / 2 : 0;
    for (let i = -2; i <= 3; i++) {
      const along = i * brick + shift - brick / 4;
      if (Math.abs(along) > brick * 2.3) continue;
      lay(new THREE.BoxGeometry(brick - 0.014, course - 0.014, depth), along, row * course + course / 2, 0.8 + random.nextFloat() * 0.4);
    }
  }
  // the battlements: every other brick on top
  for (let i = -2; i <= 2; i += 2) lay(new THREE.BoxGeometry(brick - 0.014, course - 0.014, depth), i * brick, rows * course + course / 2, 1.1);
  const top = (rows + 1) * course;
  const pole = new THREE.CylinderGeometry(0.008, 0.008, 0.4, 6).translate(0, top + 0.2, 0);
  const banner = new THREE.PlaneGeometry(0.26, 0.15, 6, 1);
  const b = banner.attributes.position;
  for (let i = 0; i < b.count; i++) b.setZ(i, 0.02 * sin((b.getX(i) + 0.13) * 16));
  banner.computeVertexNormals();
  banner.translate(0.13, top + 0.32, 0);
  return [...parts, part(pole, 1.2, 0.3), part(banner, 1.5, 0.4)];
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

/**
 * Orange Steaks: a T-bone, its bone a T between the strip and the tenderloin, a rim of fat
 * along its back, the grill's marks across it. Presented tilted towards the Host.
 */
function steak(): THREE.BufferGeometry[] {
  // the outline, smooth through these points: the big strip loin on the left, the bone's bar
  // along the top, the smaller, rounder tenderloin on the right, set a little lower
  const outline = new THREE.SplineCurve(
    [[-0.04, 0.44], [-0.3, 0.47], [-0.53, 0.38], [-0.66, 0.16], [-0.64, -0.1], [-0.5, -0.32], [-0.26, -0.43], [-0.04, -0.4], [0.12, -0.42], [0.32, -0.35], [0.46, -0.18], [0.5, 0.04], [0.42, 0.22], [0.24, 0.32], [0.08, 0.36], [-0.04, 0.44]].map(([x, y]) => new THREE.Vector2(x, y)),
  ).getSpacedPoints(64);
  outline.pop();
  const meat = extrude(new THREE.Shape(outline), 0.14, 0.03);
  // the fat: a cap along the strip's outer edge, a little proud of the meat
  const cap = outline.filter((p) => p.x < -0.12 && p.y > -0.36);
  const normal = (i: number) => {
    const prev = cap[Math.max(0, i - 1)];
    const next = cap[Math.min(cap.length - 1, i + 1)];
    return new THREE.Vector2(next.y - prev.y, prev.x - next.x).normalize();
  };
  // the outline runs counterclockwise, so the normal above points out of the meat
  const fat = new THREE.Shape([...cap.map((p, i) => p.clone().addScaledVector(normal(i), 0.05)), ...cap.map((p, i) => p.clone().addScaledVector(normal(i), -0.035)).reverse()]);
  const rind = extrude(fat, 0.15, 0.025);
  // the bone: the T, its bar along the top edge, its stem down between strip and tenderloin
  const bone = new THREE.Shape([[-0.3, 0.47], [0.12, 0.43], [0.12, 0.38], [0.0, 0.37], [-0.01, -0.3], [-0.05, -0.34], [-0.07, 0.37], [-0.3, 0.42]].map(([x, y]) => new THREE.Vector2(x, y)));
  const boneGeometry = extrude(bone, 0.16, 0.015).translate(0, 0, -0.01);
  // the grill's marks: diagonal bars burnt across the face, each as long as the meat under it
  const inside = (x: number, y: number) => {
    let within = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const [a, b] = [outline[i], outline[j]];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) within = !within;
    }
    return within;
  };
  const marks: THREE.BufferGeometry[] = [];
  const [dx, dy] = [cos(0.6), sin(0.6)];
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    // where the bar's line runs over the meat, kept clear of the edge
    const across = i * 0.17;
    let [low, high] = [Infinity, -Infinity];
    for (let s = -0.8; s <= 0.8; s += 0.01) {
      const [x, y] = [s * dx - across * dy, s * dy + across * dx];
      if (inside(x, y) && Math.abs(x + 0.03) > 0.1) [low, high] = [Math.min(low, s), Math.max(high, s)];
    }
    if (high - low < 0.2) continue;
    const middle = (low + high) / 2;
    const length = (high - low) * 0.8;
    marks.push(box(length, 0.026, 0.012).rotateZ(0.6).translate(middle * dx - across * dy, middle * dy + across * dx, 0.175));
  }
  const all = [part(meat, 0.85), part(rind, 1.35, 0.5), part(boneGeometry, 1.5, 0.75), ...marks.map((mark) => part(mark, 1.25, 0.1))];
  // standing, tilted back a little, its face towards the Host as on a menu's photo
  for (const geometry of all) geometry.rotateX(-0.35);
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

const BUILDERS: Record<Product, () => THREE.BufferGeometry[]> = { can, burger, bottle, clone, oxygen, wall, headset, steak, medkit };

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
export const productSwing = (product: Product) => (product === 'steak' ? 0.75 : 0);
