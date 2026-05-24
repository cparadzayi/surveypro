import api from './api'

export interface GeoPDFRequest {
  mapImage: string // base64 encoded PNG
  extent: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  projection: string // e.g., "EPSG:22291"
  metadata?: {
    title?: string
    surveyor?: string
    date?: string
    designation?: string
    district?: string
    township?: string
  }
}

export interface VectorGeoPDFRequest {
  parcels: GeoJSON.FeatureCollection
  beacons: GeoJSON.FeatureCollection
  annotations?: GeoJSON.FeatureCollection
  projection: string // e.g., "EPSG:22291"
  projectId?: number // Backend will query Outside Figure from database
  renderEngine?: 'gdal' | 'pdfkit'
  extent?: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  metadata?: {
    title?: string
    surveyor?: string
    date?: string
    designation?: string
    surveyOf?: string
    district?: string
    township?: string
    wholePortion?: string
    parentProperty?: string
  }
  // Scale and sheet size (from intelligentPreview recommendation)
  scale?: string        // e.g. '1:2000'
  sheetSize?: string    // e.g. 'ISO_A2'
  /**
   * SI 727 plan type. 'general-developed' enforces the 1:500 maximum scale
   * denominator per Reg 32(3). When multi-sheet tiling is required the backend
   * returns X-Tile-Grid in the response headers.
   */
  planType?: 'general-developed' | 'general-undeveloped' | 'diagram' | 'working-plan' | null
  // Legacy fields (still accepted for backward compatibility)
  outsideFigure?: GeoJSON.FeatureCollection
  outsideFigureData?: any
  beaconLabels?: any[]
}

export interface GeoPDFInfo {
  gdal: {
    version: string
    installed: boolean
  }
  formats: {
    pdf: boolean
    geoPdf: boolean
  }
  projections: {
    supported: string[]
    default: string
  }
  features: {
    coordinateDisplay: boolean
    measurementTools: boolean
    layerControl: boolean
    attributeTables: boolean
  }
}

/**
 * Check if GDAL is available on the server
 */
export async function checkGeoPDFAvailability(): Promise<{ available: boolean; version: string | null; message: string }> {
  const response = await api.get('/geopdf/check')
  return response.data
}

/**
 * Get GeoPDF capabilities and system info
 */
export async function getGeoPDFInfo(): Promise<GeoPDFInfo> {
  const response = await api.get('/geopdf/info')
  return response.data
}

/**
 * Generate GeoPDF from map image (DEPRECATED - use generateVectorGeoPDF)
 * Returns PDF blob that can be downloaded
 */
export async function generateGeoPDF(request: GeoPDFRequest): Promise<Blob> {
  const response = await api.post('/geopdf/generate', request, {
    responseType: 'blob'
  })
  return response.data
}

export interface TileGridSummary {
  totalSheets: number
  cols: number
  rows: number
  scaleDenominator: number
  scaleLabel: string
  sheetSize: string
}

export interface VectorGeoPDFResult {
  blob: Blob
  suggestedScale: string | null  // e.g. '1:2500' — set when block placement needed a higher scale
  usedScale: string | null        // actual scale used for this render
  usedSheetSize: string | null    // actual sheet size after any A2→A1→A0 escalation
  /** Non-null when SI 727 Reg 32(3) requires multi-sheet tiling */
  tileGrid: TileGridSummary | null
}

/**
 * Generate TRUE Vector GeoPDF from GeoJSON
 * Creates a vector PDF with selectable features and embedded coordinates
 * Returns { blob, suggestedScale, usedScale } — suggestedScale is non-null when
 * the backend recommends retrying at a higher scale for better block placement.
 */
