/**
 * A saved diagram older than the survey's coordinates is out of date and is redrawn (Brackenhurst: the diagrams
 * kept the figures from before the 19 Nov re-import and disagreed with the Co-ordinate List).
 */
import { describe, it, expect } from 'vitest'
import { coordinatesChangedAt, diagramFileOf, outdatedDiagrams, DIAGRAM_DIR } from '../diagramFreshness'

const T = Date.parse('2026-11-19T10:00:00Z')
const before = T - 60_000
const after = T + 60_000
const file = (name: string, mtimeMs: number, relDir = DIAGRAM_DIR) => ({ name, relDir, mtimeMs })

describe('coordinatesChangedAt', () => {
  it("takes the re-import's marker or the latest rebuilt parcel, whichever is later", () => {
    expect(coordinatesChangedAt({ 'csv-import': { coordinates_changed_at: '2026-11-19T10:00:00Z' } }, [])).toBe(T)
    expect(coordinatesChangedAt({}, [
      { metadata: { reimport_rebuilt_at: '2026-11-18T10:00:00Z' } },
      { metadata: { reimport_rebuilt_at: '2026-11-19T10:00:00Z' } },
      { metadata: {} },
    ])).toBe(T)
  })
  it('is null when the coordinates were never re-imported', () => {
    expect(coordinatesChangedAt(undefined, [{ metadata: {} }])).toBeNull()
  })
})

describe('diagramFileOf', () => {
  it('reads the format and scale, and never claims another stand with a longer number', () => {
    expect(diagramFileOf('diagram-STAND_404_1-500.pdf', 'diagram-STAND_404')).toEqual({ format: 'pdf', scale: '1:500' })
    expect(diagramFileOf('diagram-STAND_404_1-500.zip', 'diagram-STAND_404')).toEqual({ format: 'dxf', scale: '1:500' })
    expect(diagramFileOf('diagram-STAND_404.gpkg', 'diagram-STAND_404')).toEqual({ format: 'gpkg', scale: null })
    expect(diagramFileOf('diagram-STAND_404_1-500.pdf', 'diagram-STAND_40')).toBeNull()
    expect(diagramFileOf('diagram-STAND_404_1-500-summary.pdf', 'diagram-STAND_404')).toBeNull()
  })
})

describe('outdatedDiagrams', () => {
  const subjects = [{ id: 403, baseName: 'diagram-STAND_403' }, { id: 404, baseName: 'diagram-STAND_404' }, { id: 405, baseName: 'diagram-STAND_405' }]

  it('names every diagram written before the coordinates changed, with its formats and old scale', () => {
    const files = [
      file('diagram-STAND_403_1-500.pdf', before), file('diagram-STAND_403_1-500.zip', before),
      file('diagram-STAND_404_1-750.pdf', after),                       // redrawn since: current
      file('diagram-STAND_405_1-1000.pdf', before),
      file('diagram-STAND_405_1-500.pdf', before, 'output/diagrams/superseded'),   // already set aside
      file('general-plan-X_1-500.pdf', before, 'output/general-plans'),
    ]
    const out = outdatedDiagrams({ files, subjects, changedAt: T })
    expect(out.map((o) => o.parcelId)).toEqual([403, 405])
    expect(out[0].files.map((f) => f.format)).toEqual(['pdf', 'dxf'])
    expect(out[0].scale).toBe('1:500')
    expect(out[1].scale).toBe('1:1000')
  })

  it("redraws at the newest old copy's scale when a stand has copies at two scales (Brackenhurst 403)", () => {
    const files = [
      file('diagram-STAND_403_1-1250.pdf', before), file('diagram-STAND_403_1-1250.zip', before),
      file('diagram-STAND_403_1-1000.pdf', before - 3_600_000), file('diagram-STAND_403_1-1000.zip', before - 3_600_000),
    ]
    const [o] = outdatedDiagrams({ files, subjects, changedAt: T })
    expect(o.files).toHaveLength(4)
    expect(o.scale).toBe('1:1250')
  })

  it('names nothing when the coordinates never changed, or a file time is unknown', () => {
    expect(outdatedDiagrams({ files: [file('diagram-STAND_403_1-500.pdf', before)], subjects, changedAt: null })).toEqual([])
    expect(outdatedDiagrams({ files: [file('diagram-STAND_403_1-500.pdf', 0)], subjects, changedAt: T })).toEqual([])
  })
})
