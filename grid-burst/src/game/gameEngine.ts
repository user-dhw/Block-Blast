import { clearLines } from './clearing';
import { generatePieceTray } from './generator';
import { createInitialBoard } from './initialBoard';
import { canPlacePiece, createEmptyBoard, getPlacementObstacles, isGameOver, putPiece } from './placement';
import { createRng, createSeed, seedToState } from './random';
import { rotateShapeCells } from './rotation';
import { calculateScore } from './scoring';
import { PICKAXE_USES } from './types';
import type { GameOptions, GameState, PieceRotation } from './types';

export { createEmptyBoard } from './placement';

export function createGame(options: GameOptions = {}): GameState {
  const seed = options.seed ?? createSeed();
  const rng = createRng(seedToState(seed));
  const mode = options.mode ?? 'classic';
  const difficulty = mode === 'freeplay' ? 'casual' : options.difficulty ?? 'normal';
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
    status: mode !== 'freeplay' && isGameOver(board, tray) ? 'over' : 'playing',
    lastMove: null,
  };
}

/** Atomic immutable transition: invalid/double/stale placements leave the run unchanged. */
export function placePiece(state: GameState, pieceId: string, x: number, y: number): GameState | null {
  if (state.mode !== 'freeplay' && state.status !== 'playing') return null;
  const index = state.tray.findIndex((piece) => piece?.id === pieceId);
  const piece = state.tray[index];
  if (!piece || !canPlacePiece(state.board, piece, x, y)) return null;
  const cleared = clearLines(putPiece(state.board, piece, x, y));
  const score = calculateScore(piece.cells.length, cleared.clearedLineCount, state.combo);
  let tray = state.tray.map((available, slot) => slot === index ? null : available);
  let rngState = state.rngState;
  if (tray.every((available) => available === null)) {
    const rng = createRng(rngState);
    tray = generatePieceTray(cleared.board, rng, state.mode === 'freeplay' ? 'casual' : state.difficulty, `tray-${state.moves + 1}`);
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
    status: state.mode !== 'freeplay' && isGameOver(cleared.board, tray) ? 'over' : 'playing',
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
  if (state.mode !== 'freeplay' && !(state.pickaxesLeft > 0)) return null;
  const piece = state.tray.find((item) => item?.id === pieceId);
  if (!piece) return null;
  const removedPositions = getPlacementObstacles(state.board, piece, x, y);
  if (!removedPositions || removedPositions.length === 0) return null;
  const board = state.board.map((row) => row.map((item) => item ? { ...item } : null));
  for (const cell of removedPositions) board[cell.y][cell.x] = null;
  const next = placePiece({ ...state, board, status: 'playing',
    pickaxesLeft: state.mode === 'freeplay' ? PICKAXE_USES : state.pickaxesLeft - 1 }, pieceId, x, y);
  if (!next || !next.lastMove) return null;
  return {
    ...next,
    lastMove: { ...next.lastMove, removedPositions },
  };
}

/** Freeplay rotation changes only the selected tray piece; a turn is not spent. */
export function rotatePiece(state: GameState, pieceId: string): GameState | null {
  if (state.mode !== 'freeplay') return null;
  const index = state.tray.findIndex((piece) => piece?.id === pieceId);
  const piece = state.tray[index];
  if (!piece) return null;
  const cells = rotateShapeCells(piece.cells, 1);
  if (cells.length === 0) return null;
  const tray = state.tray.map((available, slot) => slot === index ? {
    ...piece, cells, rotation: ((piece.rotation ?? 0) + 1) % 4 as PieceRotation,
  } : available);
  return { ...state, tray, status: 'playing', lastMove: null };
}

/** Freeplay can replace its tray without changing the board or any scoring counters. */
export function rerollTray(state: GameState): GameState | null {
  if (state.mode !== 'freeplay') return null;
  const rng = createRng(state.rngState);
  const tray = generatePieceTray(state.board, rng, 'casual', `reroll-${rng.state.toString(36)}`);
  return { ...state, tray, rngState: rng.state, status: 'playing', lastMove: null };
}

export function restartGame(state: GameState, options: GameOptions = {}): GameState {
  const mode = options.mode ?? state.mode;
  const sameScoreGroup = (mode === 'freeplay') === (state.mode === 'freeplay');
  return createGame({
    mode,
    difficulty: state.difficulty,
    ...options,
    best: sameScoreGroup ? Math.max(state.best, state.score, options.best ?? 0) : options.best ?? 0,
  });
}
