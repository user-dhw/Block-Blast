import type { CellOffset, Piece } from '../game/types';

export function pieceBounds(piece: Pick<Piece, 'cells'>) {
  return { width: Math.max(...piece.cells.map(c => c.x)) + 1, height: Math.max(...piece.cells.map(c => c.y)) + 1 };
}

export function boardMetrics(board: HTMLElement) {
  const rect = (board.firstElementChild as HTMLElement).getBoundingClientRect();
  const second = (board.children[1] as HTMLElement).getBoundingClientRect();
  const stride = second.left - rect.left;
  return { rect, gap: stride - rect.width, cell: rect.width, stride };
}

export function pointerPlacement(board: HTMLElement, piece: Piece, clientX: number, clientY: number, touch: boolean) {
  const { rect, gap, cell, stride } = boardMetrics(board);
  const { width, height } = pieceBounds(piece);
  const left = clientX - (width * stride - gap) / 2;
  const top = clientY - (height * stride - gap) / 2 - (touch ? 68 : 16);
  const target: CellOffset = { x: Math.floor((left - rect.left + stride / 2) / stride), y: Math.floor((top - rect.top + stride / 2) / stride) };
  return { left, top, cell, gap, target };
}
