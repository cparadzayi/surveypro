import { describe, it, expect } from 'vitest'
import {
  planCascade,
  describeCascadeOutcome,
  type SnapCandidate,
  type VertexPoint,
  type CascadeParcel,
} from '../vertexSnap'

const v = (id: string, y: number, x: number): VertexPoint => ({ id, y, x })
const parcel = (id: number, designation: string, points: VertexPoint[]): CascadeParcel =>
  ({ id, designation, points })

/** The beacon being dragged away from, and the peg it is dropped on. */
const FROM = 'PEG_14'
const TO: SnapCandidate = {
  id: 'PEG_22',
  y: 97581.234,
  x: 2247733.567,
  status: 'P',
  description: 'iron peg',
  source: 'coordinate-point',
}

/** Three parcels meeting at PEG_14 — the shared-corner case this feature exists for. */
const threeSharers = (): CascadeParcel[] => [
  parcel(101, 'STAND 207', [v(FROM, 0, 0), v('B', 0, 10), v('C', 10, 10), v('D', 10, 0)]),
  parcel(102, 'STAND 208', [v('E', 0, -10), v(FROM, 0, 0), v('D', 10, 0), v('F', 10, -10)]),
  parcel(103, 'Outside Figure', [v('G', -10, 0), v('H', -10, 10), v('B', 0, 10), v(FROM, 0, 0)]),
]

describe('the cascade write set', () => {
  it('writes every parcel that shares the beacon, the edited one included', () => {
    // findAffectedParcels returns the edited parcel too, so the edited parcel and its
    // sharers go down ONE path -- requirement 4 by construction, not by a second branch.
    const plan = planCascade(FROM, TO, threeSharers())
    expect(plan.blockers).toEqual([])
    expect(plan.writes.map(w => w.designation)).toEqual(['STAND 207', 'STAND 208', 'Outside Figure'])
  })

  it('writes exactly one parcel when only one holds the beacon', () => {
    const plan = planCascade(FROM, TO, [threeSharers()[0]])
    expect(plan.writes).toHaveLength(1)
    expect(plan.writes[0].parcelId).toBe(101)
  })

  it('lands the SAME coordinates in every parcel — the coincidence invariant', () => {
    const plan = planCascade(FROM, TO, threeSharers())
    const landed = plan.writes.map(w => w.points.find(p => p.id === TO.id))
    expect(landed).toHaveLength(3)
    for (const point of landed) {
      expect(point).toEqual({ id: 'PEG_22', y: 97581.234, x: 2247733.567, status: 'P', description: 'iron peg' })
    }
  })

  it('substitutes at each parcel\'s own index, leaving ring order untouched', () => {
    const plan = planCascade(FROM, TO, threeSharers())
    expect(plan.writes[0].points.map(p => p.id)).toEqual(['PEG_22', 'B', 'C', 'D'])
    expect(plan.writes[1].points.map(p => p.id)).toEqual(['E', 'PEG_22', 'D', 'F'])
    expect(plan.writes[2].points.map(p => p.id)).toEqual(['G', 'H', 'B', 'PEG_22'])
  })

  it('leaves every other vertex of every parcel untouched', () => {
    const before = threeSharers()
    const plan = planCascade(FROM, TO, before)
    plan.writes.forEach((write, i) => {
      const original = before[i].points!
      expect(write.points).toHaveLength(original.length)
      write.points.forEach((p, j) => {
        if (original[j].id === FROM) return
        expect(p).toEqual(original[j])
      })
    })
  })

  it('writes nothing at all when ONE of three parcels blocks', () => {
    // All-or-nothing: a parcel left behind is the non-coincident boundary this
    // feature exists to prevent.
    const parcels = threeSharers()
    parcels[1].points = [v('E', 0, -10), v(FROM, 0, 0), v('PEG_22', 1, 1)]
    const plan = planCascade(FROM, TO, parcels)
    expect(plan.writes).toEqual([])
    expect(plan.blockers.map(b => b.designation)).toEqual(['STAND 208'])
  })
})

describe('describeCascadeOutcome', () => {
  it('says nothing when every parcel was written', () => {
    expect(describeCascadeOutcome({ written: ['STAND 207', 'STAND 208'], failed: [] })).toBeNull()
  })

  it('names the inconsistency in those terms when a write failed after a success', () => {
    // There is no cross-parcel transaction (spec Resolved decision 2), so the
    // surveyor must be told the boundaries now disagree -- never a console warning.
    const message = describeCascadeOutcome({
      written: ['STAND 207'],
      failed: [{ designation: 'STAND 208', message: 'Request failed with status code 500' }],
    })!
    expect(message).toMatch(/PARTIAL UPDATE/)
    expect(message).toMatch(/STAND 207/)
    expect(message).toMatch(/STAND 208 — Request failed with status code 500/)
    expect(message).toMatch(/Re-run/i)
  })

  it('says plainly that nothing was written when no parcel succeeded', () => {
    const message = describeCascadeOutcome({
      written: [],
      failed: [{ designation: 'STAND 207', message: 'no longer exists in the database' }],
    })!
    expect(message).not.toMatch(/PARTIAL UPDATE/)
    expect(message).toMatch(/boundaries are unchanged/)
    expect(message).toMatch(/STAND 207 — no longer exists in the database/)
  })

  it('lists every failure, not just the first', () => {
    const message = describeCascadeOutcome({
      written: ['A'],
      failed: [{ designation: 'B', message: 'x' }, { designation: 'C', message: 'y' }],
    })!
    expect(message).toMatch(/B — x/)
    expect(message).toMatch(/C — y/)
  })

  it('tolerates a malformed outcome without throwing', () => {
    expect(describeCascadeOutcome({} as any)).toBeNull()
  })
})
