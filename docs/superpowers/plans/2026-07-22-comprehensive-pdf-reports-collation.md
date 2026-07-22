# Comprehensive PDF — Beacon Comparison + Report of Survey Collation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collate a standalone SI 727 s.67(5) Beacon Comparison Report immediately before Calculations Part 1, and the narrative Report of Survey at the very end, into `Comprehensive_Latest.pdf`, with folder copies in `output/calculations/` and `output/reports/`.

**Architecture:** The s.67(5) comparison rendering is extracted out of `ReportOnSurveyGenerator` into a cursor-based shared module so the structured report and the new standalone report render it identically. The standalone report is threaded through the existing two-pass pipeline: Pass 1 measures its page count `K` and shifts the Calculations start page to `coordinateListEnd + K + 1` (so the Coordinate List's point→calc-page cross-references, which are generated *from* the calc generator at that shifted start page, stay correct); Pass 2 renders it at `coordinateListEnd + 1` and splices it between the Coordinate List and Calculations. The narrative is appended after Areas by `useComprehensivePDF`, numbered from Areas' end page. Both are built from `workflowState.reportOnSurvey` at collation time via one shared adapter, and both skip gracefully when the data is absent (`K = 0` ⇒ behaviour identical to today).

**Tech Stack:** Vue 3 + TypeScript, jsPDF (section generators), pdf-lib (merging), vitest (`environment: 'node'`).

## Global Constraints

- All work is in `app-frontend/`. Tests run with `npm test` (vitest, `environment: 'node'`) from `app-frontend/`.
- Never stage the pre-existing untracked root files: `20260527 beacon-comparison-claude.csv`, `namibian example.txt`, `survey-plan-dxf-sample.dxf`, `verification/`. Always use explicit `git add <path>` — never `git add -A` or `git add .`.
- Commit messages end with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Local `main` pushes to `origin/nov-alpha` (`git push origin HEAD:nov-alpha`); never push to `origin/main`.
- Do NOT change: the plain found/placed beacon coordinate table inside Calculations Part 1; the Helmert / W-test math (`surveyMath.js`, `si727.js`); the Report on Survey step UI or its structured/narrative format choice.
- Page-number stamping style must match `calculations-part1.ts`: helvetica normal, size 10, top-right at `y = 15`, `x = pageWidth - 20 - textWidth`.
- Folder copies are best-effort: a failed write is recorded and never aborts the others.

---

### Task 1: Shared beacon-comparison renderer + page-number stamper

Extract the s.67(5) rendering out of `ReportOnSurveyGenerator` into a cursor-based module with no behaviour change, and add the shared page-number stamper both new generators will use.

**Files:**
- Create: `app-frontend/src/utils/beaconComparisonSection.ts`
- Create: `app-frontend/src/utils/pdfPageNumber.ts`
- Modify: `app-frontend/src/utils/reportOnSurveyGenerator.ts:324-447` (replace `addBeaconComparison` + `addBeaconComparisonTable` bodies with delegation)
- Test: `app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts`

**Interfaces:**
- Consumes: `ReportOnSurveyData`, `FoundBeacon` from `@/types/cadastral`.
- Produces:
  - `interface BeaconComparisonCursor { doc: jsPDF; margin: number; lineHeight: number; pageWidth: number; pageHeight: number; y: number }`
  - `hasBeaconComparisonData(reportData?: ReportOnSurveyData | null): boolean`
  - `renderBeaconComparison(cursor: BeaconComparisonCursor, reportData: ReportOnSurveyData): void` — mutates `cursor.y`
  - `stampSequentialPageNumbers(doc: jsPDF, startingPage: number, marginRight?: number): void`

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  hasBeaconComparisonData,
  renderBeaconComparison,
  type BeaconComparisonCursor,
} from '../beaconComparisonSection';
import { stampSequentialPageNumbers } from '../pdfPageNumber';
import type { ReportOnSurveyData } from '@/types/cadastral';

function makeReportData(overrides: Partial<ReportOnSurveyData> = {}): ReportOnSurveyData {
  return {
    srNumber: 'SR 1/2026',
    purpose: { type: 'private-land', reference: 'Permit 42' },
    surveyBasis: {
      trigStations: true, trigStationNames: ['T1'],
      townSurveyMarks: false, officialControlPoints: false,
      previousSurvey: false, localSystem: false,
    },
    beacons: [
      {
        beaconId: '85c',
        status: 'found',
        currentCoordinates: { y: 50000.123, x: 2200000.456 },
        originalData: {
          coordinates: { y: 50000.1, x: 2200000.4 },
          srNumber: 'SR 21/2016',
          source: 'previous-survey',
        },
        discrepancy: { dy: 0.023, dx: 0.056, distance: 0.0605 },
      },
    ],
    beaconComparison: {
      method: 'tabulation',
      currentSRNumber: 'SR 1/2026',
      originalSRNumber: 'SR 21/2016',
      toleranceThreshold: 0.02,
      adjustmentSummary: 'Helmert LSQ, W-test at 95%: all beacons accepted.',
      conclusion: 'From the above comparison, I adopt the positions of all found beacons.',
    },
    curvilinearBoundaries: { applicable: false },
    unusualOccurrences: '',
    ...overrides,
  } as ReportOnSurveyData;
}

/** Render into a real jsPDF while capturing every string written. */
function renderCapturing(reportData: ReportOnSurveyData): { written: string[]; cursor: BeaconComparisonCursor } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const written: string[] = [];
  const originalText = doc.text.bind(doc);
  (doc as any).text = (text: any, ...rest: any[]) => {
    written.push(Array.isArray(text) ? text.join(' ') : String(text));
    return (originalText as any)(text, ...rest);
  };
  const cursor: BeaconComparisonCursor = {
    doc,
    margin: 20,
    lineHeight: 7,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
    y: 20,
  };
  renderBeaconComparison(cursor, reportData);
  return { written, cursor };
}

describe('hasBeaconComparisonData', () => {
  it('is true when a comparison config and a beacon with original coordinates exist', () => {
    expect(hasBeaconComparisonData(makeReportData())).toBe(true);
  });

  it('is false when there is no comparison config', () => {
    expect(hasBeaconComparisonData(makeReportData({ beaconComparison: undefined }))).toBe(false);
  });

  it('is false when no beacon carries original coordinates', () => {
    const data = makeReportData();
    data.beacons = [{ ...data.beacons[0], originalData: undefined }];
    expect(hasBeaconComparisonData(data)).toBe(false);
  });

  it('is false for null/undefined input', () => {
    expect(hasBeaconComparisonData(null)).toBe(false);
    expect(hasBeaconComparisonData(undefined)).toBe(false);
  });
});

describe('renderBeaconComparison', () => {
  it('renders heading, method line, adjustment summary, table and conclusion', () => {
    const { written } = renderCapturing(makeReportData());
    expect(written).toContain('BEACON COMPARISON (SI 727 Section 67(5))');
    expect(written).toContain('Method: Tabulation of Co-ordinates');
    expect(written).toContain('Helmert LSQ, W-test at 95%: all beacons accepted.');
    expect(written).toContain('Beacon');
    expect(written).toContain('Δ (m)');
    expect(written).toContain('85c');
    expect(written).toContain('0.061');
    expect(written).toContain('Conclusion:');
  });

  it('prints the tolerance line when no adjustment summary is present', () => {
    const data = makeReportData();
    data.beaconComparison!.adjustmentSummary = undefined;
    const { written } = renderCapturing(data);
    expect(written).toContain('Tolerance Threshold: ±0.020m');
  });

  it('advances the cursor', () => {
    const { cursor } = renderCapturing(makeReportData());
    expect(cursor.y).toBeGreaterThan(20);
  });
});

