import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Piece } from '../game/types';
import { pointerPlacement } from '../utils/coordinates';

type DragVisual = ReturnType<typeof pointerPlacement> & { piece: Piece };
type ActivePointer = { id: number; piece: Piece; x: number; y: number; touch: boolean; moved: boolean };

export function usePointerDrag(
  boardRef: RefObject<HTMLDivElement | null>,
  onPlace: (id: string, x: number, y: number) => void,
  onSelect: (id: string) => void,
  enabled: boolean,
) {
  const [drag, setDrag] = useState<DragVisual | null>(null);
  const active = useRef<ActivePointer | null>(null);
  const frame = useRef<number>(0);
  const latest = useRef({ onPlace, onSelect, enabled });
  latest.current = { onPlace, onSelect, enabled };

  const cancel = useCallback(() => {
    active.current = null;
    cancelAnimationFrame(frame.current);
    setDrag(null);
  }, []);

  useEffect(() => {
    if (!enabled) cancel();
    return () => cancelAnimationFrame(frame.current);
  }, [enabled, cancel]);

  const onPiecePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, piece: Piece) => {
    if (!latest.current.enabled || active.current || event.button !== 0) return;
    latest.current.onSelect(piece.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { id: event.pointerId, piece, x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch', moved: false };
  };

  const onPiecePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = active.current;
    const board = boardRef.current;
    if (!current || current.id !== event.pointerId || !board) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5 && !current.moved) return;
    current.moved = true;
    const visual = { ...pointerPlacement(board, current.piece, event.clientX, event.clientY, current.touch), piece: current.piece };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setDrag(visual));
  };

  const onPiecePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = active.current;
    if (!current || current.id !== event.pointerId) return;
    const moved = current.moved;
    const board = boardRef.current;
    cancel();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (moved && board && latest.current.enabled) {
      const { target } = pointerPlacement(board, current.piece, event.clientX, event.clientY, current.touch);
      latest.current.onPlace(current.piece.id, target.x, target.y);
    }
  };

  return { drag, cancel, onPiecePointerDown, onPiecePointerMove, onPiecePointerUp, onPiecePointerCancel: cancel };
}
