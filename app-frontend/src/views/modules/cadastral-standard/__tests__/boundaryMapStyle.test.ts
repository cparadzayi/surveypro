import { describe, it, expect } from 'vitest'
import {
  basemapOpacities, zoomRamp, SATELLITE_FADE, STAND_LABEL_ZOOM, BEACON_LABEL_ZOOM,
  standLabelOpacity, standLabelSize, beaconLabelOpacity, labelPriority,
} from '../boundaryMapStyle'

describe('zoomRamp', () => {
  it('builds a linear zoom interpolation from stops', () => {
    expect(zoomRamp([[15, 0], [18, 1]])).toEqual(['interpolate', ['linear'], ['zoom'], 15, 0, 18, 1])
  })
})

describe('basemap opacity', () => {
  it('Auto: street always fully drawn, satellite fades 0 -> 1 across the fade range', () => {
    const o = basemapOpacities('auto')
    expect(o.street).toBe(1)
    expect(o.satellite).toEqual(['interpolate', ['linear'], ['zoom'], SATELLITE_FADE.from, 0, SATELLITE_FADE.to, 1])
  })
  it('the fade starts before the labels do, so imagery is there when stands are named', () => {
    expect(SATELLITE_FADE.from).toBeLessThan(STAND_LABEL_ZOOM.min)
    expect(SATELLITE_FADE.to).toBeGreaterThan(STAND_LABEL_ZOOM.full)
  })
  it('Satellite and Street are fixed, and street is never switched off underneath', () => {
    expect(basemapOpacities('satellite')).toEqual({ satellite: 1, street: 1 })
    expect(basemapOpacities('street')).toEqual({ satellite: 0, street: 1 })
  })
})

describe('label thresholds', () => {
  it('stand labels are invisible at their minimum zoom and full by STAND_LABEL_ZOOM.full', () => {
    expect(standLabelOpacity()).toEqual(['interpolate', ['linear'], ['zoom'], STAND_LABEL_ZOOM.min, 0, STAND_LABEL_ZOOM.full, 1])
  })
  it('stand labels grow with zoom and are bigger at the large threshold than at the minimum', () => {
    const stops = (standLabelSize() as any[]).slice(3)
    const at = (z: number) => stops[stops.indexOf(z) + 1]
    expect(at(STAND_LABEL_ZOOM.large)).toBeGreaterThan(at(STAND_LABEL_ZOOM.min))
  })
  it('beacon names come in after stand names', () => {
    expect(BEACON_LABEL_ZOOM.min).toBeGreaterThan(STAND_LABEL_ZOOM.full)
    expect(beaconLabelOpacity()).toEqual(['interpolate', ['linear'], ['zoom'], BEACON_LABEL_ZOOM.min, 0, BEACON_LABEL_ZOOM.full, 1])
  })
  it('the selected subject outranks a tagged stand, which outranks the rest', () => {
    expect(labelPriority(true, true)).toBe(0)
    expect(labelPriority(false, true)).toBe(1)
    expect(labelPriority(false, false)).toBe(2)
  })
})
