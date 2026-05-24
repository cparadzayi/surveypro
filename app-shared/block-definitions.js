/**
 * Shared Block Definitions for Survey Plan
 * Single source of truth for block formatting across UI and PDF
 * 
 * Usage:
 * - Frontend: Import and use for rendering HTML/Canvas
 * - Backend: Import and use for rendering PDF
 */

// SI 727 Schedule of Areas - Full 6-column format
export const SCHEDULE_OF_AREAS = {
  title: 'SCHEDULE OF AREAS',
  titleFont: { family: 'Helvetica-Bold', size: 10 },
  
  // Single column format (≤50 stands)
  singleColumn: {
    columns: [
      { key: 'stand', label: 'STAND\nNo.', width: 45, align: 'center' },
      { key: 'area', label: 'AREAS\nSQUARE\nMETRES', width: 60, align: 'center' },
      { key: 'diagram', label: 'DIAGRAM\nNUMBER', width: 50, align: 'center' },
      { key: 'deedNumber', label: 'NUMBER', width: 50, align: 'center', parentHeader: 'DEED' },
      { key: 'deedDate', label: 'DATE', width: 45, align: 'center', parentHeader: 'DEED' },
      { key: 'surveyor', label: 'SURVEYOR-\nGENERAL', width: 60, align: 'center' }
    ],
    rowHeight: 14,
    headerHeight: 25,
    fontSize: 9,
    headerFontSize: 9
  },
  
  // Multi-column format (>50 stands)
  multiColumn: {
    columns: [
      { key: 'stand', label: 'STAND\nNo.', width: 35, align: 'center' },
      { key: 'area', label: 'AREAS\nSQUARE\nMETRES', width: 42, align: 'center' },
      { key: 'diagram', label: 'DIAGRAM\nNUMBER', width: 38, align: 'center' },
      { key: 'deedNumber', label: 'NUMBER', width: 38, align: 'center', parentHeader: 'DEED' },
      { key: 'deedDate', label: 'DATE', width: 32, align: 'center', parentHeader: 'DEED' },
      { key: 'surveyor', label: 'SURVEYOR-\nGENERAL', width: 45, align: 'center' }
    ],
    rowHeight: 12,
    headerHeight: 22,
    fontSize: 8,
    headerFontSize: 8,
    columnSpacing: 8
  },
  
  threshold: 50 // Switch to multi-column if stands > threshold
}

// Outside Figure Data
export const OUTSIDE_FIGURE_DATA = {
  title: 'OUTSIDE FIGURE DATA',
  titleFont: { family: 'Helvetica-Bold', size: 9 },
  
  columns: [
    { key: 'sides', label: 'SIDES', width: 50, align: 'center' },
    { key: 'metres', label: 'Metres', width: 50, align: 'right' },
    { key: 'direction', label: 'DIRECTION\n° \' "', width: 70, align: 'center' },
    { key: 'constants', label: 'Constants', width: 50, align: 'center' },
    { key: 'y', label: 'Y', width: 55, align: 'right' },
    { key: 'x', label: 'X', width: 55, align: 'right' }
  ],
  
  coordinateHeader: {
    text: 'CO-ORDINATES',
    subtext: 'System : Lo {meridian}°\nY    Metres    X',
    colspan: 3 // Spans Y, X columns
  },
  
  rowHeight: 12,
  headerHeight: 15,
  fontSize: 9,
  headerFontSize: 9
}

// Beacon Description
export const BEACON_DESCRIPTION = {
  title: 'BEACON DESCRIPTION',
  titleFont: { family: 'Helvetica-Bold', size: 9 },
  
  // Use grouped text format (SI 727 compliant)
  format: 'grouped-text',
  
  groupFormat: {
    separator: ':',
    beaconNamesFont: { family: 'Helvetica', size: 9 },
    descriptionFont: { family: 'Helvetica', size: 9 },
    lineHeight: 13,
    indent: 0,
    nameDescriptionSpacing: 20,
    colonDescriptionSpacing: 5
  },
  
  // Format: "M5, M6, M7, M8, M9      : Not beaconed"
  // Beacon names left-aligned, description after colon
  groupingRules: {
    groupBy: 'description', // Group beacons with same description
    sortBy: 'name' // Sort beacon names within group
  }
}

// Survey Statement
export const SURVEY_STATEMENT = {
  template: 'I certify that this plan correctly represents the survey carried out by me.',
  
  format: {
    statementFont: { family: 'Helvetica', size: 9 },
    surveyorNameFont: { family: 'Helvetica-Bold', size: 10 },
    surveyorTitleFont: { family: 'Helvetica', size: 9 },
    licenseFont: { family: 'Helvetica', size: 9 },
    lineHeight: 13,
    spacing: 5
  },
  
  layout: {
    alignment: 'center',
    width: 200,
    position: 'bottom-center'
  }
}

