// @vitest-environment happy-dom
//
// Which section of the Co-ordinate List a point falls under.
//
// The Surveyor-General's form groups the list under headings -- Working
// Stations, Adopted Beacons -- and the grouping here was reading free text
// rather than the Status column the surveyor actually fills in:
//
//   isWorkingStation() tested `desc.includes('ws')`, which is true of any
//   description with those two letters next to each other, and it never looked
//   for the status code WS at all.
//
// So a station coded WS was sorted by whatever its description happened to say.
// "10mm iron peg (Station)" matched `desc.includes('iron peg')` and was filed
// under PLACED BEACONS; "GNSS base" matched no rule at all and was dropped from
// the list entirely, because a point matching no category is excluded.
//
// The status is what the surveyor states deliberately. It decides the section.

import { describe, it, expect } from 'vitest';
import { CoordinateListGenerator } from '../coordinate-list';

/** The section each point was filed under, by point id. */
function sectionsOf(points: Array<Record<string, unknown>>): Record<string, string> {
  const grouped = (new CoordinateListGenerator() as any).groupPointsByType(points);
  const out: Record<string, string> = {};
  for (const [section, list] of Object.entries(grouped as Record<string, any[]>)) {
    for (const p of list) out[p.pointId] = section;
  }
  return out;
}

const point = (pointId: string, status: string, description: string) => ({
  pointId, status, description, y: -85700, x: 2144000,
  fieldBookPage: '', calculationsPage: 0,
});

describe('the Co-ordinate List sections', () => {
  it('files a working station by its status, whatever the description says', () => {
    const at = sectionsOf([
      point('ST1', 'WS', '10mm iron peg (Station)'),
      point('BASE', 'WS', 'GNSS base'),
      point('ST7', 'WSU', 'unmarked station'),
    ]);

    expect(at.ST1).toBe('working');
    expect(at.BASE).toBe('working');
    expect(at.ST7).toBe('working');
  });

  it('files a compound status by its kind half', () => {
    const at = sectionsOf([
      point('ST1', 'WS/P', '10mm iron peg (Station)'),
      point('ST7', 'WS/F', '12mm iron peg in concrete'),
    ]);

    expect(at.ST1).toBe('working');
    expect(at.ST7).toBe('working');
  });

  it('never loses a point to having no category', () => {
    // Anything the rules cannot place still has to appear somewhere: a beacon
    // missing from a lodged co-ordinate list is the worst outcome available.
    const at = sectionsOf([
      point('BASE', 'WS', 'GNSS base'),
      point('ODD', 'QQ', 'nothing anybody wrote a rule for'),
    ]);

    expect(at.BASE).toBeDefined();
    expect(at.ODD).toBeDefined();
  });

  it('does not mistake two letters in a description for a station', () => {
    const at = sectionsOf([point('B12', 'P', 'brass screws in concrete')]);

    expect(at.B12).toBe('placed');
  });

  it('separates found-and-adopted from found-not-adopted', () => {
    const at = sectionsOf([
      point('86B', 'F', '12mm iron peg in concrete'),
      point('87C', 'FN', '12mm iron peg in concrete'),
    ]);

    expect(at['86B']).toBe('adopted');
    expect(at['87C']).toBe('foundNotAdopted');
  });

  it('keeps trig, calculated and placed where they were', () => {
    const at = sectionsOf([
      point('THORNHILL', 'TRIG', 'THORNHILL'),
      point('87DNew', 'C', 'Not Beaconed'),
      point('SD1', 'P', '12mm iron peg in concrete'),
    ]);

    expect(at.THORNHILL).toBe('trig');
    expect(at['87DNew']).toBe('calculated');
    expect(at.SD1).toBe('placed');
  });
});
