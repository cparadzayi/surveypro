import { describe, it, expect } from 'vitest'
import { mergeControlNames, controlKey } from '../reportControl'

// The scenic 1 project: the report was saved with one trig name and 6091/V typed by hand, before the control
// selection (333/S, 332/S, 334/S from the registry; 6091/V carried from the calibration) was made.
const selected = [
  { label: '6091/V', ocp: true },
  { label: '333/S (Sebanga)', ocp: false },
  { label: '332/S (Aberfoyle)', ocp: false },
  { label: '334/S (Mont Dor)', ocp: false },
]

describe('mergeControlNames', () => {
  it('adds the stations a saved report is missing, keeping what is written', () => {
    const r = mergeControlNames({ trig: ['333/S (Sebanga)'], ocp: ['6091/V'] }, selected)
    expect(r.trig).toEqual(['333/S (Sebanga)', '332/S (Aberfoyle)', '334/S (Mont Dor)'])
    expect(r.ocp).toEqual(['6091/V'])
    expect(r.addedTrig).toBe(2)
    expect(r.addedOcp).toBe(0)
  })

  it('puts an OCP in the official-control list, not the trig list', () => {
    const r = mergeControlNames({}, selected)
    expect(r.ocp).toEqual(['6091/V'])
    expect(r.trig).not.toContain('6091/V')
  })

  it('does not name a station twice, with or without its monument name', () => {
    const r = mergeControlNames({ trig: ['333/S'] }, [{ label: '333/S (Sebanga)', ocp: false }])
    expect(r.trig).toEqual(['333/S'])
    expect(r.addedTrig).toBe(0)
  })

  it('does not name an OCP already typed in the trig list a second time', () => {
    const r = mergeControlNames({ trig: ['6091/V'] }, [{ label: '6091/V', ocp: true }])
    expect(r.ocp).toEqual([])
    expect(r.trig).toEqual(['6091/V'])
  })

  it('is safe to run again: a second merge adds nothing', () => {
    const once = mergeControlNames({ trig: ['333/S (Sebanga)'], ocp: ['6091/V'] }, selected)
    const twice = mergeControlNames({ trig: once.trig, ocp: once.ocp }, selected)
    expect(twice.addedTrig + twice.addedOcp).toBe(0)
    expect(twice.trig).toEqual(once.trig)
  })

  it('keys on the designation alone', () => {
    expect(controlKey('333/S (Sebanga)')).toBe('333/S')
    expect(controlKey(' 6091/v ')).toBe('6091/V')
  })
})
