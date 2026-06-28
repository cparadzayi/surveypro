/**
 * Shared Block Definitions for Survey Plan
 * Single source of truth for block formatting across UI and PDF
 * 
 * Usage:
 * - Frontend: Import and use for rendering HTML/Canvas
 * - Backend: Import and use for rendering PDF
 */

// SI 727 Schedule of Areas - Full 6-column format
//
// ALL DIMENSIONS ARE IN PDF POINTS (1 pt = 1/72 inch ≈ 0.353 mm).
// The PDF generator consumes these values directly (it operates in pt).
// The DXF generator converts via PT_TO_MM in dxfScheduleHelpers.js, since
// it operates in paper-mm. Updated 2026-06-05 to match the values
// hardcoded in pdfkitGeoPDF.js's drawScheduleOfAreasSingleColumn /
// drawScheduleOfAreasMultiTable — previously block-definitions disagreed
// with the actual PDF drawer, producing wrong overflow detection in the
// PDF and DXF tables ~3.4× wider than the PDF tables at print scale.
export const SCHEDULE_OF_AREAS = {
  title: 'SCHEDULE OF AREAS',
  titleFont: { family: 'Helvetica-Bold', size: 10 },

  // Single column format (≤50 stands).
  // Widths match drawScheduleOfAreasSingleColumn:10231-10236 exactly.
  // Total tableWidth = 260 pt ≈ 91.7 mm at print scale.
  singleColumn: {
    columns: [
      { key: 'stand', label: 'STAND\nNo.', width: 35, align: 'center' },
      { key: 'area', label: 'AREAS\nSQUARE\nMETRES', width: 60, align: 'center' },
      { key: 'diagram', label: 'DIAGRAM\nNUMBER', width: 40, align: 'center' },
      { key: 'deedNumber', label: 'NUMBER', width: 40, align: 'center', parentHeader: 'DEED' },
      { key: 'deedDate', label: 'DATE', width: 35, align: 'center', parentHeader: 'DEED' },
      { key: 'surveyor', label: 'SURVEYOR-\nGENERAL', width: 50, align: 'center' }
    ],
    rowHeight: 15,
    headerHeight: 25,
    fontSize: 7,           // body row font (drawScheduleOfAreasSingleColumn:10434)
    headerFontSize: 6,     // column header font (drawScheduleOfAreasSingleColumn:10307)
    titleFontSize: 9       // title font (drawScheduleOfAreasSingleColumn:10247)
  },

  // Multi-column format (>50 stands).
  // drawScheduleOfAreasMultiTable:9229-9234 uses THE SAME column widths
  // as singleColumn (not narrower as the old block-definitions suggested).
  multiColumn: {
    columns: [
      { key: 'stand', label: 'STAND\nNo.', width: 35, align: 'center' },
      { key: 'area', label: 'AREAS\nSQUARE\nMETRES', width: 60, align: 'center' },
      { key: 'diagram', label: 'DIAGRAM\nNUMBER', width: 40, align: 'center' },
      { key: 'deedNumber', label: 'NUMBER', width: 40, align: 'center', parentHeader: 'DEED' },
      { key: 'deedDate', label: 'DATE', width: 35, align: 'center', parentHeader: 'DEED' },
      { key: 'surveyor', label: 'SURVEYOR-\nGENERAL', width: 50, align: 'center' }
    ],
    rowHeight: 15,
    headerHeight: 25,
    fontSize: 7,
    headerFontSize: 6,
    titleFontSize: 9,
    columnSpacing: 10      // _SCHED_SPACING_BETWEEN at pdfkitGeoPDF.js:8941
  },

  threshold: 50 // Switch to multi-column if stands > threshold
}

// Outside Figure Data — ALL DIMENSIONS IN PDF POINTS.
// Updated 2026-06-05 to match the values hardcoded in
// pdfkitGeoPDF.js:drawOutsideFigureData at line 10750-10755. col1 (SIDES)
// has a 45-pt minimum but grows dynamically to fit longer side labels;
// consumers should still treat 45 as the canonical minimum.
export const OUTSIDE_FIGURE_DATA = {
  title: 'OUTSIDE FIGURE DATA',
  titleFont: { family: 'Helvetica-Bold', size: 9 },

  columns: [
    { key: 'sides',     label: 'SIDES',           width: 45, align: 'center' },  // dynamic min — drawOutsideFigureData:10750
    { key: 'metres',    label: 'Metres',          width: 40, align: 'center' },  //                             :10751
    { key: 'direction', label: 'DIRECTION',       width: 70, align: 'center' },  //                             :10752
    { key: 'constants', label: 'Constants',       width: 55, align: 'center' },  //                             :10753
    { key: 'y',         label: 'Y',               width: 65, align: 'center' },  //                             :10754
    { key: 'x',         label: 'X',               width: 70, align: 'center' },  //                             :10755
  ],

  coordinateHeader: {
    text: 'CO-ORDINATES',
    subtext: 'System : Lo {meridian}°\nY    Metres    X',
    colspan: 2 // Spans Y + X columns
  },

  rowHeight: 12,        // drawOutsideFigureData:10729
  headerHeight: 15,     // drawOutsideFigureData:10730 (column header row)
  headerBoxHeight: 40,  // drawOutsideFigureData:10731 (title + CO-ORDINATES box)
  fontSize: 9,          // drawOutsideFigureData:10741, 10907 (body + headers)
  headerFontSize: 9,    // same as body — PDF uses one size throughout
  titleFontSize: 9      // drawOutsideFigureData:10803
}

