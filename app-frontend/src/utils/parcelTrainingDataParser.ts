/**
 * Parcel Training Data Parser
 * 
 * Parses cadastral training data in the format:
 * STAND 1439
 * Name    Y         X         DIST    DIRN
 * 1439A   97384.41  2247857.59  ...
 * AREA    319       Sq. M
 */

export interface ParsedParcel {
  designation: string  // e.g., "STAND 1439", "LOT 5", "FARM 123"
  designationType: 'STAND' | 'LOT' | 'PLOT' | 'FARM'
  designationNumber: string
  boundaryPoints: ParcelPoint[]
  area: number  // Square meters
  perimeter: number  // Calculated from distances
  bearings: number[]  // Decimal degrees
  distances: number[]  // Meters
}

export interface ParcelPoint {
  name: string
  y: number  // Westing
  x: number  // Southing
  distance?: number  // To next point
  bearing?: number  // To next point (decimal degrees)
}

export class ParcelTrainingDataParser {
  /**
   * Parse raw training data text into structured parcels
   */
  parse(rawData: string): ParsedParcel[] {
    const parcels: ParsedParcel[] = []
    
    // Split by designation keywords
    const blocks = this.splitIntoBlocks(rawData)
    
    for (const block of blocks) {
      try {
        const parcel = this.parseBlock(block)
        if (parcel) {
          parcels.push(parcel)
        }
      } catch (error) {
        console.warn('[ParcelParser] Failed to parse block:', error)
      }
    }
    
    console.log(`[ParcelParser] ✅ Parsed ${parcels.length} parcels from training data`)
    return parcels
  }
  
  /**
   * Split raw data into individual parcel blocks
   */
  private splitIntoBlocks(rawData: string): string[] {
    // Match STAND, LOT, PLOT, or FARM followed by number
    const regex = /(STAND|LOT|PLOT|FARM)\s+\d+/g
    const matches = [...rawData.matchAll(regex)]
    
    if (matches.length === 0) return []
    
    const blocks: string[] = []
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index!
      const end = i < matches.length - 1 ? matches[i + 1].index! : rawData.length
      blocks.push(rawData.substring(start, end))
    }
    
    return blocks
  }
  
  /**
   * Parse a single parcel block
   */
  private parseBlock(block: string): ParsedParcel | null {
    // Extract designation
    const designationMatch = block.match(/(STAND|LOT|PLOT|FARM)\s+(\d+)/)
    if (!designationMatch) return null
    
    const designationType = designationMatch[1] as 'STAND' | 'LOT' | 'PLOT' | 'FARM'
    const designationNumber = designationMatch[2]
    const designation = `${designationType} ${designationNumber}`
    
    // Extract points
    const points = this.extractPoints(block)
    if (points.length < 3) {
      console.warn(`[ParcelParser] Skipping ${designation}: insufficient points (${points.length})`)
      return null
    }
    
    // Extract area
    const areaMatch = block.match(/AREA\s+(\d+)\s+Sq\.\s*M/i)
    const area = areaMatch ? parseInt(areaMatch[1]) : 0
    
    // Calculate perimeter
    const perimeter = points.reduce((sum, pt) => sum + (pt.distance || 0), 0)
    
    // Extract bearings and distances
    const bearings = points.map(pt => pt.bearing || 0).filter(b => b > 0)
    const distances = points.map(pt => pt.distance || 0).filter(d => d > 0)
    
    return {
      designation,
      designationType,
      designationNumber,
      boundaryPoints: points,
      area,
      perimeter,
      bearings,
      distances
    }
  }
  
  /**
   * Extract points from a parcel block
   */
  private extractPoints(block: string): ParcelPoint[] {
    const points: ParcelPoint[] = []
    
    // Match lines with point data: Name Y X [DIST] [DIRN]
    // Example: 1439A   97384.41  2247857.59  13.02  301: 20: 40
    const pointRegex = /^([A-Z0-9]+)\s+([\d.]+)\s+([\d.]+)(?:\s+([\d.]+))?\s+(?:(\d+):\s*(\d+):\s*(\d+))?/gm
    
    let match
    while ((match = pointRegex.exec(block)) !== null) {
      const [, name, yStr, xStr, distStr, degStr, minStr, secStr] = match
      
      // Parse coordinates
      const y = parseFloat(yStr)
      const x = parseFloat(xStr)
      
      // Parse distance (optional)
      const distance = distStr ? parseFloat(distStr) : undefined
      
      // Parse bearing (optional) - convert DMS to decimal degrees
      let bearing: number | undefined
      if (degStr && minStr && secStr) {
        const deg = parseInt(degStr)
        const min = parseInt(minStr)
        const sec = parseInt(secStr)
        bearing = deg + min / 60 + sec / 3600
      }
      
      points.push({ name, y, x, distance, bearing })
    }
    
    return points
  }
  
  /**
   * Validate parsed parcels against known areas
   */
  validateParcels(parcels: ParsedParcel[]): void {
    console.log('\n[ParcelParser] 📊 Validation Report:')
    console.log('=' .repeat(60))
    
    let totalError = 0
    let maxError = 0
    let maxErrorParcel = ''
    
    for (const parcel of parcels) {
      const computed = this.computeArea(parcel.boundaryPoints)
      const known = parcel.area
      const error = Math.abs(computed - known)
      const errorPercent = (error / known) * 100
      
      totalError += errorPercent
      if (errorPercent > maxError) {
        maxError = errorPercent
        maxErrorParcel = parcel.designation
      }
      
      const status = errorPercent < 1 ? '✅' : errorPercent < 5 ? '⚠️' : '❌'
      console.log(`${status} ${parcel.designation.padEnd(15)} Known: ${known.toString().padStart(4)}m² | Computed: ${computed.toFixed(0).padStart(4)}m² | Error: ${errorPercent.toFixed(2)}%`)
    }
    
    const avgError = totalError / parcels.length
    console.log('=' .repeat(60))
    console.log(`📈 Average Error: ${avgError.toFixed(2)}%`)
    console.log(`📈 Max Error: ${maxError.toFixed(2)}% (${maxErrorParcel})`)
    console.log(`📈 Total Parcels: ${parcels.length}`)
  }
  
  /**
   * Compute area using Shoelace formula (Gauss area formula)
   */
  private computeArea(points: ParcelPoint[]): number {
    if (points.length < 3) return 0
    
    let area = 0
    const n = points.length
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      area += points[i].y * points[j].x
      area -= points[j].y * points[i].x
    }
    
    return Math.abs(area) / 2
  }
}

/**
 * Utility function to format area according to cadastral standards
 * - < 10,000 m²: Display in m² (nearest 1 m² using banker's rounding)
 * - ≥ 10,000 m²: Display in ha (4 decimal places using banker's rounding)
 */
export function formatCadastralArea(areaM2: number): string {
  if (areaM2 < 10000) {
    // Banker's rounding to nearest square meter
    const rounded = Math.round(areaM2)
    return `${rounded} m²`
  } else {
    // Convert to hectares and apply banker's rounding to 4 decimal places
    const areaHa = areaM2 / 10000
    const rounded = Math.round(areaHa * 10000) / 10000
    return `${rounded.toFixed(4)} ha`
  }
}
