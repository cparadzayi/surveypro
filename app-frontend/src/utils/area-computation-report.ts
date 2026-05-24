/**
 * Area Computation PDF Report Generator
 * Generates professional PDF reports for land parcel area computations
 */

import jsPDF from 'jspdf';
import type { Parcel } from '../composables/useParcelManagement';

export interface AreaReportOptions {
  projectTitle: string;
  projectNumber?: string;
  surveyorName: string;
  surveyorLicense?: string;
  surveyDate: string;
  centralMeridian: number;
  district?: string;
}

/**
 * Generate Area Computation PDF Report
 */
export function generateAreaComputationReport(
  parcels: Parcel[],
  options: AreaReportOptions
): Blob {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  let yPos = 20;

  // Header
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('LAND PARCEL AREA COMPUTATION REPORT', 105, yPos, { align: 'center' });
  
  yPos += 10;
  pdf.setFontSize(12);
  pdf.text(options.projectTitle, 105, yPos, { align: 'center' });
  
  yPos += 15;

  // Project Information Box
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.5);
  pdf.rect(20, yPos, 170, 35);
  
  yPos += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  
  if (options.projectNumber) {
    pdf.text(`Project Number: ${options.projectNumber}`, 25, yPos);
    yPos += 6;
  }
  
  pdf.text(`Surveyor: ${options.surveyorName}`, 25, yPos);
  yPos += 6;
  
  if (options.surveyorLicense) {
    pdf.text(`License Number: ${options.surveyorLicense}`, 25, yPos);
    yPos += 6;
  }
  
  pdf.text(`Survey Date: ${options.surveyDate}`, 25, yPos);
  pdf.text(`Projection: Cape Lo ${options.centralMeridian}° (EPSG:${getSRID(options.centralMeridian)})`, 120, yPos);
  yPos += 6;
  
  if (options.district) {
    pdf.text(`District: ${options.district}`, 25, yPos);
  }
  
  yPos += 15;

  // Summary Statistics
  const totalArea = parcels.reduce((sum, p) => sum + (p.areaResult?.area.abs_m2 || 0), 0);
  const totalAreaHa = totalArea / 10000;
  const avgClosureError = parcels
    .filter(p => p.areaResult?.residuals)
    .reduce((sum, p) => sum + calculateClosureError(p), 0) / parcels.filter(p => p.areaResult?.residuals).length;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('SUMMARY', 20, yPos);
  yPos += 8;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  
  // Draw summary manually
  pdf.setFont('helvetica', 'bold');
  pdf.text('Total Parcels:', 25, yPos);
  pdf.setFont('helvetica', 'normal');
  pdf.text(parcels.length.toString(), 75, yPos);
  yPos += 6;
  
  pdf.setFont('helvetica', 'bold');
  pdf.text('Total Area:', 25, yPos);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${totalArea.toFixed(2)} m² (${totalAreaHa.toFixed(4)} ha)`, 75, yPos);
  yPos += 6;
  
  pdf.setFont('helvetica', 'bold');
  pdf.text('Average Closure Error:', 25, yPos);
  pdf.setFont('helvetica', 'normal');
  pdf.text(avgClosureError ? `${avgClosureError.toFixed(3)} m` : 'N/A', 75, yPos);
  yPos += 6;
  
  pdf.setFont('helvetica', 'bold');
  pdf.text('Computation Method:', 25, yPos);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Shoelace Formula with Traverse Adjustment', 75, yPos);
  yPos += 10;

  // Parcels Table
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('PARCEL DETAILS', 20, yPos);
  yPos += 5;

  // Draw parcels table header
  pdf.setFillColor(41, 128, 185);
  pdf.rect(20, yPos - 4, 170, 7, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text('Designation', 22, yPos);
  pdf.text('Points', 52, yPos);
  pdf.text('Area', 110, yPos);
  pdf.text('Closure', 145, yPos);
  pdf.text('Quality', 170, yPos);
  yPos += 4;
  
  // Draw parcels data
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  parcels.forEach((parcel, index) => {
    if (yPos > 270) {
      pdf.addPage();
      yPos = 20;
    }
    
    // Alternate row colors
    if (index % 2 === 0) {
      pdf.setFillColor(245, 245, 245);
      pdf.rect(20, yPos - 3, 170, 6, 'F');
    }
    
    const area = parcel.areaResult?.area;
    const areaDisplay = area ? 
      (area.abs_m2 >= 10000 ? `${(area.abs_m2 / 10000).toFixed(4)} ha` : `${area.abs_m2.toFixed(2)} m²`) : 
      'N/A';
    
    const closureError = parcel.areaResult?.residuals ? calculateClosureError(parcel) : null;
    const closureDisplay = closureError !== null ? `${closureError.toFixed(3)} m` : 'N/A';
    const quality = closureError !== null ? getClosureQuality(closureError) : 'N/A';
    
    pdf.setFont('helvetica', 'bold');
    pdf.text(parcel.designation.substring(0, 25), 22, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(parcel.points.length.toString(), 52, yPos);
    pdf.text(areaDisplay, 110, yPos);
    pdf.text(closureDisplay, 145, yPos);
    pdf.text(quality, 170, yPos);
    yPos += 6;
  });
  
  yPos += 5;

  // Add new page if needed for detailed breakdowns
  if (yPos > 250) {
    pdf.addPage();
    yPos = 20;
  }

  // Detailed Parcel Breakdown (one per parcel)
  parcels.forEach((parcel, index) => {
    if (yPos > 240) {
      pdf.addPage();
      yPos = 20;
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(`Parcel ${index + 1}: ${parcel.designation}`, 20, yPos);
    yPos += 7;

    if (parcel.areaResult) {
      const { area, centroid, residuals } = parcel.areaResult;
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      
      pdf.text(`Area: ${area.abs_m2 >= 10000 ? `${(area.abs_m2 / 10000).toFixed(4)} ha` : `${area.abs_m2.toFixed(2)} m²`}`, 25, yPos);
      yPos += 5;
      
      pdf.text(`Centroid: Y = ${centroid.y.toFixed(3)} m, X = ${centroid.x.toFixed(3)} m`, 25, yPos);
      yPos += 5;

      if (residuals) {
        const closureError = Math.sqrt(residuals.sumDy ** 2 + residuals.sumDx ** 2);
        pdf.text(`Closure: ΣdY = ${residuals.sumDy.toFixed(3)} m, ΣdX = ${residuals.sumDx.toFixed(3)} m`, 25, yPos);
        yPos += 5;
        pdf.text(`Closure Error: ${closureError.toFixed(3)} m (${getClosureQuality(closureError)})`, 25, yPos);
        yPos += 5;
      }

      // Boundary points table header
      pdf.setFillColor(52, 152, 219);
      pdf.rect(25, yPos - 3, 120, 6, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text('#', 27, yPos);
      pdf.text('Point ID', 35, yPos);
      pdf.text('Y (Westing)', 75, yPos);
      pdf.text('X (Northing)', 115, yPos);
      yPos += 4;
      
      // Draw boundary points
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(7);
      parcel.points.forEach((point, idx) => {
        if (yPos > 270) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.text((idx + 1).toString(), 27, yPos);
        pdf.text(point.id, 35, yPos);
        pdf.text(point.y.toFixed(3), 75, yPos);
        pdf.text(point.x.toFixed(3), 115, yPos);
        yPos += 4;
      });
      
      yPos += 4;
    } else {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.text('Area computation pending...', 25, yPos);
      yPos += 10;
    }
  });

  // Footer on last page
  const pageCount = pdf.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.text(
      `Generated: ${new Date().toLocaleDateString()} | Page ${i} of ${pageCount}`,
      105,
      285,
      { align: 'center' }
    );
  }

  // Signature block on last page
  pdf.setPage(pageCount);
  yPos = 260;
  if (yPos > 260) {
    pdf.addPage();
    yPos = 20;
  }

  pdf.setDrawColor(0, 0, 0);
  pdf.line(20, yPos, 90, yPos);
  yPos += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Land Surveyor', 20, yPos);
  yPos += 4;
  pdf.setFont('helvetica', 'bold');
  pdf.text(options.surveyorName, 20, yPos);
  if (options.surveyorLicense) {
    yPos += 4;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Lic. No: ${options.surveyorLicense}`, 20, yPos);
  }

  return pdf.output('blob');
}

/**
 * Helper functions
 */
function getSRID(centralMeridian: number): number {
  const sridMap: Record<number, number> = {
    25: 22285, 27: 22287, 29: 22289, 31: 22291, 33: 22293
  };
  return sridMap[centralMeridian] || 22291;
}

function calculateClosureError(parcel: Parcel): number {
  if (!parcel.areaResult?.residuals) return 0;
  const { sumDy, sumDx } = parcel.areaResult.residuals;
  return Math.sqrt(sumDy * sumDy + sumDx * sumDx);
}

function getClosureQuality(error: number): string {
  if (error < 0.05) return 'Excellent';
  if (error < 0.1) return 'Good';
  if (error < 0.5) return 'Fair';
  return 'Poor';
}
