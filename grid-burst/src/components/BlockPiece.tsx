import type { CSSProperties } from 'react';
import type { Piece } from '../game/types';
import { pieceBounds } from '../utils/coordinates';

export default function BlockPiece({ piece, cellSize, gap }: { piece: Piece; cellSize?: number; gap?: number }) {
  const { width, height } = pieceBounds(piece);
  const filled = new Set(piece.cells.map(c => `${c.x},${c.y}`));
  const style = { '--piece-cols': width, '--piece-rows': height, ...(cellSize ? { '--piece-cell-size': `${cellSize}px` } : {}), ...(gap !== undefined ? { gap: `${gap}px` } : {}) } as CSSProperties;
  return <span className="piece-grid" style={style} aria-hidden="true">{Array.from({ length: width * height }, (_, i) => <span key={i} className={filled.has(`${i % width},${Math.floor(i / width)}`) ? `piece-cell tile ${piece.color}` : 'piece-empty'} />)}</span>;
}
