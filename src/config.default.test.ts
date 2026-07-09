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

describe('googleConsentMode defaults', () => {
  it('is off by default', () => {
    expect(defaultConsentConfig.googleConsentMode).toBe(false)
  })

  it('maps default categories to Consent Mode signals', () => {
    const byId = Object.fromEntries(
      defaultConsentConfig.categories.map((c) => [c.id, c]),
    )
    expect(byId.necessary.google).toEqual([
      'security_storage',
      'functionality_storage',
    ])
    expect(byId.analytics.google).toEqual([
      'analytics_storage',
      'ad_storage',
      'ad_user_data',
      'ad_personalization',
    ])
  })
})

describe('Meta Pixel consent config', () => {
  it('defaults metaPixelConsentMode to false', () => {
    expect(defaultConsentConfig.metaPixelConsentMode).toBe(false)
  })

  it('flags the default analytics category with meta: true', () => {
    const analytics = defaultConsentConfig.categories.find((c) => c.analytics)
    expect(analytics?.meta).toBe(true)
  })
})
