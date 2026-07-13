/**
 * Document Storage Service
 * Handles saving generated PDFs to project working directory
 */

import { getProjectDirectoryStructure, type ProjectDirectoryStructure } from '../utils/project-directory'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3042/api'

export interface SaveDocumentOptions {
  workingDirectory: string
  documentType: 'field-book' | 'calculations-part1' | 'coordinate-list' | 'area-computation' | 'areas-consistency' | 'report-on-survey' | 'dsg-certificate'
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
      return structure.certificates
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

    const response = await fetch(`${API_BASE}/documents/save`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      // The backend uses `message` for classified write errors (e.g. locked file)
      // and `error` for the 409 EXISTS gate — read both so the real reason isn't
      // masked, and surface `code` so callers can prompt-and-retry with overwrite.
      const body = await response.json().catch(() => ({} as Record<string, unknown>))
      return {
        success: false,
        error: (body.message as string) || (body.error as string) || 'Failed to save document',
        code: body.code as string | undefined,
      }
    }

    const result = await response.json()

    return {
      success: true,
      filePath: result.filePath
    }
  } catch (error) {
    console.error('Error saving document:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Get list of saved documents for a project
 */
export async function getProjectDocuments(workingDirectory: string) {
  try {
    const response = await fetch(`${API_BASE}/documents/list?workingDirectory=${encodeURIComponent(workingDirectory)}`)
    
    if (!response.ok) {
      throw new Error('Failed to fetch documents')
    }

    return await response.json()
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
): Promise<{ files: { name: string; relDir: string }[] }> {
  try {
    const response = await fetch(
      `${API_BASE}/documents/output-manifest?workingDirectory=${encodeURIComponent(workingDirectory)}`
    )
    if (!response.ok) throw new Error('Failed to fetch output manifest')
    const body = await response.json()
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
    const response = await fetch(`${API_BASE}/documents/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    })

    if (!response.ok) {
      throw new Error('Failed to open document')
    }

    return { success: true }
  } catch (error) {
    console.error('Error opening document:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}
