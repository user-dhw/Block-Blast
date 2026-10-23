import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, placePiece } from '../game/gameEngine';
import { getValidPlacements } from '../game/placement';
import type { BlockColor, Difficulty, GameMode, SavedGame } from '../game/types';
import { BEST_STORAGE_KEY, clearSave, loadBest, loadSave, saveBest, saveGame, STORAGE_KEY, validateSave } from '../utils/storage';

const settings = { sound: false, showWelcome: false };
function fixture(): SavedGame {
  return { version: 1, game: createGame({ seed: 'save-test', best: 500 }), settings: { ...settings } };
}

describe('versioned, validated local persistence', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('round-trips the board, partial tray, RNG, settings and gameplay counters', () => {
    const start = fixture().game;
    const block = start.tray[0]!;
    const anchor = getValidPlacements(start.board, block)[0];
    const moved = placePiece(start, block.id, anchor.x, anchor.y)!;
    expect(moved.lastMove).not.toBeNull();
    expect(saveGame(moved, { sound: true, showWelcome: false })).toBe(true);
    const loaded = loadSave()!;
    expect(loaded.game).toEqual({ ...moved, lastMove: null });
    expect(loaded.settings).toEqual({ sound: true, showWelcome: false });
    expect(loaded.game).not.toBe(moved);
    let resumed = loaded.game;
    let uninterrupted = moved;
    for (const remaining of moved.tray) {
      if (!remaining) continue;
      const target = getValidPlacements(resumed.board, remaining)[0];
      resumed = placePiece(resumed, remaining.id, target.x, target.y)!;
      uninterrupted = placePiece(uninterrupted, remaining.id, target.x, target.y)!;
      expect(resumed).toEqual(uninterrupted);
    }
    expect(resumed.tray.every(Boolean)).toBe(true);
    expect(resumed.rngState).not.toBe(moved.rngState);
  });

  it('returns null for missing data, corrupt JSON and incompatible saved versions', () => {
    expect(loadSave()).toBeNull();
    for (const raw of ['{broken', 'null', '[]', '{"version":0}', '"not a save"']) {
      values.set(STORAGE_KEY, raw);
      expect(loadSave()).toBeNull();
    }
    expect(validateSave(undefined)).toBeNull();
  });

  const invalidCases: [string, (save: SavedGame) => void][] = [
    ['wrong save version', (save) => { (save as { version: number }).version = 2; }],
    ['wrong game version', (save) => { (save.game as { version: number }).version = 2; }],
    ['wrong board height', (save) => { save.game.board.pop(); }],
    ['wrong board width', (save) => { save.game.board[0].pop(); }],
    ['invalid board color', (save) => { save.game.board[0][0] = { color: 'teal' as BlockColor }; }],
    ['negative score', (save) => { save.game.score = -1; }],
    ['non-finite score', (save) => { save.game.score = Infinity; }],
    ['fractional moves', (save) => { save.game.moves = 0.5; }],
    ['best below score', (save) => { save.game.score = 501; }],
    ['impossible combo', (save) => { save.game.combo = 1; }],
    ['negative line count', (save) => { save.game.totalLines = -1; }],
    ['empty seed', (save) => { save.game.seed = ''; }],
    ['negative RNG state', (save) => { save.game.rngState = -1; }],
    ['oversized RNG state', (save) => { save.game.rngState = 0x100000000; }],
    ['non-finite RNG state', (save) => { save.game.rngState = NaN; }],
    ['wrong difficulty', (save) => { save.game.difficulty = 'expert' as Difficulty; }],
    ['wrong mode', (save) => { save.game.mode = 'timed' as GameMode; }],
    ['inconsistent status', (save) => { save.game.status = 'over'; }],
    ['wrong tray length', (save) => { save.game.tray.pop(); }],
    ['no remaining pieces', (save) => { save.game.tray = [null, null, null]; }],
    ['duplicated piece IDs', (save) => { save.game.tray[1]!.id = save.game.tray[0]!.id; }],
    ['unknown shape', (save) => { save.game.tray[0]!.shapeId = 'unknown'; }],
    ['invalid piece color', (save) => { save.game.tray[0]!.color = 'pink' as BlockColor; }],
    ['shape cells mismatch', (save) => { save.game.tray[0]!.cells = [{ x: 99, y: 99 }]; }],
    ['fractional shape cells', (save) => { save.game.tray[0]!.cells[0].x += 0.5; }],
    ['duplicated shape cells', (save) => { const cells = save.game.tray[0]!.cells; cells.push({ ...cells[0] }); }],
  ];
  it.each(invalidCases)('rejects %s', (_label, mutate) => {
    const save = fixture();
    mutate(save);
    expect(validateSave(save)).toBeNull();
    values.set(STORAGE_KEY, JSON.stringify(save));
    expect(loadSave()).toBeNull();
  });

  it('validates settings and ignores unknown or transient properties', () => {
    const save = fixture();
    expect(validateSave({ ...save, settings: { sound: 'yes', showWelcome: false } })).toBeNull();
    expect(validateSave({ ...save, settings: { sound: false } })).toBeNull();
    expect(validateSave({ ...save, arbitrary: 'ignored' })).toEqual(save);
    const hostile = Object.defineProperty({}, 'version', { get: () => { throw new Error('getter'); } });
    expect(validateSave(hostile)).toBeNull();
  });

  it('keeps the best score when clearing or replacing saved progress', () => {
    const save = fixture();
    expect(saveGame(save.game, settings)).toBe(true);
    expect(loadBest()).toBe(500);
    expect(saveBest(100)).toBe(true);
    expect(loadBest()).toBe(500);
    expect(clearSave()).toBe(true);
    expect(loadSave()).toBeNull();
    expect(loadBest()).toBe(500);
    expect(values.has(BEST_STORAGE_KEY)).toBe(true);
    expect(saveBest(-1)).toBe(false);
    values.set(BEST_STORAGE_KEY, 'garbage');
    expect(loadBest()).toBe(0);
  });

  it('gracefully handles disabled browser storage and unavailable browser APIs', () => {
    const save = fixture();
    const blocked = Object.defineProperty({}, 'localStorage', { get: () => { throw new Error('SecurityError'); } });
    vi.stubGlobal('window', blocked);
    expect(loadSave()).toBeNull();
    expect(saveGame(save.game, settings)).toBe(false);
    expect(clearSave()).toBe(false);
    expect(loadBest()).toBe(0);
    expect(saveBest(500)).toBe(false);
    vi.stubGlobal('window', undefined);
    expect(loadSave()).toBeNull();
    expect(saveGame(save.game, settings)).toBe(false);
  });

  it('handles storage quota failures without destroying the previous saved game', () => {
    const save = fixture();
    saveGame(save.game, settings);
    const original = values.get(STORAGE_KEY);
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    } });
    expect(saveGame(createGame({ seed: 'different-run' }), settings)).toBe(false);
    expect(values.get(STORAGE_KEY)).toBe(original);
  });
});
