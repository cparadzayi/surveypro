/**
 * Cadastral Workflow Configuration
 *
 * Defines the cadastral workflow: the step registry, its display order, and the
 * actions each step offers. `order` is contiguous from 0 —
 * `getNextStep`/`getPreviousStep` look steps up as `order ± 1`, so inserting a
 * step means renumbering those after it.
 *
 * Steps are NOT sequentially gated. A step is reachable whenever the surveyor
 * needs it; whether it can do anything useful depends on the data present, which
 * each step reports itself. This is deliberate — surveyors routinely work out of
 * order and import work done outside the app, and a rigid prerequisite chain
 * blocked legitimate use.
 */

export interface WorkflowStep {
  id: string
  order: number
  label: string
  description: string
  icon: string
  dbKey: string // Maps to existing step names in codebase
  canEdit: boolean
  generatesDocument: boolean
  isFinal?: boolean
}

export const CADASTRAL_STEPS: Record<string, WorkflowStep> = {
  project_setup: {
    id: 'project_setup',
    order: 0,
    label: 'Project Setup',
    description: 'Configure project details and working directory',
    icon: '⚙️',
    dbKey: 'project-setup',
    canEdit: true,
    generatesDocument: false
  },
  
  import_csv: {
    id: 'import_csv',
    order: 1,
    label: 'Import CSV',
    description: 'Upload and validate coordinate data',
    icon: '📥',
    dbKey: 'csv-import',
    canEdit: true,
    generatesDocument: false
  },
  
  site_calibration: {
    id: 'site_calibration',
    order: 2,
    label: 'Site Calibration',
    description: 'Attach the GNSS site calibration report for this survey',
    icon: '📡',
    dbKey: 'site-calibration',
    // A site calibration is an observation record, not a coordinate source: a
    // surveyor may load the Trimble report before, after or entirely without
    // importing a CSV. It is also absent from REQUIRED_STEPS on the backend, so a
    // project without one still finalizes.
    canEdit: true,
    generatesDocument: false
  },
  
  control_point_selection: {
    id: 'control_point_selection',
    order: 3,
    label: 'Control Point Selection',
    description: 'Select trig beacons and control points',
    icon: '🔺',
    dbKey: 'control-point-selection',
    canEdit: true,
    generatesDocument: false
  },
  
  field_book: {
    id: 'field_book',
    order: 4,
    label: 'Field Book',
    description: 'Generate electronic field book (3 decimals)',
    icon: '📖',
    dbKey: 'field-book',
    canEdit: true,
    generatesDocument: true
  },
  
  calculations_part1: {
    id: 'calculations_part1',
    order: 5,
    label: 'Calculations Part 1',
    description: 'Field computations and adjustments',
    icon: '🧮',
    dbKey: 'calculations-part1',
    canEdit: true,
    generatesDocument: true
  },
  
  found_beacons: {
    id: 'found_beacons',
    order: 6,
    label: 'Found Beacons Assessment',
    description: 'Assess found beacons per SI 727 Section 67(5)',
    icon: '🔍',
    dbKey: 'found-beacons',
    canEdit: true,
    generatesDocument: false
  },
  
  coordinate_list: {
    id: 'coordinate_list',
    order: 7,
    label: 'Coordinate List',
    description: 'Final coordinate list (2 decimals)',
    icon: '📋',
    dbKey: 'coordinate-list',
    canEdit: true,
    generatesDocument: true
  },
  
  qgis_export: {
    id: 'qgis_export',
    order: 8,
    label: 'QGIS Export & Digitization',
    description: 'Export coordinates and digitize parcels in QGIS',
    icon: '🗺️',
    dbKey: 'qgis-export',
    canEdit: true,
    generatesDocument: false
  },
  
  area_computation: {
    id: 'area_computation',
    order: 9,
    label: 'Parcel Digitization & Areas',
    description: 'Digitize parcels and generate areas with per-parcel consistency checks',
    icon: '📐',
    dbKey: 'area-computation',
    canEdit: false,
    generatesDocument: true
  },
  
  servitudes: {
    id: 'servitudes',
    order: 10,
    label: 'Servitudes & Dispensation',
    description: 'Identify boundary servitudes and generate dispensation certificates',
    icon: '⚖️',
    dbKey: 'servitudes',
    canEdit: true,
    generatesDocument: true
  },

  survey_plan: {
    id: 'survey_plan',
    order: 11,
    label: 'Survey Plan',
    description: 'Generate General Plans, Diagrams, or Working Plans',
    icon: '🗺️',
    dbKey: 'survey-plan',
    canEdit: true,
    generatesDocument: true
  },

  report_on_survey: {
    id: 'report_on_survey',
    order: 12,
    label: 'Report on Survey',
    description: 'Standalone survey report',
    icon: '📄',
    dbKey: 'report-on-survey',
    canEdit: true,
    generatesDocument: true
  },

  dsg_certificate: {
    id: 'dsg_certificate',
    order: 13,
    label: 'DSG Certificate',
    description: 'Final certificate generation',
    icon: '🏆',
    dbKey: 'dsg-certificate',
    canEdit: false,
    generatesDocument: true,
    isFinal: true
  }
}

