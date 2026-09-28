/**
 * Professional Survey Plan Exporter
 * Production-ready PDF generation for SI 727 compliant General Plans
 * Optimized for large-format printing (A0-A2)
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatAreaM2 } from './areaFormatting'

export interface SurveyPlanData {
  projectId: number
  projectInfo: {
    designation: string
    surveyOf?: string
    township?: string
    /** Immediate parent property e.g. "Shabani Mine Surface Rights A" */
    parentProperty?: string
    district?: string
    surveyDate: string
    surveyorName: string
    licenseNumber: string
    firm?: string
    wholePortion?: string
  }
  parcels: Array<{
    id: number
    stand: string
    area_m2: number
    description?: string
  }>
  outsideFigureData?: {
    edges: Array<{
      side: string
      distance: number
      direction: string
      pointId: string
      y: number
      x: number
    }>
    constants: {
      pointId: string
      y: number
      x: number
    }
  }
  beaconGroups: Array<{
    points: string
    description: string
  }>
  mapImageData: string // Base64 map image
  scale: string
  centralMeridian: number
  /** 'general-developed' omits edge directions and distances from the Outside Figure Data table */
  planType?: 'general-undeveloped' | 'general-developed' | 'diagram' | 'working-plan'
}

export interface ExportOptions {
  sheetSize: 'SI727_500x400' | 'SI727_800x500' | 'SI727_1000x800'  // SI 727 Section 62(1) sizes
  orientation: 'landscape' | 'portrait'
  resolution: 'print' | 'screen' // print = 300dpi, screen = 150dpi
  includeGrid: boolean
  includeMarginGuides: boolean
}


// SI 727 Section 62(1) prescribed General Plan sheet sizes (mm).
// Landscape orientation by default (width > height)
const SHEET_SIZES = {
  SI727_500x400:  { width: 500,  height: 400 },  // 200,000 mm²
  SI727_800x500:  { width: 800,  height: 500 },  // 400,000 mm²
  SI727_1000x800: { width: 1000, height: 800 }   // 800,000 mm²
}

// SI 727 Standard Margins (mm)
const MARGINS = {
  left: 50,
  right: 150, // Extra space for Surveyor-General endorsements
  top: 50,
  bottom: 50
}

// Professional Typography System - FIELD-OPTIMIZED for readability at arm's length
const FONTS = {
  title: { family: 'helvetica', size: 16, weight: 'bold' },
  subtitle: { family: 'helvetica', size: 12, weight: 'normal' },
  body: { family: 'helvetica', size: 10, weight: 'normal' },
  table: { family: 'helvetica', size: 8, weight: 'normal' },
  small: { family: 'helvetica', size: 7, weight: 'normal' },
  coordinates: { family: 'courier', size: 7, weight: 'normal' }, // Monospace for alignment
  
  // FIELD-SPECIFIC FONTS (Zimbabwe/SA cadastral standards)
  standNumbers: { family: 'helvetica', size: 14, weight: 'bold' },     // Must read from 1m
  beaconNames: { family: 'helvetica', size: 10, weight: 'bold' },      // Must read from 0.5m
  dimensions: { family: 'helvetica', size: 9, weight: 'bold' },        // Parcel dimensions
  bearings: { family: 'helvetica', size: 9, weight: 'normal' }         // Direction annotations
}

// LINE WEIGHTS - Field-tested for outdoor visibility
const LINE_WEIGHTS = {
  outsideFigure: 1.0,      // Extra bold - primary survey boundary
  parcelBoundary: 0.7,     // Bold - individual stand boundaries
  mapBorder: 1.0,          // Bold - defines survey extent
  dimensionLine: 0.3,      // Medium - measurement annotations
  gridLine: 0.1,           // Thin - reference only
  tableBorder: 0.2         // Medium - table cells
}

// BEACON SYMBOLS - Differentiated by type (SI 727 + field practice)
const BEACON_STYLES = {
  ironPeg: { symbol: 'circle', size: 3.0, fill: true },
  concrete: { symbol: 'square', size: 3.5, fill: true },
  trigBeacon: { symbol: 'triangle', size: 4.0, fill: false },
  cornerPost: { symbol: 'circle', size: 2.5, fill: false }
}

// COLORS - Field-optimized (prints clearly in B&W)
const FIELD_COLORS = {
  black: [0, 0, 0],
  darkGray: [80, 80, 80],
  mediumGray: [100, 100, 100],
  lightGray: [200, 200, 200],
  white: [255, 255, 255],
  red: [255, 0, 0],        // New beacons
  blue: [0, 0, 255]        // Adopted beacons
}

function getTitleBlockFontScale(pdf: jsPDF): number {
  const w = pdf.internal.pageSize.getWidth()
  const h = pdf.internal.pageSize.getHeight()
  const minDim = Math.min(w, h)
  if (minDim >= 800) return 1.35
  if (minDim >= 500) return 1.15
  return 1
}

/**
 * Calculate optimal sheet size based on Outside Figure extent (SI 727 Section 62(1))
 * Uses the spatial dimensions of the Outside Figure to determine appropriate sheet size
 */
export function calculateOptimalSheetSize(
  outsideFigureExtent: { width: number; height: number } | null,
  parcelCount: number = 0,
  totalArea: number = 0
): 'SI727_500x400' | 'SI727_800x500' | 'SI727_1000x800' {
  // If no outside figure extent provided, use parcel-based heuristics
  if (!outsideFigureExtent) {
    if (parcelCount > 50 || totalArea > 500000) return 'SI727_1000x800'
    if (parcelCount > 10 || totalArea > 100000) return 'SI727_800x500'
    return 'SI727_500x400'
  }
  
  // Calculate required drawing area (extent + margins + overlays)
  // Working area = Sheet size - margins (50mm left, 150mm right, 50mm top/bottom)
  // Available for map = Working area - overlays (~200mm for tables/text)
  
  const extentWidth = outsideFigureExtent.width  // meters
  const extentHeight = outsideFigureExtent.height  // meters
  
  // Determine scale based on extent
  // Common cadastral scales: 1:500, 1:1000, 1:2000, 1:5000
  let scale = 1000  // Default
  const maxExtent = Math.max(extentWidth, extentHeight)
  
  if (maxExtent > 2000) scale = 5000
  else if (maxExtent > 1000) scale = 2000
  else if (maxExtent > 500) scale = 1000
  else scale = 500
  
  // Calculate required map size in mm at this scale
  const mapWidthMm = (extentWidth / scale) * 1000
  const mapHeightMm = (extentHeight / scale) * 1000
  
  // Add space for overlays and margins
  const totalWidthNeeded = mapWidthMm + 200 + 200  // Left overlays + right margin
  const totalHeightNeeded = mapHeightMm + 100 + 100  // Top/bottom space
  
  console.log('[SheetSizeCalc] 📐 Extent:', extentWidth.toFixed(1) + 'm × ' + extentHeight.toFixed(1) + 'm')
  console.log('[SheetSizeCalc] 📐 Scale:', '1:' + scale)
  console.log('[SheetSizeCalc] 📐 Map size needed:', mapWidthMm.toFixed(1) + 'mm × ' + mapHeightMm.toFixed(1) + 'mm')
  console.log('[SheetSizeCalc] 📐 Total size needed:', totalWidthNeeded.toFixed(1) + 'mm × ' + totalHeightNeeded.toFixed(1) + 'mm')
  
  // Select sheet size (SI 727 Section 62(1) landscape)
  // SI727_500x400: 500×400mm, SI727_800x500: 800×500mm, SI727_1000x800: 1000×800mm
  if (totalWidthNeeded > SHEET_SIZES.SI727_800x500.width || totalHeightNeeded > SHEET_SIZES.SI727_800x500.height) {
    console.log('[SheetSizeCalc] ✅ Selected: SI727_1000x800 (1000×800mm)')
    return 'SI727_1000x800'
  }
  if (totalWidthNeeded > SHEET_SIZES.SI727_500x400.width || totalHeightNeeded > SHEET_SIZES.SI727_500x400.height) {
    console.log('[SheetSizeCalc] ✅ Selected: SI727_800x500 (800×500mm)')
    return 'SI727_800x500'
  }
  console.log('[SheetSizeCalc] ✅ Selected: SI727_500x400 (500×400mm)')
  return 'SI727_500x400'
}