describe('stampSequentialPageNumbers', () => {
  it('writes one in-sequence number per page starting at startingPage', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.addPage();
    doc.addPage();
    const written: string[] = [];
    const originalText = doc.text.bind(doc);
    (doc as any).text = (text: any, ...rest: any[]) => {
      written.push(String(text));
      return (originalText as any)(text, ...rest);
    };
    stampSequentialPageNumbers(doc, 140);
    expect(written).toEqual(['140', '141', '142']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSection.test.ts`
Expected: FAIL — `Failed to resolve import "../beaconComparisonSection"`.

- [ ] **Step 3: Write the shared page-number stamper**

Create `app-frontend/src/utils/pdfPageNumber.ts`:

```ts
/**
 * Shared page-number stamping for jsPDF section generators.
 * Matches the Calculations Part 1 style: helvetica 10pt, top-right, y = 15.
 */

import type { jsPDF } from 'jspdf';

/**
 * Stamp an in-sequence page number on every page of the document.
 * Page 1 gets `startingPage`, page 2 `startingPage + 1`, and so on.
 * Leaves the document positioned on its last page.
 */
export function stampSequentialPageNumbers(
  doc: jsPDF,
  startingPage: number,
  marginRight: number = 20
): void {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const pageText = String(startingPage + i - 1);
    const textWidth = doc.getTextWidth(pageText);
    doc.text(pageText, doc.internal.pageSize.getWidth() - marginRight - textWidth, 15);
  }
}
```

- [ ] **Step 4: Write the shared comparison renderer**

Create `app-frontend/src/utils/beaconComparisonSection.ts`. This is a straight port of
`ReportOnSurveyGenerator.addBeaconComparison` / `addBeaconComparisonTable` onto an
explicit cursor, so both the structured report and the standalone report render
identically:

```ts
/**
 * Beacon Comparison (SI 727 Section 67(5)) — shared renderer.
 *
 * Single source of truth for the s.67(5) comparison block: it is rendered both
 * inline by the structured Report on Survey and standalone by the Beacon
 * Comparison Report that is collated into Comprehensive_Latest.pdf.
 */

import type { jsPDF } from 'jspdf';
import type { ReportOnSurveyData } from '../types/cadastral';

/** Layout state threaded through the renderer; `y` is mutated as content is emitted. */
export interface BeaconComparisonCursor {
  doc: jsPDF;
  margin: number;
  lineHeight: number;
  pageWidth: number;
  pageHeight: number;
  y: number;
}

const METHOD_LABELS: Record<string, string> = {
  tabulation: 'Tabulation of Co-ordinates',
  sketch: 'Comparison Sketch',
  both: 'Both Tabulation and Sketch',
};

/**
 * True when there is enough data to render a meaningful comparison:
 * a comparison config plus at least one beacon carrying original coordinates.
 */
export function hasBeaconComparisonData(
  reportData?: ReportOnSurveyData | null
): boolean {
  if (!reportData?.beaconComparison) return false;
  return (reportData.beacons || []).some((b) => !!b.originalData?.coordinates);
}

function checkPageBreak(cursor: BeaconComparisonCursor, requiredSpace: number): void {
  if (cursor.y + requiredSpace > cursor.pageHeight - cursor.margin) {
    cursor.doc.addPage();
    cursor.y = cursor.margin;
  }
}

function horizontalLine(cursor: BeaconComparisonCursor): void {
  cursor.doc.line(cursor.margin, cursor.y, cursor.pageWidth - cursor.margin, cursor.y);
}

/** Render the comparison block, advancing `cursor.y`. */
export function renderBeaconComparison(
  cursor: BeaconComparisonCursor,
  reportData: ReportOnSurveyData
): void {
  const comparison = reportData.beaconComparison;
  if (!comparison) return;

  checkPageBreak(cursor, 60);

  cursor.doc.setFontSize(11);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.text('BEACON COMPARISON (SI 727 Section 67(5))', cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight + 2;

  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(10);

  cursor.doc.text(
    `Method: ${METHOD_LABELS[comparison.method] || comparison.method}`,
    cursor.margin + 5,
    cursor.y
  );
  cursor.y += cursor.lineHeight;

  if (comparison.currentSRNumber) {
    cursor.doc.text(`Current Survey: ${comparison.currentSRNumber}`, cursor.margin + 5, cursor.y);
    cursor.y += cursor.lineHeight;
  }

  if (comparison.originalSRNumber) {
    cursor.doc.text(`Original Survey: ${comparison.originalSRNumber}`, cursor.margin + 5, cursor.y);
    cursor.y += cursor.lineHeight;
  }

  // Prefer an explicit adjustment summary (Helmert LSQ + W-test); fall back to the legacy tolerance line.
  const adjustmentLine =
    comparison.adjustmentSummary ||
    `Tolerance Threshold: ±${comparison.toleranceThreshold.toFixed(3)}m`;
  const adjustmentLines = cursor.doc.splitTextToSize(
    adjustmentLine,
    cursor.pageWidth - cursor.margin * 2 - 10
  );
  adjustmentLines.forEach((line: string) => {
    cursor.doc.text(line, cursor.margin + 5, cursor.y);
    cursor.y += cursor.lineHeight;
  });
  cursor.y += 3;

  if (comparison.method === 'tabulation' || comparison.method === 'both') {
    renderBeaconComparisonTable(cursor, reportData);
  }

  if (comparison.conclusion) {
    cursor.y += 5;
    cursor.doc.setFont('helvetica', 'bold');
    cursor.doc.text('Conclusion:', cursor.margin + 5, cursor.y);
    cursor.y += cursor.lineHeight;

    cursor.doc.setFont('helvetica', 'normal');
    const lines = cursor.doc.splitTextToSize(
      comparison.conclusion,
      cursor.pageWidth - cursor.margin * 2 - 10
    );
    lines.forEach((line: string) => {
      checkPageBreak(cursor, 10);
      cursor.doc.text(line, cursor.margin + 10, cursor.y);
      cursor.y += cursor.lineHeight;
    });
  }

  cursor.y += 5;
}

function renderBeaconComparisonTable(
  cursor: BeaconComparisonCursor,
  reportData: ReportOnSurveyData
): void {
  const beaconsWithOriginal = (reportData.beacons || []).filter(
    (b) => b.originalData && b.originalData.coordinates
  );
  if (beaconsWithOriginal.length === 0) return;

  checkPageBreak(cursor, 80);

  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(9);

  const colX = [cursor.margin + 5, 40, 70, 100, 130, 155];
  const rowHeight = 6;

  cursor.doc.text('Beacon', colX[0], cursor.y);
  cursor.doc.text('Original Y', colX[1], cursor.y);
  cursor.doc.text('Original X', colX[2], cursor.y);
  cursor.doc.text('New Y', colX[3], cursor.y);
  cursor.doc.text('New X', colX[4], cursor.y);
  cursor.doc.text('Δ (m)', colX[5], cursor.y);

  cursor.y += rowHeight;
  horizontalLine(cursor);
  cursor.y += 2;

  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(8);

  beaconsWithOriginal.forEach((beacon) => {
    checkPageBreak(cursor, 15);

    const origY = beacon.originalData?.coordinates?.y?.toFixed(3) || '-';
    const origX = beacon.originalData?.coordinates?.x?.toFixed(3) || '-';
    const newY = beacon.currentCoordinates?.y?.toFixed(3) || '-';
    const newX = beacon.currentCoordinates?.x?.toFixed(3) || '-';
    const distance = beacon.discrepancy?.distance?.toFixed(3) || '-';

    cursor.doc.text(beacon.beaconId, colX[0], cursor.y);
    cursor.doc.text(origY, colX[1], cursor.y);
    cursor.doc.text(origX, colX[2], cursor.y);
    cursor.doc.text(newY, colX[3], cursor.y);
    cursor.doc.text(newX, colX[4], cursor.y);
    cursor.doc.text(distance, colX[5], cursor.y);

    cursor.y += rowHeight;
  });

  cursor.y += 3;
}
```

- [ ] **Step 5: Delegate from the structured Report on Survey generator**

In `app-frontend/src/utils/reportOnSurveyGenerator.ts`, add the import beneath the existing imports:

```ts
import {
  renderBeaconComparison,
  type BeaconComparisonCursor,
} from './beaconComparisonSection';
```

Then replace the whole of `addBeaconComparison` (lines 321-391) and `addBeaconComparisonTable`
(lines 393-447) — both methods, including their doc comments — with this single method:

```ts
  /**
   * Add Beacon Comparison (SI 727 Section 67(5))
   * Delegates to the shared renderer so the standalone Beacon Comparison Report
   * and this inline block stay identical.
   */
  private addBeaconComparison(reportData: ReportOnSurveyData): void {
    if (!reportData.beaconComparison) return;

    const cursor: BeaconComparisonCursor = {
      doc: this.doc,
      margin: this.margin,
      lineHeight: this.lineHeight,
      pageWidth: this.pageWidth,
      pageHeight: this.pageHeight,
      y: this.currentY,
    };
    renderBeaconComparison(cursor, reportData);
    this.currentY = cursor.y;
  }
```

Leave the call site at line 59-61 (`if (reportData.beaconComparison) { this.addBeaconComparison(reportData); }`) unchanged.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSection.test.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 7: Run the full suite to confirm no regression**

Run: `cd app-frontend && npm test`
Expected: PASS — same suites green as before the change (no new failures).

- [ ] **Step 8: Commit**

```bash
git add app-frontend/src/utils/beaconComparisonSection.ts app-frontend/src/utils/pdfPageNumber.ts app-frontend/src/utils/reportOnSurveyGenerator.ts app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts
git commit -m "$(cat <<'EOF'
refactor(report-on-survey): extract shared SI 727 s.67(5) comparison renderer

Ports addBeaconComparison/addBeaconComparisonTable onto an explicit cursor in
beaconComparisonSection.ts so the structured report and the upcoming standalone
Beacon Comparison Report render the comparison identically. Adds the shared
sequential page-number stamper used by both.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Standalone Beacon Comparison Report generator

**Files:**
- Create: `app-frontend/src/utils/beaconComparisonReportGenerator.ts`
- Test: `app-frontend/src/utils/__tests__/beaconComparisonReportGenerator.test.ts`

**Interfaces:**
- Consumes: `hasBeaconComparisonData`, `renderBeaconComparison`, `BeaconComparisonCursor` (Task 1); `stampSequentialPageNumbers` (Task 1); `ReportOnSurveyData`.
- Produces:
  - `interface BeaconComparisonReportOptions { surveyorName: string; licenseNumber: string; surveyDate: string; surveyOf: string }`
  - `generateBeaconComparisonReportPDF(reportData: ReportOnSurveyData | null | undefined, options: BeaconComparisonReportOptions, startingPage: number): Promise<{ pdf: Blob; pageCount: number } | null>` — resolves `null` (the skip signal) when there is no comparison data.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/beaconComparisonReportGenerator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateBeaconComparisonReportPDF } from '../beaconComparisonReportGenerator';
import type { ReportOnSurveyData } from '@/types/cadastral';

const options = {
  surveyorName: 'C. Paradzayi',
  licenseNumber: 'PLS 1',
  surveyDate: '2026-01-01',
  surveyOf: 'Stands 1 - 2 Test Township',
};

function makeReportData(): ReportOnSurveyData {
  return {
    srNumber: 'SR 1/2026',
    purpose: { type: 'private-land', reference: 'Permit 42' },
    surveyBasis: {
      trigStations: true, trigStationNames: ['T1'],
      townSurveyMarks: false, officialControlPoints: false,
      previousSurvey: false, localSystem: false,
    },
    beacons: [
      {
        beaconId: '85c',
        status: 'found',
        currentCoordinates: { y: 50000.123, x: 2200000.456 },
        originalData: {
          coordinates: { y: 50000.1, x: 2200000.4 },
          srNumber: 'SR 21/2016',
          source: 'previous-survey',
        },
        discrepancy: { dy: 0.023, dx: 0.056, distance: 0.0605 },
      },
    ],
    beaconComparison: {
      method: 'tabulation',
      currentSRNumber: 'SR 1/2026',
      originalSRNumber: 'SR 21/2016',
      toleranceThreshold: 0.02,
      adjustmentSummary: 'Helmert LSQ, W-test at 95%: all beacons accepted.',
      conclusion: 'From the above comparison, I adopt the positions of all found beacons.',
    },
    curvilinearBoundaries: { applicable: false },
    unusualOccurrences: '',
  } as ReportOnSurveyData;
}

describe('generateBeaconComparisonReportPDF', () => {
  it('returns a non-empty PDF with at least one page when comparison data is present', async () => {
    const result = await generateBeaconComparisonReportPDF(makeReportData(), options, 140);
    expect(result).not.toBeNull();
    expect(result!.pageCount).toBeGreaterThanOrEqual(1);
    expect(result!.pdf).toBeInstanceOf(Blob);
    expect(result!.pdf.size).toBeGreaterThan(0);
  });

  it('reports a page count that matches the rendered PDF', async () => {
    const result = await generateBeaconComparisonReportPDF(makeReportData(), options, 140);
    const doc = await PDFDocument.load(await result!.pdf.arrayBuffer());
    expect(doc.getPageCount()).toBe(result!.pageCount);
  });

  it('returns null when there is no comparison config', async () => {
    const data = makeReportData();
    data.beaconComparison = undefined;
    expect(await generateBeaconComparisonReportPDF(data, options, 140)).toBeNull();
  });

  it('returns null when no beacon has original coordinates', async () => {
    const data = makeReportData();
    data.beacons = [{ ...data.beacons[0], originalData: undefined }];
    expect(await generateBeaconComparisonReportPDF(data, options, 140)).toBeNull();
  });

  it('returns null for null report data', async () => {
    expect(await generateBeaconComparisonReportPDF(null, options, 140)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonReportGenerator.test.ts`
Expected: FAIL — `Failed to resolve import "../beaconComparisonReportGenerator"`.

- [ ] **Step 3: Write the generator**

Create `app-frontend/src/utils/beaconComparisonReportGenerator.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonReportGenerator.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/beaconComparisonReportGenerator.ts app-frontend/src/utils/__tests__/beaconComparisonReportGenerator.test.ts
git commit -m "$(cat <<'EOF'
feat(beacon-comparison): standalone SI 727 s.67(5) Beacon Comparison Report

Renders only the s.67(5) comparison via the shared renderer, stamped with
in-sequence page numbers from a caller-supplied startingPage. Returns null when
there is no comparison data so callers can skip it cleanly.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Workflow → report data adapter

One construction path shared by both caller views and the tests. It accepts either
the in-memory cadastral workflow state (`workflowState.reportOnSurvey`, used by
`MapLibreAreaView`) or the backend-shaped workflow state
(`workflow_state.step_data['report-on-survey'].report_data`, used by `SurveyPlanMapView`).

**Files:**
- Create: `app-frontend/src/utils/reportDataFromWorkflow.ts`
- Test: `app-frontend/src/utils/__tests__/reportDataFromWorkflow.test.ts`

**Interfaces:**
- Produces:
  - `buildReportDataFromWorkflow(workflowState: any): ReportOnSurveyData | null`
  - `isReportDataEmpty(reportData: ReportOnSurveyData | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/reportDataFromWorkflow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildReportDataFromWorkflow, isReportDataEmpty } from '../reportDataFromWorkflow';
import type { ReportOnSurveyData } from '@/types/cadastral';

const filled: ReportOnSurveyData = {
  srNumber: 'SR 1/2026',
  purpose: { type: 'private-land', reference: 'Permit 42' },
  surveyBasis: {
    trigStations: true, trigStationNames: ['T1'],
    townSurveyMarks: false, officialControlPoints: false,
    previousSurvey: false, localSystem: false,
  },
  beacons: [
    {
      beaconId: '85c',
      status: 'found',
      currentCoordinates: { y: 1, x: 2 },
    } as any,
  ],
  curvilinearBoundaries: { applicable: false },
  unusualOccurrences: 'Fence encroaches 0.4 m on the eastern boundary.',
};

describe('buildReportDataFromWorkflow', () => {
  it('reads the in-memory cadastral workflow state', () => {
    expect(buildReportDataFromWorkflow({ reportOnSurvey: filled })).toEqual(filled);
  });

  it('reads the backend step_data shape', () => {
    const backend = { step_data: { 'report-on-survey': { report_data: filled } } };
    expect(buildReportDataFromWorkflow(backend)).toEqual(filled);
  });

  it('prefers in-memory state when both are present', () => {
    const other = { ...filled, srNumber: 'SR 9/2026' };
    const state = {
      reportOnSurvey: filled,
      step_data: { 'report-on-survey': { report_data: other } },
    };
    expect(buildReportDataFromWorkflow(state)?.srNumber).toBe('SR 1/2026');
  });

  it('returns null when neither source is present', () => {
    expect(buildReportDataFromWorkflow({})).toBeNull();
    expect(buildReportDataFromWorkflow(null)).toBeNull();
    expect(buildReportDataFromWorkflow(undefined)).toBeNull();
  });
});

describe('isReportDataEmpty', () => {
  it('is false for data with beacons or narrative content', () => {
    expect(isReportDataEmpty(filled)).toBe(false);
  });

  it('is true for null/undefined', () => {
    expect(isReportDataEmpty(null)).toBe(true);
    expect(isReportDataEmpty(undefined)).toBe(true);
  });

  it('is true when there are no beacons, no purpose and no comments', () => {
    const empty = {
      srNumber: '',
      purpose: { type: '', reference: '' },
      surveyBasis: {
        trigStations: false, townSurveyMarks: false, officialControlPoints: false,
        previousSurvey: false, localSystem: false,
      },
      beacons: [],
      curvilinearBoundaries: { applicable: false },
      unusualOccurrences: '   ',
    } as any as ReportOnSurveyData;
    expect(isReportDataEmpty(empty)).toBe(true);
  });

  it('is false when only a purpose reference is filled in', () => {
    const partial = {
      srNumber: '',
      purpose: { type: 'private-land', reference: 'Permit 42' },
      surveyBasis: {
        trigStations: false, townSurveyMarks: false, officialControlPoints: false,
        previousSurvey: false, localSystem: false,
      },
      beacons: [],
      curvilinearBoundaries: { applicable: false },
      unusualOccurrences: '',
    } as any as ReportOnSurveyData;
    expect(isReportDataEmpty(partial)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/reportDataFromWorkflow.test.ts`
Expected: FAIL — `Failed to resolve import "../reportDataFromWorkflow"`.

- [ ] **Step 3: Write the adapter**

Create `app-frontend/src/utils/reportDataFromWorkflow.ts`:

```ts
/**
 * Adapter: cadastral workflow state → ReportOnSurveyData.
 *
 * Both the Beacon Comparison Report and the narrative Report of Survey are built
 * from workflow state at collation time, so the collated document never depends
 * on the user having visited the Report on Survey step. Two shapes are supported:
 *   - in-memory workflow state (CadastralStandardView / MapLibreAreaView)
 *   - backend workflow_state (SurveyPlanMapView), where the report lives under
 *     step_data['report-on-survey'].report_data
 */

import type { ReportOnSurveyData } from '../types/cadastral';

/** Pull the report data out of whichever workflow shape was passed in. */
export function buildReportDataFromWorkflow(
  workflowState: any
): ReportOnSurveyData | null {
  if (!workflowState) return null;

  const inMemory = workflowState.reportOnSurvey;
  if (inMemory) return inMemory as ReportOnSurveyData;

  const persisted = workflowState.step_data?.['report-on-survey']?.report_data;
  if (persisted) return persisted as ReportOnSurveyData;

  return null;
}

/**
 * True when the report carries nothing worth printing — no beacons, no purpose,
 * and no comments. Callers use this to skip the narrative append entirely.
 */
export function isReportDataEmpty(
  reportData: ReportOnSurveyData | null | undefined
): boolean {
  if (!reportData) return true;

  const hasBeacons = (reportData.beacons?.length || 0) > 0;
  const hasPurpose =
    !!reportData.purpose?.type?.trim() || !!reportData.purpose?.reference?.trim();
  const hasComments = !!reportData.unusualOccurrences?.trim();

  return !hasBeacons && !hasPurpose && !hasComments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/reportDataFromWorkflow.test.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/reportDataFromWorkflow.ts app-frontend/src/utils/__tests__/reportDataFromWorkflow.test.ts
git commit -m "$(cat <<'EOF'
feat(report-collation): shared workflow -> ReportOnSurveyData adapter

One construction path for both caller views, accepting the in-memory workflow
state and the backend step_data shape, plus the empty-state check that drives
the graceful-skip rules.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Narrative Report of Survey accepts a starting page

**Files:**
- Modify: `app-frontend/src/utils/reportOnSurveyNarrativeGenerator.ts:43-78` (`generate`) and `:445-451` (`generateNarrativeReportOnSurveyPDF`)
- Test: `app-frontend/src/utils/__tests__/narrativeReportPageNumbers.test.ts`

**Interfaces:**
- Consumes: `stampSequentialPageNumbers` (Task 1).
- Produces: `generateNarrativeReportOnSurveyPDF(reportData: ReportOnSurveyData, options: ReportGenerationOptions, startingPage?: number): Promise<{ pdf: Blob; pageCount: number }>` — when `startingPage` is omitted, no page numbers are stamped (today's behaviour for the standalone Report on Survey step).

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/narrativeReportPageNumbers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateNarrativeReportOnSurveyPDF } from '../reportOnSurveyNarrativeGenerator';
import type { ReportOnSurveyData } from '@/types/cadastral';

const options = {
  surveyorName: 'C. Paradzayi',
  licenseNumber: 'PLS 1',
  firm: 'SurveyPro',
  address: 'Harare',
  surveyDate: '2026-01-01',
  surveyOf: 'Stands 1 - 2 Test Township',
  district: 'Harare',
  assistant: 'N/A',
};

const reportData = {
  srNumber: 'SR 1/2026',
  purpose: { type: 'private-land', reference: 'Permit 42' },
  surveyBasis: {
    trigStations: true, trigStationNames: ['T1'],
    townSurveyMarks: false, officialControlPoints: false,
    previousSurvey: false, localSystem: false,
  },
  beacons: [],
  curvilinearBoundaries: { applicable: false },
  unusualOccurrences: 'Survey was straightforward.',
} as any as ReportOnSurveyData;

describe('generateNarrativeReportOnSurveyPDF', () => {
  it('still generates without a starting page', async () => {
    const result = await generateNarrativeReportOnSurveyPDF(reportData, options);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.pdf.size).toBeGreaterThan(0);
  });

  it('accepts a starting page and returns a loadable PDF of the reported length', async () => {
    const result = await generateNarrativeReportOnSurveyPDF(reportData, options, 200);
    const doc = await PDFDocument.load(await result.pdf.arrayBuffer());
    expect(doc.getPageCount()).toBe(result.pageCount);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/narrativeReportPageNumbers.test.ts`
Expected: FAIL — TypeScript rejects the third argument (`Expected 2 arguments, but got 3`).

- [ ] **Step 3: Thread `startingPage` through the generator**

In `app-frontend/src/utils/reportOnSurveyNarrativeGenerator.ts`, add the import beneath the existing imports:

```ts
import { stampSequentialPageNumbers } from './pdfPageNumber';
```

Change the `generate` signature and its tail (currently lines 43-78) to:

```ts
  async generate(
    reportData: ReportOnSurveyData,
    options: ReportGenerationOptions,
    startingPage?: number
  ): Promise<{ pdf: Blob; pageCount: number }> {
    console.log('[NarrativeReportOnSurvey] Generating PDF...', reportData);

    // Title
    this.addTitle();
    
    // Header section with survey details
    this.addHeaderSection(reportData, options);
    
    // Purpose section
    this.addPurposeSection(reportData);
    
    // Survey Based On section (narrative)
    this.addSurveyBasisNarrative(reportData);
    
    // Found Beacons section
    this.addFoundBeaconsNarrative(reportData);
    
    // Placed Beacons section
    this.addPlacedBeaconsNarrative(reportData);
    
    // Comments/Unusual Occurrences
    this.addCommentsSection(reportData);
    
    // Signature section
    this.addSignatureSection(options);

    // Collated into Comprehensive_Latest.pdf: continue the document's page
    // sequence. Standalone (no startingPage): leave the report unnumbered.
    if (startingPage !== undefined) {
      stampSequentialPageNumbers(this.doc, startingPage);
    }

    const pageCount = this.doc.getNumberOfPages();
    const pdfBlob = this.doc.output('blob');

    console.log('[NarrativeReportOnSurvey] PDF generated:', pageCount, 'pages');
    return { pdf: pdfBlob, pageCount };
  }
```

And the module-level wrapper (currently lines 442-451) to:

```ts
/**
 * Generate Narrative Report on Survey PDF
 *
 * @param startingPage - When provided, stamps in-sequence page numbers so the
 *   report can be collated at the end of Comprehensive_Latest.pdf.
 */
export async function generateNarrativeReportOnSurveyPDF(
  reportData: ReportOnSurveyData,
  options: ReportGenerationOptions,
  startingPage?: number
): Promise<{ pdf: Blob; pageCount: number }> {
  const generator = new NarrativeReportOnSurveyGenerator();
  return await generator.generate(reportData, options, startingPage);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/narrativeReportPageNumbers.test.ts`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/reportOnSurveyNarrativeGenerator.ts app-frontend/src/utils/__tests__/narrativeReportPageNumbers.test.ts
git commit -m "$(cat <<'EOF'
feat(report-on-survey): optional startingPage for the narrative report

Stamps in-sequence page numbers when collated at the end of
Comprehensive_Latest.pdf; unnumbered as before when generated standalone.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Two-pass pipeline inserts the Beacon Comparison Report

Measure `K` after the Coordinate List, shift the Calculations start page to
`coordinateListEnd + K + 1`, and splice the rendered report between the Coordinate
List and Calculations. With no comparison data, `K = 0` and the output is byte-for-byte
what it is today.

**Files:**
- Modify: `app-frontend/src/types/document-measurements.ts:87-108` (add `beaconComparison` to `DocumentMeasurements`)
- Modify: `app-frontend/src/utils/TwoPassDocumentGenerator.ts` (data/result interfaces, `measurePass`, `renderPass`, `measureCalculations`, new `measureBeaconComparison` / `renderBeaconComparisonReport`)
- Modify: `app-frontend/src/utils/comprehensive-document.ts:26-56, 83-145` (carry report data through, surface the new section blob)
- Test: `app-frontend/src/utils/__tests__/twoPassSections.test.ts` (extend)

**Interfaces:**
- Consumes: `generateBeaconComparisonReportPDF`, `BeaconComparisonReportOptions` (Task 2); `ReportOnSurveyData`.
- Produces:
  - `TwoPassDocumentData` gains `reportData?: ReportOnSurveyData | null` and `reportOptions?: BeaconComparisonReportOptions`.
  - `TwoPassDocumentResult.sections` gains `beaconComparison?: Blob`.
  - `DocumentMeasurements` gains `beaconComparison?: SectionMeasurement` (`pages` is `0` when skipped).
  - `ComprehensiveDocumentData` gains the same `reportData` / `reportOptions` fields; `generateWithTwoPass`'s returned `sections` gains `beaconComparison?: Blob`.

- [ ] **Step 1: Write the failing test**

Replace the whole body of `app-frontend/src/utils/__tests__/twoPassSections.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ComprehensiveDocumentGenerator } from '../comprehensive-document';
import type { ReportOnSurveyData } from '@/types/cadastral';

// Minimal-but-real inputs: two observed points + one parcel are enough to render
// every section (field book, coordinate list, calculations, areas) without error.
const surveyPoints = [
  { pointId: 'A1', y: 50000, x: 2200000, status: 'P', description: '', surveyDate: '2026-01-01' },
  { pointId: 'A2', y: 50100, x: 2200060, status: 'P', description: '', surveyDate: '2026-01-01' },
];
const adjustedCoordinates = surveyPoints.map((pt) => ({
  ...pt,
  fieldBookPage: '',
  calculationsPage: 0,
  adjustment: { isDuplicate: false, observationCount: 1, method: 'gps' as const },
}));
const surveyorInfo = {
  name: 'C. Paradzayi', licenseNumber: 'PLS 1', firm: '', address: '',
  surveyDate: '2026-01-01', projectTitle: 'Test', district: 'X', centralMeridian: 31,
};
const projectInfo = {
  projectTitle: 'Test', surveyorName: 'C. Paradzayi', licenseNumber: 'PLS 1',
  surveyDate: '2026-01-01', surveyType: 'STANDS 1 - 2 TEST TOWNSHIP',
};
const parcels = [{
  id: '1', name: '1',
  coordinates: [{ x: 2200000, y: 50000 }, { x: 2200060, y: 50000 }, { x: 2200060, y: 50100 }],
  area: 0.6,
}];

const reportData = {
  srNumber: 'SR 1/2026',
  purpose: { type: 'private-land', reference: 'Permit 42' },
  surveyBasis: {
    trigStations: true, trigStationNames: ['T1'],
    townSurveyMarks: false, officialControlPoints: false,
    previousSurvey: false, localSystem: false,
  },
  beacons: [{
    beaconId: '85c',
    status: 'found',
    currentCoordinates: { y: 50000.123, x: 2200000.456 },
    originalData: {
      coordinates: { y: 50000.1, x: 2200000.4 },
      srNumber: 'SR 21/2016',
      source: 'previous-survey',
    },
    discrepancy: { dy: 0.023, dx: 0.056, distance: 0.0605 },
  }],
  beaconComparison: {
    method: 'tabulation',
    currentSRNumber: 'SR 1/2026',
    originalSRNumber: 'SR 21/2016',
    toleranceThreshold: 0.02,
    adjustmentSummary: 'Helmert LSQ, W-test at 95%: all beacons accepted.',
    conclusion: 'From the above comparison, I adopt the positions of all found beacons.',
  },
  curvilinearBoundaries: { applicable: false },
  unusualOccurrences: '',
} as any as ReportOnSurveyData;

const reportOptions = {
  surveyorName: 'C. Paradzayi', licenseNumber: 'PLS 1',
  surveyDate: '2026-01-01', surveyOf: 'Stands 1 - 2 Test Township',
};

const baseData = {
  projectInfo, surveyorInfo,
  fieldBookObservations: [],
  surveyPoints, adjustedCoordinates,
  projectControlPoints: [], duplicateAnalyses: [], parcels,
};

describe('generateWithTwoPass — section blobs', () => {
  beforeEach(() => {
    // CoordinateListGenerator reads useSurveyLookupStore(); mirror main.ts's app.use(createPinia()).
    setActivePinia(createPinia());
  });

  it('returns non-empty cover, field book, coordinate list, and calculations blobs', async () => {
    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({ ...baseData } as any);
    for (const key of ['cover', 'fieldBook', 'coordinateList', 'calculations'] as const) {
      expect(result.sections?.[key]).toBeInstanceOf(Blob);
      expect(result.sections?.[key]!.size).toBeGreaterThan(0);
    }
  }, 30000);

  it('omits the beacon comparison and leaves Calculations unshifted with no report data', async () => {
    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({ ...baseData } as any);
    expect(result.sections?.beaconComparison).toBeUndefined();
    expect(result.measurements?.beaconComparison?.pages ?? 0).toBe(0);
    expect(result.measurements!.calculations.startPage).toBe(
      result.measurements!.coordinateList.endPage + 1
    );
  }, 30000);

  it('inserts the beacon comparison and shifts Calculations by K when report data is present', async () => {
    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({
      ...baseData, reportData, reportOptions,
    } as any);

    const beacon = result.measurements!.beaconComparison!;
    expect(beacon.pages).toBeGreaterThanOrEqual(1);
    expect(result.sections?.beaconComparison).toBeInstanceOf(Blob);
    expect(result.sections!.beaconComparison!.size).toBeGreaterThan(0);

    const coordEnd = result.measurements!.coordinateList.endPage;
    expect(beacon.startPage).toBe(coordEnd + 1);
    expect(beacon.endPage).toBe(coordEnd + beacon.pages);
    expect(result.measurements!.calculations.startPage).toBe(coordEnd + beacon.pages + 1);
    expect(result.measurements!.areas.startPage).toBe(
      result.measurements!.calculations.endPage + 1
    );
  }, 30000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/twoPassSections.test.ts`
Expected: FAIL — the third test fails on `result.measurements!.beaconComparison` being `undefined`.

- [ ] **Step 3: Add the measurement type**

In `app-frontend/src/types/document-measurements.ts`, inside `interface DocumentMeasurements` (currently lines 87-108), add after the `areas` field:

```ts
  /** Beacon Comparison Report section (SI 727 s.67(5)); omitted or pages: 0 when skipped */
  beaconComparison?: SectionMeasurement
```

- [ ] **Step 4: Thread the report through the two-pass generator**

In `app-frontend/src/utils/TwoPassDocumentGenerator.ts`:

(a) Extend the imports at the top (after the existing `import type { AdjustedCoordinate }` line):

```ts
import type { SectionMeasurement } from '../types/document-measurements'
import type { ReportOnSurveyData } from '../types/cadastral'
import {
  generateBeaconComparisonReportPDF,
  type BeaconComparisonReportOptions,
} from './beaconComparisonReportGenerator'
```

(b) Replace the two exported interfaces (lines 25-42) with:

```ts
export interface TwoPassDocumentData {
  surveyPoints: SurveyPoint[]
  adjustedCoordinates: AdjustedCoordinate[]
  surveyorInfo: SurveyorInfo
  projectControlPoints?: any[]
  parcels?: any[]
  /** SI 727 s.67(5) Beacon Comparison Report inputs; omit to skip the section */
  reportData?: ReportOnSurveyData | null
  reportOptions?: BeaconComparisonReportOptions
}

export interface TwoPassDocumentResult {
  pdf: Blob
  sections: {
    fieldBook: Blob
    coordinateList: Blob
    calculations: Blob
    beaconComparison?: Blob
  }
  measurements: DocumentMeasurements
  totalPages: number
}
```

(c) In `measurePass` (lines 96-138), replace steps 3-4 and the `measurements` object with:

```ts
    // 3. Measure the Beacon Comparison Report (0 pages when there is no comparison data)
    console.log('  📐 Measuring Beacon Comparison Report...')
    const beaconMeasure = await this.measureBeaconComparison(data, coordListMeasure)
    console.log(beaconMeasure.pages > 0
      ? `     ✓ ${beaconMeasure.pages} pages (${beaconMeasure.startPage}-${beaconMeasure.endPage})`
      : '     ✓ skipped (no comparison data)')
    
    // 4. Measure Calculations Part 1 (starts AFTER the Beacon Comparison Report)
    console.log('  🧮 Measuring Calculations Part 1...')
    const calcStartPage = coordListMeasure.endPage + beaconMeasure.pages + 1
    const calcsMeasure = await this.measureCalculations(data, calcStartPage)
    console.log(`     ✓ ${calcsMeasure.pages} pages (${calcsMeasure.startPage}-${calcsMeasure.endPage})`)
    console.log(`     ✓ ${Object.keys(calcsMeasure.pointPageMap).length} points tracked`)
    
    // 5. Measure Areas (if parcels exist) - starts AFTER Calculations
    console.log('  📐 Measuring Areas & Consistencies...')
    const areasMeasure = this.measureAreas(data, calcsMeasure)
    console.log(`     ✓ ${areasMeasure.pages} pages (${areasMeasure.startPage}-${areasMeasure.endPage})`)
    
    const measurements: DocumentMeasurements = {
      fieldBook: fieldBookMeasure,
      calculations: calcsMeasure,
      coordinateList: coordListMeasure,
      beaconComparison: beaconMeasure,
      areas: areasMeasure,
      totalPages: areasMeasure.endPage,
      measuredAt: new Date(),
      measurementDuration: Date.now() - measureStart
    }
```

(d) Change `measureCalculations` (lines 222-259) to take the start page directly.
Replace its signature and first lines:

```ts
  private async measureCalculations(
    data: TwoPassDocumentData,
    calcStartPage: number
  ): Promise<CalculationsMeasurement> {
    console.log(`     → Calculations will start at page: ${calcStartPage}`)
    console.log(`     → Generating Calculations Part 1 to measure actual pages...`)
```

(the rest of the method body — the `generateCalculationsPart1PDF` call, `actualPages`, `endPage`,
the logs and the returned object — is unchanged; it already reads `calcStartPage`).

(e) Add the beacon measurement + render helpers immediately after `measureCoordinateList`
(i.e. before `measureAreas`):

```ts
  /**
   * Render the Beacon Comparison Report once to learn its real page count (K).
   * Returns a zero-page measurement when there is no comparison data, which
   * leaves the Calculations start page exactly where it is today.
   */
  private async measureBeaconComparison(
    data: TwoPassDocumentData,
    coordListMeasure: CoordinateListMeasurement
  ): Promise<SectionMeasurement> {
    const startPage = coordListMeasure.endPage + 1
    const result = await this.renderBeaconComparisonReport(data, startPage)
    const pages = result?.pageCount ?? 0
    return {
      pages,
      startPage,
      endPage: startPage + pages - 1
    }
  }
  
  /**
   * Render the Beacon Comparison Report at the given start page, or null when
   * there is nothing to compare.
   */
  private async renderBeaconComparisonReport(
    data: TwoPassDocumentData,
    startingPage: number
  ): Promise<{ pdf: Blob; pageCount: number } | null> {
    if (!data.reportData) return null
    const options: BeaconComparisonReportOptions = data.reportOptions || {
      surveyorName: data.surveyorInfo.name,
      licenseNumber: data.surveyorInfo.licenseNumber,
      surveyDate: data.surveyorInfo.surveyDate,
      surveyOf: data.surveyorInfo.projectTitle
    }
    return generateBeaconComparisonReportPDF(data.reportData, options, startingPage)
  }
```

(f) In `renderPass` (lines 143-195), widen the return type and splice the report in.
Replace the signature line and steps 3-5:

```ts
  private async renderPass(
    data: TwoPassDocumentData,
    measurements: DocumentMeasurements
  ): Promise<{
    merged: Blob;
    sections: { fieldBook: Blob; coordinateList: Blob; calculations: Blob; beaconComparison?: Blob }
  }> {
```

and, after the Coordinate List `pdfs.push(coordListPDF)` block:

```ts
    // 3. Generate the Beacon Comparison Report (before Calculations, in sequence)
    let beaconComparisonPDF: Blob | undefined
    if ((measurements.beaconComparison?.pages || 0) > 0) {
      console.log('  📐 Rendering Beacon Comparison Report...')
      const beaconResult = await this.renderBeaconComparisonReport(
        data,
        measurements.beaconComparison!.startPage
      )
      if (beaconResult) {
        beaconComparisonPDF = beaconResult.pdf
        pdfs.push(beaconResult.pdf)
        console.log(`     ✓ ${beaconResult.pageCount} pages generated`)
      }
    }
    
    // 4. Generate Calculations Part 1
    console.log('  🧮 Rendering Calculations Part 1...')
    const calcsPDF = await this.renderCalculations(
      data,
      measurements.calculations.startPage
    )
    pdfs.push(calcsPDF)
    console.log(`     ✓ ${measurements.calculations.pages} pages generated`)
    
    // 5. Generate Areas (if parcels exist)
    if (data.parcels && data.parcels.length > 0) {
      console.log('  📐 Rendering Areas & Consistencies...')
      // TODO: Implement areas rendering
      console.log(`     ✓ ${measurements.areas.pages} pages generated`)
    }
    
    // 6. Merge all sections into the collated body
    console.log('  🔗 Merging PDFs...')
    const merged = await this.mergePDFs(pdfs)
    console.log(`     ✓ Final document assembled`)

    return {
      merged,
      sections: {
        fieldBook: fieldBookResult.pdf,
        coordinateList: coordListPDF,
        calculations: calcsPDF,
        ...(beaconComparisonPDF ? { beaconComparison: beaconComparisonPDF } : {}),
      },
    }
  }
```

- [ ] **Step 5: Carry the report data through `comprehensive-document.ts`**

In `app-frontend/src/utils/comprehensive-document.ts`:

(a) Add to the imports:

```ts
import type { ReportOnSurveyData } from '@/types/cadastral';
import type { BeaconComparisonReportOptions } from '@/utils/beaconComparisonReportGenerator';
```

(b) In `interface ComprehensiveDocumentData` (lines 26-56), add before the closing brace:

```ts
  // Beacon Comparison Report (SI 727 s.67(5)) — omit to skip the section
  reportData?: ReportOnSurveyData | null;
  reportOptions?: BeaconComparisonReportOptions;
```

(c) In `generateWithTwoPass`, widen the declared return type (lines 86-89):

```ts
  ): Promise<ComprehensiveDocumentResult & {
    measurements?: DocumentMeasurements;
    sections?: {
      cover: Blob;
      fieldBook: Blob;
      coordinateList: Blob;
      calculations: Blob;
      beaconComparison?: Blob;
    };
  }> {
```

(d) Pass the new fields into the two-pass call (lines 106-112):

```ts
    const result = await this.twoPassGenerator.generate({
      surveyPoints: surveyPointsOnly,
      adjustedCoordinates: data.adjustedCoordinates,
      surveyorInfo: data.surveyorInfo,
      projectControlPoints: data.projectControlPoints,
      parcels: data.parcels,
      reportData: data.reportData,
      reportOptions: data.reportOptions
    });
```

(e) Surface the new blob in the returned `sections` (lines 138-143):

```ts
      sections: {
        cover: coverPageBlob,
        fieldBook: result.sections.fieldBook,
        coordinateList: result.sections.coordinateList,
        calculations: result.sections.calculations,
        ...(result.sections.beaconComparison
          ? { beaconComparison: result.sections.beaconComparison }
          : {}),
      },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/twoPassSections.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 7: Run the full suite**

Run: `cd app-frontend && npm test`
Expected: PASS — no new failures.

- [ ] **Step 8: Commit**

```bash
git add app-frontend/src/types/document-measurements.ts app-frontend/src/utils/TwoPassDocumentGenerator.ts app-frontend/src/utils/comprehensive-document.ts app-frontend/src/utils/__tests__/twoPassSections.test.ts
git commit -m "$(cat <<'EOF'
feat(comprehensive-pdf): collate the Beacon Comparison Report before Calculations

Pass 1 measures the report's page count K and starts Calculations at
coordinateListEnd + K + 1, so the Coordinate List's point->calc-page
cross-references (generated from the calc generator at that shifted start page)
stay correct. Pass 2 splices the rendered report between the two sections. With
no comparison data K = 0 and the document is unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Append the narrative Report of Survey to `Comprehensive_Latest.pdf`

**Files:**
- Modify: `app-frontend/src/composables/useComprehensivePDF.ts` (options, result, append step)
- Test: `app-frontend/src/composables/__tests__/comprehensivePdfNarrative.test.ts`

**Interfaces:**
- Consumes: `generateNarrativeReportOnSurveyPDF(reportData, options, startingPage)` (Task 4); `isReportDataEmpty` (Task 3).
- Produces:
  - `ComprehensivePDFOptions` gains `reportData?: ReportOnSurveyData | null` and `narrativeOptions?: NarrativeReportOptions`.
  - `ComprehensivePDFResult` gains `narrativeBlob?: Blob`.
  - `export interface NarrativeReportOptions { surveyorName: string; licenseNumber: string; firm: string; address: string; surveyDate: string; surveyOf: string; district?: string; assistant?: string }`
  - `export async function appendNarrativeReport(mergedPdfBytes: Uint8Array, areasOnlyBlob: Blob, calculationsEndPage: number, reportData: ReportOnSurveyData | null | undefined, narrativeOptions: NarrativeReportOptions | undefined): Promise<{ merged: Uint8Array; narrativeBlob?: Blob }>` — exported so it is unit-testable without the storage layer.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/composables/__tests__/comprehensivePdfNarrative.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { appendNarrativeReport } from '../useComprehensivePDF';
import type { ReportOnSurveyData } from '@/types/cadastral';

const narrativeOptions = {
  surveyorName: 'C. Paradzayi', licenseNumber: 'PLS 1', firm: 'SurveyPro',
  address: 'Harare', surveyDate: '2026-01-01', surveyOf: 'Stands 1 - 2 Test Township',
  district: 'Harare', assistant: 'N/A',
};

const reportData = {
  srNumber: 'SR 1/2026',
  purpose: { type: 'private-land', reference: 'Permit 42' },
  surveyBasis: {
    trigStations: true, trigStationNames: ['T1'],
    townSurveyMarks: false, officialControlPoints: false,
    previousSurvey: false, localSystem: false,
  },
  beacons: [],
  curvilinearBoundaries: { applicable: false },
  unusualOccurrences: 'Fence encroaches 0.4 m on the eastern boundary.',
} as any as ReportOnSurveyData;

/** A stand-in for the collated body / areas section. */
async function makePdf(pages: number): Promise<{ bytes: Uint8Array; blob: Blob }> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  const bytes = await doc.save();
  return { bytes, blob: new Blob([bytes as any], { type: 'application/pdf' }) };
}

describe('appendNarrativeReport', () => {
  it('appends the narrative and returns it as its own blob', async () => {
    const body = await makePdf(6);
    const areas = await makePdf(2);

    const result = await appendNarrativeReport(
      body.bytes, areas.blob, 130, reportData, narrativeOptions
    );

    expect(result.narrativeBlob).toBeInstanceOf(Blob);
    const narrativePages = (await PDFDocument.load(await result.narrativeBlob!.arrayBuffer())).getPageCount();
    const mergedPages = (await PDFDocument.load(result.merged)).getPageCount();
    expect(mergedPages).toBe(6 + narrativePages);
  });

  it('returns the body untouched when the report data is empty', async () => {
    const body = await makePdf(6);
    const areas = await makePdf(2);
    const empty = {
      srNumber: '', purpose: { type: '', reference: '' },
      surveyBasis: {
        trigStations: false, townSurveyMarks: false, officialControlPoints: false,
        previousSurvey: false, localSystem: false,
      },
      beacons: [], curvilinearBoundaries: { applicable: false }, unusualOccurrences: '',
    } as any as ReportOnSurveyData;

    const result = await appendNarrativeReport(body.bytes, areas.blob, 130, empty, narrativeOptions);

    expect(result.narrativeBlob).toBeUndefined();
    expect((await PDFDocument.load(result.merged)).getPageCount()).toBe(6);
  });

  it('returns the body untouched when there is no report data at all', async () => {
    const body = await makePdf(6);
    const areas = await makePdf(2);
    const result = await appendNarrativeReport(body.bytes, areas.blob, 130, null, narrativeOptions);
    expect(result.narrativeBlob).toBeUndefined();
    expect((await PDFDocument.load(result.merged)).getPageCount()).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/comprehensivePdfNarrative.test.ts`
Expected: FAIL — `appendNarrativeReport is not a function` (not exported yet).

- [ ] **Step 3: Implement the append step**

In `app-frontend/src/composables/useComprehensivePDF.ts`:

(a) Extend the imports at the top:

```ts
import { PDFDocument } from 'pdf-lib'
import { generateNarrativeReportOnSurveyPDF } from '@/utils/reportOnSurveyNarrativeGenerator'
import { isReportDataEmpty } from '@/utils/reportDataFromWorkflow'
import type { ReportOnSurveyData } from '@/types/cadastral'
```

(b) Add the narrative options interface and extend the existing option/result interfaces
(lines 15-33):

```ts
export interface NarrativeReportOptions {
  surveyorName: string
  licenseNumber: string
  firm: string
  address: string
  surveyDate: string
  surveyOf: string
  district?: string
  assistant?: string
}

export interface ComprehensivePDFOptions {
  computedParcels: Parcel[]
  calcPart1Blob: Blob
  projectName: string
  projectId: number  // Added for fetching coordinate points
  lastDisplayedPageNumber: number
  beaconLabels?: Array<{ parcelId: string; label: string; position: [number, number] }>
  workingDirectory?: string
  onNewParcels?: (parcels: Parcel[]) => Promise<void>
  skipParcelTracking?: boolean // Set to true for Survey Plan export (no parcel tracking needed)
  /** Narrative Report of Survey, appended at the very end; omit to skip it */
  reportData?: ReportOnSurveyData | null
  narrativeOptions?: NarrativeReportOptions
}

export interface ComprehensivePDFResult {
  success: boolean
  filePath?: string
  error?: string
  pdfBlob?: Blob
  areasOnlyBlob?: Blob
  /** The narrative section on its own, for the Reports folder copy */
  narrativeBlob?: Blob
}
```

(c) Add the exported helper above `generateComprehensiveLatestPDF`:

```ts
/**
 * Append the narrative Report of Survey to the collated body.
 *
 * The narrative is numbered as a continuation after Areas: Areas' own page count
 * is read back from the rendered areas section, so the first narrative page is
 * calculationsEndPage + areasPages + 1. Nothing cross-references the narrative,
 * so this is a pure tail append.
 *
 * Returns the body unchanged (and no narrative blob) when there is no report data.
 */
export async function appendNarrativeReport(
  mergedPdfBytes: Uint8Array,
  areasOnlyBlob: Blob,
  calculationsEndPage: number,
  reportData: ReportOnSurveyData | null | undefined,
  narrativeOptions: NarrativeReportOptions | undefined
): Promise<{ merged: Uint8Array; narrativeBlob?: Blob }> {
  if (!reportData || isReportDataEmpty(reportData) || !narrativeOptions) {
    console.log('[ComprehensivePDF] ℹ️ No report data — skipping narrative Report of Survey')
    return { merged: mergedPdfBytes }
  }

  const areasDoc = await PDFDocument.load(await areasOnlyBlob.arrayBuffer())
  const narrativeStartPage = calculationsEndPage + areasDoc.getPageCount() + 1
  console.log('[ComprehensivePDF] 📝 Appending Report of Survey from page', narrativeStartPage)

  const narrative = await generateNarrativeReportOnSurveyPDF(
    reportData,
    narrativeOptions,
    narrativeStartPage
  )

  const bodyDoc = await PDFDocument.load(mergedPdfBytes)
  const narrativeDoc = await PDFDocument.load(await narrative.pdf.arrayBuffer())
  const copied = await bodyDoc.copyPages(narrativeDoc, narrativeDoc.getPageIndices())
  copied.forEach((page) => bodyDoc.addPage(page))

  return { merged: await bodyDoc.save(), narrativeBlob: narrative.pdf }
}
```

(d) Destructure the new options inside `generateComprehensiveLatestPDF` — add to the
existing destructuring block (lines 44-54):

```ts
    reportData,
    narrativeOptions
```

(e) Replace the two lines that read the area result (currently lines 94-100) with:

```ts
    const areasOnlyBlob = areaResult.areasOnly

    // Fold the narrative Report of Survey in at the very bottom of the record.
    const withNarrative = await appendNarrativeReport(
      areaResult.merged,
      areasOnlyBlob,
      lastDisplayedPageNumber,
      reportData,
      narrativeOptions
    )
    const mergedPdfBytes = withNarrative.merged
    const narrativeBlob = withNarrative.narrativeBlob

    console.log('[ComprehensivePDF] ✅ PDF generated successfully')

    // Create blob
    const blob = new Blob([mergedPdfBytes as any], { type: 'application/pdf' })
    const filename = 'Comprehensive_Latest.pdf'
```

(f) Add `narrativeBlob` to all three success/fallback returns. The save-success return
(lines 125-130) becomes:

```ts
        return {
          success: true,
          filePath: saveResult.filePath,
          pdfBlob: blob,
          areasOnlyBlob,
          narrativeBlob
        }
```

the save-failure return (lines 137-141) becomes:

```ts
        return {
          success: false,
          error: saveResult.error,
          pdfBlob: blob,
          narrativeBlob
        }
```

and the no-working-directory return (lines 147-151) becomes:

```ts
      return {
        success: true,
        pdfBlob: blob,
        areasOnlyBlob,
        narrativeBlob
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/comprehensivePdfNarrative.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/composables/useComprehensivePDF.ts app-frontend/src/composables/__tests__/comprehensivePdfNarrative.test.ts
git commit -m "$(cat <<'EOF'
feat(comprehensive-pdf): append the narrative Report of Survey at the end

Numbered as a continuation after Areas (calc end + areas pages + 1) and also
returned on its own for the Reports folder copy. Skipped entirely when the
report data is empty.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Folder copies for both reports

**Files:**
- Modify: `app-frontend/src/composables/useSurveyRecordOutputs.ts`
- Test: `app-frontend/src/composables/__tests__/surveyRecordOutputs.test.ts`

**Interfaces:**
- Produces: `SurveyRecordSections` gains `beaconComparison?: Blob` and `reportOnSurvey?: Blob`. Job list gains `output/calculations/BeaconComparison.pdf` (`documentType: 'calculations-part1'`) and `output/reports/ReportOnSurvey.pdf` (`documentType: 'report-on-survey'`), both `overwrite: true`, both only when the blob is present.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/composables/__tests__/surveyRecordOutputs.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const saveDocument = vi.fn();
vi.mock('@/services/documentStorage', () => ({
  saveDocument: (...args: any[]) => saveDocument(...args),
}));

const { saveSurveyRecordSections } = await import('../useSurveyRecordOutputs');

const blob = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });

describe('saveSurveyRecordSections', () => {
  beforeEach(() => {
    saveDocument.mockReset();
    saveDocument.mockImplementation(async (opts: any) => ({
      success: true,
      filePath: `/out/${opts.fileName}`,
    }));
  });

  it('writes the four core sections when no reports are supplied', async () => {
    const result = await saveSurveyRecordSections({
      workingDirectory: '/wd',
      sections: {
        fieldBook: blob(), coordinateList: blob(), calculations: blob(), areas: blob(),
      },
    });
    const names = saveDocument.mock.calls.map((c) => c[0].fileName);
    expect(names).toEqual([
      'FieldBook.pdf', 'CoordinateList.pdf', 'Calculations.pdf', 'AreasAndConsistency.pdf',
    ]);
    expect(result.failed).toEqual([]);
  });

  it('writes BeaconComparison.pdf to Calculations and ReportOnSurvey.pdf to Reports', async () => {
    await saveSurveyRecordSections({
      workingDirectory: '/wd',
      sections: {
        fieldBook: blob(), coordinateList: blob(), calculations: blob(), areas: blob(),
        beaconComparison: blob(), reportOnSurvey: blob(),
      },
    });
    const byName = Object.fromEntries(
      saveDocument.mock.calls.map((c) => [c[0].fileName, c[0]])
    );
    expect(byName['BeaconComparison.pdf'].documentType).toBe('calculations-part1');
    expect(byName['BeaconComparison.pdf'].overwrite).toBe(true);
    expect(byName['ReportOnSurvey.pdf'].documentType).toBe('report-on-survey');
    expect(byName['ReportOnSurvey.pdf'].overwrite).toBe(true);
  });

  it('records a failed write without aborting the others', async () => {
    saveDocument.mockImplementation(async (opts: any) =>
      opts.fileName === 'BeaconComparison.pdf'
        ? { success: false, error: 'file is open in another program' }
        : { success: true, filePath: `/out/${opts.fileName}` }
    );

    const result = await saveSurveyRecordSections({
      workingDirectory: '/wd',
      sections: {
        fieldBook: blob(), coordinateList: blob(), calculations: blob(), areas: blob(),
        beaconComparison: blob(), reportOnSurvey: blob(),
      },
    });

    expect(result.failed).toEqual([
      { label: 'Beacon Comparison', error: 'file is open in another program' },
    ]);
    expect(result.saved).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/surveyRecordOutputs.test.ts`
Expected: FAIL — the second test fails because `BeaconComparison.pdf` was never written (`byName['BeaconComparison.pdf']` is `undefined`).

- [ ] **Step 3: Add the two conditional jobs**

In `app-frontend/src/composables/useSurveyRecordOutputs.ts`, replace the `SurveyRecordSections`
interface (lines 3-8) and the `jobs` array (lines 30-35) with:

```ts
export interface SurveyRecordSections {
  fieldBook: Blob
  coordinateList: Blob
  calculations: Blob
  areas: Blob
  /** SI 727 s.67(5) Beacon Comparison Report — copied into the Calculations folder */
  beaconComparison?: Blob
  /** Narrative Report of Survey — copied into the Reports folder */
  reportOnSurvey?: Blob
}
```

```ts
  const jobs: Array<{ label: string; documentType: SaveDocumentOptions['documentType']; fileName: string; pdfBlob: Blob }> = [
    { label: 'Field book', documentType: 'field-book', fileName: 'FieldBook.pdf', pdfBlob: sections.fieldBook },
    { label: 'Coordinate List', documentType: 'coordinate-list', fileName: 'CoordinateList.pdf', pdfBlob: sections.coordinateList },
    { label: 'Calculations', documentType: 'calculations-part1', fileName: 'Calculations.pdf', pdfBlob: sections.calculations },
    { label: 'Areas & Consistency', documentType: 'areas-consistency', fileName: 'AreasAndConsistency.pdf', pdfBlob: sections.areas },
  ]

  // Both reports are optional: absent when the project has no beacon comparison
  // or no Report on Survey data.
  if (sections.beaconComparison) {
    jobs.push({ label: 'Beacon Comparison', documentType: 'calculations-part1', fileName: 'BeaconComparison.pdf', pdfBlob: sections.beaconComparison })
  }
  if (sections.reportOnSurvey) {
    jobs.push({ label: 'Report on Survey', documentType: 'report-on-survey', fileName: 'ReportOnSurvey.pdf', pdfBlob: sections.reportOnSurvey })
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/surveyRecordOutputs.test.ts`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/composables/useSurveyRecordOutputs.ts app-frontend/src/composables/__tests__/surveyRecordOutputs.test.ts
git commit -m "$(cat <<'EOF'
feat(outputs): write BeaconComparison.pdf and ReportOnSurvey.pdf folder copies

Beacon comparison lands in output/calculations/, the narrative in
output/reports/; both best-effort and skipped when the section is absent.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Persist the Report on Survey step data

`workflowState.reportOnSurvey` is in-memory only today, so `SurveyPlanMapView` — which
rebuilds workflow state from the backend — has nothing to build the reports from.
Persist it under `step_data['report-on-survey'].report_data` (which
`buildReportDataFromWorkflow` already reads) and restore it on load. This is an addition
to the design spec; without it, the Survey Plan export path can never emit either report.

**Files:**
- Modify: `app-frontend/src/composables/useCadastralWorkflow.ts` (restore in `loadWorkflowState`, after the "Restore adjusted coordinates" block at lines 385-389)
- Modify: `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue:2816-2822` (persist from the Found Beacons handler)
- Modify: `app-frontend/src/views/modules/cadastral-standard/ReportOnSurveyView.vue:673-677, 697-700` (persist on save-draft and on generate)

**Interfaces:**
- Consumes: `saveStepData(step: string, metadata: any)` from `useCadastralWorkflow` (already exported).
- Produces: backend `step_data['report-on-survey'].report_data` holds the full `ReportOnSurveyData`; `loadWorkflowState` restores it into `workflowState.reportOnSurvey`.

- [ ] **Step 1: Restore the report on workflow load**

In `app-frontend/src/composables/useCadastralWorkflow.ts`, immediately after the
"Restore adjusted coordinates from calculations_part1 step" block (lines 385-389), add:

```ts
      // Restore the Report on Survey so the collated document can rebuild both
      // the Beacon Comparison Report and the narrative without the user having
      // to revisit the Report on Survey step.
      if (dbState.step_data?.['report-on-survey']?.report_data) {
        workflowState.reportOnSurvey = dbState.step_data['report-on-survey'].report_data
        console.log(
          `✅ Restored Report on Survey (${workflowState.reportOnSurvey?.beacons?.length || 0} beacons)`
        )
      }
```

- [ ] **Step 2: Persist from the Found Beacons handler**

In `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`, add
`saveStepData` to the `useCadastralWorkflow()` destructuring (line 1324-1340) — insert it
next to `setCurrentStep`:

```ts
  setCurrentStep,
  saveStepData,
```

Then, in `handleFoundBeaconsSave`, replace the log lines that follow the comparison-config
assignment (lines 2822-2824) with:

```ts
  console.log('[Found Beacons] ✅ Beacon data and comparison config saved.');
  console.log('[Found Beacons] Comparison method:', data.comparisonConfig.method);
  console.log('[Found Beacons] Tolerance:', data.comparisonConfig.toleranceThreshold);
  
  // Persist so the Survey Plan export (which rebuilds workflow state from the
  // backend) can collate the Beacon Comparison Report.
  saveStepData('report-on-survey', { report_data: workflowState.reportOnSurvey });
```

- [ ] **Step 3: Persist from the Report on Survey step**

In `app-frontend/src/views/modules/cadastral-standard/ReportOnSurveyView.vue`, change the
destructuring on line 474:

```ts
const { workflowState, saveStepData } = useCadastralWorkflow()
```

Replace `saveDraft` (lines 673-677) with:

```ts
const saveDraft = async () => {
  workflowState.reportOnSurvey = { ...reportData.value }
  await saveStepData('report-on-survey', { report_data: workflowState.reportOnSurvey })
  console.log('[ReportOnSurvey] Draft saved')
  alert('✅ Draft saved successfully!')
}
```

And in `generateReport`, replace the save-to-workflow-state line (line 699) with:

```ts
    // Save to workflow state (and persist for the collated document)
    workflowState.reportOnSurvey = { ...reportData.value }
    await saveStepData('report-on-survey', { report_data: workflowState.reportOnSurvey })
```

- [ ] **Step 4: Type-check**

Run: `cd app-frontend && npx vue-tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `useCadastralWorkflow.ts`, `CadastralStandardView.vue`, or `ReportOnSurveyView.vue`. (If the project already has pre-existing errors elsewhere, compare against `git stash`-clean output and only fix ones you introduced.)

- [ ] **Step 5: Run the full suite**

Run: `cd app-frontend && npm test`
Expected: PASS — no new failures.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/composables/useCadastralWorkflow.ts app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue app-frontend/src/views/modules/cadastral-standard/ReportOnSurveyView.vue
git commit -m "$(cat <<'EOF'
feat(workflow): persist and restore Report on Survey step data

Stores the report under step_data['report-on-survey'].report_data on the Found
Beacons save and on the Report on Survey save/generate, and restores it on
workflow load, so the Survey Plan export can rebuild both collated reports from
backend state.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Wire both caller views

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue:6390-6405` (generator inputs), `:6445-6451` (helper signature), `:6474-6489` (composable inputs), `:6526-6542` (section save)
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:4422-4437` (generator inputs), `:4451-4474` (composable inputs), `:4506-4521` (section save)

**Interfaces:**
- Consumes: `buildReportDataFromWorkflow` (Task 3); `ComprehensiveDocumentData.reportData` / `.reportOptions` (Task 5); `ComprehensivePDFOptions.reportData` / `.narrativeOptions` and `ComprehensivePDFResult.narrativeBlob` (Task 6); `SurveyRecordSections.beaconComparison` / `.reportOnSurvey` (Task 7).

- [ ] **Step 1: Wire `MapLibreAreaView.vue`**

(a) Add the import next to the other `@/composables` / `@/utils` imports (near line 914):

```ts
import { buildReportDataFromWorkflow } from '@/utils/reportDataFromWorkflow';
```

(b) Immediately before the `const result = await generator.generateWithTwoPass({` call
(line 6390), add:

```ts
    // Both collated reports are rebuilt from workflow state at collation time.
    const reportData = buildReportDataFromWorkflow(workflowState);
    const reportOptions = {
      surveyorName: workflowState?.surveyorInfo?.landSurveyor || '',
      licenseNumber: workflowState?.surveyorInfo?.licenseNumber || '',
      surveyDate: workflowState?.surveyorInfo?.surveyDate || '',
      surveyOf: workflowState?.surveyorInfo?.surveyOf || surveyorInfo.projectTitle || '',
    };
    const narrativeOptions = {
      ...reportOptions,
      firm: workflowState?.surveyorInfo?.firm || '',
      address: workflowState?.surveyorInfo?.address || '',
      district: workflowState?.projectInfo?.district || '',
      assistant: 'N/A',
    };
```

(c) Add the two fields to the `generateWithTwoPass` argument object, after `beaconLabels`
(line 6404):

```ts
      beaconLabels: beaconLabels.value,
      reportData,
      reportOptions
```

(d) Widen the `generateComprehensivePDF` helper signature (lines 6445-6451) to carry the
report inputs and the new section blob:

```ts
async function generateComprehensivePDF(
  computedParcels: Parcel[],
  calcPart1Blob: Blob,
  projectName: string,
  lastDisplayedPageNumber: number,
  twoPassSections?: { cover: Blob; fieldBook: Blob; coordinateList: Blob; calculations: Blob; beaconComparison?: Blob },
  reportInputs?: { reportData: any; narrativeOptions: any }
) {
```

(e) Update its call site (line 6432):

```ts
    await generateComprehensivePDF(
      computedParcels,
      result.pdf,
      surveyorInfo.projectTitle,
      lastDisplayedPageNumber,
      result.sections,
      { reportData, narrativeOptions }
    );
```

(f) Add the two options to the `generateComprehensiveLatestPDF` call — after the
`onNewParcels` property (line 6488), inside the same object:

```ts
      onNewParcels: async (parcels) => {
        await markParcelsAsIncludedInPdf(newParcels);
      },
      reportData: reportInputs?.reportData,
      narrativeOptions: reportInputs?.narrativeOptions
```

(g) Extend the section-save block (lines 6529-6537):

```ts
      const split = await saveSurveyRecordSections({
        workingDirectory: recordWorkingDirectory,
        sections: {
          fieldBook: twoPassSections.fieldBook,
          coordinateList: twoPassSections.coordinateList,
          calculations: twoPassSections.calculations,
          areas: result.areasOnlyBlob,
          beaconComparison: twoPassSections.beaconComparison,
          reportOnSurvey: result.narrativeBlob,
        },
      });
```

- [ ] **Step 2: Wire `SurveyPlanMapView.vue`**

(a) Add the import next to the existing `saveSurveyRecordSections` import (line 634):

```ts
import { buildReportDataFromWorkflow } from '@/utils/reportDataFromWorkflow';
```

(b) Immediately before `const result = await generator.generateWithTwoPass({` (line 4422),
add — note this view's `workflowState` is the backend shape, which the adapter handles:

```ts
    // Rebuilt from the persisted workflow state (step_data['report-on-survey']).
    const reportData = buildReportDataFromWorkflow(workflowState)
    const reportOptions = {
      surveyorName: surveyorInfo.name || '',
      licenseNumber: surveyorInfo.licenseNumber || '',
      surveyDate: surveyorInfo.surveyDate || '',
      surveyOf: surveyorInfo.projectTitle || projectName || '',
    }
    const narrativeOptions = {
      ...reportOptions,
      firm: (surveyorInfo as any).firm || '',
      address: (surveyorInfo as any).address || '',
      district: (surveyorInfo as any).district || '',
      assistant: 'N/A',
    }
```

(c) Add the two fields to the `generateWithTwoPass` argument object, after `beaconLabels`
(line 4436):

```ts
      beaconLabels: intelligentPreview.value?.beaconLabels || [],
      reportData,
      reportOptions
```

(d) Add the two options to the `generateComprehensivePDFComposable` call — after the
`onNewParcels` property closes (line 4473), inside the same object:

```ts
      },
      reportData,
      narrativeOptions
    })
```

(e) Extend the section-save block (lines 4508-4516):

```ts
      const split = await saveSurveyRecordSections({
        workingDirectory,
        sections: {
          fieldBook: result.sections.fieldBook,
          coordinateList: result.sections.coordinateList,
          calculations: result.sections.calculations,
          areas: finalResult.areasOnlyBlob,
          beaconComparison: result.sections.beaconComparison,
          reportOnSurvey: finalResult.narrativeBlob,
        },
      });
```

- [ ] **Step 3: Type-check both views**

Run: `cd app-frontend && npx vue-tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `MapLibreAreaView.vue` or `SurveyPlanMapView.vue`.

- [ ] **Step 4: Build to confirm the app still compiles**

Run: `cd app-frontend && npm run build`
Expected: `built in ...` with no errors.

- [ ] **Step 5: Run the full suite**

Run: `cd app-frontend && npm test`
Expected: PASS — no new failures.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "$(cat <<'EOF'
feat(comprehensive-pdf): wire both caller views to the collated reports

MapLibreAreaView and SurveyPlanMapView build report data via the shared adapter,
pass it into the two-pass generator and the comprehensive composable, and hand
the beacon-comparison and narrative blobs to the section-save step.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: End-to-end manual QA

No code changes — verify the feature in the running app and record the result.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-22-comprehensive-pdf-reports-collation-design.md` (status line)

- [ ] **Step 1: Start the app**

Run, in two terminals:
```bash
cd app-backend && npm run dev
cd app-frontend && npm run dev
```
Expected: backend on `:3050`, frontend on `:5173`.

- [ ] **Step 2: Full-data pass**

Open a project that has a completed Found Beacons comparison and a filled Report on Survey,
run the cadastral workflow through to the Comprehensive PDF, then open the generated
`Comprehensive_Latest.pdf` and confirm:
- The Beacon Comparison Report appears immediately before Calculations Part 1.
- Its page numbers continue the Coordinate List's sequence with no gap or repeat.
- Calculations Part 1 starts at `coordinateListEnd + K + 1`.
- Spot-check three points in the Coordinate List: each cross-referenced calculation page
  number lands on the page that actually holds that point's calculation.
- The narrative Report of Survey is the last section, numbered on from Areas' last page.

- [ ] **Step 3: Folder copies**

In the project's output folder, confirm both files exist and open correctly:
- `Surveyors/<surveyor>/<project>/output/calculations/BeaconComparison.pdf`
- `Surveyors/<surveyor>/<project>/output/reports/ReportOnSurvey.pdf`

- [ ] **Step 4: Skip pass**

Open a project **without** a beacon comparison and generate the Comprehensive PDF. Confirm:
- No Beacon Comparison Report appears; Calculations starts at `coordinateListEnd + 1`.
- Coordinate List cross-references are unchanged.
- No `BeaconComparison.pdf` is written.

- [ ] **Step 5: Survey Plan export pass**

From `SurveyPlanMapView`'s Complete Survey Record export on the full-data project, confirm
the same two sections appear in `Comprehensive_Latest.pdf`.

- [ ] **Step 6: Mark the spec implemented and commit**

Change the spec's status line to:

```markdown
**Status:** Implemented (see `docs/superpowers/plans/2026-07-22-comprehensive-pdf-reports-collation.md`)
```

```bash
git add docs/superpowers/specs/2026-07-22-comprehensive-pdf-reports-collation-design.md
git commit -m "$(cat <<'EOF'
docs(comprehensive-pdf): mark reports-collation design implemented

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Deviations from the design spec

- **Task 8 (persisting Report on Survey step data) is not in the spec.** The spec names
  `SurveyPlanMapView.vue` as an integration point, but `workflowState.reportOnSurvey` is
  in-memory only — that view rebuilds workflow state from the backend, where the report is
  never stored. Without persistence the Survey Plan export would always take the
  graceful-skip path. The adapter reads both shapes so nothing else has to care.
- **The shared renderer lives in `beaconComparisonSection.ts`, not inside
  `reportOnSurveyGenerator.ts`.** The spec says "extracted from" that file; a cursor-based
  module is the extraction that lets a second, differently-shaped generator reuse it
  without inheriting the whole `ReportOnSurveyGenerator` class.
- **`appendNarrativeReport` is exported from `useComprehensivePDF.ts`** so the append
  arithmetic is unit-testable without stubbing `saveDocument` and `listCoordinatePoints`.
