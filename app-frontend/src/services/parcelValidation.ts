/**
 * Unified Parcel Validation Service
 * Combines client-side geometry validation with backend spatial checks
 * Used across Cadastral Standard and Lite modules for consistent validation
 */

import api from './api';
import { useParcelGeometry } from '../composables/useParcelGeometry';

export interface ValidationError {
  type: 'geometry' | 'overlap' | 'duplicate_name' | 'self_intersection';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  details?: string;
  existingParcelId?: number;
  existingParcelName?: string;
  overlapPercent?: number;
  overlapAreaM2?: number;
}

export interface ValidationWarning {
  type: 'shape_quality' | 'closure' | 'spike' | 'minor_overlap';
  message: string;
  details?: string;
}

export interface ValidationResult {
  isValid: boolean;
  canSave: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: {
    criticalIssues: number;
    highPriorityIssues: number;
    mediumIssues: number;
    lowIssues: number;
  };
}

function isOutsideFigureParcelName(name?: string): boolean {
  return (name || '').toLowerCase().includes('outside figure');
}

export interface BackendDuplicateCheck {
  hasDuplicates: boolean;
  duplicateCount: number;
  duplicates: Array<{
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    existing_id: number;
    existing_stand: string;
    overlap_area_m2?: string;
    overlap_percent?: number;
    message: string;
    details?: string;
  }>;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Validate parcel geometry and check for overlaps
 * Combines client-side and backend validation
 */
export async function validateParcel(
  projectId: number,
  designation: string,
  boundaryPoints: Array<{ id: string; y: number; x: number }>,
  allPoints: Array<{ id?: string; pointId?: string; y: number; x: number; [key: string]: any }>,
  geometry?: GeoJSON.Polygon,
  excludeParcelId?: number
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // ========== PHASE 1: Client-Side Geometry Validation ==========
  console.log('[ParcelValidation] Phase 1: Client-side geometry checks...');
  console.log('[ParcelValidation] Boundary points:', boundaryPoints.length);
  console.log('[ParcelValidation] All points:', allPoints.length);
  console.log('[ParcelValidation] Designation:', designation);
  
  const { generatePolygon } = useParcelGeometry();
  
  // Convert input points to AdjustedCoordinate format
  const adjustedPoints = allPoints.map(p => {
    const pointId = p.pointId || p.id || '';
    if (!pointId) {
      console.warn('[ParcelValidation] Point missing ID:', p);
    }
    return {
      pointId,
      y: p.y,
      x: p.x,
      status: p.status || 'PEG',
      description: p.description || '',
      surveyDate: p.surveyDate || new Date().toISOString().split('T')[0],
      fieldBookPage: p.fieldBookPage || '',
      calculationsPage: p.calculationsPage || 0,
      adjustment: p.adjustment || {
        isDuplicate: false,
        observationCount: 1,
        method: 'gps' as const
      }
    };
  });
  
  const geometryResult = generatePolygon(
    boundaryPoints.map(p => p.id),
    adjustedPoints
  );

  console.log('[ParcelValidation] Geometry generation result:', geometryResult ? 'SUCCESS' : 'FAILED');
  
  if (!geometryResult) {
    console.error('[ParcelValidation] Failed to generate polygon');
    console.error('[ParcelValidation] Boundary point IDs:', boundaryPoints.map(p => p.id));
    console.error('[ParcelValidation] Adjusted point IDs:', adjustedPoints.map(p => p.pointId));
    
    errors.push({
      type: 'geometry',
      severity: 'critical',
      message: 'Invalid polygon geometry',
      details: 'Could not generate valid polygon from selected points'
    });
    
    return {
      isValid: false,
      canSave: false,
      errors,
      warnings,
      summary: { criticalIssues: 1, highPriorityIssues: 0, mediumIssues: 0, lowIssues: 0 }
    };
  }

  // Check validation results from composable
  if (!geometryResult.validation.isValid) {
    geometryResult.validation.errors.forEach(err => {
      errors.push({
        type: 'self_intersection',
        severity: 'critical',
        message: err,
        details: 'Polygon has self-intersecting boundaries'
      });
    });
  }

  // Add warnings from geometry validation
  geometryResult.validation.warnings.forEach(warn => {
    warnings.push({
      type: 'shape_quality',
      message: warn
    });
  });

  console.log(`[ParcelValidation] Geometry validation: ${errors.length} errors, ${warnings.length} warnings`);

  // ========== PHASE 2: Backend Spatial Validation ==========
  console.log('[ParcelValidation] Phase 2: Backend spatial checks (PostGIS)...');
  
  try {
    // Use provided geometry or generate from points
    const geomToCheck = geometry || geometryResult.geoJSON.geometry;
    
    // Call backend duplicate check API
    const response = await api.post('/land-parcels/check-duplicates', {
      project_id: projectId,
      stand: designation,
      geom: geomToCheck,
      exclude_id: excludeParcelId || null
    });

    const backendCheck: BackendDuplicateCheck = response.data;

    if (backendCheck.hasDuplicates) {
      console.log(`[ParcelValidation] Found ${backendCheck.duplicateCount} conflicts`);
      
      // Convert backend duplicates to validation errors
      backendCheck.duplicates.forEach(dup => {
        const isOverlapType = dup.type.includes('overlap');
        const isOutsideFigureOverlap =
          isOverlapType &&
          (isOutsideFigureParcelName(dup.existing_stand) || isOutsideFigureParcelName(designation));

        if (isOutsideFigureOverlap) {
          const reason = isOutsideFigureParcelName(dup.existing_stand)
            ? `Subdivision inside encapsulating parcel "${dup.existing_stand}"`
            : `Encapsulating parcel "${designation}" over existing subdivision "${dup.existing_stand}"`;
          warnings.push({
            type: 'minor_overlap',
            message: reason,
            details: dup.details || dup.message
          });
          return;
        }

        const error: ValidationError = {
          type: isOverlapType ? 'overlap' : 'duplicate_name',
          severity: dup.severity,
          message: dup.message,
          details: dup.details,
          existingParcelId: dup.existing_id,
          existingParcelName: dup.existing_stand
        };

        if (dup.overlap_percent !== undefined) {
          error.overlapPercent = dup.overlap_percent;
        }
        if (dup.overlap_area_m2) {
          error.overlapAreaM2 = parseFloat(dup.overlap_area_m2);
        }

        // Critical and high severity = errors (block save)
        // Medium and low = warnings (allow with confirmation)
        if (dup.severity === 'critical' || dup.severity === 'high') {
          errors.push(error);
        } else {
          warnings.push({
            type: 'minor_overlap',
            message: dup.message,
            details: dup.details
          });
        }
      });
    } else {
      console.log('[ParcelValidation] ✅ No spatial conflicts detected');
    }
  } catch (error) {
    console.error('[ParcelValidation] Backend validation failed:', error);
    // Don't block on backend failure, but add warning
    warnings.push({
      type: 'shape_quality',
      message: 'Backend validation unavailable',
      details: 'Could not verify against database. Proceed with caution.'
    });
  }

  // ========== PHASE 3: Compile Results ==========
  const summary = {
    criticalIssues: errors.filter(e => e.severity === 'critical').length,
    highPriorityIssues: errors.filter(e => e.severity === 'high').length,
    mediumIssues: errors.filter(e => e.severity === 'medium').length,
    lowIssues: errors.filter(e => e.severity === 'low').length
  };

  const isValid = errors.length === 0;
  const canSave = summary.criticalIssues === 0 && summary.highPriorityIssues === 0;

  console.log('[ParcelValidation] Final result:', {
    isValid,
    canSave,
    errors: errors.length,
    warnings: warnings.length,
    summary
  });

  return {
    isValid,
    canSave,
    errors,
    warnings,
    summary
  };
}

/**
 * Format validation result as user-friendly message
 */
export function formatValidationMessage(result: ValidationResult): string {
  let message = '';

  if (result.errors.length > 0) {
    const critical = result.errors.filter(e => e.severity === 'critical');
    const high = result.errors.filter(e => e.severity === 'high');

    if (critical.length > 0) {
      message += `🚫 CRITICAL ISSUES (${critical.length}):\n`;
      critical.forEach((e, i) => {
        message += `  ${i + 1}. ${e.message}\n`;
        if (e.details) message += `     ${e.details}\n`;
        if (e.overlapPercent) message += `     • Overlap: ${e.overlapPercent.toFixed(1)}%\n`;
      });
      message += '\n';
    }

    if (high.length > 0) {
      message += `⚠️ HIGH PRIORITY (${high.length}):\n`;
      high.forEach((e, i) => {
        message += `  ${i + 1}. ${e.message}\n`;
        if (e.details) message += `     ${e.details}\n`;
        if (e.overlapPercent) message += `     • Overlap: ${e.overlapPercent.toFixed(1)}%\n`;
      });
      message += '\n';
    }
  }

  if (result.warnings.length > 0) {
    message += `ℹ️ WARNINGS (${result.warnings.length}):\n`;
    result.warnings.forEach((w, i) => {
      message += `  ${i + 1}. ${w.message}\n`;
    });
    message += '\n';
  }

  if (!result.canSave) {
    message += `\n❌ Cannot save: Critical or high-priority conflicts detected.\n`;
    message += `Please:\n`;
    message += `• Use a different parcel designation\n`;
    message += `• Adjust polygon boundaries to avoid overlaps\n`;
    message += `• Check if this parcel already exists\n`;
  }

  return message;
}

/**
 * Quick check for duplicate designation only (lightweight)
 */
export async function checkDuplicateDesignation(
  projectId: number,
  designation: string,
  excludeParcelId?: number
): Promise<boolean> {
  try {
    const response = await api.get('/parcels/check-designation', {
      params: {
        project_id: projectId,
        designation: designation,
        exclude_id: excludeParcelId
      }
    });
    return response.data.exists;
  } catch (error) {
    console.error('[ParcelValidation] Designation check failed:', error);
    return false;
  }
}
