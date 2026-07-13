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

  it("skips the fetch when no working directory; only the record's own sections tick", async () => {
    const { documents, missing } = await checkLodgementDocuments(undefined);
    expect(getOutputManifest).not.toHaveBeenCalled();
    const present = documents.filter(d => d.present).map(d => d.label).sort();
    expect(present).toEqual(['Coordinate List and Calculations', 'Field book']);
    expect(missing).toContain('General Plan');
    expect(missing).not.toContain('Field book');
  });

  it("ticks the record's own sections even when the manifest lacks them", async () => {
    (getOutputManifest as any).mockResolvedValue({ files: [] });
    const { documents, missing } = await checkLodgementDocuments('some/dir');
    const by = Object.fromEntries(documents.map(d => [d.label, d.present]));
    expect(by['Field book']).toBe(true);
    expect(by['Coordinate List and Calculations']).toBe(true);
    expect(missing).not.toContain('Field book');
    expect(missing).not.toContain('Coordinate List and Calculations');
  });
});
