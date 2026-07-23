import { reactive, ref } from 'vue'
import type { CadastralWorkflowState, CadastralPoint } from '../types/cadastral'
import { useSurveyLookupStore } from '../stores/surveyLookup'
import api from '../services/api'

// Project linkage for database persistence
const projectId = ref<number | null>(null)

// Centralized workflow state singleton for cadastral standard module
const workflowState = reactive<CadastralWorkflowState>({
  currentStep: 'project-setup',
  importedPoints: [],
  documents: {},
  surveyorInfo: {
    landSurveyor: '',
    licenseNumber: '',
    firm: '',
    address: '',
    surveyDate: '',
    surveyOf: '',
    instruments: ''
  },
  projectInfo: {
    name: '',
    district: '',
    surveyDescription: '',
    workingDirectory: ''
  },
  config: {
    project: {
      name: '',
      surveyorName: '',
      surveyorLicense: '',
      clientName: '',
      dateRange: { start: new Date(), end: new Date() }
    },
    coordinateSystem: {
      name: 'WGS84 / UTM Zone 36S',
      datum: 'WGS84',
      projection: 'UTM',
      zone: '36S'
    },
    formatting: {
      includeLetterhead: true,
      pageNumbering: true,
      crossReferences: true,
      precisionDisplay: { fieldBook: 3, coordinateList: 2 }
    }
  },
  validation: null
})

function buildCoordinateList() {
  const getPointGroup = (point: any) => {
    const desc = (point.description || '').toLowerCase();
    const status = (point.status || '').toLowerCase();
    if (desc.includes('trig') || desc.includes('town survey mark')) return 'Trig/Town Survey Mark';
    if (status.includes('working station')) return 'Working Station';
    if (status.includes('adopted')) return 'Adopted';
    if (status.includes('found')) return 'Found';
    if (status.includes('placed')) return 'Placed';
    if (status.includes('computed')) return 'Computed';
    return 'Other';
  }

  const groupOrder = [
    'Trig/Town Survey Mark',
    'Working Station',
    'Adopted',
    'Found',
    'Placed',
    'Computed',
    'Other'
  ];

  let processed = [...workflowState.importedPoints].map(point => ({
    ...point,
    group: getPointGroup(point)
  })).sort((a, b) => {
    const groupA = groupOrder.indexOf(a.group);
    const groupB = groupOrder.indexOf(b.group);
    if (groupA !== groupB) return groupA - groupB;
    return a.id?.localeCompare?.(b.id) ?? 0;
  });

  processed = processed.map(point => ({
    ...point,
    fieldBookObs: '-',
    calcsPage: '-',
    fieldBookPage: '-'
  }));

  workflowState.documents.coordinateList = {
    metadata: {
      title: 'Coordinate List',
      surveyorName: workflowState.surveyorInfo.landSurveyor,
      dateGenerated: new Date(),
      coordinateSystem: workflowState.config.coordinateSystem?.name || ''
    },
    points: processed.map((p: any) => ({
      id: p.id,
      coordinates: {
        y: (typeof p.coordinateList?.y === 'string' && p.coordinateList.y) ? p.coordinateList.y :
           (typeof p.fieldBook?.y === 'string' && p.fieldBook.y) ? p.fieldBook.y :
           (typeof p.original?.y === 'number' ? p.original.y.toFixed(2) : ''),
        x: (typeof p.coordinateList?.x === 'string' && p.coordinateList.x) ? p.coordinateList.x :
           (typeof p.fieldBook?.x === 'string' && p.fieldBook.x) ? p.fieldBook.x :
           (typeof p.original?.x === 'number' ? p.original.x.toFixed(2) : '')
      },
      status: p.status,
      description: p.description
    })),
    summary: {
      totalPoints: processed.length,
      fixedPoints: processed.filter((p: any) => p.status === 'F').length,
      pegPoints: processed.filter((p: any) => p.status === 'P').length
    }
  }
}

