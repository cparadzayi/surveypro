/**
 * Expert Page Numbering System
 * 
 * Solves the cyclic dependency problem in cross-document page numbering
 * using rule-based predictions with ML data collection for future training.
 * 
 * Problem: Coordinate List needs to reference Calculations pages,
 * but Calculations start page depends on Coordinate List size!
 * 
 * Solution: Predict page counts accurately using expert rules,
 * then verify and log for ML training.
 */

import type { SurveyPoint } from '@/utils/coordinate-list';

export interface DuplicateAnalysis {
  pointId: string;
  observations: Array<{
    y: number;
    x: number;
    fieldBookPage?: string;
  }>;
  meanY: number;
  meanX: number;
  standardDeviationY: number;
  standardDeviationX: number;
}

export interface Parcel {
  id?: string;
  name: string;
  coordinates: Array<{ x: number; y: number }>;
  area?: number;
}

export interface PagePrediction {
  coordinateListPages: number;
  calculationsPages: number;
  areasPages: number;
  confidence: number; // 0.0 to 1.0
  method: 'expert-rules' | 'ml-prediction' | 'fallback-estimate';
  breakdown: {
    coordinateList: {
      basePages: number;
      controlPointAdjustment: number;
      longCoordinateAdjustment: number;
      crossReferenceAdjustment: number;
      duplicateAdjustment: number;
    };
    calculations: {
      basePages: number;
      complexityAdjustment: number;
      summaryPages: number;
    };
    areas: {
      basePages: number;
      complexityAdjustment: number;
    };
  };
}

export interface DocumentGenerationLog {
  timestamp: Date;
  projectId?: string;
  
  // Input features
  features: {
    totalPoints: number;
    controlPoints: number;
    surveyPoints: number;
    duplicatePoints: number;
    avgCoordinateDigits: number;
    hasCalculationRefs: boolean;
    hasFieldBookRefs: boolean;
    duplicateAnalyses: number;
    totalObservations: number;
    avgObservationsPerDuplicate: number;
    hasComplexCalculations: boolean;
    totalParcels: number;
    avgVerticesPerParcel: number;
    hasComplexParcels: boolean;
    totalVertices: number;
  };
  
  // Predicted results
  predicted: {
    coordinateListPages: number;
    calculationsPages: number;
    areasPages: number;
    confidence: number;
    method: string;
  };
  
  // Actual results (filled in after generation)
  actual: {
    coordinateListPages: number;
    calculationsPages: number;
    areasPages: number;
  };
  
  // Error metrics
  errors: {
    coordinateListError: number;
    calculationsError: number;
    areasError: number;
    totalError: number;
  };
}

/**
 * Expert Page Numbering Predictor
 * 
 * Uses rule-based logic derived from surveying standards and empirical data
 * to accurately predict page counts for each document section.
 */
export class ExpertPagePredictor {
  private logs: DocumentGenerationLog[] = [];
  
  constructor() {
    this.loadLogs();
  }
  
  /**
   * Predict page counts for all document sections
   */
  predictPageCounts(data: {
    points: SurveyPoint[];
    duplicateAnalyses: DuplicateAnalysis[];
    parcels: Parcel[];
  }): PagePrediction {
    console.log('[ExpertPredictor] 🎯 Predicting page counts...');
    
    // Extract features
    const features = this.extractFeatures(data);
    
    // Predict each section
    const coordListPrediction = this.predictCoordinateListPages(data.points, data.duplicateAnalyses);
    const calcPrediction = this.predictCalculationsPages(data.duplicateAnalyses);
    const areasPrediction = this.predictAreasPages(data.parcels);
    
    const prediction: PagePrediction = {
      coordinateListPages: coordListPrediction.pages,
      calculationsPages: calcPrediction.pages,
      areasPages: areasPrediction.pages,
      confidence: this.calculateConfidence(features),
      method: 'expert-rules',
      breakdown: {
        coordinateList: coordListPrediction.breakdown,
        calculations: calcPrediction.breakdown,
        areas: areasPrediction.breakdown
      }
    };
    
    console.log('[ExpertPredictor] 📊 Prediction:', {
      coordinateList: prediction.coordinateListPages,
      calculations: prediction.calculationsPages,
      areas: prediction.areasPages,
      confidence: `${(prediction.confidence * 100).toFixed(1)}%`
    });
    
    console.log('[ExpertPredictor] 📋 Breakdown:', prediction.breakdown);
    
    // Create log entry for ML training (actual values will be filled in later)
    const log: DocumentGenerationLog = {
      timestamp: new Date(),
      features,
      predicted: {
        coordinateListPages: prediction.coordinateListPages,
        calculationsPages: prediction.calculationsPages,
        areasPages: prediction.areasPages,
        confidence: prediction.confidence,
        method: prediction.method
      },
      actual: {
        coordinateListPages: 0, // To be filled in
        calculationsPages: 0,
        areasPages: 0
      },
      errors: {
        coordinateListError: 0,
        calculationsError: 0,
        areasError: 0,
        totalError: 0
      }
    };
    
    this.logs.push(log);
    
    return prediction;
  }
  
