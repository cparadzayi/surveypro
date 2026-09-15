import { describe, test, expect } from '@jest/globals'
import proj4 from 'proj4'
import { prjForDxf } from '../crsDefinitions.js'

// capeLoToDxfSouthUp (dxfGenerator.js) emits DXF (x, y) = (−westing, −southing),
// i.e. true north-up east-right geodetic coordinates: easting relative to the Lo
// central meridian, northing negative in the southern hemisphere. So the .prj
// sidecar must be the plain north-up CRS (AXIS East/North); a West/South axis
// declaration would read those coordinates back north of the equator.
describe('prjForDxf — north-up AXIS declarations', () => {
  test('Lo 31 sidecar keeps the plain north-up WKT (AXIS East/North)', () => {
    const prj = prjForDxf('EPSG:22291')
    expect(prj).toContain('Cape_Lo_31')
    expect(prj).toContain('central_meridian",31')
    expect(prj).toContain('AXIS["Easting",EAST]')
    expect(prj).toContain('AXIS["Northing",NORTH]')
    expect(prj).not.toContain('AXIS["Easting",WEST]')
    expect(prj).not.toContain('AXIS["Northing",SOUTH]')
  })

  test('unrecognised projection falls back to Lo 31 north-up', () => {
    const prj = prjForDxf('EPSG:99999')
    expect(prj).toContain('Cape_Lo_31')
    expect(prj).toContain('AXIS["Northing",NORTH]')
  })

  test('WGS84 GEOGCS sidecar is passed through unchanged (no projected axes)', () => {
    const prj = prjForDxf('EPSG:4326')
    expect(prj).toContain('GEOGCS["WGS 84"')
    expect(prj).not.toContain('AXIS["Easting"')
  })

  test('accepts a bare numeric EPSG code', () => {
    expect(prjForDxf('22293')).toContain('Cape_Lo_29')
    expect(prjForDxf('22293')).toContain('AXIS["Northing",NORTH]')
  })
})

describe('proj4 round-trip — plain north-up .prj places the actual DXF geometry in Zimbabwe', () => {
  // Harare fixture (dxfGenerator.test.js): capeY = 50,000 (westing),
  // capeX = 2,200,000 (southing) → DXF (x, y) = (−50,000, −2,200,000).
  const dxfPoint = [-50000, -2200000]
  const proj4Base = '+proj=tmerc +lat_0=0 +lon_0=31 +ellps=clrk80 +towgs84=-134.73,-110.92,-292.66 +units=m +no_defs'
  proj4.defs('test-northup', proj4Base)

  test('reading the DXF point with the north-up sidecar lands in southern Zimbabwe (~19.9°S)', () => {
    const [lon, lat] = proj4('test-northup', 'EPSG:4326', dxfPoint)
    expect(lon).toBeCloseTo(30.5223, 3)
    expect(lat).toBeCloseTo(-19.8904, 3)
  })

  test('regression guard: interpreting the same point with West/South axes sends it north of the equator', () => {
    // easting = -x, northing = -y per AXIS["Easting",WEST],AXIS["Northing",SOUTH]
    const [lon, lat] = proj4('test-northup', 'EPSG:4326', [-dxfPoint[0], -dxfPoint[1]])
    expect(lat).toBeGreaterThan(19)
  })
})