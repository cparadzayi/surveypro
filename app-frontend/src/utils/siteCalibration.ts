/**
 * Parser for Trimble GNSS Site Calibration Reports.
 *
 * A site calibration is the evidence that GNSS observations were tied to the
 * local grid, so its parameters and residuals belong in the field book next to
 * the coordinates they produced — that is what an examiner checks.
 *
 * Parsing happens here, in the browser, because DOMParser is native: neither
 * app carries an XML dependency and this avoids adding one.
 *
 * Three things about the format, all observed in a real Trimble export:
 *
 *  - Angles are in RADIANS. Latitude -0.3387506 is -19.4088°, and the rotation
 *    is ~1e-6 rad. Both are meaningless printed raw, so they are converted here
 *    rather than at each render site.
 *  - Trimble misspells the latitude tag as <Latitiude>. Matching only the
 *    correct spelling silently yields NaN for every latitude, so both are
 *    accepted — the misspelling is what real files contain today, and the
 *    correct spelling is what they may contain tomorrow.
 *  - A horizontal-only calibration carries an empty <MaxVerticalInclination />
 *    and no vertical block. That is "no vertical adjustment was performed",
 *    which is not the same as an adjustment of zero, and the two must render
 *    differently.
 */

const RAD_TO_DEG = 180 / Math.PI

export interface SiteCalibrationPair {
  /** The grid point's ID — the surveyor's name for the beacon, e.g. "49/T". */
  pointId: string
  /** The GNSS point's ID, which is usually the same name without punctuation. */
  globalPointId: string
  usage: string
  globalLatitudeDegrees: number
  globalLongitudeDegrees: number
  globalHeight: number
  controlNorthing: number
  controlEasting: number
  controlElevation: number
  calculatedNorthing: number
  calculatedEasting: number
  calculatedElevation: number
  horizontalResidual: number
  verticalResidual: number | null
}

export interface SiteCalibrationHorizontal {
  rotationCentreNorthing: number
  rotationCentreEasting: number
  /** Converted from the radians the file carries. */
  rotationDegrees: number
  translationNorth: number
  translationEast: number
  scaleFactor: number
}

export interface SiteCalibrationSummary {
  maxHorizontalResidual: number | null
  maxHorizontalResidualPointSerial: string | null
  rmsHorizontal: number | null
  /** null when the calibration had no vertical component. */
  maxVerticalInclination: number | null
}

export interface SiteCalibration {
  reportName: string
  projectIdentifier: string
  horizontal: SiteCalibrationHorizontal | null
  /** null when the calibration was horizontal-only. */
  vertical: Record<string, number> | null
  hasVertical: boolean
  summary: SiteCalibrationSummary
  pairs: SiteCalibrationPair[]
}

function textOf(parent: Element | null, ...tagNames: string[]): string | null {
  if (!parent) return null
  for (const tag of tagNames) {
    const el = parent.getElementsByTagName(tag)[0]
    if (el && el.textContent !== null && el.textContent.trim() !== '') {
      return el.textContent.trim()
    }
  }
  return null
}

function numberOf(parent: Element | null, ...tagNames: string[]): number {
  const raw = textOf(parent, ...tagNames)
  return raw === null ? NaN : Number(raw)
}

