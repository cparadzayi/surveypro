// True Vector GeoPDF Service
// Frontend service for enhanced interactive GeoPDF generation
import api from './api'

// Type for standard PDF options (excluding enhanced features)
type StandardGeoPDFOptions = Omit<TrueGeoPDFOptions, 'trueGeoPDF' | 'interactive' | 'enableLayers' | 'enableMeasurements' | 'adaptiveRendering'>

export interface TrueGeoPDFOptions {
  parcels: any
  beacons: any
  annotations?: any
  projection: string
  extent: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  metadata: {
    title?: string
    surveyor?: string
    date?: string
    designation?: string
    district?: string
    township?: string
  }
  outsideFigure?: any
  outsideFigureData?: any
  beaconLabels?: any
  
  // Enhanced capabilities
  trueGeoPDF?: boolean
  interactive?: boolean
  enableLayers?: boolean
  enableMeasurements?: boolean
  adaptiveRendering?: boolean
  showGrid?: boolean
  enableSearch?: boolean
}

export interface TrueGeoPDFCapabilities {
  title: string
  version: string
  features: {
    trueGeoreferencing: {
      description: string
      supported: boolean
      standards: string[]
    }
    interactiveFeatures: {
      description: string
      supported: boolean
      capabilities: string[]
    }
    layerManagement: {
      description: string
      supported: boolean
      layers: string[]
    }
    measurementTools: {
      description: string
      supported: boolean
      tools: string[]
    }
    adaptiveRendering: {
      description: string
      supported: boolean
      features: string[]
    }
    searchFunctionality: {
      description: string
      supported: boolean
      searchFields: string[]
    }
    professionalCartography: {
      description: string
      supported: boolean
      standards: string[]
    }
  }
  supportedProjections: Record<string, string>
  outputFormats: {
    pdf: string
    metadata: string
  }
}

export interface TrueGeoPDFValidationResult {
  valid: boolean
  warnings: string[]
  errors: string[]
}

export interface TrueGeoPDFFileInfo {
  success: boolean
  filename: string
  outputPath: string
  size: number
  capabilities: {
    trueGeoPDF: boolean
    interactive: boolean
    layers: boolean
    measurements: boolean
    adaptiveRendering: boolean
    search: boolean
  }
  projection: string
  features: {
    parcels: number
    beacons: number
    annotations: number
  }
  extent: any
  metadata: any
}

/**
 * True Vector GeoPDF Service
 * Provides enhanced PDF generation with interactive capabilities
 */
export class TrueGeoPDFService {
  private static instance: TrueGeoPDFService

  /**
   * Get singleton instance
   */
  static getInstance(): TrueGeoPDFService {
    if (!TrueGeoPDFService.instance) {
      TrueGeoPDFService.instance = new TrueGeoPDFService()
    }
    return TrueGeoPDFService.instance
  }

  /**
   * Generate Enhanced True Vector GeoPDF
   */
  async generateEnhancedPDF(options: TrueGeoPDFOptions): Promise<ArrayBuffer> {
    try {
      console.log('[TrueGeoPDFService] 🚀 Generating enhanced True Vector GeoPDF')
      
      const response = await api.post('/geopdf/vector', {
        ...options,
        // Enable all enhanced capabilities by default
        trueGeoPDF: options.trueGeoPDF !== false,
        interactive: options.interactive !== false,
        enableLayers: options.enableLayers !== false,
        enableMeasurements: options.enableMeasurements !== false,
        adaptiveRendering: options.adaptiveRendering !== false,
        showGrid: options.showGrid || false,
        enableSearch: options.enableSearch !== false
      })

      console.log('[TrueGeoPDFService] ✅ Enhanced PDF generated successfully')
      console.log('[TrueGeoPDFService] 📊 File info:', {
        filename: response.data.filename,
        size: response.data.size,
        capabilities: response.data.capabilities
      })

      return response.data

    } catch (error: any) {
      console.error('[TrueGeoPDFService] ❌ Error generating enhanced PDF:', error)
      throw new Error(`Failed to generate enhanced PDF: ${error.message}`)
    }
  }

  /**
   * Generate Standard PDF (backward compatibility)
   */
  async generateStandardPDF(options: StandardGeoPDFOptions): Promise<ArrayBuffer> {
    try {
      console.log('[TrueGeoPDFService] 📄 Generating standard PDF (legacy mode)')
      
      const response = await api.post('/geopdf/vector', {
        ...options,
        // Disable enhanced capabilities for standard mode
        trueGeoPDF: false,
        interactive: false,
        enableLayers: false,
        enableMeasurements: false,
        adaptiveRendering: false
      })

      console.log('[TrueGeoPDFService] ✅ Standard PDF generated successfully')
      return response.data

    } catch (error: unknown) {
      console.error('[TrueGeoPDFService] ❌ Error generating standard PDF:', error)
      throw new Error(`Failed to generate standard PDF: ${(error as Error).message}`)
    }
  }

  /**
   * Get True GeoPDF Capabilities
   */
  async getCapabilities(): Promise<TrueGeoPDFCapabilities> {
    try {
      console.log('[TrueGeoPDFService] 📋 Fetching True GeoPDF capabilities')
      
      const response = await api.get('/geopdf/capabilities')
      return response.data

    } catch (error: unknown) {
      console.error('[TrueGeoPDFService] ❌ Error fetching capabilities:', error)
      throw new Error(`Failed to fetch capabilities: ${(error as Error).message}`)
    }
  }

