/**
 * Area and Consistency PDF Generator
 * Surveyor General's Office Format (Zimbabwe)
 * 
 * Generates traverse tables with:
 * - Beacon names, Y/X coordinates
 * - Distance, Direction (DMS format)
 * - Residuals (dy, dx)
 * - Area computation results
 * 
 * @version 2024-12-30-v2 - Fixed page breaks and beacon names
 */

import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import type { AreaComputeResponse } from '../services/compute';
import type { Parcel } from './useAreaCompliance';
import { listCoordinatePoints } from '@/services/spatial';

// Cache for coordinate points to avoid repeated API calls
let cachedCoordinatePoints: any[] | null = null;
let cachedProjectId: number | null = null;

/**
 * Helper to detect generic fallback names like "PEGGINGA", "P1", etc.
 */
function isGenericFallbackName(name: string): boolean {
  if (!name) return true;
  const genericPatterns = [
    /^PEGGING[A-Z]$/,           // PEGGINGA, PEGGINGB, etc.
    /^[A-Z]+[A-Z]$/,            // STANDA, STANDB, etc. (stand name + letter)
    /^P\d+$/,                   // P1, P2, etc.
    /^[A-Z]$/,                   // Single letters A, B, C...
    /^POINT\d+$/,               // POINT1, POINT2...
    /^BEACON\d+$/               // BEACON1, BEACON2...
  ];
  return genericPatterns.some(pattern => pattern.test(name));
}

/**
 * Find actual beacon name by spatial matching to coordinate points
 */
function findBeaconNameBySpatialMatch(
  y: number,
  x: number,
  coordinatePoints: any[],
  isGenericFallback = false
): string | null {
  const tolerance = 2.0; // 2 meter tolerance
  let closestMatch = null;
  let closestDist = Infinity;

  for (const cp of coordinatePoints) {
    const cpY = Number(cp.y); // Westing
    const cpX = Number(cp.x); // Southing
    const dist = Math.sqrt(Math.pow(cpY - y, 2) + Math.pow(cpX - x, 2));

    if (dist < closestDist) {
      closestDist = dist;
      closestMatch = cp.name;
    }

    if (dist < tolerance) {
      return cp.name;
    }
  }

  // Extended tolerance for generic fallback detection
  if (isGenericFallback && closestMatch && closestDist < tolerance * 5) {
    console.log(`[PDF] ✅ Found close match for generic fallback: ${closestMatch} (${closestDist.toFixed(3)}m) with extended tolerance`);
    return closestMatch;
  }

  return null;
}

interface TraverseRow {
  beaconName: string;
  y: number;
  x: number;
  distance: number;
  direction: string; // DMS format: "308°18'10""
  dy: number;
  dx: number;
}

 function computeBearingSouthBetween(from: { y: number; x: number }, to: { y: number; x: number }): number {
   const dy = to.y - from.y;
   const dx = to.x - from.x;
   let ang = Math.atan2(dy, dx) * (180 / Math.PI);
   if (ang < 0) ang += 360;
   return ang;
 }

 function getEdgeBearingDeg(edge: any): number | undefined {
   const candidates = [
     edge?.bearingRoundedDeg,
     edge?.bearingRounded,
     edge?.bearing_rounded_deg,
     edge?.bearingDeg,
     edge?.bearing,
     edge?.bearing_deg
   ];
 
   for (const v of candidates) {
     if (typeof v === 'number' && !isNaN(v)) return v;
     if (typeof v === 'string') {
       const n = Number(v);
       if (!isNaN(n)) return n;
     }
   }
 
   return undefined;
 }

/**
 * Banker's rounding (round half to even) - Zimbabwe SGO requirement
 * @param value - Number to round
 * @param decimals - Number of decimal places
 * @returns Rounded number
 */