function parseScaleDenominator(scale: string): number | null {
  const m = (scale || '').match(/1\s*:\s*(\d+)/)
  if (!m) return null
  const denom = Number(m[1])
  return Number.isFinite(denom) && denom > 0 ? denom : null
}

/**
 * Parcel geometry analysis result
 */
export interface ParcelGeometryAnalysis {
  minWidth: number;       // Minimum width in meters (ground distance)
  minHeight: number;      // Minimum height in meters
  aspectRatio: number;    // Ratio of longest to shortest dimension
  area: number;           // Area in square meters
  isNarrow: boolean;      // Aspect ratio > 2.5
  isVeryNarrow: boolean;  // Aspect ratio > 4
  standNumber: string;    // Stand/parcel identifier
  shortestEdge: number;   // Length of shortest edge in meters
  edgeCount: number;      // Number of edges
}

/**
 * Scale calculation result based on label clearance
 */
export interface LabelClearanceScaleResult {
  minScaleForLabels: number;      // Minimum scale denominator for label clearance
  minScaleForEdges: number;       // Minimum scale for edge labeling
  criticalParcel: ParcelGeometryAnalysis | null;  // The parcel constraining the scale
  criticalEdgeParcel: ParcelGeometryAnalysis | null;  // The parcel with shortest edge
  labelConstraints: {
    standLabelHeight: number;     // mm needed for stand number
    edgeLabelHeight: number;      // mm needed for edge labels
    minClearance: number;         // mm minimum clearance between labels
    totalMinWidth: number;        // mm total minimum parcel width on paper
    minEdgeLength: number;        // mm minimum edge length for full labeling
  };
}

/**
 * Analyze parcel geometry from GeoJSON coordinates
 * Returns minimum dimensions needed for label clearance calculation
 */
export function analyzeParcelGeometryForLabeling(
  coordinates: number[][],
  standNumber: string
): ParcelGeometryAnalysis {
  if (!coordinates || coordinates.length < 3) {
    return {
      minWidth: 0,
      minHeight: 0,
      aspectRatio: 1,
      area: 0,
      isNarrow: false,
      isVeryNarrow: false,
      standNumber,
      shortestEdge: 0,
      edgeCount: 0
    };
  }

  // Calculate bounding box (Cape Lo coordinates are in meters)
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  coordinates.forEach(coord => {
    const [y, x] = coord; // Cape Lo: Y (northing), X (easting)
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  });

  const width = maxX - minX;   // East-West extent in meters
  const height = maxY - minY;  // North-South extent in meters
  const minDim = Math.min(width, height);
  const maxDim = Math.max(width, height);
  const aspectRatio = maxDim / (minDim || 1);

  // Calculate area using shoelace formula
  let area = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    area += (coordinates[i][1] * coordinates[i + 1][0]) - (coordinates[i + 1][1] * coordinates[i][0]);
  }
  area = Math.abs(area) / 2;

  // Calculate edge lengths and find the shortest edge
  let shortestEdge = Infinity;
  const edgeCount = coordinates.length - 1; // Last coord is usually same as first (closed polygon)
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [y1, x1] = coordinates[i];
    const [y2, x2] = coordinates[i + 1];
    const edgeLength = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2);
    if (edgeLength > 0 && edgeLength < shortestEdge) {
      shortestEdge = edgeLength;
    }
  }
  
  // Handle case where no valid edges found
  if (shortestEdge === Infinity) {
    shortestEdge = 0;
  }

  return {
    minWidth: minDim,
    minHeight: maxDim,
    aspectRatio,
    area,
    isNarrow: aspectRatio > 2.5,
    isVeryNarrow: aspectRatio > 4,
    standNumber,
    shortestEdge,
    edgeCount
  };
}

/**
 * Calculate minimum scale required for clear parcel labeling without collisions
 * 
 * LABEL REQUIREMENTS (based on SI 727 and field readability):
 * - Stand number: min 4pt (~1.4mm height), typically 6-8pt
 * - Edge labels (distance + bearing): min 3pt each (~1mm), need ~3mm total per edge
 * - Minimum clearance between labels: 1mm
 * - Buffer from parcel boundary: 1mm each side
 * 
 * For a parcel to be clearly labeled, its narrowest dimension on paper must accommodate:
 * - 2mm boundary buffer (1mm each side)
 * - 3mm for edge label on one side
 * - 1.5mm clearance
 * - 1.5mm stand number (minimum)
 * - 1.5mm clearance  
 * - 3mm for edge label on other side
 * = ~12.5mm minimum parcel width on paper for standard labeling
 * 
 * For very narrow parcels, we can use compact labeling (8mm minimum)
 */
