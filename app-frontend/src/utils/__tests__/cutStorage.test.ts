// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readCuts, writeCuts } from '../cutStorage';

const P = (y: number, x: number) => ({ y, x });

describe('readCuts', () => {
  it('reads what writeCuts wrote', () => {
    const cut = { vertices: [P(50, 0), P(50, 100)] };
    expect(readCuts(writeCuts({}, [cut]))).toEqual([cut]);
  });

  it('is empty for a project that has never been split', () => {
    expect(readCuts({})).toEqual([]);
    expect(readCuts(undefined)).toEqual([]);
    expect(readCuts(null)).toEqual([]);
  });

  it('is empty rather than throwing on rubbish', () => {
    // Metadata is stored JSON and reaches us from a database, so it can be
    // anything. A malformed cut must not break plan generation.
    expect(readCuts({ figureCuts: 'nonsense' })).toEqual([]);
    expect(readCuts({ figureCuts: [{ vertices: 'no' }] })).toEqual([]);
    expect(readCuts({ figureCuts: [{ vertices: [{ y: 1 }] }] })).toEqual([]);
  });

  it('drops a cut with fewer than two vertices', () => {
    expect(readCuts({ figureCuts: [{ vertices: [P(1, 2)] }] })).toEqual([]);
  });
});

describe('writeCuts', () => {
  it('does not mutate the metadata it was given', () => {
    const meta = { designation: 'Stands 1686-1687' };
    writeCuts(meta, [{ vertices: [P(50, 0), P(50, 100)] }]);
    expect(Object.keys(meta)).toEqual(['designation']);
  });

  it('leaves every other metadata key alone', () => {
    const out = writeCuts({ designation: 'X', centralMeridian: 31 }, []);
    expect(out.designation).toBe('X');
    expect(out.centralMeridian).toBe(31);
  });

  it('stores only the vertices, never anything derived from them', () => {
    // Decision 10's reasoning: sheet numbers are derived, not stored, so they
    // cannot go stale. Parts, letters and created-point names are the same.
    const stored = writeCuts({}, [{ vertices: [P(50, 0), P(50, 100)] }]) as Record<string, unknown>;
    expect(JSON.stringify(stored)).not.toMatch(/sheetNumber|parts|letter|Outside Figure/);
  });
});