import { BOARD_SIZE } from './types';
import type { Board, Piece } from './types';

export type SolverOptions = { maxNodes?: number; maxMilliseconds?: number };
const ROW_MASKS = Array.from({ length: BOARD_SIZE }, (_, y) => 255n << BigInt(y * BOARD_SIZE));
const COLUMN_MASKS = Array.from({ length: BOARD_SIZE }, (_, x) => {
  let mask = 0n;
  for (let y = 0; y < BOARD_SIZE; y += 1) mask |= 1n << BigInt(y * BOARD_SIZE + x);
  return mask;
});

function toMask(board: Board): bigint {
  let mask = 0n;
  board.forEach((row, y) => row.forEach((cell, x) => {
    if (cell !== null) mask |= 1n << BigInt(y * BOARD_SIZE + x);
  }));
  return mask;
}

function clearMask(board: bigint): bigint {
  let clear = 0n;
  for (const mask of ROW_MASKS) if ((board & mask) === mask) clear |= mask;
  for (const mask of COLUMN_MASKS) if ((board & mask) === mask) clear |= mask;
  return board & ~clear;
}

function pieceMasks(piece: Piece): bigint[] {
  if (piece.cells.length === 0) return [];
  const width = Math.max(...piece.cells.map((cell) => cell.x)) + 1;
  const height = Math.max(...piece.cells.map((cell) => cell.y)) + 1;
  const result: bigint[] = [];
  for (let y = 0; y <= BOARD_SIZE - height; y += 1) {
    for (let x = 0; x <= BOARD_SIZE - width; x += 1) {
      let mask = 0n;
      for (const cell of piece.cells) mask |= 1n << BigInt((y + cell.y) * BOARD_SIZE + x + cell.x);
      result.push(mask);
    }
  }
  return result;
}

/**
 * Proves a complete sequence, considering every remaining-piece order and legal position.
 * A deterministic node budget makes exhaustion a conservative `false`, never a false promise.
 */
export function hasPlayableTraySequence(board: Board, pieces: readonly (Piece | null)[], options: SolverOptions = {}): boolean {
  const remaining = pieces.filter((piece): piece is Piece => piece !== null);
  if (remaining.length === 0) return true;
  const masks = remaining.map(pieceMasks);
  const signatures = remaining.map((piece) => piece.cells.map(({ x, y }) => `${x},${y}`).join(';'));
  const maxNodes = Math.max(0, options.maxNodes ?? 6000);
  const deadline = options.maxMilliseconds === undefined ? Infinity : Date.now() + options.maxMilliseconds;
  let nodes = 0;
  let exhausted = false;
  const failed = new Set<string>();
  const search = (occupied: bigint, available: number[]): boolean => {
    if (available.length === 0) return true;
    nodes += 1;
    if (nodes > maxNodes || (nodes % 32 === 0 && Date.now() > deadline)) {
      exhausted = true;
      return false;
    }
    const key = `${occupied}:${available.join(',')}`;
    if (failed.has(key)) return false;
    const candidates = available.map((index) => ({ index, legal: masks[index].filter((mask) => (occupied & mask) === 0n) }))
      .sort((a, b) => a.legal.length - b.legal.length);
    const considered = new Set<string>();
    for (const candidate of candidates) {
      if (considered.has(signatures[candidate.index])) continue;
      considered.add(signatures[candidate.index]);
      const rest = available.filter((index) => index !== candidate.index);
      for (const mask of candidate.legal) {
        if (search(clearMask(occupied | mask), rest)) return true;
        if (exhausted) return false;
      }
    }
    failed.add(key);
    return false;
  };
  return search(toMask(board), remaining.map((_, index) => index));
}
