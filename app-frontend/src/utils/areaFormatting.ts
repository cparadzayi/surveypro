/**
 * Area Formatting Utilities
 * Implements banker's rounding for cadastral area calculations
 * 
 * Standards:
 * - Areas < 10,000 m²: Display in m² with 0 decimal places (banker's rounding)
 * - Areas ≥ 10,000 m²: Display in hectares with 4 decimal places (banker's rounding)
 */

/**
 * Banker's Rounding (Round Half to Even)
 * 
 * When a number is exactly halfway between two values, round to the nearest even number.
 * This eliminates bias in rounding and is the IEEE 754 standard.
 * 
 * Examples:
 * - 2.5 → 2 (rounds to even)
 * - 3.5 → 4 (rounds to even)
 * - 2.51 → 3 (not exactly halfway, rounds up)
 * - 2.49 → 2 (not exactly halfway, rounds down)
 * 
 * @param value - The number to round
 * @param decimals - Number of decimal places
 * @returns Rounded number
 */
export function bankersRound(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals)
  const shifted = value * multiplier
  const floor = Math.floor(shifted)
  const fraction = shifted - floor
  
  // If exactly 0.5, round to nearest even
  if (Math.abs(fraction - 0.5) < Number.EPSILON) {
    return (floor % 2 === 0 ? floor : floor + 1) / multiplier
  }
  
  // Otherwise, use standard rounding
  return Math.round(shifted) / multiplier
}

/**
 * Format area according to cadastral standards
 * 
 * @param areaM2 - Area in square meters
 * @param options - Formatting options
 * @returns Formatted area string with unit
 */
export function formatArea(
  areaM2: number,
  options: {
    includeUnit?: boolean
    forceUnit?: 'm²' | 'ha'
  } = {}
): string {
  const { includeUnit = true, forceUnit } = options
  
  if (!areaM2 || isNaN(areaM2)) return includeUnit ? '0 m²' : '0'
  
  const absArea = Math.abs(areaM2)
  
  // Determine unit based on threshold or forced unit
  const useHectares = forceUnit === 'ha' || (forceUnit !== 'm²' && absArea >= 10000)
  
  if (useHectares) {
    // Convert to hectares and apply banker's rounding to 4 decimal places
    const areaHa = absArea / 10000
    const rounded = bankersRound(areaHa, 4)
    return includeUnit ? `${rounded.toFixed(4)} ha` : rounded.toFixed(4)
  } else {
    // Apply banker's rounding to nearest square meter (0 decimal places)
    const rounded = bankersRound(absArea, 0)
    return includeUnit ? `${rounded.toFixed(0)} m²` : rounded.toFixed(0)
  }
}

/**
 * Format area for display in square meters only
 * Used in schedules and tables where unit is in column header
 * 
 * @param areaM2 - Area in square meters
 * @returns Formatted area value without unit
 */
export function formatAreaM2(areaM2: number): string {
  if (!areaM2 || isNaN(areaM2)) return '0'
  
  const absArea = Math.abs(areaM2)
  
  if (absArea >= 10000) {
    // For large areas, show with 2 decimal places
    const rounded = bankersRound(absArea, 2)
    return rounded.toFixed(2)
  } else {
    // For small areas, show as whole number
    const rounded = bankersRound(absArea, 0)
    return rounded.toFixed(0)
  }
}

/**
 * Format area for display in hectares only
 * Used when unit is specified elsewhere
 * 
 * @param areaM2 - Area in square meters
 * @returns Formatted area in hectares with 4 decimal places
 */
export function formatAreaHa(areaM2: number): string {
  if (!areaM2 || isNaN(areaM2)) return '0.0000'
  
  const areaHa = Math.abs(areaM2) / 10000
  const rounded = bankersRound(areaHa, 4)
  return rounded.toFixed(4)
}

/**
 * Format area with automatic unit selection and threshold logic
 * This is the primary function to use for area display
 * 
 * @param areaM2 - Area in square meters
 * @returns Formatted area string with appropriate unit
 */
export function formatAreaWithThreshold(areaM2: number): string {
  return formatArea(areaM2, { includeUnit: true })
}

/**
 * Parse area string back to square meters
 * Handles both "1234 m²" and "1.2345 ha" formats
 * 
 * @param areaString - Formatted area string
 * @returns Area in square meters
 */
export function parseArea(areaString: string): number {
  if (!areaString) return 0
  
  const cleaned = areaString.trim().toLowerCase()
  
  if (cleaned.includes('ha')) {
    const value = parseFloat(cleaned.replace(/[^0-9.-]/g, ''))
    return value * 10000
  } else {
    return parseFloat(cleaned.replace(/[^0-9.-]/g, ''))
  }
}

/**
 * Format area for compact display (e.g., in labels)
 * Uses shorter format: "1.8973Ha" or "439"
 * 
 * @param areaM2 - Area in square meters
 * @returns Compact formatted area string
 */
export function formatAreaCompact(areaM2: number): string {
  if (!areaM2 || isNaN(areaM2)) return '0'
  
  const absArea = Math.abs(areaM2)
  const areaHa = absArea / 10000
  
  if (areaHa >= 1) {
    const rounded = bankersRound(areaHa, 4)
    return `${rounded.toFixed(4)}Ha`
  } else {
    const rounded = bankersRound(absArea, 0)
    return `${rounded.toFixed(0)}`
  }
}
