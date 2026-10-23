import { clearLines } from './clearing';
import { createEmptyBoard, getValidPlacements, putPiece } from './placement';
import { SHAPES } from './shapes';
import type { SeededRng } from './random';
import type { Board, Piece } from './types';

/** Build 20–35% occupancy with legal compact polyomino placements, not cell noise. */
export function createInitialBoard(rng: SeededRng): Board {
  let board = createEmptyBoard();
  const target = 13 + Math.floor(rng.next() * 10);
  let filled = 0;
  const compact = SHAPES.filter((shape) => shape.cells.length <= 4
    && shape.cells.every((cell) => cell.x <= 2 && cell.y <= 2));
  for (let attempt = 0; filled < target && attempt < 100; attempt += 1) {
    const available = compact.filter((shape) => shape.cells.length <= target - filled);
    const shape = available[Math.floor(rng.next() * available.length)];
    const piece: Piece = { ...shape, shapeId: shape.id, id: `opening-${attempt}` };
    const candidates = getValidPlacements(board, piece).map((position) => {
      const next = putPiece(board, piece, position.x, position.y);
      const clears = clearLines(next);
      let neighbors = 0;
      for (const cell of piece.cells) {
        const x = position.x + cell.x;
        const y = position.y + cell.y;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (board[y + dy]?.[x + dx]) neighbors += 1;
        }
      }
      return { next, weight: clears.clearedLineCount === 0 ? 1 + neighbors * 2 : 0 };
    }).filter((candidate) => candidate.weight > 0);
    if (candidates.length === 0) continue;
    let random = rng.next() * candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let selected = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      random -= candidate.weight;
      if (random < 0) {
        selected = candidate;
        break;
      }
    }
    board = selected.next;
    filled += piece.cells.length;
  }
  // The randomized stage is bounded. Complete an exceptionally unlucky opening
  // with legal singles so its advertised occupancy never depends on retry luck.
  if (filled < target) {
    const single: Piece = { id: 'opening-fill', shapeId: 'single', color: 'cyan', cells: [{ x: 0, y: 0 }] };
    for (const position of getValidPlacements(board, single)) {
      const next = putPiece(board, single, position.x, position.y);
      if (clearLines(next).clearedLineCount > 0) continue;
      board = next;
      filled += 1;
      if (filled === target) break;
    }
  }
  return board;
}
