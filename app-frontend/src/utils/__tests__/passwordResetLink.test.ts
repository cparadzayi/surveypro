import { describe, expect, it } from 'vitest'
import { describeTimeLeft, passwordProblem, resetLink } from '../passwordResetLink'

describe('resetLink', () => {
  it('joins the site address and the path, with exactly one slash between', () => {
    expect(resetLink('https://app.example.org', '/reset-password?token=abc')).toBe('https://app.example.org/reset-password?token=abc')
    expect(resetLink('https://app.example.org/', '/reset-password?token=abc')).toBe('https://app.example.org/reset-password?token=abc')
    expect(resetLink('http://localhost:5173', 'reset-password?token=abc')).toBe('http://localhost:5173/reset-password?token=abc')
  })
})

describe('describeTimeLeft', () => {
  const now = new Date('2026-10-28T10:00:00Z')
  it('says how long the link has left, in minutes then hours', () => {
    expect(describeTimeLeft('2026-10-28T10:59:30Z', now)).toBe('in 60 minutes')
    expect(describeTimeLeft('2026-10-28T10:01:00Z', now)).toBe('in 1 minute')
    expect(describeTimeLeft('2026-10-28T10:45:00Z', now)).toBe('in 45 minutes')
    expect(describeTimeLeft('2026-10-28T13:00:00Z', now)).toBe('in 3 hours')
  })
  it('says "now" for a link that is already out of date, or an unreadable time', () => {
    expect(describeTimeLeft('2026-10-28T09:00:00Z', now)).toBe('now')
    expect(describeTimeLeft('garbage', now)).toBe('now')
  })
})

describe('passwordProblem', () => {
  it('asks for length first, then for the two to match', () => {
    expect(passwordProblem('abc', 'abc')).toBe('Use at least 6 characters.')
    expect(passwordProblem('abcdef', 'abcdeg')).toBe('The two passwords do not match.')
  })
  it('is null when fine', () => expect(passwordProblem('abcdef', 'abcdef')).toBeNull())
})
