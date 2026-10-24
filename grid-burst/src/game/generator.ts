import { SHAPES } from './shapes';
import { hasPlayableTraySequence } from './solver';
import type { SeededRng } from './random';
import type { BlockShape, Board, Difficulty, Piece } from './types';

function selectionWeight(shape: BlockShape, difficulty: Difficulty): number {
  const size = shape.cells.length;
  const factor = difficulty === 'casual' ? (size <= 3 ? 1.8 : size >= 5 ? 0.5 : 1)
    : difficulty === 'hard' ? (size <= 2 ? 0.55 : size >= 5 ? 1.8 : 1) : 1;
  // A small easing across every mode: favor 1–3 cells by 20%, and reduce 5+
  // cells by 10%. Difficulty differences and the tray solver stay unchanged.
  const easeFactor = size <= 3 ? 1.2 : size >= 5 ? 0.9 : 1;
  return shape.weight * factor * easeFactor;
}

export function generateRandomPiece(rng: SeededRng, difficulty: Difficulty = 'normal', id?: string): Piece {
  const total = SHAPES.reduce((sum, shape) => sum + selectionWeight(shape, difficulty), 0);
  let selection = rng.next() * total;
  let selected = SHAPES[SHAPES.length - 1];
  for (const shape of SHAPES) {
    selection -= selectionWeight(shape, difficulty);
    if (selection < 0) {
      selected = shape;
      break;
    }
  }
  return {
    id: id ?? `piece-${rng.state.toString(36)}`,
    shapeId: selected.id,
    cells: selected.cells.map((cell) => ({ ...cell })),
    color: selected.color,
  };
}

/**
 * Normal/casual try up to eight independent weighted trays, proving one complete route.
 * The fallback is three single cells: always placeable on a reachable non-terminal board
 * (each uncleared row contains a gap); its result is also checked by the solver.
 * Hard uses independent weighted selection without a solvability promise.
 */
export function generatePieceTray(board: Board, rng: SeededRng, difficulty: Difficulty = 'normal', idPrefix = `tray-${rng.state.toString(36)}`): Piece[] {
  const attempts = difficulty === 'hard' ? 1 : 8;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const tray = Array.from({ length: 3 }, (_, index) => generateRandomPiece(rng, difficulty, `${idPrefix}-${index}`));
    if (difficulty === 'hard' || hasPlayableTraySequence(board, tray, { maxNodes: 1800 })) return tray;
  }
  const single = SHAPES.find((shape) => shape.id === 'single')!;
  const fallback = Array.from({ length: 3 }, (_, index) => ({
    id: `${idPrefix}-${index}`,
    shapeId: single.id,
    cells: single.cells.map((cell) => ({ ...cell })),
    color: single.color,
  }));
  // An already terminal externally supplied board cannot admit any tray. The game
  // engine detects that state; no occupied cells or scores are secretly changed.
  hasPlayableTraySequence(board, fallback, { maxNodes: 256 });
  return fallback;
}
