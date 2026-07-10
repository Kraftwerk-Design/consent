import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasGpcSignal } from './gpc'

describe('hasGpcSignal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false and does not throw when navigator is undefined (SSR)', () => {
    vi.stubGlobal('navigator', undefined)
    expect(() => hasGpcSignal()).not.toThrow()
    expect(hasGpcSignal()).toBe(false)
  })

  it('returns true when navigator.globalPrivacyControl is true', () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: true })
    expect(hasGpcSignal()).toBe(true)
  })

  it('returns false when navigator.globalPrivacyControl is false', () => {
    vi.stubGlobal('navigator', { globalPrivacyControl: false })
    expect(hasGpcSignal()).toBe(false)
  })

  it('returns false when navigator.globalPrivacyControl is absent', () => {
    vi.stubGlobal('navigator', {})
    expect(hasGpcSignal()).toBe(false)
  })
})
