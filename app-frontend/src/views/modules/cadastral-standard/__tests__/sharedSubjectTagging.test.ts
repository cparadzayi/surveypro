import { describe, it, expect } from 'vitest'
import { openSideEditor, sideEditorToAnnotation, clickedEndOnSide } from '../sideEditor'
import { resolveSubjectClick } from '../subjectMapLayers'
import { findOutsideFigureParcel, outsideFigureCapeLoRing } from '../storedSheets'
import { buildSheetSubjects } from '../sheetSubjects'

describe('side editor', () => {
  it('a fresh tag takes the abutment of where the side was clicked', () => {
    expect(openSideEditor('AB', undefined, 'from')).toMatchObject({ side: 'AB', role: 'contiguous', end: 'from', widthM: null })
  })
  it('an existing contiguous tag keeps its stored abutment; a road ignores the click', () => {
    expect(openSideEditor('AB', { side: 'AB', role: 'contiguous', end: 'mid', label: 'X' }, 'to').end).toBe('mid')
    expect(openSideEditor('AB', { side: 'AB', role: 'road', label: 'R', widthM: 20 }, 'to')).toMatchObject({ role: 'road', end: 'to', widthM: 20 })
  })
  it('saving drops the fields that do not apply to the role', () => {
    const ann = sideEditorToAnnotation({ side: 'AB', role: 'servitude', label: ' S ', widthM: 3, destinationFrom: 'G', destinationTo: 'H', end: 'both' })
    expect(ann).toEqual({ side: 'AB', role: 'servitude', label: 'S', widthM: 3, destinationFrom: undefined, destinationTo: undefined, end: undefined })
  })
  it('click position along a side picks the terminal (thirds)', () => {
    expect(clickedEndOnSide([0, 0], [90, 0], [10, 0])).toBe('from')
    expect(clickedEndOnSide([0, 0], [90, 0], [45, 0])).toBe('both')
    expect(clickedEndOnSide([0, 0], [90, 0], [80, 0])).toBe('to')
  })
})

/** A fake map: `layers` are the layer ids that exist, `rendered` what a query returns per layer set. */
function fakeMap(layers: string[], hitsFor: (ids: string[]) => any[]) {
  return { getLayer: (id: string) => (layers.includes(id) ? {} : undefined), queryRenderedFeatures: (_p: any, o: any) => hitsFor(o.layers) } as any
}
const sheetRings = [
  { id: '7#sheet1', ring: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] as [number, number][] },
  { id: '7#sheet2', ring: [[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]] as [number, number][] },
]
const base = { point: { x: 1, y: 1 }, sidesHitLayer: 'sides-hit', parcels: [{ id: 7, area_m2: 1e6 }, { id: 8, area_m2: 100 }], excludeFigureId: 7 }

describe('resolveSubjectClick (layer order cannot hide a sheet)', () => {
  it('a side of the selected subject wins over everything', () => {
    const m = fakeMap(['sides-hit', 'parcel-8-fill'], (ids) => ids[0] === 'sides-hit' ? [{ properties: { side: 'AB' }, geometry: { coordinates: [[0, 0], [1, 1]] } }] : [{ layer: { id: 'parcel-8-fill' } }])
    expect(resolveSubjectClick({ ...base, map: m, lngLat: { lng: 5, lat: 5 }, sheetRings })).toMatchObject({ side: 'AB' })
  })
  it('a stand under the click wins over a sheet', () => {
    const m = fakeMap(['parcel-8-fill'], () => [{ layer: { id: 'parcel-8-fill' } }])
    expect(resolveSubjectClick({ ...base, map: m, lngLat: { lng: 5, lat: 5 }, sheetRings })).toEqual({ subjectId: 8 })
  })
  it('no stand: the sheet holding the click is picked, even though the whole-figure fill is under it', () => {
    // The unsplit figure's own fill layer exists and would be hit -- it is excluded, never asked.
    const asked: string[][] = []
    const m = fakeMap(['parcel-7-fill', 'parcel-8-fill'], (ids) => { asked.push(ids); return [] })
    expect(resolveSubjectClick({ ...base, map: m, lngLat: { lng: 15, lat: 5 }, sheetRings })).toEqual({ subjectId: '7#sheet2' })
    expect(asked.flat()).not.toContain('parcel-7-fill')
  })
  it('a click outside every sheet selects nothing', () => {
    const m = fakeMap([], () => [])
    expect(resolveSubjectClick({ ...base, map: m, lngLat: { lng: 50, lat: 50 }, sheetRings })).toBeNull()
  })
  it('single sheet (no sheet rings, nothing excluded): the outside figure is still picked as before', () => {
    const m = fakeMap(['parcel-7-fill'], () => [{ layer: { id: 'parcel-7-fill' } }])
    expect(resolveSubjectClick({ ...base, excludeFigureId: null, map: m, lngLat: { lng: 5, lat: 5 }, sheetRings: [] })).toEqual({ subjectId: 7 })
  })
})

describe('outside figure lookup shared by Plan and Servitudes', () => {
  it('finds the figure by designation or metadata flag, and none otherwise', () => {
    expect(findOutsideFigureParcel([{ id: 1, stand: '5' }, { id: 2, designation: 'Outside Figure' }])?.id).toBe(2)
    expect(findOutsideFigureParcel([{ id: 3, metadata: { isOutsideFigure: true } }])?.id).toBe(3)
    expect(findOutsideFigureParcel([{ id: 1, stand: '5' }])).toBeNull()
  })
  it('its ring is closed and keeps point names', () => {
    const ring = outsideFigureCapeLoRing({ metadata: { cape_lo_points: [{ x: 0, y: 0, id: 'M1' }, { x: 0, y: 5 }, { x: 5, y: 5 }] } })
    expect(ring).toHaveLength(4)
    expect(ring![0].id).toBe('M1')
    expect(ring![3]).toMatchObject({ x: 0, y: 0 })
    expect(outsideFigureCapeLoRing(null)).toBeNull()
  })
  it('feeds buildSheetSubjects only for two or more sheets', () => {
    expect(buildSheetSubjects(7, undefined)).toEqual([])
  })
})
