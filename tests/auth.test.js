// tests/auth.test.js
import { describe, it, expect } from 'vitest'

describe('getActiveProviderNames', () => {
  it('returns github when GITHUB env vars are set', async () => {
    // tests/setup.js sets GITHUB env vars
    const { getActiveProviderNames } = await import('../auth.js')
    const names = getActiveProviderNames()
    expect(names.some(p => p.id === 'github')).toBe(true)
  })

  it('each provider has id and name fields', async () => {
    const { getActiveProviderNames } = await import('../auth.js')
    const names = getActiveProviderNames()
    for (const p of names) {
      expect(p).toHaveProperty('id')
      expect(p).toHaveProperty('name')
      expect(typeof p.id).toBe('string')
      expect(typeof p.name).toBe('string')
    }
  })
})

describe('authConfig', () => {
  it('has a providers array', async () => {
    const { authConfig } = await import('../auth.js')
    expect(Array.isArray(authConfig.providers)).toBe(true)
    expect(authConfig.providers.length).toBeGreaterThan(0)
  })
})
