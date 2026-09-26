// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
// @ts-expect-error — ?raw has no ambient type declaration in this project
import sampleXml from './fixtures/siteCalibrationReport.xml?raw'
import { parseSiteCalibration, siteCalibrationFrom } from '../siteCalibration'

/**
 * Two different objects are called `workflowState` in this codebase and they
 * have different shapes:
 *
 *   - the reactive singleton from useCadastralWorkflow, which holds the parsed
 *     calibration at `documents.siteCalibration`;
 *   - the raw workflow_state fetched from the API, which holds it at
 *     `step_data['site-calibration'].site_calibration` (and, for projects
 *     predating that step, at `step_data['csv-import']`).
 *
 * SurveyPlanMapView shadows the first with the second, so reading `.documents`
 * there silently yielded undefined and the calibration never reached the field
 * book. Both views now go through one helper that accepts either shape, so the
 * mistake cannot be made twice.
 */
describe('siteCalibrationFrom', () => {
  const cal = parseSiteCalibration(sampleXml)

  it('reads the reactive workflow state (documents.siteCalibration)', () => {
    expect(siteCalibrationFrom({ documents: { siteCalibration: cal } })).toBe(cal)
  })

  it('reads the raw database workflow_state from the calibration step', () => {
    const dbShape = { step_data: { 'site-calibration': { site_calibration: cal } } }
    expect(siteCalibrationFrom(dbShape)).toBe(cal)
  })

  it('reads the pre-split location so existing projects keep their field book pages', () => {
    const dbShape = { step_data: { 'csv-import': { site_calibration: cal } } }
    expect(siteCalibrationFrom(dbShape)).toBe(cal)
  })

  it('prefers the calibration step over the legacy location', () => {
    // A project part-way through migrating has both; the newer key wins.
    const stale = { ...cal, reportName: 'stale from csv-import' }
    const dbShape = {
      step_data: {
        'site-calibration': { site_calibration: cal },
        'csv-import': { site_calibration: stale },
      },
    }
    expect(siteCalibrationFrom(dbShape)).toBe(cal)
  })

  it('reads the underscored step key the backend also accepts', () => {
    const dbShape = { step_data: { import_csv: { site_calibration: cal } } }
    expect(siteCalibrationFrom(dbShape)).toBe(cal)
  })

  it('returns undefined when no calibration was imported', () => {
    expect(siteCalibrationFrom({ documents: {} })).toBeUndefined()
    expect(siteCalibrationFrom({ step_data: { 'csv-import': { points: [] } } })).toBeUndefined()
    expect(siteCalibrationFrom({ step_data: { 'site-calibration': {} } })).toBeUndefined()
    expect(siteCalibrationFrom({})).toBeUndefined()
    expect(siteCalibrationFrom(null)).toBeUndefined()
    expect(siteCalibrationFrom(undefined)).toBeUndefined()
  })

  it('prefers the in-memory copy when a state somehow carries both', () => {
    const stale = { ...cal, reportName: 'stale from database' }
    const both = {
      documents: { siteCalibration: cal },
      step_data: { 'site-calibration': { site_calibration: stale } },
    }
    expect(siteCalibrationFrom(both)).toBe(cal)
  })
})