export async function generateVectorGeoPDF(request: VectorGeoPDFRequest): Promise<VectorGeoPDFResult> {
  console.log('[VectorGeoPDF] 📤 Sending request:', {
    parcelCount: request.parcels.features.length,
    beaconCount: request.beacons.features.length,
    projection: request.projection,
    renderEngine: request.renderEngine,
    scale: request.scale,
  })
  
  const response = await api.post('/geopdf/vector', request, {
    responseType: 'blob',
    timeout: 600000 // 10 minute timeout — large projects (500+ beacons) take 3-5 min on A0
  })
  
  const suggestedScale  = response.headers['x-suggested-scale']  ?? null
  const usedScale       = response.headers['x-used-scale']       ?? null
  const usedSheetSize   = response.headers['x-used-sheet-size']  ?? null
  const tileGridRaw     = response.headers['x-tile-grid']        ?? null
  const tileGrid: TileGridSummary | null = tileGridRaw ? JSON.parse(tileGridRaw) : null

  if (tileGrid) {
    console.warn(
      `[VectorGeoPDF] 🗺️ SI 727 Reg 32(3): multi-sheet plan — ` +
      `${tileGrid.totalSheets} sheets (${tileGrid.cols}×${tileGrid.rows}) at ${tileGrid.scaleLabel}`
    )
  }

  console.log('[VectorGeoPDF] ✅ Received PDF blob:', {
    size: `${(response.data.size / 1024).toFixed(2)} KB`,
    type: response.data.type,
    usedScale,
    suggestedScale,
    tileGrid,
  })

  // Validate response is actually a PDF (avoid downloading JSON/HTML error as .pdf)
  try {
    const headerText = await response.data.slice(0, 8).text()
    if (!headerText.startsWith('%PDF-')) {
      const errorText = await response.data.text()
      throw new Error(`Vector GeoPDF endpoint did not return a PDF. First bytes: ${JSON.stringify(headerText)}. Body: ${errorText.substring(0, 500)}`)
    }
  } catch (e: any) {
    throw new Error(e?.message || 'Failed to validate GeoPDF response')
  }
  
  return { blob: response.data, suggestedScale, usedScale, usedSheetSize, tileGrid }
}

/**
 * Generate DXF (AutoCAD) file from the same GeoJSON data used for GeoPDF.
 * Returns a Blob containing the DXF file content.
 */
export async function generateDXF(request: VectorGeoPDFRequest): Promise<Blob> {
  console.log('[DXF] Sending DXF generation request:', {
    parcelCount: request.parcels.features.length,
    beaconCount: request.beacons.features.length,
    projection: request.projection,
    scale: request.scale,
  })

  const response = await api.post('/geopdf/dxf', {
    parcels: request.parcels,
    beacons: request.beacons,
    projection: request.projection,
    metadata: request.metadata,
    outsideFigureData: request.outsideFigureData,
    scale: request.scale,
    sheetSize: request.sheetSize,
  }, {
    responseType: 'blob',
    timeout: 30000
  })

  console.log('[DXF] Received DXF blob:', {
    size: `${(response.data.size / 1024).toFixed(2)} KB`,
    type: response.data.type,
  })

  return response.data
}

/**
 * Capture MapLibre canvas as high-resolution PNG
 * Enhanced version with WebGL pixel reading for raster tiles
 */
