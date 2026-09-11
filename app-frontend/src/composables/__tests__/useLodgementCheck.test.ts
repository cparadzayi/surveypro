import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/documentStorage', () => ({
  getOutputManifest: vi.fn(),
}));

import { getOutputManifest } from '@/services/documentStorage';
import { checkLodgementDocuments } from '../useLodgementCheck';
import type { RecordComposition } from '@/utils/recordComposition';

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

const composition = (d: boolean, g: boolean): RecordComposition => ({
  includesDiagrams: d,
  includesGeneralPlans: g,
  source: 'confirmed',
});

describe('checkLodgementDocuments — composition aware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('omits General Plan entirely for a diagrams-only record', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [{ name: 'diagram-STAND_207.pdf', relDir: 'output/diagrams', mtimeMs: 1 }],
    });
    const { documents, missing } = await checkLodgementDocuments('some/dir', composition(true, false));
    expect(documents.map(d => d.label)).not.toContain('General Plan');
    expect(missing).not.toContain('General Plan');
    expect(documents.find(d => d.label === 'Diagram')?.present).toBe(true);
  });

  it('flags a declared family whose folder is empty', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [{ name: 'general-undeveloped-MAGLAS.pdf', relDir: 'output/general-plans', mtimeMs: 1 }],
    });
    const { verification } = await checkLodgementDocuments('some/dir', composition(true, true));
    expect(verification.expectedMissing).toEqual(['diagram']);
  });

  it('flags leftover files for a family the record does not declare', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [
        { name: 'general-undeveloped-MAGLAS.pdf', relDir: 'output/general-plans', mtimeMs: 1 },
        { name: 'diagram-STAND_207.pdf', relDir: 'output/diagrams', mtimeMs: 2 },
      ],
    });
    const { verification } = await checkLodgementDocuments('some/dir', composition(false, true));
    expect(verification.unexpectedPresent.map(u => u.family)).toEqual(['diagram']);
  });

  it('returns an empty verification when no composition is given', async () => {
    (getOutputManifest as any).mockResolvedValue({ files: [] });
    const { verification } = await checkLodgementDocuments('some/dir');
    expect(verification).toEqual({ expectedMissing: [], unexpectedPresent: [] });
  });
});

describe('checkLodgementDocuments — unknown sheet counts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports how many general plans have an unreadable sheet count', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [
        { name: 'general-a.pdf', relDir: 'output/general-plans', pageCount: 3 },
        { name: 'general-b.pdf', relDir: 'output/general-plans' },
      ],
    });
    const { unknownSheetPlans } = await checkLodgementDocuments('some/dir');
    expect(unknownSheetPlans).toBe(1);
  });

  it('reports zero when there is no working directory to read', async () => {
    const { unknownSheetPlans } = await checkLodgementDocuments(undefined);
    expect(unknownSheetPlans).toBe(0);
  });
});
