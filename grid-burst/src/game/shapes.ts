import type { BlockColor, BlockShape, CellOffset } from './types';

export function normalizeCells(cells: readonly CellOffset[]): CellOffset[] {
  if (cells.length === 0) return [];
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return cells.map(({ x, y }) => ({ x: x - minX, y: y - minY }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Reject malformed, disconnected, duplicate, or oversized shape definitions. */
export function validateShape(shape: BlockShape | readonly CellOffset[], maxDimension = 5): boolean {
  const cells: readonly CellOffset[] = 'cells' in shape ? shape.cells : shape;
  if (cells.length === 0 || !Number.isInteger(maxDimension) || maxDimension < 1) return false;
  if (cells.some(({ x, y }) => !Number.isInteger(x) || !Number.isInteger(y))) return false;
  const normalized = normalizeCells(cells);
  if (normalized.some(({ x, y }) => x >= maxDimension || y >= maxDimension)) return false;
  const keys = new Set(normalized.map(({ x, y }) => `${x},${y}`));
  if (keys.size !== normalized.length) return false;
  const visited = new Set<string>();
  const pending = [normalized[0]];
  while (pending.length > 0) {
    const cell = pending.pop()!;
    const key = `${cell.x},${cell.y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const adjacent = { x: cell.x + dx, y: cell.y + dy };
      const adjacentKey = `${adjacent.x},${adjacent.y}`;
      if (keys.has(adjacentKey) && !visited.has(adjacentKey)) pending.push(adjacent);
    }
  }
  return visited.size === normalized.length;
}

function shape(id: string, pattern: string[], weight: number, color: BlockColor): BlockShape {
  const cells = pattern.flatMap((row, y) => [...row].flatMap((cell, x) => cell === '#' ? [{ x, y }] : []));
  const result = { id, cells: normalizeCells(cells), weight, color };
  if (!validateShape(result)) throw new Error(`Invalid shape definition: ${id}`);
  return result;
}

/** Orientations are explicit; pieces never rotate after entering the tray. */
export const SHAPES: readonly BlockShape[] = [
  shape('single', ['#'], 8, 'cyan'),
  shape('domino-h', ['##'], 8, 'blue'),
  shape('domino-v', ['#', '#'], 8, 'blue'),
  shape('line-3-h', ['###'], 7, 'orange'),
  shape('line-3-v', ['#', '#', '#'], 7, 'orange'),
  shape('line-4-h', ['####'], 5, 'green'),
  shape('line-4-v', ['#', '#', '#', '#'], 5, 'green'),
  shape('line-5-h', ['#####'], 2.5, 'red'),
  shape('line-5-v', ['#', '#', '#', '#', '#'], 2.5, 'red'),
  shape('square-2', ['##', '##'], 7, 'yellow'),
  shape('square-3', ['###', '###', '###'], 1.1, 'purple'),
  shape('rectangle-2x3', ['##', '##', '##'], 2.5, 'green'),
  shape('rectangle-3x2', ['###', '###'], 2.5, 'green'),
  shape('corner-3-ne', ['##', '.#'], 6, 'cyan'),
  shape('corner-3-nw', ['##', '#.'], 6, 'cyan'),
  shape('corner-3-se', ['.#', '##'], 6, 'cyan'),
  shape('corner-3-sw', ['#.', '##'], 6, 'cyan'),
  shape('l-4-n', ['#.', '#.', '##'], 4, 'orange'),
  shape('l-4-e', ['###', '#..'], 4, 'orange'),
  shape('l-4-s', ['##', '.#', '.#'], 4, 'orange'),
  shape('l-4-w', ['..#', '###'], 4, 'orange'),
  shape('j-4-n', ['.#', '.#', '##'], 4, 'blue'),
  shape('j-4-e', ['#..', '###'], 4, 'blue'),
  shape('j-4-s', ['##', '#.', '#.'], 4, 'blue'),
  shape('j-4-w', ['###', '..#'], 4, 'blue'),
  shape('t-4-n', ['###', '.#.'], 5, 'purple'),
  shape('t-4-e', ['#.', '##', '#.'], 5, 'purple'),
  shape('t-4-s', ['.#.', '###'], 5, 'purple'),
  shape('t-4-w', ['.#', '##', '.#'], 5, 'purple'),
  shape('s-4-h', ['.##', '##.'], 4, 'green'),
  shape('s-4-v', ['#.', '##', '.#'], 4, 'green'),
  shape('z-4-h', ['##.', '.##'], 4, 'red'),
  shape('z-4-v', ['.#', '##', '#.'], 4, 'red'),
  shape('corner-5-ne', ['###', '..#', '..#'], 2.5, 'yellow'),
  shape('corner-5-nw', ['###', '#..', '#..'], 2.5, 'yellow'),
  shape('corner-5-se', ['..#', '..#', '###'], 2.5, 'yellow'),
  shape('corner-5-sw', ['#..', '#..', '###'], 2.5, 'yellow'),
  shape('plus-5', ['.#.', '###', '.#.'], 2, 'purple'),
  shape('t-5-n', ['###', '.#.', '.#.'], 2.5, 'blue'),
  shape('t-5-e', ['#..', '###', '#..'], 2.5, 'blue'),
  shape('t-5-s', ['.#.', '.#.', '###'], 2.5, 'blue'),
  shape('t-5-w', ['..#', '###', '..#'], 2.5, 'blue'),
  shape('p-5-nw', ['##', '##', '#.'], 3, 'orange'),
  shape('p-5-ne', ['##', '##', '.#'], 3, 'orange'),
  shape('p-5-sw', ['#.', '##', '##'], 3, 'orange'),
  shape('p-5-se', ['.#', '##', '##'], 3, 'orange'),
];
