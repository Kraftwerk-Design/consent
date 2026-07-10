// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import {
  configureConsent,
  defaultGateCategoryId,
  gpcClampedCategoryIds,
  isGpcClamped,
  validateConsentConfig,
} from './config'
import { defaultConsentConfig, type ConsentConfig } from './config.default'

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

describe('validateConsentConfig', () => {
  const cleanConfig: ConsentConfig = {
    ...defaultConsentConfig,
    categories: [
      { id: 'necessary', enabled: true, readOnly: true },
      { id: 'analytics', analytics: true },
    ],
    googleConsentMode: false,
    metaPixelConsentMode: false,
    gateCategory: undefined,
  }

  it('returns no warnings for a clean config', () => {
    expect(validateConsentConfig(cleanConfig)).toEqual([])
  })

  it('flags a gateCategory that names no configured category id', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      gateCategory: 'nonexistent',
    }
    const warnings = validateConsentConfig(config)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/nonexistent/)
  })

  it("flags no analytics:true category and no 'analytics'-id category", () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      categories: [{ id: 'necessary' }, { id: 'stats' }],
    }
    const warnings = validateConsentConfig(config)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/analytics/)
  })

  it('flags more than one category with analytics: true', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      categories: [
        { id: 'stats', analytics: true },
        { id: 'marketing', analytics: true },
      ],
    }
    const warnings = validateConsentConfig(config)
    expect(warnings.some((w) => /analytics: true/.test(w))).toBe(true)
  })

  it('flags duplicate category ids', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      categories: [
        { id: 'analytics', analytics: true },
        { id: 'analytics' },
      ],
    }
    const warnings = validateConsentConfig(config)
    expect(warnings.some((w) => /duplicate/i.test(w) && /analytics/.test(w))).toBe(
      true,
    )
  })

  it('flags google signals on a category when googleConsentMode is false', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      googleConsentMode: false,
      categories: [
        { id: 'analytics', analytics: true, google: ['analytics_storage'] },
      ],
    }
    const warnings = validateConsentConfig(config)
    expect(
      warnings.some((w) => /google/i.test(w) && /analytics/.test(w)),
    ).toBe(true)
  })

  it('flags meta: true on a category when metaPixelConsentMode is false', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      metaPixelConsentMode: false,
      categories: [{ id: 'analytics', analytics: true, meta: true }],
    }
    const warnings = validateConsentConfig(config)
    expect(warnings.some((w) => /meta/i.test(w))).toBe(true)
  })

  it('never throws, even on a pathological config', () => {
    expect(() =>
      validateConsentConfig({ ...cleanConfig, categories: [] }),
    ).not.toThrow()
  })
})

describe('configureConsent runtime validation', () => {
  it('console.warns each validation warning after merging overrides', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    configureConsent({
      gateCategory: 'nonexistent',
      categories: [{ id: 'necessary' }],
    })

    expect(warnSpy).toHaveBeenCalled()
    for (const call of warnSpy.mock.calls) {
      expect(call[0]).toMatch(/^\[consent\] /)
    }

    warnSpy.mockRestore()
  })

  it('does not warn for a clean config', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    configureConsent({
      categories: [
        { id: 'necessary', enabled: true, readOnly: true },
        { id: 'analytics', analytics: true },
      ],
    })

    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