function buildFieldBook() {
  // Points per page MUST match the PDF generator exactly
  // Dynamic calculation: A4 page (297mm) - margins/headers (80mm) = 217mm available
  // Row height: ~8mm → 217mm / 8mm ≈ 27 points per page
  const pointsPerPage = 27; // MUST match CadastralStandardView.vue and calculations-part1.ts
  const lookupStore = useSurveyLookupStore();
  const lookup: Record<string, string> = {};
  
  // Build field book with page numbers
  const points = workflowState.importedPoints.map((point, index) => {
    const pageNumber = Math.floor(index / pointsPerPage) + 1;
    const pageLabel = `E${pageNumber}`;
    
    // Populate lookup table
    lookup[point.id] = pageLabel;
    
    return {
      id: point.id,
      coordinates: {
        y: point.fieldBook?.y ?? '',
        x: point.fieldBook?.x ?? ''
      },
      status: point.status,
      description: point.description,
      surveyDate: point.surveyDate,
      pageNumber
    };
  });
  
  // Store lookup table in Pinia for cross-referencing
  lookupStore.setFieldBookPageLookup(lookup);
  
  workflowState.documents.fieldBook = {
    metadata: {
      title: 'Electronic Field Book',
      surveyorName: workflowState.surveyorInfo.landSurveyor || 'Licensed Surveyor',
      dateGenerated: new Date(),
      pageCount: Math.ceil(workflowState.importedPoints.length / pointsPerPage) + 2
    },
    points,
    calculationRefs: {}
  };
}

function setImportedPoints(points: CadastralPoint[]) {
  workflowState.importedPoints = points;
  
  console.log('💾 [setImportedPoints] Saving', points.length, 'points');
  if (points.length > 0) {
    console.log('  - First point before save:', points[0]);
    console.log('  - First point.original.y:', points[0].original.y);
    console.log('  - First point.original.x:', points[0].original.x);
  }
  
  // Auto-save to database if linked to a project (non-blocking)
  if (projectId.value) {
    // Use setTimeout to make it truly non-blocking
    setTimeout(() => {
      const mappedPoints = points.map(p => ({
        id: p.id,
        y: p.original.y,
        x: p.original.x,
        status: p.status,
        description: p.description,
        survey_date: p.surveyDate.toISOString()
      }));
      
      console.log('===== STAGE 7: SAVE TO DATABASE (Mapping) ===== ');
      console.log('💾 [setImportedPoints] Mapped points for database:', mappedPoints.length);
      if (mappedPoints.length > 0) {
        console.log('  - First point BEFORE mapping:', points[0]);
        console.log('    - points[0].original:', points[0].original);
        console.log('    - points[0].original.y:', points[0].original.y);
        console.log('    - points[0].original.x:', points[0].original.x);
        console.log('  - First point AFTER mapping:', mappedPoints[0]);
        console.log('    - mappedPoints[0].y:', mappedPoints[0].y);
        console.log('    - mappedPoints[0].x:', mappedPoints[0].x);
      }
      
      // Pin the persistence to the explicit 'csv-import' step, NOT the ambient
      // currentStep. This deferred save runs ~100ms later, by which time callers
      // (e.g. handleDataImported) may have advanced currentStep to 'field-book' —
      // using saveWorkflowState('complete') would then write points under the
      // wrong step key, so the reload restore (which reads step_data['csv-import']
      // .points) would never find them.
      saveStepData('csv-import', {
        points: mappedPoints,
        coordinate_count: points.length,
        file_imported_at: new Date().toISOString()
      }).catch(err => {
        console.error('⚠️ Failed to auto-save imported points:', err)
        console.log('💡 Data is still imported locally, save will retry on next action')
      })
    }, 100)
  } else {
    console.log('ℹ️ No project linked, skipping auto-save')
  }
}

function resetWorkflow() {
  workflowState.currentStep = 'csv-import';
  workflowState.importedPoints = [];
  workflowState.documents = {};
  workflowState.validation = null;
  workflowState.adjustedCoordinates = undefined;
}

// Step-specific reset functions
function resetFieldBook() {
  delete workflowState.documents.fieldBook;
  console.log('Field Book reset');
}

function resetCalculationsPart1() {
  delete workflowState.documents.calculationsPart1;
  workflowState.adjustedCoordinates = undefined;
  console.log('Calculations Part 1 reset');
}

function resetCoordinateList() {
  delete workflowState.documents.coordinateList;
  console.log('Coordinate List reset');
}

function resetAreaComputation() {
  delete workflowState.documents.areaComputation;
  console.log('Area Computation reset');
}

function resetCurrentStep() {
  const step = workflowState.currentStep;
  switch (step) {
    case 'field-book':
      resetFieldBook();
      break;
    case 'calculations-part1':
      resetCalculationsPart1();
      break;
    case 'coordinate-list':
      resetCoordinateList();
      break;
    case 'area-computation':
      resetAreaComputation();
      break;
    default:
      console.warn('No reset function for step:', step);
  }
}

// ============================================
// Database Persistence Functions
// ============================================

/**
 * Link workflow to a survey project
 */
function linkToProject(surveyProjectId: number) {
  projectId.value = surveyProjectId
  console.log(`✅ Workflow linked to project ${surveyProjectId}`)
}