export function calculateMinScaleForLabelClearance(
  parcels: Array<{ coordinates: number[][]; stand: string; designation?: string }>,
  options: {
    labelMode?: 'standard' | 'compact' | 'minimal';
    allowInsets?: boolean;
  } = {}
): LabelClearanceScaleResult {
  const { labelMode = 'standard', allowInsets = false } = options;

  // Label dimension requirements in mm (on paper)
  // Edge label = distance (e.g., "25.45m" ~8mm) + bearing (e.g., "N 45°30'15" E" ~18mm)
  // Labels are stacked vertically along the edge, so edge must be long enough to fit both
  const labelConstraints = {
    standLabelHeight: labelMode === 'minimal' ? 1.2 : (labelMode === 'compact' ? 1.5 : 2.0),
    edgeLabelHeight: labelMode === 'minimal' ? 1.5 : (labelMode === 'compact' ? 2.0 : 3.0),
    minClearance: labelMode === 'minimal' ? 0.5 : (labelMode === 'compact' ? 0.8 : 1.0),
    totalMinWidth: 0,  // Will be calculated
    // Minimum edge length to fit stacked distance + bearing labels
    // Distance label: ~8-10mm width at 3-4pt
    // Bearing label: ~15-18mm width at 3-4pt  
    // Plus clearance from vertices on each end
    minEdgeLength: labelMode === 'minimal' ? 12 : (labelMode === 'compact' ? 15 : 18)
  };

  // Calculate total minimum width needed on paper for parcel interior
  // Format: buffer + edge + clearance + stand + clearance + edge + buffer
  labelConstraints.totalMinWidth = 
    1.0 +  // Left buffer from boundary
    labelConstraints.edgeLabelHeight +
    labelConstraints.minClearance +
    labelConstraints.standLabelHeight +
    labelConstraints.minClearance +
    labelConstraints.edgeLabelHeight +
    1.0;   // Right buffer from boundary

  console.log(`[LabelScale] 📏 Label mode: ${labelMode}`);
  console.log(`[LabelScale] 📏 Min parcel width on paper: ${labelConstraints.totalMinWidth.toFixed(1)}mm`);
  console.log(`[LabelScale] 📏 Min edge length on paper: ${labelConstraints.minEdgeLength.toFixed(1)}mm`);

  // Analyze all parcels to find:
  // 1. The smallest/narrowest parcel (for interior label clearance)
  // 2. The shortest edge across all parcels (for edge label clearance)
  let criticalParcel: ParcelGeometryAnalysis | null = null;
  let criticalEdgeParcel: ParcelGeometryAnalysis | null = null;
  let smallestMinDimension = Infinity;
  let shortestEdgeOverall = Infinity;

  for (const parcel of parcels) {
    // Skip outside figure parcels
    const designation = parcel.designation?.toLowerCase() || '';
    const stand = parcel.stand?.toLowerCase() || '';
    if (designation.includes('outside figure') || stand.includes('outside figure')) {
      continue;
    }

    const analysis = analyzeParcelGeometryForLabeling(parcel.coordinates, parcel.stand);
    
    // Check for narrowest parcel
    if (analysis.minWidth > 0 && analysis.minWidth < smallestMinDimension) {
      smallestMinDimension = analysis.minWidth;
      criticalParcel = analysis;
    }
    
    // Check for shortest edge
    if (analysis.shortestEdge > 0 && analysis.shortestEdge < shortestEdgeOverall) {
      shortestEdgeOverall = analysis.shortestEdge;
      criticalEdgeParcel = analysis;
    }
  }

  if (!criticalParcel || smallestMinDimension === Infinity) {
    console.log('[LabelScale] ⚠️ No valid parcels found for analysis');
    return {
      minScaleForLabels: 1000,  // Default fallback
      minScaleForEdges: 1000,
      criticalParcel: null,
      criticalEdgeParcel: null,
      labelConstraints
    };
  }

  // CONSTRAINT 1: Parcel interior labeling
  // Calculate minimum scale for the smallest parcel's minimum dimension to print at totalMinWidth mm
  const minScaleForLabels = Math.ceil(
    (smallestMinDimension * 1000) / labelConstraints.totalMinWidth
  );

  // CONSTRAINT 2: Edge labeling
  // Calculate minimum scale for the shortest edge to print at minEdgeLength mm
  let minScaleForEdges = 0;
  if (shortestEdgeOverall > 0 && shortestEdgeOverall < Infinity) {
    minScaleForEdges = Math.ceil(
      (shortestEdgeOverall * 1000) / labelConstraints.minEdgeLength
    );
  }

  console.log(`[LabelScale] 📐 Critical parcel (narrowest): ${criticalParcel.standNumber}`);
  console.log(`[LabelScale] 📐 Narrowest dimension: ${smallestMinDimension.toFixed(2)}m → scale ≥ 1:${minScaleForLabels}`);
  
  if (criticalEdgeParcel) {
    console.log(`[LabelScale] 📐 Critical parcel (shortest edge): ${criticalEdgeParcel.standNumber}`);
    console.log(`[LabelScale] 📐 Shortest edge: ${shortestEdgeOverall.toFixed(2)}m → scale ≥ 1:${minScaleForEdges}`);
  }

  // If parcel is extremely narrow (aspect > 6), suggest inset
  if (criticalParcel.aspectRatio > 6 && !allowInsets) {
    console.log(`[LabelScale] ⚠️ Parcel ${criticalParcel.standNumber} is extremely narrow (${criticalParcel.aspectRatio.toFixed(1)}:1)`);
    console.log(`[LabelScale] 💡 Consider using insets for this parcel`);
  }

  // Return the more restrictive of the two constraints
  const combinedMinScale = Math.max(minScaleForLabels, minScaleForEdges);
  console.log(`[LabelScale] 📊 Combined min scale (parcel + edge): 1:${combinedMinScale}`);

  return {
    minScaleForLabels: combinedMinScale,  // Return the combined constraint
    minScaleForEdges,
    criticalParcel,
    criticalEdgeParcel,
    labelConstraints
  };
}


/**
 * Maximum (largest) denominator allowed per plan type.
 *
 * The old SI 727 Reg 32(3) rule that capped general-developed plans at 1:500
 * (an area-majority mandate that was removed server-side) now applies to NO
 * plan type: the app auto-selects the scale that fits the sheet and keeps the
 * narrowest stand legible, and multi-sheet tiling is deferred. Keeping the
 * table with Infinity means no automatic ceiling is ever applied.
 */
export const SI727_MAX_DENOMINATOR: Record<string, number> = {
  'general-developed': Infinity,
  'general-undeveloped': Infinity,
  'diagram': Infinity,
  'working-plan': Infinity,
}

function niceNumberFloor(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const exponent = Math.floor(Math.log10(value))
  const pow = Math.pow(10, exponent)
  const fraction = value / pow
  const niceFraction = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1
  return niceFraction * pow
}


/**
 * Draw margin guides for print alignment (SI 727 compliant)
 */
function drawMarginGuides(pdf: jsPDF, pageWidth: number, pageHeight: number) {
  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.1)
  pdf.setLineDash([2, 2])
  
  // Left margin (50mm)
  pdf.line(MARGINS.left, 0, MARGINS.left, pageHeight)
  // Right margin (150mm - for endorsements)
  pdf.line(pageWidth - MARGINS.right, 0, pageWidth - MARGINS.right, pageHeight)
  // Top margin (50mm)
  pdf.line(0, MARGINS.top, pageWidth, MARGINS.top)
  // Bottom margin (50mm)
  pdf.line(0, pageHeight - MARGINS.bottom, pageWidth, pageHeight - MARGINS.bottom)
  
  pdf.setLineDash([]) // Reset
  
  // Add margin labels (small, gray text)
  pdf.setFontSize(6)
  pdf.setTextColor(150, 150, 150)
  pdf.text(`${MARGINS.left}mm`, MARGINS.left + 2, 10)
  pdf.text(`${MARGINS.right}mm`, pageWidth - MARGINS.right + 2, 10)
  pdf.text(`${MARGINS.top}mm`, 5, MARGINS.top - 2)
  pdf.text(`${MARGINS.bottom}mm`, 5, pageHeight - MARGINS.bottom + 4)
  pdf.setTextColor(0, 0, 0) // Reset to black
}

/**
 * Compress an array of stand name strings into compact range notation.
 * e.g. ["131","133","134","135","136"] → "131, 133 - 136"
 */
