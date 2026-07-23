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