/**
 * Load workflow state from database
 */
async function loadWorkflowState(surveyProjectId: number) {
  try {
    console.log(`📥 Loading workflow state for project ${surveyProjectId}`)
    
    projectId.value = surveyProjectId
    const response = await api.get(`/survey-projects/${surveyProjectId}/workflow`)
    
    if (response.data.ok) {
      const dbState = response.data.workflow_state
      
      // Restore current step
      if (dbState.current_step) {
        workflowState.currentStep = dbState.current_step as any
      }
      
      // DEBUG: Show what step data keys exist
      console.log('🔍 [DEBUG] Available step_data keys:', Object.keys(dbState.step_data || {}));
      console.log('🔍 [DEBUG] Looking for csv-import or import_csv...');
      console.log('🔍 [DEBUG] csv-import exists?', !!dbState.step_data?.['csv-import']);
      console.log('🔍 [DEBUG] import_csv exists?', !!dbState.step_data?.import_csv);
      
      // Restore imported points if they exist (check both csv-import and import_csv for backwards compatibility)
      const csvStepData = dbState.step_data?.['csv-import'] || dbState.step_data?.import_csv;
      console.log('🔍 [DEBUG] csvStepData found?', !!csvStepData);
      console.log('🔍 [DEBUG] csvStepData contents:', csvStepData);
      console.log('🔍 [DEBUG] csvStepData keys:', csvStepData ? Object.keys(csvStepData) : []);
      console.log('🔍 [DEBUG] csvStepData.points exists?', !!csvStepData?.points);
      
      if (csvStepData?.points) {
        console.log('🔍 Restoring points from database...');
        console.log('  - Points in DB:', csvStepData.points.length);
        if (csvStepData.points.length > 0) {
          const firstPoint = csvStepData.points[0];
          console.log('  - First point from DB:', firstPoint);
          console.log('  - First point.y:', firstPoint.y);
          console.log('  - First point.x:', firstPoint.x);
          console.log('  - First point.status:', firstPoint.status);
          console.log('  - First point.original:', firstPoint.original);
        }
        
        workflowState.importedPoints = csvStepData.points.map((p: any) => ({
          id: p.id,
          original: { y: p.y || 0, x: p.x || 0 },
          fieldBook: { 
            y: (p.y || 0).toFixed(3), 
            x: (p.x || 0).toFixed(3) 
          },
          coordinateList: { 
            y: (p.y || 0).toFixed(2), 
            x: (p.x || 0).toFixed(2) 
          },
          status: p.status,
          description: p.description,
          surveyDate: new Date(p.survey_date || Date.now()),
          includeInFieldBook: true,
          includeInCoordinateList: true
        }))
        console.log(`✅ Restored ${workflowState.importedPoints.length} imported points`)
        if (workflowState.importedPoints.length > 0) {
          console.log('  - First restored point:', workflowState.importedPoints[0]);
          console.log('  - First restored point.original.y:', workflowState.importedPoints[0].original.y);
        }
      }

      // Fallback: if the JSON point-copy is absent (older projects, or a save that
      // never landed on the csv-import step), rebuild importedPoints from the
      // authoritative coordinate_points table so downstream steps (Field Book,
      // Coordinate List) work on revisit.
      if ((!workflowState.importedPoints || workflowState.importedPoints.length === 0) && surveyProjectId) {
        try {
          const { listCoordinatePoints } = await import('../services/spatial')
          const { coordinateToImportedPoint } = await import('./importedPointFromCoordinate')
          const cps = await listCoordinatePoints(Number(surveyProjectId))
          if (cps?.length) {
            workflowState.importedPoints = cps.map(coordinateToImportedPoint) as any
            console.log(`✅ Restored ${workflowState.importedPoints.length} imported points from coordinate_points (fallback)`)
          }
        } catch (e: any) {
          console.warn('⚠️ coordinate_points fallback failed:', e?.message)
        }
      }

      // Restore surveyorInfo if it exists in any step_data
      const latestStepWithSurveyorInfo = Object.values(dbState.step_data || {})
        .reverse()
        .find((stepData: any) => stepData?.surveyor_info)
      
      if (latestStepWithSurveyorInfo?.surveyor_info) {
        workflowState.surveyorInfo = {
          landSurveyor: latestStepWithSurveyorInfo.surveyor_info.landSurveyor || '',
          licenseNumber: latestStepWithSurveyorInfo.surveyor_info.licenseNumber || '',
          firm: latestStepWithSurveyorInfo.surveyor_info.firm || '',
          address: latestStepWithSurveyorInfo.surveyor_info.address || '',
          surveyDate: latestStepWithSurveyorInfo.surveyor_info.surveyDate || '',
          surveyOf: latestStepWithSurveyorInfo.surveyor_info.surveyOf || '',
          instruments: latestStepWithSurveyorInfo.surveyor_info.instruments || ''
        }
        console.log(`✅ Restored surveyor info: ${workflowState.surveyorInfo.landSurveyor}`)
      }
      
      // Restore adjusted coordinates from calculations_part1 step
      if (dbState.step_data?.['calculations-part1']?.adjusted_coordinates) {
        workflowState.adjustedCoordinates = dbState.step_data['calculations-part1'].adjusted_coordinates
        console.log(`✅ Restored ${workflowState.adjustedCoordinates.length} adjusted coordinates`)
      }

      // Restore the Report on Survey so the collated document can rebuild both
      // the Beacon Comparison Report and the narrative without the user having
      // to revisit the Report on Survey step.
      if (dbState.step_data?.['report-on-survey']?.report_data) {
        workflowState.reportOnSurvey = dbState.step_data['report-on-survey'].report_data
        console.log(
          `✅ Restored Report on Survey (${workflowState.reportOnSurvey?.beacons?.length || 0} beacons)`
        )
      }

      // Restore projectInfo from project-setup step
      if (dbState.step_data?.['project-setup']) {
        const setupData = dbState.step_data['project-setup']
        if (setupData.project_name) {
          workflowState.projectInfo.name = setupData.project_name
        }
        if (setupData.district) {
          workflowState.projectInfo.district = setupData.district
        }
        if (setupData.working_directory) {
          workflowState.projectInfo.workingDirectory = setupData.working_directory
        }
        if (setupData.central_meridian !== undefined) {
          workflowState.projectInfo.centralMeridian = setupData.central_meridian
          console.log(`✅ Restored central meridian: Lo${setupData.central_meridian}`)
        }
      }
      
      // CRITICAL: Set projectId in projectInfo so QGIS Export can access it
      if (surveyProjectId) {
        workflowState.projectInfo.projectId = surveyProjectId
        console.log(`✅ Restored project ID in projectInfo: ${surveyProjectId}`)
      }
      
      // Restore control points from control-point-selection step
      if (dbState.step_data?.['control-point-selection']) {
        const controlPointData = dbState.step_data['control-point-selection']
        if (controlPointData.central_meridian !== undefined) {
          workflowState.projectInfo.centralMeridian = controlPointData.central_meridian
          console.log(`✅ Restored central meridian from control points: Lo${controlPointData.central_meridian}`)
        }
        if (controlPointData.control_point_ids) {
          workflowState.projectInfo.controlPointIds = controlPointData.control_point_ids
          console.log(`✅ Restored ${controlPointData.control_point_ids.length} control point IDs`)
        }
      }
      
      // Restore document metadata
      if (dbState.generated_documents) {
        console.log(`✅ Restored ${Object.keys(dbState.generated_documents).length} document references`)
      }
      
      console.log(`✅ Workflow state loaded: current step = ${dbState.current_step}`)
      console.log(`✅ Completed steps: ${dbState.completed_steps.join(', ')}`)
      
      return dbState
    }
  } catch (error) {
    console.error('❌ Failed to load workflow state:', error)
    throw error
  }
}

