import { describe, expect, it } from 'vitest';
import { clearLines } from '../game/clearing';
import { createGame, placePiece, restartGame } from '../game/gameEngine';
import { generatePieceTray, generateRandomPiece } from '../game/generator';
import { createInitialBoard } from '../game/initialBoard';
import { canAnyPieceFit, canPlacePiece, createEmptyBoard, getValidPlacements, isGameOver } from '../game/placement';
import { createRng, seedToState } from '../game/random';
import { calculateScore, getComboMultiplier } from '../game/scoring';
import { SHAPES, normalizeCells, validateShape } from '../game/shapes';
import { hasPlayableTraySequence } from '../game/solver';
import type { Board, CellOffset, Difficulty, GameState, Piece } from '../game/types';

function piece(cells: CellOffset[], id = 'test'): Piece {
  const shape = SHAPES.find((candidate) => candidate.cells.length === cells.length
    && cells.every((cell) => candidate.cells.some((offset) => offset.x === cell.x && offset.y === cell.y)));
  if (!shape) throw new Error('Required test shape is missing from the library');
  return { id, shapeId: shape.id, cells: cells.map((cell) => ({ ...cell })), color: shape.color };
}
const single = (id = 'single') => piece([{ x: 0, y: 0 }], id);
const domino = (id = 'domino') => piece([{ x: 0, y: 0 }, { x: 1, y: 0 }], id);

function occupy(board: Board, x: number, y: number) { board[y][x] = { color: 'cyan' }; }

describe('board and shape invariants', () => {
  it('initializes 64 empty, independently writable cells', () => {
    const board = createEmptyBoard();
    expect(board).toHaveLength(8);
    expect(board.every((row) => row.length === 8 && row.every((cell) => cell === null))).toBe(true);
    occupy(board, 0, 0);
    expect(board[1][0]).toBeNull();
    expect(createEmptyBoard()[0][0]).toBeNull();
  });

  it('normalizes offsets without mutating the input', () => {
    const offsets = [{ x: -2, y: 7 }, { x: -1, y: 7 }, { x: -2, y: 8 }];
    const original = structuredClone(offsets);
    expect(normalizeCells(offsets)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
    expect(offsets).toEqual(original);
  });

  it('defines at least 25 normalized, connected shapes with unique IDs', () => {
    expect(SHAPES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SHAPES.map((shape) => shape.id)).size).toBe(SHAPES.length);
    for (const shape of SHAPES) {
      expect(validateShape(shape)).toBe(true);
      expect(Math.min(...shape.cells.map((cell) => cell.x))).toBe(0);
      expect(Math.min(...shape.cells.map((cell) => cell.y))).toBe(0);
      expect(shape.weight).toBeGreaterThan(0);
    }
  });

  it('rejects empty, duplicated, fractional, disconnected and oversized shapes', () => {
    for (const cells of [[], [{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 0.5, y: 0 }],
      [{ x: 0, y: 0 }, { x: 2, y: 0 }], Array.from({ length: 6 }, (_, x) => ({ x, y: 0 }))]) {
      expect(validateShape(cells)).toBe(false);
    }
  });
});

describe('legal placements and game over', () => {
  it('accepts legal placements and enumerates actual anchors', () => {
    const board = createEmptyBoard();
    expect(canPlacePiece(board, domino(), 0, 0)).toBe(true);
    expect(canPlacePiece(board, domino(), 6, 7)).toBe(true);
    expect(getValidPlacements(board, domino())).toHaveLength(56);
    expect(getValidPlacements(board, domino())).toContainEqual({ x: 6, y: 7 });
  });

  it('rejects every board edge overflow and fractional anchors', () => {
    const board = createEmptyBoard();
    for (const [x, y] of [[-1, 0], [7, 0], [0, -1], [0, 8], [0.5, 0], [0, 0.5]]) {
      expect(canPlacePiece(board, domino(), x, y)).toBe(false);
    }
  });

  it('rejects overlap without mutating board or piece', () => {
    const board = createEmptyBoard();
    occupy(board, 3, 3);
    const block = domino();
    const before = structuredClone({ board, block });
    expect(canPlacePiece(board, block, 2, 3)).toBe(false);
    getValidPlacements(board, block);
    expect({ board, block }).toEqual(before);
  });

  it('ends only when none of the remaining pieces fit, ignoring used slots', () => {
    const board: Board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ color: 'blue' })));
    board[0][0] = null;
    expect(canAnyPieceFit(board, [domino(), null, null])).toBe(false);
    expect(isGameOver(board, [domino(), null, null])).toBe(true);
    expect(canAnyPieceFit(board, [domino(), null, single()])).toBe(true);
    expect(isGameOver(board, [domino(), null, single()])).toBe(false);
  });
});

