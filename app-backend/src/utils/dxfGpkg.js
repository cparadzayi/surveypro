// GDAL/ogr2ogr bridge for DXF exports: turns a DXF's ground geometry into a
// QGIS-native .gpkg and finds/resolves the ogr2ogr executable. Extracted from
// routes/geopdf-vector.js so route unit tests can mock the ogr2ogr call and
// stay hermetic — the mocked route suite must never spawn real GDAL processes
// (Jest's 5s default timeout becomes a false alarm under full-suite load).
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { northUpWktForDxf } from './crsDefinitions.js'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let cachedOGR2OGRPath = null

async function findOGR2OGR() {
  const commonPaths = [
    'ogr2ogr',
    'C:\\Program Files\\QGIS 3.44.3\\bin\\ogr2ogr.exe',
    'C:\\Program Files\\QGIS 3.36.3\\bin\\ogr2ogr.exe',
    'C:\\Program Files\\QGIS 3.34\\bin\\ogr2ogr.exe',
    'C:\\OSGeo4W64\\bin\\ogr2ogr.exe',
    'C:\\OSGeo4W\\bin\\ogr2ogr.exe',
    '/usr/bin/ogr2ogr',
    '/usr/local/bin/ogr2ogr',
    '/opt/homebrew/bin/ogr2ogr'
  ]

  for (const ogrPath of commonPaths) {
    try {
      if (!ogrPath.includes('\\') && !ogrPath.includes('/')) {
        try {
          await execAsync(`${ogrPath} --version`)
          return ogrPath
        } catch {
          continue
        }
      }

      if (existsSync(ogrPath)) {
        const quotedPath = `"${ogrPath}"`
        try {
          await execAsync(`${quotedPath} --version`)
          return quotedPath
        } catch {
          continue
        }
      }
    } catch {
      continue
    }
  }

  return null
}

export async function getOGR2OGRCommand() {
  if (cachedOGR2OGRPath === null) {
    cachedOGR2OGRPath = await findOGR2OGR()
  }
  return cachedOGR2OGRPath || 'ogr2ogr'
}

export async function getGDALVersion(cmd) {
  const { stdout } = await execAsync(`${cmd} --version`).catch(() => ({ stdout: null }))
  return stdout?.trim() || null
}

/**
 * Convert a DXF's ground geometry into a QGIS-native GeoPackage (.gpkg) whose
 * CRS is declared inside the file. Unlike .prj sidecars — which the GDAL DXF
 * driver ignores ("DXF files are considered to have no georeferencing
 * information") — a GeoPackage is self-describing, so QGIS auto-places it in
 * the right hemisphere with zero manual steps.
 *
 * The DXF coordinates are already plain north-up easting/northing (negative
 * in the southern hemisphere — easting west of the Lo central meridian,
 * northing south of the equator). We ASSIGN the matching north-up CRS with
 * `-a_srs` (no `-t_srs` reprojection): feeding them through official
 * EPSG:22291 instead stores a South-Orientated *(westing, southing)* tuple
 * whose axes both point the wrong way, so QGIS renders the plan rotated 180°.
 *
 * Any WKT AUTHORITY tag is deliberately omitted so GDAL/QGIS use the WKT's
 * declared AXIS east/north rather than substituting EPSG:22291's canonical
 * south-orientated axes.
 *
 * Returns the .gpkg buffer, or null when ogr2ogr is unavailable or the
 * conversion fails (callers fall back to DXF + .prj only).
 */
export async function dxfToGeoreferencedGpkg(dxfBuffer, projection, logger) {
  const ogrCmd = await getOGR2OGRCommand()
  if (!ogrCmd || !dxfBuffer || dxfBuffer.length === 0) return null

  const tempDir = path.join(__dirname, '../../temp/dxf')
  if (!existsSync(tempDir)) await mkdir(tempDir, { recursive: true })

  const ts = Date.now()
  const srcDxf = path.join(tempDir, `gpkg-src-${ts}.dxf`)
  const outGpkg = path.join(tempDir, `gpkg-out-${ts}.gpkg`)

  // Use QGIS's own PROJ database — the system PATH may resolve a PostGIS
  // proj.db with an incompatible DATABASE.LAYOUT.VERSION (breaks SRS parsing).
  const env = { ...process.env }
  const qgisOgrPath = ogrCmd.includes('QGIS')
    ? (ogrCmd.match(/"([^"]+)"/)?.[1] || ogrCmd.replaceAll('"', ''))
    : null
  const projLib = qgisOgrPath
    ? path.join(path.dirname(qgisOgrPath), '..', 'share', 'proj')
    : null
  if (projLib && existsSync(projLib)) {
    env.PROJ_LIB = projLib
    env.PROJ_DATA = projLib
  }

  try {
    await writeFile(srcDxf, dxfBuffer)
    const northUpWkt = northUpWktForDxf(projection)
    if (!northUpWkt) return null
    // execFile, not exec/shell: the WKT contains double quotes that cmd.exe
    // would mangle, and the argv array sidesteps all quoting entirely.
    const { stderr } = await execFileAsync(
      ogrCmd.replaceAll('"', ''),
      ['-f', 'GPKG', outGpkg, srcDxf, '-a_srs', northUpWkt],
      {
        maxBuffer: 10 * 1024 * 1024,
        env,
        // A wedged or pathologically slow ogr2ogr must never hang a surveyplan
        // export: the route degrades to DXF + .prj on timeout instead.
        timeout: 60_000,
      }
    )
    if (stderr && !stderr.includes('Warning')) logger?.warn?.(`[DXF] ogr2ogr gpkg stderr: ${stderr.substring(0, 1000)}`)
    if (!existsSync(outGpkg)) return null
    const gpkg = await readFile(outGpkg)
    logger?.info?.(`[DXF] ✅ georeferenced GeoPackage created (${gpkg.length} bytes)`)
    return gpkg
  } catch (err) {
    logger?.warn?.(`[DXF] ⚠️ GeoPackage conversion skipped: ${(err?.message || err?.code || 'unknown error').substring(0, 300)}${err?.killed ? ' (killed after timeout)' : ''}`)
    return null
  } finally {
    await Promise.all([unlink(srcDxf).catch(() => {}), unlink(outGpkg).catch(() => {})])
  }
}