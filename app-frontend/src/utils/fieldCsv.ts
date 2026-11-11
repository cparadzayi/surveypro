import { formatSurveyDate } from './surveyDate'

/**
 * The current field data as a CSV the Import step reads back.
 *
 * The file saved to the project folder at import time is a snapshot of what was uploaded; the
 * surveyor then changes the field data through the interface (a mark reclassified as adopted and
 * taken out, a status or description corrected, points removed), and that snapshot goes stale. This is
 * built from the live points instead, so it is always the data as it stands now.
 *
 * Columns are exactly the importer's (Point, Y, X, Status, Description, Date of survey), so the file
 * round-trips: import it again and the same points come back. Y and X are the coordinates as
 * imported, in the survey's own Cape Lo system, not the rounded field-book or coordinate-list figures.
 */
export interface FieldCsvPoint {
  id: string
  original?: { y?: number | string; x?: number | string }
  y?: number | string
  x?: number | string
  status?: string | null
  description?: string | null
  surveyDate?: Date | string | null
}

export const FIELD_CSV_HEADER = 'Point,Y,X,Status,Description,Date of survey'

/** A cell, quoted when it holds a comma, a quote or a line break (RFC 4180). */
function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function coord(v: number | string | undefined): string {
  if (v === undefined || v === null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : String(v)
}

export function buildFieldCsv(points: FieldCsvPoint[]): string {
  const rows = (points ?? [])
    .filter((p) => p && p.id)
    .map((p) => [
      cell(p.id),
      cell(coord(p.original?.y ?? p.y)),
      cell(coord(p.original?.x ?? p.x)),
      cell(p.status ?? ''),
      cell(p.description ?? ''),
      cell(formatSurveyDate(p.surveyDate ?? null)),
    ].join(','))
  return [FIELD_CSV_HEADER, ...rows].join('\r\n') + '\r\n'
}

/** `<Project>_field_data_<yyyy-mm-dd>.csv`, the date being the day it is downloaded. */
export function fieldCsvFileName(projectName: string | null | undefined, now: Date = new Date()): string {
  const safe = String(projectName || 'Survey_Project').replace(/[^a-zA-Z0-9-_]/g, '_')
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `${safe}_field_data_${d}.csv`
}
