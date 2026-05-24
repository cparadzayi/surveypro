import jsPDF from 'jspdf'
import type { ElectronicFieldBook } from '../types/cadastral'
import { bankersRound } from './cadastral-precision'

export interface EnhancedElectronicFieldBook extends ElectronicFieldBook {
  metadata: ElectronicFieldBook['metadata'] & {
    surveyDescription?: string
    surveyDate?: string
    instruments?: string
    address?: string
  }
}

export interface PDFGenerationOptions {
  filename?: string
  pageFormat?: 'a4' | 'letter'
  orientation?: 'portrait' | 'landscape'
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
}

export class FieldBookPDFGenerator {
  private options: Required<PDFGenerationOptions>

  constructor(options: PDFGenerationOptions = {}) {
    this.options = {
      filename: options.filename || 'electronic-fieldbook.pdf',
      pageFormat: options.pageFormat || 'a4',
      orientation: options.orientation || 'portrait',
      marginTop: options.marginTop ?? 20,
      marginBottom: options.marginBottom ?? 20,
      marginLeft: options.marginLeft ?? 15,
      marginRight: options.marginRight ?? 15,
    }
  }

  /**
   * Generate the cover page for the field book PDF
   */
  private async generateCoverPage(
    pdf: jsPDF,
    fieldBook: EnhancedElectronicFieldBook,
    contentWidth: number,
    contentHeight: number
  ): Promise<void> {
    try {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(24)
      const title = 'ELECTRONIC FIELD BOOK'
      const titleWidth = pdf.getTextWidth(title)
      const titleX = (pdf.internal.pageSize.getWidth() - titleWidth) / 2
      pdf.text(title, titleX, 40)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'normal')
      let yPosition = 70

      // Surveyor Info
      if (fieldBook.metadata.surveyorName) {
        pdf.text(`Land Surveyor: ${fieldBook.metadata.surveyorName}`, this.options.marginLeft, yPosition)
        yPosition += 15
      }
      if (fieldBook.metadata.surveyDescription) {
        const maxWidth = pdf.internal.pageSize.getWidth() - (this.options.marginLeft + this.options.marginRight)
        const lines = pdf.splitTextToSize(`Survey Description: ${fieldBook.metadata.surveyDescription}`, maxWidth)
        pdf.text(lines, this.options.marginLeft, yPosition)
        yPosition += (lines.length * 8) + 7
      }
      if (fieldBook.metadata.surveyDate) {
        pdf.text(`Date of Survey: ${fieldBook.metadata.surveyDate}`, this.options.marginLeft, yPosition)
        yPosition += 15
      }
      if (fieldBook.metadata.instruments) {
        const maxWidth = pdf.internal.pageSize.getWidth() - (this.options.marginLeft + this.options.marginRight)
        pdf.text('Instruments:', this.options.marginLeft, yPosition)
        yPosition += 12
        const instrumentLines = fieldBook.metadata.instruments.split('\n')
        instrumentLines.forEach(line => {
          if (line.trim()) {
            const wrappedLines = pdf.splitTextToSize(line.trim(), maxWidth - 20)
            pdf.text(wrappedLines, this.options.marginLeft + 20, yPosition)
            yPosition += (wrappedLines.length * 8) + 3
          }
        })
        yPosition += 10
      }
      if (fieldBook.metadata.address) {
        yPosition += 5
        const addressLines = fieldBook.metadata.address.split('\n')
        pdf.text('Address:', this.options.marginLeft, yPosition)
        yPosition += 12
        addressLines.forEach(line => {
          if (line.trim()) {
            pdf.text(line.trim(), this.options.marginLeft + 20, yPosition)
            yPosition += 10
          }
        })
      }

      // Summary
      yPosition += 20
      pdf.setFontSize(14)
      pdf.text(`Total Points: ${fieldBook.points.length}`, this.options.marginLeft, yPosition)
      yPosition += 10
      pdf.text(`Date Generated: ${new Date(fieldBook.metadata.dateGenerated).toLocaleDateString()}`, this.options.marginLeft, yPosition)
      yPosition += 10
      pdf.text(`Page Count: ${fieldBook.metadata.pageCount}`, this.options.marginLeft, yPosition)

      // Footer
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'italic')
      const footerText = 'SurveyPro - Digital Cadastral Records'
      const footerWidth = pdf.getTextWidth(footerText)
      const footerX = (pdf.internal.pageSize.getWidth() - footerWidth) / 2
      pdf.text(footerText, footerX, pdf.internal.pageSize.getHeight() - 20)
    } catch (error) {
      console.error('Error in generateCoverPage:', error)
      throw error
    }
  }

  /**
   * Generate the data pages for the field book PDF
   */
  private async generateFieldBookPages(
    pdf: jsPDF,
    fieldBook: EnhancedElectronicFieldBook,
    contentWidth: number,
    contentHeight: number
  ): Promise<void> {
    // Diagnostic logging for points array
    console.log('[PDF] fieldBook.points length:', fieldBook.points?.length)
    if (fieldBook.points && fieldBook.points.length > 0) {
      console.log('[PDF] Sample fieldBook.points:', fieldBook.points.slice(0, 3))
      console.log('[PDF] Sample coordinates:', fieldBook.points.slice(0, 3).map(p => p.coordinates))
    } else {
      console.warn('[PDF] No points found in fieldBook.points')
    }

    // Page layout calculations
    const pageHeight = pdf.internal.pageSize.getHeight()
    const headerHeight = 45
    const footerHeight = 25
    const tableHeaderHeight = 20
    const rowHeight = 7
    const availableHeight = pageHeight - this.options.marginTop - this.options.marginBottom - headerHeight - footerHeight - tableHeaderHeight
    const pointsPerPage = 27; // FIXED VALUE - must match all other components
    console.log(`Field Book PDF: Using ${pointsPerPage} points per page (standardized across all components)`)
    const totalPages = Math.ceil(fieldBook.points.length / pointsPerPage)

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      if (pageIndex > 0) pdf.addPage()
      const pageNumber = pageIndex + 1
      const startIndex = pageIndex * pointsPerPage
      const endIndex = Math.min(startIndex + pointsPerPage, fieldBook.points.length)
      const pagePoints = fieldBook.points.slice(startIndex, endIndex)

      // Page header
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(16)
      pdf.text('ELECTRONIC FIELD BOOK', this.options.marginLeft, 25)
      const pageLabel = `E${pageNumber}`
      const pageLabelWidth = pdf.getTextWidth(pageLabel)
      pdf.text(pageLabel, pdf.internal.pageSize.getWidth() - this.options.marginRight - pageLabelWidth, 25)

      // Table header
      let yPosition = 45
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'bold')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const col1 = this.options.marginLeft
      const col2 = col1 + 18
      const col3 = col2 + 28
      const col4 = col3 + 28
      const col5 = col4 + 16
      const col6 = col5 + 22
      pdf.text('Point', col1, yPosition)
      pdf.text('Y', col2, yPosition)
      pdf.text('X', col3, yPosition)
      pdf.text('Status', col4, yPosition)
      pdf.text('Date', col5, yPosition)
      pdf.text('Description', col6, yPosition)
      yPosition += 3
      pdf.line(this.options.marginLeft, yPosition, pageWidth - this.options.marginRight, yPosition)
      yPosition += 10
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      const maxYPosition = pdf.internal.pageSize.getHeight() - 30

      // Table content
      pagePoints.forEach((point: any) => {
        if (yPosition > maxYPosition) return
        pdf.text(point.id, col1, yPosition)
        pdf.text(point.coordinates.y, col2, yPosition)
        pdf.text(point.coordinates.x, col3, yPosition)
        pdf.text(point.status || '', col4, yPosition)
        let surveyDate = ''
        if (point.surveyDate) {
          try {
            const date = new Date(point.surveyDate)
            surveyDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
          } catch {
            surveyDate = ''
          }
        }
        pdf.text(surveyDate, col5, yPosition)
        const description = point.description || '-'
        const remainingWidth = pageWidth - col6 - this.options.marginRight
        if (pdf.getTextWidth(description) > remainingWidth) {
          const maxChars = Math.floor((remainingWidth / pdf.getTextWidth('M')) * 0.85)
          const wrappedDesc = description.substring(0, maxChars - 3) + '...'
          pdf.text(wrappedDesc, col6, yPosition)
        } else {
          pdf.text(description, col6, yPosition)
        }
        yPosition += rowHeight
      })

      // Empty row grid lines
      const currentRowCount = pagePoints.length
      const targetRowCount = Math.min(pointsPerPage, Math.floor((maxYPosition - (yPosition - rowHeight)) / rowHeight))
      if (currentRowCount < targetRowCount) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        pdf.setTextColor(200, 200, 200)
        for (let i = currentRowCount; i < targetRowCount; i++) {
          pdf.setLineWidth(0.1)
          pdf.line(col1, yPosition + 3, pageWidth - this.options.marginRight, yPosition + 3)
          yPosition += rowHeight
        }
        pdf.setTextColor(0, 0, 0)
        pdf.setLineWidth(0.2)
      }

      // Footer
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      const footerY = pdf.internal.pageSize.getHeight() - 15
      const pageFooter = `Page ${pageLabel}`
      const pageFooterWidth = pdf.getTextWidth(pageFooter)
      const pageFooterX = (pdf.internal.pageSize.getWidth() - pageFooterWidth) / 2
      pdf.text(pageFooter, pageFooterX, footerY)
      if (fieldBook.metadata.surveyorName) {
        pdf.text(fieldBook.metadata.surveyorName, this.options.marginLeft, footerY)
      }
      const dateText = new Date().toLocaleDateString()
      const dateWidth = pdf.getTextWidth(dateText)
      pdf.text(dateText, pdf.internal.pageSize.getWidth() - this.options.marginRight - dateWidth, footerY)
      const pageUtilization = Math.round((pagePoints.length / pointsPerPage) * 100)
      console.log(`Page ${pageLabel}: ${pagePoints.length}/${pointsPerPage} points (${pageUtilization}% utilization)`)
    }
  }

  /**
   * Preview PDF (returns blob URL)
   */
  async generatePDFBlob(fieldBook: EnhancedElectronicFieldBook): Promise<string> {
    try {
      const pdf = new jsPDF({
        orientation: this.options.orientation,
        unit: 'mm',
        format: this.options.pageFormat,
      })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const contentWidth = pageWidth - this.options.marginLeft - this.options.marginRight
      const contentHeight = pageHeight - this.options.marginTop - this.options.marginBottom
  await this.generateCoverPage(pdf, fieldBook, contentWidth, contentHeight)
  // Always start data pages on a new page after the cover
  pdf.addPage()
  await this.generateFieldBookPages(pdf, fieldBook, contentWidth, contentHeight)
      const pdfBlob = pdf.output('blob')
      return URL.createObjectURL(pdfBlob)
    } catch (error) {
      console.error('Error generating PDF blob:', error)
      return ''
    }
  }
}