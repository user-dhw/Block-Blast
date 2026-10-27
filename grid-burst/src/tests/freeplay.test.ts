import { describe, expect, it } from 'vitest';
import { breakThrough, createGame, placePiece, rerollTray, restartGame, rotatePiece } from '../game/gameEngine';
import { createEmptyBoard, getPlacementObstacles, isGameOver } from '../game/placement';
import { rotateShapeCells } from '../game/rotation';
import { SHAPES, validateShape } from '../game/shapes';
import { BOARD_SIZE, PICKAXE_USES } from '../game/types';
import type { GameState, Piece } from '../game/types';

function piece(shapeId: string, id = shapeId): Piece {
  const shape = SHAPES.find((candidate) => candidate.id === shapeId)!;
  return { id, shapeId, cells: shape.cells.map((cell) => ({ ...cell })), color: shape.color };
}

function freeplay(): GameState {
  return createGame({ seed: 'freeplay-test', mode: 'freeplay', best: 500 });
}

describe('freeplay rules', () => {
  it('starts empty, forces Casual, and uses the same Casual opening generation', () => {
    const game = createGame({ seed: 'casual-opening', mode: 'freeplay', difficulty: 'hard' });
    const casual = createGame({ seed: 'casual-opening', mode: 'classic', difficulty: 'casual' });
    expect(game.board).toEqual(createEmptyBoard());
    expect(game.difficulty).toBe('casual');
    expect(game.tray).toEqual(casual.tray);
    expect(game.rngState).toBe(casual.rngState);
    expect(game.status).toBe('playing');
    expect(game.pickaxesLeft).toBe(5);
  });

  it('stays playing after an ordinary move leaves no piece that fits', () => {
    const game = freeplay();
    game.board = Array.from({ length: BOARD_SIZE }, (_, y) => Array.from({ length: BOARD_SIZE }, (_, x) =>
      (x + y) % 2 === 0 ? { color: 'purple' } : null));
    game.tray = [piece('single', 'a'), piece('domino-h', 'blocked'), null];
    const next = placePiece(game, 'a', 1, 0)!;
    expect(isGameOver(next.board, next.tray)).toBe(true);
    expect(next.status).toBe('playing');
    expect(next.score).toBe(1);
    expect(next.moves).toBe(1);
    expect(placePiece({ ...game, mode: 'classic' }, 'a', 1, 0)?.status).toBe('over');
    expect(breakThrough(next, 'blocked', 0, 0)?.status).toBe('playing');
  });

  it('allows more than five successful rescues without decrementing its finite allowance', () => {
    let game = freeplay();
    game.board = Array.from({ length: BOARD_SIZE }, (_, y) => Array.from({ length: BOARD_SIZE }, (_, x) =>
      (x + y) % 2 === 0 ? { color: 'blue' } : null));
    game.tray = [piece('single', 'a'), piece('single', 'b'), piece('single', 'c')];
    for (let turn = 0; turn < PICKAXE_USES + 7; turn++) {
      const choice = game.tray.flatMap((block) => block ? Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
        x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE), block,
      })).filter(({ x, y }) => (getPlacementObstacles(game.board, block, x, y)?.length ?? 0) > 0) : [])[0];
      expect(choice).toBeDefined();
      const snapshot = structuredClone(game);
      const next = breakThrough(game, choice.block.id, choice.x, choice.y)!;
      expect(game).toEqual(snapshot);
      expect(next.pickaxesLeft).toBe(PICKAXE_USES);
      expect(Number.isFinite(next.pickaxesLeft)).toBe(true);
      expect(next.status).toBe('playing');
      expect(next.moves).toBe(turn + 1);
      game = next;
    }
    expect(game.moves).toBe(12);
  });

  it('still rejects invalid or clear rescue targets without changing the run', () => {
    const game = freeplay();
    const block = game.tray[0]!;
    const snapshot = structuredClone(game);
    expect(breakThrough(game, block.id, 0, 0)).toBeNull();
    expect(breakThrough(game, block.id, -1, 0)).toBeNull();
    expect(breakThrough(game, 'stale', 0, 0)).toBeNull();
    expect(game).toEqual(snapshot);
  });

  it('uses ordinary placement scoring and Casual generation when its last tray piece is placed', () => {
    const game = freeplay();
    game.tray = [piece('single', 'last'), null, null];
    for (let x = 0; x < BOARD_SIZE - 1; x++) game.board[0][x] = { color: 'red' };
    game.combo = 2;
    game.moves = 4;
    const ordinary = placePiece({ ...game, mode: 'classic', difficulty: 'casual' }, 'last', 7, 0)!;
    const next = placePiece(game, 'last', 7, 0)!;
    expect(next.board).toEqual(ordinary.board);
    expect(next.lastMove).toEqual(ordinary.lastMove);
    expect(next.score).toBe(151);
    expect(next.combo).toBe(3);
    expect(next.tray).toEqual(ordinary.tray);
    expect(next.rngState).toBe(ordinary.rngState);
    expect(next.pickaxesLeft).toBe(PICKAXE_USES);
  });
});

