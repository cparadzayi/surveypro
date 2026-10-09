/**
 * The council screens decide what to show from a person's appointments, and say what the backend said when it refuses. Both are pinned here:
 * a head surveyor's panel, the reviewer's queue and the council a surveyor may deliver to must follow ACTIVE appointments only, and a refusal
 * must reach the person in the backend's own words.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))

import api from '../api'
import { deliver, deliverableTo, errorMessage, headOf, mayReview, reviewQueue, setSurveyClass, type MyAppointment } from '../council'

const appt = (over: Partial<MyAppointment>): MyAppointment => ({
  id: 1, code: 'VUNGU', name: 'Vungu RDC', role: 'surveyor', engagement: 'contracted', valid_from: '2026-01-01', valid_to: null, active: true, ...over,
})

describe('who sees what', () => {
  it('reviewers and head surveyors review; surveyors do not', () => {
    expect(mayReview([appt({ role: 'surveyor' })])).toBe(false)
    expect(mayReview([appt({ role: 'reviewer', engagement: null })])).toBe(true)
    expect(mayReview([appt({ role: 'head_surveyor' })])).toBe(true)
  })
  it('an ended appointment gives nothing', () => {
    const ended = appt({ role: 'head_surveyor', active: false, valid_to: '2026-02-01' })
    expect(mayReview([ended])).toBe(false)
    expect(headOf([ended])).toEqual([])
    expect(deliverableTo([appt({ active: false })])).toEqual([])
  })
  it('only a head surveyor appoints', () => {
    expect(headOf([appt({ role: 'surveyor' }), appt({ id: 2, role: 'head_surveyor', code: 'GWERU' })]).map((a) => a.code)).toEqual(['GWERU'])
  })
  it('a surveyor delivers where they work, not where they only review', () => {
    const list = [appt({ code: 'A' }), appt({ id: 2, code: 'B', role: 'reviewer', engagement: null }), appt({ id: 3, code: 'C', role: 'head_surveyor' })]
    expect(deliverableTo(list).map((a) => a.code)).toEqual(['A', 'C'])
  })
})

describe('refusals', () => {
  it('uses the backend\'s message', () => {
    expect(errorMessage({ response: { data: { error: 'not_appointed', message: 'You are not appointed to that council today.' } } })).toBe('You are not appointed to that council today.')
  })
  it('falls back to the error code, then to a plain sentence', () => {
    expect(errorMessage({ response: { data: { error: 'frozen' } } })).toBe('frozen')
    expect(errorMessage({}, 'Try again.')).toBe('Try again.')
  })
})

describe('calls', () => {
  it('delivers with the council only when one is chosen', async () => {
    ;(api.post as any).mockResolvedValue({ data: { data: { delivered_at: 'x', parcels: 2, points: 0 } } })
    await deliver(7)
    expect(api.post).toHaveBeenLastCalledWith('/survey-projects/7/deliver', {})
    await deliver(7, 'VUNGU')
    expect(api.post).toHaveBeenLastCalledWith('/survey-projects/7/deliver', { authority_code: 'VUNGU' })
  })
  it('declares and clears the class', async () => {
    ;(api.patch as any).mockResolvedValue({ data: { data: { survey_class: null } } })
    expect(await setSurveyClass(7, null)).toBeNull()
    expect(api.patch).toHaveBeenLastCalledWith('/survey-projects/7/survey-class', { survey_class: null })
  })
  it('filters the queue by council only when asked', async () => {
    ;(api.get as any).mockResolvedValue({ data: { data: [] } })
    await reviewQueue()
    expect(api.get).toHaveBeenLastCalledWith('/reviews/queue', { params: {} })
    await reviewQueue('VUNGU')
    expect(api.get).toHaveBeenLastCalledWith('/reviews/queue', { params: { authority: 'VUNGU' } })
  })
})
