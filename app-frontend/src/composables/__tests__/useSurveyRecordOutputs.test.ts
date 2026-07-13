import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/documentStorage', () => ({
  saveDocument: vi.fn(),
}));

import { saveDocument } from '@/services/documentStorage';
import { saveSurveyRecordSections } from '../useSurveyRecordOutputs';

const blob = () => new Blob(['x'], { type: 'application/pdf' });
const sections = { fieldBook: blob(), coordinateList: blob(), calculations: blob(), areas: blob() };

describe('saveSurveyRecordSections', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes all four sections to their folders with project-prefixed names and overwrite', async () => {
    (saveDocument as any).mockResolvedValue({ success: true, filePath: 'ok' });
    const res = await saveSurveyRecordSections({
      workingDirectory: 'C:/proj', projectName: 'MAG 1', sections,
    });
    expect(saveDocument).toHaveBeenCalledTimes(4);
    const calls = (saveDocument as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ documentType: 'field-book', fileName: 'MAG_1_FieldBook.pdf', overwrite: true }),
      expect.objectContaining({ documentType: 'coordinate-list', fileName: 'MAG_1_CoordinateList.pdf', overwrite: true }),
      expect.objectContaining({ documentType: 'calculations-part1', fileName: 'MAG_1_Calculations.pdf', overwrite: true }),
      expect.objectContaining({ documentType: 'areas-consistency', fileName: 'MAG_1_AreasAndConsistency.pdf', overwrite: true }),
    ]));
    expect(res.saved.length).toBe(4);
    expect(res.failed).toEqual([]);
  });

  it('is best-effort: a failed save is recorded and does not stop the others', async () => {
    (saveDocument as any)
      .mockResolvedValueOnce({ success: true, filePath: 'a' })
      .mockResolvedValueOnce({ success: false, error: 'locked' })
      .mockResolvedValueOnce({ success: true, filePath: 'c' })
      .mockResolvedValueOnce({ success: true, filePath: 'd' });
    const res = await saveSurveyRecordSections({
      workingDirectory: 'C:/proj', projectName: 'P', sections,
    });
    expect(saveDocument).toHaveBeenCalledTimes(4);
    expect(res.saved.length).toBe(3);
    expect(res.failed.length).toBe(1);
    expect(res.failed[0].error).toBe('locked');
  });

  it('catches a thrown saveDocument and still runs the remaining saves', async () => {
    (saveDocument as any)
      .mockResolvedValueOnce({ success: true, filePath: 'a' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ success: true, filePath: 'c' })
      .mockResolvedValueOnce({ success: true, filePath: 'd' });
    const res = await saveSurveyRecordSections({
      workingDirectory: 'C:/proj', projectName: 'P', sections,
    });
    expect(saveDocument).toHaveBeenCalledTimes(4);
    expect(res.saved.length).toBe(3);
    expect(res.failed.length).toBe(1);
    expect(res.failed[0].error).toBe('boom');
  });
});
