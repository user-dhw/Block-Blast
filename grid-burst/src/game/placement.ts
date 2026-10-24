import { BOARD_SIZE } from './types';
import type { Board, CellOffset, Piece } from './types';

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));
}

/** Inspect only the shape's occupied cells; gaps in its bounding box stay untouched. */
export function getPlacementObstacles(board: Board, piece: Piece, x: number, y: number): CellOffset[] | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || piece.cells.length === 0) return null;
  const occupied = new Set<string>();
  const obstacles: CellOffset[] = [];
  for (const cell of piece.cells) {
    const targetX = x + cell.x;
    const targetY = y + cell.y;
    const key = `${targetX},${targetY}`;
    if (!Number.isInteger(targetX) || !Number.isInteger(targetY) || occupied.has(key)
      || targetX < 0 || targetY < 0 || targetX >= BOARD_SIZE || targetY >= BOARD_SIZE) return null;
    occupied.add(key);
    const target = board[targetY]?.[targetX];
    if (target === undefined) return null;
    if (target !== null) obstacles.push({ x: targetX, y: targetY });
  }
  return obstacles;
}

export function canPlacePiece(board: Board, piece: Piece, x: number, y: number): boolean {
  const obstacles = getPlacementObstacles(board, piece, x, y);
  return obstacles !== null && obstacles.length === 0;
}

export function getValidPlacements(board: Board, piece: Piece): CellOffset[] {
  const placements: CellOffset[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (canPlacePiece(board, piece, x, y)) placements.push({ x, y });
    }
  }
  return placements;
}

export function canAnyPieceFit(board: Board, pieces: readonly (Piece | null)[]): boolean {
  return pieces.some((piece) => piece !== null && getValidPlacements(board, piece).length > 0);
}

export function isGameOver(board: Board, pieces: readonly (Piece | null)[]): boolean {
  return !canAnyPieceFit(board, pieces);
}

/** Caller checks legality first; only the returned board receives new cells. */
export function putPiece(board: Board, piece: Piece, x: number, y: number): Board {
  const next = board.map((row) => row.map((cell) => cell ? { ...cell } : null));
  for (const cell of piece.cells) next[y + cell.y][x + cell.x] = { color: piece.color };
  return next;
}
