// Calling GDAL without depending on which GDAL it is.
//
// What used to tie the code to a version, and what replaced it:
//
//   * WHERE the tool is. A pinned list of install paths rotted (QGIS renamed 3.44.3 to 3.44.15 under it).
//     Discovery (gdalDiscovery.js) scans and lets each candidate prove itself by running `--version`.
//   * HOW it is called. Commands were built as shell strings with values from the request interpolated
//     in, so quoting depended on the shell and on the OS, and a title or projection containing a quote
//     broke out of the command. Every call here is an argv array handed to execFile: no shell, no quoting.
//   * WHICH OPTIONS exist. A driver's creation options change between releases, and are not always the kind
//     the caller assumed (GEO_ENCODING is a dataset option of the PDF driver, but was passed as a layer
//     option; COMPATIBILITY and GEOREFERENCE are not options of it at all, and GDAL only warned). The
//     driver is asked what it accepts (`--format NAME`) and anything else is dropped, each option going to
//     the right place (-dsco, -lco, -co).
//   * WHAT the build can do. `--formats` says which drivers are present and whether they write.
//   * The ENVIRONMENT. PROJ moved from PROJ_LIB to PROJ_DATA; both are set, from the install the tool came
//     from, only when that directory exists.
//
// The version number is parsed for display and logging, and is never branched on. If a future release
// renames an option or a flag, the probe finds it missing and the caller sees a clear "not supported"
// instead of a silent degrade.
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import { findGdalTool } from './gdalDiscovery.js'

let execImpl = execFile
/** Test seam: replace execFile (file, args, options, callback). Pass nothing to restore. */
export function _setExecFileForTests(fn) {
  execImpl = fn || execFile
  cache.clear()
}

const cache = new Map()
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}

/** The executable to hand to execFile: discovery's quoted absolute path is unquoted, a bare name is kept. */
export function toolFile(cmd) {
  return typeof cmd === 'string' ? cmd.replaceAll('"', '') : cmd
}

/**
 * Locate a GDAL tool once. Returns the discovery result (a bare name when on PATH, a quoted absolute path
 * when found in an install) or null. No silent fallback to a bare name: absent means absent.
 */
export function locateTool(name) {
  return memo(`locate:${name}`, () => findGdalTool(name))
}

/**
 * The environment to run `cmd` in. When the tool came from an install directory (QGIS, OSGeo4W), that
 * install's own PROJ database is used: the system PATH can resolve a PostGIS `proj.db` whose
 * DATABASE.LAYOUT.VERSION GDAL cannot read, which breaks SRS parsing outright. PROJ_LIB is the old name
 * and PROJ_DATA the current one; both are set. A bare command name carries no install, so nothing is set.
 */
export function gdalEnv(cmd, base = process.env) {
  const env = { ...base }
  const file = toolFile(cmd)
  if (!file || !path.isAbsolute(file)) return env
  const root = path.join(path.dirname(file), '..')
  for (const candidate of [path.join(root, 'share', 'proj'), path.join(root, 'apps', 'proj', 'share', 'proj')]) {
    if (existsSync(candidate)) {
      env.PROJ_LIB = candidate
      env.PROJ_DATA = candidate
      break
    }
  }
  return env
}