  /**
   * Predict Coordinate List page count
   * 
   * Rules derived from SI 727 standards and empirical data:
   * - Base: ~30 points per page (with cross-references)
   * - Control points need more spacing (+1 page per 10 control points)
   * - Long coordinates (7+ digits) reduce density (+1 page if >50%)
   * - Cross-references add overhead (+1 page if present)
   * - Duplicate points listed separately (+1 page per 20 duplicates)
   */
  private predictCoordinateListPages(
    points: SurveyPoint[],
    duplicates: DuplicateAnalysis[]
  ): { pages: number; breakdown: any } {
    const totalPoints = points.length;
    
    // Base calculation: 30 points per page (empirical average with cross-refs)
    const basePages = Math.ceil(totalPoints / 30);
    
    // Rule 1: Control points need more spacing
    const controlPoints = points.filter(p => {
      const desc = (p.description || '').toUpperCase();
      const status = (p.status || '').toUpperCase();
      return desc.includes('TRIG') || status === 'F';
    }).length;
    const controlPointAdjustment = Math.ceil(controlPoints / 10);
    
    // Rule 2: Long coordinates reduce density
    const longCoords = points.filter(p => {
      const yStr = p.y.toString().replace('.', '').replace('-', '');
      const xStr = p.x.toString().replace('.', '').replace('-', '');
      return yStr.length > 7 || xStr.length > 7;
    }).length;
    const longCoordinateAdjustment = longCoords > totalPoints * 0.5 ? 1 : 0;
    
    // Rule 3: Cross-references add overhead
    const hasCrossRefs = duplicates.length > 0;
    const crossReferenceAdjustment = hasCrossRefs ? 1 : 0;
    
    // Rule 4: Duplicate points listed separately
    const duplicateAdjustment = Math.ceil(duplicates.length / 20);
    
    const totalPages = basePages + 
                      controlPointAdjustment + 
                      longCoordinateAdjustment + 
                      crossReferenceAdjustment + 
                      duplicateAdjustment;
    
    return {
      pages: Math.max(totalPages, 1),
      breakdown: {
        basePages,
        controlPointAdjustment,
        longCoordinateAdjustment,
        crossReferenceAdjustment,
        duplicateAdjustment
      }
    };
  }
  
  /**
   * Predict Calculations Part 1 page count
   * 
   * Rules:
   * - Base: ~3 duplicate analyses per page
   * - Complex calculations (high std dev) need more space
   * - Many observations per duplicate reduce density
   * - Always add 1 page for summary
   */
  private predictCalculationsPages(
    duplicates: DuplicateAnalysis[]
  ): { pages: number; breakdown: any } {
    if (duplicates.length === 0) {
      return {
        pages: 1,
        breakdown: {
          basePages: 1,
          complexityAdjustment: 0,
          summaryPages: 0
        }
      };
    }
    
    // Base calculation: 3 analyses per page
    const basePages = Math.ceil(duplicates.length / 3);
    
    // Rule 1: Complex calculations need more space
    const complexDuplicates = duplicates.filter(d => {
      const hasMany = d.observations.length > 5;
      const highStdDev = d.standardDeviationY > 0.01 || d.standardDeviationX > 0.01;
      return hasMany || highStdDev;
    }).length;
    
    const complexityRatio = complexDuplicates / duplicates.length;
    const complexityAdjustment = complexityRatio > 0.3 ? Math.ceil(duplicates.length / 5) : 0;
    
    // Rule 2: Summary page
    const summaryPages = 1;
    
    const totalPages = basePages + complexityAdjustment + summaryPages;
    
    return {
      pages: totalPages,
      breakdown: {
        basePages,
        complexityAdjustment,
        summaryPages
      }
    };
  }
  
