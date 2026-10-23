import { describe, expect, it } from 'vitest';
import { pointerPlacement } from '../utils/coordinates';
import type { Piece } from '../game/types';

const block: Piece = { id: 'drag-square', shapeId: 'square-2', color: 'yellow',
  cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] };

function boardAt(left: number, top: number, cell: number, gap: number): HTMLElement {
  const first = { getBoundingClientRect: () => ({ left, top, width: cell, height: cell }) };
  const second = { getBoundingClientRect: () => ({ left: left + cell + gap, top, width: cell, height: cell }) };
  return { firstElementChild: first, children: [first, second] } as unknown as HTMLElement;
}

describe('responsive pointer-to-board conversion', () => {
  it('uses actual cell rectangles and gaps to place a centered desktop piece', () => {
    const placement = pointerPlacement(boardAt(100, 200, 40, 4), block, 230, 390, false);
    expect(placement.target).toEqual({ x: 2, y: 3 });
    expect(placement.left).toBe(188);
    expect(placement.top).toBe(332);
    expect(placement.cell).toBe(40);
  });

  it('keeps the touch target above the finger with mobile geometry', () => {
    const placement = pointerPlacement(boardAt(12, 50, 21, 3), block, 106.5, 164.5, true);
    expect(placement.target).toEqual({ x: 3, y: 1 });
    expect(placement.left).toBe(84);
    expect(placement.top).toBe(74);
    expect(placement.cell).toBe(21);
  });

  it('preserves outside-board anchors so the game engine can reject the drop', () => {
    const board = boardAt(100, 200, 40, 4);
    const outside = pointerPlacement(board, block, -100, -100, true);
    expect(outside.target.x).toBeLessThan(0);
    expect(outside.target.y).toBeLessThan(0);
    const beyond = pointerPlacement(board, block, 1000, 1000, false);
    expect(beyond.target.x).toBeGreaterThan(7);
    expect(beyond.target.y).toBeGreaterThan(7);
  });
});