/** Same as numberOf, but an absent or empty tag reads as null rather than NaN. */
function optionalNumberOf(parent: Element | null, ...tagNames: string[]): number | null {
  const raw = textOf(parent, ...tagNames)
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * @throws if the document is not well-formed XML, or is not a Trimble Site
 *         Calibration Report. Both are surfaced to the surveyor at the moment
 *         they pick the file, rather than producing a field book of blanks.
 */
export function parseSiteCalibration(xml: string): SiteCalibration {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')

  // DOMParser reports malformed input as a <parsererror> element rather than
  // throwing, so this is the only place the error can be caught.
  const parseError = doc.getElementsByTagName('parsererror')[0]
  if (parseError) {
    throw new Error(`Could not read the calibration file: ${parseError.textContent?.trim() ?? 'malformed XML'}`)
  }

  const root = doc.documentElement
  if (!root || !/SiteCalibrationReport$/.test(root.nodeName)) {
    throw new Error(
      `This file is not a Trimble Site Calibration Report (found <${root?.nodeName ?? 'nothing'}>).`,
    )
  }

  const header = root.getElementsByTagName('HeaderInfo')[0] ?? null
  const horizontalEl = root.getElementsByTagName('Horizontal')[0] ?? null
  const verticalEl = root.getElementsByTagName('Vertical')[0] ?? null
  const summaryEl = root.getElementsByTagName('Summary')[0] ?? null

  const horizontal: SiteCalibrationHorizontal | null = horizontalEl
    ? {
        rotationCentreNorthing: numberOf(horizontalEl, 'NorthingCoordinateOfRotationCenter'),
        rotationCentreEasting: numberOf(horizontalEl, 'EastingCoordinateOfRotationCenter'),
        rotationDegrees: numberOf(horizontalEl, 'RotationAboutCenterPoint') * RAD_TO_DEG,
        translationNorth: numberOf(horizontalEl, 'TranslationNorth'),
        translationEast: numberOf(horizontalEl, 'TranslationEast'),
        scaleFactor: numberOf(horizontalEl, 'ScaleFactor'),
      }
    : null

  const maxHorizontalEl = summaryEl?.getElementsByTagName('MaxHorizontalResidual')[0] ?? null
  const rmsRaw = maxHorizontalEl?.getAttribute('RMSH')
  const summary: SiteCalibrationSummary = {
    maxHorizontalResidual: optionalNumberOf(summaryEl, 'MaxHorizontalResidual'),
    maxHorizontalResidualPointSerial: maxHorizontalEl?.getAttribute('PointSerial') ?? null,
    rmsHorizontal: rmsRaw !== null && rmsRaw !== undefined && rmsRaw !== '' ? Number(rmsRaw) : null,
    maxVerticalInclination: optionalNumberOf(summaryEl, 'MaxVerticalInclination'),
  }

  const pairs: SiteCalibrationPair[] = Array.from(root.getElementsByTagName('Pair')).map((pairEl) => {
    const globalEl = pairEl.getElementsByTagName('Global_Point')[0] ?? null
    const gridEl = pairEl.getElementsByTagName('Grid_Point')[0] ?? null
    const controlEl = gridEl?.getElementsByTagName('CoordControl')[0] ?? null
    const calcEl = gridEl?.getElementsByTagName('CoordCalculated')[0] ?? null
    const residualsEl = gridEl?.getElementsByTagName('Residuals')[0] ?? null

    return {
      pointId: gridEl?.getAttribute('ID') ?? '',
      globalPointId: globalEl?.getAttribute('ID') ?? '',
      usage: pairEl.getAttribute('Usage') ?? '',
      // 'Latitiude' first: it is what real files carry today.
      globalLatitudeDegrees: numberOf(globalEl, 'Latitiude', 'Latitude') * RAD_TO_DEG,
      globalLongitudeDegrees: numberOf(globalEl, 'Longitude') * RAD_TO_DEG,
      globalHeight: numberOf(globalEl, 'Height'),
      controlNorthing: numberOf(controlEl, 'Northing'),
      controlEasting: numberOf(controlEl, 'Easting'),
      controlElevation: numberOf(controlEl, 'Elevation'),
      calculatedNorthing: numberOf(calcEl, 'Northing'),
      calculatedEasting: numberOf(calcEl, 'Easting'),
      calculatedElevation: numberOf(calcEl, 'Elevation'),
      horizontalResidual: numberOf(residualsEl, 'Horizontal'),
      verticalResidual: optionalNumberOf(residualsEl, 'Vertical'),
    }
  })

  // A vertical block, or any pair carrying a vertical residual, means a vertical
  // adjustment was actually performed. An empty <MaxVerticalInclination /> alone
  // does not.
  const hasVertical = Boolean(verticalEl) || pairs.some((p) => p.verticalResidual !== null)

  return {
    reportName: textOf(header, 'ReportName') ?? 'Site Calibration Report',
    projectIdentifier: textOf(header, 'ProjectIdentifier') ?? '',
    horizontal,
    vertical: null,
    hasVertical,
    summary,
    pairs,
  }
}

/**
 * Pull the site calibration out of whichever workflow-state shape you have.
 *
 * Two different objects are called `workflowState` in this codebase:
 *
 *   - the reactive singleton from useCadastralWorkflow, holding the parsed
 *     calibration at `documents.siteCalibration`;
 *   - the raw `workflow_state` fetched from the API, holding it at
 *     `step_data['csv-import'].site_calibration`.
 *
 * SurveyPlanMapView binds the second to the same name as the first, so reading
 * `.documents` there yielded undefined and the calibration silently never
 * reached the field book — with `any` typing, nothing complained. Both views
 * call this instead, so the two shapes cannot be confused again.
 *
 * The in-memory copy wins when both are present: it reflects a calibration the
 * surveyor just picked, which may not have been persisted yet.
 */
export function siteCalibrationFrom(workflowState: any): SiteCalibration | undefined {
  if (!workflowState) return undefined

  const inMemory = workflowState.documents?.siteCalibration
  if (inMemory) return inMemory

  const stepData = workflowState.step_data
  return stepData?.['csv-import']?.site_calibration
      ?? stepData?.import_csv?.site_calibration
      ?? undefined
}

// ── HTML export ─────────────────────────────────────────────────────────────
//
// Trimble Business Center exports the same report as XML and as HTML, and a
// surveyor may have either. The HTML is a table of label/value cells rather
// than a schema, so it is read by walking those cells rather than by path.
//
// Two things it does that the XML does not:
//  - angles are DMS strings with a hemisphere letter (S19°26'54.71908"), not
//    radians;
//  - absent values are the literal "?", which must read as absent rather than
//    as zero or NaN — "no vertical adjustment was performed" is a different
//    statement from "the vertical shift was zero".
//
// It also rounds to three decimals, so the XML remains the better source when
// both are available.

/** "S19°26'54.71908"" → -19.4485…  ; hemisphere letter carries the sign. */
function dmsToDegrees(raw: string | undefined): number {
  if (!raw) return NaN
  const hemisphere = /^\s*([NSEW])/i.exec(raw)?.[1]?.toUpperCase()
  // Any non-numeric run separates the parts, so this does not depend on the
  // degree glyph surviving an encoding round-trip.
  const parts = raw.replace(/^\s*[NSEW]/i, '').split(/[^0-9.]+/).filter(Boolean).map(Number)
  if (parts.length === 0 || parts.some(Number.isNaN)) return NaN
  const [d = 0, m = 0, s = 0] = parts
  const magnitude = Math.abs(d) + m / 60 + s / 3600
  return hemisphere === 'S' || hemisphere === 'W' ? -magnitude : magnitude
}

/** Strips the unit suffix; Trimble's "?" for an absent value reads as null. */
function measure(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const cleaned = raw.replace(/[^0-9.\-+eE]/g, '')
  if (cleaned === '' || raw.includes('?')) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** One "Point" block: its name plus the label/value cells that follow it. */
interface HtmlBlock { name: string; fields: Record<string, string> }

function readPointBlocks(cells: string[], from: number): HtmlBlock[] {
  const blocks: HtmlBlock[] = []
  for (let i = from; i < cells.length; i++) {
    if (cells[i] !== 'Point') continue
    const block: HtmlBlock = { name: cells[i + 1] ?? '', fields: {} }
    for (let j = i + 2; j < cells.length - 1; j += 2) {
      if (cells[j] === 'Point') break
      block.fields[cells[j]] = cells[j + 1]
    }
    blocks.push(block)
  }
  return blocks
}

export function parseSiteCalibrationHtml(html: string): SiteCalibration {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = doc.body?.textContent ?? ''
  if (!/Site Calibration Report/i.test(text)) {
    throw new Error('This file is not a Trimble Site Calibration Report.')
  }

  // Leaf cells only, in document order. The report nests tables, so an outer
  // <td> holds the concatenated text of everything inside it; taking only cells
  // that contain no further table yields a clean label/value interleaving.
  // Labels are <th> and carry a trailing colon; values are <td>.
  const cells = Array.from(doc.querySelectorAll('td, th'))
    .filter((cell) => !cell.querySelector('table'))
    .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim())

  /** Value of the cell following the first cell whose label matches. */
  const after = (label: string): string | undefined => {
    const i = cells.findIndex((c) => c.replace(/:$/, '').toLowerCase() === label.toLowerCase())
    return i === -1 ? undefined : cells[i + 1]
  }

  const scale = measure(after('Scale factor'))
  const horizontal: SiteCalibrationHorizontal | null = scale === null ? null : {
    rotationCentreNorthing: measure(after('Origin northing')) ?? NaN,
    rotationCentreEasting: measure(after('Origin easting')) ?? NaN,
    rotationDegrees: dmsToDegrees(after('Rotation')),
    translationNorth: measure(after('Translation north')) ?? NaN,
    translationEast: measure(after('Translation east')) ?? NaN,
    scaleFactor: scale,
  }

  // Summary table: the "Horizontal" row reads max | rms | point. Anchored on the
  // "Maximum residual" header so it cannot latch onto the word "Horizontal"
  // used as a pair's Type further down the report.
  const summaryHeader = cells.findIndex((c) => /^Maximum residual/i.test(c))
  const hIdx = summaryHeader === -1 ? -1 : cells.indexOf('Horizontal', summaryHeader)
  const summaryRow = hIdx === -1 ? [] : cells.slice(hIdx + 1, hIdx + 4)
  const summary: SiteCalibrationSummary = {
    maxHorizontalResidual: measure(summaryRow[0]),
    rmsHorizontal: measure(summaryRow[1]),
    maxHorizontalResidualPointSerial: summaryRow[2] && !summaryRow[2].includes('?') ? summaryRow[2] : null,
    maxVerticalInclination: null,
  }

  // Point blocks arrive in threes: the GNSS point (carries Latitude), the
  // calculated point (carries a residual), then the grid point (carries Type).
  // Start after the three column headers, so the summary's own "Point" header
  // is not mistaken for the first point block.
  const gridHeader = cells.findIndex((c) => c === 'Grid Point')
  const blocks = readPointBlocks(cells, gridHeader === -1 ? 0 : gridHeader + 1)
  const pairs: SiteCalibrationPair[] = []
  for (let i = 0; i + 2 < blocks.length; i += 3) {
    const [gnss, calc, grid] = [blocks[i], blocks[i + 1], blocks[i + 2]]
    if (!('Latitude' in gnss.fields)) continue
    pairs.push({
      pointId: grid.name,
      globalPointId: gnss.name,
      usage: grid.fields['Type'] ?? '',
      globalLatitudeDegrees: dmsToDegrees(gnss.fields['Latitude']),
      globalLongitudeDegrees: dmsToDegrees(gnss.fields['Longitude']),
      globalHeight: measure(gnss.fields['Height']) ?? NaN,
      controlNorthing: measure(grid.fields['Northing']) ?? NaN,
      controlEasting: measure(grid.fields['Easting']) ?? NaN,
      controlElevation: measure(grid.fields['Elevation']) ?? NaN,
      calculatedNorthing: measure(calc.fields['Northing']) ?? NaN,
      calculatedEasting: measure(calc.fields['Easting']) ?? NaN,
      calculatedElevation: measure(calc.fields['Elevation']) ?? NaN,
      horizontalResidual: measure(calc.fields['Horiz. residual']) ?? NaN,
      verticalResidual: measure(calc.fields['Vert. residual']),
    })
  }

  // A vertical section of all "?" means none was performed.
  const verticalShift = measure(after('Vertical shift at origin'))
  const hasVertical = verticalShift !== null || pairs.some((p) => p.verticalResidual !== null)

  return {
    reportName: 'Site Calibration Report',
    projectIdentifier: after('Name') ?? '',
    horizontal,
    vertical: null,
    hasVertical,
    summary,
    pairs,
  }
}

/**
 * Parse either export. Sniffs the content rather than trusting the extension:
 * a surveyor renaming a file should not silently produce an empty report.
 */
export function parseCalibrationReport(content: string): SiteCalibration {
  if (/<\s*(html|!DOCTYPE\s+html)/i.test(content) || /<\s*table/i.test(content)) {
    return parseSiteCalibrationHtml(content)
  }
  return parseSiteCalibration(content)
}

/**
 * The control points a site calibration used, matched against the national
 * control registry so they can be pre-selected.
 *
 * Matching is on the registry's `monu_num` -- the designation, e.g. "50/T" --
 * because that is what a calibration report names. `monu_name` is the
 * monument's name ("THORNHILL") and never appears in the report's grid column.
 *
 * Unmatched ids are returned rather than dropped: a surveyor told "4 selected"
 * when their report named 5 has no way to know which one to add by hand.
 */
export function matchCalibrationControlPoints(
  calibration: { pairs?: Array<{ pointId?: string }> } | null | undefined,
  controlPoints: Array<{ id: number; monu_num?: string | null }>,
): { ids: number[]; matched: string[]; unmatched: string[] } {
  const byDesignation = new Map<string, number>()
  for (const cp of controlPoints ?? []) {
    const key = String(cp?.monu_num ?? '').trim().toUpperCase()
    if (!key || byDesignation.has(key)) continue
    byDesignation.set(key, cp.id)
  }

  const ids: number[] = []
  const matched: string[] = []
  const unmatched: string[] = []
  const seen = new Set<string>()

  for (const pair of calibration?.pairs ?? []) {
    const raw = String(pair?.pointId ?? '').trim()
    if (!raw) continue
    const key = raw.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)

    const id = byDesignation.get(key)
    if (id === undefined) { unmatched.push(raw); continue }
    ids.push(id)
    matched.push(raw)
  }

  return { ids, matched, unmatched }
}
