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

  it('names shared cut points the same on every sheet', () => {
    const out = buildSheetPayloads(input());
    if (!out.ok) throw new Error('expected ok');

    // splitFigure puts the cut's endpoints first in every part, and those
    // points are named ONCE for the whole plan -- so the same physical
    // point reads 'C1' (or 'C2') on every sheet it appears on, instead
    // of a different letter per sheet. That is the point of carrying
    // real names in each sheet's outside-figure data.
    const shared = out.sheets[0].ring.filter((p) => out.sheets[1].ring.includes(p));
    expect(shared.length).toBeGreaterThan(0);

    const idOn = (n: number, point: unknown) =>
      out.sheets[n].vertices[out.sheets[n].ring.indexOf(point as never)].pointId;
    for (const p of shared) {
      const name = idOn(0, p);
      expect(name).toBe(idOn(1, p));
      expect(name).toMatch(/^C\d+$/);
    }

    // Survey points the plan never named still fall back to this
    // sheet's own letters, which restart at A on every sheet.
    for (const s of out.sheets) {
      expect(s.vertices.some((v) => /^[A-Z]$/.test(v.pointId))).toBe(true);
    }
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

  it("carries each sheet's OWN parcels, not just their names", () => {
    // Found by looking at a rendered page, not by a test: with names only, the
    // schedule's Area, Diagram, Deed and S.G. columns were all blank, and the
    // figure had nothing to place each stand by, so their number labels collided.
    // Every other assertion in this file is about names, numbers, letters or
    // wording -- not one of them could see it.
    const withAreas = {
      ...input(),
      stands: [
        { name: '1686', ring: box(10, 10, 40, 40), area_m2: 1234.56 },
        { name: '1687', ring: box(60, 10, 90, 40), area_m2: 2345.67 },
      ],
    };
    const out = buildSheetPayloads(withAreas as never);
    if (!out.ok) throw new Error('expected ok');

    for (const s of out.sheets) {
      // One parcel per stand, in the same order.
      expect(s.parcels.map((p) => p.name)).toEqual(s.stands);
      // And the area travels with them.
      for (const p of s.parcels) {
        expect((p as unknown as { area_m2: number }).area_m2).toBeGreaterThan(0);
      }
    }
  });

  it("hands over the caller's own parcel objects, not copies", () => {
    // The renderer reads whatever the single-sheet path already reads off a
    // parcel, so these have to BE the caller's objects: copying would silently
    // drop any field this module does not happen to know about.
    const given = input();
    const out = buildSheetPayloads(given);
    if (!out.ok) throw new Error('expected ok');
    for (const p of out.sheets.flatMap((s) => s.parcels)) {
      expect(given.stands).toContain(p);
    }
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

  it('gives each sheet only the servitude rows naming its own stands', () => {
    // The rows are handed to the payload so the renderer has something to
    // print. Nothing passed them: the single-sheet plan stated its
    // servitudes from `metadata`, the sheets were rebuilt from `name` + `ring`
    // alone, and every sheet came out with an empty statement.
    const rows = [
      { stands: '1686', boundary: '3m road servitude' },
      { stands: '1687', boundary: '2m drain servitude' },
    ];
    const out = buildSheetPayloads({ ...input(), servitudeRows: rows as any });
    if (!out.ok) throw new Error('expected ok');

    expect(out.sheets[0].servitudeRows).toEqual([rows[0]]);
    expect(out.sheets[1].servitudeRows).toEqual([rows[1]]);
  });

  it('gives a sheet stating both stands every row that names either', () => {
    const rows = [
      { stands: '1686', boundary: '3m road servitude' },
      { stands: '1687', boundary: '2m drain servitude' },
      { stands: '1686 and 1687', boundary: '6m wayleave' },
    ];
    const both = buildSheetPayloads({ ...input(), polyline: [], servitudeRows: rows as any });
    if (!both.ok) throw new Error('expected ok');
    // One sheet, all three rows: a statement spanning stands cannot be split
    // between sheets that do not exist.
    expect(both.sheets[0].servitudeRows).toHaveLength(3);
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
      // The table closes: the last edge returns to the FIRST vertex,
      // whatever that point is called -- a lettered survey point or a
      // plan-named cut point ('C1' here, since the cut leads the ring).
      expect(s.edges[s.edges.length - 1].side.endsWith(`-${s.vertices[0].pointId}`)).toBe(true);
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