  /**
   * Validate True GeoPDF Options
   */
  async validateOptions(options: Partial<TrueGeoPDFOptions>): Promise<TrueGeoPDFValidationResult> {
    try {
      console.log('[TrueGeoPDFService] ✅ Validating True GeoPDF options')
      
      const response = await api.post('/geopdf/validate', options)
      return response.data

    } catch (error: unknown) {
      console.error('[TrueGeoPDFService] ❌ Error validating options:', error)
      throw new Error(`Failed to validate options: ${(error as Error).message}`)
    }
  }

  /**
   * Preview Enhanced PDF in browser
   */
  async previewEnhancedPDF(options: TrueGeoPDFOptions): Promise<void> {
    try {
      console.log('[TrueGeoPDFService] 👁 Previewing enhanced PDF')
      
      const pdfBuffer = await this.generateEnhancedPDF(options)
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      
      // Open in new window with full PDF viewer
      const windowRef = window.open(url, '_blank')
      
      if (windowRef) {
        windowRef.focus()
        console.log('[TrueGeoPDFService] ✅ PDF preview opened in new window')
      } else {
        console.warn('[TrueGeoPDFService] ⚠️ Popup blocked - downloading file instead')
        this.downloadPDF(pdfBuffer, options.metadata?.title || 'survey-plan')
      }

      // Clean up object URL after delay
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)

    } catch (error: unknown) {
      console.error('[TrueGeoPDFService] ❌ Error previewing PDF:', error)
      throw new Error(`Failed to preview PDF: ${(error as Error).message}`)
    }
  }

  /**
   * Download PDF file
   */
  async downloadPDF(pdfBuffer: ArrayBuffer, filename?: string): Promise<void> {
    try {
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = filename || 'survey-plan.pdf'
      link.style.display = 'none'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(url)
      
      console.log('[TrueGeoPDFService] ✅ PDF downloaded successfully')

    } catch (error: unknown) {
      console.error('[TrueGeoPDFService] ❌ Error downloading PDF:', error)
      throw new Error(`Failed to download PDF: ${(error as Error).message}`)
    }
  }

  /**
   * Get recommended settings based on data characteristics
   */
  getRecommendedSettings(parcels: any[], beacons: any[]): Partial<TrueGeoPDFOptions> {
    const parcelCount = parcels?.length || 0
    const beaconCount = beacons?.length || 0
    
    // Base recommendations
    const settings: Partial<TrueGeoPDFOptions> = {
      trueGeoPDF: true,
      interactive: parcelCount > 0,
      enableLayers: parcelCount > 10,
      enableMeasurements: beaconCount > 0,
      adaptiveRendering: parcelCount > 5,
      showGrid: parcelCount > 20,
      enableSearch: parcelCount > 10
    }

    console.log('[TrueGeoPDFService] 💡 Recommended settings:', {
      parcelCount,
      beaconCount,
      settings
    })

    return settings
  }

  /**
   * Check browser compatibility for enhanced features
   */
  checkBrowserCompatibility(): { compatible: boolean; issues: string[] } {
    const issues: string[] = []
    
    // Check for required APIs
    if (!window.Blob) {
      issues.push('Blob API not supported')
    }
    
    if (!window.URL || !window.URL.createObjectURL) {
      issues.push('URL API not supported')
    }
    
    if (!document.createElement) {
      issues.push('DOM manipulation not supported')
    }

    // Check for PDF viewer support
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    
    if (isMobile) {
      issues.push('Mobile browsers may have limited PDF viewer support')
    }

    const compatible = issues.length === 0
    
    console.log('[TrueGeoPDFService] 🔍 Browser compatibility check:', {
      compatible,
      issues,
      isMobile
    })

    return { compatible, issues }
  }

  /**
   * Generate PDF with fallback options
   */
  async generatePDFFallback(options: TrueGeoPDFOptions): Promise<ArrayBuffer> {
    try {
      // Try enhanced first
      if (options.trueGeoPDF) {
        return await this.generateEnhancedPDF(options)
      }
      
      // Fallback to standard
      return await this.generateStandardPDF(options)
      
    } catch (error) {
      console.error('[TrueGeoPDFService] ❌ All PDF generation methods failed:', error)
      throw error
    }
  }

  /**
   * Get file size estimate
   */
  estimateFileSize(options: TrueGeoPDFOptions): string {
    const parcelCount = options.parcels?.features?.length || 0
    const beaconCount = options.beacons?.features?.length || 0
    
    // Rough estimation based on feature count and capabilities
    let baseSize = 500 * 1024 // 500KB base
    
    if (options.trueGeoPDF) baseSize *= 2
    if (options.interactive) baseSize *= 1.5
    if (options.adaptiveRendering) baseSize *= 1.2
    if (options.enableLayers) baseSize *= 1.1
    
    baseSize += (parcelCount * 1024) + (beaconCount * 512)
    
    const sizeInKB = Math.round(baseSize / 1024)
    const sizeInMB = (sizeInKB / 1024).toFixed(1)
    
    return sizeInKB > 1024 ? `${sizeInMB} MB` : `${sizeInKB} KB`
  }
}

// Export singleton instance
export default TrueGeoPDFService.getInstance()