// Surveyor-General / Approved signature box — values from
// pdfkitGeoPDF.js:drawSurveyorGeneralSignature at line 11382-11436.
export const SURVEYOR_GENERAL_BOX = {
  width: 200,                   // pdfkitGeoPDF.js:11383
  height: 80,                   // pdfkitGeoPDF.js:11384
  titleFontSize: 12,            //                :11398 — "Approved" text
  titleFont: 'Helvetica',       //                :11399 — regular (NOT bold)
  bodyFontSize: 9,              //                :11421/11431 — "For Surveyor General", "Date ..."
  bodyFont: 'Helvetica',
  // Vertical offsets from box top, in PDF points.
  titleYOffset:       15,       //                :11396 — `blockY + 15`
  signatureLineYOffset: 40,     //                :11407 — `blockY + 40`
  forSGYOffset:       48,       //                :11419 — `signatureY + 8`
  dateYOffset:        60,       //                :11429 — `blockHeight - 20`
  // Signature-line horizontal margins (PDF uses 20-pt inset on each side).
  signatureLineInset: 20,       //                :11408 — `lineMargin`
  signatureLineDash:  { dash: 2, space: 2 },
  // "Date ..." label x offset matches PDF's `blockX + 10`; width spans box - 20.
  dateXOffset: 10,
  dateText:   'Date ............................'
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
    // Cartographic hierarchy (ISO 3098): the document heading dominates every
    // feature label. 20 pt ≈ 7 mm; mirrors the DXF hTitle.
    font: { family: 'Helvetica-Bold', size: 20 },
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
    // e.g. "Stands 16 - 18 Maglas Township". This is the identifying title and
    // must out-rank the stand labels. 14 pt ≈ 5 mm; mirrors the DXF hDesig.
    template: '{designation}',
    font: { family: 'Helvetica-Bold', size: 14 },
    alignment: 'center'
  },
  
  figureDescription: {
    // Single-sheet: beacon sequence + stand count + whole/remainder/portion.
    // Phrasing follows the ideal General Plan: dot-joined beacons, no leading
    // township name, and no "comprising … numbered <range>" clause (the stand
    // range now lives in the prominent title designation line instead).
    template: 'The figure {beaconSequence} represents {standCount} stands and public places being {wholePortion} of {ofTarget} situate in the district of {district}.',
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

// Edge side-length (metres) for the Outside Figure Data table AND the figure
// edge labels. Frontend / data payloads carry the side length under either
// `distance` or `metres`; read both from a single helper so the OFD "Metres"
// column and the on-figure distance label can never diverge (and so the DXF and
// PDF render identical values). Returns a finite number, or null when neither
// field is present (callers decide the fallback).
export function edgeDistanceMetres(edge) {
  if (!edge) return null
  const raw = edge.distance ?? edge.metres
  const n = typeof raw === 'number' ? raw : parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

// Classify + group beacons for the Beacon Description block. Single source of
// truth so the PDF, DXF and UI render identical groupings. Classification is by
// name pattern: M-series → "Not beaconed"; single-letter+digits or all-letter
// codes (P2, ZE, REMA) → "50mm Iron Pipe in Concrete"; everything else → "12mm
// iron peg in concrete". The most common type is rolled up as "Others".
// Returns an ordered array of { points, description } where `points` is the
// comma-joined sorted beacon names (or the literal "Others"); "Not beaconed"
// sorts first, "Others" last, the rest alphabetically by description.
export function classifyBeaconGroups(beacons) {
  const features = beacons?.features || []
  if (!features.length) return []

  const typeGroups = new Map()
  for (const b of features) {
    const p = b?.properties || {}
    const name = p.name || p.id || p.pointId || p.beacon_name || 'BP'
    let type
    if (/^M\d+/i.test(name)) type = 'Not beaconed'
    else if (/^[A-Z]\d+$/i.test(name) || /^[A-Z]{2,}$/i.test(name)) type = '50mm Iron Pipe in Concrete'
    else type = '12mm iron peg in concrete'
    if (!typeGroups.has(type)) typeGroups.set(type, [])
    typeGroups.get(type).push(name)
  }

  // Most common type becomes "Others".
  const byCount = [...typeGroups.entries()].sort((a, b) => b[1].length - a[1].length)
  const mostCommon = byCount[0]?.[0] || '12mm iron peg in concrete'

  const groups = {}
  typeGroups.forEach((names, type) => { if (type !== mostCommon) groups[type] = names })
  if (typeGroups.has(mostCommon)) groups[mostCommon] = ['Others']

  const sortNames = (pts) => [...pts].sort((a, b) => {
    const pa = a.match(/[A-Za-z]+/)?.[0] || '', pb = b.match(/[A-Za-z]+/)?.[0] || ''
    if (pa !== pb) return pa.localeCompare(pb)
    return (parseInt(a.match(/\d+/)?.[0] || '0', 10)) - (parseInt(b.match(/\d+/)?.[0] || '0', 10))
  })

  return Object.entries(groups)
    .sort(([dA, pA], [dB, pB]) => {
      if (dA.toLowerCase().includes('not beaconed')) return -1
      if (dB.toLowerCase().includes('not beaconed')) return 1
      const oA = pA.length === 1 && pA[0] === 'Others'
      const oB = pB.length === 1 && pB[0] === 'Others'
      if (oA) return 1
      if (oB) return -1
      return dA.localeCompare(dB)
    })
    .map(([description, points]) => ({
      description,
      points: (points.length === 1 && points[0] === 'Others') ? 'Others' : sortNames(points).join(', '),
    }))
}

// Snap a raw scale-bar segment length (in ground metres) to the nearest "nice"
// cartographic number so graduation labels read 0, L, 2L, 3L (e.g. 0 5 10 15)
// rather than awkward fractions. Single source of truth shared by the PDF and
// DXF scale bars. Mirrors the PDF's original rule: the first nice number that is
// ≥ half the raw segment; falls back to 100 m when the raw value is enormous.
export function snapScaleBarSegment(rawSegmentMeters) {
  const niceNumbers = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
  for (const n of niceNumbers) {
    if (n >= rawSegmentMeters / 2) return n
  }
  return 100
}

// Resolve the Lo coordinate-system label ("Lo 29") shown in the OUTSIDE FIGURE
// DATA header. Single source of truth so the DXF and PDF never disagree, in
// priority order:
//   1. an explicit loSystem string carried in the outside-figure constants;
//   2. the project's central meridian (metadata.centralMeridian) — the value
//      entered at project setup, and the authoritative source;
//   3. the meridian parsed from the projection (Cape Lo EPSG 22275–22293, or a
//      literal "Lo NN");
//   4. the SI 727 default Lo 31 as a last resort.
// "Lo 31" is only a last-resort default — a project set up as Lo 29 must read
// Lo 29 in both formats, not the default.
export function resolveLoSystem(outsideFigureData, metadata = null, projection = null) {
  const explicit = outsideFigureData?.constants?.loSystem
  if (explicit) return String(explicit)

  const cm = parseInt(metadata?.centralMeridian ?? outsideFigureData?.constants?.centralMeridian, 10)
  if (Number.isFinite(cm)) return `Lo ${cm}`

  if (projection != null) {
    const epsg = String(projection).match(/\b(222\d{2})\b/)
    if (epsg) {
      const code = parseInt(epsg[1], 10)
      if (code >= 22275 && code <= 22293) return `Lo ${code - 22260}`
    }
    const literal = String(projection).match(/Lo\s*(\d{1,2})/i)
    if (literal) return `Lo ${literal[1]}`
  }

  return 'Lo 31'
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

/**
 * Compute per-column widths for the Schedule of Areas so headers and
 * data values never overflow their column. Widths are in PDF points.
 *
 * Per column:
 *   raw   = max(widest header token at headerFontSize,
 *               widest data value  at bodyFontSize)
 *         + 2 * padding
 *   width = max(raw, colMinFloor)
 *
 * Returns 6 widths in the same order as SCHEDULE_OF_AREAS.singleColumn.columns:
 *   [stand, area, diagram, deedNumber, deedDate, surveyor].
 *
 * @param {Object} args
 * @param {Array<Object>} args.dataRows - schedule data rows; keys match column.key values
 * @param {number} args.headerFontSize - PDF pt; used for header-token measurement
 * @param {number} args.bodyFontSize   - PDF pt; used for data-cell measurement
 * @param {(text:string, fontSize:number) => number} args.measureText
 *        Text-width measurer returning PDF pt. PDF passes a function backed
 *        by doc.widthOfString; DXF passes (text, fz) => text.length * fz * 0.55.
 * @param {number} [args.padding=4]    - per-side cell padding in pt
 * @param {number} [args.colMinFloor=24] - per-column minimum width in pt
 * @returns {number[]} 6 column widths in pt
 */
export function computeScheduleColumnWidths({
  dataRows, headerFontSize, bodyFontSize, measureText,
  padding = 4, colMinFloor = 24,
}) {
  const cols = SCHEDULE_OF_AREAS.singleColumn.columns
  const widths = []
  for (const col of cols) {
    const headerTokens = String(col.label).split('\n')
    let widestHeader = 0
    for (const t of headerTokens) {
      const w = measureText(t, headerFontSize)
      if (w > widestHeader) widestHeader = w
    }
    let widestData = 0
    for (const row of dataRows) {
      const val = row[col.key]
      if (val == null || val === '') continue
      const w = measureText(String(val), bodyFontSize)
      if (w > widestData) widestData = w
    }
    const raw = Math.max(widestHeader, widestData) + 2 * padding
    widths.push(Math.max(raw, colMinFloor))
  }
  return widths
}

/**
 * Plan how to split a schedule of totalRows stands across the available
 * whitespace gaps. Greedy: largest-capacity gap first, fills with as many
 * rows as it holds.
 *
 * Per gap, capacity = floor((gap.height - headerHeight) / rowHeight).
 * Gaps narrower than tableWidth are skipped (too narrow for the table).
 * Gaps with capacity < minRowsPerTable are skipped UNLESS totalRows is
 * itself below minRowsPerTable (very small plan), in which case the first
 * width-passing gap holds all rows.
 *
 * Returns:
 *   plan: [{ gapIndex, startRow, rowCount, isContinuation }]
 *         gapIndex is the original index in availableGaps. startRow is
 *         the index into the caller's dataRows where this sub-table
 *         starts. isContinuation is true for all sub-tables after the
 *         first.
 *   residualRows: number of rows left unplaced. > 0 triggers caller-side
 *                 scheduleOverflow warn + final-rescue fallback.
 *
 * @param {Object} args
 * @param {number} args.totalRows
 * @param {Array<{x:number,y:number,width:number,height:number}>} args.availableGaps
 * @param {number} args.tableWidth   - sum of column widths in the same units as gaps
 * @param {number} args.headerHeight - total header height (title + DEED + sub-headers)
 * @param {number} args.rowHeight
 * @param {number} [args.minRowsPerTable=3]
 * @returns {{ plan: Array<{gapIndex:number,startRow:number,rowCount:number,isContinuation:boolean}>, residualRows: number }}
 */
export function planScheduleSplit({
  totalRows, availableGaps, tableWidth, headerHeight, rowHeight,
  minRowsPerTable = 3,
}) {
  const candidates = []
  for (let i = 0; i < availableGaps.length; i++) {
    const g = availableGaps[i]
    if (g.width < tableWidth) continue
    const capacity = Math.floor((g.height - headerHeight) / rowHeight)
    if (capacity < minRowsPerTable && totalRows >= minRowsPerTable) continue
    if (capacity <= 0) continue
    candidates.push({ originalIndex: i, capacity })
  }
  candidates.sort((a, b) => b.capacity - a.capacity)

  let remainingRows = totalRows
  let startIndex = 0
  const plan = []
  for (const c of candidates) {
    if (remainingRows < minRowsPerTable && plan.length > 0) break
    const rowsHere = Math.min(c.capacity, remainingRows)
    if (rowsHere <= 0) break
    plan.push({
      gapIndex:       c.originalIndex,
      startRow:       startIndex,
      rowCount:       rowsHere,
      isContinuation: plan.length > 0,
    })
    startIndex    += rowsHere
    remainingRows -= rowsHere
    if (remainingRows === 0) break
  }
  return { plan, residualRows: remainingRows }
}

export default {
  SCHEDULE_OF_AREAS,
  OUTSIDE_FIGURE_DATA,
  SURVEYOR_GENERAL_BOX,
  BEACON_DESCRIPTION,
  SURVEY_STATEMENT,
  TITLE_BLOCK,
  ENDORSEMENT_BLOCK,
  NORTH_ARROW,
  SCALE_BAR,
  LABEL_CONFIG,
  formatAreaValue,
  edgeDistanceMetres,
  classifyBeaconGroups,
  resolveLoSystem,
  snapScaleBarSegment,
  formatCoordinate,
  formatBearing,
  getAdaptiveLabelSize,
  extractBeaconSuffix
}