function formatStandRanges(standNames: string[]): string {
  if (!standNames || standNames.length === 0) return ''
  const numeric: number[] = []
  const nonNumeric: string[] = []
  for (const name of standNames) {
    const n = parseInt(name, 10)
    if (!isNaN(n) && String(n) === name.trim()) {
      numeric.push(n)
    } else {
      nonNumeric.push(name)
    }
  }
  numeric.sort((a, b) => a - b)
  const parts: string[] = []
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

/**
 * Draw professional title block (SI 727 compliant)
 */
function drawTitleBlock(pdf: jsPDF, data: SurveyPlanData, area: any) {
  const centerX = area.centerX
  let y = area.y
  const scale = getTitleBlockFontScale(pdf)
  const titleSize = Math.round(FONTS.title.size * scale)
  const subtitleSize = Math.round(FONTS.subtitle.size * scale)
  const designationSize = Math.round(14 * scale)
  const bodySize = Math.round(FONTS.body.size * scale)
  const smallSize = Math.round(FONTS.small.size * scale)
  const lineGapTight = 5 * scale
  const lineGapNormal = 6 * scale
  const lineGapLoose = 8 * scale
  
  // Main title
  pdf.setFont(FONTS.title.family, FONTS.title.weight)
  pdf.setFontSize(titleSize)
  pdf.text('"GENERAL PLAN"', centerX, y, { align: 'center' })
  y += lineGapLoose
  
  // "of"
  pdf.setFont(FONTS.subtitle.family, FONTS.subtitle.weight)
  pdf.setFontSize(subtitleSize)
  pdf.text('of', centerX, y, { align: 'center' })
  y += lineGapNormal
  
  // Designation — dynamic stand numbers from actual parcels + user's township description
  pdf.setFont(FONTS.title.family, FONTS.title.weight)
  pdf.setFontSize(designationSize)
  const surveyedStands = data.parcels
    .filter(p => !p.stand.toLowerCase().includes('outside figure'))
    .map(p => p.stand)
  const dynamicStandList = formatStandRanges(surveyedStands)
  const rawSurveyOf = (data.projectInfo.surveyOf || '').trim()
  const surveyOf = rawSurveyOf.replace(/^Stands?\s+[\d,\s\-–]+/i, '').trim()
  const designation = (dynamicStandList
    ? (surveyOf ? `Stands ${dynamicStandList} ${surveyOf}` : `Stands ${dynamicStandList}`)
    : (data.projectInfo.designation || '').trim()).toUpperCase()
  const maxWidth = Math.max(10, area.width * 0.92)
  const designationLines = pdf.splitTextToSize(designation, maxWidth)
  for (const line of designationLines) {
    pdf.text(line, centerX, y, { align: 'center' })
    y += lineGapTight
  }
  y += (lineGapLoose - lineGapTight)
  
  // Description block — SI 727 Seventh Schedule (b) format
  pdf.setFont(FONTS.body.family, FONTS.body.weight)
  pdf.setFontSize(bodySize)

  // Build the outside-figure point sequence for the loop notation: M4, M5, M6, M7, M8, M9, M4
  const ofEdges = data.outsideFigureData?.edges ?? []
  const startPointId = data.outsideFigureData?.constants?.pointId
    || ofEdges[0]?.pointId
    || 'N1'
  // Collect all point IDs in order from edges, then close with the start point
  const allPointIds: string[] = ofEdges.map(e => e.pointId).filter(Boolean)
  const figureLoop = allPointIds.length > 0
    ? `${allPointIds.join(', ')}, ${allPointIds[0]}`
    : `${startPointId}`

  // Count actual surveyed stands (exclude Outside Figure parcel)
  const surveyedStandCount = data.parcels.filter(p =>
    !p.stand.toLowerCase().includes('outside figure')
  ).length

  // Convert ALL-CAPS stored values to title case (e.g. "MAGLAS" → "Maglas")
  const toTitleCase = (s: string) =>
    s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

  const townshipName = data.projectInfo.township
    ? `${toTitleCase(data.projectInfo.township)} Township`
    : 'the Township'
  const parentProperty = data.projectInfo.parentProperty
    ? toTitleCase(data.projectInfo.parentProperty)
    : ''
  const wholePortion = data.projectInfo.wholePortion || 'the whole'
  const districtName = data.projectInfo.district || 'District'

  // Stand range from actual parcel stand numbers (already computed above as dynamicStandList)
  const standRange = formatStandRanges(surveyedStands)

  // "of X" = "of Maglas Township of Shabani Mine Surface Rights A" when parentProperty is set
  const ofTarget = parentProperty
    ? `${townshipName} of ${parentProperty}`
    : townshipName

  // Build the full description as a single wrapped block (SI 727 Seventh Schedule (b))
  const standPlural = surveyedStandCount !== 1 ? 's' : ''
  const numberedClause = standRange ? ` numbered ${standRange}` : ''
  const descriptionText =
    `The figure ${figureLoop} represents ${townshipName} comprising ` +
    `${surveyedStandCount} stand${standPlural}${numberedClause} and public places ` +
    `being ${wholePortion} of ${ofTarget}, ` +
    `situate in the district of ${districtName}.`

  const descLines = pdf.splitTextToSize(descriptionText, Math.max(10, area.width * 0.92))
  for (const line of descLines) {
    pdf.text(line, centerX, y, { align: 'center' })
    y += lineGapTight
  }
  y += (lineGapLoose - lineGapTight)

  // References
  pdf.setFontSize(smallSize)
  pdf.text('Vide diagram S.G. No. ..................... annexed to .....................', centerX, y, { align: 'center' })
  y += (4 * scale)
  pdf.text('No. ............................', centerX, y, { align: 'center' })
}

/**
 * Rectangle interface for collision detection
 */
interface Rectangle {
  x: number
  y: number
  width: number
  height: number
  id?: string
  priority?: number
}

/**
 * Check if two rectangles overlap
 */
function rectanglesOverlap(rect1: Rectangle, rect2: Rectangle): boolean {
  return !(
    rect1.x + rect1.width <= rect2.x ||  // rect1 is left of rect2
    rect1.x >= rect2.x + rect2.width ||  // rect1 is right of rect2
    rect1.y + rect1.height <= rect2.y || // rect1 is above rect2
    rect1.y >= rect2.y + rect2.height    // rect1 is below rect2
  )
}

/**
 * Calculate minimum distance to move rect1 to avoid collision with rect2
 */
function calculateAvoidanceVector(rect1: Rectangle, rect2: Rectangle): { dx: number; dy: number; distance: number } {
  if (!rectanglesOverlap(rect1, rect2)) {
    return { dx: 0, dy: 0, distance: 0 }
  }

  // Calculate overlap amounts in each direction
  const overlapLeft = (rect1.x + rect1.width) - rect2.x
  const overlapRight = (rect2.x + rect2.width) - rect1.x
  const overlapTop = (rect1.y + rect1.height) - rect2.y
  const overlapBottom = (rect2.y + rect2.height) - rect1.y

  // Find minimum overlap direction
  const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom)

  if (minOverlap === overlapLeft) {
    return { dx: -overlapLeft - 5, dy: 0, distance: overlapLeft }
  } else if (minOverlap === overlapRight) {
    return { dx: overlapRight + 5, dy: 0, distance: overlapRight }
  } else if (minOverlap === overlapTop) {
    return { dx: 0, dy: -overlapTop - 5, distance: overlapTop }
  } else {
    return { dx: 0, dy: overlapBottom + 5, distance: overlapBottom }
  }
}

/**
 * Find a collision-free position for a rectangle within bounds
 */
function findCollisionFreePosition(
  rect: Rectangle,
  existingRects: Rectangle[],
  bounds: Rectangle,
  preferredPositions: Array<{ x: number; y: number }>
): Rectangle | null {
  // Try preferred positions first
  for (const pos of preferredPositions) {
    const testRect = { ...rect, x: pos.x, y: pos.y }
    
    // Check if within bounds
    if (testRect.x < bounds.x || testRect.y < bounds.y ||
        testRect.x + testRect.width > bounds.x + bounds.width ||
        testRect.y + testRect.height > bounds.y + bounds.height) {
      continue
    }
    
    // Check for collisions
    const hasCollision = existingRects.some(existing => rectanglesOverlap(testRect, existing))
    if (!hasCollision) {
      return testRect
    }
  }

  // If no preferred position works, try iterative adjustment
  let testRect = { ...rect }
  let attempts = 0
  const maxAttempts = 50

  while (attempts < maxAttempts) {
    const collisions = existingRects.filter(existing => rectanglesOverlap(testRect, existing))
    
    if (collisions.length === 0) {
      // Check bounds
      if (testRect.x >= bounds.x && testRect.y >= bounds.y &&
          testRect.x + testRect.width <= bounds.x + bounds.width &&
          testRect.y + testRect.height <= bounds.y + bounds.height) {
        return testRect
      }
    }

    // Move away from collisions
    if (collisions.length > 0) {
      const avoidance = calculateAvoidanceVector(testRect, collisions[0])
      testRect.x += avoidance.dx
      testRect.y += avoidance.dy
    } else {
      // Out of bounds, try to move back in
      if (testRect.x < bounds.x) testRect.x = bounds.x + 5
      if (testRect.y < bounds.y) testRect.y = bounds.y + 5
      if (testRect.x + testRect.width > bounds.x + bounds.width) {
        testRect.x = bounds.x + bounds.width - testRect.width - 5
      }
      if (testRect.y + testRect.height > bounds.y + bounds.height) {
        testRect.y = bounds.y + bounds.height - testRect.height - 5
      }
    }

    attempts++
  }

  return null // Could not find collision-free position
}

