import { describe, test, expect } from '@jest/globals'
import { buildPoolOptions, DEFAULT_IDLE_TIMEOUT_MS } from '../poolOptions.js'

describe('buildPoolOptions', () => {
  test('keeps idle connections for ten minutes by default, not the old 30 seconds', () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(600000)
    expect(buildPoolOptions({ DATABASE_URL: 'postgres://x' })).toMatchObject({ connectionString: 'postgres://x', max: 20, idleTimeoutMillis: 600000 })
  })

  test('DB_IDLE_TIMEOUT_MS overrides it; nonsense falls back to the default', () => {
    expect(buildPoolOptions({ DB_IDLE_TIMEOUT_MS: '120000' }).idleTimeoutMillis).toBe(120000)
    for (const bad of ['abc', '', '0', '-5', '10']) expect(buildPoolOptions({ DB_IDLE_TIMEOUT_MS: bad }).idleTimeoutMillis).toBe(DEFAULT_IDLE_TIMEOUT_MS)
  })

  test('idle connections do not keep a script or test process alive', () => {
    expect(buildPoolOptions({}).allowExitOnIdle).toBe(true)
  })
})
