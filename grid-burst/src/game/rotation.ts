import { normalizeCells } from './shapes';
import type { CellOffset } from './types';

/** Clockwise in board coordinates (y grows down); invalid numeric inputs return no cells. */
export function rotateShapeCells(cells: readonly CellOffset[], quarterTurns: number): CellOffset[] {
  if (!Number.isInteger(quarterTurns) || cells.some(({ x, y }) => !Number.isInteger(x) || !Number.isInteger(y))) return [];
  const turns = ((quarterTurns % 4) + 4) % 4;
  let rotated = normalizeCells(cells);
  for (let turn = 0; turn < turns; turn += 1) {
    rotated = normalizeCells(rotated.map(({ x, y }) => ({ x: -y, y: x })));
  }
  return rotated;
}
