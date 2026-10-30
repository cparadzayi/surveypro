import { describe, test, expect, afterEach } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  _setExecFileForTests, creationArgs, driverSupport, gdalEnv, gdalVersion, parseCreationOptions, parseFormats,
  parseGdalVersion, runGdal, vrtOf,
} from '../gdalRunner.js'

/**
 * The runner must not care which GDAL it is talking to. These tests feed it the output shapes of different
 * releases (the version line, the driver list, a driver's option lists) and check that what it does follows
 * from what the tool SAYS it supports, never from a version number. No real GDAL is run here.
 */
afterEach(() => _setExecFileForTests())

// Captured from GDAL 3.13.3 (QGIS 4.2.3), trimmed.
const PDF_FORMAT_313 = `Format Details:
  Short Name: PDF
<CreationOptionList>
  <Option name="COMPRESS" type="string-select" description="Compression method for raster data" default="DEFLATE">
    <Value>NONE</Value>
  </Option>
  <Option name="GEO_ENCODING" type="string-select" description="Format of geo-encoding" default="ISO32000">
    <Value>NONE</Value>
  </Option>
  <Option name="DPI" type="float" description="DPI" default="72" />
  <Option name="AUTHOR" type="string" />
  <Option name="TITLE" type="string" />
</CreationOptionList>
<OverviewCreationOptionList />
<LayerCreationOptionList />
<OpenOptionList>
  <Option name="RENDERING_OPTIONS" type="string-select" />
</OpenOptionList>
`
// A driver with both kinds of list, as GPKG prints them.
const GPKG_FORMAT = `<CreationOptionList>
  <Option name="VERSION" type="string-select" />
  <Option name="ADD_GPKG_OGR_CONTENTS" type="boolean" />
</CreationOptionList>
<OverviewCreationOptionList />
<LayerCreationOptionList>
  <Option name="GEOMETRY_NAME" type="string" />
  <Option name="FID" type="string" />
</LayerCreationOptionList>
<OpenOptionList>
  <Option name="LIST_ALL_TABLES" type="string-select" />
</OpenOptionList>
`

describe('version text', () => {
  test.each([
    ['GDAL 3.13.3 "Iowa City", released 2026/08/13', 3, 13, 3],
    ['GDAL 3.4.1, released 2021/12/27', 3, 4, 1],
    ['GDAL 2.4.0, released 2018/12/14', 2, 4, 0],
    ['GDAL 3.9, released 2024/05/10', 3, 9, 0],
  ])('%s', (text, major, minor, patch) => {
    expect(parseGdalVersion(text)).toEqual({ text, major, minor, patch })
  })

  test('text that is not a version line is kept for display and never throws', () => {
    expect(parseGdalVersion('something else')).toEqual({ text: 'something else', major: null, minor: null, patch: null })
    expect(parseGdalVersion('')).toBeNull()
    expect(parseGdalVersion(undefined)).toBeNull()
  })
})

describe('what a build can do (--formats)', () => {
  const NEW = `Supported Formats: (ro:read-only, rw:read-write, +:update, v:virtual-I/O s:subdatasets)
  GPKG -raster,vector- (rw+uvs): GeoPackage (*.gpkg, *.gpkg.zip)
  PDF -raster,vector- (rw+uvs): Geospatial PDF (*.pdf)
  DXF -vector- (rw+v): AutoCAD DXF (*.dxf)
  AAIGrid -raster- (rwv): Arc/Info ASCII Grid (*.asc)
  CSV -vector- (rov): Comma Separated Value (.csv)
`
  const OLD = `Supported Formats:
  PDF -raster,vector- (rw+vs): Geospatial PDF (*.pdf)
  DXF -vector- (rw+v): AutoCAD DXF (*.dxf)
`
  test('flags are read from the line, whichever release wrote it', () => {
    for (const text of [NEW, OLD]) {
      const f = parseFormats(text)
      expect(f.get('PDF')).toEqual({ raster: true, vector: true, read: true, write: true, update: true })
      expect(f.get('DXF')).toEqual({ raster: false, vector: true, read: true, write: true, update: true })
    }
    expect(parseFormats(NEW).get('CSV')).toMatchObject({ read: true, write: false, update: false })
    expect(parseFormats(OLD).has('GPKG')).toBe(false)   // an older or slimmer build without the driver
  })

  test('driverSupport asks the tool once and answers null for a driver that is not built in', async () => {
    let calls = 0
    _setExecFileForTests((file, args, opts, cb) => { calls++; cb(null, args[0] === '--formats' ? OLD : '', '') })
    expect(await driverSupport('tool-a', 'PDF')).toMatchObject({ write: true })
    expect(await driverSupport('tool-a', 'GPKG')).toBeNull()
    expect(calls).toBe(1)
  })
})

