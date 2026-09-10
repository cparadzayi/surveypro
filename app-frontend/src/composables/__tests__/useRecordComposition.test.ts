import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({
  default: { patch: vi.fn().mockResolvedValue({ data: { ok: true } }) },
}));
vi.mock('@/services/landParcels', () => ({
  getLandParcels: vi.fn(),
}));

import api from '@/services/api';
import { getLandParcels } from '@/services/landParcels';
import { useRecordComposition } from '../useRecordComposition';

describe('useRecordComposition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecordComposition().resetCache();
  });

  it('hydrates a confirmed value from workflow state without fetching parcels', async () => {
    const { loadComposition } = useRecordComposition();
    const c = await loadComposition(42, {
      step_data: {
        'record-composition': {
          includesDiagrams: false,
          includesGeneralPlans: true,
          source: 'confirmed',
          confirmedAt: '2026-09-10T00:00:00.000Z',
        },
      },
    });
    expect(c).not.toBeNull();
    expect(c!.includesGeneralPlans).toBe(true);
    expect(c!.source).toBe('confirmed');
    expect(getLandParcels).not.toHaveBeenCalled();
  });

  it('infers from the parcel count when nothing is persisted', async () => {
    (getLandParcels as any).mockResolvedValue([
      { stand: '207' }, { stand: '208' }, { stand: '209' },
    ]);
    const { loadComposition } = useRecordComposition();
    const c = await loadComposition(42, { step_data: {} });
    expect(getLandParcels).toHaveBeenCalledWith(42);
    expect(c!.includesGeneralPlans).toBe(true);
    expect(c!.source).toBe('inferred');
  });

  it('excludes the Outside Figure parcel from the count', async () => {
    // One real stand plus the Outside Figure must infer a DIAGRAM survey, not a
    // general plan -- counting the Outside Figure would silently flip the guess.
    (getLandParcels as any).mockResolvedValue([
      { stand: '207' }, { stand: 'Outside Figure' },
    ]);
    const { loadComposition } = useRecordComposition();
    const c = await loadComposition(42, { step_data: {} });
    expect(c!.includesDiagrams).toBe(true);
    expect(c!.includesGeneralPlans).toBe(false);
  });

  it('ignores a persisted value that is not a valid confirmed composition', async () => {
    (getLandParcels as any).mockResolvedValue([{ stand: '207' }]);
    const { loadComposition } = useRecordComposition();
    const c = await loadComposition(42, {
      step_data: { 'record-composition': { source: 'inferred', includesDiagrams: true } },
    });
    expect(c!.source).toBe('inferred');
    expect(getLandParcels).toHaveBeenCalled();
  });

  it('persists a confirmation to the workflow endpoint and caches it', async () => {
    const { confirmComposition, compositionFor } = useRecordComposition();
    const c = await confirmComposition(42, true, true);
    expect(c.source).toBe('confirmed');
    expect(c.confirmedAt).toBeTruthy();
    expect(api.patch).toHaveBeenCalledWith('/survey-projects/42/workflow', {
      step: 'record-composition',
      action: 'update',
      metadata: expect.objectContaining({
        includesDiagrams: true,
        includesGeneralPlans: true,
        source: 'confirmed',
      }),
    });
    expect(compositionFor(42)!.includesDiagrams).toBe(true);
  });

  it('refuses to confirm a composition with neither family', async () => {
    const { confirmComposition } = useRecordComposition();
    await expect(confirmComposition(42, false, false)).rejects.toThrow(/at least one/i);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('serves a cached value without refetching', async () => {
    (getLandParcels as any).mockResolvedValue([{ stand: '207' }, { stand: '208' }]);
    const { loadComposition } = useRecordComposition();
    await loadComposition(42, { step_data: {} });
    await loadComposition(42, { step_data: {} });
    expect(getLandParcels).toHaveBeenCalledTimes(1);
  });

  it('exposes the parcel count the guess was based on, for the banner hint', async () => {
    (getLandParcels as any).mockResolvedValue([
      { stand: '207' }, { stand: '208' }, { stand: 'Outside Figure' },
    ]);
    const { loadComposition, parcelCountFor } = useRecordComposition();
    await loadComposition(42, { step_data: {} });
    expect(parcelCountFor(42)).toBe(2);
  });

  it('has no parcel count for a project hydrated straight from workflow state', async () => {
    const { loadComposition, parcelCountFor } = useRecordComposition();
    await loadComposition(42, {
      step_data: {
        'record-composition': {
          includesDiagrams: true,
          includesGeneralPlans: false,
          source: 'confirmed',
        },
      },
    });
    expect(parcelCountFor(42)).toBeNull();
  });
});
