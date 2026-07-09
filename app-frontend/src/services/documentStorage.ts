/**
 * Document Storage Service
 * Handles saving generated PDFs to project working directory
 */

import { getProjectDirectoryStructure } from '../utils/project-directory'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3042/api'

export interface SaveDocumentOptions {
  workingDirectory: string
  documentType: 'field-book' | 'calculations-part1' | 'coordinate-list' | 'area-computation' | 'report-on-survey' | 'dsg-certificate'
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
}

/**
 * Save a generated PDF document to the project directory
 */
export async function saveDocument(options: SaveDocumentOptions): Promise<SaveDocumentResult> {
  const { workingDirectory, documentType, fileName, pdfBlob, overwrite } = options

  try {
    // Get the appropriate subfolder based on document type
    const structure = getProjectDirectoryStructure(workingDirectory)
    let targetFolder: string

    switch (documentType) {
      case 'field-book':
        targetFolder = structure.fieldBook
        break
      case 'calculations-part1':
      case 'area-computation':
        targetFolder = structure.calculations
        break
      case 'coordinate-list':
        targetFolder = structure.coordinateList
        break
      case 'report-on-survey':
        targetFolder = structure.reports
        break
      case 'dsg-certificate':
        targetFolder = structure.certificates
        break
      default:
        throw new Error(`Unknown document type: ${documentType}`)
    }

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
      // masked by the generic fallback.
      const body = await response.json().catch(() => ({}))
      throw new Error(body.message || body.error || 'Failed to save document')
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
