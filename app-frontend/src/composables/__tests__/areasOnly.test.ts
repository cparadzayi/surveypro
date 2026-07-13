import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateAreaConsistencyPDF } from '../useAreaConsistencyPDF';

async function onePagePdfBlob(): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

const parcel: any = {
  designation: 'STAND 1',
  points: [{ id: 'A', y: 50000, x: 2200000 }, { id: 'B', y: 50100, x: 2200000 }],
  areaResult: {
    area: { abs_m2: 6000, display: { unit: 'm2', square_meters: 6000 } },
    residuals: {
      edges: [{
        from: { id: 'A', y: 50000, x: 2200000 },
        to: { id: 'B', y: 50100, x: 2200000 },
        distance: 100, distanceRounded: 100, bearing: 0, bearingRoundedDeg: 0, dy: 0, dx: 0,
      }],
    },
  },
};

describe('generateAreaConsistencyPDF — areas-only blob', () => {
  it('returns both the merged bytes and a non-empty areas-only blob', async () => {
    const calc = await onePagePdfBlob();
    const result = await generateAreaConsistencyPDF([parcel], 'Test', calc, 116, [], []);
    expect(result).toBeTruthy();
    expect((result as any).merged).toBeInstanceOf(Uint8Array);
    expect((result as any).merged.length).toBeGreaterThan(0);
    expect((result as any).areasOnly).toBeInstanceOf(Blob);
    expect((result as any).areasOnly.size).toBeGreaterThan(0);
  }, 20000);
});
