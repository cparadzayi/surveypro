/**
 * Which workflow steps a `reset_step` invalidates.
 *
 * A reset used to clear only the step it named, plus a hardcoded pair of CSV
 * spellings. That left every step derived from the coordinates claiming to be
 * complete while the coordinates themselves were gone: a project could hold a
 * field book, an adjustment and a finalised area computation over zero points,
 * because resetting the import deleted the `coordinate_points` rows but kept
 * `step_data['calculations-part1']` and the rest. The Survey Plan map then
 * rendered an empty frame and the preview route 404'd, with the area step still
 * reporting 16 adjusted coordinates.
 *
 * The rule is simply "a step's results are meaningless once an input it was
 * computed from is reset", so this is expressed as an ordered dependency list
 * rather than as per-case cleanup code. Everything after a reset step is
 * invalidated, because in this workflow every later step reads the coordinates
 * the earlier one produced.
 *
 * The list is ordered: `stepsInvalidatedBy` returns the downstream slice, and
 * `REQUIRED_STEPS` is checked against the surviving `completed_steps`, so the
 * ordering here is the workflow order.
 */
export const WORKFLOW_STEP_ORDER = [
  'project-setup',
  'csv-import',
  'site-calibration',
  'control-point-selection',
  'field-book',
  'calculations-part1',
  'found-beacons',
  'coordinate-list',
  'qgis-export',
  'area-computation',
  'servitudes',
  'survey-plan',
  'report-on-survey',
  'dsg-certificate'
]

/**
 * Steps that must be complete before a project can be finalized.
 *
 * `site-calibration` is deliberately absent: a GNSS site calibration is an
 * optional attachment (a surveyor who observed control with total station only
 * never produces one), so requiring it would strand every project without a
 * Trimble report.
 */
export const REQUIRED_STEPS = [
  'project-setup',
  'control-point-selection',
  'csv-import',
  'field-book',
  'calculations-part1',
  'coordinate-list',
  'area-computation',
  'report-on-survey',
  'dsg-certificate'
]

/** Legacy spellings that have been written into `step_data`/`completed_steps` over the years. */
const STEP_ALIASES = {
  'import_csv': 'csv-import',
  'project_setup': 'project-setup',
  'control_point_selection': 'control-point-selection',
  'field_book': 'field-book',
  'calculations_part1': 'calculations-part1',
  'found_beacons': 'found-beacons',
  'coordinate_list': 'coordinate-list',
  'qgis_export': 'qgis-export',
  'area_computation': 'area-computation',
  'report_on_survey': 'report-on-survey',
  'dsg_certificate': 'dsg-certificate'
}

/** Fold an underscore spelling onto its canonical hyphenated db key. */
export function canonicalStep(step) {
  if (typeof step !== 'string') return step
  return STEP_ALIASES[step] || step
}

/**
 * The step itself plus every step downstream of it.
 *
 * `reset_step` uses this to decide what to clear, so the invalidated step is
 * included (that is the caller's explicit intent) and anything not in the known
 * order resets to just itself.
 */
export function stepsInvalidatedBy(step) {
  const canonical = canonicalStep(step)
  const index = WORKFLOW_STEP_ORDER.indexOf(canonical)
  if (index === -1) return [canonical]
  return WORKFLOW_STEP_ORDER.slice(index)
}

/**
 * Apply a reset to a workflow_state object in place.
 *
 * Clearing `step_data` and `completed_steps` together is the whole point: a
 * step must not be able to be "complete" with no data behind it, and the
 * remaining data must not describe coordinates that no longer exist.
 *
 * Returns the canonical step names that were cleared, so the caller can log
 * them; the reset is a bulk delete, not something worth reporting per-step to
 * the surveyor.
 */
export function applyStepReset(workflowState, step) {
  const invalidated = new Set(stepsInvalidatedBy(step).map(canonicalStep))

  // Matched against canonical names, so a legacy `import_csv` in completed_steps
  // is dropped by a `csv-import` reset and vice versa.
  const before = workflowState.completed_steps || []
  workflowState.completed_steps = before.filter(s => !invalidated.has(canonicalStep(s)))

  if (workflowState.step_data) {
    for (const key of Object.keys(workflowState.step_data)) {
      if (invalidated.has(canonicalStep(key))) delete workflowState.step_data[key]
    }
  }

  // Document references point at PDFs rendered from the invalidated steps. The
  // files stay on disk; the references go, so nothing offers a PDF describing
  // coordinates that have since been replaced.
  if (workflowState.generated_documents) {
    for (const key of Object.keys(workflowState.generated_documents)) {
      if (invalidated.has(canonicalStep(key))) delete workflowState.generated_documents[key]
    }
  }

  return [...invalidated]
}

/** Whether every required step is still complete. */
export function canFinalize(workflowState) {
  const completed = workflowState.completed_steps || []
  return REQUIRED_STEPS.every(s => completed.includes(s))
}