describe('creation options', () => {
  test('dataset and layer lists are told apart, including the empty self-closing form', () => {
    const pdf = parseCreationOptions(PDF_FORMAT_313)
    expect([...pdf.dataset]).toEqual(['COMPRESS', 'GEO_ENCODING', 'DPI', 'AUTHOR', 'TITLE'])
    expect(pdf.layer.size).toBe(0)
    const gpkg = parseCreationOptions(GPKG_FORMAT)
    expect([...gpkg.dataset]).toEqual(['VERSION', 'ADD_GPKG_OGR_CONTENTS'])
    expect([...gpkg.layer]).toEqual(['GEOMETRY_NAME', 'FID'])
    expect(parseCreationOptions('')).toEqual({ dataset: new Set(), layer: new Set() })
  })

  test('options the driver does not list are dropped; the others go where the driver says they belong', async () => {
    _setExecFileForTests((file, args, opts, cb) => cb(null, PDF_FORMAT_313, ''))
    // What the "gdal" PDF engine used to pass: all as layer options, two of which do not exist.
    const { args, dropped } = await creationArgs('tool-b', 'PDF', {
      GEOREFERENCE: 'true', GEO_ENCODING: 'ISO32000', COMPATIBILITY: 'ACROBAT_9',
    })
    expect(args).toEqual(['-dsco', 'GEO_ENCODING=ISO32000'])     // a dataset option, so -dsco, not -lco
    expect(dropped).toEqual(['GEOREFERENCE', 'COMPATIBILITY'])
  })

  test('a layer option gets -lco; for a raster tool every option is -co; empty values are not passed', async () => {
    _setExecFileForTests((file, args, opts, cb) => cb(null, GPKG_FORMAT, ''))
    const v = await creationArgs('tool-c', 'GPKG', { VERSION: '1.4', FID: 'fid', GEOMETRY_NAME: '' })
    expect(v.args).toEqual(['-dsco', 'VERSION=1.4', '-lco', 'FID=fid'])
    _setExecFileForTests((file, args, opts, cb) => cb(null, PDF_FORMAT_313, ''))
    const r = await creationArgs('tool-d', 'PDF', { DPI: 300, TITLE: 'Plan', CREATOR: 'x' }, { tool: 'raster' })
    expect(r.args).toEqual(['-co', 'DPI=300', '-co', 'TITLE=Plan'])
    expect(r.dropped).toEqual(['CREATOR'])
  })

  test('if the tool cannot be asked, nothing is passed rather than guessing', async () => {
    _setExecFileForTests((file, args, opts, cb) => cb(new Error('boom'), '', ''))
    const { args, dropped } = await creationArgs('tool-e', 'PDF', { GEO_ENCODING: 'ISO32000' })
    expect(args).toEqual([])
    expect(dropped).toEqual(['GEO_ENCODING'])
  })
})

