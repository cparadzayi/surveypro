/**
 * VirtualPDFMeasurer - Lightweight PDF measurement without rendering
 * 
 * This class simulates the jsPDF API to measure document structure
 * without actually creating a PDF. It tracks page counts, positions,
 * and point locations for accurate cross-referencing.
 * 
 * Used in Pass 1 of two-pass PDF generation.
 */

export interface PointLocation {
  pointId: string
  pageNumber: number
  yPosition: number
}

export interface PageInfo {
  pageNumber: number
  contentHeight: number
  pointsOnPage: string[]
}

export class VirtualPDFMeasurer {
  private currentPage: number = 1
  private yPosition: number = 0
  private pageHeight: number = 297 // A4 height in mm
  private pageWidth: number = 210 // A4 width in mm
  private marginTop: number = 20
  private marginBottom: number = 20
  private marginLeft: number = 15
  private marginRight: number = 15
  
  // Track point locations
  private pointLocations: Map<string, PointLocation> = new Map()
  
  // Track page information
  private pages: Map<number, PageInfo> = new Map()
  
  // Current font settings (for text width calculations)
  private currentFont: string = 'helvetica'
  private currentFontSize: number = 12
  private currentFontStyle: string = 'normal'
  
  constructor() {
    // Initialize first page
    this.pages.set(1, {
      pageNumber: 1,
      contentHeight: 0,
      pointsOnPage: []
    })
    this.yPosition = this.marginTop
  }
  
  /**
   * Simulate jsPDF.addPage()
   */
  addPage(): void {
    this.currentPage++
    this.yPosition = this.marginTop
    
    // Initialize new page
    this.pages.set(this.currentPage, {
      pageNumber: this.currentPage,
      contentHeight: 0,
      pointsOnPage: []
    })
    
    console.log(`[VirtualPDF] 📄 Added page ${this.currentPage}`)
  }
  
  /**
   * Simulate jsPDF.text()
   */
  text(text: string | string[], x: number, y: number): void {
    this.yPosition = y
    
    // Update page content height
    const page = this.pages.get(this.currentPage)
    if (page) {
      page.contentHeight = Math.max(page.contentHeight, y)
    }
    
    // Check if we're near page bottom (would trigger new page in real PDF)
    if (y > this.pageHeight - this.marginBottom) {
      console.log(`[VirtualPDF] ⚠️ Content near page bottom at y=${y}mm`)
    }
  }
  
  /**
   * Simulate jsPDF.setFont()
   */
  setFont(font: string, style?: string): void {
    this.currentFont = font
    if (style) {
      this.currentFontStyle = style
    }
  }
  
  /**
   * Simulate jsPDF.setFontSize()
   */
  setFontSize(size: number): void {
    this.currentFontSize = size
  }
  
  /**
   * Simulate jsPDF.line()
   */
  line(x1: number, y1: number, x2: number, y2: number): void {
    // Update y position to the lower of the two points
    this.yPosition = Math.max(y1, y2)
  }
  
  /**
   * Simulate jsPDF.setDrawColor()
   */
  setDrawColor(r: number, g?: number, b?: number): void {
    // No-op for measurement
  }
  
  /**
   * Simulate jsPDF.getTextWidth()
   * Approximate calculation based on font size
   */
  getTextWidth(text: string): number {
    // Approximate: 1 character ≈ 0.6 * font size in mm
    const charWidth = this.currentFontSize * 0.6
    return text.length * charWidth
  }
  
  /**
   * Get internal page size
   */
  get internal() {
    return {
      pageSize: {
        getWidth: () => this.pageWidth,
        getHeight: () => this.pageHeight
      }
    }
  }
  
  /**
   * Record a point's location on the current page
   */
  recordPointLocation(pointId: string): void {
    const location: PointLocation = {
      pointId,
      pageNumber: this.currentPage,
      yPosition: this.yPosition
    }
    
    this.pointLocations.set(pointId, location)
    
    // Add to page's point list
    const page = this.pages.get(this.currentPage)
    if (page) {
      page.pointsOnPage.push(pointId)
    }
    
    console.log(`[VirtualPDF] 📍 Recorded point ${pointId} at page ${this.currentPage}, y=${this.yPosition.toFixed(1)}mm`)
  }
  
  /**
   * Get current page number
   */
  getCurrentPage(): number {
    return this.currentPage
  }
  
  /**
   * Get total page count
   */
  getPageCount(): number {
    return this.currentPage
  }
  
  /**
   * Get current Y position
   */
  getCurrentY(): number {
    return this.yPosition
  }
  
  /**
   * Get all point locations
   */
  getPointLocations(): Map<string, PointLocation> {
    return this.pointLocations
  }
  
  /**
   * Get point page map (Point ID → Page Number)
   */
  getPointPageMap(): Record<string, number> {
    const map: Record<string, number> = {}
    this.pointLocations.forEach((location, pointId) => {
      map[pointId] = location.pageNumber
    })
    return map
  }
  
  /**
   * Get page information
   */
  getPageInfo(pageNumber: number): PageInfo | undefined {
    return this.pages.get(pageNumber)
  }
  
  /**
   * Get all pages information
   */
  getAllPages(): PageInfo[] {
    return Array.from(this.pages.values())
  }
  
  /**
   * Get measurement summary
   */
  getSummary() {
    return {
      totalPages: this.currentPage,
      totalPoints: this.pointLocations.size,
      pointsPerPage: Array.from(this.pages.values()).map(p => ({
        page: p.pageNumber,
        points: p.pointsOnPage.length,
        height: p.contentHeight
      })),
      pointPageMap: this.getPointPageMap()
    }
  }
  
  /**
   * Log measurement summary to console
   */
  logSummary(): void {
    const summary = this.getSummary()
    console.log('\n[VirtualPDF] 📊 Measurement Summary:')
    console.log(`  Total Pages: ${summary.totalPages}`)
    console.log(`  Total Points: ${summary.totalPoints}`)
    console.log('  Points per Page:')
    summary.pointsPerPage.forEach(p => {
      console.log(`    Page ${p.page}: ${p.points} points, height: ${p.height.toFixed(1)}mm`)
    })
    console.log('  Sample Point Locations:')
    const samplePoints = Object.entries(summary.pointPageMap).slice(0, 5)
    samplePoints.forEach(([pointId, page]) => {
      console.log(`    ${pointId} → Page ${page}`)
    })
  }
}
