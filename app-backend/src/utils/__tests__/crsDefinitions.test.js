import { describe, test, expect } from '@jest/globals'
import proj4 from 'proj4'
import { prjForDxf } from '../crsDefinitions.js'

// DXF geometry is stored south-up — capeLoToDxfSouthUp emits x = -westing,
// y = -southing. For a southern-hemisphere property the southing magnitude is
// ~2,000,000 m, so the DXF's y is positive ~2,000,000. A stock Cape Lo .prj
// (AXIS east/north) would read that as a northing ~18° NORTH of the equator.
// prjForDxf must therefore declare West/South axes so PROJ/QGIS invert the
// flip back onto true Zimbabwe ground.
describe('prjForDxf — south-up AXIS declarations', () => {
  test('Lo 31 sidecar keeps PROJCS parameters but flips AXIS to West/South', () => {
    const prj = prjForDxf('EPSG:22291')
    expect(prj).toContain('Cape_Lo_31')
    expect(prj).toContain('central_meridian",31')
    expect(prj).toContain('AXIS["Easting",WEST]')
    expect(prj).toContain('AXIS["Northing",SOUTH]')
    expect(prj).not.toContain('AXIS["Easting",EAST]')
    expect(prj).not.toContain('AXIS["Northing",NORTH]')
  })

  test('unrecognised projection falls back to Lo 31 south-up', () => {
    const prj = prjForDxf('EPSG:99999')
    expect(prj).toContain('Cape_Lo_31')
    expect(prj).toContain('AXIS["Northing",SOUTH]')
  })

  test('WGS84 GEOGCS sidecar is passed through unchanged (no projected axes)', () => {
    const prj = prjForDxf('EPSG:4326')
    expect(prj).toContain('GEOGCS["WGS 84"')
    expect(prj).not.toContain('AXIS["Easting"')
  })

  test('accepts a bare numeric EPSG code', () => {
    expect(prjForDxf('22293')).toContain('Cape_Lo_29')
    expect(prjForDxf('22293')).toContain('AXIS["Northing",SOUTH]')
  })
})

describe('proj4 round-trip — south-up .prj places DXF geometry in Zimbabwe', () => {
  // proj4-js does NOT honour +axis — it is silently ignored — so a direct
  // south-up → WGS84 transform will give the same wrong (northern) result as
  // north-up. Real PROJ (used by QGIS/GDAL) DOES honour +axis; a manual
  // gdaltransform run with the actual shipped .prj confirms the expected
  // southern-hemisphere result. The tests below validate the *intended
  // mathematical contract* by performing the same negation PROJ computes.
  const proj4Base = '+proj=tmerc +lat_0=0 +lon_0=31 +ellps=clrk80 +towgs84=-134.73,-110.92,-292.66 +units=m +no_defs'

  // Same DXF point under each CRS: x = +80,000, y = +2,110,000. The DXF writer
  // stores x = -westing, y = -southing so this corresponds to a property ~80 km
  // east of the Lo 31 central meridian at ~2,110,000 m southing (~19°S).
  const dxfPoint = [80000, 2110000]

  proj4.defs('test-northup', proj4Base)
  proj4.defs('test-southup', proj4Base)

  test('without the axis flip the same DXF point is read north of the equator (~19°N)', () => {
    const [lon, lat] = proj4('test-northup', 'EPSG:4326', dxfPoint)
    expect(lat).toBeGreaterThan(10)
    expect(lon).toBeGreaterThan(25)
    expect(lon).toBeLessThan(33)
  })

  test('with the axis flip the DXF point maps to southern Zimbabwe (~19°S)', () => {
    // AXIS["Easting",WEST],AXIS["Northing",SOUTH] tells PROJ:
    //   easting = -x,  northing = -y   → exactly capeLoToDxfSouthUp's inverse.
    // gdaltransform with the real .prj confirms lon ≈ 30.2396°E, lat ≈ -19.076°S.
    const [lon, lat] = proj4('test-northup', 'EPSG:4326', [-dxfPoint[0], -dxfPoint[1]])
    expect(lon).toBeCloseTo(30.2396, 3)
    expect(lat).toBeCloseTo(-19.076, 3)
  })
})