describe('atomic row and column clearing', () => {
  it('clears a completed horizontal row and preserves other cells and the input', () => {
    const board = createEmptyBoard();
    for (let x = 0; x < 8; x++) occupy(board, x, 3);
    occupy(board, 2, 1);
    const result = clearLines(board);
    expect(result.clearedRows).toEqual([3]);
    expect(result.clearedColumns).toEqual([]);
    expect(result.clearedCellCount).toBe(8);
    expect(result.board[3].every((cell) => cell === null)).toBe(true);
    expect(result.board[1][2]).toEqual({ color: 'cyan' });
    expect(board[3][0]).not.toBeNull();
  });

  it('clears a completed vertical column', () => {
    const board = createEmptyBoard();
    for (let y = 0; y < 8; y++) occupy(board, 4, y);
    const result = clearLines(board);
    expect(result.clearedRows).toEqual([]);
    expect(result.clearedColumns).toEqual([4]);
    expect(result.clearedLineCount).toBe(1);
    expect(result.board.every((row) => row[4] === null)).toBe(true);
  });

  it('clears multiple rows and columns simultaneously, counting intersections once', () => {
    const board = createEmptyBoard();
    for (let i = 0; i < 8; i++) {
      occupy(board, i, 1); occupy(board, i, 5); occupy(board, 2, i); occupy(board, 6, i);
    }
    const result = clearLines(board);
    expect(result.clearedRows).toEqual([1, 5]);
    expect(result.clearedColumns).toEqual([2, 6]);
    expect(result.clearedLineCount).toBe(4);
    expect(result.clearedCellCount).toBe(28);
    expect(result.clearedPositions).toHaveLength(28);
    expect(new Set(result.clearedPositions.map(({ x, y }) => `${x},${y}`)).size).toBe(28);
    expect(result.board.flat().every((cell) => cell === null)).toBe(true);
  });

  it('does not clear incomplete lines', () => {
    const board = createEmptyBoard();
    for (let i = 0; i < 7; i++) occupy(board, i, 0);
    const result = clearLines(board);
    expect(result.clearedLineCount).toBe(0);
    expect(result.clearedPositions).toEqual([]);
    expect(result.board).toEqual(board);
  });
});

