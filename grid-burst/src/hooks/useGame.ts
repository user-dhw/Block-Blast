import { useCallback, useEffect, useRef, useState } from 'react';
import { breakThrough, createGame, placePiece, restartGame } from '../game/gameEngine';
import type { GameOptions, GameState, Settings } from '../game/types';
import { loadBest, loadSave, saveGame } from '../utils/storage';

function initialState() {
  const saved = loadSave();
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed')?.trim().slice(0, 128);
  const mode = params.get('mode') === 'classic' ? 'classic' : 'challenge';
  const difficultyParam = params.get('difficulty');
  const difficulty = difficultyParam === 'casual' || difficultyParam === 'hard' ? difficultyParam : 'normal';
  const useSaved = saved && (!seed || (saved.game.seed === seed && saved.game.mode === mode && saved.game.difficulty === difficulty));
  const game = useSaved ? { ...saved.game, best: Math.max(saved.game.best, loadBest()) } : createGame({ best: Math.max(saved?.game.best ?? 0, loadBest()), ...(seed ? { seed, mode, difficulty } : {}) });
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
    const next = restartGame(stateRef.current, options);
    stateRef.current = next;
    setGame(next);
  }, []);

  const rescue = useCallback((pieceId: string, x: number, y: number) => {
    const next = breakThrough(stateRef.current, pieceId, x, y);
    if (next) { stateRef.current = next; setGame(next); }
    return next;
  }, []);

  return { game, settings, setSettings, place, rescue, restart, storageAvailable };
}
