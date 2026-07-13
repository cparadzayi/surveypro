import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/documentStorage', () => ({
  getOutputManifest: vi.fn(),
}));

import { getOutputManifest } from '@/services/documentStorage';
import { checkLodgementDocuments } from '../useLodgementCheck';

describe('checkLodgementDocuments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks items present from the manifest and lists the missing ones', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [{ name: 'GENERAL-PLAN-Maglas.pdf', relDir: 'output/general-plans' }],
    });
    const { documents, missing } = await checkLodgementDocuments('some/dir');
    expect(getOutputManifest).toHaveBeenCalledWith('some/dir');
    expect(documents.find(d => d.label === 'General Plan')?.present).toBe(true);
    expect(missing).toContain('Working Plan');
    expect(missing).not.toContain('General Plan');
  });

  it('treats everything as missing and skips the fetch when no working directory', async () => {
    const { documents, missing } = await checkLodgementDocuments(undefined);
    expect(getOutputManifest).not.toHaveBeenCalled();
    expect(missing.length).toBe(documents.length);
    expect(documents.every(d => !d.present)).toBe(true);
  });
});