describe('scoring, turns and restart', () => {
  it('scores placement, line bonuses and consistently rounded multipliers', () => {
    expect(calculateScore(4, 0, 0)).toEqual({ points: 4, combo: 0, multiplier: 1 });
    expect(calculateScore(4, 1, 0)).toEqual({ points: 104, combo: 1, multiplier: 1 });
    expect(calculateScore(4, 2, 0)).toEqual({ points: 254, combo: 1, multiplier: 1 });
    expect(calculateScore(4, 2, 1)).toEqual({ points: 317, combo: 2, multiplier: 1.25 });
    expect(getComboMultiplier(30)).toBe(3);
  });

  it('increments consecutive clears and resets the combo after a non-clear', () => {
    const first = calculateScore(1, 1, 0);
    const second = calculateScore(1, 1, first.combo);
    const third = calculateScore(1, 1, second.combo);
    expect([first.combo, second.combo, third.combo]).toEqual([1, 2, 3]);
    expect([first.multiplier, second.multiplier, third.multiplier]).toEqual([1, 1.25, 1.5]);
    expect(calculateScore(1, 0, third.combo).combo).toBe(0);
  });

  it('refills the tray only after the third placement and rejects stale or illegal moves', () => {
    const start: GameState = { ...createGame({ seed: 'tray-turn' }), tray: [single('a'), single('b'), single('c')] };
    const snapshot = structuredClone(start);
    const first = placePiece(start, 'a', 0, 0)!;
    expect(first.tray.map((item) => item?.id ?? null)).toEqual([null, 'b', 'c']);
    expect(first.rngState).toBe(start.rngState);
    expect(placePiece(first, 'a', 1, 0)).toBeNull();
    expect(placePiece(first, 'b', 0, 0)).toBeNull();
    const second = placePiece(first, 'b', 1, 0)!;
    expect(second.tray.map((item) => item?.id ?? null)).toEqual([null, null, 'c']);
    const third = placePiece(second, 'c', 2, 0)!;
    expect(third.tray.every((item) => item !== null)).toBe(true);
    expect(new Set(third.tray.map((item) => item!.id)).size).toBe(3);
    expect(third.tray.every((item) => !['a', 'b', 'c'].includes(item!.id))).toBe(true);
    expect(third.moves).toBe(3);
    expect(third.score).toBe(3);
    expect(start).toEqual(snapshot);
  });

  it('clears and scores through the state engine without moving unrelated blocks', () => {
    const start: GameState = { ...createGame({ seed: 'clear-turn' }), tray: [single('a'), single('b'), single('c')] };
    for (let x = 0; x < 7; x++) occupy(start.board, x, 0);
    occupy(start.board, 5, 4);
    const next = placePiece(start, 'a', 7, 0)!;
    expect(next.score).toBe(101);
    expect(next.best).toBe(101);
    expect(next.combo).toBe(1);
    expect(next.totalLines).toBe(1);
    expect(next.board[0].every((cell) => cell === null)).toBe(true);
    expect(next.board[4][5]).toEqual({ color: 'cyan' });
    expect(next.lastMove?.clearedPositions).toHaveLength(8);
  });

  it('updates terminal status after a move while keeping a run alive for any fitting piece', () => {
    const board: Board = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) =>
      (x + y) % 2 === 0 ? { color: 'purple' } : null));
    const base: GameState = { ...createGame({ seed: 'terminal-check' }), board,
      tray: [single('a'), domino('b'), null] };
    const ended = placePiece(base, 'a', 1, 0)!;
    expect(ended.status).toBe('over');
    expect(placePiece(ended, 'b', 0, 0)).toBeNull();
    const ongoing = placePiece({ ...base, tray: [single('a'), domino('b'), single('c')] }, 'a', 1, 0)!;
    expect(ongoing.status).toBe('playing');
    expect(getValidPlacements(ongoing.board, domino('b'))).toHaveLength(0);
  });

  it('restarts a run with best score and options retained, with reproducible seeded replay', () => {
    const start = createGame({ seed: 'repeat-me', mode: 'challenge', difficulty: 'casual', best: 900 });
    const played: GameState = { ...start, score: 123, combo: 2, moves: 9, totalLines: 4 };
    const replay = restartGame(played, { seed: 'repeat-me' });
    expect(replay).toEqual(start);
    expect(replay.best).toBe(900);
    expect(replay.score).toBe(0);
    expect(replay.lastMove).toBeNull();
    expect(restartGame(played).seed).not.toBe(start.seed);
  });
});

