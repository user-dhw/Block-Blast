export const SCORING = { cell: 1, line: 100, extraLine: 50, comboStep: 0.25, maxMultiplier: 3 } as const;

export function getComboMultiplier(combo: number): number {
  return Math.min(SCORING.maxMultiplier, 1 + Math.max(0, combo - 1) * SCORING.comboStep);
}

/** Placement stays unmultiplied. Round the complete line bonus once to an integer. */
export function calculateScore(cellCount: number, lineCount: number, previousCombo: number): {
  points: number;
  combo: number;
  multiplier: number;
} {
  const combo = lineCount > 0 ? previousCombo + 1 : 0;
  const multiplier = getComboMultiplier(combo);
  const lineBonus = lineCount * SCORING.line + Math.max(0, lineCount - 1) * SCORING.extraLine;
  return { points: cellCount * SCORING.cell + Math.round(lineBonus * multiplier), combo, multiplier };
}
