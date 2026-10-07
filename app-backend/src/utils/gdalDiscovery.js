// Locate a GDAL command line tool, without pinning a QGIS version.
//
// WHY THIS EXISTS. Both GeoPDF route files used to hardcode the install paths
// they expected:
//
//     'C:\\Program Files\\QGIS 3.44.3\\bin\\ogr2ogr.exe'
//     'C:\\Program Files\\QGIS 3.36.3\\bin\\ogr2ogr.exe'
//     'C:\\Program Files\\QGIS 3.34\\bin\\ogr2ogr.exe'
//
// The machine has QGIS **3.44.15**. `3.44.3` != `3.44.15`, so none of the pinned
// paths existed, `C:\Program Files\QGIS 3.44.15\bin` is not on the machine PATH,
// and the result was `null` -> the routes reported "GDAL not found" and silently
// degraded GeoPDF/GeoPackage export to DXF + .prj, with `GET /geopdf/check`
// answering `{"available": false}` on a machine that has GDAL sitting on disk.
// It was recorded as "GDAL is not installed in the dev environment"; it is
// installed, it was undiscoverable.
//
// So: enumerate `QGIS *` directories and let each candidate prove itself by
// running `--version`, rather than trusting a version string someone typed. The
// version list was always going to rot; QGIS renamed 3.44.3 to 3.44.15 under it.
//
// ORDERING. PATH first, then newest QGIS first. LTR builds sort after the
// matching release build, since a release is the better default when both exist.
// Ordering is only a preference: a candidate is accepted solely on the strength
// of its own `--version` succeeding, so a wrong guess costs a little time and
// nothing else.
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readdirSync } from 'fs'
import path from 'path'

const execFileAsync = promisify(execFile)

/** Windows install roots to scan, in the order they are consulted. */
const SEARCH_ROOTS = [
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\OSGeo4W64\\bin',
  'C:\\OSGeo4W\\bin',
  '/usr/bin',
  '/usr/local/bin',
  '/opt/homebrew/bin'
]

/** Directory names that mean "some build of QGIS", e.g. `QGIS 3.44.15`, `QGIS 3.34 LTR`. */
const QGIS_DIR = /^QGIS\b/i

/**
 * Compare two QGIS directory names by the version they name, newest first.
 *
 * `QGIS 3.44.15` > `QGIS 3.44.3` (numeric, not lexical -- otherwise 3.44.15
 * would lose to 3.44.3), and `QGIS 3.44 LTR` loses to `QGIS 3.44`.
 */
function byVersionDescending(a, b) {
  const nums = (name) => (name.match(/\d+/g) || []).map(Number)
  const [av, bv] = [nums(a), nums(b)]
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const diff = (bv[i] ?? -1) - (av[i] ?? -1)
    if (diff !== 0) return diff
  }
  // Same version: a release build outranks an LTR of that version.
  return Number(/LTR/i.test(b)) - Number(/LTR/i.test(a))
}

/** Every plausible absolute path for `tool`, best candidate first. */
function candidatePaths(tool) {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool
  const out = []

  for (const root of SEARCH_ROOTS) {
    // The tool inside the root itself -- this is the OSGeo4W and POSIX shape.
    out.push(path.join(root, exe))

    // The tool inside each QGIS build under the root -- this is the
    // `C:\Program Files` shape. Roots that hold no QGIS build read as empty.
    let entries = []
    try {
      entries = readdirSync(root).filter((name) => QGIS_DIR.test(name))
    } catch {
      continue // root absent on this host
    }
    for (const name of entries.sort(byVersionDescending)) {
      out.push(path.join(root, name, 'bin', exe))
    }
  }

  return out
}

/**
 * Find `tool` (e.g. 'ogr2ogr', 'gdal_translate').
 *
 * Returns the bare command name when the tool is on PATH, a quoted absolute path
 * when it is not, or `null` when it is absent. The two shapes are deliberate:
 * callers pass the result to `exec` as a string, and dxfGpkg.js derives QGIS's
 * PROJ directory from the quoted form, which only exists for a real install.
 */
export async function findGdalTool(tool) {
  try {
    await execFileAsync(tool, ['--version'])
    return tool
  } catch {
    // Not on PATH. Fall through to the install directories.
  }

  for (const candidate of candidatePaths(tool)) {
    if (!existsSync(candidate)) continue
    try {
      await execFileAsync(candidate, ['--version'])
      return `"${candidate}"`
    } catch {
      continue
    }
  }

  return null
}

/**
 * QGIS's own PROJ database directory, for a tool found at `cmd`.
 *
 * The system PATH can resolve a PostGIS `proj.db` whose DATABASE.LAYOUT.VERSION
 * GDAL cannot read, which breaks SRS parsing outright — so when the tool came
 * from a QGIS install, its bundled PROJ data is used instead. Returns `null`
 * when `cmd` is a bare command name (found on PATH) or has no such directory.
 */
export function qgisProjDir(cmd) {
  if (!cmd || !cmd.includes('QGIS')) return null
  const exePath = cmd.match(/"([^"]+)"/)?.[1] ?? cmd.replaceAll('"', '')
  const projDir = path.join(path.dirname(exePath), '..', 'share', 'proj')
  return existsSync(projDir) ? projDir : null
}