import { describe, it, expect } from 'vitest';
import {
  inferComposition,
  normalizeComposition,
  allowsFamily,
  describeComposition,
  type RecordComposition,
} from '../recordComposition';

const confirmed = (includesDiagrams: boolean, includesGeneralPlans: boolean): RecordComposition => ({
  includesDiagrams,
  includesGeneralPlans,
  source: 'confirmed',
  confirmedAt: '2026-09-10T08:00:00.000Z',
});

describe('inferComposition', () => {
  it('infers neither family from zero parcels', () => {
    expect(inferComposition(0)).toEqual({
      includesDiagrams: false,
      includesGeneralPlans: false,
      source: 'inferred',
    });
  });

  it('infers Diagrams from a single parcel', () => {
    const c = inferComposition(1);
    expect(c.includesDiagrams).toBe(true);
    expect(c.includesGeneralPlans).toBe(false);
  });

  it('still infers Diagrams from two parcels — below the SI 727 s61(1)(a) threshold', () => {
    const c = inferComposition(2);
    expect(c.includesDiagrams).toBe(true);
    expect(c.includesGeneralPlans).toBe(false);
  });

  it('infers General Plans from three parcels — the SI 727 s61(1)(a) threshold', () => {
    const c = inferComposition(3);
    expect(c.includesGeneralPlans).toBe(true);
    expect(c.includesDiagrams).toBe(false);
  });

  it('infers General Plans from many parcels', () => {
    const c = inferComposition(47);
    expect(c.includesGeneralPlans).toBe(true);
    expect(c.includesDiagrams).toBe(false);
  });

  it('never marks an inference confirmed', () => {
    const c = inferComposition(47);
    expect(c.source).toBe('inferred');
    expect(c.confirmedAt).toBeUndefined();
  });

  it('treats a negative or non-numeric count as no parcels', () => {
    expect(inferComposition(-1).includesDiagrams).toBe(false);
    expect(inferComposition(-1).includesGeneralPlans).toBe(false);
    expect(inferComposition(Number.NaN).includesDiagrams).toBe(false);
    expect(inferComposition(Number.NaN).includesGeneralPlans).toBe(false);
  });
});

describe('normalizeComposition', () => {
  it('round-trips a well-formed confirmed record', () => {
    expect(normalizeComposition(confirmed(true, true))).toEqual({
      includesDiagrams: true,
      includesGeneralPlans: true,
      source: 'confirmed',
      confirmedAt: '2026-09-10T08:00:00.000Z',
    });
  });

  it('returns null for missing jsonb', () => {
    expect(normalizeComposition(null)).toBeNull();
    expect(normalizeComposition(undefined)).toBeNull();
  });

  it('returns null for a non-object', () => {
    expect(normalizeComposition('general plans')).toBeNull();
    expect(normalizeComposition(3)).toBeNull();
    expect(normalizeComposition(true)).toBeNull();
    expect(normalizeComposition([{ includesDiagrams: true }])).toBeNull();
  });

  it('returns null when neither family is set — not a usable composition', () => {
    expect(normalizeComposition({ source: 'confirmed' })).toBeNull();
    expect(normalizeComposition({ includesDiagrams: false, includesGeneralPlans: false, source: 'confirmed' })).toBeNull();
  });

  it('keeps a partial record when one family is set, defaulting the missing flag to false', () => {
    expect(normalizeComposition({ includesGeneralPlans: true, source: 'confirmed' })).toEqual({
      includesDiagrams: false,
      includesGeneralPlans: true,
      source: 'confirmed',
    });
  });

  it('treats non-boolean flag values as false', () => {
    expect(normalizeComposition({ includesDiagrams: 'yes', includesGeneralPlans: true, source: 'confirmed' })).toEqual({
      includesDiagrams: false,
      includesGeneralPlans: true,
      source: 'confirmed',
    });
    expect(normalizeComposition({ includesDiagrams: 1, includesGeneralPlans: 0, source: 'confirmed' })).toBeNull();
  });

  it('downgrades an unknown or missing source to inferred, so malformed data can never gate', () => {
    expect(normalizeComposition({ includesDiagrams: true })?.source).toBe('inferred');
    expect(normalizeComposition({ includesDiagrams: true, source: 'whatever' })?.source).toBe('inferred');
    expect(normalizeComposition({ includesDiagrams: true, source: 'inferred' })?.source).toBe('inferred');
  });

  it('drops a non-string confirmedAt', () => {
    const c = normalizeComposition({ includesDiagrams: true, source: 'confirmed', confirmedAt: 1757491200000 });
    expect(c?.confirmedAt).toBeUndefined();
    expect(c?.source).toBe('confirmed');
  });

  it('ignores unknown keys', () => {
    expect(normalizeComposition({ includesDiagrams: true, source: 'confirmed', parcelCount: 47 })).toEqual({
      includesDiagrams: true,
      includesGeneralPlans: false,
      source: 'confirmed',
    });
  });
});

