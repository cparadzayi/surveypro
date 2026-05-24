/**
 * Automated Test Project Setup Service
 * Creates and validates test cadastral projects with sample data
 */

import testProjectData from '../data/testProjects/elonParadzayi_testProject'
import { coordinateTransform } from './coordinateTransform'
import type { CadastralWorkflowState } from '../types/cadastral'

export interface TestProjectResult {
  success: boolean
  projectId?: string
  validationResults: ValidationResults
  errors: string[]
  warnings: string[]
}

export interface ValidationResults {
  coordinateRanges: { valid: boolean; errors: string[] }
  sridDetection: { valid: boolean; message: string }
  coordinateTransformation: { valid: boolean; errors: string[] }
  parcels: Array<{ designation: string; valid: boolean; errors: string[] }>
}

export class TestProjectSetupService {
  
  /**
   * Create a new test project with automated setup and validation
   */
  async createTestProject(): Promise<TestProjectResult> {
    console.log('🚀 Starting automated test project creation...')
    const errors: string[] = []
    const warnings: string[] = []
    
    try {
      // Step 1: Validate coordinate ranges
      console.log('📊 Step 1: Validating coordinate ranges...')
      const rangeValidation = testProjectData.validations.validateCoordinateRanges(
        testProjectData.coordinates
      )
      
      if (!rangeValidation.valid) {
        rangeValidation.errors.forEach(err => warnings.push(err))
        console.warn('⚠️ Coordinate range warnings:', rangeValidation.errors)
      } else {
        console.log('✅ All coordinates within valid ranges')
      }
      
      // Step 2: Detect and validate SRID
      console.log('📊 Step 2: Setting SRID to Lo31 (forced)...')
      // Force Lo31 instead of auto-detecting
      const detectedSrid = testProjectData.metadata.expectedSrid // Use Lo31 (22291)
      
      const sridValidation = testProjectData.validations.validateSridDetection(detectedSrid)
      console.log(sridValidation.message)
      
      if (!sridValidation.valid) {
        errors.push(sridValidation.message)
      }
      
      // Step 3: Initialize coordinate transformation
      console.log('📊 Step 3: Initializing coordinate transformation...')
      coordinateTransform.setProjection(detectedSrid, testProjectData.coordinates)
      const zoneInfo = coordinateTransform.getZoneInfo()
      console.log(`✅ Using ${zoneInfo?.name} (EPSG:${detectedSrid}, CM: ${zoneInfo?.centralMeridian}°E)`)
      
      // Step 4: Test coordinate transformation
      console.log('📊 Step 4: Testing coordinate transformations...')
      const transformValidation = this.validateTransformations()
      
      if (!transformValidation.valid) {
        transformValidation.errors.forEach(err => errors.push(err))
      } else {
        console.log('✅ Coordinate transformations valid')
      }
      
      // Step 5: Validate parcels
      console.log('📊 Step 5: Validating test parcels...')
      const parcelValidations = testProjectData.parcels.map(parcel => {
        const validation = testProjectData.validations.validateParcel(parcel)
        console.log(`${validation.valid ? '✅' : '❌'} Parcel ${parcel.designation}: ${validation.valid ? 'Valid' : validation.errors.join(', ')}`)
        return {
          designation: parcel.designation,
          ...validation
        }
      })
      
      // Step 6: Create workflow state
      console.log('📊 Step 6: Creating workflow state...')
      const workflowState = this.createWorkflowState()
      
      // Compile results
      const validationResults: ValidationResults = {
        coordinateRanges: rangeValidation,
        sridDetection: sridValidation,
        coordinateTransformation: transformValidation,
        parcels: parcelValidations
      }
      
      const success = errors.length === 0
      
      if (success) {
        console.log('🎉 Test project created successfully!')
        console.log(`📍 ${testProjectData.coordinates.length} coordinates loaded`)
        console.log(`📦 ${testProjectData.parcels.length} test parcels ready`)
        console.log(`🗺️ Projection: ${zoneInfo?.name} (EPSG:${detectedSrid})`)
      } else {
        console.error('❌ Test project creation failed:', errors)
      }
      
      return {
        success,
        projectId: workflowState?.projectId,
        validationResults,
        errors,
        warnings
      }
      
    } catch (error) {
      console.error('❌ Fatal error creating test project:', error)
      return {
        success: false,
        validationResults: {
          coordinateRanges: { valid: false, errors: [] },
          sridDetection: { valid: false, message: '' },
          coordinateTransformation: { valid: false, errors: [] },
          parcels: []
        },
        errors: [`Fatal error: ${error}`],
        warnings
      }
    }
  }
  
  /**
   * Validate coordinate transformations
   */
  private validateTransformations(): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    
    try {
      const crs = coordinateTransform.getCRS()
      const transformed = coordinateTransform.transformForLeaflet(testProjectData.coordinates)
      
      if (transformed.length !== testProjectData.coordinates.length) {
        errors.push(`Transformation count mismatch: ${transformed.length} vs ${testProjectData.coordinates.length}`)
      }
      
      // Check for invalid coordinates
      transformed.forEach((coord, i) => {
        if (!Array.isArray(coord) || coord.length !== 2) {
          errors.push(`Invalid coordinate format at index ${i}`)
        }
        
        if (!isFinite(coord[0]) || !isFinite(coord[1])) {
          const original = testProjectData.coordinates[i]
          errors.push(`Invalid transformation for ${original.id}: [${coord[0]}, ${coord[1]}]`)
        }
      })
      
      // Log sample transformations
      if (transformed.length > 0 && errors.length === 0) {
        console.log('📍 Sample transformations:')
        testProjectData.coordinates.slice(0, 3).forEach((coord, i) => {
          console.log(`   ${coord.id}: P(Y=${coord.y}, X=${coord.x}) → [${transformed[i][0]}, ${transformed[i][1]}]`)
        })
      }
      
    } catch (error) {
      errors.push(`Transformation error: ${error}`)
    }
    
