import { describe, expect, it } from 'vitest';
import { createGame, placePiece, restartGame, usePickaxe as applyPickaxe } from '../game/gameEngine';
import { getValidPlacements, isGameOver } from '../game/placement';
import { SHAPES } from '../game/shapes';
import { BOARD_SIZE, PICKAXE_USES } from '../game/types';
import type { Board, GameState, Piece } from '../game/types';

function fixture(): GameState {
  const game = createGame({ seed: 'pickaxe-test', best: 900 });
  game.board[0][0] = { color: 'cyan' };
  game.board[2][3] = { color: 'orange' };
  game.board[6][7] = { color: 'yellow' };
  game.board[7][7] = { color: 'purple' };
  return { ...game, score: 450, combo: 2, moves: 9, totalLines: 4 };
}

function terminalFixture(shapeId: string): GameState {
  const shape = SHAPES.find((candidate) => candidate.id === shapeId)!;
  const piece: Piece = { ...shape, id: 'rescue-piece', shapeId: shape.id };
  const board: Board = Array.from({ length: BOARD_SIZE }, (_, y) => Array.from({ length: BOARD_SIZE }, (_, x) =>
    (x + y) % 2 === 0 ? { color: 'purple' } : null));
  return { ...fixture(), board, tray: [piece, null, null], status: 'over' };
}

describe('limited pickaxe tools', () => {
  it('starts each new run with three uses', () => {
    expect(PICKAXE_USES).toBe(3);
    for (const mode of ['classic', 'challenge'] as const) {
      expect(createGame({ seed: 'fresh-tools', mode }).pickaxesLeft).toBe(PICKAXE_USES);
    }
  });

  it('immutably removes exactly the target cell and reports zero-point feedback', () => {
    const game = fixture();
    const snapshot = structuredClone(game);
    const next = applyPickaxe(game, 3, 2)!;
    expect(game).toEqual(snapshot);
    expect(next).not.toBe(game);
    expect(next.board).not.toBe(game.board);
    expect(next.board[2]).not.toBe(game.board[2]);
    const expectedBoard = structuredClone(game.board);
    expectedBoard[2][3] = null;
    expect(next.board).toEqual(expectedBoard);
    expect(next.pickaxesLeft).toBe(PICKAXE_USES - 1);
    expect(next.lastMove).toEqual({
      placed: [], clearedPositions: [{ x: 3, y: 2 }], points: 0,
      lines: 0, combo: game.combo, color: 'orange',
    });
    expect(next.tray).toBe(game.tray);
    expect(next).toEqual({ ...snapshot, board: expectedBoard, pickaxesLeft: 2,
      status: 'playing', lastMove: next.lastMove });
  });

  it('permits exactly three successful uses and leaves an exhausted run unchanged', () => {
    let game = fixture();
    for (const [index, [x, y]] of [[0, 0], [3, 2], [7, 6]].entries()) {
      game = applyPickaxe(game, x, y)!;
      expect(game.pickaxesLeft).toBe(PICKAXE_USES - index - 1);
    }
    const snapshot = structuredClone(game);
    expect(game.board[7][7]).not.toBeNull();
    expect(applyPickaxe(game, 7, 7)).toBeNull();
    expect(game).toEqual(snapshot);
  });

  it.each([
    [-1, 0], [0, -1], [BOARD_SIZE, 0], [0, BOARD_SIZE],
    [0.5, 0], [0, 0.5], [NaN, 0], [0, NaN], [Infinity, 0], [0, Infinity],
  ])('rejects invalid coordinates (%s, %s) without consuming a use', (x, y) => {
    const game = fixture();
    const snapshot = structuredClone(game);
    expect(applyPickaxe(game, x, y)).toBeNull();
    expect(game).toEqual(snapshot);
  });

  it('rejects empty cells and repeated hits without consuming another use', () => {
    const game = fixture();
    expect(applyPickaxe(game, 1, 1)).toBeNull();
    expect(game.pickaxesLeft).toBe(PICKAXE_USES);
    const next = applyPickaxe(game, 0, 0)!;
    const snapshot = structuredClone(next);
    expect(applyPickaxe(next, 0, 0)).toBeNull();
    expect(next).toEqual(snapshot);
  });

  it('rescues a terminal run when the removed cell creates a legal placement', () => {
    const domino = SHAPES.find((shape) => shape.cells.length === 2
      && shape.cells.some((cell) => cell.x === 1 && cell.y === 0))!;
    const game = terminalFixture(domino.id);
    expect(isGameOver(game.board, game.tray)).toBe(true);
    const next = applyPickaxe(game, 0, 0)!;
    expect(next.status).toBe('playing');
    expect(isGameOver(next.board, next.tray)).toBe(false);
    expect(next.tray).toBe(game.tray);
    expect(next.rngState).toBe(game.rngState);
    expect(next.moves).toBe(game.moves);
  });

  it('keeps terminal status when the remaining pieces still cannot fit', () => {
    const square = SHAPES.find((shape) => shape.cells.length === 4
      && shape.cells.every((cell) => cell.x < 2 && cell.y < 2))!;
    const game = terminalFixture(square.id);
    const next = applyPickaxe(game, 0, 0)!;
    expect(next.pickaxesLeft).toBe(2);
    expect(next.status).toBe('over');
    expect(isGameOver(next.board, next.tray)).toBe(true);
  });

  it('preserves the remaining allowance across normal piece placement', () => {
    const used = applyPickaxe(fixture(), 0, 0)!;
    const piece = used.tray.find((item) => item !== null)!;
    const target = getValidPlacements(used.board, piece)[0];
    const next = placePiece(used, piece.id, target.x, target.y)!;
    expect(next.pickaxesLeft).toBe(2);
    expect(next.moves).toBe(used.moves + 1);
  });

  it('restores the full allowance on restart while retaining the best score', () => {
    const used = applyPickaxe(fixture(), 0, 0)!;
    const restarted = restartGame(used, { seed: 'fresh-again' });
    expect(restarted.pickaxesLeft).toBe(PICKAXE_USES);
    expect(restarted.best).toBe(used.best);
    expect(restarted.score).toBe(0);
    expect(restarted.moves).toBe(0);
    expect(restarted.lastMove).toBeNull();
  });
});