  /**
   * Predict Areas & Consistency page count
   * 
   * Rules:
   * - Base: ~2 parcels per page (with traverse tables)
   * - Complex parcels (>20 vertices) need full page
   * - Simple parcels (<10 vertices) can fit 3 per page
   */
  private predictAreasPages(
    parcels: Parcel[]
  ): { pages: number; breakdown: any } {
    if (parcels.length === 0) {
      return {
        pages: 1,
        breakdown: {
          basePages: 1,
          complexityAdjustment: 0
        }
      };
    }
    
    // Classify parcels by complexity
    const simpleParcels = parcels.filter(p => p.coordinates.length < 10).length;
    const normalParcels = parcels.filter(p => 
      p.coordinates.length >= 10 && p.coordinates.length <= 20
    ).length;
    const complexParcels = parcels.filter(p => p.coordinates.length > 20).length;
    
    // Calculate pages needed
    const simplePages = Math.ceil(simpleParcels / 3);
    const normalPages = Math.ceil(normalParcels / 2);
    const complexPages = complexParcels; // 1 page each
    
    const basePages = simplePages + normalPages + complexPages;
    
    // Rule: Add buffer for very complex parcels
    const veryComplexParcels = parcels.filter(p => p.coordinates.length > 30).length;
    const complexityAdjustment = veryComplexParcels > 0 ? 1 : 0;
    
    const totalPages = basePages + complexityAdjustment;
    
    return {
      pages: Math.max(totalPages, 1),
      breakdown: {
        basePages,
        complexityAdjustment
      }
    };
  }
  
  /**
   * Calculate confidence score based on data characteristics
   * 
   * Higher confidence when:
   * - Typical point counts (50-500)
   * - Normal coordinate lengths (6-8 digits)
   * - Moderate duplicate count (5-20)
   * - Standard parcel complexity
   */
  private calculateConfidence(features: any): number {
    let confidence = 0.85; // Base confidence for expert rules
    
    // Adjust based on data characteristics
    
    // Point count confidence
    if (features.totalPoints < 20 || features.totalPoints > 1000) {
      confidence -= 0.05; // Less confident with extreme counts
    }
    
    // Duplicate count confidence
    if (features.duplicateAnalyses > 50) {
      confidence -= 0.05; // Many duplicates harder to predict
    }
    
    // Parcel complexity confidence
    if (features.hasComplexParcels) {
      confidence -= 0.03; // Complex parcels vary more
    }
    
    // Coordinate length confidence
    if (features.avgCoordinateDigits < 6 || features.avgCoordinateDigits > 9) {
      confidence -= 0.02; // Unusual coordinate formats
    }
    
    return Math.max(confidence, 0.70); // Minimum 70% confidence
  }
  
  /**
   * Extract features for ML training
   */
  private extractFeatures(data: {
    points: SurveyPoint[];
    duplicateAnalyses: DuplicateAnalysis[];
    parcels: Parcel[];
  }) {
    const controlPoints = data.points.filter(p => {
      const desc = (p.description || '').toUpperCase();
      const status = (p.status || '').toUpperCase();
      return desc.includes('TRIG') || status === 'F';
    }).length;
    
    const surveyPoints = data.points.length - controlPoints;
    
    const avgCoordinateDigits = data.points.length > 0
      ? data.points.reduce((sum, p) => {
          const yDigits = p.y.toString().replace('.', '').replace('-', '').length;
          const xDigits = p.x.toString().replace('.', '').replace('-', '').length;
          return sum + (yDigits + xDigits) / 2;
        }, 0) / data.points.length
      : 0;
    
    const totalObservations = data.duplicateAnalyses.reduce(
      (sum, d) => sum + d.observations.length, 0
    );
    
    const avgObservationsPerDuplicate = data.duplicateAnalyses.length > 0
      ? totalObservations / data.duplicateAnalyses.length
      : 0;
    
    const hasComplexCalculations = data.duplicateAnalyses.some(d => 
      d.standardDeviationY > 0.01 || d.standardDeviationX > 0.01
    );
    
    const totalVertices = data.parcels.reduce(
      (sum, p) => sum + p.coordinates.length, 0
    );
    
    const avgVerticesPerParcel = data.parcels.length > 0
      ? totalVertices / data.parcels.length
      : 0;
    
    const hasComplexParcels = data.parcels.some(p => p.coordinates.length > 20);
    
    return {
      totalPoints: data.points.length,
      controlPoints,
      surveyPoints,
      duplicatePoints: data.duplicateAnalyses.length,
      avgCoordinateDigits,
      hasCalculationRefs: data.duplicateAnalyses.length > 0,
      hasFieldBookRefs: true,
      duplicateAnalyses: data.duplicateAnalyses.length,
      totalObservations,
      avgObservationsPerDuplicate,
      hasComplexCalculations,
      totalParcels: data.parcels.length,
      avgVerticesPerParcel,
      hasComplexParcels,
      totalVertices
    };
  }
  
