/**
 * Document Storage Service
 * Handles saving generated PDFs to project working directory
 */

import { getProjectDirectoryStructure, type ProjectDirectoryStructure } from '../utils/project-directory'
import api from './api'

export interface SaveDocumentOptions {
  workingDirectory: string
  documentType: 'field-book' | 'calculations-part1' | 'coordinate-list' | 'area-computation' | 'areas-consistency' | 'report-on-survey' | 'dsg-certificate' | 'dispensation-certificate' | 'site-calibration'
  fileName: string
  pdfBlob: Blob
  /**
   * Opt in to replacing an existing file. The backend refuses to clobber an
   * existing product with 409 EXISTS unless this is true. Use for rolling
   * "…_Latest" snapshots that are meant to be regenerated.
   */
  overwrite?: boolean
}

export interface SaveDocumentResult {
  success: boolean
  filePath?: string
  error?: string
  /** Backend failure code, e.g. 'EXISTS' (overwrite gate) — lets callers prompt. */
  code?: string
}

/** Map a document type to its target output subfolder. */
export function resolveTargetFolder(
  documentType: SaveDocumentOptions['documentType'],
  structure: ProjectDirectoryStructure
): string {
  switch (documentType) {
    case 'field-book':
      return structure.fieldBook
    case 'calculations-part1':
    case 'area-computation':
      return structure.calculations
    case 'areas-consistency':
      return structure.surveyRecord
    case 'coordinate-list':
      return structure.coordinateList
    case 'report-on-survey':
      return structure.reports
    case 'dsg-certificate':
    case 'dispensation-certificate':
      return structure.certificates
    case 'site-calibration':
      return structure.calibration
    default:
      throw new Error(`Unknown document type: ${documentType}`)
  }
}

/**
 * Save a generated PDF document to the project directory
 */
export async function saveDocument(options: SaveDocumentOptions): Promise<SaveDocumentResult> {
  const { workingDirectory, documentType, fileName, pdfBlob, overwrite } = options

  try {
    // Get the appropriate subfolder based on document type
    const structure = getProjectDirectoryStructure(workingDirectory)
    const targetFolder = resolveTargetFolder(documentType, structure)

    // Construct full file path
    const filePath = `${targetFolder}/${fileName}`

    // Send to backend to save the file
    const formData = new FormData()
    formData.append('file', pdfBlob, fileName)
    formData.append('filePath', filePath)
    if (overwrite) formData.append('overwrite', 'true')

    // Shared client so the bearer token is attached; raw fetch() sent no
    // Authorization header and only worked while /documents/* was open.
    // Axios sets the multipart boundary itself — do not set Content-Type here.
    const response = await api.post('/documents/save', formData)

    return {
      success: true,
      filePath: response.data.filePath
    }
  } catch (error: any) {
    console.error('Error saving document:', error)
    // The backend uses `message` for classified write errors (e.g. locked file)
    // and `error` for the 409 EXISTS gate — read both so the real reason isn't
    // masked, and surface `code` so callers can prompt-and-retry with overwrite.
    const body = error?.response?.data ?? {}
    return {
      success: false,
      error:
        body.message ||
        body.error ||
        error?.message ||
        'Failed to save document',
      code: body.code,
    }
  }
}

/**
 * Get list of saved documents for a project
 */
export async function getProjectDocuments(workingDirectory: string) {
  try {
    const response = await api.get('/documents/list', {
      params: { workingDirectory }
    })

    return response.data
  } catch (error) {
    console.error('Error fetching project documents:', error)
    return { documents: [] }
  }
}

/**
 * Recursive manifest of every file under the project's output/ and input/ folders.
 * Never throws — returns an empty list on any error.
 */
export async function getOutputManifest(
  workingDirectory: string
): Promise<{ files: { name: string; relDir: string; mtimeMs?: number; pageCount?: number }[] }> {
  try {
    const response = await api.get('/documents/output-manifest', {
      params: { workingDirectory }
    })
    const body = response.data
    return { files: Array.isArray(body.files) ? body.files : [] }
  } catch (error) {
    console.error('Error fetching output manifest:', error)
    return { files: [] }
  }
}

/**
 * Open a saved document in the system's default PDF viewer
 */
export async function openDocument(filePath: string) {
  try {
    const response = await api.post('/documents/open', { filePath })

    return { success: true, ...(response.data ?? {}) }
  } catch (error) {
    console.error('Error opening document:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
