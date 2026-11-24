/**
 * The points a smart merge (CSV re-import) sends to POST /csv-imports/execute-merge, with each point's own
 * status, description and survey date from the file.
 *
 * The merge used to send only { id, y, x }: a new point was inserted with no status or description (so it
 * printed as neither found nor placed), and a matched point could never take a corrected status from the
 * file. The analysis (analyze-merge) knows only names and co-ordinates, so the attributes are looked up here,
 * by name, in the file's parsed points.
 */
import type { PointMatch, NewPoint } from '../../../services/csvImports'
import { toISODate } from '../../../utils/surveyDate'

export interface FilePoint {
  id?: string
  name?: string
  y?: number
  x?: number
  original?: { y?: number; x?: number }
  status?: string
  description?: string
  surveyDate?: string | Date | null
}

export interface PointAttributes {
  status?: string
  description?: string
  surveyDate?: string | null
}

const keyOf = (s: unknown) => String(s ?? '').trim().toUpperCase()

/** The file's attributes for one point, only those it states. */
function attributesOf(p: FilePoint | undefined): PointAttributes {
  if (!p) return {}
  const out: PointAttributes = {}
  if (p.status != null && String(p.status).trim() !== '') out.status = String(p.status).trim()
  if (p.description != null && String(p.description).trim() !== '') out.description = String(p.description).trim()
  const date = toISODate(p.surveyDate as any)
  if (date) out.surveyDate = date
  return out
}

export function buildMergePayload(
  filePoints: FilePoint[],
  analysis: { matched: PointMatch[]; newPoints: NewPoint[] },
): {
  matched_points: Array<PointMatch & PointAttributes>
  new_points: Array<{ id: string; y: number; x: number } & PointAttributes>
} {
  const byName = new Map<string, FilePoint>()
  for (const p of filePoints ?? []) {
    const k = keyOf(p.id ?? p.name)
    if (k && !byName.has(k)) byName.set(k, p)
  }
  return {
    matched_points: (analysis.matched ?? []).map((m) => ({ ...m, ...attributesOf(byName.get(keyOf(m.newId))) })),
    new_points: (analysis.newPoints ?? []).map((p) => ({
      id: p.id,
      y: p.coordinate.y,
      x: p.coordinate.x,
      ...attributesOf(byName.get(keyOf(p.id))),
    })),
  }
}