/**
 * Calculate optimal layout for all elements
 * SI 727 Standard: Map area is the primary container, all blocks (except endorsements) are within it
 */
function calculateOptimalLayout(
  pdf: jsPDF,
  data: SurveyPlanData,
  workingArea: any,
  pageWidth: number,
  pageHeight: number
) {
  const SPACING = 5 // Minimum spacing between elements
  
  // 1. Calculate Map Area FIRST (primary container for all elements except endorsements)
  const mapArea = {
    x: workingArea.x,
    y: workingArea.y,
    width: workingArea.width,
    height: workingArea.height
  }
  
  // Track placed blocks for collision detection
  const placedBlocks: Rectangle[] = []
  
  // 2. Title block (PRIORITY 1 - top center/right, fixed position)
  const titleHeight = 45
  const titleWidth = Math.min(200, mapArea.width * 0.4)
  const titleBlock = {
    x: mapArea.x + mapArea.width - titleWidth - SPACING,
    y: mapArea.y + SPACING,
    width: titleWidth,
    height: titleHeight,
    centerX: mapArea.x + mapArea.width - titleWidth / 2 - SPACING,
    id: 'title',
    priority: 1
  }
  placedBlocks.push(titleBlock)
  
  // 3. North Arrow (PRIORITY 2 - top right, fixed position)
  const northArrowSize = 25
  const northArrowPreferred = [
    { x: mapArea.x + mapArea.width - northArrowSize - SPACING * 2, y: titleBlock.y + titleBlock.height + SPACING },
    { x: mapArea.x + mapArea.width - northArrowSize - SPACING, y: mapArea.y + SPACING },
    { x: mapArea.x + SPACING, y: mapArea.y + SPACING }
  ]
  const northArrowRect = findCollisionFreePosition(
    { x: 0, y: 0, width: northArrowSize, height: northArrowSize, id: 'northArrow', priority: 2 },
    placedBlocks,
    mapArea,
    northArrowPreferred
  )
  const northArrowArea = northArrowRect || { ...northArrowPreferred[0], width: northArrowSize, height: northArrowSize, id: 'northArrow', priority: 2 }
  placedBlocks.push(northArrowArea)
  
  // 4. Schedule of Areas (PRIORITY 3 - left side, dynamic positioning)
  const scheduleWidth = 80
  const surveyedParcelCount = data.parcels.filter(p => 
    !p.stand.toLowerCase().includes('outside figure')
  ).length
  const maxScheduleHeight = mapArea.height * 0.3
  const scheduleHeight = Math.min(surveyedParcelCount * 8 + 20, maxScheduleHeight)
  
  const schedulePreferred = [
    { x: mapArea.x + SPACING, y: titleBlock.y + titleBlock.height + SPACING },
    { x: mapArea.x + SPACING, y: mapArea.y + SPACING },
    { x: mapArea.x + SPACING, y: mapArea.y + mapArea.height * 0.2 }
  ]
  const scheduleRect = findCollisionFreePosition(
    { x: 0, y: 0, width: scheduleWidth, height: scheduleHeight, id: 'schedule', priority: 3 },
    placedBlocks,
    mapArea,
    schedulePreferred
  )
  const scheduleArea = scheduleRect || { ...schedulePreferred[0], width: scheduleWidth, height: scheduleHeight, id: 'schedule', priority: 3 }
  placedBlocks.push(scheduleArea)
  
  // 5. Outside Figure Data (PRIORITY 4 - left side, dynamic positioning)
  let outsideFigureArea = null
  if (data.outsideFigureData) {
    const ofWidth = 120
    const maxOFHeight = mapArea.height * 0.4
    const ofHeight = Math.min(data.outsideFigureData.edges.length * 5 + 25, maxOFHeight)
    
    const ofPreferred = [
      { x: mapArea.x + SPACING, y: scheduleArea.y + scheduleArea.height + SPACING },
      { x: mapArea.x + SPACING, y: mapArea.y + mapArea.height * 0.35 },
      { x: mapArea.x + scheduleWidth + SPACING * 2, y: mapArea.y + SPACING }
    ]
    const ofRect = findCollisionFreePosition(
      { x: 0, y: 0, width: ofWidth, height: ofHeight, id: 'outsideFigure', priority: 4 },
      placedBlocks,
      mapArea,
      ofPreferred
    )
    outsideFigureArea = ofRect || { ...ofPreferred[0], width: ofWidth, height: ofHeight, id: 'outsideFigure', priority: 4 }
    if (outsideFigureArea) {
      placedBlocks.push(outsideFigureArea)
    }
  }
  
  // 6. Beacon Description (PRIORITY 5 - bottom left, dynamic positioning)
  const beaconWidth = 100
  const maxBeaconHeight = mapArea.height * 0.15
  const beaconHeight = Math.min(data.beaconGroups.length * 10 + 15, maxBeaconHeight)
  
  const beaconPreferred = [
    { x: mapArea.x + SPACING, y: mapArea.y + mapArea.height - beaconHeight - SPACING },
    { x: mapArea.x + SPACING, y: mapArea.y + mapArea.height * 0.6 },
    { x: mapArea.x + scheduleWidth + SPACING * 2, y: mapArea.y + mapArea.height - beaconHeight - SPACING }
  ]
  const beaconRect = findCollisionFreePosition(
    { x: 0, y: 0, width: beaconWidth, height: beaconHeight, id: 'beacon', priority: 5 },
    placedBlocks,
    mapArea,
    beaconPreferred
  )
  const beaconArea = beaconRect || { ...beaconPreferred[0], width: beaconWidth, height: beaconHeight, id: 'beacon', priority: 5 }
  placedBlocks.push(beaconArea)
  
  // 7. Survey Statement (PRIORITY 6 - bottom center, dynamic positioning)
  const surveyStatementWidth = 80
  const surveyStatementHeight = 30
  
  const surveyPreferred = [
    { x: beaconArea.x + beaconArea.width + SPACING * 2, y: mapArea.y + mapArea.height - surveyStatementHeight - SPACING },
    { x: mapArea.x + (mapArea.width - surveyStatementWidth) / 2, y: mapArea.y + mapArea.height - surveyStatementHeight - SPACING },
    { x: mapArea.x + mapArea.width * 0.3, y: mapArea.y + mapArea.height - surveyStatementHeight - SPACING }
  ]
  const surveyRect = findCollisionFreePosition(
    { x: 0, y: 0, width: surveyStatementWidth, height: surveyStatementHeight, id: 'survey', priority: 6 },
    placedBlocks,
    mapArea,
    surveyPreferred
  )
  const surveyStatementArea = surveyRect || { ...surveyPreferred[0], width: surveyStatementWidth, height: surveyStatementHeight, id: 'survey', priority: 6 }
  placedBlocks.push(surveyStatementArea)
  
  // 8. Scale Bar (PRIORITY 7 - bottom right, dynamic positioning)
  const scaleBarWidth = 60
  const scaleBarHeight = 20
  
  const scalePreferred = [
    { x: mapArea.x + mapArea.width - scaleBarWidth - SPACING, y: mapArea.y + mapArea.height - scaleBarHeight - SPACING },
    { x: mapArea.x + mapArea.width - scaleBarWidth - SPACING, y: mapArea.y + mapArea.height - scaleBarHeight - SPACING * 3 },
    { x: mapArea.x + mapArea.width * 0.7, y: mapArea.y + mapArea.height - scaleBarHeight - SPACING }
  ]
  const scaleRect = findCollisionFreePosition(
    { x: 0, y: 0, width: scaleBarWidth, height: scaleBarHeight, id: 'scale', priority: 7 },
    placedBlocks,
    mapArea,
    scalePreferred
  )
  const scaleBarArea = scaleRect || { ...scalePreferred[0], width: scaleBarWidth, height: scaleBarHeight, id: 'scale', priority: 7 }
  placedBlocks.push(scaleBarArea)
  
  // 9. Endorsement Area (OUTSIDE map area, in right margin - no collision detection needed)
  const endorsementWidth = MARGINS.right
  const endorsementHeight = 150
  const endorsementArea = {
    x: mapArea.x + mapArea.width,
    y: mapArea.y,
    width: endorsementWidth,
    height: endorsementHeight
  }
  
  // Validate layout and detect collisions
  const collisionCount = placedBlocks.reduce((count, block1, i) => {
    return count + placedBlocks.slice(i + 1).filter(block2 => rectanglesOverlap(block1, block2)).length
  }, 0)
  
  console.log('[ProfessionalExporter] 📐 Smart Layout Validation:')
  console.log(`  - Total blocks placed: ${placedBlocks.length}`)
  console.log(`  - Collision count: ${collisionCount}`)
  console.log(`  - Map area: ${mapArea.width.toFixed(1)}mm × ${mapArea.height.toFixed(1)}mm`)
  
  if (collisionCount > 0) {
    console.warn('[ProfessionalExporter] ⚠️ WARNING: Some blocks still have collisions!')
    console.warn('  Consider using a larger sheet size.')
  } else {
    console.log('[ProfessionalExporter] ✅ All blocks positioned without collisions')
  }
  
  // Log individual block positions for debugging
  placedBlocks.forEach(block => {
    console.log(`  - ${block.id}: (${block.x.toFixed(1)}, ${block.y.toFixed(1)}) ${block.width.toFixed(1)}×${block.height.toFixed(1)}mm`)
  })
  
  return {
    titleBlock,
    scheduleArea,
    outsideFigureArea,
    beaconArea,
    surveyStatementArea,
    scaleBarArea,
    northArrowArea,
    endorsementArea,
    mapArea
  }
}

