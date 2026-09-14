/**
 * Conflict-Split Behaviour for Calculations Part 1 Adjusted Coordinates
 *
 * Two observations of the same name that fall OUTSIDE survey tolerance are two
 * DIFFERENT positions claiming one name — the workbook flags them in red, so the
 * adjusted output must never average them away (bnr-part8). Instead:
 *   - the FIRST observation survives as the canonical point,
 *   - every extra observation is emitted as its own point escaped `_dupl`,
 *     `_dupl2`, ... (same rule the backend write doors use),
 *   - an escaped name can never collide with a genuine survey point.
 *
 * Within-tolerance duplicates still merge to their certified mean.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { CalculationsPart1Generator } from '../calculations-part1';
import type { SurveyPoint } from '../calculations-part1';

const surveyorInfo = {
  name: 'C. Paradzayi',
  licenseNumber: 'PLS 1',
  firm: '',
  address: '',
  surveyDate: '2026-01-01',
  projectTitle: 'Test',
};

const obs = (
  pointId: string,
  y: number,
  x: number,
  status = 'P',
): SurveyPoint => ({
  pointId, y, x, status, description: '', surveyDate: '2026-01-01',
});

const generate = async (surveyPoints: SurveyPoint[]) => {
  const gen = new CalculationsPart1Generator();
  const result = await gen.generateCalculationsPart1PDF(surveyPoints, surveyorInfo);
  if ('pdf' in result) return result;
  throw new Error('expected render mode, got measurements');
};

describe('CalculationsPart1Generator — conflicting duplicate groups', () => {
  beforeEach(() => {
    // CalculationsPart1Generator persists field book lookups in Pinia.
    setActivePinia(createPinia());
  });

  it('does not average an out-of-tolerance duplicate — keeps first, escapes extras as _dupl', async () => {
    // Observed ~5 m apart (well beyond the 0.150 m boundary tolerance).
    const first = obs('BS-2', 2247879.713, 97347.079);
    const second = obs('BS-2', 2247879.713, 97352.079);
    const result = await generate([first, second]);

    const byPointId = new Map(result.adjustedCoordinates.map((c) => [c.pointId, c]));
    expect(byPointId.size).toBe(2);

    // Canonical = FIRST observation, untouched.
    const canonical = byPointId.get('BS-2')!;
    expect(canonical.x).toBe(first.x);
    expect(canonical.y).toBe(first.y);
    expect(canonical.adjustment).toMatchObject({
      isDuplicate: true, observationCount: 2, withinTolerance: false, method: 'canonical',
    });

    // Extra = its own point with its OWN position, escaped _dupl.
    const extra = byPointId.get('BS-2_dupl')!;
    expect(extra).toBeDefined();
    expect(extra.x).toBe(second.x);
    expect(extra.y).toBe(second.y);
    expect(extra.adjustment).toMatchObject({
      isDuplicate: true, observationCount: 1, withinTolerance: false, method: 'conflict',
    });
  });

  it('still merges within-tolerance duplicates to their certified mean', async () => {
    // 0.001 m apart — comfortably inside tolerance.
    const a = obs('A1', 50000.000, 2200000.000);
    const b = obs('A1', 50000.001, 2200000.001);
    const result = await generate([a, b]);

    expect(result.adjustedCoordinates).toHaveLength(1);
    const merged = result.adjustedCoordinates[0];
    expect(merged.pointId).toBe('A1');
    expect(merged.x).toBeCloseTo(2200000.0005, 4);
    expect(merged.y).toBeCloseTo(50000.0005, 4);
    expect(merged.adjustment).toMatchObject({
      isDuplicate: true, observationCount: 2, withinTolerance: true, method: 'mean',
    });
  });

  it('escalates escapes past genuine point names (_dupl taken, so _dupl2)', async () => {
    // A real point literally named BS-2_dupl exists -> extras must skip to _dupl2.
    const dev          = obs('BS-2', 2247879.713, 97347.079);
    const extra1       = obs('BS-2', 2247879.713, 97352.079);
    const extra2       = obs('BS-2', 2247879.713, 97357.079);
    const genuineDupl  = obs('BS-2_dupl', 2247879.000, 97340.000);

    const result = await generate([dev, extra1, extra2, genuineDupl]);

    const pointIds = result.adjustedCoordinates.map((c) => c.pointId);
    expect(pointIds).toEqual(expect.arrayContaining([
      'BS-2', 'BS-2_dupl', 'BS-2_dupl2',
    ]));

    // Genuine BS-2_dupl keeps its own position, untouched by the escapes.
    const genuine = result.adjustedCoordinates.find((c) => c.pointId === 'BS-2_dupl')!;
    expect(genuine.x).toBe(genuineDupl.x);
    expect(genuine.y).toBe(genuineDupl.y);
    expect(genuine.adjustment?.isDuplicate).toBe(false);

    // BS-2_dupl2 is the borrowed position of the second extra.
    const escaped = result.adjustedCoordinates.find((c) => c.pointId === 'BS-2_dupl2')!;
    expect(escaped.x).toBe(extra1.x);
    expect(escaped.y).toBe(extra1.y);
  });

  it('leaves single-observation points untouched', async () => {
    const solo = obs('C-1', 50000.123, 2200000.456);
    const result = await generate([solo]);

    expect(result.adjustedCoordinates).toHaveLength(1);
    expect(result.adjustedCoordinates[0]).toMatchObject({
      pointId: 'C-1', x: solo.x, y: solo.y,
      adjustment: { isDuplicate: false, observationCount: 1, method: 'single' },
    });
  });
});