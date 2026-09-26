/**
 * A beacon's status answers two questions, and it has to answer both.
 *
 * WHAT KIND of mark it is decides the Fifth Schedule symbol the working plan
 * draws and the section it falls under in the Co-ordinate List: a working
 * station, a reference mark, a trig beacon.
 *
 * HOW IT CAME TO BE THERE is the Co-ordinate List's own F/P column, which the
 * Surveyor-General's form heads "F = Found  P = Placed".
 *
 * The codes are independent, and the existing vocabulary could only carry one
 * of them. A station you set out and a station you recovered from an earlier
 * survey were both just "WS", and coding either one "P" or "F" instead lost the
 * fact that it was a station at all. The SG's own sample coordinate list shows
 * both at once -- ST1AD sits under the "Working Stations" heading AND carries P
 * in the F/P column -- so a status has to be able to say both.
 *
 * "WS/P" says both. A bare "WS" or a bare "P" still means exactly what it
 * always did, so nothing already recorded changes meaning.
 */

import { describe, it, expect } from 'vitest';
import { parseBeaconStatus, statusKind, statusProvenance } from '../beaconStatus';

describe('parseBeaconStatus', () => {
  it('reads a compound status as both facts', () => {
    expect(parseBeaconStatus('WS/P')).toMatchObject({ kind: 'WS', provenance: 'P' });
    expect(parseBeaconStatus('WS/F')).toMatchObject({ kind: 'WS', provenance: 'F' });
    expect(parseBeaconStatus('WSU/F')).toMatchObject({ kind: 'WSU', provenance: 'F' });
    expect(parseBeaconStatus('RM/P')).toMatchObject({ kind: 'RM', provenance: 'P' });
  });

  it('does not care which way round the surveyor wrote it', () => {
    expect(parseBeaconStatus('P/WS')).toMatchObject({ kind: 'WS', provenance: 'P' });
  });

  it('leaves a bare kind meaning what it always meant', () => {
    expect(parseBeaconStatus('WS')).toMatchObject({ kind: 'WS', provenance: null });
    expect(parseBeaconStatus('TRIG')).toMatchObject({ kind: 'TRIG', provenance: null });
    expect(parseBeaconStatus('OCP')).toMatchObject({ kind: 'OCP', provenance: null });
  });

  it('leaves a bare provenance meaning what it always meant', () => {
    expect(parseBeaconStatus('P')).toMatchObject({ kind: null, provenance: 'P' });
    expect(parseBeaconStatus('F')).toMatchObject({ kind: null, provenance: 'F' });
    expect(parseBeaconStatus('FN')).toMatchObject({ kind: null, provenance: 'FN' });
  });

  it('is indifferent to case and stray whitespace', () => {
    expect(parseBeaconStatus(' ws / p ')).toMatchObject({ kind: 'WS', provenance: 'P' });
    expect(parseBeaconStatus('Ws/f')).toMatchObject({ kind: 'WS', provenance: 'F' });
  });

  it('reports nothing it cannot read, rather than guessing', () => {
    expect(parseBeaconStatus('')).toMatchObject({ kind: null, provenance: null });
    expect(parseBeaconStatus(null)).toMatchObject({ kind: null, provenance: null });
    expect(parseBeaconStatus('QQ')).toMatchObject({ kind: null, provenance: null });
    // A half it cannot read must not discard the half it can.
    expect(parseBeaconStatus('WS/QQ')).toMatchObject({ kind: 'WS', provenance: null });
  });

  it('lets the more specific provenance win when both are written', () => {
    // 87D of Brackenhurst is recorded "F/FN". Read as two provenances the pair
    // contradicts itself -- F is found AND adopted, FN is found and NOT adopted
    // -- and taking whichever came first made a rejected beacon draw as an
    // accepted one. FN is the narrower claim, so FN is the one that stands.
    expect(parseBeaconStatus('F/FN')).toMatchObject({ provenance: 'FN' });
    expect(parseBeaconStatus('FN/F')).toMatchObject({ provenance: 'FN' });
  });

  it('keeps the raw text, for a column that prints what was recorded', () => {
    expect(parseBeaconStatus('ws/p').raw).toBe('ws/p');
  });
});

describe('the accessors', () => {
  it('give the two halves directly', () => {
    expect(statusKind('WS/P')).toBe('WS');
    expect(statusProvenance('WS/P')).toBe('P');
    expect(statusKind('P')).toBeNull();
    expect(statusProvenance('WS')).toBeNull();
  });
});

describe('the "-" provenance', () => {
  it('reads a bare dash as neither found nor placed', () => {
    const s = parseBeaconStatus('-')
    expect(s.provenance).toBe('-')
    expect(s.kind).toBeNull()
  })

  it('reads a dash alongside a kind, as the slash form allows', () => {
    const s = parseBeaconStatus('WS/-')
    expect(s.kind).toBe('WS')
    expect(s.provenance).toBe('-')
  })
})