function bankersRound(value: number, decimals: number): number {
  const multiplier = Math.pow(10, decimals);
  const shifted = value * multiplier;
  const floor = Math.floor(shifted);
  const decimal = shifted - floor;
  
  if (decimal === 0.5) {
    // Exactly at midpoint - round to even
    return (floor % 2 === 0 ? floor : floor + 1) / multiplier;
  } else {
    // Not at midpoint - use standard rounding
    return Math.round(shifted) / multiplier;
  }
}

/**
 * Convert decimal degrees to DMS (Degrees, Minutes, Seconds)
 * With banker's rounding applied to total seconds - matches backend's roundBearingSouth
 */
function decimalToDMS(decimal: number | undefined): string {
  // Handle undefined or invalid values
  if (decimal === undefined || decimal === null || isNaN(decimal)) {
    console.warn('[PDF] Invalid bearing value:', decimal);
    return '---';
  }
  
  // Convert to total seconds and apply banker's rounding
  // This matches the backend's roundBearingSouth function
  const absolute = Math.abs(decimal);
  const totalSeconds = absolute * 3600;
  const roundedSeconds = bankersRound(totalSeconds, 0);
  
  // Convert back to DMS
  let degrees = Math.floor(roundedSeconds / 3600);
  let minutes = Math.floor((roundedSeconds - degrees * 3600) / 60);
  let seconds = roundedSeconds - degrees * 3600 - minutes * 60;
  
  // Normalize (should not be needed after proper rounding, but safety check)
  if (seconds >= 60) {
    seconds -= 60;
    minutes += 1;
  }
  
  if (minutes >= 60) {
    minutes -= 60;
    degrees += 1;
  }
  
  if (degrees >= 360) {
    degrees = degrees % 360;
  }
  
  return `${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}"`;
}

/**
 * Prepare traverse data from area computation results
 * Now includes spatial matching to find actual beacon names
 */
