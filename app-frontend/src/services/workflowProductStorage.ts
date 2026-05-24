/**
 * Workflow Product Storage Service
 * 
 * Comprehensive service for auto-saving ALL workflow products to project folder:
 * - Raw CSV data
 * - Field Book PDF
 * - Calculations Part 1 PDF
 * - Coordinate List PDF
 * - Area & Consistency PDF
 * - Merged PDFs
 * - Any re-generated documents
 */

import { saveDocument } from './documentStorage'
import { makeAbsolutePath } from '../utils/project-directory'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3042/api'

export interface WorkflowProduct {
  type: 'csv' | 'pdf' | 'xlsx'
  category: 'field-book' | 'calculations-part1' | 'coordinate-list' | 'area-computation' | 'report-on-survey' | 'dsg-certificate' | 'raw-data' | 'merged' | 'general-plan'
  fileName: string
  data: Blob | string // Blob for PDFs/xlsx, string for CSV
}

export interface SaveProductResult {
  success: boolean
  filePath?: string
  error?: string
}

/**
 * Save a single workflow product to project folder
 */
export async function saveWorkflowProduct(
  workingDirectory: string,
  product: WorkflowProduct
): Promise<SaveProductResult> {
  try {
    console.log(`💾 [Product Storage] Saving ${product.category}: ${product.fileName}`)
    
    if (!workingDirectory) {
      throw new Error('Working directory not set')
    }

    // For CSV files, save to input folder
    if (product.type === 'csv') {
      return await saveCsvFile(workingDirectory, product.fileName, product.data as string)
    }

    // For xlsx files, save to reports folder
    if (product.type === 'xlsx') {
      const structure = (await import('../utils/project-directory')).getProjectDirectoryStructure(workingDirectory)
      const targetFolder = product.category === 'general-plan'
        ? structure.reports
        : structure.calculations
      const filePath = `${targetFolder}/${product.fileName}`
      const formData = new FormData()
      formData.append('file', product.data as Blob, product.fileName)
      formData.append('filePath', filePath)
      const response = await fetch(`${API_BASE}/documents/save`, { method: 'POST', body: formData })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.message || 'Failed to save xlsx file')
      }
      const result = await response.json()
      return { success: true, filePath: result.filePath }
    }

    // For PDF files, use existing document storage service
    if (product.type === 'pdf') {
      // Map category to document type
      let documentType: any = product.category
      
      // Handle special cases
      if (product.category === 'raw-data') {
        documentType = 'field-book' // Save to input folder logic will handle this
      }
      if (product.category === 'merged') {
        documentType = 'area-computation' // Save merged PDFs to complete-reports
      }

      const result = await saveDocument({
        workingDirectory,
        documentType,
        fileName: product.fileName,
        pdfBlob: product.data as Blob
      })

      if (result.success) {
        console.log(`✅ [Product Storage] Saved ${product.category} to: ${result.filePath}`)
      } else {
        console.error(`❌ [Product Storage] Failed to save ${product.category}: ${result.error}`)
      }

      return result
    }

    throw new Error(`Unknown product type: ${product.type}`)
  } catch (error) {
    console.error(`[Product Storage] Error saving ${product.category}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Save CSV file to input folder
 */
async function saveCsvFile(
  workingDirectory: string,
  fileName: string,
  csvContent: string
): Promise<SaveProductResult> {
  try {
    const absolutePath = makeAbsolutePath(workingDirectory)
    const filePath = `${absolutePath}/input/${fileName}`

    // Create a Blob from CSV content
    const blob = new Blob([csvContent], { type: 'text/csv' })

    // Use FormData to send to backend
    const formData = new FormData()
    formData.append('file', blob, fileName)
    formData.append('filePath', filePath)

    const response = await fetch(`${API_BASE}/documents/save`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to save CSV file')
    }

    const result = await response.json()

    return {
      success: true,
      filePath: result.filePath
    }
  } catch (error) {
    console.error('Error saving CSV file:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Save multiple workflow products at once
 */
export async function saveWorkflowProducts(
  workingDirectory: string,
  products: WorkflowProduct[]
): Promise<SaveProductResult[]> {
  console.log(`💾 [Product Storage] Batch saving ${products.length} products...`)
  
  const results: SaveProductResult[] = []
  
  for (const product of products) {
    const result = await saveWorkflowProduct(workingDirectory, product)
    results.push(result)
  }
  
  const successCount = results.filter(r => r.success).length
  console.log(`✅ [Product Storage] Saved ${successCount}/${products.length} products successfully`)
  
  return results
}

/**
 * Save raw CSV data (imported coordinates)
 */
export async function saveRawCSVData(
  workingDirectory: string,
  csvContent: string,
  projectName: string
): Promise<SaveProductResult> {
  const timestamp = new Date().toISOString().split('T')[0]
  const fileName = `${projectName.replace(/[^a-zA-Z0-9-_]/g, '_')}_imported_coordinates_${timestamp}.csv`
  
  return saveWorkflowProduct(workingDirectory, {
    type: 'csv',
    category: 'raw-data',
    fileName,
    data: csvContent
  })
}

/**
 * Convert imported points to CSV format for backup
 */
export function pointsToCSV(points: any[]): string {
  if (points.length === 0) return ''
  
  // CSV Header
  const header = 'Point,Y,X,Status,Calcs Page,Description,Date of survey'
  
  // CSV Rows
  const rows = points.map(point => {
    const y = point.original?.y || point.y || ''
    const x = point.original?.x || point.x || ''
    const status = point.status || ''
    const calcsPage = point.calcsPage || ''
    const description = point.description || ''
    const surveyDate = point.surveyDate 
      ? (point.surveyDate instanceof Date 
          ? point.surveyDate.toISOString().split('T')[0]
          : point.surveyDate)
      : ''
    
    return `${point.id},"${y}","${x}","${status}","${calcsPage}","${description}","${surveyDate}"`
  })
  
  return [header, ...rows].join('\n')
}

/**
 * Auto-save all products for a completed workflow step
 */
export interface AutoSaveOptions {
  workingDirectory: string
  projectName: string
  stepId: string
  products?: {
    rawCSV?: string // CSV content
    fieldBook?: Blob
    calculationsPart1?: Blob
    coordinateList?: Blob
    areaConsistency?: Blob
    mergedPDF?: Blob
    reportOnSurvey?: Blob
    dsgCertificate?: Blob
  }
}

export async function autoSaveStepProducts(options: AutoSaveOptions): Promise<void> {
  const { workingDirectory, projectName, stepId, products } = options
  
  if (!workingDirectory) {
    console.warn('⚠️ [Product Storage] No working directory set. Skipping auto-save.')
    return
  }
  
  console.log(`💾 [Product Storage] Auto-saving products for step: ${stepId}`)
  
  const productsToSave: WorkflowProduct[] = []
  const timestamp = new Date().toISOString().split('T')[0]
  const sanitizedName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_')
  
  // Excel workbook
  if ((products as any)?.workflowExcel) {
    productsToSave.push({
      type: 'xlsx',
      category: 'general-plan',
      fileName: `${sanitizedName}_WorkflowData_${timestamp}.xlsx`,
      data: (products as any).workflowExcel
    })
  }

  // Raw CSV data
  if (products?.rawCSV) {
    productsToSave.push({
      type: 'csv',
      category: 'raw-data',
      fileName: `${sanitizedName}_imported_${timestamp}.csv`,
      data: products.rawCSV
    })
  }
  
  // Field Book PDF
  if (products?.fieldBook) {
    productsToSave.push({
      type: 'pdf',
      category: 'field-book',
      fileName: `${sanitizedName}_FieldBook_${timestamp}.pdf`,
      data: products.fieldBook
    })
  }
  
  // Calculations Part 1 PDF
  if (products?.calculationsPart1) {
    productsToSave.push({
      type: 'pdf',
      category: 'calculations-part1',
      fileName: `${sanitizedName}_CalculationsPart1_${timestamp}.pdf`,
      data: products.calculationsPart1
    })
  }
  
  // Coordinate List PDF
  if (products?.coordinateList) {
    productsToSave.push({
      type: 'pdf',
      category: 'coordinate-list',
      fileName: `${sanitizedName}_CoordinateList_${timestamp}.pdf`,
      data: products.coordinateList
    })
  }
  
  // Area & Consistency PDF
  if (products?.areaConsistency) {
    productsToSave.push({
      type: 'pdf',
      category: 'area-computation',
      fileName: `${sanitizedName}_AreaConsistency_${timestamp}.pdf`,
      data: products.areaConsistency
    })
  }
  
  // Merged PDF (Calculations + Area & Consistency)
  if (products?.mergedPDF) {
    productsToSave.push({
      type: 'pdf',
      category: 'merged',
      fileName: `${sanitizedName}_CompleteReport_${timestamp}.pdf`,
      data: products.mergedPDF
    })
  }
  
  // Report on Survey
  if (products?.reportOnSurvey) {
    productsToSave.push({
      type: 'pdf',
      category: 'report-on-survey',
      fileName: `${sanitizedName}_ReportOnSurvey_${timestamp}.pdf`,
      data: products.reportOnSurvey
    })
  }
  
  // DSG Certificate
  if (products?.dsgCertificate) {
    productsToSave.push({
      type: 'pdf',
      category: 'dsg-certificate',
      fileName: `${sanitizedName}_DSGCertificate_${timestamp}.pdf`,
      data: products.dsgCertificate
    })
  }
  
  // Save all products
  if (productsToSave.length > 0) {
    await saveWorkflowProducts(workingDirectory, productsToSave)
  } else {
    console.log('ℹ️ [Product Storage] No products to save for this step')
  }
}
