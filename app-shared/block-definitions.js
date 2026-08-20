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
      { key: 'surveyor', label: 'SURVEYOR-GENERAL', width: 50, align: 'center' }
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
      { key: 'surveyor', label: 'SURVEYOR-GENERAL', width: 50, align: 'center' }
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
  // Column-header row. Tall enough for the DIRECTION header PLUS a "° ' \"" unit
  // sub-line whose symbols sit over the degree / minute / second value columns.
  headerHeight: 24,
  headerBoxHeight: 40,  // drawOutsideFigureData:10731 (title + CO-ORDINATES box)
  fontSize: 9,          // drawOutsideFigureData:10741, 10907 (body + headers)
  headerFontSize: 9,    // same as body — PDF uses one size throughout
  titleFontSize: 9      // drawOutsideFigureData:10803
}

// Surveyor-General / Approved signature box — values from
// pdfkitGeoPDF.js:drawSurveyorGeneralSignature at line 11382-11436.
export const SURVEYOR_GENERAL_BOX = {
  width: 200,
  height: 110,                  // taller rows so the S-G can sign above the line and date cleanly
  titleFontSize: 12,            // "Approved" text
  titleFont: 'Helvetica',       // regular (NOT bold)
  bodyFontSize: 9,              // "For Surveyor General", "Date ..."
  bodyFont: 'Helvetica',
  // Vertical offsets from box top, in PDF points. Spread out to leave a generous
  // signing gap between "Approved" and the signature line, and room to write the
  // date below "For Surveyor General".
  titleYOffset:       16,       // "Approved" near the top
  signatureLineYOffset: 62,     // ~46 pt of clear signing space above the line
  forSGYOffset:       70,       // labels the signature line (8 pt below it)
  dateYOffset:        96,       // room below to write the date
  // Signature-line horizontal margins (PDF uses 20-pt inset on each side).
  signatureLineInset: 20,       //                :11408 — `lineMargin`
  signatureLineDash:  { dash: 2, space: 2 },
  // "Date ..." label x offset matches PDF's `blockX + 10`; width spans box - 20.
  dateXOffset: 10,
  dateText:   'Date ............................'
}

// Beacon Description
export const BEACON_DESCRIPTION = {
  title: 'DESCRIPTION OF BEACONS',
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
  offset: { x: -50, y: 20 },
  // Reserved layout bounding box (PDF pts). SINGLE SOURCE OF TRUTH: the block
  // planner reserves this slot and the renderer draws the compass rose to fill
  // it — keep them sourced from here so they can never drift (see the S-G box
  // drift bug). The rose is 35 pt above+below centre + ~15 pt for the "TN"
  // label → 85 pt tall.
  blockWidth: 70,
  blockHeight: 85
}

// Scale Bar
export const SCALE_BAR = {
  position: 'bottom-right',
  offset: { x: -150, y: -40 },
  
  barHeight: 4,
  barColor: '#000000',

  // Reserved layout height (PDF pts) the block planner sets aside for the scale
  // bar. Unlike the N-arrow / S-G box, the scale bar's WIDTH is dynamic (depends
  // on scale + segment count), so only the height is pinned here. The renderer
  // draws a shorter bar (~64 pt) WITHIN this slot; keep this ≥ the drawn height.
  reservedHeight: 85,

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

/**
 * Determine whether a township General Plan must use exactly 1:500, per the
 * Surveyor-General's area-majority rule: mandatory only when the majority of
 * stands (excluding Outside Figure) have area <= thresholdM2. Ties resolve to
 * the mandate. Shared by pdfkitGeoPDF.js, dxfGenerator.js, and
 * surveyPlanPreview.js so all three can never resolve this rule differently
 * for the same parcels.
 */
export function resolveTownshipScaleMandate(parcels, thresholdM2 = 200) {
  const features = parcels?.features || []
  let atOrBelow = 0
  let above = 0
  for (const f of features) {
    const props = f?.properties || {}
    const isOutsideFigure =
      props.isOutsideFigure === true ||
      props.metadata?.isOutsideFigure === true ||
      String(props.stand || '').toLowerCase().includes('outside figure') ||
      String(props.designation || '').toLowerCase().includes('outside figure')
    if (isOutsideFigure) continue

    let area = Number(props.area_m2)
    if (!Number.isFinite(area) || area <= 0) {
      area = shoelaceAreaM2(f?.geometry?.coordinates?.[0])
    }
    if (area <= thresholdM2) atOrBelow++
    else above++
  }
  return { mandatory500: atOrBelow >= above }
}

function shoelaceAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let coords = ring
  // Unwrap double-nested [[ring]] the same way geopdf-vector.js does.
  if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) coords = coords[0]
  let a = 0
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[(i + 1) % coords.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a / 2)
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

