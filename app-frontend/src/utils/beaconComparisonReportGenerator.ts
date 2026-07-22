/**
 * Beacon Comparison Report (SI 727 Section 67(5)) — standalone PDF.
 *
 * Renders ONLY the s.67(5) comparison of found beacons, numbered in sequence so
 * it can be collated into Comprehensive_Latest.pdf immediately before
 * Calculations Part 1. The comparison itself comes from the shared renderer, so
 * this report and the structured Report on Survey never drift apart.
 */

import { jsPDF } from 'jspdf';
import type { ReportOnSurveyData } from '../types/cadastral';
import {
  hasBeaconComparisonData,
  renderBeaconComparison,
  type BeaconComparisonCursor,
} from './beaconComparisonSection';
import { stampSequentialPageNumbers } from './pdfPageNumber';

export interface BeaconComparisonReportOptions {
  surveyorName: string;
  licenseNumber: string;
  surveyDate: string;
  surveyOf: string;
}

const MARGIN = 20;
const LINE_HEIGHT = 7;

/**
 * Generate the standalone Beacon Comparison Report.
 *
 * @param startingPage - First page number to stamp; subsequent pages continue in sequence.
 * @returns The PDF and its page count, or `null` when there is no comparison to report.
 */
export async function generateBeaconComparisonReportPDF(
  reportData: ReportOnSurveyData | null | undefined,
  options: BeaconComparisonReportOptions,
  startingPage: number
): Promise<{ pdf: Blob; pageCount: number } | null> {
  if (!hasBeaconComparisonData(reportData)) {
    console.log('[BeaconComparisonReport] No comparison data — skipping');
    return null;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('BEACON COMPARISON REPORT', pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    "SI 727 of 1979, Section 67(5) - Surveyor General's Regulations",
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 10;

  // Survey identification
  const header = [
    `Survey Of: ${options.surveyOf || 'N/A'}`,
    `S.R. Number: ${reportData!.srNumber || 'N/A'}`,
    `Land Surveyor: ${options.surveyorName || 'N/A'} (License No. ${options.licenseNumber || 'N/A'})`,
    `Survey Date: ${options.surveyDate || 'N/A'}`,
  ];
  header.forEach((line) => {
    doc.text(line, MARGIN, y);
    y += LINE_HEIGHT;
  });

  y += 3;
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 10;

  // Shared s.67(5) block
  const cursor: BeaconComparisonCursor = {
    doc,
    margin: MARGIN,
    lineHeight: LINE_HEIGHT,
    pageWidth,
    pageHeight,
    y,
  };
  renderBeaconComparison(cursor, reportData!);

  stampSequentialPageNumbers(doc, startingPage);

  const pageCount = doc.getNumberOfPages();
  console.log(
    `[BeaconComparisonReport] Generated ${pageCount} page(s), numbered ${startingPage}-${startingPage + pageCount - 1}`
  );

  return { pdf: doc.output('blob'), pageCount };
}
