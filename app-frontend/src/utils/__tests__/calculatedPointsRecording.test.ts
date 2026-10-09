/**
 * Calculated points in the Calculations document.
 *
 * The combined CALCULATIONS table already records every point — calculated
 * ones among them — under the red rule that certifies its coordinates. What
 * computed positions were missing was cross-referencing, not a second
 * listing: the table's F/B cites the field-book E-page the point prints on,
 * and the CO-ORDINATE LIST cites the Calculations page carrying its row.
 * A separate CALCULATED POINTS section used to repeat the same rows after
 * the table — the same points printed twice in one document — so it is
 * gone. Guarded here:
 *
 *   - recorded exactly once: the row sits in the combined table and no
 *     '(CALCULATED POINTS)' heading follows it;
 *   - Calcs cites the combined-table page that carries the point;
 *   - F/B still cross-references the field book's CALCULATED POINTS block;
 *   - a survey with nothing calculated paginates exactly as before.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { CalculationsPart1Generator, type SurveyPoint } from '../calculations-part1';
import type { PartyWallRow } from '../fieldBookPagination';

const surveyorInfo = {
  name: 'C. Paradzayi',
  licenseNumber: 'PLS 1',
  firm: '',
  address: '',
  surveyDate: '2026-01-01',
  projectTitle: 'Test',
};

const observed = (pointId: string): SurveyPoint => ({
  pointId, y: 1.1, x: 2.2, status: 'P',
  description: 'iron peg', surveyDate: '2026-01-01',
});

const calculated: SurveyPoint = {
  pointId: 'C1', y: 3.3, x: 4.4, status: 'C',
  description: 'CALCULATED', surveyDate: '2026-01-01',
};

const partyWalls: PartyWallRow[] = [{ stands: 'STANDS 1', boundary: 'A-B' }];

/** Generate and hand back the raw PDF bytes alongside the result lookup. */
const generate = async (
  points: SurveyPoint[],
  walls: PartyWallRow[] = [],
  fieldBookPageMap?: Record<string, string>,
) => {
  const result: any = await new CalculationsPart1Generator().generateCalculationsPart1PDF(
    points, surveyorInfo, 116, false, walls, {}, fieldBookPageMap,
  );
  const raw = Buffer.from(await result.pdf.arrayBuffer()).toString('latin1');
  return { raw, result };
};

describe('calculated points in the Calculations document', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('records a computed point once — in the combined table, with no second listing', async () => {
    const { raw, result } = await generate(
      [observed('P1'), observed('P2'), calculated],
      partyWalls,
    );

    // The row is there — in the table every point shares…
    expect(raw).toContain('(CALCULATIONS)');
    expect(raw).toContain('(C1)');
    // …and only there: once in the table, never again under a heading of
    // its own.
    expect(raw.match(/\(C1\)/g)).toHaveLength(1);
    expect(raw).not.toContain('(CALCULATED POINTS)');

    // Document order: table first, the party-wall appendix closing it.
    const tableAt = raw.indexOf('(CALCULATIONS)');
    const wallsAt = raw.indexOf('(Party-wall servitudes)');
    expect(tableAt).toBeGreaterThan(-1);
    expect(wallsAt).toBeGreaterThan(-1);
    expect(tableAt).toBeLessThan(wallsAt);

    // Combined table on 116, party walls on 117 — the section that used to
    // sit between them added a page of pure repetition.
    expect(result.pageCount).toBe(2);
  });

  it('cites its combined-table page in Calcs and its field book block page in F/B', async () => {
    const { raw, result } = await generate(
      [observed('P1'), observed('P2'), calculated],
      [],
      { P1: 'E1', P2: 'E1', C1: 'E7' },
    );

    // Calcs: the Calculations page recording the point — the combined table
    // on 116, the same page every point on it cites.
    expect(result.calculationsPageLookup.C1).toBe(116);
    expect(result.calculationsPageLookup.P1).toBe(116);

    // F/B: where the field book prints it — its CALCULATED POINTS block,
    // E7, rendered as the row's own cross-reference.
    expect(raw).toContain('(E7)');
  });

  it('adds no page at all to a survey with nothing calculated', async () => {
    const { raw, result } = await generate([observed('P1'), observed('P2')]);

    expect(raw).not.toContain('(CALCULATED POINTS)');
    // Summary table only: one page, and every citation lands on it.
    expect(result.pageCount).toBe(1);
    expect(result.calculationsPageLookup.P1).toBe(116);
    expect(result.calculationsPageLookup.P2).toBe(116);
  });
});
