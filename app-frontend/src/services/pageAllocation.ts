/**
 * Page Allocation Service
 * Handles two-pass PDF generation to resolve circular dependencies
 * between Coordinate List and Calculation Sheets
 * 
 * ENHANCED: Now uses Expert Page Predictor for accurate page count estimation
 */

import type { SurveyPoint } from '@/utils/coordinate-list';
import { expertPagePredictor, type PagePrediction } from './pageNumberingExpert';
import { paginateFieldBook } from '@/utils/fieldBookPagination';

export interface PageAllocation {
  coverPage: {
    physicalStart: number;
    physicalEnd: number;
    displayStart: null;
    displayEnd: null;
    pageCount: number;
  };
  fieldBook: {
    physicalStart: number;
    physicalEnd: number;
    displayStart: string;
    displayEnd: string;
    pageCount: number;
  };
  coordinateList: {
    physicalStart: number;
    physicalEnd: number;
    displayStart: number;
    displayEnd: number;
    pageCount: number;
  };
  calculations: {
    physicalStart: number;
    physicalEnd: number;
    displayStart: number;
    displayEnd: number;
    pageCount: number;
  };
  areas: {
    physicalStart: number;
    physicalEnd: number;
    displayStart: number;
    displayEnd: number;
    pageCount: number;
  };
}

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

export class PageAllocationService {
  /**
   * Calculate all page numbers for the complete document (Pass 1)
   * ENHANCED: Uses Expert Page Predictor for accurate predictions
   */
  calculateAllPageNumbers(data: {
    observations?: any[];
    points: SurveyPoint[];
    duplicateAnalyses: DuplicateAnalysis[];
    parcels: Parcel[];
  }): PageAllocation {
    console.log('[PageAllocation] 🎯 Using Expert Page Predictor...');
    
    // Cover Page: Always 2 pages
    // This assumption now only holds for this deprecated legacy (single-pass) path; the
    // two-pass generator's cover can spill to 3 pages when the enclosed-documents list is long,
    // and reads the real page count from the generated PDF instead (see comprehensive-document.ts).
    const coverPageCount = 2;
    
    // Field Book: Calculate based on observations (max 99 pages)
    const { ePages, physicalPages } = this.calculateFieldBookPages(data.observations || []);
    
    // Use Expert Page Predictor for accurate page counts
    const prediction = expertPagePredictor.predictPageCounts({
      points: data.points,
      duplicateAnalyses: data.duplicateAnalyses,
      parcels: data.parcels
    });
    
    console.log('[PageAllocation] 📊 Expert Prediction:', {
      coordinateList: prediction.coordinateListPages,
      calculations: prediction.calculationsPages,
      areas: prediction.areasPages,
      confidence: `${(prediction.confidence * 100).toFixed(1)}%`,
      method: prediction.method
    });
    
    // Use predicted page counts instead of simple estimates
    const coordinateListPageCount = prediction.coordinateListPages;
    const calculationsPageCount = prediction.calculationsPages;
    const areasPageCount = prediction.areasPages;
    
    // Allocate physical and display page numbers
    let currentPhysicalPage = 1;
    
    // Cover Page (Physical 1-2, No display numbers)
    const coverPage = {
      physicalStart: currentPhysicalPage,
      physicalEnd: currentPhysicalPage + coverPageCount - 1,
      displayStart: null,
      displayEnd: null,
      pageCount: coverPageCount
    };
    currentPhysicalPage += coverPageCount;
    
    // Field Book: the cover is physical but unnumbered, so the physical span is
    // one longer than the E span.
    const fieldBook = {
      physicalStart: currentPhysicalPage,
      physicalEnd: currentPhysicalPage + physicalPages - 1,
      displayStart: 'E1',
      displayEnd: `E${ePages}`,
      pageCount: physicalPages
    };
    currentPhysicalPage += physicalPages;
    
    // Coordinate List (Physical 102-118, Display 100-116)
    const coordinateList = {
      physicalStart: currentPhysicalPage,
      physicalEnd: currentPhysicalPage + coordinateListPageCount - 1,
      displayStart: 100,
      displayEnd: 100 + coordinateListPageCount - 1,
      pageCount: coordinateListPageCount
    };
    currentPhysicalPage += coordinateListPageCount;
    
    // Calculation Sheets (Physical 119+, Display 117+)
    const calculations = {
      physicalStart: currentPhysicalPage,
      physicalEnd: currentPhysicalPage + calculationsPageCount - 1,
      displayStart: coordinateList.displayEnd + 1,
      displayEnd: coordinateList.displayEnd + calculationsPageCount,
      pageCount: calculationsPageCount
    };
    currentPhysicalPage += calculationsPageCount;
    
    // Area & Consistency (Physical 146+, Display 144+)
    const areas = {
      physicalStart: currentPhysicalPage,
      physicalEnd: currentPhysicalPage + areasPageCount - 1,
      displayStart: calculations.displayEnd + 1,
      displayEnd: calculations.displayEnd + areasPageCount,
      pageCount: areasPageCount
    };
    
    return {
      coverPage,
      fieldBook,
      coordinateList,
      calculations,
      areas
    };
  }
  