// Title Block
export const TITLE_BLOCK = {
  mainTitle: {
    text: 'GENERAL PLAN',
    font: { family: 'Helvetica-Bold', size: 16 },
    alignment: 'center'
  },
  
  ofText: {
    text: 'of',
    font: { family: 'Helvetica-Oblique', size: 10 },
    alignment: 'center'
  },

  // SI 727 Seventh Schedule (b): "SHEET N" line rendered below "of" on multi-sheet plans
  sheetLabel: {
    // Rendered as e.g. "SHEET 1" when sheetNumber is provided
    font: { family: 'Helvetica-Bold', size: 13 },
    alignment: 'center'
  },
  
  designation: {
    // Headline line: just the stands + immediate township name, no district
    // e.g. "Stands 16 - 18 Maglas Township"
    template: '{designation}',
    font: { family: 'Helvetica-Bold', size: 10 },
    alignment: 'center'
  },
  
  figureDescription: {
    // Single-sheet: beacon sequence + stand count + whole/remainder/portion
    template: 'The figure {beaconSequence} represents {township} comprising {standCount} stands numbered {standRange} and public places being {wholePortion} of {ofTarget}, situate in the district of {district}.',
    // Multi-sheet: SI 727 Seventh Schedule (b) inter-sheet description
    multiSheetTemplate: 'The figure {figureLabel} which, together with the figures on {otherSheets}, represents {township} comprising {totalStandCount} stands numbered {standRange} and public places being {wholePortion} of {ofTarget}, situate in the district of {district}.',
    font: { family: 'Helvetica', size: 9 },
    alignment: 'left',
    lineGap: 2
  },

  vide: {
    // SI 727 Seventh Schedule (b): "Vide diagram S.G. No. .... annexed to .... No. ...."
    template: 'Vide diagram S.G. No. ........................ annexed to ........................ No. ........................',
    font: { family: 'Helvetica-Oblique', size: 8 },
    alignment: 'left',
    lineGap: 2
  },
  
  spacing: {
    afterMainTitle: 18,
    afterOf: 12,
    afterSheet: 10,   // spacing after "SHEET N" line (multi-sheet only)
    afterDesignation: 22
  }
}

// Endorsement Block (PDF only)
export const ENDORSEMENT_BLOCK = {
  title: 'ENDORSEMENTS',
  titleFont: { family: 'Helvetica-Bold', size: 10 },
  
  columns: [
    { key: 'no', label: 'No.', width: 20, align: 'center' },
    { key: 'statement', label: 'STATEMENT', width: 85, align: 'left' },
    { key: 'date', label: 'Date', width: 30, align: 'center' },
    { key: 'surveyor', label: 'Surveyor-Gen.', width: 65, align: 'center' }
  ],
  
  defaultRows: [
    {
      no: '1.',
      statement: 'Dispensation\nCertificate\nNo...........\nrelates to\nthis G.P',
      date: '',
      surveyor: ''
    }
  ],
  
  rowHeight: 15,
  headerHeight: 15,
  fontSize: 9,
  headerFontSize: 9,
  
  position: 'right-margin',
  width: 150, // mm
  height: 150 // mm
}

// North Arrow
export const NORTH_ARROW = {
  size: 40, // points/pixels
  strokeWidth: 1.5,
  fillColor: '#000000',
  position: 'top-right',
  offset: { x: -50, y: 20 }
}

// Scale Bar
export const SCALE_BAR = {
  position: 'bottom-right',
  offset: { x: -150, y: -40 },
  
  barHeight: 4,
  barColor: '#000000',
  
  labelFont: { family: 'Helvetica', size: 9 },
  scaleFont: { family: 'Helvetica-Bold', size: 9 },
  
  // Length calculation based on scale
  lengthRules: {
    '1:1000-1:2500': 50,  // 50m bar
    '1:2500-1:5000': 100, // 100m bar
    '1:5000+': 200        // 200m bar
  }
}

// Label Configuration (UI and PDF consistency)
export const LABEL_CONFIG = {
  parcels: {
    font: { family: 'Helvetica-Bold', baseSize: 14 },
    color: '#000000',
    positioning: 'centroid',
    adaptiveScaling: true,
    
    // Adaptive sizing based on scale
    sizeRules: {
      '1:1000': 16,
      '1:2500': 14,
      '1:5000': 12,
      '1:10000': 10
    }
  },
  
  beacons: {
    // Beacons inside parcels (show only suffix letter) — bold, field-readable
    insideParcel: {
      font: { family: 'Helvetica-Bold', baseSize: 9 },
      displayFormat: 'suffix',
      color: '#1e293b',
      positioning: 'offset',
      offset: { x: 3, y: -3 },
      
      sizeRules: {
        '1:1000': 10,
        '1:2500': 9,
        '1:5000': 8,
        '1:10000': 8
      }
    },
    
    // Beacons outside parcels (show full name) — bold, field-readable
    outsideParcel: {
      font: { family: 'Helvetica-Bold', baseSize: 9 },
      displayFormat: 'full',
      color: '#000000',
      positioning: 'offset',
      offset: { x: 4, y: -3 },
      
      sizeRules: {
        '1:1000': 10,
        '1:2500': 9,
        '1:5000': 8,
        '1:10000': 8
      }
    }
  }
}