/**
 * Draw map image (centered and scaled within map area)
 */
function drawMapImage(pdf: jsPDF, mapImageData: string, mapArea: any) {
  if (!mapImageData) {
    console.warn('[ProfessionalExporter] ⚠️ No map image data provided')
    return
  }
  
  try {
    // Add map image centered within map area
    // Leave some padding for overlays
    const padding = 5
    pdf.addImage(
      mapImageData,
      'PNG',
      mapArea.x + padding,
      mapArea.y + padding,
      mapArea.width - (padding * 2),
      mapArea.height - (padding * 2)
    )
    
    console.log('[ProfessionalExporter] ✅ Map image drawn')
  } catch (error) {
    console.error('[ProfessionalExporter] ❌ Failed to draw map image:', error)
  }
}

/**
 * Draw map area border (primary container for all elements except endorsements)
 * SI 727 Standard: This border defines the figure boundary
 */
function drawMapBorder(pdf: jsPDF, mapArea: any) {
  // 1. Draw map border FIRST (bold line to define primary container)
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(1.5) // Bold line to define primary container
  pdf.rect(mapArea.x, mapArea.y, mapArea.width, mapArea.height)
  
  console.log('[ProfessionalExporter] Map border drawn:', 
    `${mapArea.width.toFixed(1)}mm × ${mapArea.height.toFixed(1)}mm`)
}

/**
 * Draw Schedule of Areas (professional table)
 */
function drawScheduleOfAreas(pdf: jsPDF, parcels: any[], area: any) {
  const x = area.x
  const y = area.y
  
  // Title - larger and bolder
  pdf.setFont(FONTS.body.family, 'bold')
  pdf.setFontSize(11)  // Increased from 10pt
  pdf.text('SCHEDULE OF AREAS', x, y - 2)
  
  // Filter out Outside Figure parcel from schedule
  console.log('[Schedule] All parcels:', parcels.map(p => ({ stand: p.stand, designation: p.designation })))
  const surveyedParcels = parcels.filter(p => {
    const stand = (p.stand || '').toLowerCase()
    const designation = (p.designation || '').toLowerCase()
    const isOutsideFigure = stand.includes('outside figure') || designation.includes('outside figure')
    if (isOutsideFigure) {
      console.log('[Schedule] Filtering out:', { stand: p.stand, designation: p.designation })
    }
    return !isOutsideFigure
  })
  console.log('[Schedule] Surveyed parcels after filter:', surveyedParcels.length, 'of', parcels.length)

  // Prevent autoTable from spilling to a new page (which would break the overall single-sheet layout)
  // by limiting the number of rows to what fits inside the allocated area.
  const headerAndTitleMm = 3 + 6 // title offset + header height (approx)
  const availableMm = Math.max(0, area.height - headerAndTitleMm)
  const approxRowMm = 6
  const maxRows = Math.max(1, Math.floor(availableMm / approxRowMm))
  const rowsToRender = surveyedParcels.slice(0, maxRows)
  
  // Table
  const tableData = rowsToRender.map(p => [
    p.stand,
    formatAreaM2(p.area_m2), // Use banker's rounding
    '', // Diagram Number
    '', // Deed Number
    '', // Deed Date
    ''  // Surveyor-General
  ])
  
  // Scale column widths to fit allocated area
  const totalColWidth = 15 + 18 + 12 + 12 + 10 + 8 // 75mm total
  const scale = Math.min(1, area.width / totalColWidth)
  
  autoTable(pdf, {
    startY: y + 3,
    head: [['STAND\nNo.', 'AREAS\nSQUARE\nMETRES', 'DIAGRAM\nNUMBER', 'DEED\nNUMBER', 'DEED\nDATE', 'SURVEYOR-\nGENERAL']],
    body: tableData,
    margin: { left: x },
    tableWidth: area.width,
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    styles: {
      fontSize: FONTS.table.size,
      cellPadding: 1,
      lineColor: [0, 0, 0],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 15 * scale, halign: 'center' },
      1: { cellWidth: 18 * scale, halign: 'right', font: 'courier' },
      2: { cellWidth: 12 * scale, halign: 'center' },
      3: { cellWidth: 12 * scale, halign: 'center' },
      4: { cellWidth: 10 * scale, halign: 'center' },
      5: { cellWidth: 8 * scale, halign: 'center' }
    }
  })
}

/**
 * Draw Survey Statement
 */
function drawSurveyStatement(pdf: jsPDF, data: SurveyPlanData, area: any) {
  const centerX = area.x + area.width / 2
  const y = area.y
  
  pdf.setFont(FONTS.body.family, FONTS.body.weight)
  pdf.setFontSize(FONTS.small.size)
  
  const statement = `Surveyed in ${new Date(data.projectInfo.surveyDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} by me`
  pdf.text(statement, centerX, y, { align: 'center' })
  
  // Signature box
  pdf.setLineWidth(0.3)
  pdf.rect(centerX - 40, y + 5, 80, 20)
  
  // Signatory line. Deliberately generic: the plan carries the surveyor's
  // ROLE, never their identity. Replaced surveyorName + '(Land Surveyor, Zim)'
  // + 'Lic. No: <n>', matching the backend generators (pdfkitGeoPDF.js and
  // dxfBottomZoneEmitter.js) so every plan-producing path agrees.
  pdf.setFont(FONTS.body.family, 'bold')
  pdf.setFontSize(10)
  pdf.text('Land Surveyor', centerX, y + 15, { align: 'center' })
}

/**
 * Draw North Arrow (field-optimized - 2x larger for visibility)
 */
