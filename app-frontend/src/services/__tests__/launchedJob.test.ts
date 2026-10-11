// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { fromLaunch, rememberLaunchedJob, launchedJob, forgetLaunchedJob } from '../launchedJob'

const answer = {
  authority: { code: 'VUNGU', name: 'Vungu Rural District Council' }, engagement: 'employed',
  project: { id: 7, name: 'Layout survey - Stand Layout 12' },
  job: { id: 'j1', stand_number: 'Layout 12', suburb_ward: 'Ward 6', task_type: 'layout', due_date: '2026-11-30', instructions: 'Lay out three stands.' },
}

describe('the job a surveyor launched with', () => {
  beforeEach(() => sessionStorage.clear())

  it('is shaped from the launch answer', () => {
    expect(fromLaunch(answer)).toMatchObject({ projectId: 7, authorityCode: 'VUNGU', engagement: 'employed', standNumber: 'Layout 12', ward: 'Ward 6', dueDate: '2026-11-30' })
  })
  it('is nothing when the answer has no project', () => {
    expect(fromLaunch({})).toBeNull()
    expect(fromLaunch(null)).toBeNull()
  })
  it('is remembered for the session and can be forgotten', () => {
    rememberLaunchedJob(fromLaunch(answer))
    expect(launchedJob()?.projectId).toBe(7)
    forgetLaunchedJob()
    expect(launchedJob()).toBeNull()
  })
  it('survives storage that is broken or holds rubbish', () => {
    sessionStorage.setItem('launchedJob', '{not json')
    expect(launchedJob()).toBeNull()
    sessionStorage.setItem('launchedJob', JSON.stringify({ projectId: 'x' }))
    expect(launchedJob()).toBeNull()
  })
})
