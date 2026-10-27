import { describe, expect, it } from 'vitest'
import { describeDxfWarnings, describeGenerationOutcome } from '../planOutcome'
import { parseWarningsHeader } from '../../../../utils/planWarnings'

const base = { subdir: 'general-plans', saved: [], skipped: [], notDrawn: [], warnings: [] }

describe('describeGenerationOutcome', () => {
  it('is a plain, self-clearing success when everything saved cleanly', () => {
    const n = describeGenerationOutcome({ ...base, saved: ['plan_1-600.pdf', 'plan_1-600-summary.pdf'] })
    expect(n).toMatchObject({ kind: 'success', title: 'Plan generated', sticky: false })
    expect(n.message).toBe('Saved 2 files to output/general-plans/.')
    expect(n.details).toEqual(['plan_1-600.pdf', 'plan_1-600-summary.pdf'])
  })

  it('says "file" for one', () => {
    expect(describeGenerationOutcome({ ...base, saved: ['a.pdf'] }).message).toBe('Saved 1 file to output/general-plans/.')
  })

  it('is a warning, but not sticky, when only an existing file was kept', () => {
    const n = describeGenerationOutcome({ ...base, saved: ['a.pdf'], skipped: ['a.dxf'] })
    expect(n.kind).toBe('warning')
    expect(n.sticky).toBe(false)
    expect(n.details).toContain('Kept existing (not overwritten): a.dxf')
  })

  it('stays up until dismissed when the generators warned about something', () => {
    const n = describeGenerationOutcome({
      ...base, saved: ['a.pdf'],
      warnings: ['Plan too dense for largest available paper size; some blocks may overlap the figure.'],
    })
    expect(n.kind).toBe('warning')
    expect(n.sticky).toBe(true)
    expect(n.details.at(-1)).toBe('Check: Plan too dense for largest available paper size; some blocks may overlap the figure.')
  })

  it('stays up when parcels could not be drawn, naming them', () => {
    const n = describeGenerationOutcome({ ...base, saved: ['wp.dxf'], notDrawn: ['STAND 12', 'STAND 13'] })
    expect(n.sticky).toBe(true)
    expect(n.details).toEqual(['wp.dxf', 'Not drawn (no named boundary points): STAND 12', 'Not drawn (no named boundary points): STAND 13'])
  })

  it('does not call it a success when nothing was saved', () => {
    const kept = describeGenerationOutcome({ ...base, skipped: ['a.pdf'] })
    expect(kept.title).toBe('Nothing new was saved')
    expect(kept.message).toMatch(/already exists.*kept/)
    expect(kept.kind).toBe('warning')
    expect(describeGenerationOutcome(base).message).toMatch(/no files were written/i)
  })
})

describe('describeDxfWarnings', () => {
  it('turns the counts into sentences', () => {
    expect(describeDxfWarnings({ beacons: 3, parcels: 1, beaconDescTruncated: 2, priorDiagramsTruncated: 1, scaleFallback: true })).toEqual([
      '3 beacon(s) were left out of the DXF.',
      '1 parcel(s) were left out of the DXF.',
      '2 beacon description(s) were shortened to fit.',
      '1 prior diagram reference(s) were shortened to fit.',
      'The DXF scale fell back to 1:500.',
    ])
  })
  it('says nothing for nothing', () => {
    expect(describeDxfWarnings(null)).toEqual([])
    expect(describeDxfWarnings({})).toEqual([])
    expect(describeDxfWarnings({ beacons: 0, scaleFallback: false })).toEqual([])
  })
})

describe('parseWarningsHeader', () => {
  it('reads the array the backend sends', () => {
    expect(parseWarningsHeader(JSON.stringify(['One.', 'Sheet 2: Two.']))).toEqual(['One.', 'Sheet 2: Two.'])
  })
  it('reads anything else as "no warnings" rather than failing the generation', () => {
    for (const v of [undefined, null, '', '   ', 'not json', '{"a":1}', '42', 7]) expect(parseWarningsHeader(v)).toEqual([])
    expect(parseWarningsHeader(JSON.stringify(['ok', '', 5, null]))).toEqual(['ok'])
  })
})
