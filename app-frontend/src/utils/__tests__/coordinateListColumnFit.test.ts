/**
 * No cell may run into the column that follows it.
 *
 * The Co-ordinate List's description was capped at a character count. That cap
 * was tuned for 8pt, so raising the table to 10pt for legibility pushed long
 * descriptions straight through the F/P column beside them — a collision no
 * existing test could see, because every assertion checked that text was
 * PRESENT, never where it ended.
 *
 * The cap is now measured against the real font, and this pins it.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import jsPDF from 'jspdf';
import { CoordinateListGenerator } from '../coordinate-list';
import type { AdjustedCoordinate } from '../../types/adjusted-coordinates';
import type { SurveyorInfo } from '../coordinate-list';

const surveyorInfo = {
  name: 'F. Chitsike',
  licenseNumber: '1001',
  firm: '',
  address: '',
  surveyDate: '2026-07-30',
  projectTitle: 'Test',
  district: 'Gwelo',
} as SurveyorInfo;

const coord = (description: string): AdjustedCoordinate => ({
  pointId: 'SD6',
  y: -85723.401,
  x: 2144076.451,
  status: 'F',
  description,
  surveyDate: '2026-07-30',
  fieldBookPage: 'E2',
  calculationsPage: 116,
});

/** Every text placement on the page carrying the point row, left to right. */
const rowCells = async (description: string) => {
  const { pdf } = await new CoordinateListGenerator()
    .generateCoordinateListPDF([coord(description)], surveyorInfo);
  const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  const page = raw
    .split('stream\n')
    .slice(1)
    .map((s) => s.split('\nendstream')[0])
    .find((s) => s.includes('(SD6)'));
  if (!page) throw new Error('point row never rendered');

  const placed = [...page.matchAll(/([\d.]+) ([\d.]+) Td\n\((.*?)\) Tj/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), t: m[3] }));
  const anchor = placed.find((c) => c.t === 'SD6');
  if (!anchor) throw new Error('anchor cell missing');

  return placed
    .filter((c) => Math.abs(c.y - anchor.y) < 0.5)
    .sort((a, b) => a.x - b.x);
};

describe('Co-ordinate List column fit', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('keeps a long description clear of the column beside it', async () => {
    const cells = await rowCells('50mm iron pipe in concrete surround, south-west corner');

    const description = cells.find((c) => c.t.startsWith('50mm'));
    expect(description).toBeDefined();

    const next = cells.find((c) => c.x > description!.x);
    expect(next).toBeDefined();

    // Measured in the same font the document uses, not estimated per character:
    // an estimate is exactly the kind of approximation that let the original
    // overrun through.
    const ruler = new jsPDF({ unit: 'mm', format: 'a4' });
    ruler.setFont('helvetica', 'normal');
    ruler.setFontSize(10);
    const widthPt = ruler.getTextWidth(description!.t) * 2.8346;

    expect(description!.x + widthPt).toBeLessThan(next!.x);
  });

  it('leaves a description that already fits completely untouched', async () => {
    const cells = await rowCells('iron peg');

    expect(cells.some((c) => c.t === 'iron peg')).toBe(true);
  });
});
