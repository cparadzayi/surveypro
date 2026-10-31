import { describe, it, expect } from 'vitest'
import {
  applyRoadOrNeighbourTag, clearRoadOrNeighbourTag, roadOrNeighbourTag, taggedSubjectCount,
} from '../boundaryTagging'
import { hydrateAnnotationsMap, type SideAnnotation } from '../sideAnnotations'
import { hydrateServitudes, syncServitudeMirror, type Servitude } from '../servitudes'
import { adjoiningSubjectsFor } from '../sheetSubjects'

const road: SideAnnotation = { side: 'AB', role: 'road', label: 'Klein Road', widthM: 20 }
const servRec: Servitude = { id: 's1', subjectId: '8', side: 'AB', type: 'party-wall', widthM: 2 } as Servitude

describe('one role per side', () => {
  it('tagging a free side as a road touches nothing else', () => {
    const r = applyRoadOrNeighbourTag({}, [], 8, road, null)
    expect(r.annotations['8']).toEqual([road])
    expect(r.servitudesChanged).toBe(false)
  })
  it('a road on a side that held a servitude record replaces it, record and mirror both', () => {
    const mirrored = syncServitudeMirror({}, [servRec])
    expect(mirrored['8'][0].role).toBe('servitude')
    const r = applyRoadOrNeighbourTag(mirrored, [servRec], 8, road, servRec)
    expect(r.servitudes).toEqual([])
    expect(r.servitudesChanged).toBe(true)
    expect(r.annotations['8']).toEqual([road])
    // and a later sync (every servitude save does one) cannot bring the servitude back
    expect(syncServitudeMirror(r.annotations, r.servitudes)['8']).toEqual([road])
  })
  it('other sides of the subject and other subjects keep their tags', () => {
    const start = { '8': [{ side: 'BC', role: 'contiguous', label: 'STAND 9' } as SideAnnotation], '9': [road] }
    const r = applyRoadOrNeighbourTag(start, [], 8, road, null)
    expect(r.annotations['8'].map(a => a.side).sort()).toEqual(['AB', 'BC'])
    expect(r.annotations['9']).toEqual([road])
  })
  it('clearing removes a road / neighbour but never a servitude entry', () => {
    const start = { '8': [road, { side: 'BC', role: 'servitude', servitudeId: 's1' } as SideAnnotation] }
    expect(clearRoadOrNeighbourTag(start, 8, 'AB')['8'].map(a => a.side)).toEqual(['BC'])
    expect(clearRoadOrNeighbourTag(start, 8, 'BC')).toBe(start)
    expect(roadOrNeighbourTag(start, 8, 'BC')).toBeUndefined()
    expect(roadOrNeighbourTag(start, 8, 'AB')).toEqual(road)
  })
  it('counts tagged subjects for the status line', () => {
    expect(taggedSubjectCount({ '1': [road], '2': [] }, [1, 2, 3])).toEqual({ tagged: 1, total: 3 })
  })
})

describe('sheet subjects are tagged here and reach the plan', () => {
  it('a sheet-figure tag goes out with its sheet number', () => {
    const subs = [{ id: '7#sheet2', sheetNumber: 2, totalSheets: 2, label: 'Outside Figure Sheet 2', ring: [[0, 0], [0, 1], [1, 1], [0, 0]] as [number, number][] }]
    const r = applyRoadOrNeighbourTag({}, [], '7#sheet2', road, null)
    const out = adjoiningSubjectsFor(r.annotations, id => subs.find(s => s.id === id)?.ring ?? null, { outsideFigureId: 7, sheetSubjects: subs })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ subjectId: '7#sheet2', sheetNumber: 2 })
  })
})

describe('data saved before this screen existed still loads', () => {
  // As the Plan screen and the old Servitudes screen wrote them: numeric-string stand ids,
  // no sheet ids, servitude entries with and without a servitudeId, and a bad row or two.
  const savedAnnotations = {
    '12': [
      { side: 'AB', role: 'road', label: 'Gwelo Road', widthM: 20, destinationFrom: 'Gwelo', destinationTo: 'Gweru' },
      { side: 'BC', role: 'contiguous', label: 'STAND 13' },
      { side: 'CD', role: 'servitude', label: 'ZESA', widthM: 3, servitudeId: 's-1' },
    ],
    '15': [{ side: 'AB', role: 'servitude', label: 'legacy' }],
    '99': 'not a list',
  }
  const savedServitudes = [
    { id: 's-1', subjectId: '12', side: 'CD', type: 'other', beneficiary: 'ZESA', widthM: 3 },
    { id: 'bad' },
  ]
  it('hydrates annotations, dropping only what is not a list', () => {
    const a = hydrateAnnotationsMap(savedAnnotations)
    expect(Object.keys(a)).toEqual(['12', '15'])
    expect(a['12']).toHaveLength(3)
    expect(roadOrNeighbourTag(a, 12, 'AB')?.destinationTo).toBe('Gweru')
  })
  it('hydrates servitude records, dropping malformed ones', () => {
    expect(hydrateServitudes(savedServitudes).map(s => s.id)).toEqual(['s-1'])
  })
  it('the mirror rebuilt from old records keeps old roads and neighbours', () => {
    const a = syncServitudeMirror(hydrateAnnotationsMap(savedAnnotations), hydrateServitudes(savedServitudes))
    expect(a['12'].filter(x => x.role !== 'servitude').map(x => x.side)).toEqual(['AB', 'BC'])
    expect(a['12'].find(x => x.role === 'servitude')?.servitudeId).toBe('s-1')
  })
})

import { summariseBoundaries } from '../boundaryTagging'
describe('read-only boundaries summary (Plan screen)', () => {
  it('counts roads / servitudes / neighbours per subject and how many subjects are tagged', () => {
    const a = {
      '1': [{ side: 'AB', role: 'road' }, { side: 'BC', role: 'road' }, { side: 'CD', role: 'contiguous' }] as SideAnnotation[],
      '7#sheet2': [{ side: 'AB', role: 'servitude' }] as SideAnnotation[],
    }
    const s = summariseBoundaries(a, [{ id: 1, label: 'Stand 1' }, { id: 2, label: 'Stand 2' }, { id: '7#sheet2', label: 'Outside Figure Sheet 2' }])
    expect(s.tagged).toBe(2)
    expect(s.total).toBe(3)
    expect(s.rows[0]).toMatchObject({ roads: 2, neighbours: 1, servitudes: 0, total: 3 })
    expect(s.rows[1].total).toBe(0)
    expect(s.rows[2]).toMatchObject({ servitudes: 1, label: 'Outside Figure Sheet 2' })
  })
})
