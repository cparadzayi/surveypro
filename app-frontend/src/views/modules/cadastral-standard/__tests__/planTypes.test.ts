import { getPlanTypeMeta, PLAN_TYPE_META } from '../planTypes'

describe('getPlanTypeMeta', () => {
  it('marks diagram as single-parcel with no summary', () => {
    const m = getPlanTypeMeta('diagram')
    expect(m.subjectMode).toBe('single-parcel')
    expect(m.includesSummary).toBe(false)
    expect(m.label).toBe('Diagram')
  })

  it('marks the two general plans as whole-set with a summary', () => {
    expect(getPlanTypeMeta('general-undeveloped').subjectMode).toBe('whole-set')
    expect(getPlanTypeMeta('general-undeveloped').includesSummary).toBe(true)
    expect(getPlanTypeMeta('general-developed').includesSummary).toBe(true)
  })

  it('marks working-plan as whole-set with no summary', () => {
    const m = getPlanTypeMeta('working-plan')
    expect(m.subjectMode).toBe('whole-set')
    expect(m.includesSummary).toBe(false)
  })

  it('falls back to general-undeveloped for unknown input', () => {
    expect(getPlanTypeMeta('nonsense').key).toBe('general-undeveloped')
  })

  it('exposes all four keys', () => {
    expect(Object.keys(PLAN_TYPE_META).sort()).toEqual(
      ['diagram', 'general-developed', 'general-undeveloped', 'working-plan']
    )
  })
})
