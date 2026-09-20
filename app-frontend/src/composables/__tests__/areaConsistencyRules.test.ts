/**
 * Two rules the Area & Consistency section has to hold to.
 *
 * ROUNDING. The Co-ordinate List rounds co-ordinates with banker's rounding
 * (`toCoordinateListPrecision`), the convention this record uses throughout.
 * This section used `toFixed(2)`, which rounds halves away from zero, so the two
 * documents disagreed on any co-ordinate ending in a half-cent: SD3's
 * -85682.515 printed as -85682.51 here and -85682.52 there. One survey, one
 * beacon, two numbers, both lodged.
 *
 * THE REMAINDER. REM is what is left of the parent property after the stands are
 * taken out. It is not a surveyed stand and does not belong in a consistency
 * computation over the stands.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateAreaConsistencyPDF } from '../useAreaConsistencyPDF';

async function onePagePdfBlob(): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

/** A parcel whose first vertex sits exactly on a rounding boundary. */
const parcelAt = (designation: string, y = -85682.515): any => ({
  designation,
  points: [{ id: 'SD3', y, x: 2144117.414 }, { id: 'SD4', y: y + 100, x: 2144117.414 }],
  areaResult: {
    area: { abs_m2: 4046, display: { unit: 'm2', square_meters: 4046 } },
    residuals: {
      edges: [{
        from: { id: 'SD3', y, x: 2144117.414 },
        to: { id: 'SD4', y: y + 100, x: 2144117.414 },
        distance: 100, distanceRounded: 100, bearing: 0, bearingRoundedDeg: 0, dy: 0, dx: 0,
      }],
    },
  },
});

/** Text drawn into the areas-only PDF, as one string. */
const renderedText = async (parcels: any[]): Promise<string> => {
  const calc = await onePagePdfBlob();
  const result = await generateAreaConsistencyPDF(parcels, 'Test', calc, 116, [], []);
  if (!result) throw new Error('no PDF produced');
  const bytes = await (result as any).areasOnly.arrayBuffer();
  return Buffer.from(bytes).toString('latin1');
};

describe('Area & Consistency', () => {
  it("rounds co-ordinates the way the Co-ordinate List does", async () => {
    const text = await renderedText([parcelAt('STAND 403')]);

    // -85682.515 -> banker's gives .52; toFixed(2) gives .51 and disagrees with
    // the Co-ordinate List for the same beacon.
    expect(text).toContain('-85682.52');
    expect(text).not.toContain('-85682.51');
  });

  it('leaves the remainder out of the computation', async () => {
    const text = await renderedText([parcelAt('STAND 403'), parcelAt('REM', -85700.0)]);

    expect(text).toContain('STAND 403');
    expect(text).not.toContain('Stand/Erf: REM');
  });

  it('still reports the stands when a remainder is present', async () => {
    const text = await renderedText([parcelAt('STAND 403'), parcelAt('REM', -85700.0)]);

    expect(text).toContain('Stand/Erf: STAND 403');
  });
});
