import { clearLines } from './clearing';
import { generatePieceTray } from './generator';
import { createInitialBoard } from './initialBoard';
import { canPlacePiece, createEmptyBoard, getPlacementObstacles, isGameOver, putPiece } from './placement';
import { createRng, createSeed, seedToState } from './random';
import { calculateScore } from './scoring';
import { PICKAXE_USES } from './types';
import type { GameOptions, GameState } from './types';

export { createEmptyBoard } from './placement';

export function createGame(options: GameOptions = {}): GameState {
  const seed = options.seed ?? createSeed();
  const rng = createRng(seedToState(seed));
  const mode = options.mode ?? 'classic';
  const difficulty = options.difficulty ?? 'normal';
  const board = mode === 'challenge' ? createInitialBoard(rng) : createEmptyBoard();
  let tray = generatePieceTray(board, rng, difficulty, 'tray-0');
  // Challenges always open with a playable tray, including on Hard.
  if (isGameOver(board, tray)) tray = generatePieceTray(board, rng, 'normal', 'tray-0');
  return {
    version: 1,
    board,
    tray,
    score: 0,
    best: options.best ?? 0,
    combo: 0,
    totalLines: 0,
    moves: 0,
    pickaxesLeft: PICKAXE_USES,
    seed,
    rngState: rng.state,
    mode,
    difficulty,
    status: isGameOver(board, tray) ? 'over' : 'playing',
    lastMove: null,
  };
}

/** Atomic immutable transition: invalid/double/stale placements leave the run unchanged. */
export function placePiece(state: GameState, pieceId: string, x: number, y: number): GameState | null {
  if (state.status !== 'playing') return null;
  const index = state.tray.findIndex((piece) => piece?.id === pieceId);
  const piece = state.tray[index];
  if (!piece || !canPlacePiece(state.board, piece, x, y)) return null;
  const cleared = clearLines(putPiece(state.board, piece, x, y));
  const score = calculateScore(piece.cells.length, cleared.clearedLineCount, state.combo);
  let tray = state.tray.map((available, slot) => slot === index ? null : available);
  let rngState = state.rngState;
  if (tray.every((available) => available === null)) {
    const rng = createRng(rngState);
    tray = generatePieceTray(cleared.board, rng, state.difficulty, `tray-${state.moves + 1}`);
    rngState = rng.state;
  }
  const points = state.score + score.points;
  return {
    ...state,
    board: cleared.board,
    tray,
    score: points,
    best: Math.max(state.best, points),
    combo: score.combo,
    totalLines: state.totalLines + cleared.clearedLineCount,
    moves: state.moves + 1,
    rngState,
    status: isGameOver(cleared.board, tray) ? 'over' : 'playing',
    lastMove: {
      placed: piece.cells.map((cell) => ({ x: x + cell.x, y: y + cell.y })),
      clearedPositions: cleared.clearedPositions,
      points: score.points,
      lines: cleared.clearedLineCount,
      combo: score.combo,
      color: piece.color,
    },
  };
}

/** Clear a blocked footprint, then commit the selected piece through the normal turn. */
export function breakThrough(state: GameState, pieceId: string, x: number, y: number): GameState | null {
  if (!(state.pickaxesLeft > 0)) return null;
  const piece = state.tray.find((item) => item?.id === pieceId);
  if (!piece) return null;
  const removedPositions = getPlacementObstacles(state.board, piece, x, y);
  if (!removedPositions || removedPositions.length === 0) return null;
  const board = state.board.map((row) => row.map((item) => item ? { ...item } : null));
  for (const cell of removedPositions) board[cell.y][cell.x] = null;
  const next = placePiece({ ...state, board, status: 'playing', pickaxesLeft: state.pickaxesLeft - 1 }, pieceId, x, y);
  if (!next || !next.lastMove) return null;
  return {
    ...next,
    lastMove: { ...next.lastMove, removedPositions },
  };
}

export function restartGame(state: GameState, options: GameOptions = {}): GameState {
  return createGame({
    mode: state.mode,
    difficulty: state.difficulty,
    ...options,
    best: Math.max(state.best, state.score, options.best ?? 0),
  });
}
