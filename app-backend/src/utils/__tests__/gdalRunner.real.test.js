import { describe, test, expect } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { creationArgs, driverSupport, gdalVersion, locateTool, runGdal, vrtOf } from '../gdalRunner.js'

/**
 * The same checks against whatever GDAL is installed on this machine, so the parsers are known to match
 * what a real build prints. Skipped (not failed) on a host with no GDAL. It asserts what the tool reports,
 * never a particular version.
 */
const ogr = await locateTool('ogr2ogr')
const maybe = ogr ? describe : describe.skip

maybe('the installed GDAL', () => {
  test('reports a version line that parses', async () => {
    const v = await gdalVersion(ogr)
    expect(v.major).toBeGreaterThanOrEqual(2)
    expect(v.text).toMatch(/GDAL/)
  })

  test('says what it can write', async () => {
    expect(await driverSupport(ogr, 'GPKG')).toMatchObject({ write: true })
    expect(await driverSupport(ogr, 'NoSuchDriver')).toBeNull()
  })

  test('the PDF driver\'s options decide what is passed, and in which form', async () => {
    const pdf = await driverSupport(ogr, 'PDF')
    if (!pdf?.write) return
    const { args, dropped } = await creationArgs(ogr, 'PDF', { GEO_ENCODING: 'ISO32000', NOT_AN_OPTION: 'x' })
    expect(dropped).toContain('NOT_AN_OPTION')
    // GEO_ENCODING is a dataset option of the PDF driver: -dsco, never -lco
    expect(args).toEqual(expect.arrayContaining(['-dsco', 'GEO_ENCODING=ISO32000']))
    expect(args).not.toContain('-lco')
  })

  test('several layers become one PDF in a single call, through a VRT', async () => {
    const pdf = await driverSupport(ogr, 'PDF')
    if (!pdf?.write) return
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdalreal-'))
    const poly = path.join(dir, 'p.geojson'), pts = path.join(dir, 'b.geojson'), vrt = path.join(dir, 'l.vrt'), out = path.join(dir, 'o.pdf')
    fs.writeFileSync(poly, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { stand: '1' }, geometry: { type: 'Polygon', coordinates: [[[30, -20], [30.001, -20], [30.001, -20.001], [30, -20.001], [30, -20]]] } }] }))
    fs.writeFileSync(pts, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Point', coordinates: [30.0005, -20.0005] } }] }))
    fs.writeFileSync(vrt, vrtOf([{ name: 'parcels', file: poly }, { name: 'beacons', file: pts }]))
    const { args } = await creationArgs(ogr, 'PDF', { GEO_ENCODING: 'ISO32000' })
    const { stderr } = await runGdal(ogr, ['-f', 'PDF', ...args, '-a_srs', 'EPSG:4326', out, vrt])
    expect(stderr).not.toMatch(/ERROR/)
    const bytes = fs.readFileSync(out)
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1500)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
