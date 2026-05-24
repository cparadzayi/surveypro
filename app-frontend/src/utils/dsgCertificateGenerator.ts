/**
 * DSG Certificate PDF Generator
 * 
 * Generates professional DSG Certificates in PDF format
 * Based on Zimbabwe cadastral standards and SI 727 requirements
 */

import jsPDF from 'jspdf'

export interface DSGCertificateData {
  surveyOf: string
  surveyorName: string
  licenseNumber?: string
  statement1: string
  statement2: string
  statement3: string
  statement4: string
  surveyorTitle: string
  additionalNotes?: string
  date: string
  firm?: string
  address?: string
}

export interface DSGCertificateOptions {
  pageSize?: 'a4' | 'letter'
  orientation?: 'portrait' | 'landscape'
  margins?: {
    top: number
    right: number
    bottom: number
    left: number
  }
}

/**
 * Generate DSG Certificate PDF
 */
export async function generateDSGCertificatePDF(
  data: DSGCertificateData,
  options: DSGCertificateOptions = {}
): Promise<{ blob: Blob; pageCount: number }> {
  const {
    pageSize = 'a4',
    orientation = 'portrait',
    margins = { top: 25, right: 25, bottom: 25, left: 25 }
  } = options

  // Create PDF document
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: pageSize
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - margins.left - margins.right

  let currentY = margins.top

  // Helper function to add text with word wrap
  const addText = (
    text: string,
    x: number,
    y: number,
    options: {
      fontSize?: number
      fontStyle?: 'normal' | 'bold' | 'italic'
      align?: 'left' | 'center' | 'right'
      maxWidth?: number
      lineHeight?: number
    } = {}
  ): number => {
    const {
      fontSize = 11,
      fontStyle = 'normal',
      align = 'left',
      maxWidth = contentWidth,
      lineHeight = 7
    } = options

    doc.setFontSize(fontSize)
    doc.setFont('helvetica', fontStyle)

    const lines = doc.splitTextToSize(text, maxWidth)
    
    lines.forEach((line: string, index: number) => {
      const lineY = y + (index * lineHeight)
      
      if (align === 'center') {
        doc.text(line, pageWidth / 2, lineY, { align: 'center' })
      } else if (align === 'right') {
        doc.text(line, x + maxWidth, lineY, { align: 'right' })
      } else {
        doc.text(line, x, lineY)
      }
    })

    return y + (lines.length * lineHeight)
  }

  // Add horizontal line
  const addLine = (y: number, width?: number) => {
    doc.setLineWidth(0.5)
    doc.line(margins.left, y, margins.left + (width || contentWidth), y)
  }

  // ===== TITLE =====
  currentY = addText(
    'CERTIFICATE',
    margins.left,
    currentY,
    { fontSize: 16, fontStyle: 'bold', align: 'center' }
  )
  currentY += 10

  // ===== SURVEY OF =====
  currentY = addText(
    'SURVEY OF   :',
    margins.left,
    currentY,
    { fontSize: 11, fontStyle: 'bold' }
  )
  
  currentY = addText(
    data.surveyOf,
    margins.left + 35,
    currentY - 7,
    { fontSize: 11, fontStyle: 'bold', maxWidth: contentWidth - 35 }
  )
  currentY += 10

  // ===== INTRODUCTION =====
  const introduction = `I, ${data.surveyorName.toUpperCase()}, Land Surveyor, do hereby certify that:-`
  currentY = addText(
    introduction,
    margins.left,
    currentY,
    { fontSize: 11 }
  )
  currentY += 8

  // ===== CERTIFICATION STATEMENTS =====
  // Statement 1
  currentY = addText(
    '1.',
    margins.left,
    currentY,
    { fontSize: 11 }
  )
  currentY = addText(
    data.statement1,
    margins.left + 8,
    currentY - 7,
    { fontSize: 11, maxWidth: contentWidth - 8 }
  )
  currentY += 5

  // Statement 2
  currentY = addText(
    '2.',
    margins.left,
    currentY,
    { fontSize: 11 }
  )
  currentY = addText(
    data.statement2,
    margins.left + 8,
    currentY - 7,
    { fontSize: 11, maxWidth: contentWidth - 8 }
  )
  currentY += 5

  // Statement 3
  currentY = addText(
    '3.',
    margins.left,
    currentY,
    { fontSize: 11 }
  )
  currentY = addText(
    data.statement3,
    margins.left + 8,
    currentY - 7,
    { fontSize: 11, maxWidth: contentWidth - 8 }
  )
  currentY += 5

  // Statement 4
  currentY = addText(
    '4.',
    margins.left,
    currentY,
    { fontSize: 11 }
  )
  currentY = addText(
    data.statement4,
    margins.left + 8,
    currentY - 7,
    { fontSize: 11, maxWidth: contentWidth - 8 }
  )
  currentY += 15

  // ===== ADDITIONAL NOTES (if provided) =====
  if (data.additionalNotes && data.additionalNotes.trim()) {
    currentY = addText(
      'ADDITIONAL NOTES:',
      margins.left,
      currentY,
      { fontSize: 10, fontStyle: 'bold' }
    )
    currentY += 2
    
    currentY = addText(
      data.additionalNotes,
      margins.left,
      currentY,
      { fontSize: 10, maxWidth: contentWidth }
    )
    currentY += 10
  }

  // ===== SIGNATURE SECTION =====
  currentY += 10

  // Signature line
  const signatureLineY = currentY
  const signatureLineWidth = 80
  addLine(signatureLineY, signatureLineWidth)
  
  // Date line
  const dateLineX = margins.left + signatureLineWidth + 10
  const dateLineWidth = 30
  doc.line(dateLineX, signatureLineY, dateLineX + dateLineWidth, signatureLineY)

  currentY += 5

  // Surveyor name and title
  currentY = addText(
    data.surveyorName.toUpperCase(),
    margins.left,
    currentY,
    { fontSize: 10, fontStyle: 'bold' }
  )
  
  currentY = addText(
    data.surveyorTitle,
    margins.left,
    currentY,
    { fontSize: 10, fontStyle: 'bold' }
  )

  // License number (if provided)
  if (data.licenseNumber) {
    currentY = addText(
      `License No. ${data.licenseNumber}`,
      margins.left,
      currentY,
      { fontSize: 9 }
    )
  }

  // Date label
  addText(
    'DATE',
    dateLineX,
    signatureLineY + 5,
    { fontSize: 9, align: 'center', maxWidth: dateLineWidth }
  )

  // Actual date
  if (data.date) {
    const dateParts = data.date.split('-')
    const formattedDate = dateParts.length === 3 
      ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
      : data.date
    
    addText(
      formattedDate,
      dateLineX,
      signatureLineY + 12,
      { fontSize: 9, align: 'center', maxWidth: dateLineWidth }
    )
  }

  // ===== FIRM AND ADDRESS (if provided) =====
  if (data.firm || data.address) {
    currentY = pageHeight - margins.bottom - 20
    
    if (data.firm) {
      currentY = addText(
        data.firm,
        margins.left,
        currentY,
        { fontSize: 9, fontStyle: 'italic' }
      )
    }
    
    if (data.address) {
      currentY = addText(
        data.address,
        margins.left,
        currentY,
        { fontSize: 9, fontStyle: 'italic' }
      )
    }
  }

  // ===== FOOTER =====
  const footerY = pageHeight - margins.bottom + 5
  addText(
    'Generated by SurveyPro - Professional Cadastral Survey Software',
    margins.left,
    footerY,
    { fontSize: 8, align: 'center', maxWidth: contentWidth }
  )

  // Convert to Blob
  const pdfBlob = doc.output('blob')
  const pageCount = doc.getNumberOfPages()

  return {
    blob: pdfBlob,
    pageCount
  }
}

/**
 * Preview DSG Certificate in new window
 */
export async function previewDSGCertificate(
  data: DSGCertificateData,
  options?: DSGCertificateOptions
): Promise<void> {
  const { blob } = await generateDSGCertificatePDF(data, options)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}

/**
 * Download DSG Certificate PDF
 */
export async function downloadDSGCertificate(
  data: DSGCertificateData,
  filename: string = 'DSG_Certificate.pdf',
  options?: DSGCertificateOptions
): Promise<void> {
  const { blob } = await generateDSGCertificatePDF(data, options)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