/**
 * Save workflow state to database
 */
async function saveWorkflowState(
  action: 'complete' | 'update' | 'set_current' | 'add_document' | 'reset_step',
  metadata?: any
) {
  if (!projectId.value) {
    console.warn('⚠️ No project linked, skipping workflow state save')
    return
  }
  
  try {
    console.log(`💾 Saving workflow state: step=${workflowState.currentStep}, action=${action}`)
    
    const response = await api.patch(`/survey-projects/${projectId.value}/workflow`, {
      step: workflowState.currentStep,
      action,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        // Include surveyorInfo so it persists across reloads
        surveyor_info: workflowState.surveyorInfo
      }
    })
    
    if (response.data.ok) {
      console.log(`✅ Workflow state saved successfully`)
      return response.data.workflow_state
    }
  } catch (error) {
    console.error('❌ Failed to save workflow state:', error)
    // Don't throw - allow workflow to continue even if save fails
  }
}

/**
 * Mark current step as completed
 */
async function completeCurrentStep(metadata?: any) {
  return saveWorkflowState('complete', {
    ...metadata,
    coordinate_count: workflowState.importedPoints.length
  })
}

/**
 * Update current step without marking as complete
 */
async function updateCurrentStep(metadata?: any) {
  return saveWorkflowState('update', metadata)
}

