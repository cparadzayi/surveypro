// @vitest-environment happy-dom
//
// Turning a part ring into the vertex array the existing SI 727 edge-table
// builder already consumes. That builder does not change; only what it is given.

import { describe, it, expect } from 'vitest';
import { sheetOutsideFigureVertices } from '../sheetOutsideFigure';
import { buildEdgeTable } from '../ofdClipping';
import { splitFigure } from '../../../../app-shared/figureSplit';

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

describe('end to end, on a real split', () => {
  // Every other test here hands the conversion a ring and a newPoints list built
  // by hand. This one takes both from splitFigure itself, because that is what
  // will really call it -- and because the 'cut' marking depends on OBJECT
  // IDENTITY between the part ring and newPoints, which only the real producer
  // can actually demonstrate. A hand-made Set proves the code reads a Set.
  const ring = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)];
  const split = splitFigure({ ring, polyline: [P(50, 0), P(50, 100)] });

  it('splits, so the rest of this block is testing something', () => {
    expect(split.ok).toBe(true);
    expect(split.parts).toHaveLength(2);
    expect(split.newPoints).toHaveLength(2);
  });

  it('marks exactly the points the cut created, on both sheets', () => {
    for (const part of split.parts) {
      const verts = sheetOutsideFigureVertices(part, split.newPoints);
      const cuts = verts.filter((v) => v.type === 'cut');
      // Each part carries the cut, so each sees both created points -- and
      // nothing else, since every other vertex is a surveyed corner.
      expect(cuts).toHaveLength(2);
      expect(verts.filter((v) => v.type === 'survey')).toHaveLength(part.length - 2);
    }
  });

  it('letters the same physical point differently on each sheet', () => {
    // Spec Part 4, demonstrated rather than asserted: the two parts share point
    // OBJECTS, so this is one corner of the survey appearing in two tables under
    // two letters.
    const [a, b] = split.parts.map((p) => sheetOutsideFigureVertices(p, split.newPoints));
    const shared = split.parts[0].filter((p) => split.parts[1].includes(p));
    expect(shared.length).toBeGreaterThan(0);

    const letterOf = (verts: ReturnType<typeof sheetOutsideFigureVertices>, part: typeof ring, point: unknown) =>
      verts[part.indexOf(point as never)].pointId;
    const differing = shared.filter(
      (p) => letterOf(a, split.parts[0], p) !== letterOf(b, split.parts[1], p),
    );
    expect(differing.length).toBeGreaterThan(0);
  });

  it('feeds buildEdgeTable a closed table for each sheet', () => {
    for (const part of split.parts) {
      const { edges, constants } = buildEdgeTable(sheetOutsideFigureVertices(part, split.newPoints));

      expect(edges).toHaveLength(part.length);
      expect(constants.pointId).toBe('A');
      // The last side closes back onto the first vertex.
      expect(edges[edges.length - 1].side.endsWith('-A')).toBe(true);
      // Every distance is a real positive number: no zero-length side, which is
      // what a duplicated vertex would produce.
      expect(edges.every((e) => e.distance > 0)).toBe(true);
    }
  });
});
