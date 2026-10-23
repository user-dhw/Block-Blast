import { BOARD_SIZE } from './types';
import type { Board, ClearResult } from './types';

/** Inspect the original board before clearing either axis, including intersections once. */
export function clearLines(board: Board): ClearResult {
  const clearedRows: number[] = [];
  const clearedColumns: number[] = [];
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    if (board[index].every((cell) => cell !== null)) clearedRows.push(index);
    if (board.every((row) => row[index] !== null)) clearedColumns.push(index);
  }
  const rows = new Set(clearedRows);
  const columns = new Set(clearedColumns);
  const clearedPositions: ClearResult['clearedPositions'] = [];
  const next = board.map((row, y) => row.map((cell, x) => {
    if (rows.has(y) || columns.has(x)) {
      clearedPositions.push({ x, y });
      return null;
    }
    return cell ? { ...cell } : null;
  }));
  return {
    board: next,
    clearedRows,
    clearedColumns,
    clearedCellCount: clearedPositions.length,
    clearedLineCount: clearedRows.length + clearedColumns.length,
    clearedPositions,
  };
}