/**
 * Get steps in order
 */
export function getWorkflowSteps(): WorkflowStep[] {
  return Object.values(CADASTRAL_STEPS).sort((a, b) => a.order - b.order)
}

/**
 * Get step by database key (e.g., 'csv-import' -> import_csv)
 */
export function getStepByDbKey(dbKey: string): WorkflowStep | undefined {
  return Object.values(CADASTRAL_STEPS).find(step => step.dbKey === dbKey)
}

/**
 * Get step by ID
 */
export function getStepById(id: string): WorkflowStep | undefined {
  return CADASTRAL_STEPS[id]
}

/**
 * Map database key to step ID
 */
export function dbKeyToStepId(dbKey: string): string {
  const step = getStepByDbKey(dbKey)
  return step?.id || dbKey
}

/**
 * Map step ID to database key
 */
export function stepIdToDbKey(stepId: string): string {
  const step = CADASTRAL_STEPS[stepId]
  return step?.dbKey || stepId
}

/**
 * Get available actions for a step
 */
export interface StepAction {
  type: 'primary' | 'secondary'
  label: string
  action: 'start' | 'view' | 'edit' | 'proceed' | 'download'
  icon?: string
  variant?: 'default' | 'success' | 'warning'
}

export function getStepActions(
  stepId: string,
  completedSteps: string[],
  hasDocuments: boolean = false
): StepAction[] {
  const step = CADASTRAL_STEPS[stepId]
  const isCompleted = completedSteps.includes(stepId)
  const actions: StepAction[] = []
  
  if (!isCompleted) {
    // Step not started
    actions.push({
      type: 'primary',
      label: `Start ${step.label}`,
      action: 'start',
      icon: '▶️',
      variant: 'success'
    })
  } else {
    // Step completed
    actions.push({
      type: 'primary',
      label: 'View',
      action: 'view',
      icon: '👁️',
      variant: 'default'
    })
    
    if (step.canEdit) {
      actions.push({
        type: 'secondary',
        label: 'Edit / Re-generate',
        action: 'edit',
        icon: '✏️',
        variant: 'default'
      })
    }
    
    if (step.generatesDocument && hasDocuments) {
      actions.push({
        type: 'secondary',
        label: 'Download PDF',
        action: 'download',
        icon: '⬇️',
        variant: 'default'
      })
    }
    
    // Add "Proceed" button if next step is available
    const nextStep = getNextStep(stepId)
    if (nextStep && !completedSteps.includes(nextStep.id)) {
      actions.push({
        type: 'primary',
        label: `Proceed to ${nextStep.label}`,
        action: 'proceed',
        icon: '→',
        variant: 'success'
      })
    }
  }
  
  return actions
}

/**
 * Get next step in workflow
 */
export function getNextStep(currentStepId: string): WorkflowStep | null {
  const current = CADASTRAL_STEPS[currentStepId]
  if (!current) return null
  
  const steps = getWorkflowSteps()
  const nextIndex = current.order
  
  return steps.find(s => s.order === nextIndex + 1) || null
}

/**
 * Get previous step in workflow
 */
export function getPreviousStep(currentStepId: string): WorkflowStep | null {
  const current = CADASTRAL_STEPS[currentStepId]
  // 0 is the first step, not 1. The guard used to read `order === 1`, which only
  // happened to be right while the second step was numbered 1; it silently
  // stopped "back" from working the moment anything was inserted ahead of it.
  if (!current || current.order === 0) return null
  
  const steps = getWorkflowSteps()
  return steps.find(s => s.order === current.order - 1) || null
}

/**
 * Calculate workflow progress percentage
 */
export function getWorkflowProgress(completedSteps: string[]): number {
  const totalSteps = Object.keys(CADASTRAL_STEPS).length
  return Math.round((completedSteps.length / totalSteps) * 100)
}
