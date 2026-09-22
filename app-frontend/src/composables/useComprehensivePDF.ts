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
import { PDFDocument } from 'pdf-lib'
import { generateNarrativeReportOnSurveyPDF } from '@/utils/reportOnSurveyNarrativeGenerator'
import { isReportDataEmpty } from '@/utils/reportDataFromWorkflow'
import type { ReportOnSurveyData } from '@/types/cadastral'
import { buildDispensationCertificateBlob, type DispensationInput } from './useDispensationCertificate'

export interface NarrativeReportOptions {
  surveyorName: string
  licenseNumber: string
  firm: string
  address: string
  surveyDate: string
  surveyOf: string
  district?: string
  assistant?: string
}

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
  /** Narrative Report of Survey, appended at the very end; omit to skip it */
  reportData?: ReportOnSurveyData | null
  narrativeOptions?: NarrativeReportOptions
  /** Dispensation Certificate, appended after the narrative; omit to skip it */
  dispensation?: DispensationInput
}

export interface ComprehensivePDFResult {
  success: boolean
  filePath?: string
  error?: string
  pdfBlob?: Blob
  areasOnlyBlob?: Blob
  /** The narrative section on its own, for the Reports folder copy */
  narrativeBlob?: Blob
  /** The dispensation certificate section on its own */
  dispensationBlob?: Blob
}

/**
 * Append the narrative Report of Survey to the collated body.
 *
 * The narrative is numbered as a continuation after Areas: Areas' own page count
 * is read back from the rendered areas section, so the first narrative page is
 * calculationsEndPage + areasPages + 1. Nothing cross-references the narrative,
 * so this is a pure tail append.
 *
 * Returns the body unchanged (and no narrative blob) when there is no report data.
 */
export async function appendNarrativeReport(
  mergedPdfBytes: Uint8Array,
  areasOnlyBlob: Blob,
  calculationsEndPage: number,
  reportData: ReportOnSurveyData | null | undefined,
  narrativeOptions: NarrativeReportOptions | undefined
): Promise<{ merged: Uint8Array; narrativeBlob?: Blob }> {
  if (!reportData || isReportDataEmpty(reportData) || !narrativeOptions) {
    console.log('[ComprehensivePDF] ℹ️ No report data — skipping narrative Report of Survey')
    return { merged: mergedPdfBytes }
  }

  const areasDoc = await PDFDocument.load(await areasOnlyBlob.arrayBuffer())
  const narrativeStartPage = calculationsEndPage + areasDoc.getPageCount() + 1
  console.log('[ComprehensivePDF] 📝 Appending Report of Survey from page', narrativeStartPage)

  const narrative = await generateNarrativeReportOnSurveyPDF(
    reportData,
    narrativeOptions,
    narrativeStartPage
  )

  const bodyDoc = await PDFDocument.load(mergedPdfBytes)
  const narrativeDoc = await PDFDocument.load(await narrative.pdf.arrayBuffer())
  const copied = await bodyDoc.copyPages(narrativeDoc, narrativeDoc.getPageIndices())
  copied.forEach((page) => bodyDoc.addPage(page))

  return { merged: await bodyDoc.save(), narrativeBlob: narrative.pdf }
}

/**
 * Append the Dispensation Certificate to the collated body.
 *
 * The certificate is a self-contained formal document (own "Page i of N"
 * numbering, SG approval block), so it rides as a pure tail append like the
 * narrative — nothing else in the record cross-references it.
 *
 * Returns the body unchanged (and no blob) when no dispensation inputs are given.
 */
export async function appendDispensationCertificate(
  mergedPdfBytes: Uint8Array,
  dispensation: DispensationInput | undefined
): Promise<{ merged: Uint8Array; dispensationBlob?: Blob }> {
  if (!dispensation) {
    console.log('[ComprehensivePDF] ℹ️ No dispensation data — skipping Dispensation Certificate')
    return { merged: mergedPdfBytes }
  }
  console.log('[ComprehensivePDF] 📑 Appending Dispensation Certificate...')
  const { blob } = await buildDispensationCertificateBlob(dispensation)
  const bodyDoc = await PDFDocument.load(mergedPdfBytes)
  const certDoc = await PDFDocument.load(await blob.arrayBuffer())
  const copied = await bodyDoc.copyPages(certDoc, certDoc.getPageIndices())
  copied.forEach((page) => bodyDoc.addPage(page))
  return { merged: await bodyDoc.save(), dispensationBlob: blob }
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
    skipParcelTracking = false,
    reportData,
    narrativeOptions,
    dispensation
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
    const areaResult = await generateAreaConsistencyPDF(
      computedParcels,
      projectName,
      calcPart1Blob,
      lastDisplayedPageNumber,
      beaconLabels,
      coordinatePoints  // Pass coordinate points for spatial matching
    )

    if (!areaResult) {
      return {
        success: false,
        error: 'PDF generation returned no data'
      }
    }

    const areasOnlyBlob = areaResult.areasOnly

    // Fold the narrative Report of Survey in at the very bottom of the record.
    const withNarrative = await appendNarrativeReport(
      areaResult.merged,
      areasOnlyBlob,
      lastDisplayedPageNumber,
      reportData,
      narrativeOptions
    )
    const mergedPdfBytes = withNarrative.merged
    const narrativeBlob = withNarrative.narrativeBlob

    // Fold the Dispensation Certificate in at the very bottom of the record.
    const withDispensation = await appendDispensationCertificate(withNarrative.merged, dispensation)
    const finalMergedBytes = withDispensation.merged
    const dispensationBlob = withDispensation.dispensationBlob

    console.log('[ComprehensivePDF] ✅ PDF generated successfully')

    // Create blob
    const blob = new Blob([finalMergedBytes as any], { type: 'application/pdf' })
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
          pdfBlob: blob,
          areasOnlyBlob,
          narrativeBlob,
          dispensationBlob
        }
      } else {
        console.error('[ComprehensivePDF] ❌ Failed to save PDF:', saveResult.error)
        
        // Return blob for download fallback. saveResult.error is already a
        // complete, actionable message from the backend (e.g. the file is open
        // in another program), so surface it verbatim rather than re-wrapping.
        return {
          success: false,
          error: saveResult.error,
          pdfBlob: blob,
          narrativeBlob,
          dispensationBlob
        }
      }
    } else {
      // No working directory - return blob for download
      console.log('[ComprehensivePDF] ℹ️ No working directory - returning blob for download')
      
      return {
        success: true,
        pdfBlob: blob,
        areasOnlyBlob,
        narrativeBlob,
        dispensationBlob
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