/**
 * Compress an array of stand name strings into compact range notation.
 * e.g. ["1213","1687","1688","1689","1868"] → "1213, 1687 - 1689, 1868"
 */
export function formatStandRanges(standNames) {
  if (!standNames || standNames.length === 0) return ''
  const numeric = []
  const nonNumeric = []
  for (const name of standNames) {
    const n = parseInt(name, 10)
    if (!isNaN(n) && String(n) === String(name).trim()) {
      numeric.push(n)
    } else {
      nonNumeric.push(name)
    }
  }
  numeric.sort((a, b) => a - b)
  const parts = []
  let i = 0
  while (i < numeric.length) {
    let j = i
    while (j + 1 < numeric.length && numeric[j + 1] === numeric[j] + 1) j++
    parts.push(j === i ? String(numeric[i]) : `${numeric[i]} - ${numeric[j]}`)
    i = j + 1
  }
  for (const name of nonNumeric) parts.push(name)
  return parts.join(', ')
}

// Helper function to format area values (banker's rounding)
export function formatAreaValue(areaM2) {
  if (!areaM2 || isNaN(areaM2)) return '0'
  
  const absArea = Math.abs(areaM2)
  const areaHa = absArea / 10000
  
  // If >= 1 hectare, show in hectares with 4 decimals
  if (areaHa >= 1) {
    const multiplier = 10000
    const shifted = areaHa * multiplier
    const floor = Math.floor(shifted)
    const fraction = shifted - floor
    
    let rounded
    if (Math.abs(fraction - 0.5) < Number.EPSILON) {
      rounded = (floor % 2 === 0 ? floor : floor + 1) / multiplier
    } else {
      rounded = Math.round(shifted) / multiplier
    }
    
    return `${rounded.toFixed(4)}Ha`
  } else {
    // Banker's rounding to nearest whole number
    const shifted = absArea
    const floor = Math.floor(shifted)
    const fraction = shifted - floor
    
    let rounded
    if (Math.abs(fraction - 0.5) < Number.EPSILON) {
      rounded = floor % 2 === 0 ? floor : floor + 1
    } else {
      rounded = Math.round(shifted)
    }
    
    return `${rounded}`
  }
}

// Helper function to format coordinates
export function formatCoordinate(value, decimals = 2) {
  if (!value || isNaN(value)) return '0.00'
  return parseFloat(value).toFixed(decimals)
}

// Helper function to format bearing
export function formatBearing(decimalDegrees, distance) {
  const degrees = Math.floor(decimalDegrees)
  const minutesDecimal = (decimalDegrees - degrees) * 60
  const minutes = Math.floor(minutesDecimal)
  const secondsDecimal = (minutesDecimal - minutes) * 60
  
  // Round based on distance
  let seconds
  if (distance !== undefined && distance < 6000) {
    seconds = Math.round(secondsDecimal / 10) * 10 // Nearest 10"
  } else {
    seconds = Math.round(secondsDecimal) // Nearest 1"
  }
  
  // Handle overflow
  if (seconds >= 60) {
    seconds = 0
    minutes++
    if (minutes >= 60) {
      degrees++
      minutes = 0
    }
  }
  
  return `${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}"`
}

// Helper function to get adaptive label size based on scale
export function getAdaptiveLabelSize(baseSize, scaleValue, sizeRules) {
  if (!sizeRules) return baseSize
  
  // Find appropriate size based on scale
  if (scaleValue <= 1000) return sizeRules['1:1000'] || baseSize
  if (scaleValue <= 2500) return sizeRules['1:2500'] || baseSize
  if (scaleValue <= 5000) return sizeRules['1:5000'] || baseSize
  return sizeRules['1:10000'] || baseSize
}

// Helper function to extract suffix from beacon name
export function extractBeaconSuffix(beaconName) {
  if (!beaconName) return ''
  
  // Extract suffix only if beacon has numeric prefix
  // Examples: "2474A" -> "A", "2474AB" -> "AB", "2475C" -> "C"
  // Non-matching: "M5" -> "M5", "ZA" -> "ZA" (no numeric prefix)
  const match = beaconName.match(/^(\d+)([A-Z]+)$/i)
  return match ? match[2] : beaconName
}

export default {
  SCHEDULE_OF_AREAS,
  OUTSIDE_FIGURE_DATA,
  BEACON_DESCRIPTION,
  SURVEY_STATEMENT,
  TITLE_BLOCK,
  ENDORSEMENT_BLOCK,
  NORTH_ARROW,
  SCALE_BAR,
  LABEL_CONFIG,
  formatAreaValue,
  formatCoordinate,
  formatBearing,
  getAdaptiveLabelSize,
  extractBeaconSuffix
}
