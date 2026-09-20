// @vitest-environment happy-dom
//
// Working stations belong in the field book.
//
// A field book records what was visited and measured. A working station was
// occupied -- it is where the instrument stood, or where the GNSS base sat --
// so it is among the most thoroughly visited points of the whole survey. That
// is the opposite of a calculated point, which was never visited at all and is
// excluded for exactly that reason.
//
// The distinction is easy to lose: both are "not a boundary beacon", and a
// filter written around that idea would drop the stations along with the
// computed points. These tests exist so that cannot happen quietly.

import { describe, it, expect } from 'vitest';
import { FieldBookGenerator, type FieldBookPoint, type FieldBookMetadata } from '../field-book';

const metadata = { surveyorName: 'F. Chitsike' } as FieldBookMetadata;

const points: FieldBookPoint[] = [
  { id: 'ST1', y: -85728.708, x: 2143972.144, status: 'WS/P', description: '10mm iron peg (Station)', surveyDate: '2026-07-02' },
  { id: 'ST7', y: -85729.942, x: 2144164.763, status: 'WS/F', description: '12mm iron peg in concrete', surveyDate: '2026-07-02' },
  { id: 'BASE', y: -85765.137, x: 2144017.161, status: 'WS', description: 'GNSS base', surveyDate: '2026-07-02' },
  { id: 'SD1', y: -85682.515, x: 2144117.414, status: 'P', description: '12mm iron peg in concrete', surveyDate: '2026-07-02' },
  { id: '87DNew', y: -85633.040, x: 2144068.004, status: 'C', description: 'Not Beaconed', surveyDate: '2026-07-02' },
];

const render = async () => {
  const { pdf, pointPageMap } = await new FieldBookGenerator().generateFieldBookPDF(points, metadata);
  return { raw: Buffer.from(pdf.output('arraybuffer')).toString('latin1'), pointPageMap };
};

describe('the field book and working stations', () => {
  it('records every station that was occupied', async () => {
    const { raw } = await render();

    expect(raw).toContain('(ST1)');
    expect(raw).toContain('(ST7)');
    expect(raw).toContain('(BASE)');
  });

  it('still leaves out the point that was never visited', async () => {
    const { raw } = await render();

    expect(raw).not.toContain('(87DNew)');
  });

  it('gives each station a page, like any other observed point', async () => {
    const { pointPageMap } = await render();

    expect(pointPageMap.ST1).toBe('E1');
    expect(pointPageMap.BASE).toBe('E1');
    expect(pointPageMap.SD1).toBe('E1');
    expect(pointPageMap['87DNew']).toBeUndefined();
  });

  it('shows whether the station was found or placed', async () => {
    const { raw } = await render();

    // The status column is headed "Status", so it prints what was recorded --
    // both halves. Losing the P would hide whether the peg was set out for this
    // survey or recovered from an earlier one.
    expect(raw).toContain('(WS/P)');
    expect(raw).toContain('(WS/F)');
  });
});
