import { describe, expect, it } from 'vitest';
import { breakThrough, createGame, placePiece, restartGame } from '../game/gameEngine';
import { canPlacePiece, createEmptyBoard, getPlacementObstacles, getValidPlacements, isGameOver } from '../game/placement';
import { SHAPES } from '../game/shapes';
import { BOARD_SIZE, PICKAXE_USES } from '../game/types';
import type { Board, GameState, Piece } from '../game/types';

function piece(shapeId: string, id = shapeId): Piece {
  const shape = SHAPES.find((candidate) => candidate.id === shapeId)!;
  return { id, shapeId, cells: shape.cells.map((cell) => ({ ...cell })), color: shape.color };
}

function fixture(): GameState {
  const board = createEmptyBoard();
  board[0][0] = { color: 'blue' };
  board[1][1] = { color: 'red' };
  board[7][7] = { color: 'purple' };
  return { ...createGame({ seed: 'breakthrough-test', best: 900 }), board,
    tray: [piece('corner-3-nw', 'corner'), piece('single', 'spare'), null],
    score: 450, combo: 2, moves: 9, totalLines: 4 };
}

describe('placement footprint obstacles', () => {
  it('returns absolute obstacles only within the shape, preserving bounding-box gaps and inputs', () => {
    const board = createEmptyBoard();
    const block = piece('corner-3-nw');
    board[3][2] = { color: 'red' };
    board[4][3] = { color: 'yellow' }; // Empty corner of the shape's bounding box.
    const snapshot = structuredClone({ board, block });
    expect(getPlacementObstacles(board, block, 2, 3)).toEqual([{ x: 2, y: 3 }]);
    expect(canPlacePiece(board, block, 2, 3)).toBe(false);
    expect(getPlacementObstacles(board, block, 5, 0)).toEqual([]);
    board[3][2] = null;
    expect(getPlacementObstacles(board, block, 2, 3)).toEqual([]);
    expect(canPlacePiece(board, block, 2, 3)).toBe(true);
    board[3][2] = { color: 'red' };
    expect({ board, block }).toEqual(snapshot);
  });

  it('rejects malformed, duplicated and empty footprints without mutating anything', () => {
    const board = createEmptyBoard();
    for (const cells of [[], [{ x: 0, y: 0 }, { x: 0, y: 0 }],
      [{ x: 0.5, y: 0 }], [{ x: 0, y: NaN }], [{ x: Infinity, y: 0 }]]) {
      const block = { ...piece('single'), cells };
      const snapshot = structuredClone({ board, block });
      expect(getPlacementObstacles(board, block, 0, 0)).toBeNull();
      expect(canPlacePiece(board, block, 0, 0)).toBe(false);
      expect({ board, block }).toEqual(snapshot);
    }
  });

  it('rejects the entire footprint when a later cell is outside the board', () => {
    const board = createEmptyBoard();
    board[0][7] = { color: 'blue' };
    expect(getPlacementObstacles(board, piece('domino-h'), 7, 0)).toBeNull();
    expect(getPlacementObstacles(board, piece('domino-v'), 0, 7)).toBeNull();
    board[7][7] = { color: 'green' };
    expect(getPlacementObstacles(board, piece('domino-h'), 6, 7)).toEqual([{ x: 7, y: 7 }]);
  });
});

