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
