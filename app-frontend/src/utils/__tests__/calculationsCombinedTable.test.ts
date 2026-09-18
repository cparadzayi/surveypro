/**
 * CALCULATIONS table layout (combined points table).
 *
 * This table feeds the Calculations section of the survey record, where the
 * reader wants coordinates, not provenance: the beacon Status and Description
 * belong to the CO-ORDINATE LIST, not here. What is left — ID, Y, X, F/B — is
 * underscored by a single continuous red rule that runs the width of the
 * coordinate columns rather than three ragged text-width underlines. The rule
 * stops short of F/B: the field-book page is a cross-reference, not a
 * coordinate, so it is not part of what the red line certifies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { CalculationsPart1Generator } from '../calculations-part1';
import type { SurveyPoint } from '../calculations-part1';

const MM = 72 / 25.4; // jsPDF scale factor for unit 'mm'

const surveyorInfo = {
  name: 'C. Paradzayi',
  licenseNumber: 'PLS 1',
  firm: '',
  address: '',
  surveyDate: '2026-01-01',
  projectTitle: 'Test',
};

/** Distinctive cell values so their absence is unambiguous. */
const point = (pointId: string, y: number, x: number): SurveyPoint => ({
  pointId,
  y,
  x,
  status: 'ZSTATUSZ',
  description: 'ZDESCZ',
  surveyDate: '2026-01-01',
});

/** The page content stream carrying the CALCULATIONS heading. */
const calculationsPageStream = async (surveyPoints: SurveyPoint[]): Promise<string> => {
  const gen = new CalculationsPart1Generator();
  const result = await gen.generateCalculationsPart1PDF(surveyPoints, surveyorInfo);
  if (!('pdf' in result)) throw new Error('expected render mode, got measurements');
  const raw = Buffer.from(await result.pdf.arrayBuffer()).toString('latin1');
  const streams = raw
    .split('stream\n')
    .slice(1)
    .map((s) => s.split('\nendstream')[0])
    .filter((s) => s.includes('(CALCULATIONS)'));
  expect(streams).toHaveLength(1);
  return streams[0];
};

/** How jsPDF spells `text` inside a content stream: parens are backslash-escaped. */
const asDrawn = (text: string): string =>
  '(' + text.split('(').join('\\(').split(')').join('\\)') + ') Tj';

/** x of the `Td` that places `text`, in points. */
const textX = (stream: string, text: string): number => {
  const at = stream.indexOf(asDrawn(text));
  if (at < 0) throw new Error(`text ${JSON.stringify(text)} not placed in stream`);
  const td = stream.slice(0, at).trimEnd().split('\n').pop() ?? '';
  const m = td.match(/^([\d.]+) [\d.]+ Td$/);
  if (!m) throw new Error(`no Td precedes ${JSON.stringify(text)}, found ${JSON.stringify(td)}`);
  return Number(m[1]);
};

/** Every stroked horizontal segment, in points. */
const rules = (stream: string): Array<{ x1: number; x2: number; y: number }> =>
  [...stream.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) [\d.]+ l\nS/g)].map((m) => ({
    x1: Number(m[1]),
    y: Number(m[2]),
    x2: Number(m[3]),
  }));

describe('CALCULATIONS combined points table', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('drops the Status and Description columns', async () => {
    const stream = await calculationsPageStream([point('A1', 100.1, 200.2)]);

    expect(stream).not.toContain('(Status)');
    expect(stream).not.toContain('(Description)');
    expect(stream).not.toContain('(ZSTATUSZ)');
    expect(stream).not.toContain('(ZDESCZ)');
  });

  it('closes the gap the dropped columns left, seating F/B at marginLeft + 95mm', async () => {
    const stream = await calculationsPageStream([point('A1', 100.1, 200.2)]);
    const marginLeft = textX(stream, 'ID');

    expect(textX(stream, 'Y (m)') - marginLeft).toBeCloseTo(25 * MM, 3);
    expect(textX(stream, 'X (m)') - marginLeft).toBeCloseTo(60 * MM, 3);
    expect(textX(stream, 'F/B') - marginLeft).toBeCloseTo(95 * MM, 3);
  });

  it('rules each row with one continuous red line instead of three text-width underlines', async () => {
    const stream = await calculationsPageStream([
      point('A1', 100.1, 200.2),
      point('A2', 101.1, 201.2),
      point('A3', 102.1, 202.2),
    ]);

    expect(rules(stream)).toHaveLength(3); // one per row, not three per row
    expect(stream).toContain('0.86 0. 0. RG'); // still red
  });

  it('spans the coordinate columns and stops short of F/B', async () => {
    const stream = await calculationsPageStream([point('A1', 100.1, 200.2)]);
    const marginLeft = textX(stream, 'ID');
    const [rule] = rules(stream);

    expect(rule.x1).toBeCloseTo(marginLeft, 3);
    expect(rule.x2 - marginLeft).toBeCloseTo(90 * MM, 3);
    expect(rule.x2).toBeLessThan(textX(stream, 'F/B'));
  });
});