function drawNorthArrow(pdf: jsPDF, area: any) {
  const centerX = area.x + area.width / 2
  const centerY = area.y + area.height / 2
  const arrowHeight = 30  // Doubled from 15mm for field visibility
  const arrowWidth = 12   // Doubled from 6mm
  
  pdf.setDrawColor(0, 0, 0)
  pdf.setFillColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  
  // Arrow shaft
  pdf.line(centerX, centerY + arrowHeight / 2, centerX, centerY - arrowHeight / 2)
  
  // Arrow head
  pdf.triangle(centerX, centerY - arrowHeight / 2, centerX - arrowWidth / 2, centerY + arrowHeight / 4, centerX + arrowWidth / 2, centerY + arrowHeight / 4, 'F')
  
  // "N" label
  pdf.setFont(FONTS.title.family, 'bold')
  pdf.setFontSize(14)
  pdf.text('N', centerX, centerY + arrowHeight / 2 + 10, { align: 'center' })
  pdf.text('NORTH', centerX, centerY + arrowHeight / 2 + 20, { align: 'center' })
}

/**
 * Draw Scale Bar (professional field-ready style with accuracy note)
 */
function drawScaleBar(pdf: jsPDF, scale: string, area: any) {
  const x = area.x
  const y = area.y
  
  // Parse scale (e.g., "1:1000")
  const scaleDenominator = parseScaleDenominator(scale) || 1000
  
  // Scale bar dimensions - enhanced for field visibility
  const barLength = 100 // mm on paper
  const barHeight = 8   // Increased from 5mm for better visibility
  const segments = 5
  const segmentWidth = barLength / segments
  
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.3)
  
  // Draw segments with bold borders
  pdf.setLineWidth(0.5)  // Bolder segment borders
  for (let i = 0; i < segments; i++) {
    const segX = x + i * segmentWidth
    
    // Alternating fill (high contrast for field visibility)
    if (i % 2 === 0) {
      pdf.setFillColor(0, 0, 0)
      pdf.setDrawColor(0, 0, 0)
      pdf.rect(segX, y, segmentWidth, barHeight, 'FD')  // Fill and draw
    } else {
      pdf.setFillColor(255, 255, 255)
      pdf.setDrawColor(0, 0, 0)
      pdf.rect(segX, y, segmentWidth, barHeight, 'FD')  // Fill and draw
    }
  }
  
  // Labels
  pdf.setFontSize(10)
  const halfMeters = Math.round(barLength / 2)
  pdf.text('0', x, y + 8, { align: 'center' })
  pdf.text(`${halfMeters}m`, x + barLength / 2, y + 8, { align: 'center' })
  pdf.text(`${barLength}m`, x + barLength, y + 8, { align: 'center' })
  
  pdf.text(scale, x + barLength / 2, y - 2, { align: 'center' })
  pdf.text('Scale accurate to ± 1mm', x + barLength / 2, y - 10, { align: 'center' })
}

/**
 * Draw Outside Figure Data table (SI 727 compliant)
 */
function drawOutsideFigureData(
  pdf: jsPDF,
  outsideFigureData: {
    edges: Array<{
      side: string
      distance: number
      direction: string
      pointId: string
      y: number
      x: number
    }>
    constants: {
      pointId: string
      y: number
      x: number
    }
  },
  centralMeridian: number,
  area: any
) {
  const x = area.x
  const y = area.y
  
  pdf.setFont(FONTS.body.family, 'bold')
  pdf.setFontSize(10)
  
  // Table headers
  const colWidths = {
    sides: 15,
    metres: 15,
    direction: 25,
    constants: 20,
    y: 22,
    x: 22
  }
  
  let currentY = y
  
  // Main headers
  pdf.text('OUTSIDE FIGURE DATA', x, currentY)
  pdf.text(`CO-ORDINATES`, x + colWidths.sides + colWidths.metres + colWidths.direction + colWidths.constants, currentY)
  currentY += 4
  
  // Sub-header for coordinates
  pdf.setFontSize(8)
  pdf.text(`System : Lo ${centralMeridian}°`, x + colWidths.sides + colWidths.metres + colWidths.direction + colWidths.constants, currentY)
  currentY += 4
  
  // Column headers
  pdf.setFont(FONTS.small.family, 'bold')
  pdf.setFontSize(8)
  pdf.text('SIDES', x, currentY)
  pdf.text('Metres', x + colWidths.sides, currentY)
  pdf.text('DIRECTION', x + colWidths.sides + colWidths.metres, currentY)
  pdf.text('Constants', x + colWidths.sides + colWidths.metres + colWidths.direction, currentY)
  pdf.text('Y', x + colWidths.sides + colWidths.metres + colWidths.direction + colWidths.constants, currentY)
  pdf.text('Metres', x + colWidths.sides + colWidths.metres + colWidths.direction + colWidths.constants, currentY + 3)
  pdf.text('X', x + colWidths.sides + colWidths.metres + colWidths.direction + colWidths.constants + colWidths.y, currentY)
  currentY += 6
  
  // Placeholder row
  pdf.setFont(FONTS.small.family, 'normal')
  pdf.text('+ 0.00', x + colWidths.sides + colWidths.metres + colWidths.direction + colWidths.constants, currentY)
  pdf.text('+ 0.00', x + colWidths.sides + colWidths.metres + colWidths.direction + colWidths.constants + colWidths.y, currentY)
  currentY += 4
  
  // Data rows
  outsideFigureData.edges.forEach((edge) => {
    pdf.text(edge.side, x, currentY)
    
    // Center-justify Metres column
    const metresText = edge.distance.toFixed(2)
    const metresWidth = pdf.getTextWidth(metresText)
    const metresX = x + colWidths.sides + (colWidths.metres - metresWidth) / 2
    pdf.text(metresText, metresX, currentY)
    
    // Left-justify DIRECTION column with 2.5mm from right edge
    const directionText = edge.direction
    const directionWidth = pdf.getTextWidth(directionText)
    const directionX = x + colWidths.sides + colWidths.metres + colWidths.direction - directionWidth - 2.5
    pdf.text(directionText, directionX, currentY)
    
    pdf.text(edge.pointId, x + colWidths.sides + colWidths.metres + colWidths.direction, currentY)
    
    // Format coordinates with + sign
    // Note: In Cape Lo, y=Westing (smaller ~96000), x=Southing (larger ~2247000)
    // Template shows Y column with smaller values, X column with larger values
    const yCoord = edge.y >= 0 ? `+ ${edge.y.toFixed(2)}` : `- ${Math.abs(edge.y).toFixed(2)}`
    const xCoord = edge.x >= 0 ? `+ ${edge.x.toFixed(2)}` : `- ${Math.abs(edge.x).toFixed(2)}`
    
    // Display: Y column gets y value (Westing ~96000), X column gets x value (Southing ~2247000)
    pdf.text(yCoord, x + colWidths.sides + colWidths.metres + colWidths.direction + colWidths.constants, currentY)
    pdf.text(xCoord, x + colWidths.sides + colWidths.metres + colWidths.direction + colWidths.constants + colWidths.y, currentY)
    currentY += 4
    
    // Prevent overflow
    if (currentY > area.y + area.height - 5) {
      return
    }
  })
}

/**
 * Draw beacon symbol (placed or found)
 */
function drawBeaconSymbol(pdf: jsPDF, x: number, y: number, type: 'placed' | 'found', size: number = 2) {
  const radius = size / 2
  
  // Draw outer circle
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  
  if (type === 'placed') {
    // Placed beacon: Empty circle ○
    pdf.setFillColor(255, 255, 255)
    pdf.circle(x, y, radius, 'FD')
  } else {
    // Found beacon: Circle with dot in center ⊙
    pdf.setFillColor(255, 255, 255)
    pdf.circle(x, y, radius, 'FD')
    // Draw center dot
    pdf.setFillColor(0, 0, 0)
    pdf.circle(x, y, radius * 0.35, 'F')
  }
}