function prepareTraverseData(
  parcel: Parcel,
  beaconLabels?: Array<{
    beaconName: string;
    displayLabel: string;
    stand: string;
    beaconY: number;
    beaconX: number;
    y: number;
    x: number;
    offset: number;
    clearance: number;
    parcelId: string;
  }>,
  coordinatePoints?: any[]
): TraverseRow[] {
  if (!parcel.areaResult?.residuals?.edges) {
    console.warn('[PDF] No edges data in parcel:', parcel.designation);
    return [];
  }
  
  // Check if parcel has point data (required for PDF generation)
  if (!parcel.points || parcel.points.length === 0) {
    console.warn('[PDF] ⚠️ Skipping parcel without point data:', parcel.designation);
    console.warn('[PDF] This parcel was saved before the Cape Lo points fix. Please re-digitize it.');
    return [];
  }
  
  const rows: TraverseRow[] = [];
  const edges = parcel.areaResult.residuals.edges;
  
  console.log('[PDF] Processing', edges.length, 'edges for', parcel.designation);
  
  // Debug: Log first edge to see structure
  if (edges.length > 0) {
    console.log('[PDF] Sample edge structure:', edges[0]);
    console.log('[PDF] Sample edge.from:', edges[0].from);
    console.log('[PDF] Sample edge.to:', edges[0].to);
  }
  
  // Helper to get beacon name with spatial matching fallback
  const getBeaconName = (point: any, defaultName: string): string => {
    // First try the point's own id/name
    let name = point?.id || point?.name || null;
    
    // If we have coordinate points and either no name or a generic name, try spatial matching
    if (coordinatePoints && coordinatePoints.length > 0) {
      const isGeneric = !name || isGenericFallbackName(name);
      
      if (isGeneric && point?.y !== undefined && point?.x !== undefined) {
        const matchedName = findBeaconNameBySpatialMatch(point.y, point.x, coordinatePoints, true);
        if (matchedName) {
          console.log(`[PDF] ✅ Spatial match: "${name}" → "${matchedName}"`);
          return matchedName;
        }
      }
    }
    
    return name || defaultName;
  };
  
  // Add rows for each edge
  edges.forEach((edge, idx) => {
    // Use edge.from and edge.to from backend (correct direction)
    // Fallback to parcel.points if edge doesn't have from/to
    const fromPoint = edge.from || parcel.points[idx];
    const toPoint = edge.to || parcel.points[(idx + 1) % parcel.points.length];
    
    // Safety check for undefined points
    if (!fromPoint || !toPoint) {
      console.warn('[PDF] ⚠️ Missing point data at index', idx, 'for parcel', parcel.designation);
      return;
    }
    
    // Debug beacon name extraction
    if (idx === 0) {
      console.log('[PDF] First edge fromPoint:', fromPoint);
      console.log('[PDF] First edge toPoint:', toPoint);
      console.log('[PDF] fromPoint.id:', fromPoint.id, 'fromPoint.name:', fromPoint.name);
      console.log('[PDF] toPoint.id:', toPoint.id, 'toPoint.name:', toPoint.name);
    }
    
    // Extract beacon names with spatial matching fallback
    const fromBeaconName = getBeaconName(fromPoint, `Point${idx}`);
    const toBeaconName = getBeaconName(toPoint, `Point${idx + 1}`);
    
    // Warn if still using generic names
    if (isGenericFallbackName(fromBeaconName)) {
      console.warn(`[PDF] ⚠️ Using generic from-name: "${fromBeaconName}" for edge ${idx}`);
    }
    if (isGenericFallbackName(toBeaconName)) {
      console.warn(`[PDF] ⚠️ Using generic to-name: "${toBeaconName}" for edge ${idx}`);
    }
    
    // First row: starting point (no distance/direction/residuals)
    if (idx === 0) {
      rows.push({
        beaconName: fromBeaconName,
        y: fromPoint.y || 0,
        x: fromPoint.x || 0,
        distance: 0,
        direction: '',
        dy: NaN,  // No residuals for starting point
        dx: NaN   // No residuals for starting point
      });
    }
    
    // CRITICAL: Use bearing directly from edge object (already calculated correctly by backend)
    // Do NOT recompute bearing from points as this may reverse the direction
    const bearingDeg = getEdgeBearingDeg(edge);
 
    // Log edge data for debugging
    if (bearingDeg === undefined || isNaN(bearingDeg)) {
      console.warn('[PDF] Invalid bearing value for edge', idx, ':', edge);
      console.warn('[PDF] Edge data:', edge);
    }
    
    // Subsequent rows: to point with edge data
    // Use bearingRoundedDeg (Zimbabwe regulation: 10" for <6000m, 1" for ≥6000m)
    rows.push({
      beaconName: toBeaconName,
      y: toPoint.y || 0,
      x: toPoint.x || 0,
      distance: edge.distanceRounded || edge.distance || 0, // Use rounded distance
      direction: decimalToDMS(bearingDeg), // Use rounded bearing from backend
      dy: edge.dy || 0,
      dx: edge.dx || 0
    });
  });
  
  return rows;
}

/**
 * Draw table header
 */
function drawTableHeader(doc: jsPDF, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const colWidths = {
    beacon: 35,
    y: 28,
    x: 28,
    distance: 25,
    direction: 32,
    dy: 20,
    dx: 20
  };
  
  const startX = (pageWidth - Object.values(colWidths).reduce((a, b) => a + b, 0)) / 2;
  
  // Header background (compact)
  doc.setFillColor(41, 128, 185); // Blue
  doc.rect(startX, startY, Object.values(colWidths).reduce((a, b) => a + b, 0), 7, 'F');  // Reduced from 8
  
  // Header text (compact)
  doc.setFontSize(8);  // Reduced from 9
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  
  let currentX = startX + 2;
  doc.text('Beacon Name', currentX, startY + 4.5);  // Adjusted for 7mm height
  currentX += colWidths.beacon;
  
  doc.text('Y', currentX, startY + 4.5);
  currentX += colWidths.y;
  
  doc.text('X', currentX, startY + 4.5);
  currentX += colWidths.x;
  
  doc.text('Distance (m)', currentX, startY + 4.5);
  currentX += colWidths.distance;
  
  doc.text('Direction (° \' ")', currentX, startY + 4.5);
  currentX += colWidths.direction;
  
  doc.text('dy', currentX, startY + 4.5);
  currentX += colWidths.dy;
  
  doc.text('dx', currentX, startY + 4.5);
  
  return startY + 7;  // Reduced from 8
}

