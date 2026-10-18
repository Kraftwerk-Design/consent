// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { resolveConfig } from './config'
import { defaultConsentConfig } from './config.default'

describe('config defaults', () => {
  it('uses the neutral consent-change event name by default', () => {
    expect(resolveConfig().consentChangeEvent).toBe('consent:change')
  })

  it('exposes gateCategory as an optional override', () => {
    expect(resolveConfig({ gateCategory: 'functionality' }).gateCategory).toBe('functionality')
  })

  it('carries a per-category gpc flag through configuration', () => {
    expect(resolveConfig({ categories: [{ id: 'analytics', gpc: true }] }).categories[0].gpc).toBe(true)
  })

  it('default config leaves gpc and gateCategory unset', () => {
    expect(defaultConsentConfig.gateCategory).toBeUndefined()
    expect(
      defaultConsentConfig.categories.every((c) => c.gpc === undefined),
    ).toBe(true)
  })
})

describe('reload defaults', () => {
  it('reloads only on withdraw by default', () => {
    expect(defaultConsentConfig.reload).toBe('on-withdraw')
  })
})

describe('integration defaults', () => {
  it('ships no integrations', () => {
    expect(defaultConsentConfig.integrations).toEqual([])
  })
})
