import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ARENAS } from './arenas';
import { MAX_NEBULAE, CLOUD_SHAPES } from './nebula';
import { GradedOutputPass, gradeColor } from '../view/grade';

/** The HUD's colors the world must never swallow (see CLAUDE.md, Colors): the action orange, the azure glow and its readable text. */
const ORANGE = 0xff9d00;
const AZURE = [0x0062ff, 0x4d91ff];

const hsl = (hex: number, arena?: (typeof ARENAS)[number]) => {
  const color = new THREE.Color(hex);
  // graded, and clamped as the screen clamps it; seen as the screen shows it
  if (arena) gradeColor(arena.mood.grade, color);
  color.setRGB(THREE.MathUtils.clamp(color.r, 0, 1), THREE.MathUtils.clamp(color.g, 0, 1), THREE.MathUtils.clamp(color.b, 0, 1));
  return color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
};

/** The angle between two hues (0..1 around the circle), in degrees. */
const hueGap = (a: number, b: number) => {
  const gap = Math.abs(a - b) % 1;
  return Math.min(gap, 1 - gap) * 360;
};

describe('arena moods', () => {
  it('every arena has a mood of its own', () => {
    const grades = new Set(ARENAS.map((arena) => JSON.stringify(arena.mood.grade)));
    const skies = new Set(ARENAS.map((arena) => arena.mood.sky));
    expect(grades.size).toBe(ARENAS.length);
    expect(skies.size).toBe(ARENAS.length);
  });

  it('keeps its nebulae few and its clouds known', () => {
    for (const arena of ARENAS) {
      expect(arena.mood.nebulae.length).toBeLessThanOrEqual(MAX_NEBULAE);
      for (const nebula of arena.mood.nebulae) expect(nebula.shape).toBeLessThan(CLOUD_SHAPES);
    }
  });

  it("leaves the HUD's orange and azure their hue and four fifths of their color at least", () => {
    for (const arena of ARENAS) {
      for (const hex of [ORANGE, ...AZURE]) {
        const before = hsl(hex);
        const after = hsl(hex, arena);
        expect(hueGap(before.h, after.h), `${arena.id} ${hex.toString(16)}`).toBeLessThan(8);
        expect(after.s, `${arena.id} ${hex.toString(16)}`).toBeGreaterThan(before.s * 0.8);
      }
      // and the two stay far apart
      expect(hueGap(hsl(ORANGE, arena).h, hsl(AZURE[0], arena).h)).toBeGreaterThan(150);
    }
  });

  it('grades in the output pass itself', () => {
    const pass = new GradedOutputPass();
    expect(pass.material.fragmentShader).toContain('gradeSaturation');
    pass.set(ARENAS[0].mood.grade);
    expect(pass.uniforms.gradeGain.value.toArray()).toEqual([...ARENAS[0].mood.grade.gain]);
  });
});