// Picks the largest "nice" round ground-metre interval whose paper spacing,
// at the given scale, stays at or under targetPaperMm. Used to space
// coordinate-grid tick marks close enough together that a Surveyor-General
// can check any adjacent pair with a standard 30cm scale ruler — unlike
// snapScaleBarSegment (smallest nice number >= half a raw segment, for the
// scale bar's own graduation), this solves the opposite constraint.
const GRID_NICE_NUMBERS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 500, 1000, 2000, 5000, 10000]

export function chooseTickIntervalMetres(scaleDenominator, targetPaperMm = 250) {
  const maxIntervalM = (targetPaperMm * scaleDenominator) / 1000
  let chosen = GRID_NICE_NUMBERS[0]
  for (const n of GRID_NICE_NUMBERS) {
    if (n > maxIntervalM) break
    chosen = n
  }
  return chosen
}

// Generates tick points along all 4 edges of a bounding rectangle at a
// fixed interval, replacing "4 corners only" coordinate tick marks with
// enough intermediate points that no two adjacent ticks exceed a
// ruler-safe paper distance. Axis-agnostic: callers supply whatever two
// ground-coordinate axes they use (Cape Lo Y/X, DXF ground x/y, etc.) as
// a/b. Each of the 4 corners is the shared endpoint of two edges, so this
// dedupes by (a,b) before returning.
// Tick values along one axis: every whole interval step from start, plus the
// exact end point. Module-scope so computeConfinedTickGrid's density check
// counts ticks exactly as computeGridTickPositions will emit them — the two
// drifting apart is the same class of bug the shared-helper work fixes.
function steppedRange(start, end, step) {
  const vals = []
  for (let v = start; v < end; v += step) vals.push(v)
  vals.push(end)
  return vals
}

// Tick coordinate values along ONE axis — the same stepping computeGridTickPositions
// uses, exposed for border ticks. A border tick is drawn where each grid line meets
// the drawing-area neatline, so a renderer needs the per-axis VALUES rather than the
// perimeter point list: each a-value gets a tick on the top and bottom borders, each
// b-value one on the left and right. Shared by pdfkitGeoPDF.js and dxfGenerator.js so
// the two formats tick identical coordinates.
export function computeTickValues({ min, max, intervalM }) {
  return steppedRange(min, max, intervalM)
}

export function computeGridTickPositions({ aMin, aMax, bMin, bMax, intervalM }) {
  const aValues = steppedRange(aMin, aMax, intervalM)
  const bValues = steppedRange(bMin, bMax, intervalM)

  const seen = new Set()
  const points = []
  const addPoint = (a, b) => {
    const key = `${a},${b}`
    if (seen.has(key)) return
    seen.add(key)
    points.push({ a, b })
  }
  // Top/bottom edges: a varies, b fixed at bMin/bMax.
  for (const a of aValues) {
    addPoint(a, bMin)
    addPoint(a, bMax)
  }
  // Left/right edges: b varies, a fixed at aMin/aMax.
  for (const b of bValues) {
    addPoint(aMin, b)
    addPoint(aMax, b)
  }
  return points
}

