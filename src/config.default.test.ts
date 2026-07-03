// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { configureConsent, getConsentConfig } from './config'
import { defaultConsentConfig } from './config.default'

describe('config defaults', () => {
  it('uses the neutral consent-change event name by default', () => {
    configureConsent({})
    expect(getConsentConfig().consentChangeEvent).toBe('consent:change')
  })

  it('exposes gateCategory as an optional override', () => {
    configureConsent({ gateCategory: 'functionality' })
    expect(getConsentConfig().gateCategory).toBe('functionality')
  })

  it('carries a per-category gpc flag through configuration', () => {
    configureConsent({
      categories: [{ id: 'analytics', analytics: true, gpc: true }],
    })
    expect(getConsentConfig().categories[0].gpc).toBe(true)
  })

  it('default config leaves gpc and gateCategory unset', () => {
    expect(defaultConsentConfig.gateCategory).toBeUndefined()
    expect(
      defaultConsentConfig.categories.every((c) => c.gpc === undefined),
    ).toBe(true)
  })
})
