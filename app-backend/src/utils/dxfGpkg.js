// GDAL/ogr2ogr bridge for DXF exports: turns a DXF's ground geometry into a
// QGIS-native .gpkg and finds/resolves the ogr2ogr executable. Extracted from
// routes/geopdf-vector.js so route unit tests can mock the ogr2ogr call and
// stay hermetic — the mocked route suite must never spawn real GDAL processes
// (Jest's 5s default timeout becomes a false alarm under full-suite load).
import { writeFile, unlink, mkdir, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { northUpWktForDxf } from './crsDefinitions.js'
import { cancelledError, throwIfCancelled } from './cancellation.js'
import { gdalVersion, locateTool, runGdal } from './gdalRunner.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// The tool is found by scanning (utils/gdalDiscovery.js) and run through utils/gdalRunner.js, which passes
// arguments as an argv array and takes its environment from the install the tool came from: nothing here
// depends on which GDAL it is. Returns the discovery result (a bare name on PATH, a quoted absolute path
// otherwise), or null when no GDAL is installed.
export async function getOGR2OGRCommand() {
  return locateTool('ogr2ogr')
}

/** The tool's own version line ("GDAL 3.13.3 ..."), for display; never branched on. */
export async function getGDALVersion(cmd) {
  return (await gdalVersion(cmd))?.text || null
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
 *
 * `signal` (an AbortSignal): when the client has gone away ogr2ogr is killed and this throws
 * GenerationCancelled, rather than degrading to null -- nobody is left to receive the fallback.
 */
export async function dxfToGeoreferencedGpkg(dxfBuffer, projection, logger, signal) {
  throwIfCancelled(signal)
  const ogrCmd = await getOGR2OGRCommand()
  if (!ogrCmd || !dxfBuffer || dxfBuffer.length === 0) return null

  const tempDir = path.join(__dirname, '../../temp/dxf')
  if (!existsSync(tempDir)) await mkdir(tempDir, { recursive: true })

  const ts = Date.now()
  const srcDxf = path.join(tempDir, `gpkg-src-${ts}.dxf`)
  const outGpkg = path.join(tempDir, `gpkg-out-${ts}.gpkg`)

  try {
    await writeFile(srcDxf, dxfBuffer)
    const northUpWkt = northUpWktForDxf(projection)
    if (!northUpWkt) return null
    // An argv array, not a shell string: the WKT contains double quotes that cmd.exe would mangle.
    // runGdal also runs it with the install's own PROJ database (the system PATH may resolve a PostGIS
    // proj.db with an incompatible DATABASE.LAYOUT.VERSION, which breaks SRS parsing).
    const { stderr } = await runGdal(
      ogrCmd,
      ['-f', 'GPKG', outGpkg, srcDxf, '-a_srs', northUpWkt],
      {
        // A wedged or pathologically slow ogr2ogr must never hang a surveyplan
        // export: the route degrades to DXF + .prj on timeout instead.
        timeout: 60_000,
        signal,
      }
    )
    if (stderr && !stderr.includes('Warning')) logger?.warn?.(`[DXF] ogr2ogr gpkg stderr: ${stderr.substring(0, 1000)}`)
    if (!existsSync(outGpkg)) return null
    const gpkg = await readFile(outGpkg)
    logger?.info?.(`[DXF] ✅ georeferenced GeoPackage created (${gpkg.length} bytes)`)
    return gpkg
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERR') throw cancelledError()
    logger?.warn?.(`[DXF] ⚠️ GeoPackage conversion skipped: ${(err?.message || err?.code || 'unknown error').substring(0, 300)}${err?.killed ? ' (killed after timeout)' : ''}`)
    return null
  } finally {
    await Promise.all([unlink(srcDxf).catch(() => {}), unlink(outGpkg).catch(() => {})])
  }
}