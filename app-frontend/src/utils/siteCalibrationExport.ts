/**
 * The loaded GNSS site calibration as data the surveyor can download: one row per control pair (the station,
 * its GNSS position, its published and calculated grid co-ordinates and the residuals), then the fitted
 * parameters. The original Trimble file is not kept, so this is how the calibration leaves the app as data; the
 * PDF report (calibration-pdf.ts) is how it leaves as a document.
 */
import type { SiteCalibration } from './siteCalibration'

/** Public path of the sample calibration file the Site Calibration step offers (public/templates/). */
export const SAMPLE_CALIBRATION_URL = '/templates/site-calibration-sample.xml'

const cell = (v: unknown, dp?: number): string => {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return ''
  const s = typeof v === 'number' && dp !== undefined ? v.toFixed(dp) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The calibration as CSV: the control pairs, a blank line, then the parameters and summary as name,value rows. */
export function calibrationCsv(cal: SiteCalibration): string {
  const rows: string[] = []
  rows.push([
    'Point', 'GNSS ID', 'Usage', 'Latitude (deg)', 'Longitude (deg)', 'Ellipsoid height (m)',
    'Control X (m)', 'Control Y (m)', 'Control elevation (m)',
    'Calculated X (m)', 'Calculated Y (m)', 'Calculated elevation (m)',
    'Horizontal residual (m)', 'Vertical residual (m)',
  ].join(','))
  for (const p of cal.pairs ?? []) {
    rows.push([
      cell(p.pointId), cell(p.globalPointId), cell(p.usage),
      cell(p.globalLatitudeDegrees, 9), cell(p.globalLongitudeDegrees, 9), cell(p.globalHeight, 3),
      cell(p.controlNorthing, 3), cell(p.controlEasting, 3), cell(p.controlElevation, 3),
      cell(p.calculatedNorthing, 3), cell(p.calculatedEasting, 3), cell(p.calculatedElevation, 3),
      cell(p.horizontalResidual, 4), cell(p.verticalResidual, 4),
    ].join(','))
  }
  rows.push('')
  rows.push('Parameter,Value')
  const h = cal.horizontal
  if (h) {
    rows.push(`Rotation centre X (m),${cell(h.rotationCentreNorthing, 3)}`)
    rows.push(`Rotation centre Y (m),${cell(h.rotationCentreEasting, 3)}`)
    rows.push(`Rotation (deg),${cell(h.rotationDegrees, 9)}`)
    rows.push(`Translation X (m),${cell(h.translationNorth, 4)}`)
    rows.push(`Translation Y (m),${cell(h.translationEast, 4)}`)
    rows.push(`Scale factor,${cell(h.scaleFactor, 9)}`)
  }
  rows.push(`Max horizontal residual (m),${cell(cal.summary?.maxHorizontalResidual, 4)}`)
  rows.push(`RMS horizontal (m),${cell(cal.summary?.rmsHorizontal, 4)}`)
  rows.push(`Vertical adjustment,${cal.hasVertical ? 'yes' : 'none'}`)
  return rows.join('\r\n') + '\r\n'
}
