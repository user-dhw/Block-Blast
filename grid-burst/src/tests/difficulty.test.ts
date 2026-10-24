import { describe, expect, it } from 'vitest';
import { generatePieceTray } from '../game/generator';
import { createEmptyBoard } from '../game/placement';
import { createRng, seedToState } from '../game/random';
import type { SeededRng } from '../game/random';
import { SHAPES } from '../game/shapes';
import type { Difficulty } from '../game/types';

// Historical selection rules before the small difficulty reduction. Keeping
// this baseline lets the test check the size distribution rather than a seed
// snapshot or the exact order of the shape catalog.
function legacySampleSize(rng: SeededRng, difficulty: Difficulty): number {
  const weights = SHAPES.map((shape) => {
    const size = shape.cells.length;
    const factor = difficulty === 'casual' ? (size <= 3 ? 1.8 : size >= 5 ? 0.5 : 1)
      : difficulty === 'hard' ? (size <= 2 ? 0.55 : size >= 5 ? 1.8 : 1) : 1;
    return shape.weight * factor;
  });
  let selection = rng.next() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < weights.length; index += 1) {
    selection -= weights[index];
    if (selection < 0) return SHAPES[index].cells.length;
  }
  return SHAPES[SHAPES.length - 1].cells.length;
}

function summarize(sizes: number[]) {
  return {
    mean: sizes.reduce((sum, size) => sum + size, 0) / sizes.length,
    small: sizes.filter((size) => size <= 3).length / sizes.length,
    large: sizes.filter((size) => size >= 5).length / sizes.length,
  };
}

describe('slightly easier piece distribution', () => {
  it('offers more small pieces and fewer large pieces while retaining difficulty levels', () => {
    const means: number[] = [];
    for (const difficulty of ['casual', 'normal', 'hard'] satisfies Difficulty[]) {
      const currentSizes: number[] = [];
      const legacySizes: number[] = [];
      for (let seed = 0; seed < 16; seed += 1) {
        const state = seedToState(`difficulty-distribution-${seed}`);
        const currentRng = createRng(state);
        const legacyRng = createRng(state);
        // Empty boards admit every candidate tray, so solver retries do not
        // bias this measurement of the production generation path.
        for (let tray = 0; tray < 64; tray += 1) {
          currentSizes.push(...generatePieceTray(createEmptyBoard(), currentRng, difficulty)
            .map((piece) => piece.cells.length));
          legacySizes.push(...Array.from({ length: 3 }, () => legacySampleSize(legacyRng, difficulty)));
        }
      }
      const current = summarize(currentSizes);
      const legacy = summarize(legacySizes);
      expect(current.small).toBeGreaterThan(legacy.small + 0.02);
      expect(current.large).toBeLessThan(legacy.large - 0.01);
      expect(current.mean).toBeLessThan(legacy.mean - 0.04);
      // This is a gentle tuning change, not a replacement with only easy pieces.
      expect(current.mean).toBeGreaterThan(legacy.mean - 0.3);
      expect(current.large).toBeGreaterThan(0.05);
      means.push(current.mean);
    }
    expect(means[0]).toBeLessThan(means[1]);
    expect(means[1]).toBeLessThan(means[2]);
  });
});
