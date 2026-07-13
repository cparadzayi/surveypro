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
        { label: 'Field book', present: true },
        { label: 'General Plan', present: false },
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
});
