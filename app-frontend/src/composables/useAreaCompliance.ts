/**
 * SI 727/1979 Land Survey Compliance Composable
 * Zimbabwe Land Survey (General) Regulations, 1979
 * 
 * Provides closure ratio calculation and tolerance validation
 * for cadastral survey area computations.
 */

import type { AreaComputeResponse } from '../services/compute';

// SI 727/1979 Area types with regulatory tolerances
export type AreaType = 'urban' | 'peri-urban' | 'rural';

export interface Parcel {
  id?: number | string;
  designation: string;
  points: Array<{ id: string; y: number; x: number; status?: string; description?: string }>;
  areaResult?: AreaComputeResponse;
  geometry?: any;
  status?: 'draft' | 'finalized' | 'approved';
}

export interface ComplianceValidation {
  pass: boolean;
  ratio: number;
  tolerance: number;
  areaType: AreaType;
  regulation: string;
  message: string;
}

/**
 * Calculate closure gap from traverse residuals
 * Closure gap = √(ΣdY² + ΣdX²)
 */
export function calculateClosureGap(parcel: Parcel): number {
  if (!parcel.areaResult?.residuals) return 0;
  const sumDy = parcel.areaResult.residuals.sumDy || 0;
  const sumDx = parcel.areaResult.residuals.sumDx || 0;
  return Math.sqrt(sumDy * sumDy + sumDx * sumDx);
}

/**
 * Calculate closure ratio: Perimeter / Closure Error
 * SI 727/1979 Regulation 13(2)(c)(iv)
 * @returns Ratio value (e.g., 19789 for "1:19,789")
 */
export function calculateClosureRatio(parcel: Parcel): number {
  const closureError = calculateClosureGap(parcel);
  if (closureError === 0 || !parcel.areaResult?.residuals?.edges) return Infinity;
  
  // Calculate perimeter from edge distances
  const perimeter = parcel.areaResult.residuals.edges
    .reduce((sum, edge) => sum + edge.distance, 0);
  
  return perimeter / closureError;
}

/**
 * Get tolerance ratio required by SI 727/1979 Regulation 13(3)
 * @param areaType - Urban, peri-urban, or rural
 * @returns Required tolerance ratio
 */
export function getSI727Tolerance(areaType: AreaType): number {
  switch (areaType) {
    case 'urban':
      return 5000;  // SI 727/1979 Reg 13(3)(a)
    case 'peri-urban':
      return 4000;  // SI 727/1979 Reg 13(3)(c)
    case 'rural':
      return 3000;  // SI 727/1979 Reg 13(3)(b)
    default:
      return 4000;  // Default to peri-urban
  }
}

/**
 * Validate parcel closure against SI 727/1979 requirements
 * @returns Validation result with pass/fail status
 */
export function validateSI727Compliance(parcel: Parcel, areaType: AreaType): ComplianceValidation {
  const ratio = calculateClosureRatio(parcel);
  const tolerance = getSI727Tolerance(areaType);
  const pass = ratio >= tolerance;
  
  return {
    pass,
    ratio,
    tolerance,
    areaType,
    regulation: 'SI 727/1979 Reg 13(3)',
    message: `${pass ? '✅' : '❌'} Ratio 1:${Math.round(ratio)} ${pass ? '≥' : '<'} 1:${tolerance} (${areaType})`
  };
}

/**
 * Get closure gap status text (legacy quality indicator)
 * Note: SI 727/1979 validation should be used as authoritative measure
 */
export function getClosureGapStatus(parcel: Parcel): string {
  const gap = calculateClosureGap(parcel);
  if (gap < 0.05) return 'Excellent';
  if (gap < 0.20) return 'Good';
  if (gap < 0.50) return 'Acceptable';
  if (gap < 2.00) return 'Poor - Check measurements';
  return 'Failed - Reorder points';
}

/**
 * Format area for display (m² or ha)
 */
export function formatArea(area: { display: { hectares?: number; square_meters?: number; unit: string } }): string {
  if (area.display.unit === 'ha') {
    const hectares = area.display.hectares ?? 0;
    return `${hectares.toFixed(4)} ha`;
  }
  const squareMeters = area.display.square_meters ?? 0;
  return `${squareMeters.toFixed(2)} m²`;
}

/**
 * Format coordinate for display
 */
export function formatCoordinate(value: number): string {
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: 3, 
    maximumFractionDigits: 3 
  });
}

/**
 * Get area type label with tolerance
 */
export function getAreaTypeLabel(areaType: AreaType): string {
  const tolerance = getSI727Tolerance(areaType);
  const labels: Record<AreaType, string> = {
    'urban': `Urban (1:${tolerance.toLocaleString()})`,
    'peri-urban': `Peri-Urban (1:${tolerance.toLocaleString()})`,
    'rural': `Rural (1:${tolerance.toLocaleString()})`
  };
  return labels[areaType];
}

/**
 * Composable export for use in Vue components
 */
export function useAreaCompliance() {
  return {
    calculateClosureGap,
    calculateClosureRatio,
    getSI727Tolerance,
    validateSI727Compliance,
    getClosureGapStatus,
    formatArea,
    formatCoordinate,
    getAreaTypeLabel
  };
}
