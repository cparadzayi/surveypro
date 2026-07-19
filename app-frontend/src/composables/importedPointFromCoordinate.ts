/**
 * Map an authoritative coordinate_points row (from listCoordinatePoints) into the
 * workflowState.importedPoints element shape — the restore fallback used when the
 * step_data['csv-import'].points JSON copy is absent. Mirrors the mapping at
 * useCadastralWorkflow.ts (restore of csvStepData.points).
 */
export interface CoordRow {
  name: string
  y: number
  x: number
  status?: string | null
  description?: string | null
  survey_date?: string | null
}

export function coordinateToImportedPoint(cp: CoordRow) {
  const y = Number.isFinite(Number(cp.y)) ? Number(cp.y) : 0
  const x = Number.isFinite(Number(cp.x)) ? Number(cp.x) : 0
  return {
    id: cp.name,
    original: { y, x },
    fieldBook: { y: y.toFixed(3), x: x.toFixed(3) },
    coordinateList: { y: y.toFixed(2), x: x.toFixed(2) },
    status: cp.status ?? undefined,
    description: cp.description ?? undefined,
    surveyDate: new Date(cp.survey_date || Date.now()),
    includeInFieldBook: true,
    includeInCoordinateList: true,
  }
}