describe('breakthrough hammer turns', () => {
  it('starts every new run with three uses', () => {
    expect(PICKAXE_USES).toBe(3);
    for (const mode of ['classic', 'challenge'] as const) {
      expect(createGame({ seed: 'fresh-tools', mode }).pickaxesLeft).toBe(PICKAXE_USES);
    }
  });

  it('atomically replaces obstacles, places one tray piece and preserves shape gaps', () => {
    const game = fixture();
    const snapshot = structuredClone(game);
    const next = breakThrough(game, 'corner', 0, 0)!;
    expect(game).toEqual(snapshot);
    expect(next).not.toBe(game);
    expect(next.board).not.toBe(game.board);
    const expectedBoard = structuredClone(game.board);
    for (const cell of game.tray[0]!.cells) expectedBoard[cell.y][cell.x] = { color: 'cyan' };
    expect(next.board).toEqual(expectedBoard);
    expect(next.board[1][1]).toEqual({ color: 'red' });
    expect(next.board[7][7]).toEqual({ color: 'purple' });
    expect(next.lastMove).toEqual({
      placed: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
      removedPositions: [{ x: 0, y: 0 }], clearedPositions: [],
      points: 3, lines: 0, combo: 0, color: 'cyan',
    });
    expect(next.pickaxesLeft).toBe(2);
    expect(next.moves).toBe(game.moves + 1);
    expect(next.score).toBe(game.score + 3);
    expect(next.best).toBe(game.best);
    expect(next.combo).toBe(0);
    expect(next.totalLines).toBe(game.totalLines);
    expect(next.rngState).toBe(game.rngState);
    expect(next.tray).toEqual([null, game.tray[1], null]);
    expect(next.status).toBe('playing');
  });

  it('charges once for multiple obstacles and gives no obstacle-destruction bonus', () => {
    const game = fixture();
    game.tray = [piece('square-2', 'square'), piece('single', 'spare'), null];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) game.board[y][x] = { color: 'red' };
    const next = breakThrough(game, 'square', 0, 0)!;
    expect(next.pickaxesLeft).toBe(2);
    expect(next.lastMove?.removedPositions).toHaveLength(4);
    expect(next.lastMove?.clearedPositions).toEqual([]);
    expect(next.lastMove?.points).toBe(4);
    expect(next.score).toBe(game.score + 4);
    expect(next.board.flat().filter(Boolean)).toHaveLength(5);
  });

  it('requires a footprint obstacle even when a bounding-box gap is occupied', () => {
    const game = fixture();
    game.board[0][0] = null;
    const snapshot = structuredClone(game);
    expect(getPlacementObstacles(game.board, game.tray[0]!, 0, 0)).toEqual([]);
    expect(breakThrough(game, 'corner', 0, 0)).toBeNull();
    expect(game).toEqual(snapshot);
  });

  it.each([
    [-1, 0], [0, -1], [BOARD_SIZE - 1, 0], [0, BOARD_SIZE - 1],
    [0.5, 0], [0, 0.5], [NaN, 0], [0, NaN], [Infinity, 0], [0, Infinity],
  ])('rejects invalid placement (%s, %s) without consuming a use or a turn', (x, y) => {
    const game = fixture();
    const snapshot = structuredClone(game);
    expect(breakThrough(game, 'corner', x, y)).toBeNull();
    expect(game).toEqual(snapshot);
  });

  it('rejects unknown and already-consumed piece IDs without spending another use', () => {
    const game = fixture();
    expect(breakThrough(game, 'missing', 0, 0)).toBeNull();
    expect(game.pickaxesLeft).toBe(PICKAXE_USES);
    const next = breakThrough(game, 'corner', 0, 0)!;
    const snapshot = structuredClone(next);
    expect(breakThrough(next, 'corner', 0, 0)).toBeNull();
    expect(next).toEqual(snapshot);
  });

  it('allows an overlapping placement flush against the bottom-right board edge', () => {
    const game = fixture();
    game.tray = [piece('domino-h', 'edge'), piece('single', 'spare'), null];
    const next = breakThrough(game, 'edge', 6, 7)!;
    expect(next.lastMove?.removedPositions).toEqual([{ x: 7, y: 7 }]);
    expect(next.board[7][6]).toEqual({ color: 'blue' });
    expect(next.board[7][7]).toEqual({ color: 'blue' });
    expect(next.lastMove?.points).toBe(2);
  });

  it('performs normal line and combo scoring with removed obstacles kept separate', () => {
    const game = fixture();
    game.board = createEmptyBoard();
    for (let x = 0; x < BOARD_SIZE - 1; x++) game.board[0][x] = { color: 'red' };
    game.tray = [piece('line-3-h', 'line'), piece('single', 'spare'), null];
    game.score = 890;
    const next = breakThrough(game, 'line', 5, 0)!;
    expect(next.lastMove?.removedPositions).toEqual([{ x: 5, y: 0 }, { x: 6, y: 0 }]);
    expect(next.lastMove?.clearedPositions).toHaveLength(8);
    expect(next.lastMove?.points).toBe(153); // 3 placed cells + 100 × 1.5; no destruction bonus.
    expect(next.score).toBe(1043);
    expect(next.best).toBe(1043);
    expect(next.combo).toBe(3);
    expect(next.totalLines).toBe(game.totalLines + 1);
    expect(next.board[0].every((cell) => cell === null)).toBe(true);
  });

  it('rescues a terminal run through a blocked placement and resulting line clear', () => {
    const game = fixture();
    const board: Board = Array.from({ length: BOARD_SIZE }, (_, y) => Array.from({ length: BOARD_SIZE }, (_, x) =>
      x === y ? null : { color: 'purple' }));
    game.board = board;
    game.tray = [piece('domino-h', 'rescue'), piece('domino-h', 'remaining'), null];
    game.status = 'over';
    expect(isGameOver(game.board, game.tray)).toBe(true);
    const snapshot = structuredClone(game);
    const next = breakThrough(game, 'rescue', 0, 0)!;
    expect(game).toEqual(snapshot);
    expect(next.status).toBe('playing');
    expect(isGameOver(next.board, next.tray)).toBe(false);
    expect(next.lastMove?.removedPositions).toEqual([{ x: 1, y: 0 }]);
    expect(next.lastMove?.lines).toBe(2);
    expect(next.lastMove?.points).toBe(377);
    expect(next.tray).toEqual([null, game.tray[1], null]);
    expect(next.rngState).toBe(game.rngState);
    expect(next.moves).toBe(game.moves + 1);
  });

  it('keeps terminal status when a breakthrough still leaves no remaining piece that fits', () => {
    const game = fixture();
    game.board = Array.from({ length: BOARD_SIZE }, (_, y) => Array.from({ length: BOARD_SIZE }, (_, x) =>
      (x + y) % 2 === 0 ? { color: 'purple' } : null));
    game.tray = [piece('domino-h', 'first'), piece('domino-h', 'remaining'), null];
    game.status = 'over';
    const next = breakThrough(game, 'first', 0, 0)!;
    expect(next.pickaxesLeft).toBe(2);
    expect(next.lastMove?.lines).toBe(0);
    expect(next.status).toBe('over');
    expect(isGameOver(next.board, next.tray)).toBe(true);
  });

  it('refills the last tray slot with the same RNG continuation as an ordinary turn', () => {
    const game = fixture();
    game.tray = [null, piece('domino-h', 'last'), null];
    const ordinaryBoard = structuredClone(game.board);
    ordinaryBoard[0][0] = null;
    const ordinary = placePiece({ ...game, board: ordinaryBoard, pickaxesLeft: 2 }, 'last', 0, 0)!;
    const next = breakThrough(game, 'last', 0, 0)!;
    expect(next).toEqual({ ...ordinary, lastMove: { ...ordinary.lastMove!, removedPositions: [{ x: 0, y: 0 }] } });
    expect(next.tray.every(Boolean)).toBe(true);
    expect(next.tray.every((block) => block!.id !== 'last')).toBe(true);
    expect(next.rngState).not.toBe(game.rngState);
    expect(next.pickaxesLeft).toBe(2);
  });

  it('allows exactly three successful hammer turns, then preserves an exhausted run', () => {
    let game = fixture();
    game.tray = [piece('single', 'a'), piece('single', 'b'), piece('single', 'c')];
    for (const [index, id] of ['a', 'b', 'c'].entries()) {
      game = breakThrough(game, id, 0, 0)!;
      expect(game.pickaxesLeft).toBe(PICKAXE_USES - index - 1);
      expect(game.moves).toBe(10 + index);
    }
    const block = game.tray[0]!;
    const target = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
      x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE),
    })).find(({ x, y }) => (getPlacementObstacles(game.board, block, x, y)?.length ?? 0) > 0)!;
    expect(target).toBeDefined();
    const snapshot = structuredClone(game);
    expect(breakThrough(game, block.id, target.x, target.y)).toBeNull();
    expect(game).toEqual(snapshot);
  });

  it('preserves the remaining allowance across a subsequent ordinary placement', () => {
    const used = breakThrough(fixture(), 'corner', 0, 0)!;
    const block = used.tray[1]!;
    const target = getValidPlacements(used.board, block)[0];
    const next = placePiece(used, block.id, target.x, target.y)!;
    expect(next.pickaxesLeft).toBe(2);
    expect(next.moves).toBe(used.moves + 1);
    expect(next.lastMove?.removedPositions).toBeUndefined();
  });

  it('resets all three uses on restart while retaining the personal best', () => {
    const used = breakThrough(fixture(), 'corner', 0, 0)!;
    const restarted = restartGame(used, { seed: 'fresh-again' });
    expect(restarted.pickaxesLeft).toBe(PICKAXE_USES);
    expect(restarted.best).toBe(used.best);
    expect(restarted.score).toBe(0);
    expect(restarted.moves).toBe(0);
    expect(restarted.lastMove).toBeNull();
  });
});