/**
 * Round a figure's true min/max INWARD to the nearest tick-interval
 * multiple on each axis, so no tick mark ever falls outside the figure's
 * actual bounds. Ticks still land on nice round numbers — they're just one
 * interval short of the figure's true extent rather than one interval
 * beyond it. Falls back to the exact min/max on an axis where fewer than
 * TWO round multiples fit inside the figure — both the no-multiple case
 * (figure narrower than one interval) and the exactly-one-multiple case,
 * where inward rounding would otherwise collapse the axis to zero extent.
 * A zero-extent axis is not a usable grid: computeGridTickPositions turns
 * it into a single LINE of ticks instead of a rectangle framing the
 * figure, silently dropping every label on the opposite axis. The fallback
 * still guarantees confinement, just without a round label in that rare
 * case.
 *
 * Axis-agnostic (aMin/aMax/bMin/bMax, not Y/X) like computeGridTickPositions
 * — its return shape is exactly that function's input shape, so callers can
 * pass this helper's output straight into computeGridTickPositions. Shared
 * by pdfkitGeoPDF.js (calculateTickMarkBounds, renderOutsideFigureTickMarks)
 * and dxfGenerator.js (addCornerCrosses) so all three resolve identical
 * corner bounds for the same figure — previously three independent
 * outward-rounding copies, the same class of drift risk already fixed once
 * for the rounding rule itself, see
 * docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md
 */
export function computeInwardTickBounds({ aMin, aMax, bMin, bMax, intervalM }) {
  const roundInward = (min, max) => {
    const inwardMin = Math.ceil(min / intervalM) * intervalM
    const inwardMax = Math.floor(max / intervalM) * intervalM
    return inwardMin < inwardMax ? { min: inwardMin, max: inwardMax } : { min, max }
  }
  const a = roundInward(aMin, aMax)
  const b = roundInward(bMin, bMax)
  return { aMin: a.min, aMax: a.max, bMin: b.min, bMax: b.max }
}

// Ticks packed closer than this on paper read as clutter rather than a usable
// reference grid, so interval step-down never goes below it. Counterpart to
// chooseTickIntervalMetres' 250mm upper bound (30cm-ruler reach).
const MIN_TICK_PAPER_MM = 25

/**
 * Resolve BOTH the tick interval and the inward-rounded corner bounds for a
 * figure, so the grid is confined to the figure AND still carries at least
 * one tick between opposite corners on each axis.
 *
 * chooseTickIntervalMetres alone picks the largest ruler-safe interval, which
 * is right for spacing but can leave a small figure with nothing but its 4
 * corner crosses once bounds round inward: a 180m extent at a 100m interval
 * confines to 50000-50100, just 2 ticks, with no intermediate pair for a
 * Surveyor-General to check against a 30cm scale ruler. This walks the same
 * nice-number ladder downward from that pick and returns the COARSEST rung
 * where both axes carry minTicksPerAxis ticks, bounded below by
 * MIN_TICK_PAPER_MM so a tiny figure can't produce a cluttered grid. When no
 * rung satisfies the density floor, the ruler-safe pick is kept unchanged.
 *
 * Returns computeGridTickPositions' input shape plus the resolved intervalM,
 * so callers destructure one call instead of pairing chooseTickIntervalMetres
 * with computeInwardTickBounds themselves. Shared by pdfkitGeoPDF.js
 * (calculateTickMarkBounds, renderOutsideFigureTickMarks) and dxfGenerator.js
 * (addCornerCrosses) — see
 * docs/superpowers/specs/2026-08-12-tick-marks-confined-to-figure-bounds-design.md
 */
