import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { breakThrough, createGame, placePiece } from '../game/gameEngine';
import { getValidPlacements } from '../game/placement';
import { rotateShapeCells } from '../game/rotation';
import { SHAPES } from '../game/shapes';
import { PICKAXE_USES } from '../game/types';
import type { BlockColor, Difficulty, GameMode, Piece, SavedGame } from '../game/types';
import { BEST_STORAGE_KEY, clearSave, FREEPLAY_BEST_STORAGE_KEY, loadBest, loadSave, saveBest, saveGame, STORAGE_KEY, validateSave } from '../utils/storage';

const settings = { sound: false, showWelcome: false };
function fixture(): SavedGame {
  return { version: 2, game: createGame({ seed: 'save-test', best: 500 }), settings: { ...settings } };
}

function rotatedPiece(rotation: 0 | 1 | 2 | 3 = 1): Piece {
  const shape = SHAPES.find((item) => item.id === 'l-4-n')!;
  return { id: 'rotated-piece', shapeId: shape.id, color: shape.color,
    cells: rotateShapeCells(shape.cells, rotation), rotation };
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
    expect(loaded.version).toBe(2);
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

  it.each([0, 1, 2, 3, 4, 5])('round-trips %s remaining rescue uses', (pickaxesLeft) => {
    const save = fixture();
    save.game.pickaxesLeft = pickaxesLeft;
    expect(saveGame(save.game, save.settings)).toBe(true);
    expect(loadSave()?.game.pickaxesLeft).toBe(pickaxesLeft);
  });

  it('restores breakthrough placement and its remaining allowance without replaying effects', () => {
    const start = fixture().game;
    const piece = start.tray[0]!;
    const cell = piece.cells[0];
    start.board[cell.y][cell.x] = { color: 'blue' };
    const used = breakThrough(start, piece.id, 0, 0)!;
    expect(saveGame(used, settings)).toBe(true);
    expect(loadSave()?.game).toEqual({ ...used, lastMove: null });
    expect(loadSave()?.game.pickaxesLeft).toBe(PICKAXE_USES - 1);
  });

  it('migrates old v1 saves without losing progress, settings or the separate best score', () => {
    const start = fixture().game;
    const piece = start.tray[0]!;
    const target = getValidPlacements(start.board, piece)[0];
    const moved = placePiece(start, piece.id, target.x, target.y)!;
    const legacyGame: Partial<SavedGame['game']> = { ...moved };
    delete legacyGame.pickaxesLeft;
    const legacy = { version: 1, game: legacyGame, settings: { sound: true, showWelcome: false } };
    values.set(STORAGE_KEY, JSON.stringify(legacy));
    saveBest(1000);
    const loaded = loadSave()!;
    expect(loaded.game).toEqual({ ...moved, pickaxesLeft: PICKAXE_USES, lastMove: null });
    expect(loaded.settings).toEqual(legacy.settings);
    expect(loadBest()).toBe(1000);
    expect(saveGame(loaded.game, loaded.settings)).toBe(true);
    expect(JSON.parse(values.get(STORAGE_KEY)!).version).toBe(2);
    expect(JSON.parse(values.get(STORAGE_KEY)!).game.pickaxesLeft).toBe(PICKAXE_USES);
    expect(loadBest()).toBe(1000);
  });

  it.each([0, 1, 2, 3])('adds two charges once to a legacy three-use run with %s remaining', (remaining) => {
    const save = fixture();
    values.set(STORAGE_KEY, JSON.stringify({ ...save, version: 1,
      game: { ...save.game, pickaxesLeft: remaining } }));
    const migrated = loadSave()!;
    expect(migrated.version).toBe(2);
    expect(migrated.game.pickaxesLeft).toBe(remaining + 2);
    expect(validateSave(migrated)).toEqual(migrated);
    expect(saveGame(migrated.game, migrated.settings)).toBe(true);
    expect(JSON.parse(values.get(STORAGE_KEY)!).version).toBe(2);
    expect(loadSave()?.game.pickaxesLeft).toBe(remaining + 2);
    const afterUse = { ...migrated.game, pickaxesLeft: remaining + 1 };
    expect(saveGame(afterUse, migrated.settings)).toBe(true);
    expect(loadSave()?.game.pickaxesLeft).toBe(remaining + 1);
  });

  it.each([null, undefined, '3', -1, 4, 5, 0.5, NaN, Infinity])('rejects invalid legacy allowance %s', (pickaxesLeft) => {
    const save = fixture();
    expect(validateSave({ ...save, version: 1, game: { ...save.game, pickaxesLeft } })).toBeNull();
  });

  it.each([null, undefined, '5', -1, 6, 0.5, NaN, Infinity])('rejects an explicit invalid v2 rescue allowance %s', (pickaxesLeft) => {
    const save = fixture();
    expect(validateSave({ ...save, game: { ...save.game, pickaxesLeft } })).toBeNull();
  });

  it('requires a rescue allowance in the new save version', () => {
    const save = fixture();
    const partial: Partial<SavedGame['game']> = { ...save.game };
    delete partial.pickaxesLeft;
    expect(validateSave({ ...save, game: partial })).toBeNull();
  });

  it.each([0, 1, 2, 3] as const)('round-trips freeplay piece rotation %s', (rotation) => {
    const game = createGame({ seed: 'rotated-save', mode: 'freeplay', best: 120 });
    game.tray[0] = rotatedPiece(rotation);
    expect(saveGame(game, settings)).toBe(true);
    expect(loadSave()?.game).toEqual(game);
    expect(loadSave()?.game.tray[0]?.rotation).toBe(rotation);
  });

  it('retains optional unrotated payloads without introducing rotation fields', () => {
    const save = fixture();
    expect(save.game.tray.some((piece) => piece && 'rotation' in piece)).toBe(false);
    expect(validateSave(save)).toEqual(save);
  });

  it.each(['classic', 'challenge'] as const)('rejects rotated pieces in %s, including symmetric rotations', (mode) => {
    const game = createGame({ seed: 'standard-rules', mode });
    game.tray[0] = rotatedPiece();
    expect(validateSave({ version: 2, game, settings })).toBeNull();
    const single = SHAPES.find((shape) => shape.id === 'single')!;
    game.tray[0] = { id: 'symmetric', shapeId: single.id, cells: single.cells, color: single.color, rotation: 2 };
    expect(validateSave({ version: 2, game, settings })).toBeNull();
  });

  it.each([null, undefined, '1', -1, 4, 0.5, NaN, Infinity])('rejects malformed rotation %s', (rotation) => {
    const game = createGame({ seed: 'bad-rotation', mode: 'freeplay' });
    game.tray[0] = rotatedPiece();
    expect(validateSave({ version: 2, game: { ...game,
      tray: [{ ...game.tray[0], rotation }, ...game.tray.slice(1)] }, settings })).toBeNull();
  });

  it('rejects rotated cells that do not match their declared orientation', () => {
    const game = createGame({ seed: 'wrong-orientation', mode: 'freeplay' });
    const piece = rotatedPiece(1);
    game.tray[0] = { ...piece, rotation: 2 };
    expect(validateSave({ version: 2, game, settings })).toBeNull();
    game.tray[0] = { ...piece, cells: piece.cells.map((cell) => ({ x: cell.x + 1, y: cell.y })) };
    expect(validateSave({ version: 2, game, settings })).toBeNull();
  });

  it('keeps blocked freeplay saves playing and requires casual difficulty', () => {
    const game = createGame({ seed: 'blocked-freeplay', mode: 'freeplay' });
    game.board = game.board.map((row) => row.map(() => ({ color: 'blue' as const })));
    expect(saveGame(game, settings)).toBe(true);
    expect(loadSave()?.game).toEqual(game);
    expect(validateSave({ version: 2, game: { ...game, status: 'over' }, settings })).toBeNull();
    expect(validateSave({ version: 2, game: { ...game, difficulty: 'normal' }, settings })).toBeNull();
  });

  it('retains terminal saves even when pickaxe charges remain', () => {
    const save = fixture();
    save.game.board = save.game.board.map((row) => row.map(() => ({ color: 'blue' as const })));
    save.game.status = 'over';
    expect(save.game.pickaxesLeft).toBe(PICKAXE_USES);
    expect(saveGame(save.game, save.settings)).toBe(true);
    expect(loadSave()?.game).toEqual(save.game);
  });

  const invalidCases: [string, (save: SavedGame) => void][] = [
    ['wrong save version', (save) => { (save as { version: number }).version = 3; }],
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

  it('separates freeplay bests from the shared classic and challenge record', () => {
    expect(saveBest(900, 'classic')).toBe(true);
    expect(loadBest('challenge')).toBe(900);
    expect(loadBest('freeplay')).toBe(0);
    expect(saveBest(1400, 'freeplay')).toBe(true);
    expect(loadBest()).toBe(900);
    expect(loadBest('freeplay')).toBe(1400);
    expect(saveBest(1200, 'freeplay')).toBe(true);
    expect(loadBest('freeplay')).toBe(1400);
    expect(saveGame(createGame({ seed: 'fun-best', mode: 'freeplay', best: 1700 }), settings)).toBe(true);
    expect(loadBest()).toBe(900);
    expect(loadBest('freeplay')).toBe(1700);
    expect(saveGame(createGame({ seed: 'standard-best', mode: 'challenge', best: 1000 }), settings)).toBe(true);
    expect(loadBest()).toBe(1000);
    expect(loadBest('freeplay')).toBe(1700);
    expect(clearSave()).toBe(true);
    expect(values.has(BEST_STORAGE_KEY)).toBe(true);
    expect(values.has(FREEPLAY_BEST_STORAGE_KEY)).toBe(true);
    expect(loadBest('classic')).toBe(1000);
    expect(loadBest('freeplay')).toBe(1700);
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
