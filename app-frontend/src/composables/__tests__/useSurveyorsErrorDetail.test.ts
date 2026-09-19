/**
 * API failures must say what actually went wrong.
 *
 * Saving project setup once failed with a bare "Failed to update survey project".
 * The server had in fact reported the real cause in `details` — a Postgres error
 * naming a column that did not exist — but this composable kept only `error` and
 * threw the rest away, so the message that would have identified the fault in
 * seconds never reached the console. Every catch here now surfaces `details`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import api from '../../services/api';
import { useSurveyors } from '../useSurveyors';

/** The shape the backend actually returns: a summary plus the real cause. */
const serverFailure = (summary: string, details: string) => ({
  response: { data: { ok: false, error: summary, details } },
});

describe('useSurveyors error reporting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces the server-reported cause, not just the summary', async () => {
    (api.put as any).mockRejectedValue(
      serverFailure(
        'Failed to update survey project',
        'column "assisted_by" of relation "survey_projects" does not exist',
      ),
    );

    const { updateSurveyProject, error } = useSurveyors();
    const ok = await updateSurveyProject(20, { assistedBy: 'R. T. Mapamula' });

    expect(ok).toBe(false);
    expect(error.value).toContain('assisted_by');
  });

  it('still reports the summary when the server sends no detail', async () => {
    (api.put as any).mockRejectedValue({
      response: { data: { ok: false, error: 'Failed to update survey project' } },
    });

    const { updateSurveyProject, error } = useSurveyors();
    await updateSurveyProject(20, {});

    expect(error.value).toBe('Failed to update survey project');
  });

  it('falls back to its own message when the server sends no body at all', async () => {
    (api.put as any).mockRejectedValue(new Error('Network Error'));

    const { updateSurveyProject, error } = useSurveyors();
    await updateSurveyProject(20, {});

    expect(error.value).toBeTruthy();
  });

  it('applies the same treatment to project creation', async () => {
    (api.post as any).mockRejectedValue(
      serverFailure('Failed to create survey project', 'null value in column "name"'),
    );

    const { createSurveyProject, error } = useSurveyors();
    await createSurveyProject({ name: '' } as any);

    expect(error.value).toContain('null value in column "name"');
  });
});
