// @vitest-environment happy-dom
//
// Turning a part ring into the vertex array the existing SI 727 edge-table
// builder already consumes. That builder does not change; only what it is given.

import { describe, it, expect } from 'vitest';
import { sheetOutsideFigureVertices } from '../sheetOutsideFigure';
import { buildEdgeTable } from '../ofdClipping';

const P = (y: number, x: number) => ({ y, x });

describe('sheetOutsideFigureVertices', () => {
  it('letters the part from A, by position', () => {
    const part = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)];
    expect(sheetOutsideFigureVertices(part, []).map((v) => v.pointId))
      .toEqual(['A', 'B', 'C', 'D']);
  });

  it('marks a point the cut created, by identity not coordinate', () => {
    // splitFigure returns the SAME objects in the part ring and in newPoints, so
    // identity is exact. A coordinate comparison would need an epsilon and would
    // misclassify a beacon surveyed to 3 dp as created.
    const created = P(50, 0);
    const part = [created, P(0, 0), P(0, 100)];

    expect(sheetOutsideFigureVertices(part, [created]).map((v) => v.type))
      .toEqual(['cut', 'survey', 'survey']);
  });

  it('does not mark a distinct point that merely shares a coordinate', () => {
    const created = P(50, 0);
    const lookalike = P(50, 0);
    const part = [lookalike, P(0, 0), P(0, 100)];

    expect(sheetOutsideFigureVertices(part, [created])[0].type).toBe('survey');
  });

  it('feeds the existing edge-table builder unchanged', () => {
    const part = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)];
    const { edges, constants } = buildEdgeTable(sheetOutsideFigureVertices(part, []));

    expect(edges).toHaveLength(4);
    expect(edges[0].side).toBe('A-B');
    expect(edges[3].side).toBe('D-A');     // closes back to the first vertex
    expect(constants.pointId).toBe('A');
  });

  it('letters past Z for a township figure', () => {
    const part = Array.from({ length: 28 }, (_, i) => P(i, i * 2));
    const ids = sheetOutsideFigureVertices(part, []).map((v) => v.pointId);

    expect(ids[25]).toBe('Z');
    expect(ids[26]).toBe('AA');
    expect(ids[27]).toBe('AB');
  });
});