describe('running a tool', () => {
  test('values reach the tool as single arguments, whatever they contain', async () => {
    let seen
    _setExecFileForTests((file, args, opts, cb) => { seen = { file, args, opts }; cb(null, 'ok', '') })
    const nasty = `Plan "A" && calc & echo $(whoami) ; rm -rf / %PATH% 'x'`
    await runGdal('"C:\\Program Files\\QGIS 4.2.3\\bin\\gdal_translate.exe"', ['-co', `TITLE=${nasty}`, 'in.png', 'out.pdf'])
    expect(seen.file).toBe('C:\\Program Files\\QGIS 4.2.3\\bin\\gdal_translate.exe')   // discovery's quotes are removed
    expect(seen.args).toEqual(['-co', `TITLE=${nasty}`, 'in.png', 'out.pdf'])          // one element, untouched
    expect(seen.opts.shell).toBeUndefined()
  })

  test('numbers are passed as text, and an abort signal and a time limit are forwarded', async () => {
    let opts
    _setExecFileForTests((file, args, o, cb) => { opts = o; cb(null, '', '') })
    const ac = new AbortController()
    await runGdal('ogr2ogr', ['-a_ullr', 1.5, 2, 3, 4], { signal: ac.signal, timeout: 1234 })
    expect(opts.signal).toBe(ac.signal)
    expect(opts.timeout).toBe(1234)
  })

  test('a failure carries the tool\'s own stderr', async () => {
    _setExecFileForTests((file, args, o, cb) => cb(Object.assign(new Error('exit 1'), { code: 1 }), '', 'ERROR 1: nope'))
    await expect(runGdal('ogr2ogr', ['x'])).rejects.toMatchObject({ stderr: 'ERROR 1: nope', code: 1 })
  })

  test('a missing tool is an error, not an attempt to run "null"', async () => {
    await expect(runGdal(null, ['--version'])).rejects.toThrow(/not found/i)
  })

  test('the version is read once and never branched on', async () => {
    let calls = 0
    _setExecFileForTests((file, args, o, cb) => { calls++; cb(null, 'GDAL 3.4.1, released 2021/12/27\n', '') })
    expect((await gdalVersion('tool-f')).minor).toBe(4)
    await gdalVersion('tool-f')
    expect(calls).toBe(1)
  })
})

describe('the environment of a tool that came from an install', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gdalenv-'))
  const exe = (root) => path.join(root, 'bin', 'ogr2ogr.exe')

  test('PROJ_LIB and PROJ_DATA both point at the install\'s own database, when it is there', () => {
    const root = path.join(tmp, 'qgis-a')
    fs.mkdirSync(path.join(root, 'bin'), { recursive: true })
    fs.mkdirSync(path.join(root, 'share', 'proj'), { recursive: true })
    const env = gdalEnv(`"${exe(root)}"`, { PATH: 'x', PROJ_LIB: 'C:\\Postgres\\proj' })
    expect(path.normalize(env.PROJ_LIB)).toBe(path.normalize(path.join(root, 'share', 'proj')))
    expect(env.PROJ_DATA).toBe(env.PROJ_LIB)
    expect(env.PATH).toBe('x')
  })

  test('an install without a PROJ directory, and a bare command name, leave the environment as found', () => {
    const root = path.join(tmp, 'qgis-b')
    fs.mkdirSync(path.join(root, 'bin'), { recursive: true })
    expect(gdalEnv(`"${exe(root)}"`, { PROJ_LIB: 'keep' })).toEqual({ PROJ_LIB: 'keep' })
    expect(gdalEnv('ogr2ogr', { PROJ_LIB: 'keep' })).toEqual({ PROJ_LIB: 'keep' })
  })
})

describe('one datasource for several files', () => {
  test('a VRT lists each file as a layer, with markup in names and paths escaped', () => {
    const vrt = vrtOf([{ name: 'parcels', file: 'C:\\t\\p&q.geojson' }, { name: 'a<b', file: 'b.geojson' }])
    expect(vrt).toContain('<OGRVRTLayer name="parcels">')
    expect(vrt).toContain('<SrcDataSource>C:\\t\\p&amp;q.geojson</SrcDataSource>')
    expect(vrt).toContain('<SrcLayer>b</SrcLayer>')   // a file's layer is named after the file
    expect(vrtOf([{ name: 'x', file: 'f.geojson', srcLayer: 'custom' }])).toContain('<SrcLayer>custom</SrcLayer>')
    expect(vrt).toContain('name="a&lt;b"')
    expect(vrt.startsWith('<OGRVRTDataSource>')).toBe(true)
    expect(vrt.trimEnd().endsWith('</OGRVRTDataSource>')).toBe(true)
  })
})
