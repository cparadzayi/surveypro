import { createProject, createLayer, createFeature, type Project, type Layer } from './spatial'
import type { AdjustedCoordinate } from '../types/adjusted-coordinates'
import type { SurveyProject } from '../composables/useSurveyors'

/**
 * Service for managing project points layers
 * Creates spatial layers from cadastral survey coordinates
 */

export interface ProjectPointsLayerResult {
  project: Project
  layer: Layer
  featuresCreated: number
  errors: string[]
}

/**
 * Create or get spatial project for a survey project
 */
async function ensureSpatialProject(surveyProject: SurveyProject): Promise<Project> {
  // For now, create a new spatial project
  // In future, we could link survey_projects to spatial projects via a foreign key
  const projectData = {
    name: `${surveyProject.name} - Survey Points`,
    code: surveyProject.project_id?.toString() || undefined,
    description: `Coordinate points from ${surveyProject.name}\nClient: ${surveyProject.client_name || 'N/A'}\nDistrict: ${surveyProject.district || 'N/A'}`
  }
  
  return await createProject(projectData)
}

/**
 * Create a points layer with all coordinate list attributes
 */
async function createPointsLayer(projectId: number, surveyProject: SurveyProject): Promise<Layer> {
  // Determine SRID from central meridian
  // Using Cape datum / Gauss Conform projections (Clarke 1880 Modified ellipsoid)
  const sridMap: Record<number, number> = {
    25: 22285, // Cape / Lo25 (EPSG:22285) - Clarke 1880 Modified
    27: 22287, // Cape / Lo27 (EPSG:22287) - Clarke 1880 Modified
    29: 22289, // Cape / Lo29 (EPSG:22289) - Clarke 1880 Modified
    31: 22291, // Cape / Lo31 (EPSG:22291) - Clarke 1880 Modified
    33: 22293  // Cape / Lo33 (EPSG:22293) - Clarke 1880 Modified
  }
  
  const centralMeridian = surveyProject.central_meridian || 29
  const srid = sridMap[centralMeridian] || 22289
  
  const layerData = {
    name: `${surveyProject.name} - Coordinate List Points`,
    layer_type: 'survey_points',
    geom_type: 'Point',
    srid: srid,
    params: {
      survey_project_id: surveyProject.id,
      survey_date: surveyProject.survey_date,
      surveyor_id: surveyProject.surveyor_id,
      central_meridian: `Lo${centralMeridian}`,
      source: 'coordinate_list'
    }
  }
  
  return await createLayer(projectId, layerData)
}

/**
 * Convert adjusted coordinate to GeoJSON feature properties
 */
function coordinateToFeatureProperties(coord: AdjustedCoordinate) {
  return {
    // Primary identifiers
    name: coord.pointId,
    beacon: coord.pointId,
    point_name: coord.pointId,
    
    // Status and classification
    status: coord.status,
    fp_indicator: coord.status, // F/P indicator (Found/Placed)
    
    // Description
    description: coord.description,
    monument_type: coord.description,
    
    // Survey metadata
    survey_date: coord.surveyDate,
    date_of_survey: coord.surveyDate,
    
    // Document references
    field_book_page: coord.fieldBookPage,
    calculations_page: coord.calculationsPage,
    fb_reference: coord.fieldBookPage,
    calcs_reference: coord.calculationsPage.toString(),
    
    // Coordinate values (as strings for display)
    y_coordinate: coord.y.toFixed(2),
    x_coordinate: coord.x.toFixed(2),
    northing: coord.y.toFixed(2),
    easting: coord.x.toFixed(2),
    
    // Adjustment metadata (if available)
    is_duplicate: coord.adjustment?.isDuplicate || false,
    observation_count: coord.adjustment?.observationCount || 1,
    adjustment_method: coord.adjustment?.method || 'single',
    within_tolerance: coord.adjustment?.withinTolerance !== false,
    max_residual_y: coord.adjustment?.maxResidualY?.toFixed(3) || null,
    max_residual_x: coord.adjustment?.maxResidualX?.toFixed(3) || null,
    
    // Source information
    source: 'coordinate_list',
    source_document: 'Coordinate List (Cadastral Standard Workflow)',
    
    // Timestamp
    created_at: new Date().toISOString()
  }
}