describe('freeplay rotation', () => {
  it('rotates clockwise and returns a normalized copy suitable for save validation', () => {
    const cells = piece('corner-3-nw').cells;
    const snapshot = structuredClone(cells);
    expect(rotateShapeCells(cells, 1)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
    expect(rotateShapeCells(cells, 4)).toEqual(cells);
    expect(rotateShapeCells(cells, 5)).toEqual(rotateShapeCells(cells, 1));
    expect(rotateShapeCells(cells, -1)).toEqual(rotateShapeCells(cells, 3));
    expect(rotateShapeCells(cells, 0)).not.toBe(cells);
    expect(cells).toEqual(snapshot);
    expect(rotateShapeCells([{ x: 0.5, y: 0 }], 1)).toEqual([]);
    expect(rotateShapeCells(cells, 0.5)).toEqual([]);
  });

  it('keeps all canonical shapes integral, connected and normalized through a four-turn cycle', () => {
    for (const shape of SHAPES) {
      for (let turns = 0; turns < 4; turns++) {
        const cells = rotateShapeCells(shape.cells, turns);
        expect(validateShape(cells)).toBe(true);
        expect(Math.min(...cells.map((cell) => cell.x))).toBe(0);
        expect(Math.min(...cells.map((cell) => cell.y))).toBe(0);
        expect(cells.every((cell) => Number.isInteger(cell.x) && Number.isInteger(cell.y))).toBe(true);
      }
      expect(rotateShapeCells(shape.cells, 4)).toEqual(shape.cells);
    }
  });

  it('cycles tray rotation metadata without changing IDs, board, RNG or scoring counters', () => {
    const game = freeplay();
    game.tray = [piece('corner-3-nw', 'rotating'), piece('single', 'spare'), null];
    game.score = 100;
    game.moves = 4;
    game.combo = 2;
    game.totalLines = 1;
    game.lastMove = { placed: [], clearedPositions: [], points: 0, lines: 0, combo: 2, color: 'cyan' };
    const snapshot = structuredClone(game);
    let rotated = game;
    for (let turns = 1; turns <= 4; turns++) {
      rotated = rotatePiece(rotated, 'rotating')!;
      expect(rotated.tray[0]).toEqual({ ...game.tray[0], cells: rotateShapeCells(game.tray[0]!.cells, turns), rotation: turns % 4 });
      expect(rotated.board).toBe(game.board);
      expect(rotated.tray[1]).toBe(game.tray[1]);
      expect(rotated).toEqual({ ...game, tray: rotated.tray, lastMove: null });
    }
    expect(game).toEqual(snapshot);
    expect(rotated.tray[0]?.cells).toEqual(game.tray[0]?.cells);
    expect(rotated.tray[0]?.rotation).toBe(0);
  });

  it('places the rotated footprint using its new orientation and ordinary scoring', () => {
    const game = freeplay();
    game.tray = [piece('line-3-h', 'line'), piece('single', 'spare'), null];
    expect(placePiece(game, 'line', 7, 0)).toBeNull();
    const rotated = rotatePiece(game, 'line')!;
    const next = placePiece(rotated, 'line', 7, 0)!;
    expect(next.lastMove?.placed).toEqual([{ x: 7, y: 0 }, { x: 7, y: 1 }, { x: 7, y: 2 }]);
    expect(next.score).toBe(3);
    expect(next.moves).toBe(1);
  });
});

describe('freeplay tray rerolls and mode boundaries', () => {
  it('rerolls reproducibly with fresh unique RNG-based IDs and no points or turns', () => {
    const game = freeplay();
    game.tray[1] = null;
    game.score = 123;
    game.moves = 8;
    game.totalLines = 3;
    game.combo = 2;
    game.lastMove = { placed: [], clearedPositions: [], points: 0, lines: 0, combo: 2, color: 'blue' };
    const snapshot = structuredClone(game);
    const rerolled = rerollTray(game)!;
    expect(rerolled).toEqual(rerollTray(structuredClone(game)));
    expect(game).toEqual(snapshot);
    expect(rerolled.board).toBe(game.board);
    expect(rerolled).toEqual({ ...game, tray: rerolled.tray, rngState: rerolled.rngState, lastMove: null });
    expect(rerolled.tray.every(Boolean)).toBe(true);
    expect(rerolled.rngState).not.toBe(game.rngState);
    const again = rerollTray(rerolled)!;
    const ids = [...game.tray, ...rerolled.tray, ...again.tray].flatMap((block) => block ? [block.id] : []);
    expect(new Set(ids).size).toBe(ids.length);
    expect(again.rngState).not.toBe(rerolled.rngState);
  });

  it('keeps a blocked board playing after a reroll and permits later rescue', () => {
    const game = freeplay();
    game.board = game.board.map((row) => row.map(() => ({ color: 'blue' })));
    const rerolled = rerollTray(game)!;
    expect(isGameOver(rerolled.board, rerolled.tray)).toBe(true);
    expect(rerolled.status).toBe('playing');
    expect(rerolled.board).toEqual(game.board);
    expect(breakThrough(rerolled, rerolled.tray[0]!.id, 0, 0)?.status).toBe('playing');
  });

  it.each(['classic', 'challenge'] as const)('does not expose rotation or rerolls in %s', (mode) => {
    const game = createGame({ seed: 'normal-tools', mode });
    const snapshot = structuredClone(game);
    expect(rotatePiece(game, game.tray[0]!.id)).toBeNull();
    expect(rerollTray(game)).toBeNull();
    expect(game).toEqual(snapshot);
    expect(rotatePiece(freeplay(), 'missing')).toBeNull();
  });

  it('isolates best scores when entering or leaving freeplay', () => {
    const normal = { ...createGame({ seed: 'normal-score' }), score: 1000, best: 1200 };
    expect(restartGame(normal, { mode: 'freeplay' }).best).toBe(0);
    const free = restartGame(normal, { mode: 'freeplay', best: 75 });
    expect(free.best).toBe(75);
    free.score = 2000;
    free.best = 2500;
    expect(restartGame(free, { mode: 'classic' }).best).toBe(0);
    expect(restartGame(free, { mode: 'challenge', best: 1200 }).best).toBe(1200);
    expect(restartGame(free, { best: 100 }).best).toBe(2500);
    expect(restartGame(normal, { mode: 'challenge', best: 400 }).best).toBe(1200);
    expect(restartGame(normal, { mode: 'challenge', best: 1400 }).best).toBe(1400);
    expect(restartGame(free).pickaxesLeft).toBe(PICKAXE_USES);
  });
});