/**
 * Draw table rows with pagination support
 */
function drawTableRows(doc: jsPDF, rows: TraverseRow[], startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 20; // 20mm bottom margin
  const topMargin = 20; // 20mm top margin for continuation pages
  const maxY = pageHeight - bottomMargin;
  
  const colWidths = {
    beacon: 35,
    y: 28,
    x: 28,
    distance: 25,
    direction: 32,
    dy: 20,
    dx: 20
  };
  
  const startX = (pageWidth - Object.values(colWidths).reduce((a, b) => a + b, 0)) / 2;
  const rowHeight = 5;  // Reduced from 6 for compact layout
  const headerHeight = 7;
  let currentY = startY;
  
  doc.setFontSize(7);  // Reduced from 8 for compact layout
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  
  rows.forEach((row, idx) => {
    // Check if we need a new page
    if (currentY + rowHeight > maxY) {
      console.log(`[PDF] Area & Consistency pagination: Adding page at row ${idx + 1}/${rows.length}`);
      
      // Add new page
      doc.addPage();
      currentY = topMargin;
      
      // Redraw table header on new page
      currentY = drawTableHeader(doc, currentY);
      
      // Reset text formatting after header (header changes font/color)
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
    }
    
    // Alternate row colors
    if (idx % 2 === 0) {
      doc.setFillColor(240, 240, 240);
      doc.rect(startX, currentY, Object.values(colWidths).reduce((a, b) => a + b, 0), rowHeight, 'F');
    }
    
    // Draw cell borders
    let currentX = startX;
    Object.values(colWidths).forEach(width => {
      doc.setDrawColor(200, 200, 200);
      doc.rect(currentX, currentY, width, rowHeight);
      currentX += width;
    });
    
    // Draw cell values
    currentX = startX + 2;
    const textY = currentY + 3.5;  // Adjusted for 5mm row height
    
    // Beacon name - ensure it's a string
    const beaconNameStr = String(row.beaconName || '');
    doc.text(beaconNameStr, currentX, textY);
    currentX += colWidths.beacon;
    
    // Y coordinate with +/- prefix - ensure valid number
    const yNum = typeof row.y === 'number' && !isNaN(row.y) ? row.y : 0;
    const yValue = yNum >= 0 ? `+${yNum.toFixed(2)}` : yNum.toFixed(2);
    doc.text(yValue, currentX, textY);
    currentX += colWidths.y;
    
    // X coordinate with +/- prefix - ensure valid number
    const xNum = typeof row.x === 'number' && !isNaN(row.x) ? row.x : 0;
    const xValue = xNum >= 0 ? `+${xNum.toFixed(2)}` : xNum.toFixed(2);
    doc.text(xValue, currentX, textY);
    currentX += colWidths.x;
    
    // Distance (empty for first row) - right-aligned with padding
    if (row.distance > 0) {
      const distNum = typeof row.distance === 'number' && !isNaN(row.distance) ? row.distance : 0;
      doc.text(distNum.toFixed(2), currentX + colWidths.distance - 2, textY, { align: 'right' });
    }
    currentX += colWidths.distance;
    
    // Direction (empty for first row) - right-aligned with padding
    if (row.direction) {
      const directionStr = String(row.direction || '');
      doc.text(directionStr, currentX + colWidths.direction - 2, textY, { align: 'right' });
    }
    currentX += colWidths.direction;
    
    // dy (2 decimal places with banker's rounding - SGO requirement, empty for first row)
    if (!isNaN(row.dy)) {
      const dyNum = typeof row.dy === 'number' ? row.dy : 0;
      doc.text(bankersRound(dyNum, 2).toFixed(2), currentX, textY);
    }
    currentX += colWidths.dy;
    
    // dx (2 decimal places with banker's rounding - SGO requirement, empty for first row)
    if (!isNaN(row.dx)) {
      const dxNum = typeof row.dx === 'number' ? row.dx : 0;
      doc.text(bankersRound(dxNum, 2).toFixed(2), currentX, textY);
    }
    
    currentY += rowHeight;
  });
  
  return currentY;
}