  /**
   * Log actual results for ML training
   */
  logActualResults(actual: {
    coordinateListPages: number;
    calculationsPages: number;
    areasPages: number;
  }) {
    if (this.logs.length === 0) {
      console.warn('[ExpertPredictor] No prediction to log against');
      return;
    }
    
    const lastLog = this.logs[this.logs.length - 1];
    lastLog.actual = actual;
    
    // Calculate errors
    lastLog.errors = {
      coordinateListError: Math.abs(actual.coordinateListPages - lastLog.predicted.coordinateListPages),
      calculationsError: Math.abs(actual.calculationsPages - lastLog.predicted.calculationsPages),
      areasError: Math.abs(actual.areasPages - lastLog.predicted.areasPages),
      totalError: Math.abs(actual.coordinateListPages - lastLog.predicted.coordinateListPages) +
                 Math.abs(actual.calculationsPages - lastLog.predicted.calculationsPages) +
                 Math.abs(actual.areasPages - lastLog.predicted.areasPages)
    };
    
    console.log('[ExpertPredictor] 📊 Actual vs Predicted:', {
      coordinateList: {
        predicted: lastLog.predicted.coordinateListPages,
        actual: actual.coordinateListPages,
        error: lastLog.errors.coordinateListError
      },
      calculations: {
        predicted: lastLog.predicted.calculationsPages,
        actual: actual.calculationsPages,
        error: lastLog.errors.calculationsError
      },
      areas: {
        predicted: lastLog.predicted.areasPages,
        actual: actual.areasPages,
        error: lastLog.errors.areasError
      },
      totalError: lastLog.errors.totalError
    });
    
    // Save logs
    this.saveLogs();
    
    // Send to backend for ML training
    this.sendToBackend(lastLog);
  }
  
  /**
   * Load logs from localStorage
   */
  private loadLogs() {
    try {
      const stored = localStorage.getItem('pageNumberingLogs');
      if (stored) {
        this.logs = JSON.parse(stored);
        console.log(`[ExpertPredictor] 📚 Loaded ${this.logs.length} training logs`);
      }
    } catch (error) {
      console.error('[ExpertPredictor] Failed to load logs:', error);
    }
  }
  
  /**
   * Save logs to localStorage
   */
  private saveLogs() {
    try {
      localStorage.setItem('pageNumberingLogs', JSON.stringify(this.logs));
      console.log(`[ExpertPredictor] 💾 Saved ${this.logs.length} training logs`);
    } catch (error) {
      console.error('[ExpertPredictor] Failed to save logs:', error);
    }
  }
  
  /**
   * Send log to backend for centralized ML training
   */
  private async sendToBackend(log: DocumentGenerationLog) {
    try {
      await fetch('/api/ml/page-numbering-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log)
      });
      console.log('[ExpertPredictor] 📤 Sent training data to backend');
    } catch (error) {
      console.log('[ExpertPredictor] ⚠️ Backend not available, data saved locally');
    }
  }
  
  /**
   * Export all training data for ML model training
   */
  exportTrainingData(): string {
    return JSON.stringify(this.logs, null, 2);
  }
  
  /**
   * Get training statistics
   */
  getStatistics() {
    if (this.logs.length === 0) {
      return null;
    }
    
    const completedLogs = this.logs.filter(log => log.actual.coordinateListPages > 0);
    
    if (completedLogs.length === 0) {
      return null;
    }
    
    const avgCoordListError = completedLogs.reduce((sum, log) => 
      sum + log.errors.coordinateListError, 0
    ) / completedLogs.length;
    
    const avgCalcError = completedLogs.reduce((sum, log) => 
      sum + log.errors.calculationsError, 0
    ) / completedLogs.length;
    
    const avgAreasError = completedLogs.reduce((sum, log) => 
      sum + log.errors.areasError, 0
    ) / completedLogs.length;
    
    const avgTotalError = completedLogs.reduce((sum, log) => 
      sum + log.errors.totalError, 0
    ) / completedLogs.length;
    
    return {
      totalPredictions: this.logs.length,
      completedPredictions: completedLogs.length,
      avgCoordListError: avgCoordListError.toFixed(2),
      avgCalcError: avgCalcError.toFixed(2),
      avgAreasError: avgAreasError.toFixed(2),
      avgTotalError: avgTotalError.toFixed(2),
      accuracy: {
        coordinateList: `${((1 - avgCoordListError / 10) * 100).toFixed(1)}%`,
        calculations: `${((1 - avgCalcError / 5) * 100).toFixed(1)}%`,
        areas: `${((1 - avgAreasError / 3) * 100).toFixed(1)}%`
      }
    };
  }
}

// Export singleton instance
export const expertPagePredictor = new ExpertPagePredictor();
