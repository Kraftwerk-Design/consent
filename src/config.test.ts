// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  configureConsent,
  defaultGateCategoryId,
  gpcClampedCategoryIds,
  isGpcClamped,
} from './config'

describe('defaultGateCategoryId', () => {
  it('prefers an explicit gateCategory', () => {
    configureConsent({
      gateCategory: 'functionality',
      categories: [
        { id: 'functionality' },
        { id: 'analytics', analytics: true },
      ],
    })
    expect(defaultGateCategoryId()).toBe('functionality')
  })

  it('falls back to the analytics-flagged category', () => {
    configureConsent({
      categories: [{ id: 'necessary' }, { id: 'stats', analytics: true }],
    })
    expect(defaultGateCategoryId()).toBe('stats')
  })

  it("falls back to 'analytics' when nothing is flagged", () => {
    configureConsent({ categories: [{ id: 'necessary' }] })
    expect(defaultGateCategoryId()).toBe('analytics')
  })
})

describe('GPC-clamped set', () => {
  it('defaults to the default gate category when no gpc flags are set', () => {
    configureConsent({
      categories: [{ id: 'necessary' }, { id: 'analytics', analytics: true }],
    })
    expect(gpcClampedCategoryIds()).toEqual(['analytics'])
    expect(isGpcClamped('analytics')).toBe(true)
    expect(isGpcClamped('necessary')).toBe(false)
  })

  it('uses exactly the gpc:true categories once any gpc flag is present', () => {
    configureConsent({
      categories: [
        { id: 'necessary' },
        { id: 'functionality', gpc: false },
        { id: 'analytics', analytics: true, gpc: true },
        { id: 'marketing', gpc: true },
      ],
    })
    expect(gpcClampedCategoryIds().sort()).toEqual(['analytics', 'marketing'])
    expect(isGpcClamped('functionality')).toBe(false)
    expect(isGpcClamped('marketing')).toBe(true)
  })
})