/**
 * Create project points layer from coordinate list
 * 
 * This function:
 * 1. Creates a spatial project (if needed)
 * 2. Creates a points layer with proper SRID
 * 3. Imports all adjusted coordinates as features
 * 4. Preserves all coordinate list attributes
 * 
 * @param surveyProject - The survey project context
 * @param adjustedCoordinates - Coordinates from Calculations Part 1
 * @returns Result with project, layer, and import statistics
 */
export async function createProjectPointsLayer(
  surveyProject: SurveyProject,
  adjustedCoordinates: AdjustedCoordinate[]
): Promise<ProjectPointsLayerResult> {
  const errors: string[] = []
  
  try {
    console.log(`[ProjectPoints] Creating points layer for project: ${surveyProject.name}`)
    console.log(`[ProjectPoints] Importing ${adjustedCoordinates.length} points`)
    
    // Step 1: Ensure spatial project exists
    const spatialProject = await ensureSpatialProject(surveyProject)
    console.log(`[ProjectPoints] Spatial project created: ${spatialProject.name} (ID: ${spatialProject.id})`)
    
    // Step 2: Create points layer
    const layer = await createPointsLayer(spatialProject.id, surveyProject)
    console.log(`[ProjectPoints] Layer created: ${layer.name} (ID: ${layer.id}, SRID: ${layer.srid})`)
    
    // Step 3: Import all points as features
    let featuresCreated = 0
    for (const coord of adjustedCoordinates) {
      try {
        const geometry = {
          type: 'Point' as const,
          coordinates: [coord.x, coord.y] // GeoJSON standard: [X, Y]
        }
        
        const properties = coordinateToFeatureProperties(coord)
        
        await createFeature(layer.id, { geometry, properties })
        featuresCreated++
        
        if (featuresCreated % 10 === 0) {
          console.log(`[ProjectPoints] Imported ${featuresCreated}/${adjustedCoordinates.length} points...`)
        }
      } catch (error) {
        const errorMsg = `Failed to import point ${coord.pointId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.error(`[ProjectPoints] ${errorMsg}`)
        errors.push(errorMsg)
      }
    }
    
    console.log(`[ProjectPoints] ✅ Successfully imported ${featuresCreated}/${adjustedCoordinates.length} points`)
    
    if (errors.length > 0) {
      console.warn(`[ProjectPoints] ⚠️ ${errors.length} errors occurred during import`)
    }
    
    return {
      project: spatialProject,
      layer,
      featuresCreated,
      errors
    }
  } catch (error) {
    const errorMsg = `Failed to create project points layer: ${error instanceof Error ? error.message : 'Unknown error'}`
    console.error(`[ProjectPoints] ${errorMsg}`)
    errors.push(errorMsg)
    throw error
  }
}

/**
 * Get feature properties schema for documentation
 */
export function getPointsLayerSchema() {
  return {
    // Primary identifiers
    name: 'string - Point identifier (e.g., "2342C")',
    beacon: 'string - Beacon identifier',
    point_name: 'string - Point name',
    
    // Status and classification
    status: 'string - Point status (F=Fixed, P=Peg, etc.)',
    fp_indicator: 'string - F/P indicator',
    
    // Description
    description: 'string - Monument description',
    monument_type: 'string - Type of monument',
    
    // Survey metadata
    survey_date: 'string - Survey date (ISO format)',
    date_of_survey: 'string - Date of survey',
    
    // Document references
    field_book_page: 'string - Field Book page (e.g., "E1")',
    calculations_page: 'number - Calculations Part 1 page',
    fb_reference: 'string - Field Book reference',
    calcs_reference: 'string - Calculations reference',
    
    // Coordinate values
    y_coordinate: 'string - Y coordinate (2 decimals)',
    x_coordinate: 'string - X coordinate (2 decimals)',
    northing: 'string - Northing value',
    easting: 'string - Easting value',
    
    // Adjustment metadata
    is_duplicate: 'boolean - Was adjusted from duplicates',
    observation_count: 'number - Number of observations',
    adjustment_method: 'string - mean|gps|single|computed',
    within_tolerance: 'boolean - Within survey tolerance',
    max_residual_y: 'string - Max Y residual (meters)',
    max_residual_x: 'string - Max X residual (meters)',
    
    // Source information
    source: 'string - Data source',
    source_document: 'string - Source document name',
    created_at: 'string - Import timestamp (ISO)'
  }
}
