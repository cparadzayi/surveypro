// @vitest-environment happy-dom
//
// Which section of the Co-ordinate List a point falls under.
//
// The Surveyor-General's form groups the list under headings -- Working
// Stations, Found Beacons -- and the grouping here was reading free text
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
//
// One heading is deliberately absent: ADOPTED BEACONS. It used to be the
// heading for provenance F, on the reading that a found beacon's coordinates
// are thereby "found & adopted" -- which made the heading say something the
// status column did not, and left "adopted" meaning both "found" and something
// it should not. F is now simply FOUND BEACONS, and "adopted" is reserved for a
// beacon whose coordinates were carried from a previous approved survey and
// cited by that survey's record number. No status code produces that section
// yet; see the note on SECTION_HEADINGS in coordinate-list.ts.

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

  it('separates found from found-not-adopted', () => {
    const at = sectionsOf([
      point('86B', 'F', '12mm iron peg in concrete'),
      point('87C', 'FN', '12mm iron peg in concrete'),
    ]);

    expect(at['86B']).toBe('found');
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

  it('files a "-"-provenance point as calculated, not placed', () => {
    // "-" means the point was defined by a figure split, not surveyed --
    // neither found nor placed. Decision 6 of the multi-sheet spec requires
    // the Co-ordinate List to show that; filing it under PLACED BEACONS (the
    // catch-all's previous behaviour) is precisely the outcome it forbids.
    const at = sectionsOf([point('X1', '-', '')]);

    expect(at.X1).toBe('calculated');
  });

  it('still lets a kind take precedence over a "-" provenance, same as any other', () => {
    const at = sectionsOf([point('X2', 'WS/-', '')]);

    expect(at.X2).toBe('working');
  });
});

describe('sectionsFor -- every populated group actually renders', () => {
  // A page count built from the grouping and a section list built by hand can
  // drift apart: CALCULATED POINTS once existed in one and not the other, so
  // the page total ran ahead of what actually printed. This asserts the
  // invariant structurally, for whatever the grouping produces, rather than
  // naming one example group -- so a future group is caught here too, not
  // just for "-".
  it('gives every non-empty group from groupPointsByType a rendered section', () => {
    const generator: any = new CoordinateListGenerator();
    const points = [
      point('THORNHILL', 'TRIG', 'THORNHILL'),
      point('BASE', 'WS', 'GNSS base'),
      point('86B', 'F', '12mm iron peg in concrete'),
      point('87C', 'FN', '12mm iron peg in concrete'),
      point('87DNew', 'C', 'Not Beaconed'),
      point('SD1', 'P', '12mm iron peg in concrete'),
      point('X1', '-', ''),
    ];

    const grouped = generator.groupPointsByType(points);
    const sections = generator.sectionsFor(grouped);

    for (const [key, list] of Object.entries(grouped as Record<string, unknown[]>)) {
      if (list.length === 0) continue;
      const rendered = sections.find((s: { points: unknown[] }) => s.points === list);
      expect(rendered, `group "${key}" has points but no rendered section`).toBeDefined();
    }

    // And the reverse: nothing rendered is a section sectionsFor invented --
    // every section's point list is one of the grouping's own arrays.
    const groupedLists = Object.values(grouped as Record<string, unknown[]>);
    for (const section of sections) {
      expect(groupedLists).toContain(section.points);
    }
  });
});

describe('the headings the sections actually print', () => {
  const headingsFor = (points: Array<Record<string, unknown>>): string[] => {
    const generator: any = new CoordinateListGenerator();
    return generator.sectionsFor(generator.groupPointsByType(points)).map(
      (s: { name: string }) => s.name,
    );
  };

  it('prints a found beacon under FOUND BEACONS, not ADOPTED BEACONS', () => {
    // The regression this guards. Provenance F was printed under the heading
    // ADOPTED BEACONS, so the document called a beacon "adopted" while its own
    // status column said only "F". A beacon found in the ground and adopted
    // from an earlier survey are different facts, and the list has to be able
    // to say which it means.
    expect(headingsFor([point('86B', 'F', '12mm iron peg in concrete')]))
      .toEqual(['FOUND BEACONS']);
  });

  it('holds ADOPTED BEACONS back until a status code can fill it', () => {
    // ADOPTED BEACONS is reserved for a beacon whose coordinates come from a
    // previous approved survey, cited by that survey's record number. Until
    // the status code and the input routine that supplies the number exist,
    // nothing may print that heading -- an ADOPTED BEACONS row with no S.R.
    // number cites nothing at all, which is worse than not printing it.
    const headings = headingsFor([
      point('86B', 'F', '12mm iron peg in concrete'),
      point('87C', 'FN', '12mm iron peg in concrete'),
      point('SD1', 'P', '12mm iron peg in concrete'),
      point('X1', '-', ''),
    ]);

    expect(headings).not.toContain('ADOPTED BEACONS');
  });

  it('prints FOUND BEACONS before FOUND, NOT ADOPTED', () => {
    // Both are found; the order has to be the heading order, not the order the
    // rules happen to be tested in.
    expect(headingsFor([
      point('87C', 'FN', '12mm iron peg in concrete'),
      point('86B', 'F', '12mm iron peg in concrete'),
    ])).toEqual(['FOUND BEACONS', 'FOUND, NOT ADOPTED']);
  });
});