describe('allowsFamily', () => {
  it('allows only diagrams (and working plans) for a confirmed Diagrams-only record', () => {
    const c = confirmed(true, false);
    expect(allowsFamily(c, 'diagram')).toBe(true);
    expect(allowsFamily(c, 'general')).toBe(false);
    expect(allowsFamily(c, 'working')).toBe(true);
  });

  it('allows only general plans (and working plans) for a confirmed General-Plans-only record', () => {
    const c = confirmed(false, true);
    expect(allowsFamily(c, 'diagram')).toBe(false);
    expect(allowsFamily(c, 'general')).toBe(true);
    expect(allowsFamily(c, 'working')).toBe(true);
  });

  it('allows every family for a confirmed record that includes both', () => {
    const c = confirmed(true, true);
    expect(allowsFamily(c, 'diagram')).toBe(true);
    expect(allowsFamily(c, 'general')).toBe(true);
    expect(allowsFamily(c, 'working')).toBe(true);
  });

  it('allows every family when no composition exists — gating is a no-op until confirmed', () => {
    expect(allowsFamily(null, 'diagram')).toBe(true);
    expect(allowsFamily(null, 'general')).toBe(true);
    expect(allowsFamily(null, 'working')).toBe(true);
    expect(allowsFamily(undefined, 'diagram')).toBe(true);
  });

  it('allows every family for an inferred composition — a guess never blocks the surveyor', () => {
    const guess = inferComposition(47); // general plans, unconfirmed
    expect(allowsFamily(guess, 'diagram')).toBe(true);
    expect(allowsFamily(guess, 'general')).toBe(true);
    expect(allowsFamily(guess, 'working')).toBe(true);
  });
});

describe('describeComposition', () => {
  it('describes a confirmed Diagrams-only record', () => {
    const d = describeComposition(confirmed(true, false));
    expect(d.label).toBe('Diagrams only');
    expect(d.reason).toBe('This record is configured as Diagrams only. Change it in Record Composition above.');
  });

  it('describes a confirmed General-Plans-only record', () => {
    const d = describeComposition(confirmed(false, true));
    expect(d.label).toBe('General Plans only');
    expect(d.reason).toBe('This record is configured as General Plans only. Change it in Record Composition above.');
  });

  it('describes a confirmed record that includes both, with nothing to block', () => {
    const d = describeComposition(confirmed(true, true));
    expect(d.label).toBe('General Plans and Diagrams');
    expect(d.reason).toBeNull();
  });

  it('describes the unconfirmed state', () => {
    const d = describeComposition(null);
    expect(d.label).toBe('Not yet confirmed');
    expect(d.reason).toBeNull();
  });

  it('labels an inferred composition by its families but gives no blocking reason', () => {
    const d = describeComposition(inferComposition(47));
    expect(d.label).toBe('General Plans only');
    expect(d.reason).toBeNull();
  });

  it('reports an empty inference as unconfirmed rather than as a configured record', () => {
    const d = describeComposition(inferComposition(0));
    expect(d.label).toBe('Not yet confirmed');
    expect(d.reason).toBeNull();
  });
});