describe('seeded generation and solvability', () => {
  it('reproduces RNG sequences, serializable RNG continuations and seeded games', () => {
    const first = createRng(seedToState('deterministic'));
    const second = createRng(seedToState('deterministic'));
    const samples = Array.from({ length: 50 }, () => first.next());
    expect(samples).toEqual(Array.from({ length: 50 }, () => second.next()));
    expect(samples.every((value) => value >= 0 && value < 1)).toBe(true);
    const resumed = createRng(first.state);
    expect(resumed.next()).toBe(first.next());
    expect(createGame({ seed: 'deterministic' })).toEqual(createGame({ seed: 'deterministic' }));
  });

  it('generates only canonical, valid pieces for every difficulty', () => {
    for (const difficulty of ['casual', 'normal', 'hard'] satisfies Difficulty[]) {
      const rng = createRng(seedToState(`shapes-${difficulty}`));
      for (let i = 0; i < 200; i++) {
        const block = generateRandomPiece(rng, difficulty, `shape-${i}`);
        expect(validateShape(block.cells)).toBe(true);
        expect(SHAPES.find((shape) => shape.id === block.shapeId)?.cells).toEqual(block.cells);
      }
    }
  });

  it('finds a solution requiring line clearing and a different piece order', () => {
    const board: Board = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ color: 'green' })));
    // Diagonal gaps prevent pre-completed lines and leave no adjacent empty cells.
    // A single-cell move must clear before a domino can fit.
    for (let i = 0; i < 8; i++) board[i][i] = null;
    const blocks = [domino('large-first'), single('key'), domino('last')];
    const before = structuredClone({ board, blocks });
    expect(hasPlayableTraySequence(board, blocks)).toBe(true);
    expect({ board, blocks }).toEqual(before);
  });

  it('rejects a provably impossible full tray even when one piece initially fits', () => {
    const board: Board = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) =>
      (x + y) % 2 === 0 ? { color: 'purple' } : null));
    expect(canAnyPieceFit(board, [single(), domino('b'), domino('c')])).toBe(true);
    expect(hasPlayableTraySequence(board, [single(), domino('b'), domino('c')])).toBe(false);
  });

  it('creates solvable normal and casual trays without changing the board', () => {
    for (const difficulty of ['casual', 'normal'] satisfies Difficulty[]) {
      for (let i = 0; i < 8; i++) {
        const rng = createRng(seedToState(`tray-${difficulty}-${i}`));
        const board = createInitialBoard(rng);
        const before = structuredClone(board);
        const tray = generatePieceTray(board, rng, difficulty, `tray-${i}`);
        expect(tray).toHaveLength(3);
        expect(new Set(tray.map((block) => block.id)).size).toBe(3);
        expect(hasPlayableTraySequence(board, tray)).toBe(true);
        expect(board).toEqual(before);
      }
    }
  });

  it('falls back to a proven small-piece tray when repeated candidates cannot fit', () => {
    const board: Board = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) =>
      (x + y) % 2 === 0 ? { color: 'purple' } : null));
    const rng = { next: () => 0.999999, state: 1234 };
    const tray = generatePieceTray(board, rng, 'normal', 'fallback');
    expect(tray.every((block) => block.shapeId === 'single')).toBe(true);
    expect(hasPlayableTraySequence(board, tray)).toBe(true);
    expect(hasPlayableTraySequence(board, tray, { maxNodes: 0 })).toBe(false);
  });

  it('creates balanced reproducible challenge openings with legal, solvable trays', () => {
    for (let seed = 0; seed < 16; seed++) {
      const game = createGame({ seed: `challenge-${seed}`, mode: 'challenge', difficulty: 'normal' });
      const occupied = game.board.flat().filter(Boolean).length;
      expect(occupied).toBeGreaterThanOrEqual(12);
      expect(occupied).toBeLessThanOrEqual(24);
      expect(game.status).toBe('playing');
      expect(canAnyPieceFit(game.board, game.tray)).toBe(true);
      expect(hasPlayableTraySequence(game.board, game.tray.filter((block): block is Piece => block !== null))).toBe(true);
      expect(clearLines(game.board).clearedLineCount).toBe(0);
    }
  });

  it('simulates many seeded games while maintaining state and placement invariants', () => {
    for (const difficulty of ['casual', 'normal', 'hard'] satisfies Difficulty[]) {
      for (let seed = 0; seed < 6; seed++) {
        let game = createGame({ seed: `simulation-${seed}`, mode: seed % 2 ? 'challenge' : 'classic', difficulty });
        for (let move = 0; move < 24 && game.status === 'playing'; move++) {
          const choice = game.tray.flatMap((block) => block ? getValidPlacements(game.board, block)
            .map((anchor) => ({ block, anchor })) : []);
          expect(choice.length).toBeGreaterThan(0);
          const { block, anchor } = choice[(seed * 13 + move * 7) % choice.length];
          const previous = structuredClone(game);
          const next = placePiece(game, block.id, anchor.x, anchor.y);
          expect(next).not.toBeNull();
          expect(game).toEqual(previous);
          game = next!;
          expect(game.board).toHaveLength(8);
          expect(game.board.every((row) => row.length === 8)).toBe(true);
          expect(clearLines(game.board).clearedLineCount).toBe(0);
          expect(game.moves).toBe(move + 1);
          expect(game.score).toBeGreaterThan(previous.score);
          expect(game.best).toBeGreaterThanOrEqual(game.score);
          expect(game.tray).toHaveLength(3);
          expect(game.tray.some(Boolean)).toBe(true);
          expect(game.status === 'over').toBe(isGameOver(game.board, game.tray));
        }
      }
    }
  }, 20_000);
});
