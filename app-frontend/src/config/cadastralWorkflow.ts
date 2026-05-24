/**
 * Cadastral Workflow Configuration
 * 
 * Defines the 7-step cadastral workflow with dependencies,
 * actions, and navigation rules.
 */

export interface WorkflowStep {
  id: string
  order: number
  label: string
  description: string
  icon: string
  dbKey: string // Maps to existing step names in codebase
  requires: string[] // Prerequisites
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
    requires: [],
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
    requires: ['project_setup'],
    canEdit: true,
    generatesDocument: false
  },
  
  control_point_selection: {
    id: 'control_point_selection',
    order: 2,
    label: 'Control Point Selection',
    description: 'Select trig beacons and control points',
    icon: '🔺',
    dbKey: 'control-point-selection',
    requires: ['import_csv'],
    canEdit: true,
    generatesDocument: false
  },
  
  field_book: {
    id: 'field_book',
    order: 3,
    label: 'Field Book',
    description: 'Generate electronic field book (3 decimals)',
    icon: '📖',
    dbKey: 'field-book',
    requires: ['import_csv'],
    canEdit: true,
    generatesDocument: true
  },
  
  calculations_part1: {
    id: 'calculations_part1',
    order: 4,
    label: 'Calculations Part 1',
    description: 'Field computations and adjustments',
    icon: '🧮',
    dbKey: 'calculations-part1',
    requires: ['field_book'],
    canEdit: true,
    generatesDocument: true
  },
  
  found_beacons: {
    id: 'found_beacons',
    order: 5,
    label: 'Found Beacons Assessment',
    description: 'Assess found beacons per SI 727 Section 67(5)',
    icon: '🔍',
    dbKey: 'found-beacons',
    requires: ['calculations_part1'],
    canEdit: true,
    generatesDocument: false
  },
  
  coordinate_list: {
    id: 'coordinate_list',
    order: 6,
    label: 'Coordinate List',
    description: 'Final coordinate list (2 decimals)',
    icon: '📋',
    dbKey: 'coordinate-list',
    requires: ['found_beacons'],
    canEdit: true,
    generatesDocument: true
  },
  
  qgis_export: {
    id: 'qgis_export',
    order: 7,
    label: 'QGIS Export & Digitization',
    description: 'Export coordinates and digitize parcels in QGIS',
    icon: '🗺️',
    dbKey: 'qgis-export',
    requires: ['coordinate_list'],
    canEdit: true,
    generatesDocument: false
  },
  
  area_computation: {
    id: 'area_computation',
    order: 8,
    label: 'Area Computation',
    description: 'Areas and consistencies',
    icon: '📐',
    dbKey: 'area-computation',
    requires: ['qgis_export'],
    canEdit: false,
    generatesDocument: true
  },
  
  survey_plan: {
    id: 'survey_plan',
    order: 9,
    label: 'Survey Plan',
    description: 'Generate General Plans, Diagrams, or Working Plans',
    icon: '🗺️',
    dbKey: 'survey-plan',
    requires: ['area_computation'],
    canEdit: true,
    generatesDocument: true
  },
  
  report_on_survey: {
    id: 'report_on_survey',
    order: 10,
    label: 'Report on Survey',
    description: 'Standalone survey report',
    icon: '📄',
    dbKey: 'report-on-survey',
    requires: ['survey_plan'],
    canEdit: true,
    generatesDocument: true
  },
  
  dsg_certificate: {
    id: 'dsg_certificate',
    order: 11,
    label: 'DSG Certificate',
    description: 'Final certificate generation',
    icon: '🏆',
    dbKey: 'dsg-certificate',
    requires: ['report_on_survey'],
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
 * Check if user can access a step
 */
export function canAccessStep(
  stepId: string,
  completedSteps: string[]
): {
  allowed: boolean
  reason?: string
  missingSteps?: string[]
} {
  const step = CADASTRAL_STEPS[stepId]
  
  if (!step) {
    return { allowed: false, reason: 'Invalid step' }
  }
  
  // Check prerequisites
  const missingSteps = step.requires.filter(
    reqStep => !completedSteps.includes(reqStep)
  )
  
  if (missingSteps.length > 0) {
    const missingLabels = missingSteps
      .map(id => CADASTRAL_STEPS[id]?.label || id)
      .join(', ')
    
    return {
      allowed: false,
      reason: `Please complete: ${missingLabels}`,
      missingSteps
    }
  }
  
  return { allowed: true }
}

/**
 * Get step status
 */
export function getStepStatus(
  stepId: string,
  completedSteps: string[],
  currentStep: string
): 'completed' | 'active' | 'available' | 'locked' {
  if (completedSteps.includes(stepId)) {
    return 'completed'
  }
  
  const dbKey = stepIdToDbKey(stepId)
  if (currentStep === dbKey) {
    return 'active'
  }
  
  const access = canAccessStep(stepId, completedSteps)
  return access.allowed ? 'available' : 'locked'
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
  if (!current || current.order === 1) return null
  
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

/**
 * Check if editing a step will affect downstream steps
 */
export function hasDownstreamDependents(
  stepId: string,
  completedSteps: string[]
): boolean {
  const step = CADASTRAL_STEPS[stepId]
  if (!step) return false
  
  const downstreamSteps = Object.values(CADASTRAL_STEPS)
    .filter(s => s.order > step.order)
  
  return downstreamSteps.some(s => completedSteps.includes(s.id))
}

/**
 * Get steps that depend on this step
 */
export function getDependentSteps(stepId: string): WorkflowStep[] {
  return Object.values(CADASTRAL_STEPS)
    .filter(step => step.requires.includes(stepId))
}
