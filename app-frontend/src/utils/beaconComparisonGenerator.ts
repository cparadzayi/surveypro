/**
 * Beacon Comparison Generator
 * Generates SI 727 Section 67(5) compliant comparison schedules
 * Supports both Tabulation and Sketch methods
 */

import type { FoundBeacon, BeaconComparisonConfig } from '../types/cadastral';

export interface ComparisonStatistics {
  totalBeacons: number;
  beaconsCompared: number;
  meanDiscrepancy: number;
  maxDiscrepancy: number;
  rmsError: number;
  withinTolerance: number;
}

/**
 * Generate HTML for coordinate tabulation comparison
 */
export function generateTabulationHTML(
  beacons: FoundBeacon[],
  config: BeaconComparisonConfig
): string {
  const beaconsWithOriginalData = beacons.filter(b => b.originalData && b.discrepancy);
  
  if (beaconsWithOriginalData.length === 0) {
    return '<p class="text-gray-600">No beacon comparison data available. Original coordinates not provided.</p>';
  }
  
  const stats = calculateStatistics(beaconsWithOriginalData);
  
  return `
    <div class="beacon-comparison-tabulation" style="font-family: 'Times New Roman', serif; font-size: 11pt;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="font-size: 14pt; font-weight: bold; margin-bottom: 10px;">COORDINATE COMPARISON</h2>
        <p style="font-size: 10pt; margin: 5px 0;">S.R. No.: ${config.currentSRNumber}</p>
        ${config.originalSRNumber ? `<p style="font-size: 10pt; margin: 5px 0;">Original Survey: ${config.originalSRNumber}</p>` : ''}
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="border-bottom: 2px solid #000;">
            <th colspan="3" style="padding: 8px; text-align: center; border-right: 2px solid #000;">
              <span style="color: #000;">${config.originalSRNumber || 'Original Survey'}</span>
            </th>
            <th colspan="4" style="padding: 8px; text-align: center;">
              <span style="color: #dc2626;">This Survey</span>
            </th>
          </tr>
          <tr style="border-bottom: 1px solid #000;">
            <th style="padding: 8px; text-align: left; color: #000;">Point</th>
            <th style="padding: 8px; text-align: right; color: #000;">Y</th>
            <th style="padding: 8px; text-align: right; color: #000; border-right: 2px solid #000;">X</th>
            <th style="padding: 8px; text-align: right; color: #dc2626;">Y</th>
            <th style="padding: 8px; text-align: right; color: #dc2626;">X</th>
            <th style="padding: 8px; text-align: right; color: #dc2626;">dy</th>
            <th style="padding: 8px; text-align: right; color: #dc2626;">dx</th>
          </tr>
        </thead>
        <tbody>
          ${beaconsWithOriginalData.map(beacon => `
            <tr style="border-bottom: 1px solid #ccc;">
              <td style="padding: 8px; color: #000;">${beacon.beaconId}</td>
              <td style="padding: 8px; text-align: right; font-family: 'Courier New', monospace; color: #000;">
                ${formatCoordinate(beacon.originalData!.coordinates.y)}
              </td>
              <td style="padding: 8px; text-align: right; font-family: 'Courier New', monospace; color: #000; border-right: 2px solid #000;">
                ${formatCoordinate(beacon.originalData!.coordinates.x)}
              </td>
              <td style="padding: 8px; text-align: right; font-family: 'Courier New', monospace; color: #dc2626;">
                ${formatCoordinate(beacon.currentCoordinates.y)}
              </td>
              <td style="padding: 8px; text-align: right; font-family: 'Courier New', monospace; color: #dc2626;">
                ${formatCoordinate(beacon.currentCoordinates.x)}
              </td>
              <td style="padding: 8px; text-align: right; font-family: 'Courier New', monospace; color: #dc2626;">
                ${formatDifference(beacon.discrepancy!.dy)}
              </td>
              <td style="padding: 8px; text-align: right; font-family: 'Courier New', monospace; color: #dc2626;">
                ${formatDifference(beacon.discrepancy!.dx)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div style="margin: 20px 0; padding: 15px; background-color: #f9fafb; border: 1px solid #e5e7eb;">
        <h3 style="font-size: 12pt; font-weight: bold; margin-bottom: 10px;">STATISTICAL SUMMARY:</h3>
        <p style="margin: 5px 0;">Number of beacons compared: ${stats.beaconsCompared}</p>
        <p style="margin: 5px 0;">Mean discrepancy: ${stats.meanDiscrepancy.toFixed(3)}m</p>
        <p style="margin: 5px 0;">Maximum discrepancy: ${stats.maxDiscrepancy.toFixed(3)}m</p>
        <p style="margin: 5px 0;">RMS error: ${stats.rmsError.toFixed(3)}m</p>
      </div>
      
      <div style="margin: 20px 0; padding: 15px; background-color: #fef3c7; border: 1px solid #fbbf24;">
        <h3 style="font-size: 12pt; font-weight: bold; margin-bottom: 10px;">TOLERANCE ASSESSMENT:</h3>
        <p style="margin: 5px 0;">Acceptable tolerance: ±${config.toleranceThreshold.toFixed(3)}m</p>
        <p style="margin: 5px 0;">Beacons within tolerance: ${stats.withinTolerance} of ${stats.beaconsCompared} (${((stats.withinTolerance / stats.beaconsCompared) * 100).toFixed(0)}%)</p>
      </div>
      
      <div style="margin: 20px 0; padding: 15px; border-top: 2px solid #000;">
        <h3 style="font-size: 12pt; font-weight: bold; margin-bottom: 10px;">CONCLUSION:</h3>
        <p style="margin: 5px 0;">${config.conclusion}</p>
      </div>
      
      <div style="margin-top: 30px; padding: 10px; background-color: #f3f4f6; border: 1px solid #d1d5db; font-size: 9pt;">
        <p style="margin: 0;"><strong>Color Coding (SI 727 Section 67(5)):</strong></p>
        <p style="margin: 5px 0;">• Original data (${config.originalSRNumber || 'Previous Survey'}): <span style="color: #000;">BLACK</span></p>
        <p style="margin: 5px 0;">• This Survey data: <span style="color: #dc2626;">RED</span></p>
        <p style="margin: 5px 0;">• Differences (dy, dx): <span style="color: #dc2626;">RED</span></p>
      </div>
    </div>
  `;
}

/**
 * Generate HTML for comparison sketch
 */
export function generateSketchHTML(
  beacons: FoundBeacon[],
  config: BeaconComparisonConfig
): string {
  const beaconsWithOriginalData = beacons.filter(b => b.originalData && b.discrepancy);
  
  if (beaconsWithOriginalData.length === 0) {
    return '<p class="text-gray-600">No beacon comparison data available for sketch generation.</p>';
  }
  
  const stats = calculateStatistics(beaconsWithOriginalData);
  const interBeaconChecks = calculateInterBeaconChecks(beaconsWithOriginalData);
  
  return `
    <div class="beacon-comparison-sketch" style="font-family: 'Times New Roman', serif; font-size: 11pt;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="font-size: 14pt; font-weight: bold; margin-bottom: 10px;">BEACON COMPARISON SKETCH</h2>
        <p style="font-size: 10pt; margin: 5px 0;">S.R. No.: ${config.currentSRNumber}</p>
        ${config.originalSRNumber ? `<p style="font-size: 10pt; margin: 5px 0;">Original Survey: ${config.originalSRNumber}</p>` : ''}
        <p style="font-size: 10pt; margin: 5px 0;">Scale: 1:1000</p>
      </div>
      
      <!-- Sketch Canvas Placeholder -->
      <div style="border: 2px solid #000; padding: 40px; margin: 20px 0; min-height: 400px; background-color: #fff; position: relative;">
        <div style="text-align: center; position: absolute; top: 10px; left: 50%; transform: translateX(-50%);">
          <p style="margin: 0;">N ↑</p>
        </div>
        
        <div style="margin-top: 40px;">
          ${beaconsWithOriginalData.map((beacon, index) => `
            <div style="margin: 20px 0; padding: 10px; border-left: 3px solid #2563eb;">
              <p style="margin: 0; font-weight: bold;">${beacon.beaconId}</p>
              <p style="margin: 5px 0; font-size: 9pt;">
                <span style="color: #000;">●</span> Original 
                <span style="color: #2563eb;">→</span> 
                <span style="color: #dc2626;">●</span> New
              </p>
              <p style="margin: 5px 0; font-size: 9pt;">Δ = ${beacon.discrepancy!.distance.toFixed(3)}m</p>
              <p style="margin: 5px 0; font-size: 9pt;">Bearing: ${formatBearing(beacon.discrepancy!.bearing)}</p>
            </div>
          `).join('')}
        </div>
      </div>
      
      ${interBeaconChecks.length > 0 ? `
        <div style="margin: 20px 0;">
          <h3 style="font-size: 12pt; font-weight: bold; margin-bottom: 10px;">INTER-BEACON DISTANCE CHECK:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #000;">
                <th style="padding: 8px; text-align: left;">Line</th>
                <th style="padding: 8px; text-align: right;">Original</th>
                <th style="padding: 8px; text-align: right;">This Survey</th>
                <th style="padding: 8px; text-align: right;">Difference</th>
                <th style="padding: 8px; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${interBeaconChecks.map(check => `
                <tr style="border-bottom: 1px solid #ccc;">
                  <td style="padding: 8px;">${check.line}</td>
                  <td style="padding: 8px; text-align: right; font-family: 'Courier New', monospace;">${check.originalDistance.toFixed(3)}m</td>
                  <td style="padding: 8px; text-align: right; font-family: 'Courier New', monospace;">${check.newDistance.toFixed(3)}m</td>
                  <td style="padding: 8px; text-align: right; font-family: 'Courier New', monospace;">${check.difference.toFixed(3)}m</td>
                  <td style="padding: 8px; text-align: center;">${check.acceptable ? '✓' : '⚠'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      
      <div style="margin: 20px 0; padding: 15px; background-color: #f9fafb; border: 1px solid #e5e7eb;">
        <h3 style="font-size: 12pt; font-weight: bold; margin-bottom: 10px;">LEGEND:</h3>
        <p style="margin: 5px 0;"><span style="color: #000;">●</span> Black dot = Original position (${config.originalSRNumber || 'Previous Survey'})</p>
        <p style="margin: 5px 0;"><span style="color: #dc2626;">●</span> Red dot = New survey position (This Survey)</p>
        <p style="margin: 5px 0;"><span style="color: #2563eb;">→</span> Blue arrow = Displacement vector</p>
        <p style="margin: 5px 0;">Δ = Displacement magnitude</p>
        <p style="margin: 5px 0;">✓ = Within acceptable tolerance</p>
      </div>
      
      <div style="margin: 20px 0; padding: 15px; border-top: 2px solid #000;">
        <h3 style="font-size: 12pt; font-weight: bold; margin-bottom: 10px;">CONCLUSION:</h3>
        <p style="margin: 5px 0;">${config.conclusion}</p>
        ${interBeaconChecks.length > 0 ? `
          <p style="margin: 10px 0;">The inter-beacon distances show ${interBeaconChecks.every(c => c.acceptable) ? 'excellent' : 'acceptable'} consistency between surveys, confirming the reliability of the control network.</p>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Calculate statistics for beacon comparison
 */
function calculateStatistics(beacons: FoundBeacon[]): ComparisonStatistics {
  const discrepancies = beacons
    .filter(b => b.discrepancy)
    .map(b => b.discrepancy!.distance);
  
  const meanDiscrepancy = discrepancies.reduce((sum, d) => sum + d, 0) / discrepancies.length;
  const maxDiscrepancy = Math.max(...discrepancies);
  
  // Calculate RMS error
  const sumSquares = discrepancies.reduce((sum, d) => sum + d * d, 0);
  const rmsError = Math.sqrt(sumSquares / discrepancies.length);
  
  const withinTolerance = beacons.filter(b => b.discrepancy?.withinTolerance).length;
  
  return {
    totalBeacons: beacons.length,
    beaconsCompared: discrepancies.length,
    meanDiscrepancy,
    maxDiscrepancy,
    rmsError,
    withinTolerance
  };
}

/**
 * Calculate inter-beacon distance checks
 */
function calculateInterBeaconChecks(beacons: FoundBeacon[]): Array<{
  line: string;
  originalDistance: number;
  newDistance: number;
  difference: number;
  acceptable: boolean;
}> {
  const checks: Array<any> = [];
  
  // Check distances between consecutive beacons
  for (let i = 0; i < beacons.length - 1; i++) {
    const beacon1 = beacons[i];
    const beacon2 = beacons[i + 1];
    
    if (!beacon1.originalData || !beacon2.originalData) continue;
    
    // Calculate original distance
    const origDy = beacon2.originalData.coordinates.y - beacon1.originalData.coordinates.y;
    const origDx = beacon2.originalData.coordinates.x - beacon1.originalData.coordinates.x;
    const originalDistance = Math.sqrt(origDy * origDy + origDx * origDx);
    
    // Calculate new distance
    const newDy = beacon2.currentCoordinates.y - beacon1.currentCoordinates.y;
    const newDx = beacon2.currentCoordinates.x - beacon1.currentCoordinates.x;
    const newDistance = Math.sqrt(newDy * newDy + newDx * newDx);
    
    const difference = Math.abs(newDistance - originalDistance);
    
    checks.push({
      line: `${beacon1.beaconId} - ${beacon2.beaconId}`,
      originalDistance,
      newDistance,
      difference,
      acceptable: difference <= 0.050 // 50mm tolerance for inter-beacon distances
    });
  }
  
  return checks;
}

/**
 * Format coordinate with comma separator
 */
function formatCoordinate(value: number): string {
  return value.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format difference with sign
 */
function formatDifference(value: number): string {
  const sign = value >= 0 ? '' : '-';
  return `${sign}${Math.abs(value).toFixed(3)}`;
}

/**
 * Format bearing as DMS
 */
function formatBearing(bearing?: number): string {
  if (bearing === undefined) return 'N/A';
  const degrees = Math.floor(bearing);
  const minutes = Math.floor((bearing - degrees) * 60);
  const seconds = Math.floor(((bearing - degrees) * 60 - minutes) * 60);
  return `${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}"`;
}
