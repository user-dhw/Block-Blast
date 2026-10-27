import { isGameOver } from '../game/placement';
import { rotateShapeCells } from '../game/rotation';
import { SHAPES } from '../game/shapes';
import { BOARD_SIZE, COLORS, PICKAXE_USES } from '../game/types';
import type { Board, GameMode, GameState, Piece, SavedGame, Settings } from '../game/types';

export const STORAGE_KEY = 'grid-burst:v1:save';
export const BEST_STORAGE_KEY = 'grid-burst:v1:best';
export const FREEPLAY_BEST_STORAGE_KEY = 'grid-burst:v1:freeplay-best';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function counter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function color(value: unknown): value is (typeof COLORS)[number] {
  return typeof value === 'string' && COLORS.some((item) => item === value);
}

function readBoard(value: unknown): Board | null {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE) return null;
  const result: Board = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) return null;
    const nextRow: Board[number] = [];
    for (const cell of row) {
      if (cell === null) nextRow.push(null);
      else if (record(cell) && color(cell.color)) nextRow.push({ color: cell.color });
      else return null;
    }
    result.push(nextRow);
  }
  return result;
}

function readPiece(value: unknown, allowRotation: boolean): Piece | null {
  if (!record(value) || typeof value.id !== 'string' || !value.id || value.id.length > 256
    || typeof value.shapeId !== 'string' || !color(value.color) || !Array.isArray(value.cells)) return null;
  const shape = SHAPES.find((item) => item.id === value.shapeId);
  if (!shape || value.cells.length !== shape.cells.length) return null;
  const rotation = 'rotation' in value ? value.rotation : 0;
  if (typeof rotation !== 'number' || !Number.isInteger(rotation) || rotation < 0 || rotation > 3
    || (!allowRotation && rotation !== 0)) return null;
  const expected = rotateShapeCells(shape.cells, rotation);
  const cells = new Set<string>();
  for (const cell of value.cells) {
    if (!record(cell) || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)) return null;
    cells.add(`${cell.x},${cell.y}`);
  }
  if (cells.size !== expected.length || !expected.every((cell) => cells.has(`${cell.x},${cell.y}`))) return null;
  return {
    id: value.id, shapeId: shape.id, cells: expected, color: value.color,
    ...('rotation' in value ? { rotation: rotation as 0 | 1 | 2 | 3 } : {}),
  };
}

/** Copy only the versioned schema; restored moves never replay transient effects. */
export function validateSave(value: unknown): SavedGame | null {
  try {
    if (!record(value) || (value.version !== 1 && value.version !== 2) || !record(value.game) || !record(value.settings)) return null;
    const source = value.game;
    const settings = value.settings;
    if (source.version !== 1 || typeof settings.sound !== 'boolean' || typeof settings.showWelcome !== 'boolean') return null;
    const board = readBoard(source.board);
    if (!board || !Array.isArray(source.tray) || source.tray.length !== 3) return null;
    const tray: (Piece | null)[] = [];
    const ids = new Set<string>();
    for (const item of source.tray) {
      if (item === null) tray.push(null);
      else {
        const piece = readPiece(item, source.mode === 'freeplay');
        if (!piece || ids.has(piece.id)) return null;
        ids.add(piece.id);
        tray.push(piece);
      }
    }
    if (ids.size === 0) return null;
    // Old three-use runs gain the two added charges once. Version 2 is written
    // back on the next save, so reloading cannot repeatedly increase allowances.
    let pickaxesLeft: unknown = source.pickaxesLeft;
    if (value.version === 1) {
      if (!('pickaxesLeft' in source)) pickaxesLeft = PICKAXE_USES;
      else {
        if (!counter(pickaxesLeft) || pickaxesLeft > 3) return null;
        pickaxesLeft += 2;
      }
    }
    if (!counter(pickaxesLeft) || pickaxesLeft > PICKAXE_USES) return null;
    if (!counter(source.score) || !counter(source.best) || source.best < source.score
      || !counter(source.combo) || !counter(source.totalLines) || !counter(source.moves)
      || source.combo > source.moves || typeof source.seed !== 'string' || !source.seed || source.seed.length > 256
      || !counter(source.rngState) || source.rngState > 0xffffffff
      || (source.mode !== 'classic' && source.mode !== 'challenge' && source.mode !== 'freeplay')
      || (source.difficulty !== 'casual' && source.difficulty !== 'normal' && source.difficulty !== 'hard')
      || (source.status !== 'playing' && source.status !== 'over')) return null;
    if (source.mode === 'freeplay') {
      if (source.difficulty !== 'casual' || source.status !== 'playing') return null;
    } else if ((source.status === 'over') !== isGameOver(board, tray)) return null;
    const game: GameState = {
      version: 1, board, tray, score: source.score, best: source.best,
      combo: source.combo, totalLines: source.totalLines, moves: source.moves,
      pickaxesLeft,
      seed: source.seed, rngState: source.rngState, mode: source.mode,
      difficulty: source.difficulty, status: source.status, lastMove: null,
    };
    return { version: 2, game, settings: { sound: settings.sound, showWelcome: settings.showWelcome } };
  } catch {
    return null;
  }
}

export function loadSave(): SavedGame | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? validateSave(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function bestStorageKey(mode: GameMode = 'classic'): string {
  return mode === 'freeplay' ? FREEPLAY_BEST_STORAGE_KEY : BEST_STORAGE_KEY;
}

export function loadBest(mode: GameMode = 'classic'): number {
  try {
    const raw = window.localStorage.getItem(bestStorageKey(mode));
    if (!raw) return 0;
    const value: unknown = JSON.parse(raw);
    return counter(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function saveBest(best: number, mode: GameMode = 'classic'): boolean {
  if (!counter(best)) return false;
  try {
    window.localStorage.setItem(bestStorageKey(mode), JSON.stringify(Math.max(best, loadBest(mode))));
    return true;
  } catch {
    return false;
  }
}

export function saveGame(game: GameState, settings: Settings): boolean {
  const save = validateSave({ version: 2, game, settings });
  if (!save) return false;
  try {
    saveBest(game.best, game.mode);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** Reset only this run. Both separate best-score records survive. */
export function clearSave(): boolean {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