/**
 * Save metadata to a specific named step (not necessarily the current step).
 * Use this when you need to update a previous step's data from a later step.
 */
async function saveStepData(step: string, metadata: any) {
  if (!projectId.value) {
    console.warn('⚠️ No project linked, skipping step data save')
    return
  }
  try {
    const response = await api.patch(`/survey-projects/${projectId.value}/workflow`, {
      step,
      action: 'update',
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        surveyor_info: workflowState.surveyorInfo
      }
    })
    if (response.data.ok) {
      console.log(`✅ Step data saved for step: ${step}`)
      return response.data.workflow_state
    }
  } catch (error) {
    console.error(`❌ Failed to save step data for step ${step}:`, error)
  }
}

/**
 * Set the current step (for navigation)
 */
async function setCurrentStep(step: string) {
  workflowState.currentStep = step as any
  await saveWorkflowState('set_current')
  
  // Reload workflow state to ensure all data (especially imported points) is loaded
  if (projectId.value) {
    console.log(`🔄 Reloading workflow state after navigating to step: ${step}`)
    await loadWorkflowState(projectId.value)
  }
}

/**
 * Add generated document reference
 */
async function addGeneratedDocument(documentKey: string, documentUrl: string, metadata?: any) {
  return saveWorkflowState('add_document', {
    document_key: documentKey,
    document_url: documentUrl,
    document_metadata: metadata
  })
}

/**
 * Reset a specific step (remove from completed)
 */
async function resetStep(step: string) {
  return saveWorkflowState('reset_step')
}

/**
 * Check if a coordinate list already exists in the database
 * Returns coordinate list metadata if it exists, null otherwise
 */
async function checkExistingCoordinateList(): Promise<{
  exists: boolean;
  metadata?: {
    point_count: number;
    generated_at: string;
    coordinate_count: number;
  };
  adjustedCoordinates?: any[];
} | null> {
  if (!projectId.value) {
    console.warn('⚠️ No project linked')
    return null
  }
  
  try {
    const response = await api.get(`/survey-projects/${projectId.value}/workflow`)
    
    if (response.data.ok) {
      const dbState = response.data.workflow_state
      
      // Check if coordinate list step has been completed
      const coordListStepData = dbState.step_data?.['coordinate-list']
      const calculationsStepData = dbState.step_data?.['calculations-part1']
      
      if (coordListStepData || (calculationsStepData?.adjusted_coordinates && calculationsStepData.adjusted_coordinates.length > 0)) {
        console.log('✅ Found existing coordinate list data in database')
        
        return {
          exists: true,
          metadata: {
            point_count: calculationsStepData?.point_count || 0,
            generated_at: calculationsStepData?.metadata?.timestamp || coordListStepData?.metadata?.timestamp || new Date().toISOString(),
            coordinate_count: calculationsStepData?.adjusted_coordinates?.length || 0
          },
          adjustedCoordinates: calculationsStepData?.adjusted_coordinates || []
        }
      }
    }
    
    return { exists: false }
  } catch (error) {
    console.error('❌ Error checking for existing coordinate list:', error)
    return null
  }
}

/**
 * Retrieve existing coordinate list from database and load it into workflow state
 */
async function loadExistingCoordinateList(): Promise<boolean> {
  if (!projectId.value) {
    console.warn('⚠️ No project linked')
    return false
  }
  
  try {
    const existing = await checkExistingCoordinateList()
    
    if (existing?.exists && existing.adjustedCoordinates) {
      // Load adjusted coordinates into workflow state
      workflowState.adjustedCoordinates = existing.adjustedCoordinates
      console.log(`✅ Loaded ${existing.adjustedCoordinates.length} adjusted coordinates from database`)
      return true
    }
    
    return false
  } catch (error) {
    console.error('❌ Error loading existing coordinate list:', error)
    return false
  }
}

export function useCadastralWorkflow() {
  return {
    workflowState,
    projectId,
    
    // Document builders
    buildCoordinateList,
    buildFieldBook,
    
    // Data management
    setImportedPoints,
    
    // Reset functions
    resetWorkflow,
    resetFieldBook,
    resetCalculationsPart1,
    resetCoordinateList,
    resetAreaComputation,
    resetCurrentStep,
    
    // Database persistence
    linkToProject,
    loadWorkflowState,
    saveWorkflowState,
    saveStepData,
    completeCurrentStep,
    updateCurrentStep,
    setCurrentStep,
    addGeneratedDocument,
    resetStep,
    
    // Coordinate list helpers
    checkExistingCoordinateList,
    loadExistingCoordinateList
  }
}

export default useCadastralWorkflow
