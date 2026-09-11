import { describe, it, expect } from 'vitest';
import { CoverPageGenerator, type CoverPageInfo } from '../cover-page';

const baseInfo: CoverPageInfo = {
  projectTitle: 'Maglas',
  surveyorName: 'C. Paradzayi',
  licenseNumber: 'PLS 123',
  surveyDate: '2026-01-01',
  surveyType: 'STANDS 207 - 270 MAGLAS TOWNSHIP',
};

describe('CoverPageGenerator', () => {
  it('produces a non-empty PDF blob when documents are supplied', () => {
    const gen = new CoverPageGenerator();
    const blob = gen.generateCoverPage({
      ...baseInfo,
      documents: [
        { label: 'Field book', displayLabel: 'Field book', present: true },
        { label: 'General Plan', displayLabel: 'General Plan', present: false },
      ],
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('still produces a PDF when documents are omitted (falls back to defaults)', () => {
    const gen = new CoverPageGenerator();
    const blob = gen.generateCoverPage(baseInfo);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('produces a PDF when rows carry detail lines', () => {
    const gen = new CoverPageGenerator();
    const blob = gen.generateCoverPage({
      ...baseInfo,
      documents: [
        { label: 'Field book', displayLabel: 'Field book', present: true },
        {
          label: 'Diagram',
          displayLabel: 'Diagrams',
          present: true,
          detail: ['3 diagrams, 9 copies', 'PDF 3 · DXF 3'],
        },
        {
          label: 'General Plan',
          displayLabel: 'General Plans',
          present: true,
          detail: ['2 general plans, 4 sheets', 'PDF 2 · DXF 2'],
        },
      ],
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('still produces a PDF when detail is omitted on every row', () => {
    const gen = new CoverPageGenerator();
    const blob = gen.generateCoverPage({
      ...baseInfo,
      documents: [{ label: 'Field book', displayLabel: 'Field book', present: true }],
    });
    expect(blob.size).toBeGreaterThan(0);
  });

  it('produces a PDF when every row carries detail, forcing a page break', () => {
    // Enough detail-bearing rows that the list cannot fit one page — this is the path that
    // used to push the signature off the sheet.
    const gen = new CoverPageGenerator();
    const documents = Array.from({ length: 12 }, (_, i) => ({
      label: `Row ${i}`,
      displayLabel: `Row ${i}`,
      present: true,
      detail: ['detail line one', 'detail line two'],
    }));
    const blob = gen.generateCoverPage({ ...baseInfo, documents });
    expect(blob.size).toBeGreaterThan(0);
  });
});