/** Run a GDAL tool with an argv array. Rejects with the tool's stdout/stderr attached to the error. */
export function runGdal(cmd, args, { signal, timeout = 60_000, maxBuffer = 10 * 1024 * 1024 } = {}) {
  const file = toolFile(cmd)
  if (!file) return Promise.reject(new Error('GDAL tool not found'))
  return new Promise((resolve, reject) => {
    execImpl(file, args.map(String), { env: gdalEnv(cmd), timeout, maxBuffer, signal, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout
        err.stderr = stderr
        reject(err)
      } else resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

/** "GDAL 3.13.3 "Iowa City", released 2026/08/13" -> { text, major, minor, patch }. For display, never for branching. */
export function parseGdalVersion(text) {
  const t = String(text ?? '').trim()
  const m = /GDAL\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(t)
  if (!m) return t ? { text: t, major: null, minor: null, patch: null } : null
  return { text: t, major: Number(m[1]), minor: Number(m[2]), patch: m[3] === undefined ? 0 : Number(m[3]) }
}

export function gdalVersion(cmd) {
  return memo(`version:${cmd}`, async () => parseGdalVersion((await runGdal(cmd, ['--version'], { timeout: 15_000 }).catch(() => ({ stdout: '' }))).stdout))
}

/**
 * Parse `--formats` output: lines like `  PDF -raster,vector- (rw+uvs): Geospatial PDF (*.pdf)`.
 * Returns a Map of driver name -> { raster, vector, read, write, update }.
 */
export function parseFormats(text) {
  const out = new Map()
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*(\S+)\s+-([a-z,\s]+)-\s+\(([^)]*)\)/i.exec(line)
    if (!m) continue
    const kinds = m[2].toLowerCase()
    const flags = m[3]
    out.set(m[1], { raster: kinds.includes('raster'), vector: kinds.includes('vector'), read: flags.includes('r'), write: flags.includes('w'), update: flags.includes('+') })
  }
  return out
}

/** What this build can do with `driver`, or null when it is not built in. */
export async function driverSupport(cmd, driver) {
  const formats = await memo(`formats:${cmd}`, async () => parseFormats((await runGdal(cmd, ['--formats'], { timeout: 30_000 }).catch(() => ({ stdout: '' }))).stdout))
  return formats.get(driver) ?? null
}

/**
 * Parse `--format NAME` output into the option names the driver accepts: `dataset` from
 * <CreationOptionList>, `layer` from <LayerCreationOptionList>.
 */
export function parseCreationOptions(text) {
  const names = (tag) => {
    const block = new RegExp(`<${tag}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${tag}>)`, 'i').exec(String(text ?? ''))
    const set = new Set()
    for (const m of (block?.[1] ?? '').matchAll(/<Option\b[^>]*?\bname="([^"]+)"/gi)) set.add(m[1])
    return set
  }
  return { dataset: names('CreationOptionList'), layer: names('LayerCreationOptionList') }
}

export function creationOptions(cmd, driver) {
  return memo(`options:${cmd}:${driver}`, async () => parseCreationOptions((await runGdal(cmd, ['--format', driver], { timeout: 30_000 }).catch(() => ({ stdout: '' }))).stdout))
}

/**
 * Turn the creation options a caller WANTS into the arguments this GDAL accepts.
 *   tool 'ogr2ogr'  -> -dsco for a dataset option, -lco for a layer option
 *   tool 'raster'   -> -co  (gdal_translate and friends)
 * An option the driver does not list is dropped and reported, rather than passed to be warned about.
 *
 * @returns {{ args: string[], dropped: string[] }}
 */
export async function creationArgs(cmd, driver, wanted, { tool = 'ogr2ogr' } = {}) {
  const have = await creationOptions(cmd, driver)
  const args = [], dropped = []
  for (const [name, value] of Object.entries(wanted)) {
    if (value === undefined || value === null || value === '') continue
    if (tool === 'raster') {
      if (have.dataset.has(name)) args.push('-co', `${name}=${value}`)
      else dropped.push(name)
    } else if (have.dataset.has(name)) args.push('-dsco', `${name}=${value}`)
    else if (have.layer.has(name)) args.push('-lco', `${name}=${value}`)
    else dropped.push(name)
  }
  return { args, dropped }
}

/**
 * An OGR VRT presenting several files as layers of one datasource, so one ogr2ogr call can write them all.
 * A file-based source names its layer after the file (GeoJSON, shapefiles), so the VRT says so explicitly:
 * `srcLayer` defaults to the file's base name.
 */
export function vrtOf(layers) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const layer = (l) =>
    `  <OGRVRTLayer name="${esc(l.name)}">\n` +
    `    <SrcDataSource>${esc(l.file)}</SrcDataSource>\n` +
    `    <SrcLayer>${esc(l.srcLayer ?? path.parse(l.file).name)}</SrcLayer>\n` +
    `  </OGRVRTLayer>\n`
  return `<OGRVRTDataSource>\n${layers.map(layer).join('')}</OGRVRTDataSource>\n`
}