export function captureMapCanvas(map: any, options: { dpi?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const dpi = options.dpi || 300
      
      // Wait for map to finish rendering all tiles
      const captureWhenReady = () => {
        try {
          const canvas = map.getCanvas()
          
          console.log('[captureMapCanvas] 📊 Canvas state:', {
            width: canvas.width,
            height: canvas.height,
            style: canvas.style.width + ' × ' + canvas.style.height
          })
          
          // CRITICAL FIX: Read pixels directly from WebGL context via MapLibre's painter
          // preserveDrawingBuffer doesn't work reliably with raster tiles
          let gl = null
          
          // Try to access MapLibre's internal WebGL context
          if (map.painter && map.painter.context && map.painter.context.gl) {
            gl = map.painter.context.gl
            console.log('[captureMapCanvas] ✅ Using MapLibre painter WebGL context')
          } else {
            console.warn('[captureMapCanvas] ⚠️ Could not access painter context, trying canvas context')
            // Fallback: This won't work if canvas already has a context, but try anyway
            gl = canvas.getContext('webgl', { preserveDrawingBuffer: true }) || 
                 canvas.getContext('webgl2', { preserveDrawingBuffer: true }) || 
                 canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true })
          }
          
          if (!gl) {
            console.error('[captureMapCanvas] ❌ Could not get WebGL context')
            reject(new Error('Failed to get WebGL context. Map may not be using WebGL.'))
            return
          }
          
          console.log('[captureMapCanvas] 🎨 Reading pixels directly from WebGL framebuffer...')
          
          // Read pixels from WebGL framebuffer
          const pixels = new Uint8Array(canvas.width * canvas.height * 4)
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          
          // Check if pixels are actually populated
          let nonZeroPixels = 0
          let nonTransparentPixels = 0
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] !== 0 || pixels[i+1] !== 0 || pixels[i+2] !== 0) {
              nonZeroPixels++
            }
            if (pixels[i+3] > 0) {
              nonTransparentPixels++
            }
          }
          
          console.log('[captureMapCanvas] 📊 Read', pixels.length, 'bytes from WebGL')
          console.log('[captureMapCanvas] 📊 Pixel analysis:', {
            totalPixels: canvas.width * canvas.height,
            nonZeroPixels,
            nonTransparentPixels,
            percentageNonZero: ((nonZeroPixels / (canvas.width * canvas.height)) * 100).toFixed(2) + '%',
            percentageOpaque: ((nonTransparentPixels / (canvas.width * canvas.height)) * 100).toFixed(2) + '%'
          })
          
          if (nonTransparentPixels === 0) {
            console.error('[captureMapCanvas] ❌ WebGL framebuffer is completely transparent!')
            console.error('[captureMapCanvas] This indicates the framebuffer was cleared or never rendered.')
            console.error('[captureMapCanvas] Possible causes:')
            console.error('[captureMapCanvas]   1. Map rendered to screen but framebuffer was cleared')
            console.error('[captureMapCanvas]   2. preserveDrawingBuffer not working with raster tiles')
            console.error('[captureMapCanvas]   3. Timing issue - reading before render completes')
          }
          
          // Calculate scale factor for high-res export
          const scaleFactor = dpi / 96 // 96 is default screen DPI
          
          // Create high-res canvas
          const highResCanvas = document.createElement('canvas')
          highResCanvas.width = canvas.width * scaleFactor
          highResCanvas.height = canvas.height * scaleFactor
          
          const ctx = highResCanvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }
          
          // Create temporary canvas with WebGL pixels
          const tempCanvas = document.createElement('canvas')
          tempCanvas.width = canvas.width
          tempCanvas.height = canvas.height
          const tempCtx = tempCanvas.getContext('2d')
          if (!tempCtx) {
            reject(new Error('Failed to get temp canvas context'))
            return
          }
          
          // Put WebGL pixels into temp canvas
          const imageData = tempCtx.createImageData(canvas.width, canvas.height)
          
          // Flip Y-axis (WebGL coordinates are bottom-up, canvas is top-down)
          for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
              const srcIdx = ((canvas.height - y - 1) * canvas.width + x) * 4
              const dstIdx = (y * canvas.width + x) * 4
              imageData.data[dstIdx] = pixels[srcIdx]
              imageData.data[dstIdx + 1] = pixels[srcIdx + 1]
              imageData.data[dstIdx + 2] = pixels[srcIdx + 2]
              imageData.data[dstIdx + 3] = pixels[srcIdx + 3]
            }
          }
          
          tempCtx.putImageData(imageData, 0, 0)
          
          // Scale and draw to high-res canvas
          ctx.scale(scaleFactor, scaleFactor)
          ctx.drawImage(tempCanvas, 0, 0)
          
          // Convert to base64 PNG
          const base64Image = highResCanvas.toDataURL('image/png')
          
          // Validate that image has actual pixel data (not blank)
          // Sample multiple regions of the canvas for better detection
          const sampleSize = 50
          const regions = [
            { x: 0, y: 0 }, // Top-left
            { x: Math.floor(highResCanvas.width / 2) - sampleSize / 2, y: Math.floor(highResCanvas.height / 2) - sampleSize / 2 }, // Center
            { x: Math.max(0, highResCanvas.width - sampleSize), y: Math.max(0, highResCanvas.height - sampleSize) } // Bottom-right
          ]
          
          let hasNonTransparentPixels = false
          let coloredPixelCount = 0
          
          for (const region of regions) {
            const x = Math.max(0, Math.min(region.x, highResCanvas.width - sampleSize))
            const y = Math.max(0, Math.min(region.y, highResCanvas.height - sampleSize))
            const imageData = ctx.getImageData(x, y, sampleSize, sampleSize)
            const pixels = imageData.data
            
            // Check for non-transparent pixels
            for (let i = 0; i < pixels.length; i += 4) {
              const alpha = pixels[i + 3]
              if (alpha > 0) {
                hasNonTransparentPixels = true
                // Check if it's not just white/gray (actual map content)
                const r = pixels[i]
                const g = pixels[i + 1]
                const b = pixels[i + 2]
                if (!(r > 240 && g > 240 && b > 240)) {
                  coloredPixelCount++
                }
              }
            }
          }
          
          console.log('[captureMapCanvas] 📸 Canvas captured:', {
            originalSize: `${canvas.width}×${canvas.height}`,
            scaledSize: `${highResCanvas.width}×${highResCanvas.height}`,
            dpi,
            imageSize: `${(base64Image.length / 1024).toFixed(2)} KB`,
            hasContent: hasNonTransparentPixels,
            coloredPixels: coloredPixelCount,
            sampledRegions: regions.length
          })
          
          if (!hasNonTransparentPixels) {
            console.error('[captureMapCanvas] ❌ ERROR: Canvas is completely blank/transparent!')
            console.error('[captureMapCanvas] This will result in a blank PDF.')
            reject(new Error('Canvas capture failed: Canvas is blank. Ensure map tiles are loaded and visible.'))
            return
          }
          
          if (coloredPixelCount < 10) {
            console.warn('[captureMapCanvas] ⚠️ WARNING: Canvas has very little colored content!')
            console.warn('[captureMapCanvas] The PDF may appear mostly blank. Check if satellite/map tiles are visible.')
          }
          
          resolve(base64Image)
        } catch (error) {
          reject(error)
        }
      }
      
      // Force map to render one more frame, then wait a bit for tiles to paint
      console.log('[captureMapCanvas] ⏳ Waiting for map tiles to render...')
      console.log('[captureMapCanvas] 🗺️ Map loaded:', map.loaded())
      console.log('[captureMapCanvas] 🎨 Map style loaded:', map.isStyleLoaded())
      
      // Check if tiles are actually loading
      const checkTileStatus = () => {
        const sources = map.getStyle().sources
        console.log('[captureMapCanvas] 📡 Active sources:', Object.keys(sources))
        
        // Log visible layers
        const layers = map.getStyle().layers
        const visibleLayers = layers.filter((l: any) => {
          const visibility = map.getLayoutProperty(l.id, 'visibility')
          return visibility !== 'none'
        })
        console.log('[captureMapCanvas] 👁️ Visible layers:', visibleLayers.map((l: any) => l.id))
      }
      
      checkTileStatus()
      
      // Trigger a render
      map.triggerRepaint()
      
      // Wait for idle event (all tiles loaded)
      map.once('idle', () => {
        console.log('[captureMapCanvas] ✅ Map idle event fired')
        checkTileStatus()
        
        // Increased delay to ensure WebGL has painted to canvas
        // WebGL rendering can be asynchronous, so we need more time
        setTimeout(() => {
          console.log('[captureMapCanvas] ✅ Capturing after extended render delay')
          captureWhenReady()
        }, 1500) // Increased to 1500ms for better reliability
      })
      
      // Fallback timeout in case idle never fires
      setTimeout(() => {
        console.warn('[captureMapCanvas] ⏰ Timeout reached, forcing capture')
        captureWhenReady()
      }, 5000) // 5 second absolute timeout
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Do not revoke immediately; some browsers will truncate/corrupt the download.
  setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 2000)
}
