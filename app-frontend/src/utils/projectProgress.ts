/** How far a project has got through the 14-step cadastral workflow, from its saved `workflow_state`. */

export const WORKFLOW_STEPS: { id: string; label: string }[] = [
  { id: 'project-setup', label: 'Project Setup' },
  { id: 'csv-import', label: 'Import CSV' },
  { id: 'site-calibration', label: 'Site Calibration' },
  { id: 'control-point-selection', label: 'Control Point Selection' },
  { id: 'field-book', label: 'Field Book' },
  { id: 'calculations-part1', label: 'Calculations Part 1' },
  { id: 'found-beacons', label: 'Found Beacons' },
  { id: 'coordinate-list', label: 'Coordinate List' },
  { id: 'qgis-export', label: 'QGIS Export' },
  { id: 'area-computation', label: 'Parcel Digitization & Areas' },
  { id: 'servitudes', label: 'Servitudes & Dispensation' },
  { id: 'survey-plan', label: 'Survey Plan' },
  { id: 'report-on-survey', label: 'Report on Survey' },
  { id: 'dsg-certificate', label: 'DSG Certificate' },
]

/** Spellings written over the years: `import_csv`, `project_setup`, ... */
function canonical(step: unknown): string {
  if (typeof step !== 'string') return ''
  if (step === 'import_csv') return 'csv-import'
  return step.replace(/_/g, '-')
}

export interface ProjectProgress {
  done: number
  total: number
  /** The first step, in workflow order, that is not complete; null when every step is. */
  next: string | null
}

export function projectProgress(workflowState: unknown): ProjectProgress {
  let state: any = workflowState
  if (typeof state === 'string') {
    try { state = JSON.parse(state) } catch { state = null }
  }
  const completed = new Set<string>(
    Array.isArray(state?.completed_steps) ? state.completed_steps.map(canonical).filter(Boolean) : [],
  )
  const known = WORKFLOW_STEPS.filter((s) => completed.has(s.id))
  const next = WORKFLOW_STEPS.find((s) => !completed.has(s.id))
  return { done: known.length, total: WORKFLOW_STEPS.length, next: next ? next.label : null }
}