export function computeConfinedTickGrid({
  aMin, aMax, bMin, bMax, scaleDenominator,
  targetPaperMm = 250, minTicksPerAxis = 3, minPaperMm = MIN_TICK_PAPER_MM,
}) {
  const coarsest = chooseTickIntervalMetres(scaleDenominator, targetPaperMm)
  const minIntervalM = (minPaperMm * scaleDenominator) / 1000
  const rungs = GRID_NICE_NUMBERS.filter(n => n <= coarsest && n >= minIntervalM)
  // Coarsest first — keep the ruler-safe pick unless it starves an axis.
  for (let i = rungs.length - 1; i >= 0; i--) {
    const intervalM = rungs[i]
    const bounds = computeInwardTickBounds({ aMin, aMax, bMin, bMax, intervalM })
    const aTicks = steppedRange(bounds.aMin, bounds.aMax, intervalM).length
    const bTicks = steppedRange(bounds.bMin, bounds.bMax, intervalM).length
    if (aTicks >= minTicksPerAxis && bTicks >= minTicksPerAxis) return { intervalM, ...bounds }
  }
  return { intervalM: coarsest, ...computeInwardTickBounds({ aMin, aMax, bMin, bMax, intervalM: coarsest }) }
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
 * 15cm at print scale, in PDF points (150mm / 25.4mm-per-inch * 72pt-per-inch).
 * The Schedule of Areas targets this width so it reads clearly when printed,
 * regardless of how narrow its content-fit columns would otherwise be.
 */
export const SCHEDULE_TARGET_WIDTH_PT = 150 * (72 / 25.4)

/**
 * Scales a set of column widths UP (never down) so they sum to at least
 * targetWidthPt, preserving each column's relative share of the total.
 * Widths that already sum to targetWidthPt or more are returned unchanged —
 * the table never shrinks below what its content needs.
 *
 * @param {number[]} widths
 * @param {number} targetWidthPt
 * @returns {number[]}
 */
export function scaleColumnWidthsToTarget(widths, targetWidthPt) {
  const sum = widths.reduce((a, b) => a + b, 0)
  if (sum <= 0 || sum >= targetWidthPt) return widths
  const scale = targetWidthPt / sum
  return widths.map((w) => w * scale)
}

/**
 * Fixed widths (in PDF points, same print-scale space as SCHEDULE_TARGET_WIDTH_PT)
 * for the STAND No. and AREAS SQUARE METRES columns of the Schedule of Areas.
 */
export const SCHEDULE_STAND_WIDTH_PT = 40
export const SCHEDULE_AREA_WIDTH_PT = 45

/**
 * Lays out the Schedule of Areas' 6 column widths using a fixed-width policy
 * for the first two columns and an equal split of the remainder across the
 * other four:
 *   - STAND No. and AREAS SQUARE METRES are pinned to SCHEDULE_STAND_WIDTH_PT
 *     / SCHEDULE_AREA_WIDTH_PT (never narrower than their own content-fit
 *     width, so short values like stand numbers never overflow).
 *   - DIAGRAM NUMBER, DEED NUMBER, DEED DATE, and SURVEYOR-GENERAL split
 *     whatever's left of targetWidthPt equally — but never narrower than the
 *     widest content-fit width among those four, so long values (e.g. a
 *     lengthy diagram or deed number) still fit.
 *
 * Column order matches SCHEDULE_OF_AREAS.singleColumn.columns:
 *   [stand, area, diagram, deedNumber, deedDate, surveyor]
 *
 * @param {number[]} rawWidths - content-fit widths, e.g. from computeScheduleColumnWidths
 * @param {number} [targetWidthPt=SCHEDULE_TARGET_WIDTH_PT]
 * @returns {number[]} 6 column widths
 */
export function layoutScheduleColumnsFixedStandArea(rawWidths, targetWidthPt = SCHEDULE_TARGET_WIDTH_PT) {
  const [rawStand, rawArea, ...rawRest] = rawWidths
  const stand = Math.max(SCHEDULE_STAND_WIDTH_PT, rawStand)
  const area = Math.max(SCHEDULE_AREA_WIDTH_PT, rawArea)
  const rawRestMax = Math.max(...rawRest)
  const equalShare = Math.max((targetWidthPt - stand - area) / rawRest.length, rawRestMax)
  return [stand, area, ...rawRest.map(() => equalShare)]
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
