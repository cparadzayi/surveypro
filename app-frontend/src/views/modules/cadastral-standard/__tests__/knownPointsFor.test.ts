// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { knownPointsFor } from '../storedSheets'
import { buildSheetPayloads } from '@/utils/sheetPayloads'

describe('knownPointsFor', () => {
  it('reads a coordinate point by its name (the plan view holds them as name/y/x)', () => {
    const known = knownPointsFor([], [{ name: 'CP2', y: 97319.014, x: 2248011.25 }])
    expect(known).toEqual([{ y: 97319.014, x: 2248011.25, id: 'CP2' }])
  })

  it('reads a coordinate point by its name even when it also carries a numeric database id', () => {
    const known = knownPointsFor([], [{ id: 4821, name: 'CP1', y: 97266.713, x: 2247924.0 }])
    expect(known).toEqual([{ y: 97266.713, x: 2247924, id: 'CP1' }])
  })

  it('a cut point within a centimetre of a coordinate point takes its name', () => {
    const P = (y: number, x: number) => ({ y, x })
    const ring = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)]
    const out = buildSheetPayloads({
      ring,
      polylines: [[P(50, 0), P(50, 100)]],
      stands: [],
      knownPoints: knownPointsFor([], [{ name: 'CP2', y: 50.004, x: 0 }]),
    } as any)
    if (!out.ok) throw new Error('expected ok')
    expect(out.sheets[0].newPoints.map((p) => p.name)).toContain('CP2')
  })
})
