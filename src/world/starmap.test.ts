import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { celestial, cubeDirection, cubeTexel, ecliptic, fromGalactic, galactic, raDec } from './celestial';
import { blackBodyColor, decodeStars, magnitudeFlux, spectralBV, starBrightnessCode, starColor, starFlux } from './starfile';
import { bakeMilkyWay, faintStars, milkyWayLight } from './milkyway';
import { skyTurn, Starmap } from './starmap';
import { SUN_DIRECTION } from './space';
import { ARENAS } from './arenas';

const DEG = Math.PI / 180;
const angle = (a: THREE.Vector3, b: THREE.Vector3) => a.angleTo(b) / DEG;

/** The shipped stars (public/assets/sky/stars.bin, packed by tools/sky from the Yale Bright Star Catalogue). */
const file = readFileSync(join(import.meta.dirname, '../../public/assets/sky/stars.bin'));
const stars = decodeStars(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const starAt = (i: number) => new THREE.Vector3().fromArray(stars.directions, i * 3);

/** The shipped star nearest a place of the real sky (right ascension, declination in degrees), with how far it lies from it (degrees). */
function nearest(ra: number, dec: number) {
  const target = celestial(ra, dec);
  let best = 0;
  for (let i = 1; i < stars.count; i++) if (starAt(i).dot(target) > starAt(best).dot(target)) best = i;
  return { index: best, off: angle(starAt(best), target), color: stars.colors.slice(best * 3, best * 3 + 3), flux: stars.fluxes[best] };
}

/** The Milky Way's light (green, linear) in a direction. */
const light = (direction: THREE.Vector3) => {
  const rgb = new Float32Array(3);
  milkyWayLight(direction, rgb);
  return rgb[1];
};

describe('the cube map of the real sky', () => {
  it('is read the way OpenGL specifies a cube map: the major axis picks the face, the others the texel', () => {
    // the table of OpenGL ES 3.0, 3.8.10: +x reads s from -z and t from -y, +y from x and z, +z from x and -y
    expect(cubeTexel(new THREE.Vector3(1, 0, 0))).toEqual({ face: 0, s: 0.5, t: 0.5 });
    expect(cubeTexel(new THREE.Vector3(1, 0.5, -0.5))).toMatchObject({ face: 0, s: 0.75, t: 0.25 });
    expect(cubeTexel(new THREE.Vector3(-1, 0.5, -0.5))).toMatchObject({ face: 1, s: 0.25, t: 0.25 });
    expect(cubeTexel(new THREE.Vector3(0.5, 1, 0.5))).toMatchObject({ face: 2, s: 0.75, t: 0.75 });
    expect(cubeTexel(new THREE.Vector3(0.5, -1, 0.5))).toMatchObject({ face: 3, s: 0.75, t: 0.25 });
    expect(cubeTexel(new THREE.Vector3(0.5, 0.5, 1))).toMatchObject({ face: 4, s: 0.75, t: 0.25 });
    expect(cubeTexel(new THREE.Vector3(0.5, 0.5, -1))).toMatchObject({ face: 5, s: 0.25, t: 0.25 });
  });

  it('is baked at the very direction the GPU reads each texel from', () => {
    // the bake fills a texel from cubeDirection; the GPU, sampling that direction, lands on that texel
    const direction = new THREE.Vector3();
    for (let n = 0; n < 2000; n++) {
      direction.set(Math.sin(n * 12.9898) * 2 - 1, Math.sin(n * 78.233) * 2 - 1, Math.sin(n * 37.719) * 2 - 1).normalize();
      const { face, s, t } = cubeTexel(direction);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      expect(angle(cubeDirection(face, s, t).normalize(), direction)).toBeLessThan(1e-4);
    }
    const { ra, dec } = raDec(celestial(123.4, -56.7));
    expect(ra).toBeCloseTo(123.4, 9);
    expect(dec).toBeCloseTo(-56.7, 9);
  });

  it('holds the Milky Way where the GPU reads it: the galactic center bright, the poles and the anticenter dim, the Large Magellanic Cloud aglow', () => {
    const size = 64;
    const faces = bakeMilkyWay(size);
    // the texel (green, an sRGB byte) the GPU reads for a direction, as cubeTexel says
    const read = (direction: THREE.Vector3) => {
      const { face, s, t } = cubeTexel(direction);
      const i = Math.min(size - 1, Math.floor(s * size));
      const j = Math.min(size - 1, Math.floor(t * size));
      return faces[face][(j * size + i) * 4 + 1];
    };
    const bulge = read(fromGalactic(0, -6));
    expect(bulge).toBeGreaterThan(150);
    expect(read(fromGalactic(0, 90))).toBe(0);
    expect(read(fromGalactic(0, -90))).toBe(0);
    expect(read(fromGalactic(180, 0))).toBeLessThan(bulge * 0.6);
    expect(read(celestial(80.9, -69.8))).toBeGreaterThan(40);
    expect(read(celestial(150, 50))).toBe(0);
  });

  it('keeps a star\'s brightness within 3 % through its byte', () => {
    for (const flux of [0.2, 0.5, 3, 59]) expect(Math.abs(starFlux(starBrightnessCode(flux)) / flux - 1)).toBeLessThan(0.03);
  });
});

describe('the stars of the real sky', () => {
  it('are every star of the Yale Bright Star Catalogue, small to ship', () => {
    expect(stars.count).toBe(9096);
    expect(file.byteLength).toBeLessThan(80_000);
  });

  it('puts the brightest stars where they stand, in order of their magnitudes', () => {
    // Sirius, then Canopus; Alpha Centauri, Arcturus, Vega, Capella and Rigel among the first eight
    expect(nearest(101.287, -16.716)).toMatchObject({ index: 0 });
    expect(nearest(95.988, -52.696)).toMatchObject({ index: 1 });
    for (const [ra, dec] of [[219.9, -60.834], [213.915, 19.182], [279.235, 38.784], [79.172, 45.998], [78.634, -8.202]]) {
      const star = nearest(ra, dec);
      expect(star.off).toBeLessThan(0.02);
      expect(star.index).toBeLessThan(8);
    }
  });

  it('draws Orion as on the real sky: Betelgeuse red, Rigel blue-white, the belt, the sword; Polaris by the pole', () => {
    const betelgeuse = nearest(88.793, 7.407);
    const rigel = nearest(78.634, -8.202);
    const belt = [nearest(83.002, -0.299), nearest(84.053, -1.202), nearest(85.19, -1.943)];
    for (const star of [betelgeuse, rigel, ...belt, nearest(81.283, 6.35), nearest(86.939, -9.67), nearest(37.955, 89.264)]) {
      expect(star.off).toBeLessThan(0.02);
      expect(star.index).toBeLessThan(120);
    }
    expect(betelgeuse.color[0]).toBeGreaterThan(betelgeuse.color[2] * 1.6);
    expect(rigel.color[2]).toBeGreaterThan(rigel.color[0] * 1.2);
    // brighter stars are drawn brighter: Sirius over Betelgeuse over Mintaka over Alcor
    expect(nearest(101.287, -16.716).flux).toBeGreaterThan(betelgeuse.flux);
    expect(betelgeuse.flux).toBeGreaterThan(belt[0].flux);
    expect(belt[0].flux).toBeGreaterThan(nearest(201.306, 54.988).flux);
  });

  it('lists the brightest first', () => {
    for (let i = 1; i < stars.count; i++) expect(stars.fluxes[i]).toBeLessThanOrEqual(stars.fluxes[i - 1]);
  });

  it('colors a star as a black body of its temperature, as pale as the eye sees it', () => {
    // a black body of 6 500 K is sRGB's white
    for (const c of blackBodyColor(6500)) expect(c).toBeGreaterThan(0.9);
    const [r, , b] = starColor(1.85);
    expect(r).toBe(1);
    expect(b).toBeGreaterThan(0.3);
    expect(b).toBeLessThan(0.55);
    expect(starColor(-0.03)[2]).toBe(1);
    expect(spectralBV('M1-2Ia-Iab')).toBe(1.6);
    expect(spectralBV('B8Ia:')).toBe(-0.15);
    expect(spectralBV('')).toBe(0.65);
  });

  it('adds faint stars only below the catalogue\'s limit, the more of them the nearer the Milky Way, alike on every call', () => {
    const faint = faintStars();
    expect(Math.max(...faint.fluxes)).toBeLessThanOrEqual(magnitudeFlux(6.8) * 1.0001);
    expect(faintStars().directions).toEqual(faint.directions);
    let inBand = 0;
    const direction = new THREE.Vector3();
    for (let i = 0; i < faint.count; i++) if (Math.abs(galactic(direction.fromArray(faint.directions, i * 3)).b) < 15) inBand++;
    // a uniform sky would hold sin 15° (26 %) of them within 15° of the plane
    expect(inBand / faint.count).toBeGreaterThan(0.5);
  });
});

describe('the Milky Way', () => {
  it('lies along the galactic plane where the galactic pole and center say', () => {
    // the frame: its center and pole, longitude 90° in Cygnus, and Sirius where the catalogue puts it (227.23°, -8.89°)
    expect(galactic(celestial(266.40499, -28.93617)).l).toBeCloseTo(0, 3);
    expect(galactic(celestial(266.40499, -28.93617)).b).toBeCloseTo(0, 3);
    expect(galactic(celestial(192.85948, 27.12825)).b).toBeCloseTo(90, 3);
    expect(angle(fromGalactic(90, 0), celestial(318.004, 48.33))).toBeLessThan(0.01);
    const sirius = galactic(celestial(101.2871, -16.7161));
    expect(sirius.l).toBeCloseTo(227.23, 1);
    expect(sirius.b).toBeCloseTo(-8.89, 1);
    expect(angle(fromGalactic(sirius.l, sirius.b), celestial(101.2871, -16.7161))).toBeLessThan(1e-4);
    // its light, summed across the band at every longitude, centers on the plane
    let sum = 0;
    let moment = 0;
    for (let l = 0; l < 360; l += 2) {
      for (let b = -40; b <= 40; b += 0.5) {
        const value = light(fromGalactic(l, b)) * Math.cos(b * DEG);
        sum += value;
        moment += value * b;
      }
    }
    expect(Math.abs(moment / sum)).toBeLessThan(1.5);
    // nothing of it far from the plane but the Magellanic Clouds
    for (let l = 0; l < 360; l += 15) expect(light(fromGalactic(l, 45))).toBe(0);
  });

  it('shines brightest and widest towards the center in Sagittarius, faintest towards the anticenter', () => {
    // the brightest place of the band lies within 8° of the center
    let best = { l: 0, b: 0, value: 0 };
    for (let l = 0; l < 360; l += 1) {
      for (let b = -15; b <= 15; b += 1) {
        const value = light(fromGalactic(l, b));
        if (value > best.value) best = { l, b, value };
      }
    }
    expect(angle(fromGalactic(best.l, best.b), fromGalactic(0, 0))).toBeLessThan(8);
    // the band's light across it, summed, towards the center, Cygnus, the anticenter
    const across = (l: number) => {
      let sum = 0;
      for (let b = -30; b <= 30; b += 0.25) sum += light(fromGalactic(l, b));
      return sum;
    };
    expect(across(5)).toBeGreaterThan(3 * across(180));
    expect(across(75)).toBeGreaterThan(across(180));
  });

  it('is torn by the Great Rift north of the plane from Aquila to Cygnus, and darkened by the Coalsack', () => {
    // along the rift's stretch, the light at the rift's latitude falls short of the light as far south of the plane
    let rift = 0;
    let south = 0;
    for (let l = 25; l <= 70; l += 0.5) {
      rift += light(fromGalactic(l, 2.5));
      south += light(fromGalactic(l, -3.5));
    }
    expect(rift).toBeLessThan(0.8 * south);
    let coalsack = 0;
    let beside = 0;
    for (let b = -2; b <= 0; b += 0.5) {
      coalsack += light(fromGalactic(301, b));
      beside += light(fromGalactic(309, b));
    }
    expect(coalsack).toBeLessThan(beside);
  });
});

describe('the orientation of the real sky', () => {
  const turn = skyTurn(SUN_DIRECTION);

  it('is a turn, never a mirror: the constellations read as from Earth', () => {
    expect(turn.determinant()).toBeCloseTo(1, 9);
  });

  it('stands Saturn\'s pole straight up and the sun on the ecliptic where the arenas see it', () => {
    expect(angle(celestial(40.589, 83.537).applyMatrix4(turn), new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
    expect(angle(ecliptic(151.69).applyMatrix4(turn), SUN_DIRECTION)).toBeLessThan(0.02);
  });

  it('turns the stars and the Milky Way alike', () => {
    const starmap = new Starmap(stars, new THREE.CubeTexture(), turn, 1000);
    const [sphere, points] = starmap.group.children as [THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>, THREE.Points];
    const toCelestial = sphere.material.uniforms.toCelestial.value as THREE.Matrix3;
    // a star drawn in the world, read back from the Milky Way's cube map at its world direction
    for (const i of [0, 7, 99]) {
      const world = starAt(i).applyQuaternion(points.quaternion);
      expect(angle(world.clone().applyMatrix3(toCelestial), starAt(i))).toBeLessThan(1e-4);
    }
  });

  it('shows in every arena of the solar system, and only there', () => {
    for (const arena of ARENAS) expect(arena.mood.starmap).toBe(arena.id !== 'hole');
  });
});