/**
 * Draw Beacon Description with symbols
 */
function drawBeaconDescription(pdf: jsPDF, beaconGroups: any[], area: any) {
  const x = area.x
  const y = area.y
  
  pdf.setFont(FONTS.body.family, 'bold')
  pdf.setFontSize(FONTS.body.size)
  pdf.text('BEACON DESCRIPTION', x, y)
  
  let currentY = y + 5
  pdf.setFont(FONTS.small.family, FONTS.small.weight)
  pdf.setFontSize(FONTS.small.size)
  
  beaconGroups.forEach(group => {
    // Determine beacon type from the first beacon in the group
    const firstBeaconName = group.points.split(',')[0].trim()
    const beaconType = getBeaconType(firstBeaconName)
    
    // Draw beacon symbol
    const symbolX = x + 2
    const symbolY = currentY - 1
    drawBeaconSymbol(pdf, symbolX, symbolY, beaconType, 2.5)
    
    // Draw text with offset for symbol
    const text = `${group.points}: ${group.description}`
    const textX = x + 6  // Offset to make room for symbol
    const lines = pdf.splitTextToSize(text, 94)  // Reduce width to account for symbol
    lines.forEach((line: string) => {
      pdf.text(line, textX, currentY)
      currentY += 3.5
    })
  })
  
  // Add legend at the bottom
  currentY += 2
  pdf.setFont(FONTS.small.family, 'italic')
  pdf.setFontSize(FONTS.small.size - 0.5)
  
  // Placed symbol
  drawBeaconSymbol(pdf, x + 2, currentY - 1, 'placed', 2)
  pdf.text('Placed', x + 6, currentY)
  
  // Found symbol
  drawBeaconSymbol(pdf, x + 25, currentY - 1, 'found', 2)
  pdf.text('Found', x + 29, currentY)
}
/**
 * Draw grid references
 */
function drawGridReferences(pdf: jsPDF, workingArea: any) {
  pdf.setDrawColor(200, 200, 200)
  pdf.setLineWidth(0.05)
  pdf.setLineDash([1, 3])
  
  // Vertical grid lines (every 100mm)
  for (let x = workingArea.x; x <= workingArea.x + workingArea.width; x += 100) {
    pdf.line(x, workingArea.y, x, workingArea.y + workingArea.height)
  }
  
  // Horizontal grid lines (every 100mm)
  for (let y = workingArea.y; y <= workingArea.y + workingArea.height; y += 100) {
    pdf.line(workingArea.x, y, workingArea.x + workingArea.width, y)
  }
  
  pdf.setLineDash([])
}

/**
 * Draw endorsement area (right margin) - SI 727 compliant table format
 */
function drawEndorsementArea(pdf: jsPDF, area: any) {
  const x = area.x
  const y = area.y
  const width = area.width
  const height = area.height
  
  // Column widths
  const noColWidth = 15        // "No." column
  const statementColWidth = width * 0.50  // "STATEMENT" column (50%)
  const dateColWidth = width * 0.15       // "Date" column (15%)
  const sgColWidth = width * 0.35         // "Surveyor-General" column (35%)
  
  // Title section height
  const titleHeight = 15
  
  // Header row height
  const headerHeight = 10
  
  // Calculate row height for endorsement entries
  const availableHeight = height - titleHeight - headerHeight
  const rowHeight = availableHeight // Single large row for first entry
  
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.5)
  
  // Draw outer border (left and top only - no right or bottom)
  // Left border
  pdf.line(x, y, x, y + height)
  // Top border
  pdf.line(x, y, x + width, y)
  
  // Draw title section
  pdf.setFont(FONTS.body.family, 'bold')
  pdf.setFontSize(12)
  pdf.text('ENDORSEMENTS', x + width / 2, y + 10, { align: 'center' })
  
  // Draw horizontal line below title
  pdf.setLineWidth(0.3)
  pdf.line(x, y + titleHeight, x + width, y + titleHeight)
  
  // Draw header row
  const headerY = y + titleHeight
  
  // Header background (optional - can be removed for cleaner look)
  pdf.setFont(FONTS.small.family, 'bold')
  pdf.setFontSize(8)
  
  // Draw header text
  pdf.text('No.', x + noColWidth / 2, headerY + 7, { align: 'center' })
  pdf.text('STATEMENT', x + noColWidth + statementColWidth / 2, headerY + 7, { align: 'center' })
  pdf.text('Date', x + noColWidth + statementColWidth + dateColWidth / 2, headerY + 7, { align: 'center' })
  // Center-justified Surveyor-General text
  pdf.text('Surveyor-General', x + noColWidth + statementColWidth + dateColWidth + sgColWidth / 2, headerY + 7, { align: 'center' })
  
  // Draw horizontal line below header
  pdf.line(x, headerY + headerHeight, x + width, headerY + headerHeight)
  
  // Draw vertical column separators (full height from header to bottom)
  const dataStartY = headerY + headerHeight
  
  // Vertical line after "No." column
  pdf.line(x + noColWidth, headerY, x + noColWidth, y + height)
  
  // Vertical line after "STATEMENT" column
  pdf.line(x + noColWidth + statementColWidth, headerY, x + noColWidth + statementColWidth, y + height)
  
  // Vertical line after "Date" column
  pdf.line(x + noColWidth + statementColWidth + dateColWidth, headerY, x + noColWidth + statementColWidth + dateColWidth, y + height)
  
  // Draw first endorsement row content
  pdf.setFont(FONTS.small.family, 'normal')
  pdf.setFontSize(7)
  
  // Row number
  pdf.text('1.', x + noColWidth / 2, dataStartY + 8, { align: 'center' })
  
  // Statement text (left-aligned with padding)
  const statementX = x + noColWidth + 3
  const statementY = dataStartY + 8
  pdf.text('Dispensation Certificate', statementX, statementY)
  pdf.text('No............... relates to this G.P', statementX, statementY + 5)
  
  // Note: Date and Surveyor-General columns left blank for manual completion
}

// Note: formatArea is now imported from areaFormatting.ts
// This ensures consistent banker's rounding across the application

/**
 * Helper: Determine beacon type from beacon name/description
 */
function getBeaconType(beaconName: string): 'placed' | 'found' {
  const name = beaconName.toLowerCase()
  // Beacons with specific descriptions are typically "found" (existing)
  // New beacons placed during survey are "placed"
  if (name.includes('found') || name.includes('existing') || name.includes('adopted')) {
    return 'found'
  }
  return 'placed'
}

/**
 * Helper: Format coordinate (monospace alignment)
 */
function formatCoordinate(value: number): string {
  return value.toFixed(2).padStart(12, ' ')
}

/**
 * Helper: Draw triangle
 */
declare module 'jspdf' {
  interface jsPDF {
    triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style: string): jsPDF
    setLineDash(dashArray: number[], dashPhase?: number): jsPDF
  }
}

;(jsPDF.API as any).triangle = function(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style: string) {
  this.lines([[x2 - x1, y2 - y1], [x3 - x2, y3 - y2], [x1 - x3, y1 - y3]], x1, y1, [1, 1], style, true)
  return this
}

// Add setLineDash polyfill if not available
if (!(jsPDF.API as any).setLineDash) {
  ;(jsPDF.API as any).setLineDash = function(dashArray: number[]) {
    // jsPDF v3 uses different method for dash patterns
    if (dashArray.length === 0) {
      this.setLineWidth(this.getLineWidth()) // Reset to solid
    }
    return this
  }
}