  /**
   * Calculate Field Book page count (max 99 pages)
   * Uses survey points count since Field Book contains all survey points
   */
  private calculateFieldBookPages(observations: any[]): { ePages: number; physicalPages: number } {
    const { ePageCount, physicalPageCount } = paginateFieldBook(
      (observations || []).map(obs => ({ id: obs.pointId })),
      // The cover page does not exist yet (Task 10 adds it and flips this to
      // true everywhere at once); until then the E count and physical count
      // are the same.
      { hasCalibration: false, hasCover: false },
    );

    // At least one page even for an empty survey, and the SGO caps the book at 99.
    const ePages = Math.min(Math.max(ePageCount, 1), 99);
    return { ePages, physicalPages: Math.max(physicalPageCount, ePages) };
  }
  
  /**
   * Calculate Coordinate List page count
   */
  private calculateCoordinateListPages(points: SurveyPoint[]): number {
    if (!points || points.length === 0) {
      return 1;
    }
    
    // Estimate: ~30 points per page (with cross-references)
    const estimatedPages = Math.ceil(points.length / 30);
    
    return Math.max(estimatedPages, 1);
  }
  
  /**
   * Calculate Calculation Sheets page count
   */
  private calculateCalculationsPages(duplicateAnalyses: DuplicateAnalysis[]): number {
    if (!duplicateAnalyses || duplicateAnalyses.length === 0) {
      return 1; // At least 1 page for "No duplicates" message
    }
    
    // Estimate: ~3-4 duplicate analyses per page
    const estimatedPages = Math.ceil(duplicateAnalyses.length / 3);
    
    // Add 1 page for summary
    return estimatedPages + 1;
  }
  
  /**
   * Calculate Area & Consistency page count
   */
  private calculateAreasPages(parcels: Parcel[]): number {
    if (!parcels || parcels.length === 0) {
      return 1;
    }
    
    // Estimate: ~2-3 parcels per page (with traverse tables)
    const estimatedPages = Math.ceil(parcels.length / 2);
    
    return Math.max(estimatedPages, 1);
  }
  
  /**
   * Create Field Book page lookup (Point ID → Field Book Page)
   */
  createFieldBookLookup(observations: any[]): Record<string, string> {
    // Was 20 points per page here and 27 everywhere else, so every point past the
    // 20th got the wrong E-number.
    return paginateFieldBook(
      (observations || []).filter(obs => obs.pointId).map(obs => ({ id: obs.pointId })),
      { hasCalibration: false, hasCover: false },
    ).pointPageMap;
  }
  
  /**
   * Create Calculation page lookup (Point ID → Calculation Page)
   * This is the key to resolving the circular dependency!
   * 
   * IMPORTANT: The calculations sheet contains:
   * 1. Duplicate analyses (detailed calculations)
   * 2. Found beacons section (simple table)
   * 3. Placed beacons section (simple table)
   * 
   * ALL points that appear in calculations must be mapped!
   */
  createCalcPageLookup(
    duplicateAnalyses: DuplicateAnalysis[],
    startPage: number
  ): Record<string, number> {
    const lookup: Record<string, number> = {};
    
    if (!duplicateAnalyses || duplicateAnalyses.length === 0) {
      return lookup;
    }
    
    // Estimate: ~3-4 analyses per page
    const analysesPerPage = 3;
    
    // Map duplicate analyses to their pages
    duplicateAnalyses.forEach((analysis, index) => {
      const pageOffset = Math.floor(index / analysesPerPage);
      const calcPage = startPage + pageOffset;
      
      lookup[analysis.pointId] = calcPage;
    });
    
    // ⚠️ NOTE: This only maps duplicate analyses!
    // Found beacons and placed beacons are NOT mapped here.
    // The ACTUAL mapping comes from calculations-part1.ts which knows
    // exactly which points appear on which pages.
    // 
    // This estimated lookup is only used as a fallback during the first pass.
    // The comprehensive document generator should use the actual lookup
    // returned by calculations-part1.ts generation.
    
    console.log('[PageAllocation] 📊 Calc page lookup created (ESTIMATE - duplicates only):', {
      duplicatePoints: duplicateAnalyses.length,
      startPage,
      totalMapped: Object.keys(lookup).length
    });
    
    return lookup;
  }
  
  /**
   * Get display page number from physical page number
   */
  getDisplayPageNumber(physicalPage: number, allocation: PageAllocation): string | number | null {
    // Cover Page: No display numbers
    if (physicalPage >= allocation.coverPage.physicalStart && 
        physicalPage <= allocation.coverPage.physicalEnd) {
      return null;
    }
    
    // Field Book: E1, E2, etc.
    if (physicalPage >= allocation.fieldBook.physicalStart && 
        physicalPage <= allocation.fieldBook.physicalEnd) {
      const offset = physicalPage - allocation.fieldBook.physicalStart;
      return `E${offset + 1}`;
    }
    
    // Coordinate List: 100, 101, etc.
    if (physicalPage >= allocation.coordinateList.physicalStart && 
        physicalPage <= allocation.coordinateList.physicalEnd) {
      const offset = physicalPage - allocation.coordinateList.physicalStart;
      return allocation.coordinateList.displayStart + offset;
    }
    
    // Calculation Sheets: 117, 118, etc.
    if (physicalPage >= allocation.calculations.physicalStart && 
        physicalPage <= allocation.calculations.physicalEnd) {
      const offset = physicalPage - allocation.calculations.physicalStart;
      return allocation.calculations.displayStart + offset;
    }
    
    // Area & Consistency: 144, 145, etc.
    if (physicalPage >= allocation.areas.physicalStart && 
        physicalPage <= allocation.areas.physicalEnd) {
      const offset = physicalPage - allocation.areas.physicalStart;
      return allocation.areas.displayStart + offset;
    }
    
    return null;
  }
}