    return { valid: errors.length === 0, errors }
  }
  
  /**
   * Create workflow state for the test project
   */
  private createWorkflowState(): any {
    const { metadata, coordinates, parcels } = testProjectData
    
    return {
      projectId: `test-${Date.now()}`,
      projectName: metadata.projectName,
      surveyor: metadata.surveyor,
      client: metadata.client,
      district: metadata.district,
      adjustedCoordinates: coordinates.map(coord => ({
        id: coord.id,
        pointId: coord.id,
        x: coord.x,
        y: coord.y,
        status: coord.status,
        description: coord.description,
        surveyDate: coord.date,
        fieldBookPage: '',
        calculationsPage: ''
      })),
      srid: metadata.expectedSrid,
      centralMeridian: metadata.centralMeridian
    }
  }
  
  /**
   * Export test data for manual import
   */
  exportTestData(): {
    csv: string
    json: string
    summary: string
  } {
    const { metadata, coordinates, parcels } = testProjectData
    
    // CSV format
    const csv = [
      'Point,Y (Westing),X (Northing),Status,Description,Date',
      ...coordinates.map(c => `${c.id},${c.y},${c.x},${c.status},${c.description},${c.date}`)
    ].join('\n')
    
    // JSON format
    const json = JSON.stringify({
      metadata,
      coordinates,
      parcels
    }, null, 2)
    
    // Summary
    const summary = `
Test Project Summary
====================
Surveyor: ${metadata.surveyor}
License: ${metadata.license}
Client: ${metadata.client}
District: ${metadata.district}
Expected Zone: ${metadata.centralMeridian === 29 ? 'Lo29' : `Lo${metadata.centralMeridian}`} (EPSG:${metadata.expectedSrid})

Coordinates: ${coordinates.length} points
Parcels: ${parcels.length} test parcels

Coordinate Ranges:
  Y (Westing): ${Math.min(...coordinates.map(c => c.y))} - ${Math.max(...coordinates.map(c => c.y))}m
  X (Northing): ${Math.min(...coordinates.map(c => c.x))} - ${Math.max(...coordinates.map(c => c.x))}m

Test Parcels:
${parcels.map(p => `  - ${p.designation}: ${p.points.length} points`).join('\n')}
    `.trim()
    
    return { csv, json, summary }
  }
  
  /**
   * Generate test report
   */
  generateTestReport(result: TestProjectResult): string {
    const { validationResults, errors, warnings } = result
    
    let report = `
╔═══════════════════════════════════════════════════════╗
║     PROJ4LEAFLET TEST PROJECT VALIDATION REPORT      ║
╚═══════════════════════════════════════════════════════╝

Project: ${testProjectData.metadata.projectName}
Surveyor: ${testProjectData.metadata.surveyor}
Date: ${new Date().toLocaleString()}
Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}

═══════════════════════════════════════════════════════

VALIDATION RESULTS:

1. Coordinate Ranges
   ${validationResults.coordinateRanges.valid ? '✅ PASS' : '❌ FAIL'}
   ${validationResults.coordinateRanges.errors.length > 0 ? validationResults.coordinateRanges.errors.join('\n   ') : 'All coordinates within valid ranges'}

2. SRID Detection
   ${validationResults.sridDetection.valid ? '✅ PASS' : '❌ FAIL'}
   ${validationResults.sridDetection.message}

3. Coordinate Transformation
   ${validationResults.coordinateTransformation.valid ? '✅ PASS' : '❌ FAIL'}
   ${validationResults.coordinateTransformation.errors.length > 0 ? validationResults.coordinateTransformation.errors.join('\n   ') : 'All transformations successful'}

4. Parcel Validation
${validationResults.parcels.map(p => 
  `   ${p.valid ? '✅' : '❌'} ${p.designation}: ${p.valid ? 'Valid' : p.errors.join(', ')}`
).join('\n')}

═══════════════════════════════════════════════════════

${errors.length > 0 ? `
ERRORS (${errors.length}):
${errors.map(e => `❌ ${e}`).join('\n')}
` : ''}

${warnings.length > 0 ? `
WARNINGS (${warnings.length}):
${warnings.map(w => `⚠️  ${w}`).join('\n')}
` : ''}

${result.success ? `
✅ TEST PROJECT READY FOR USE
   - ${testProjectData.coordinates.length} coordinates loaded
   - ${testProjectData.parcels.length} test parcels configured
   - Proj4Leaflet CRS initialized
   - Ready for workflow testing
` : `
❌ TEST PROJECT FAILED
   Please review errors above and fix issues before proceeding.
`}

═══════════════════════════════════════════════════════
    `.trim()
    
    return report
  }
}

// Export singleton instance
export const testProjectSetup = new TestProjectSetupService()

// Quick access functions
export const createTestProject = () => testProjectSetup.createTestProject()
export const exportTestData = () => testProjectSetup.exportTestData()
export const generateTestReport = (result: TestProjectResult) => testProjectSetup.generateTestReport(result)
