// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { newDraft, addVertex, undoVertex, clearDraft } from '../cutDrawing';

const P = (y: number, x: number) => ({ y, x });
const box = (y0: number, x0: number, y1: number, x1: number) =>
  [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)];

const ring = box(0, 0, 100, 100);
const noStands: never[] = [];

describe('a fresh draft', () => {
  it('has nothing and says so', () => {
    const d = newDraft();
    expect(d.vertices).toEqual([]);
    expect(d.verdict).toBe('incomplete');
    expect(d.startsAt).toBeNull();
  });
});

describe('addVertex', () => {
  it('rounds a clicked point to 2 dp, once', () => {
    // Decision 13. The raw click carries whatever the projection produced.
    const d = addVertex(newDraft(), ring, noStands, P(33.333333, 0.004));
    expect(d.vertices[0]).toEqual(P(33.33, 0));
  });

  it('does not mutate the draft it was given', () => {
    const before = newDraft();
    addVertex(before, ring, noStands, P(10, 0));
    expect(before.vertices).toEqual([]);
  });

  it('is incomplete with one vertex', () => {
    const d = addVertex(newDraft(), ring, noStands, P(50, 0));
    expect(d.verdict).toBe('incomplete');
  });

  it('accepts an honest chord as soon as it has two ends', () => {
    let d = addVertex(newDraft(), ring, noStands, P(50, 0));
    d = addVertex(d, ring, noStands, P(50, 100));
    expect(d.verdict).toBe('ok');
  });

  it('previews a snap when an end is within tolerance of a figure point', () => {
    // 0,04 m from the corner (0,0): resolveEndpoint will snap it.
    let d = addVertex(newDraft(), ring, noStands, P(0.04, 0.03));
    d = addVertex(d, ring, noStands, P(100, 50));
    expect(d.startsAt?.kind).toBe('vertex');
    expect(d.startsAt?.snapped).toBe(true);
    expect(d.startsAt?.point).toEqual(P(0, 0));
  });

  it('previews a new point on an edge when nothing is near enough', () => {
    let d = addVertex(newDraft(), ring, noStands, P(40, 0.07));
    d = addVertex(d, ring, noStands, P(100, 50));
    expect(d.startsAt?.kind).toBe('edge');
    expect(d.startsAt?.snapped).toBe(false);
  });

  it('reports a cut that would slice a stand, and names it', () => {
    const stands = [{ name: '1686', ring: box(40, 10, 60, 20) }];
    let d = addVertex(newDraft(), ring, stands, P(50, 0));
    d = addVertex(d, ring, stands, P(50, 100));
    expect(d.verdict).toBe('straddles-stands');
    expect(d.offenders).toEqual(['1686']);
  });

  it('reports a cut that wanders outside the figure', () => {
    let d = addVertex(newDraft(), ring, noStands, P(50, 0));
    d = addVertex(d, ring, noStands, P(150, 50));   // outside
    d = addVertex(d, ring, noStands, P(50, 100));
    expect(d.verdict).toBe('interior-outside');
  });

  it('reports a cut that crosses itself', () => {
    let d = addVertex(newDraft(), ring, noStands, P(0, 50));
    d = addVertex(d, ring, noStands, P(70, 30));
    d = addVertex(d, ring, noStands, P(30, 30));
    d = addVertex(d, ring, noStands, P(70, 70));
    d = addVertex(d, ring, noStands, P(100, 50));
    expect(d.verdict).toBe('self-intersecting');
  });

  it('a repeated click is one vertex, not two', () => {
    // A double-click while drawing. figureSplit collapses these, so the preview
    // must agree with it or the vertex count on screen lies.
    let d = addVertex(newDraft(), ring, noStands, P(50, 0));
    d = addVertex(d, ring, noStands, P(50, 50));
    d = addVertex(d, ring, noStands, P(50, 50));
    d = addVertex(d, ring, noStands, P(50, 100));
    expect(d.vertices).toHaveLength(3);
    expect(d.verdict).toBe('ok');
  });
});

describe('undoVertex', () => {
  it('removes the last vertex and re-verdicts what is left', () => {
    const stands = [{ name: '1686', ring: box(40, 10, 60, 20) }];
    let d = addVertex(newDraft(), ring, stands, P(50, 0));
    d = addVertex(d, ring, stands, P(50, 100));
    expect(d.verdict).toBe('straddles-stands');

    d = undoVertex(d, ring, stands);
    expect(d.vertices).toHaveLength(1);
    expect(d.verdict).toBe('incomplete');
  });

  it('on an empty draft is a no-op, not a throw', () => {
    expect(undoVertex(newDraft(), ring, noStands).vertices).toEqual([]);
  });
});

describe('clearDraft', () => {
  it('returns something a fresh draft would match', () => {
    expect(clearDraft()).toEqual(newDraft());
  });
});