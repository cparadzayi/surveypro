// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildSheetPayloads } from '../sheetPayloads';

const P = (y: number, x: number) => ({ y, x });
const box = (y0: number, x0: number, y1: number, x1: number) =>
  [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)];

// One figure, cut down the middle; two stands, one each side.
const ring = box(0, 0, 100, 100);
const input = () => ({
  ring,
  polyline: [P(50, 0), P(50, 100)],
  stands: [
    { name: '1686', ring: box(10, 10, 40, 40) },
    { name: '1687', ring: box(60, 10, 90, 40) },
  ],
  servitudes: [],
  standForParcel: () => undefined,
  takenNames: ['SD1', 'SD2'],
});

describe('buildSheetPayloads', () => {
  it('produces one payload per part, numbered geographically', () => {
    const out = buildSheetPayloads(input());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.sheets.map((s) => s.sheetNumber)).toEqual([1, 2]);
    expect(out.sheets.every((s) => s.totalSheets === 2)).toBe(true);
  });

  it('gives each sheet its own stands and nobody else\'s', () => {
    const out = buildSheetPayloads(input());
    if (!out.ok) throw new Error('expected ok');
    const all = out.sheets.flatMap((s) => s.stands);
    expect([...all].sort()).toEqual(['1686', '1687']);
    // Exactly one sheet each: a stand on two sheets is lodged twice.
    for (const s of out.sheets) expect(s.stands).toHaveLength(1);
  });

  it('letters each sheet from A, so one point carries two letters', () => {
    const out = buildSheetPayloads(input());
    if (!out.ok) throw new Error('expected ok');
    for (const s of out.sheets) expect(s.vertices[0].pointId).toBe('A');
    // The cut's endpoints appear on both sheets under different letters.
    const cutOn = (n: number) =>
      out.sheets[n].vertices.filter((v) => v.type === 'cut').map((v) => v.pointId);
    expect(cutOn(0)).not.toEqual(cutOn(1));
  });

  it('names the created points once for the whole plan, avoiding taken names', () => {
    const out = buildSheetPayloads({ ...input(), takenNames: ['C1'] });
    if (!out.ok) throw new Error('expected ok');
    const names = out.sheets[0].newPoints.map((p) => p.name);
    expect(names).not.toContain('C1');
    // Both sheets describe the SAME created points, so both lists agree.
    expect(out.sheets[1].newPoints.map((p) => p.name)).toEqual(names);
    expect(out.sheets[0].newPoints.every((p) => p.status === '-')).toBe(true);
  });

  it('states the whole plan\'s stand range on every sheet, not the sheet\'s own', () => {
    // multiSheetTemplate says what the sheets TOGETHER represent.
    const out = buildSheetPayloads(input());
    if (!out.ok) throw new Error('expected ok');
    for (const s of out.sheets) {
      expect(s.standRange).toBe('1686 to 1687');
      expect(s.totalStandCount).toBe(2);
    }
  });

  it('gives a single-sheet plan the plain name and no other sheets', () => {
    const out = buildSheetPayloads({ ...input(), polyline: [] });
    if (!out.ok) throw new Error('expected ok');
    expect(out.sheets).toHaveLength(1);
    expect(out.sheets[0].figureLabel).toBe('Outside Figure');
    expect(out.sheets[0].otherSheets).toBe('');
  });

  it('builds a closed edge table for each sheet', () => {
    const out = buildSheetPayloads(input());
    if (!out.ok) throw new Error('expected ok');
    for (const s of out.sheets) {
      expect(s.edges).toHaveLength(s.ring.length);
      expect(s.edges[s.edges.length - 1].side.endsWith('-A')).toBe(true);
      expect(s.edges.every((e) => e.distance > 0)).toBe(true);
    }
  });

  it('accepts a CLOSED ring, which is what GeoJSON hands a caller', () => {
    const out = buildSheetPayloads({ ...input(), ring: [...ring, P(0, 0)] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.sheets).toHaveLength(2);
    // No duplicated vertex, which is what an unnormalised closed ring produces.
    for (const s of out.sheets) {
      const ids = s.ring.map((p) => `${p.y},${p.x}`);
      expect([...new Set(ids)].sort()).toEqual([...ids].sort());
    }
  });

  it('passes a refusal through in splitFigure\'s own words', () => {
    const sliced = buildSheetPayloads({
      ...input(),
      stands: [{ name: '1690', ring: box(40, 10, 60, 40) }],  // spans the cut
    });
    expect(sliced.ok).toBe(false);
    if (sliced.ok) return;
    expect(sliced.error).toBe('straddles-stands');
    expect(sliced.stands).toEqual(['1690']);
  });
});
