import { describe, it, expect } from 'vitest';
import { planTypeOptionsFor, normalizePlanTypeSelection } from '../planTypeOptions';
import type { RecordComposition } from '@/utils/recordComposition';

const confirmed = (d: boolean, g: boolean): RecordComposition => ({
  includesDiagrams: d,
  includesGeneralPlans: g,
  source: 'confirmed',
});

const enabledValues = (c: RecordComposition | null) =>
  planTypeOptionsFor(c).filter(o => o.enabled).map(o => o.value).sort();

describe('planTypeOptionsFor', () => {
  it('always returns all four plan types, in PLAN_TYPE_META order', () => {
    expect(planTypeOptionsFor(null).map(o => o.value)).toEqual([
      'general-undeveloped',
      'general-developed',
      'diagram',
      'working-plan',
    ]);
  });

  it('carries the user-facing label through', () => {
    const diagram = planTypeOptionsFor(null).find(o => o.value === 'diagram');
    expect(diagram?.label).toBe('Diagram');
  });

  it('disables diagrams for a general-plans-only record', () => {
    expect(enabledValues(confirmed(false, true))).toEqual([
      'general-developed',
      'general-undeveloped',
      'working-plan',
    ]);
  });

  it('disables general plans for a diagrams-only record', () => {
    expect(enabledValues(confirmed(true, false))).toEqual(['diagram', 'working-plan']);
  });

  it('enables everything for a both record', () => {
    expect(enabledValues(confirmed(true, true))).toEqual([
      'diagram',
      'general-developed',
      'general-undeveloped',
      'working-plan',
    ]);
  });

  it('enables everything when nothing is confirmed', () => {
    expect(enabledValues(null)).toEqual([
      'diagram',
      'general-developed',
      'general-undeveloped',
      'working-plan',
    ]);
  });
});

describe('normalizePlanTypeSelection', () => {
  it('keeps the current selection when it is still allowed', () => {
    expect(normalizePlanTypeSelection('diagram', confirmed(true, false))).toBe('diagram');
    expect(normalizePlanTypeSelection('working-plan', confirmed(false, true))).toBe('working-plan');
  });

  it('moves off a selection the composition has just disallowed', () => {
    // This is the bug the two hardcoded lists hid: config.planType is independent
    // state, so without this the <select> would sit on a disabled option.
    expect(normalizePlanTypeSelection('diagram', confirmed(false, true))).toBe('general-undeveloped');
  });

  it('falls back to the first enabled option for an unknown value', () => {
    expect(normalizePlanTypeSelection('nonsense', confirmed(true, false))).toBe('diagram');
  });

  it('leaves any selection alone when nothing is confirmed', () => {
    expect(normalizePlanTypeSelection('diagram', null)).toBe('diagram');
  });
});
