// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { resolveConfig, validateConsentConfig } from './config'
import { defaultConsentConfig, type ConsentConfig, type ConsentIntegration } from './config.default'

const integration = (categories: string[]): ConsentIntegration => ({
  name: 'test',
  categories,
  apply() {},
})

describe('validateConsentConfig', () => {
  const cleanConfig: ConsentConfig = {
    ...defaultConsentConfig,
    categories: [
      { id: 'necessary', enabled: true, readOnly: true },
      { id: 'analytics' },
    ],
    integrations: [integration(['necessary', 'analytics'])],
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
    expect(warnings).toEqual([
      expect.stringMatching(/nonexistent/),
      expect.stringMatching(/GPC clamp/),
    ])
  })

  it("flags a missing 'analytics' category when gateCategory is unset", () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      categories: [{ id: 'necessary' }, { id: 'stats' }],
      integrations: [],
    }
    const warnings = validateConsentConfig(config)
    expect(warnings).toEqual([
      expect.stringMatching(/default gate category 'analytics'/),
      expect.stringMatching(/GPC clamp/),
    ])
  })

  it('S-O2a flags an empty GPC clamp set', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      categories: [
        { id: 'necessary', enabled: true, readOnly: true },
        { id: 'analytics', gpc: false },
      ],
    }
    const warnings = validateConsentConfig(config)
    expect(warnings).toEqual([expect.stringMatching(/GPC clamp/)])
  })

  it('S-O2a flags a GPC clamp set holding only readOnly categories', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      gateCategory: 'necessary',
    }
    const warnings = validateConsentConfig(config)
    expect(warnings).toEqual([expect.stringMatching(/GPC clamp/)])
  })

  it('flags gpc: true on a readOnly category', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      categories: [
        { id: 'necessary', enabled: true, readOnly: true, gpc: true },
        { id: 'analytics', gpc: true },
      ],
    }
    expect(validateConsentConfig(config)).toEqual([
      expect.stringMatching(/'necessary' is readOnly/),
    ])
  })

  it('S-O2a flags an integration naming an unknown category', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      integrations: [integration(['analytics', 'marketing'])],
    }
    const warnings = validateConsentConfig(config)
    expect(warnings).toEqual([expect.stringMatching(/'test'.*'marketing'/)])
  })

  it.each([0, -1, NaN])('flags ageGate.maxAgeDays of %s', (maxAgeDays) => {
    const warnings = validateConsentConfig({
      ...cleanConfig,
      ageGate: { cookieName: 'age', maxAgeDays },
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/maxAgeDays/)
  })

  it('accepts a positive ageGate.maxAgeDays', () => {
    expect(
      validateConsentConfig({
        ...cleanConfig,
        ageGate: { cookieName: 'age', maxAgeDays: 0.5 },
      }),
    ).toEqual([])
  })

  it.each(['never', 'on-withdraw', 'on-change'] as const)('accepts reload: %s', (reload) => {
    expect(validateConsentConfig({ ...cleanConfig, reload })).toEqual([])
  })

  it('flags an unknown reload policy', () => {
    const warnings = validateConsentConfig({
      ...cleanConfig,
      reload: true as unknown as ConsentConfig['reload'],
    })
    expect(warnings).toEqual([expect.stringMatching(/^reload must be one of .*\(got true\)/)])
  })

  it('flags the removed reloadOnConsentChange option', () => {
    const warnings = validateConsentConfig({
      ...cleanConfig,
      reloadOnConsentChange: false,
    } as ConsentConfig)
    expect(warnings).toEqual([expect.stringMatching(/reloadOnConsentChange.*reload: 'never'/)])
  })

  it('flags duplicate category ids', () => {
    const config: ConsentConfig = {
      ...cleanConfig,
      categories: [
        { id: 'analytics' },
        { id: 'analytics' },
      ],
    }
    const warnings = validateConsentConfig(config)
    expect(warnings.some((w) => /duplicate/i.test(w) && /analytics/.test(w))).toBe(
      true,
    )
  })

  it('never throws, even on a pathological config', () => {
    expect(() =>
      validateConsentConfig({ ...cleanConfig, categories: [] }),
    ).not.toThrow()
  })
})

describe('resolveConfig', () => {
  it("copies the caller's options instead of freezing them", () => {
    const autoClear = [{ name: '_ga' }]
    const categories: ConsentConfig['categories'] = [{ id: 'analytics', autoClear }]
    const ageGate = { maxAgeDays: 7 }
    const integrations = [integration(['analytics'])]
    resolveConfig({ categories, ageGate, integrations })

    expect(Object.isFrozen(categories)).toBe(false)
    expect(Object.isFrozen(categories[0])).toBe(false)
    expect(Object.isFrozen(ageGate)).toBe(false)
    expect(Object.isFrozen(integrations)).toBe(false)
    categories.push({ id: 'marketing' })
    autoClear.push({ name: '_gid' })
    expect(categories).toHaveLength(2)
    expect(Object.isFrozen(defaultConsentConfig.categories)).toBe(false)
  })

  it('deeply freezes the resolved config, nested arrays included', () => {
    const config = resolveConfig({
      categories: [
        { id: 'analytics', autoClear: [{ name: /^_ga/ }] },
      ],
    })
    const [category] = config.categories

    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.categories)).toBe(true)
    expect(Object.isFrozen(category)).toBe(true)
    expect(Object.isFrozen(category.autoClear)).toBe(true)
    expect(Object.isFrozen(category.autoClear![0])).toBe(true)
    expect(Object.isFrozen(config.guiOptions)).toBe(true)
    expect(category.autoClear![0].name).toBeInstanceOf(RegExp)
  })

  it('freezes the integrations list but keeps each integration by reference', () => {
    const google = integration(['analytics'])
    const config = resolveConfig({ integrations: [google] })

    expect(Object.isFrozen(config.integrations)).toBe(true)
    expect(config.integrations[0]).toBe(google)
    expect(Object.isFrozen(google)).toBe(false)
  })
})