/**
 * Generate Area and Consistency PDF
 * 
 * @param parcels - Array of computed parcels
 * @param projectName - Project name for PDF title
 * @param calculationsPart1PDF - Optional Calculations Part 1 PDF file to append to
 * @param lastDisplayedPageNumber - Last displayed page number from Calculations Part 1 (e.g., 116)
 * @param beaconLabels - Optional intelligent beacon labels (suffix letters inside parcels)
 * @param coordinatePoints - Optional coordinate points for spatial matching of beacon names
 */
export async function generateAreaConsistencyPDF(
  parcels: Parcel[], 
  projectName: string = 'Survey Project',
  calculationsPart1PDF?: File | Blob,
  lastDisplayedPageNumber?: number,
  beaconLabels?: Array<{
    beaconName: string;
    displayLabel: string;
    stand: string;
    beaconY: number;
    beaconX: number;
    y: number;
    x: number;
    offset: number;
    clearance: number;
    parcelId: string;
  }>,
  coordinatePoints?: any[]
): Promise<Uint8Array | void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const topMargin = 20;
  const bottomMargin = 20;
  let currentY = topMargin;
  let isFirstPage = true;
  
  // Title on first page only
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('AREA AND CONSISTENCY', pageWidth / 2, currentY, { align: 'center' });
  
  currentY += 10;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, currentY, { align: 'center' });
  
  currentY += 12;
  
  // Track skipped parcels for user notification
  const skippedParcels: string[] = [];
  
  // Process each parcel
  parcels.forEach((parcel, parcelIdx) => {
    if (!parcel.areaResult) return;
    
    const traverseData = prepareTraverseData(parcel, beaconLabels, coordinatePoints);
    
    // Skip parcels without point data
    if (traverseData.length === 0) {
      skippedParcels.push(parcel.designation);
      return;
    }
    
    // Compact spacing for efficient page usage
    const parcelTitleHeight = 8;  // Reduced from 10
    const tableHeaderHeight = 7;  // Reduced from 8
    const rowHeight = 5;          // Reduced from 6
    const tableRowsHeight = traverseData.length * rowHeight;
    const spacingAfterTable = 4;  // Reduced from 8
    const areaResultHeight = 7;   // Reduced from 10
    const spacingAfterParcel = 8; // Spacing after area result
    const interParcelSpacing = 5; // Spacing between parcels on same page
    
    // Calculate TOTAL height needed for this entire parcel block
    const totalParcelHeight = parcelTitleHeight + tableHeaderHeight + tableRowsHeight + 
                              spacingAfterTable + areaResultHeight;
    
    // Smart page break: Ensure ENTIRE parcel stays together on one page
    const availableSpace = pageHeight - bottomMargin - currentY;
    
    console.log(`[PDF] 🔍 Parcel ${parcel.designation}: currentY=${currentY.toFixed(1)}, availableSpace=${availableSpace.toFixed(1)}, totalHeight=${totalParcelHeight.toFixed(1)}`);
    
    // Check if we need to add inter-parcel spacing (for parcels after the first)
    const spacingNeeded = parcelIdx > 0 ? interParcelSpacing : 0;
    const totalSpaceNeeded = totalParcelHeight + spacingNeeded;
    
    // Start new page if the ENTIRE parcel block won't fit
    if (availableSpace < totalSpaceNeeded) {
      console.log(`[PDF] ✅ NEW PAGE for ${parcel.designation} (needs ${totalSpaceNeeded.toFixed(0)}mm, only ${availableSpace.toFixed(0)}mm available)`);
      doc.addPage();
      currentY = topMargin;
      isFirstPage = false;
    } else if (parcelIdx > 0) {
      // Add extra spacing between parcels (not for first parcel)
      console.log(`[PDF] ➕ Adding ${interParcelSpacing}mm spacing before ${parcel.designation}`);
      currentY += interParcelSpacing;
    }
    
    // Parcel title (compact)
    doc.setFontSize(11);  // Reduced from 12
    doc.setFont('helvetica', 'bold');
    const safeCurrentY = typeof currentY === 'number' && !isNaN(currentY) ? currentY : topMargin;
    doc.text(`Stand/Erf: ${parcel.designation}`, 20, safeCurrentY);
    currentY = safeCurrentY;
    
    currentY += parcelTitleHeight;
    
    // Draw table
    currentY = drawTableHeader(doc, currentY);
    currentY = drawTableRows(doc, traverseData, currentY);
    
    currentY += spacingAfterTable;
    
    // Area result (compact)
    doc.setFontSize(10);  // Reduced from 11
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 0, 0); // Red
    
    // Safely format area - ensure all values are valid
    let areaText = 'Area: 0 m²'; // Fallback
    
    try {
      const area = parcel.areaResult?.area;
      console.log('[PDF] Area data for', parcel.designation, ':', JSON.stringify(area));
      
      if (area?.display) {
        if (area.display.unit === 'ha' && 'hectares' in area.display) {
          const hectares = typeof area.display.hectares === 'number' && !isNaN(area.display.hectares) 
            ? area.display.hectares 
            : 0;
          areaText = `Area: ${hectares.toFixed(4)} Ha`;
        } else if ((area.display.unit === 'm2' || area.display.unit === 'm²') && 'square_meters' in area.display) {
          const squareMeters = typeof area.display.square_meters === 'number' && !isNaN(area.display.square_meters)
            ? area.display.square_meters
            : 0;
          areaText = `Area: ${squareMeters.toFixed(0)} m²`;
        }
      } else if (area?.abs_m2) {
        // Fallback: use abs_m2 directly if display is not available
        const absM2 = typeof area.abs_m2 === 'number' && !isNaN(area.abs_m2) ? area.abs_m2 : 0;
        if (absM2 >= 10000) {
          areaText = `Area: ${(absM2 / 10000).toFixed(4)} Ha`;
        } else {
          areaText = `Area: ${absM2.toFixed(0)} m²`;
        }
      }
    } catch (error) {
      console.warn('[PDF] Error formatting area:', error);
      areaText = 'Area: N/A';
    }
    
    // Ensure areaText is a valid string and coordinates are valid numbers
    const safeAreaText = String(areaText || 'Area: N/A');
    const safeX = 20;
    const safeY = typeof currentY === 'number' && !isNaN(currentY) ? currentY : topMargin;
    doc.text(safeAreaText, safeX, safeY);
    
    doc.setTextColor(0, 0, 0);
    currentY += areaResultHeight;
    
    // Closure quality data is computed but not displayed in PDF
    // (Available in backend response for programmatic use if needed)
    
    currentY += spacingAfterParcel;
  });
  
  // Handle PDF output and page numbering
  if (calculationsPart1PDF) {
    // Merge with Calculations Part 1 and continue page numbering
    const mergedPdfBytes = await mergeWithCalculationsPart1(
      doc, 
      calculationsPart1PDF, 
      projectName, 
      pageWidth,
      lastDisplayedPageNumber
    );
    
    // Return merged PDF for caller to handle (download or save to project)
    return mergedPdfBytes;
  } else {
    // Standalone PDF - add page numbers starting from 1
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Page ${i} of ${totalPages}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
    
    // Save standalone PDF
    const filename = `Area_Consistency_${projectName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
    doc.save(filename);
    
    // Notify user about skipped parcels
    if (skippedParcels.length > 0) {
      console.warn('[PDF] ⚠️ Skipped parcels without point data:', skippedParcels);
      setTimeout(() => {
        alert(
          `⚠️ PDF Generated with Warnings\n\n` +
          `${skippedParcels.length} parcel(s) were skipped due to missing point data:\n` +
          `${skippedParcels.join(', ')}\n\n` +
          `These parcels were saved before the Cape Lo points fix.\n` +
          `To include them in the PDF, please delete and re-digitize them.`
        );
      }, 500);
    }
  }
}

/**
 * Detect the last displayed page number from Calculations Part 1 PDF
 * Returns the page number shown on the last page (e.g., 116)
 * Falls back to page count if detection fails
 */
async function detectLastPageNumber(pdfDoc: PDFDocument): Promise<number> {
  try {
    const pageCount = pdfDoc.getPageCount();
    const lastPageIndex = pageCount - 1;
    const lastPage = pdfDoc.getPage(lastPageIndex);
    
    // Note: pdf-lib doesn't have built-in text extraction
    // We'll use a heuristic: assume the page number follows the pattern
    // If Coordinate List starts at page 100 and has 17 pages, last page is 116
    // For now, we'll calculate based on a common pattern
    
    // Try to extract text (pdf-lib limitation: no direct text extraction)
    // As a fallback, we'll assume the last page number = starting page + page count - 1
    // For Coordinate List: starts at 100, has 17 pages, so last = 100 + 17 - 1 = 116
    
    // Since we can't extract text easily, we'll use the page count as the last page number
    // This assumes pages are numbered sequentially from 1
    // If this doesn't work, we'll need to pass the starting page number as a parameter
    
    console.log(`[PDF] Assuming last page number equals page count: ${pageCount}`);
    return pageCount;
  } catch (error) {
    console.warn('[PDF] Could not detect last page number, using page count:', error);
    return pdfDoc.getPageCount();
  }
}

/**
 * Detect page numbering format from Calculations Part 1 PDF
 * Analyzes the last page to understand position and format
 */
async function detectPageNumberingFormat(pdfDoc: PDFDocument) {
  try {
    const lastPageIndex = pdfDoc.getPageCount() - 1;
    const lastPage = pdfDoc.getPage(lastPageIndex);
    const { width, height } = lastPage.getSize();
    
    // Try to extract text from the page to detect numbering pattern
    // Note: pdf-lib doesn't have built-in text extraction, so we'll use common patterns
    
    // Calculations Part 1 uses simple number format in TOP RIGHT corner
    // Based on the screenshot: page number "131" appears in top right
    const format = {
      position: 'top-right' as const,
      yPosition: height - 40, // 40 units from top (standard for SGO)
      xPosition: width - 60,  // 60 units from right edge
      fontSize: 11,
      format: 'simple-number' as const, // Just the number (e.g., "131")
      fontColor: { r: 0, g: 0, b: 0 } // Black
    };
    
    console.log(`[PDF] Detected page numbering format:`, format);
    console.log(`[PDF] Page dimensions: ${width.toFixed(0)} x ${height.toFixed(0)}`);
    
    return { format, width, height };
  } catch (error) {
    console.warn('[PDF] Could not detect page numbering format, using defaults:', error);
    // Fallback to top-right simple number format
    return {
      format: {
        position: 'top-right' as const,
        yPosition: 800, // Approximate for A4
        xPosition: 535,
        fontSize: 11,
        format: 'simple-number' as const,
        fontColor: { r: 0, g: 0, b: 0 }
      },
      width: 595,
      height: 842
    };
  }
}

/**
 * Merge Area & Consistency PDF with Calculations Part 1
 * Continues page numbering from where Calculations Part 1 ended
 * Returns the merged PDF bytes for downloading or saving
 */
async function mergeWithCalculationsPart1(
  areaDoc: jsPDF, 
  calculationsPart1PDF: File | Blob,
  projectName: string,
  pageWidth: number,
  lastDisplayedPageNumber?: number
): Promise<Uint8Array> {
  try {
    console.log('[PDF] Merging with Calculations Part 1...');
    
    // Read Calculations Part 1 PDF
    const calc1ArrayBuffer = await calculationsPart1PDF.arrayBuffer();
    const calc1PdfDoc = await PDFDocument.load(calc1ArrayBuffer);
    const calc1PageCount = calc1PdfDoc.getPageCount();
    
    console.log(`[PDF] Calculations Part 1 has ${calc1PageCount} physical pages`);
    
    // Detect page numbering format from Calculations Part 1
    const { format: numberingFormat, width: pdfWidth, height: pdfHeight} = 
      await detectPageNumberingFormat(calc1PdfDoc);
    
    // Use the passed lastDisplayedPageNumber or fall back to page count
    // The PDF may have fewer physical pages than the displayed page numbers
    // (e.g., 17 physical pages but numbered 100-116)
    const lastPageNum = lastDisplayedPageNumber || calc1PageCount;
    console.log(`[PDF] Last displayed page number in Calculations Part 1: ${lastPageNum}`);
    
    // Convert Area & Consistency PDF to bytes (without page numbers yet)
    const areaBytes = areaDoc.output('arraybuffer');
    const areaPdfDoc = await PDFDocument.load(areaBytes);
    const areaPageCount = areaPdfDoc.getPageCount();
    
    // Copy pages from Area & Consistency to Calculations Part 1
    const copiedPages = await calc1PdfDoc.copyPages(areaPdfDoc, areaPdfDoc.getPageIndices());
    copiedPages.forEach((page: any) => calc1PdfDoc.addPage(page));
    
    const totalPages = calc1PageCount + areaPageCount;
    
    // Calculate the starting page number for Area & Consistency
    const areaStartPageNumber = lastPageNum + 1;
    const areaEndPageNumber = lastPageNum + areaPageCount;
    
    console.log(`[PDF] Adding page numbers to Area & Consistency pages (${areaStartPageNumber} to ${areaEndPageNumber})`);
    
    // Add page numbers to the appended Area & Consistency pages using pdf-lib
    const font = await calc1PdfDoc.embedFont('Helvetica');
    
    for (let i = 0; i < areaPageCount; i++) {
      const pageIndex = calc1PageCount + i;
      const page = calc1PdfDoc.getPage(pageIndex);
      const { width, height } = page.getSize();
      
      // Page number continues from last displayed page of Calculations Part 1
      // If Calculations Part 1 ends on page 116, first Area page should be 117
      const pageNumber = lastPageNum + i + 1;
      
      // Use simple number format to match Calculations Part 1
      const pageText = `${pageNumber}`; // Just the number (e.g., "132")
      
      // Calculate position based on detected format (top-right corner)
      const textWidth = font.widthOfTextAtSize(pageText, numberingFormat.fontSize);
      const xPosition = numberingFormat.xPosition || (width - 60); // Top right
      const yPosition = numberingFormat.yPosition || (height - 40); // Near top
      
      // Draw page number in top-right corner (matching Calculations Part 1)
      page.drawText(pageText, {
        x: xPosition,
        y: yPosition,
        size: numberingFormat.fontSize,
        font: font,
        color: {
          type: 'RGB',
          red: numberingFormat.fontColor.r,
          green: numberingFormat.fontColor.g,
          blue: numberingFormat.fontColor.b
        } as any
      });
      
      if (i === 0) {
        console.log(`[PDF] First Area page number: "${pageText}" at position (${xPosition.toFixed(1)}, ${yPosition.toFixed(1)})`);
        console.log(`[PDF] Format: Simple number in top-right corner (matching Calculations Part 1)`);
      }
    }
    
    console.log(`[PDF] ✅ Merged successfully. Total physical pages in file: ${totalPages}`);
    console.log(`[PDF] Area & Consistency section: pages ${areaStartPageNumber} to ${areaEndPageNumber} (displayed page numbers)`);
    
    // Return merged PDF bytes
    const mergedPdfBytes = await calc1PdfDoc.save();
    return mergedPdfBytes;
  } catch (error) {
    console.error('[PDF] ❌ Error merging PDFs:', error);
    throw error; // Propagate error to caller
  }
}

/**
 * Composable export
 */
export function useAreaConsistencyPDF() {
  return {
    generateAreaConsistencyPDF
  };
}
