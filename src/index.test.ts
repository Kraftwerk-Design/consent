import { describe, it, expect } from 'vitest'
import * as pkg from './index'

describe('public exports', () => {
  it('exports the general and legacy helpers', () => {
    for (const name of [
      'hasConsent',
      'requireConsent',
      'promptConsent',
      'onConsentChange',
      'hasAnalyticsConsent',
      'requireAnalyticsConsent',
      'promptAnalyticsConsent',
      'onAnalyticsConsentChange',
      'setupConsentGate',
      'initConsent',
      'installWindowApi',
      'initConsentApi',
    ]) {
      expect(typeof (pkg as Record<string, unknown>)[name]).toBe('function')
    }
  })
})
