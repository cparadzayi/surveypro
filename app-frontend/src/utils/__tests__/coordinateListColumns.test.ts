/**
 * Column geometry of the CO-ORDINATE LIST.
 *
 * The beacons column was 35mm wide for names like "87DNew" that need about 11.
 * It was sized for the word CONSTANTS sharing it, not for its own contents, and
 * the 19mm of slack came straight out of the description column next door —
 * which then had to truncate "12mm iron peg in concrete" mid-word.
 *
 * CONSTANTS now right-justifies to the beacons column's right edge and reaches
 * left across the Calcs cell, which is empty on that row. The width that frees
 * goes to the description.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import jsPDF from 'jspdf';
import { CoordinateListGenerator } from '../coordinate-list';
import type { AdjustedCoordinate } from '../../types/adjusted-coordinates';
import type { SurveyorInfo } from '../coordinate-list';

const MM = 72 / 25.4;
const PAGE_WIDTH_MM = 210;
const MARGIN_MM = 15;

const surveyorInfo = {
  name: 'F. Chitsike', licenseNumber: '1001', firm: '', address: '',
  surveyDate: '2026-07-30', projectTitle: 'STANDS 403-405', district: 'Gwelo',
} as SurveyorInfo;

const coord = (over: Partial<AdjustedCoordinate>): AdjustedCoordinate => ({
  pointId: '87DNew',
  y: -85729.941,
  x: 2144164.762,
  status: 'F',
  description: '12mm iron peg in concrete',
  surveyDate: '2026-07-30',
  fieldBookPage: 'E2',
  calculationsPage: 101,
  ...over,
});

/** Every text placement on the page carrying the table. */
const tableCells = async (coords: AdjustedCoordinate[]) => {
  const { pdf } = await new CoordinateListGenerator()
    .generateCoordinateListPDF(coords, surveyorInfo);
  const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  const page = raw
    .split('stream\n')
    .slice(1)
    .map((s) => s.split('\nendstream')[0])
    .find((s) => s.includes('(CONSTANTS)'));
  if (!page) throw new Error('table page never rendered');

  return [...page.matchAll(/([\d.]+) ([\d.]+) Td\n\((.*?)\) Tj/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), t: m[3] }));
};

/** Width of `text` in points, in the font the table body uses. */
const widthPt = (text: string): number => {
  const ruler = new jsPDF({ unit: 'mm', format: 'a4' });
  ruler.setFont('helvetica', 'normal');
  ruler.setFontSize(10);
  return ruler.getTextWidth(text) * MM;
};

describe('CO-ORDINATE LIST column geometry', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('prints a realistic beacon description without truncating it', async () => {
    const cells = await tableCells([coord({})]);

    expect(cells.some((c) => c.t === '12mm iron peg in concrete')).toBe(true);
  });

  it('right-justifies CONSTANTS to the beacons column, reaching left over Calcs', async () => {
    const cells = await tableCells([coord({})]);

    const constants = cells.find((c) => c.t === 'CONSTANTS');
    const beacon = cells.find((c) => c.t === '87DNew');
    expect(constants).toBeDefined();
    expect(beacon).toBeDefined();

    // Its right edge lines up with the beacon names' column, and it starts to
    // their left -- that overhang is the point, and it lands on an empty cell.
    const constantsRight = constants!.x + widthPt('CONSTANTS');
    const beaconRight = beacon!.x + widthPt('87DNew');
    expect(constantsRight).toBeGreaterThan(beaconRight);
    expect(constants!.x).toBeLessThan(beacon!.x);
  });

  it('keeps every cell inside the right margin', async () => {
    const cells = await tableCells([coord({})]);
    const limit = (PAGE_WIDTH_MM - MARGIN_MM) * MM;

    const overruns = cells
      .map((c) => ({ ...c, end: c.x + widthPt(c.t) }))
      .filter((c) => c.end > limit + 0.5);

    expect(overruns.map((c) => `${c.t}@${c.end.toFixed(0)}pt`)).toEqual([]);
  });

  it('gives the description more room than the beacons column it borrowed from', async () => {
    const cells = await tableCells([coord({})]);

    const beacon = cells.find((c) => c.t === '87DNew')!;
    const description = cells.find((c) => c.t.startsWith('12mm'))!;
    const y = cells.find((c) => c.t.startsWith('-85 729'))!;

    const beaconsWidth = y.x - beacon.x;
    const descriptionWidth = (PAGE_WIDTH_MM - MARGIN_MM) * MM - description.x;

    expect(descriptionWidth).toBeGreaterThan(beaconsWidth);
  });
});
