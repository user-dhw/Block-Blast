import { useCallback, useEffect, useRef, useState } from 'react';
import { breakThrough, createGame, placePiece, rerollTray, restartGame, rotatePiece } from '../game/gameEngine';
import type { GameOptions, GameState, Settings } from '../game/types';
import { loadBest, loadSave, saveGame } from '../utils/storage';

function initialState() {
  const saved = loadSave();
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed')?.trim().slice(0, 128);
  const modeParam = params.get('mode');
  const mode = modeParam === 'classic' || modeParam === 'freeplay' ? modeParam : 'challenge';
  const difficultyParam = params.get('difficulty');
  const difficulty = mode === 'freeplay' ? 'casual' : difficultyParam === 'casual' || difficultyParam === 'hard' ? difficultyParam : 'normal';
  const useSaved = saved && (!seed || (saved.game.seed === seed && saved.game.mode === mode && saved.game.difficulty === difficulty));
  const targetMode = seed ? mode : saved?.game.mode ?? 'classic';
  const sharesBest = (saved?.game.mode === 'freeplay') === (targetMode === 'freeplay');
  const best = Math.max(sharesBest ? saved?.game.best ?? 0 : 0, loadBest(targetMode));
  const game = useSaved ? { ...saved.game, best: Math.max(saved.game.best, best) } : createGame({ best, ...(seed ? { seed, mode, difficulty } : {}) });
  return { game, settings: saved?.settings ?? { sound: false, showWelcome: false } };
}

export function useGame() {
  const [initial] = useState(initialState);
  const [game, setGame] = useState<GameState>(initial.game);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const stateRef = useRef(game);
  stateRef.current = game;

  useEffect(() => { setStorageAvailable(saveGame(game, settings)); }, [game, settings]);

  const place = useCallback((id: string, x: number, y: number) => {
    const next = placePiece(stateRef.current, id, x, y);
    if (next) { stateRef.current = next; setGame(next); }
    return next;
  }, []);

  const restart = useCallback((options: GameOptions = {}) => {
    const targetMode = options.mode ?? stateRef.current.mode;
    const next = restartGame(stateRef.current, { ...options, best: Math.max(options.best ?? 0, loadBest(targetMode)) });
    stateRef.current = next;
    setGame(next);
  }, []);

  const rescue = useCallback((pieceId: string, x: number, y: number) => {
    const next = breakThrough(stateRef.current, pieceId, x, y);
    if (next) { stateRef.current = next; setGame(next); }
    return next;
  }, []);

  const rotate = useCallback((pieceId: string) => {
    const next = rotatePiece(stateRef.current, pieceId);
    if (next) { stateRef.current = next; setGame(next); }
    return next;
  }, []);

  const shuffle = useCallback(() => {
    const next = rerollTray(stateRef.current);
    if (next) { stateRef.current = next; setGame(next); }
    return next;
  }, []);

  return { game, settings, setSettings, place, rescue, rotate, shuffle, restart, storageAvailable };
}
