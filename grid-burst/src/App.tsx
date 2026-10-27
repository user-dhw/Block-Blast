import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import BlockPiece from './components/BlockPiece';
import Icon from './components/Icon';
import Modal from './components/Modal';
import { clearLines } from './game/clearing';
import { getPlacementObstacles, getValidPlacements } from './game/placement';
import { getComboMultiplier } from './game/scoring';
import { PICKAXE_USES } from './game/types';
import type { CellOffset, Difficulty, GameOptions, GameState, MoveFeedback } from './game/types';
import { useGame } from './hooks/useGame';
import { usePointerDrag } from './hooks/usePointerDrag';
import { useSound } from './hooks/useSound';
import { clearSave } from './utils/storage';

type Dialog = 'help' | 'settings' | 'restart' | 'over' | null;
type RescueTarget = CellOffset & { pieceId: string };
const format = (value: number) => value.toLocaleString('en-US');
const formatBlockers = (count: number) => `${count} blocker${count === 1 ? '' : 's'}`;
const difficultyLabels: Record<Difficulty, string> = { casual: 'Casual', normal: 'Normal', hard: 'Hard' };

export default function App() {
  const { game, settings, setSettings, place, rescue, rotate, shuffle, restart, storageAvailable } = useGame();
  const isFreeplay = game.mode === 'freeplay';
  const [dialog, setDialog] = useState<Dialog>(game.status === 'over' ? 'over' : null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<CellOffset | null>(null);
  const [keyboardCell, setKeyboardCell] = useState({ x: 0, y: 0 });
  const [pending, setPending] = useState<GameOptions>({});
  const [seedInput, setSeedInput] = useState(game.seed);
  const [effects, setEffects] = useState<(MoveFeedback & { key: number }) | null>(null);
  const [message, setMessage] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [rescueActive, setRescueActive] = useState(false);
  const [rescueTarget, setRescueTarget] = useState<RescueTarget | null>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const lockUntil = useRef(0);
  const effectId = useRef(0);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, delay);
    timers.current.add(timer);
    return timer;
  }, []);
  const cancelEndTimer = useCallback(() => {
    if (endTimer.current !== null) {
      clearTimeout(endTimer.current); timers.current.delete(endTimer.current); endTimer.current = null;
    }
  }, []);
  const showDialog = useCallback((next: Dialog) => {
    cancelEndTimer(); setDialog(next);
  }, [cancelEndTimer]);
  const play = useSound(settings.sound);
  const closeDialog = useCallback(() => showDialog(null), [showDialog]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const finishMove = useCallback((next: GameState) => {
    setSelected(null); setHover(null); setRescueTarget(null); setRescueActive(false);
    cancelEndTimer();
    const feedback = next.lastMove;
    if (feedback) {
      lockUntil.current = Date.now() + (feedback.lines ? 480 : 100);
      const key = ++effectId.current;
      setEffects({ ...feedback, key });
      const removed = feedback.removedPositions?.length ?? 0;
      setMessage(removed ? `Cleared ${formatBlockers(removed)} and placed the piece. ${next.mode === 'freeplay' ? 'Unlimited rescue uses.' : `${next.pickaxesLeft} rescue uses left.`} ${feedback.lines} lines cleared.`
        : feedback.lines ? (feedback.combo > 1 ? `COMBO ×${feedback.combo}!` : feedback.lines > 1 ? 'EXCELLENT!' : 'NICE CLEAR!') : `${feedback.placed.length} blocks. A little closer.`);
      play(feedback.lines ? feedback.combo > 1 ? 'combo' : 'clear' : removed ? 'clear' : 'place');
      if (feedback.lines && settings.sound) { try { navigator.vibrate?.(16); } catch { /* Optional browser capability. */ } }
      later(() => setEffects(current => current?.key === key ? null : current), 900);
    }
    if (next.status === 'over') endTimer.current = later(() => { play('over'); showDialog('over'); }, 550);
  }, [cancelEndTimer, play, settings.sound, later, showDialog]);

  const attemptPlace = useCallback((id: string, x: number, y: number) => {
    if (dialog || Date.now() < lockUntil.current) return;
    const next = place(id, x, y);
    if (!next) {
      play('invalid'); setInvalid(true);
      setMessage('A little more space — try another spot.');
      later(() => setInvalid(false), 320);
      return;
    }
    finishMove(next);
  }, [dialog, place, play, later, finishMove]);

  const stageRescue = useCallback((id: string, x: number, y: number) => {
    if (dialog || Date.now() < lockUntil.current) return;
    const item = game.tray.find(item => item?.id === id);
    if (!item) return;
    const obstacles = getPlacementObstacles(game.board, item, x, y);
    if (obstacles === null) {
      setRescueTarget(null); play('invalid');
      setMessage('Keep the whole piece inside the grid. No rescue use was spent.');
      return;
    }
    if (obstacles.length === 0) { attemptPlace(id, x, y); return; }
    cancelEndTimer(); setSelected(id); setHover({ x, y });
    setRescueTarget({ pieceId: id, x, y });
    setMessage(`Preview: remove ${formatBlockers(obstacles.length)} and place this piece. ${isFreeplay ? 'Confirm Break & place for a free rescue.' : 'Confirm Break & place to spend one rescue use, or cancel for free.'}`);
    later(() => confirmRef.current?.focus({ preventScroll: true }), 0);
  }, [dialog, game.tray, game.board, attemptPlace, cancelEndTimer, play, later, isFreeplay]);

  const selectPiece = useCallback((id: string) => {
    setSelected(id); setHover(null); setRescueTarget(null); play('pickup');
    setMessage(rescueActive ? 'Choose a position on the grid. Blocking cells will be previewed before you confirm.' : 'Choose a spot on the grid. Arrow keys move; Enter places.');
  }, [play, rescueActive]);
  const attemptAction = useCallback((id: string, x: number, y: number) => {
    if (rescueActive) stageRescue(id, x, y);
    else if (isFreeplay) {
      if (dialog || Date.now() < lockUntil.current) return;
      const next = place(id, x, y) ?? rescue(id, x, y);
      if (next) finishMove(next);
      else { play('invalid'); setMessage('Keep the whole piece inside the grid. Try another spot.'); }
    } else attemptPlace(id, x, y);
  }, [rescueActive, stageRescue, attemptPlace, isFreeplay, dialog, place, rescue, finishMove, play]);
  const pointer = usePointerDrag(boardRef, attemptAction, selectPiece, !dialog && (game.status === 'playing' || rescueActive));
  const piece = pointer.drag?.piece ?? game.tray.find(item => item?.id === selected) ?? null;
  const target = rescueTarget ?? pointer.drag?.target ?? hover;
  const hasBlocks = game.board.some(row => row.some(Boolean));
  const canUseRescue = (isFreeplay || game.pickaxesLeft > 0) && hasBlocks && game.tray.some(Boolean);
  const toggleRescue = () => {
    if (rescueActive) {
      pointer.cancel(); setRescueActive(false); setRescueTarget(null); setHover(null);
      setMessage('Rescue cancelled. No uses spent.');
      if (game.status === 'over') showDialog('over');
      return;
    }
    if (!canUseRescue) return;
    cancelEndTimer(); pointer.cancel(); setRescueTarget(null); setHover(null); showDialog(null); setRescueActive(true);
    setMessage(`Choose a tray piece, then a position on the grid. Preview and confirm to clear its blockers and place it. ${isFreeplay ? 'Unlimited rescue uses.' : `${game.pickaxesLeft} rescue uses left.`}`);
    later(() => trayRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true }), 0);
  };
  const cancelRescueTarget = () => {
    setRescueTarget(null);
    setMessage('Preview cancelled. Choose another position. No rescue use was spent.');
    if (rescueTarget) {
      const { x, y } = rescueTarget;
      later(() => boardRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${x},${y}"]`)?.focus({ preventScroll: true }), 0);
    }
  };
  const confirmRescue = () => {
    if (!rescueTarget || dialog || Date.now() < lockUntil.current) return;
    const next = rescue(rescueTarget.pieceId, rescueTarget.x, rescueTarget.y);
    if (!next) { setRescueTarget(null); setMessage('This preview is no longer valid. Choose another position. No use was spent.'); return; }
    pointer.cancel(); finishMove(next);
  };
  const preview = useMemo(() => {
    if (!piece || !target) return null;
    const obstacles = getPlacementObstacles(game.board, piece, target.x, target.y);
    const valid = obstacles !== null && (rescueActive || isFreeplay || obstacles.length === 0);
    const positions = new Set(piece.cells.map(cell => `${cell.x + target.x},${cell.y + target.y}`));
    let lines = new Set<string>();
    if (valid) {
      const board = game.board.map(row => [...row]);
      for (const cell of obstacles) board[cell.y][cell.x] = null;
      piece.cells.forEach(cell => { board[cell.y + target.y][cell.x + target.x] = { color: piece.color }; });
      lines = new Set(clearLines(board).clearedPositions.map(cell => `${cell.x},${cell.y}`));
    }
    return { valid, positions, lines, obstacles: new Set(rescueActive || isFreeplay ? obstacles?.map(cell => `${cell.x},${cell.y}`) ?? [] : []) };
  }, [game.board, piece, target, rescueActive, isFreeplay]);

  const start = (options: GameOptions = {}) => {
    timers.current.forEach(clearTimeout); timers.current.clear(); setInvalid(false);
    pointer.cancel(); lockUntil.current = 0;
    endTimer.current = null; setRescueActive(false); setRescueTarget(null);
    restart(options); setSelected(null); setHover(null); setEffects(null); showDialog(null); setMessage('A fresh grid. Endless possibilities.');
    if (window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
  };
  const requestNew = (options: GameOptions = {}) => {
    if (game.moves === 0 && game.pickaxesLeft === PICKAXE_USES && !options.seed) start(options);
    else { setPending(options); showDialog('restart'); }
  };
  const modeButtons = <><button className={game.mode === 'classic' ? 'active' : ''} onClick={() => requestNew({ mode: 'classic' })}><Icon name="grid" />Classic</button><button className={game.mode === 'challenge' ? 'active' : ''} onClick={() => requestNew({ mode: 'challenge' })}><Icon name="sparkles" />Challenge</button><button className={`freeplay-tab ${isFreeplay ? 'active' : ''}`} onClick={() => requestNew({ mode: 'freeplay' })}><Icon name="sparkles" />Free Play</button></>;

  const rotateSelected = () => {
    if (dialog || Date.now() < lockUntil.current) return;
    const id = selected ?? game.tray.find(item => item !== null)?.id;
    if (!id) return;
    pointer.cancel();
    if (!rotate(id)) return;
    cancelEndTimer(); setRescueTarget(null); setHover(null); setEffects(null); setSelected(id);
    setMessage('Piece rotated 90 degrees. Rotation is free. Choose a spot on the grid.'); play('pickup');
  };
  const shufflePieces = () => {
    if (dialog || Date.now() < lockUntil.current) return;
    pointer.cancel();
    if (!shuffle()) return;
    cancelEndTimer(); setRescueTarget(null); setHover(null); setEffects(null); setSelected(null);
    setMessage('Fresh pieces, same grid. Shuffle as often as you like.'); play('pickup');
  };

  const onBoardKey = (event: KeyboardEvent<HTMLButtonElement>, x: number, y: number) => {
    const direction: Record<string, CellOffset> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
    if (event.key === 'Escape') return;
    const offset = direction[event.key];
    if (!offset) return;
    event.preventDefault();
    const next = { x: Math.max(0, Math.min(7, x + offset.x)), y: Math.max(0, Math.min(7, y + offset.y)) };
    setRescueTarget(null); setKeyboardCell(next); setHover(next);
    boardRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${next.x},${next.y}"]`)?.focus();
  };
  const shareSeed = () => {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ seed: game.seed, mode: game.mode, difficulty: game.difficulty }).toString();
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(url.href).then(() => setMessage('Replay link copied. Share a little challenge.')).catch(() => { setSeedInput(url.href); showDialog('settings'); });
    else { setSeedInput(url.href); showDialog('settings'); }
  };

  return <div className={`app-shell ${isFreeplay ? 'freeplay-mode' : ''}`} onKeyDown={event => {
    if (event.key !== 'Escape' || dialog) return;
    if (rescueTarget) { cancelRescueTarget(); return; }
    setSelected(null); setHover(null);
    if (rescueActive) {
      pointer.cancel(); setRescueActive(false); setMessage('Rescue cancelled. No uses spent.');
      if (game.status === 'over') showDialog('over');
    }
  }}>
    <header className="site-header">
      <a className="brand" href="#" aria-label="Grid Burst home" onClick={event => event.preventDefault()}><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span className="brand-name">grid<span>burst</span><span className="brand-dot">.</span></span><span className="brand-tagline">A LITTLE PLAY GOES A LONG WAY</span></a>
      <nav className="header-actions" aria-label="Game options"><button className="text-button how-to-button" onClick={() => showDialog('help')}><Icon name="help" />How to play</button><span className="nav-divider" /><button className={`icon-button ${settings.sound ? 'sound-on' : ''}`} aria-label={settings.sound ? 'Mute sound' : 'Enable sound'} aria-pressed={settings.sound} onClick={() => setSettings(current => ({ ...current, sound: !current.sound }))}><Icon name={settings.sound ? 'sound' : 'muted'} /></button><button className="icon-button" aria-label="Open settings" onClick={() => { setSeedInput(game.seed); showDialog('settings'); }}><Icon name="settings" /></button></nav>
    </header>

    <main className="workspace">
      <aside className="intro-panel">
        <div className="eyebrow"><span className="status-dot" />YOUR DAILY DOSE OF FLOW</div>
        <h1 className="hero-title">Small blocks.<br />Big <span className="text-lime">possibilities.</span></h1>
        <p className="hero-copy">Clear your grid.<br />Clear your mind.</p>
        <p className="intro-description">Find the perfect fit, make a little space, and see how far you can go.</p>
        <div className="mode-section"><span className="section-kicker">FIND YOUR FLOW</span><div className="mode-switch" aria-label="Game mode">{modeButtons}</div><p className="mode-description">{isFreeplay ? 'Play anywhere. Unlimited rescues, free rotation and endless fresh pieces. Your fun best is saved separately.' : game.mode === 'classic' ? 'An empty grid. A fresh start. All yours.' : 'A new starting point. The same possibilities.'}</p></div>
        {!isFreeplay && <label className="difficulty-select"><span>Difficulty</span><select aria-label="Difficulty" value={game.difficulty} onChange={event => requestNew({ difficulty: event.target.value as Difficulty })}><option value="casual">Casual</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>}
        <div className="daily-note"><Icon name="leaf" /><span>No timer. No rush.<br /><strong>Just one more good move.</strong></span></div>
      </aside>

      <section className="game-panel" aria-label="Grid Burst game">
        <div className="mobile-modes"><div className="mode-switch" aria-label="Mobile game mode">{modeButtons}</div></div>
        <div className="game-topbar"><span className="live-label"><span className="status-dot" />{isFreeplay ? 'FREE PLAY' : game.mode === 'classic' ? 'CLASSIC MODE' : 'RANDOM CHALLENGE'}</span><div className="board-tools"><span className="difficulty-tag">{isFreeplay ? 'Just for fun' : difficultyLabels[game.difficulty]}</span><button className="icon-button small" aria-label="Pause game" onClick={() => { setSeedInput(game.seed); showDialog('settings'); }}><Icon name="pause" /></button></div></div>
        <div className="score-panel"><div className="current-score"><span className="score-label">YOUR SCORE</span><strong className="score-number">{format(game.score)}</strong></div><div className="best-score"><span className="score-label"><Icon name="crown" className="crown-icon" />{isFreeplay ? 'FUN BEST' : 'PERSONAL BEST'}</span><strong>{format(game.best)}</strong></div></div>

        <div className={`board-wrap ${invalid ? 'invalid-shake' : ''}`}>
          <div className="board-frame"><div className={`game-board ${rescueActive ? 'rescue-targeting' : ''}`} ref={boardRef} role="group" aria-label="8 by 8 puzzle board" onPointerLeave={() => { if (!pointer.drag) setHover(null); }}>
            {game.board.flatMap((row, y) => row.map((cell, x) => {
              const key = `${x},${y}`;
              const isPreview = preview?.positions.has(key);
              const placed = effects?.placed.some(item => item.x === x && item.y === y) && !effects.clearedPositions.some(item => item.x === x && item.y === y);
              return <button key={key} type="button" data-cell={key}
                className={`game-cell ${cell ? `tile ${cell.color}` : ''} ${isPreview ? `tile ${piece?.color} ${preview?.valid ? 'preview-valid' : 'preview-invalid'}` : ''} ${preview?.lines.has(key) ? 'preview-line' : ''} ${placed ? 'just-placed' : ''} ${preview?.obstacles.has(key) && preview.valid ? 'preview-obstacle' : ''} ${effects?.removedPositions?.some(item => item.x === x && item.y === y) ? 'hammer-hit' : ''}`}
                aria-label={`Row ${y + 1}, column ${x + 1}, ${cell ? `${cell.color} block${preview?.obstacles.has(key) ? ', blocking selected piece' : ''}` : 'empty'}`}
                tabIndex={keyboardCell.x === x && keyboardCell.y === y ? 0 : -1}
                disabled={!!dialog || (game.status === 'over' && !rescueActive)}
                onFocus={() => { setKeyboardCell({ x, y }); if (selected || rescueActive) setHover({ x, y }); }}
                onPointerEnter={() => { if (!pointer.drag && (selected || rescueActive)) setHover({ x, y }); }}
                onKeyDown={event => onBoardKey(event, x, y)}
                onClick={() => { if (selected) attemptAction(selected, x, y); else setMessage(rescueActive ? 'Select a tray piece to rescue first.' : 'Pick one of the three pieces below to begin.'); }} />;
            }))}
            {effects && effects.clearedPositions.length > 0 && <div className="line-effects" key={`clear-${effects.key}`} aria-hidden="true">{effects.clearedPositions.map((cell, i) => <span className={`clear-flash ${effects.color}`} key={i} style={{ gridColumn: cell.x + 1, gridRow: cell.y + 1 }} />)}</div>}
          </div></div>
          {game.combo > 1 && <span className="combo-badge" key={`combo-${game.moves}`}><Icon name="sparkles" />{getComboMultiplier(game.combo).toFixed(2).replace(/0$/, '')}× COMBO</span>}
          {effects && effects.points > 0 && <div className={`floating-score ${effects.lines ? 'has-clear' : ''}`} key={`score-${effects.key}`} aria-hidden="true">{effects.lines > 0 && <span>{effects.combo > 1 ? `COMBO ×${effects.combo}` : effects.lines > 1 ? 'EXCELLENT!' : 'NICE CLEAR!'}</span>}+{format(effects.points)}</div>}
          {effects && effects.lines > 0 && Array.from({ length: 14 }, (_, i) => <i aria-hidden="true" className="particle" key={`${effects.key}-${i}`} style={{ '--particle-x': `${Math.cos(i * 2.4) * 145}px`, '--particle-y': `${Math.sin(i * 2.4) * 140 - 50}px`, '--particle-rotation': `${i * 63}deg`, animationDelay: `${i * 12}ms` } as CSSProperties} />)}
        </div>

        <div className={`tray-label ${rescueActive ? 'rescue-prompt' : ''}`}><span>{rescueTarget ? 'CONFIRM RESCUE' : rescueActive ? 'RESCUE READY' : 'YOUR NEXT MOVE'}</span><span className="tray-helper">{rescueTarget ? `${formatBlockers(preview?.obstacles.size ?? 0)} · ${isFreeplay ? 'free' : '1 use'}${preview?.lines.size ? ' · line clear' : ''}` : rescueActive ? selected ? 'Choose a spot · preview before confirming' : 'Choose a tray piece to rescue' : selected ? isFreeplay ? 'Tap any spot · free rescue' : 'Choose a place on the grid' : isFreeplay ? 'Place anywhere. No limits.' : 'Drag a block. Find its spot.'}</span></div>
        <div className="piece-tray" ref={trayRef} aria-label="Available pieces">
          {game.tray.map((item, index) => {
            const fits = item ? getValidPlacements(game.board, item).length > 0 : false;
            return <button key={item?.id ?? `used-${index}`} type="button" className={`piece-slot ${item?.id === selected ? 'selected' : ''} ${!item ? 'used' : !fits && !rescueActive && !isFreeplay ? 'unavailable' : ''} ${pointer.drag?.piece.id === item?.id ? 'is-dragging' : ''}`} disabled={!item || (game.status === 'over' && !rescueActive) || !!dialog} aria-label={item ? `Select piece ${index + 1}, ${item.color}, ${item.cells.length} blocks${rescueActive || isFreeplay ? ', rescue available' : fits ? '' : ', no space right now'}` : `Piece ${index + 1} placed`} aria-pressed={!!item && selected === item.id} onPointerDown={event => { if (item) pointer.onPiecePointerDown(event, item); }} onPointerMove={pointer.onPiecePointerMove} onPointerUp={pointer.onPiecePointerUp} onPointerCancel={pointer.onPiecePointerCancel} onLostPointerCapture={pointer.onPiecePointerCancel} onClick={event => { if (event.detail === 0 && item) selectPiece(item.id); }}>
              {item ? <span className="tray-piece"><BlockPiece piece={item} /></span> : <span className="slot-check"><Icon name="check" /></span>}
            </button>;
          })}
        </div>
        {isFreeplay && <div className="freeplay-tools" aria-label="Free play tools">
          <button className="button-secondary" onClick={rotateSelected} disabled={!!dialog} aria-label="Rotate selected piece 90 degrees"><Icon name="rotate" />Rotate</button>
          <button className="button-secondary" onClick={shufflePieces} disabled={!!dialog} aria-label="Shuffle tray for free"><Icon name="shuffle" />New pieces</button>
        </div>}
        <div className="game-controls">
          {rescueTarget ? <>
            <button className="button-secondary rescue-cancel" onClick={cancelRescueTarget}>Cancel</button>
            <button className="button-primary rescue-confirm" ref={confirmRef} onClick={confirmRescue} disabled={!!dialog} aria-label={`Break and place, clear ${formatBlockers(preview?.obstacles.size ?? 0)}, ${isFreeplay ? 'unlimited free rescue' : 'spend one rescue use'}`}><Icon name="hammer" />Break &amp; place</button>
          </> : <>
            <button className={`button-secondary rescue-button ${rescueActive ? 'active' : ''}`} onClick={toggleRescue} disabled={!canUseRescue || !!dialog} aria-pressed={rescueActive} aria-label={`${rescueActive ? 'Cancel' : 'Use'} rescue hammer, ${isFreeplay ? 'unlimited uses' : `${game.pickaxesLeft} of ${PICKAXE_USES} left`}`} title={isFreeplay ? 'Unlimited rescue. Place directly over blockers, or use this button for a preview.' : game.pickaxesLeft === 0 ? 'All five rescue uses spent. Start a new game to refill.' : !hasBlocks ? 'Place a piece first. Rescue clears blockers to fit a selected piece.' : 'Select a piece and position, preview its blockers, then confirm. Five uses per game.'}><Icon name="hammer" /><span>Rescue</span><span className="rescue-count">{isFreeplay ? '∞' : `${game.pickaxesLeft}/${PICKAXE_USES}`}</span></button>
            <button className="button-primary" onClick={() => requestNew()}><Icon name="refresh" />{game.mode === 'challenge' ? 'New challenge' : 'New game'}<Icon name="arrow" /></button>
            <button className="button-secondary help-mobile" aria-label="How to play" onClick={() => showDialog('help')}><Icon name="help" /></button>
          </>}
        </div>
        <div className="keyboard-hint"><Icon name={rescueActive ? 'hammer' : 'keyboard'} /><span>{rescueTarget ? `Clear the highlighted blockers and place this piece? ${isFreeplay ? 'Free in this mode.' : 'One use.'}` : rescueActive ? 'Choose a piece and position. Clear spots cost no uses. Esc cancels.' : 'Or select a block, then tap the grid.'}</span></div>
        <div className="sr-only" role="status" aria-live="polite">{message} Score {game.score}. {game.totalLines} lines cleared.</div>
        {!storageAvailable && <p className="storage-note">Browser storage is unavailable. This run will last until you close the page.</p>}
      </section>

      <aside className="insight-panel">
        <span className="section-kicker">A LITTLE STRATEGY</span>
        <div className="tip-card"><span className="tip-icon"><Icon name="grid" /></span><h2 className="tip-title">Make room for more.</h2><p className="tip-copy">Fill a row or column to clear it. Clear a few at once? Even better.</p><div className="mini-line-demo" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}<Icon name="sparkles" /></div></div>
        <div className="tip-card subtle"><span className="tip-icon"><Icon name="sparkles" /></span><h2 className="tip-title">Keep the good moves going.</h2><p className="tip-copy">Clear lines on consecutive turns to build your combo and boost your score.</p></div>
        <div className="session-card"><span className="section-kicker">THIS LITTLE SESSION</span><div className="stat-row"><span>Lines cleared</span><strong>{format(game.totalLines)}</strong></div><div className="stat-row"><span>Moves made</span><strong>{format(game.moves)}</strong></div><div className="stat-row"><span>Current combo</span><strong className="text-lime">{game.combo > 0 ? `${getComboMultiplier(game.combo).toFixed(2)}×` : 'Let’s start'}</strong></div><button className="seed-chip" title="Copy replay link" onClick={shareSeed}><span>SEED</span><code>{game.seed}</code><Icon name="arrow" /></button></div>
        <p className="right-note"><span className="status-dot" />Your progress saves as you play.</p>
      </aside>
    </main>

    <footer className="site-footer"><span className="footer-note"><span className="footer-dot" />A little break. A brighter mind.</span><span className="footer-right">MADE FOR THE MOMENT<span>✦</span><button className="footer-link" onClick={() => showDialog('help')}>Get in the flow<Icon name="arrow" /></button></span></footer>

    {pointer.drag && <div className="drag-ghost" style={{ left: pointer.drag.left, top: pointer.drag.top }} aria-hidden="true"><BlockPiece piece={pointer.drag.piece} cellSize={pointer.drag.cell} gap={pointer.drag.gap} /></div>}

    {dialog && <Modal label={dialog === 'help' ? 'How to play' : dialog === 'settings' ? 'Game settings' : dialog === 'over' ? 'Game over' : 'Start a new game'} onClose={closeDialog}>
      {dialog === 'help' && <><div className="modal-eyebrow"><Icon name="sparkles" />A LITTLE ROOM TO PLAY</div><h2 className="modal-title">Find your flow.</h2><p className="modal-copy">A simple grid. A satisfying little challenge.</p><ol className="instruction-list"><li><strong>Find the perfect fit.</strong><span>Drag a piece onto the grid, or select it and tap a cell. Classic and Challenge pieces keep their orientation.</span></li><li><strong>Make a little space.</strong><span>Fill any row or column to clear it. Use all three pieces to get a fresh set.</span></li><li><strong>Keep it going.</strong><span>Consecutive line clears build your combo. If no piece fits, use Rescue to break through and place a piece, or start fresh.</span></li><li><strong>A little help, five times.</strong><span>Choose Rescue, select a tray piece, then tap or drag it onto the grid. Orange striped cells show blockers. Confirm Break & place to remove those blockers and place the piece for one use. Clear spots and cancelling cost no uses. Classic and Challenge each have 5 uses, saved with your progress.</span></li><li><strong>Free Play · just for fun.</strong><span>Place directly over blockers with unlimited rescues. Rotate a selected piece, or get a fresh tray whenever you like. There is no game over, and this mode keeps a separate fun best.</span></li></ol><div className="help-scoring">+1 per block · +100 per line · +50 per extra line<br />Clear combo: +0.25× each turn, up to 3×.</div><p className="modal-copy small-copy">Keyboard: Tab to select a piece. Tab to the board, use arrow keys, then Enter to place. Escape clears your selection. No timer, no rush. Free Play also lets you rotate pieces and shuffle the tray for free.</p><button className="button-primary" onClick={closeDialog}>Let’s play<Icon name="arrow" /></button></>}
      {dialog === 'settings' && <><div className="modal-eyebrow">TAKE A BREATHER</div><h2 className="modal-title">Your kind of play.</h2><p className="modal-copy">Your grid is right where you left it.</p><div className="settings-row"><span>Sound effects</span><button className={`switch-button ${settings.sound ? 'active' : ''}`} role="switch" aria-checked={settings.sound} aria-label="Sound effects" onClick={() => setSettings(current => ({ ...current, sound: !current.sound }))}><span />{settings.sound ? 'On' : 'Off'}</button></div>{!isFreeplay && <label className="settings-row"><span>Difficulty</span><select value={game.difficulty} onChange={event => { setPending({ difficulty: event.target.value as Difficulty }); showDialog('restart'); }}><option value="casual">Casual</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label>}<p className="small-copy modal-copy">{isFreeplay ? 'Unlimited rescues, free rotation and free fresh trays. Your fun best is separate from Classic and Challenge.' : <>Casual favors small pieces. Normal checks for a playable tray. Hard uses unscreened weighted randomness.</>}</p><form className="seed-form" onSubmit={event => { event.preventDefault(); let seed = seedInput.trim(); let mode = game.mode; let difficulty = game.difficulty; try { const params = new URL(seed).searchParams; if (params.get('seed')) { seed = params.get('seed')!; const modeParam = params.get('mode'); mode = modeParam === 'classic' || modeParam === 'freeplay' ? modeParam : 'challenge'; const value = params.get('difficulty'); difficulty = value === 'casual' || value === 'hard' ? value : 'normal'; } } catch { /* A plain seed is valid too. */ } if (seed && seed.length <= 128) { setPending({ mode, seed, difficulty }); showDialog('restart'); } else setMessage('Use a seed between 1 and 128 characters.'); }}><label className="seed-input-label" htmlFor="challenge-seed">REPLAY A SEED OR REPLAY LINK</label><input id="challenge-seed" className="seed-input" value={seedInput} maxLength={256} onChange={event => setSeedInput(event.target.value)} required /><button className="button-secondary" type="submit"><Icon name="refresh" />Replay seed</button></form><p className="small-copy modal-copy">Current {game.mode} seed: <code>{game.seed}</code> · Best: {format(game.best)}</p><div className="modal-actions"><button className="button-primary" onClick={closeDialog}>Back to the grid<Icon name="arrow" /></button><button className="text-button reset-button" onClick={() => { setPending({}); showDialog('restart'); }}>Reset saved progress</button></div></>}
      {dialog === 'restart' && <><div className="modal-eyebrow">A FRESH PERSPECTIVE</div><h2 className="modal-title">Ready for a new grid?</h2><p className="modal-copy">This run will end at {format(game.score)} points. Your personal best stays with you.</p>{pending.seed && <p className="replay-seed">Replay seed: <code>{pending.seed}</code></p>}<div className="modal-actions"><button className="button-primary" onClick={() => { clearSave(); start(pending); }}>Start fresh<Icon name="arrow" /></button><button className="button-secondary" onClick={closeDialog}>Keep playing</button></div></>}
      {dialog === 'over' && <><div className="modal-eyebrow"><Icon name="crown" />{game.score >= game.best && game.score > 0 ? 'A NEW PERSONAL BEST' : 'A LITTLE BREAK, WELL SPENT'}</div><h2 className="modal-title">Look at you go.</h2><p className="modal-copy">{canUseRescue ? 'No pieces fit. Use Rescue to place a piece through its blockers. Aim for a line clear, or start fresh.' : 'No more pieces fit. Every good run makes room for another.'}</p><strong className="game-over-score">{format(game.score)}</strong><p className="modal-copy">{game.totalLines} lines cleared · Personal best {format(game.best)}</p><div className="modal-actions">{canUseRescue && <button className="button-secondary rescue-button" onClick={toggleRescue}><Icon name="hammer" />Use Rescue · {game.pickaxesLeft} left</button>}<button className="button-primary" onClick={() => start()}>One more game<Icon name="arrow" /></button><button className="button-secondary" onClick={() => start({ seed: game.seed })}>Replay this seed</button></div></>}
    </Modal>}
  </div>;
}
