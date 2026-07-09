/**
 * Composable for generating Comprehensive_Latest PDF
 * Combines Calculations Part 1 + Area & Consistency sections
 * 
 * Single source of truth for comprehensive PDF generation across:
 * - MapLibreAreaView (Area Computation workflow)
 * - SurveyPlanMapView (Survey Plan export)
 */

import { useAreaConsistencyPDF } from './useAreaConsistencyPDF'
import { saveDocument } from '@/services/documentStorage'
import { listCoordinatePoints } from '@/services/spatial'
import type { Parcel } from './useAreaCompliance'

export interface ComprehensivePDFOptions {
  computedParcels: Parcel[]
  calcPart1Blob: Blob
  projectName: string
  projectId: number  // Added for fetching coordinate points
  lastDisplayedPageNumber: number
  beaconLabels?: Array<{ parcelId: string; label: string; position: [number, number] }>
  workingDirectory?: string
  onNewParcels?: (parcels: Parcel[]) => Promise<void>
  skipParcelTracking?: boolean // Set to true for Survey Plan export (no parcel tracking needed)
}

export interface ComprehensivePDFResult {
  success: boolean
  filePath?: string
  error?: string
  pdfBlob?: Blob
}

/**
 * Generate Comprehensive_Latest PDF with Calculations Part 1 + Area & Consistency
 * 
 * @param options - Configuration options for PDF generation
 * @returns Result object with success status and file path
 */
export async function generateComprehensiveLatestPDF(
  options: ComprehensivePDFOptions
): Promise<ComprehensivePDFResult> {
  const {
    computedParcels,
    calcPart1Blob,
    projectName,
    projectId,
    lastDisplayedPageNumber,
    beaconLabels = [],
    workingDirectory,
    onNewParcels,
    skipParcelTracking = false
  } = options

  try {
    console.log('[ComprehensivePDF] 📄 Generating Comprehensive_Latest PDF...')
    console.log('[ComprehensivePDF] 📊 Last displayed page number:', lastDisplayedPageNumber)
    console.log('[ComprehensivePDF] 📊 Total parcels:', computedParcels.length)

    if (computedParcels.length === 0) {
      return {
        success: false,
        error: 'No parcels to include in PDF. Please digitize at least one parcel first.'
      }
    }

    // Load coordinate points for spatial matching of beacon names
    console.log('[ComprehensivePDF] 📍 Loading coordinate points for project:', projectId)
    const coordinatePoints = await listCoordinatePoints(projectId)
    console.log(`[ComprehensivePDF] 📍 Loaded ${coordinatePoints.length} coordinate points for beacon name matching`)

    // Use the existing PDF generation composable to create Area & Consistency section
    // and merge it with Calculations Part 1
    const { generateAreaConsistencyPDF } = useAreaConsistencyPDF()

    // Generate merged PDF with continuous page numbering
    const mergedPdfBytes = await generateAreaConsistencyPDF(
      computedParcels,
      projectName,
      calcPart1Blob,
      lastDisplayedPageNumber,
      beaconLabels,
      coordinatePoints  // Pass coordinate points for spatial matching
    )

    if (!mergedPdfBytes) {
      return {
        success: false,
        error: 'PDF generation returned no data'
      }
    }

    console.log('[ComprehensivePDF] ✅ PDF generated successfully')

    // Create blob
    const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' })
    const filename = 'Comprehensive_Latest.pdf'

    // Save to project folder if working directory provided
    if (workingDirectory) {
      console.log('[ComprehensivePDF] 💾 Saving to Calculations folder...')

      const saveResult = await saveDocument({
        workingDirectory,
        documentType: 'calculations-part1',
        fileName: filename,
        pdfBlob: blob,
        // Comprehensive_Latest.pdf is a rolling snapshot — regenerating must
        // replace the previous one rather than 409 on the overwrite gate.
        overwrite: true
      })

      if (saveResult.success) {
        console.log('[ComprehensivePDF] ✅ Saved to:', saveResult.filePath)

        // Mark new parcels as included in PDF (only for Area Computation workflow)
        if (!skipParcelTracking && onNewParcels) {
          await onNewParcels(computedParcels)
        }

        return {
          success: true,
          filePath: saveResult.filePath,
          pdfBlob: blob
        }
      } else {
        console.error('[ComprehensivePDF] ❌ Failed to save PDF:', saveResult.error)
        
        // Return blob for download fallback. saveResult.error is already a
        // complete, actionable message from the backend (e.g. the file is open
        // in another program), so surface it verbatim rather than re-wrapping.
        return {
          success: false,
          error: saveResult.error,
          pdfBlob: blob
        }
      }
    } else {
      // No working directory - return blob for download
      console.log('[ComprehensivePDF] ℹ️ No working directory - returning blob for download')
      
      return {
        success: true,
        pdfBlob: blob
      }
    }
  } catch (error: any) {
    console.error('[ComprehensivePDF] ❌ Error generating comprehensive PDF:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
}

/**
 * Composable export
 */
export function useComprehensivePDF() {
  return {
    generateComprehensiveLatestPDF
  }
}
