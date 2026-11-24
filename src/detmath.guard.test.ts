import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The code computes every mathematical function beyond + - * / and Math.sqrt with src/detmath.ts,
 * never with Math's own, which differ in the last bits between processors and systems; and the
 * shared world (src/world, src/game, src/net, src/ship) and the simulated pilots that fly it in the
 * unit tests (src/test, so their flights come out alike on every machine CI runs them on) turn and blends with src/detthree.ts,
 * never with three.js's helpers that call Math's. This scans the TypeScript of the game, its tools
 * and its server function, and their unit tests. Not the browser tests (`e2e/`): what they compute
 * runs in the page, passed in as source text, and cannot import a module.
 */
const ROOT = join(__dirname, '..');
const SCANNED = ['src', 'tools', 'functions'];
const SHARED = ['src/world/', 'src/game/', 'src/net/', 'src/ship/', 'src/test/'];
/** This file, whose examples break its own rules. */
const SELF = 'src/detmath.guard.test.ts';

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (statSync(full).isFile()) return path.endsWith('.ts') && path !== SELF ? [path] : [];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

/** The code without its comments (a `//` after a colon, as in a URL, stays). */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/.*$/gm, '$1');
/** The code without its strings either, for the power operator (a glob's `**` is no power). */
const bare = (text: string) => code(text).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (s) => s.replace(/[^\n]/g, ' '));

/** Math's functions that are not exact operations. */
const MATH = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log1p|log2|log10|pow|sinh|cosh|tanh|asinh|acosh|atanh|cbrt|hypot)\b/;
/** The power operator, which is Math.pow. */
const POWER = /\*\*/;
/** three.js's helpers that call Math's trigonometry or powers. */
const THREE_TRIG =
  /\.(setFromAxisAngle|setFromEuler|makeRotationX|makeRotationY|makeRotationZ|makeRotationAxis|makeRotationFromEuler|applyAxisAngle|applyEuler|setFromSpherical|setFromSphericalCoords|setFromCylindrical|setFromCylindricalCoords|angleTo|rotateTowards|slerp|slerpQuaternions|rotateX|rotateY|rotateZ|rotateOnAxis|rotateOnWorldAxis)\(|\bTHREE\.(Euler|Spherical|Cylindrical|CatmullRomCurve3)\b|MathUtils\.damp\b|\.rotation\.(set\(|[xyz]\s*[-+*/]?=(?!=))/;
/**
 * three.js's own that the logic reads where it is used besides the looks, held to the folders
 * where no looks use it: `mergeVertices` (a rock's collision shape is welded with it; mergeVertices
 * of src/detthree.ts instead), a random direction (a spawn point, a bot's aim and wandering, the
 * jobs' simulated flights, whose Math.random is seeded; randomDirection of src/detthree.ts) and a
 * perspective camera's projection (the simulated Host's screen; updateProjection of src/detthree.ts).
 */
const THREE_LOGIC: [RegExp, string[]][] = [
  [/\bmergeVertices\b[^;]*from 'three\/addons|\bGeometryUtils\.mergeVertices\b/, ['src/world/', 'src/game/', 'src/net/', 'src/ship/', 'src/test/']],
  [/\.randomDirection\(/, ['src/ship/', 'src/net/', 'src/test/', 'src/campaign/']],
  [/(?<!updateProjection\()new THREE\.PerspectiveCamera\(|\.updateProjectionMatrix\(/, ['src/test/']],
];

describe('the deterministic mathematics', () => {
  const scanned = SCANNED.flatMap(files);
  const found = (pattern: RegExp, strip: (text: string) => string, only: (path: string) => boolean = () => true) =>
    scanned
      .filter(only)
      .flatMap((path) => strip(readFileSync(join(ROOT, path), 'utf8')).split('\n').map((line, i) => ({ path, line, i })))
      .filter(({ line }) => pattern.test(line))
      .map(({ path, line, i }) => `${relative('.', path)}:${i + 1}: ${line.trim()}`);

  it('scans the game, its tools and tests', () => {
    expect(scanned).toContain('src/game/game.ts');
    expect(scanned).toContain('src/world/asteroids.test.ts');
    expect(scanned).toContain('tools/sky/stars.ts');
    expect(scanned.length).toBeGreaterThan(200);
  });

  it("never calls Math's transcendental functions: they come from src/detmath.ts", () => {
    expect(found(MATH, code)).toEqual([]);
  });

  it('never uses the power operator: pow from src/detmath.ts, or a product', () => {
    expect(found(POWER, bare)).toEqual([]);
  });

  it("turns and blends the shared world with src/detthree.ts, never with three.js's own trigonometry", () => {
    expect(found(THREE_TRIG, code, (path) => SHARED.some((folder) => path.startsWith(folder)))).toEqual([]);
  });

  it("never lets three.js's own math compute what the logic reads where it cannot be told apart from the looks", () => {
    expect(THREE_LOGIC.flatMap(([pattern, folders]) => found(pattern, code, (path) => folders.some((folder) => path.startsWith(folder))))).toEqual([]);
    const caught = ["import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';", 'GeometryUtils.mergeVertices(g)', 'aim.randomDirection().multiplyScalar(2)', 'const c = new THREE.PerspectiveCamera(70, 1, 1, 10);', 'camera.updateProjectionMatrix();'];
    expect(caught.filter((line) => THREE_LOGIC.some(([pattern]) => pattern.test(code(line))))).toEqual(caught);
    const fine = ["import { mergeVertices } from '../detthree';", 'mergeVertices(g)', 'randomDirection(aim).multiplyScalar(2)', 'const c = updateProjection(new THREE.PerspectiveCamera(70, 1, 1, 10));', "import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';"];
    expect(fine.filter((line) => THREE_LOGIC.some(([pattern]) => pattern.test(code(line))))).toEqual([]);
  });

  it('finds what it looks for, and only that', () => {
    const lines = ['x = Math.sin(a);', 'y = values.map(Math.cos);', 'z = a ** 2;', 'q.setFromAxisAngle(axis, 1);', 'mesh.rotation.x = 1;', 'mesh.rotation.y += 1;', 'v.angleTo(w)', 'new THREE.Euler()'];
    expect(lines.filter((line) => MATH.test(bare(line)) || POWER.test(bare(line)) || THREE_TRIG.test(bare(line)))).toEqual(lines);
    const fine = ['x = sin(a); // Math.sin(a) differs', '/** a ** b */ y = pow(a, b);', "glob('**/*.ts')", 'mesh.rotation.x === 1', 'rotateX(geometry, 1)', 'Math.sqrt(x)', 'q.setFromRotationMatrix(m)'];
    expect(fine.filter((line) => MATH.test(code(line)) || POWER.test(bare(line)) || THREE_TRIG.test(code(line)))).toEqual([]);
  });
});
