import { saveDocument, type SaveDocumentOptions } from '@/services/documentStorage'

export interface SurveyRecordSections {
  fieldBook: Blob
  coordinateList: Blob
  calculations: Blob
  areas: Blob
}

export interface SaveSurveyRecordOptions {
  workingDirectory: string
  sections: SurveyRecordSections
}

export interface SaveSurveyRecordResult {
  saved: string[]
  failed: { label: string; error: string }[]
}

/**
 * Save each section of the comprehensive record as its own file in its output
 * subfolder, alongside the collated Comprehensive_Latest.pdf. Best-effort per file:
 * a failed write is recorded and never aborts the others.
 */
export async function saveSurveyRecordSections(
  opts: SaveSurveyRecordOptions
): Promise<SaveSurveyRecordResult> {
  const { workingDirectory, sections } = opts

  const jobs: Array<{ label: string; documentType: SaveDocumentOptions['documentType']; fileName: string; pdfBlob: Blob }> = [
    { label: 'Field book', documentType: 'field-book', fileName: 'FieldBook.pdf', pdfBlob: sections.fieldBook },
    { label: 'Coordinate List', documentType: 'coordinate-list', fileName: 'CoordinateList.pdf', pdfBlob: sections.coordinateList },
    { label: 'Calculations', documentType: 'calculations-part1', fileName: 'Calculations.pdf', pdfBlob: sections.calculations },
    { label: 'Areas & Consistency', documentType: 'areas-consistency', fileName: 'AreasAndConsistency.pdf', pdfBlob: sections.areas },
  ]

  const saved: string[] = []
  const failed: { label: string; error: string }[] = []

  for (const job of jobs) {
    try {
      const result = await saveDocument({
        workingDirectory,
        documentType: job.documentType,
        fileName: job.fileName,
        pdfBlob: job.pdfBlob,
        overwrite: true,
      })
      if (result.success) saved.push(result.filePath || job.fileName)
      else failed.push({ label: job.label, error: result.error || 'Unknown error' })
    } catch (error: any) {
      failed.push({ label: job.label, error: error?.message || 'Unknown error' })
    }
  }

  return { saved, failed }
}
