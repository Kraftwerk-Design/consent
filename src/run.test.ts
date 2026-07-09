// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureConsent } from './config'
import { buildCategories } from './run'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => false),
  acceptedCategory: vi.fn(() => false),
  run: vi.fn(() => Promise.resolve()),
  acceptCategory: vi.fn(),
  show: vi.fn(),
}))

beforeEach(() => {
  configureConsent({
    allowGpcOverride: false,
    categories: [
      { id: 'necessary', readOnly: true },
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
})

describe('buildCategories GPC clamp', () => {
  it('forces only clamped categories read-only when GPC is active', () => {
    const cats = buildCategories(true) // gpcActive = true
    expect(cats!.necessary.readOnly).toBe(true) // its own readOnly
    expect(cats!.analytics.readOnly).toBe(true) // clamped
    expect(cats!.functionality.readOnly).toBe(false) // not clamped
  })

  it('does not force clamp when GPC is inactive', () => {
    const cats = buildCategories(false)
    expect(cats!.analytics.readOnly).toBe(false)
  })

  it('honors explicit gpc:true on a non-analytics category', () => {
    configureConsent({
      allowGpcOverride: false,
      categories: [
        { id: 'analytics', analytics: true, gpc: true },
        { id: 'marketing', gpc: true },
      ],
    })
    const cats = buildCategories(true)
    expect(cats!.marketing.readOnly).toBe(true)
  })
})

describe('buildCategories GPC enabled downgrade', () => {
  it('forces a clamped category off by default under GPC even with allowGpcOverride', () => {
    configureConsent({
      mode: 'opt-out',
      allowGpcOverride: true,
      categories: [
        { id: 'necessary', enabled: true, readOnly: true },
        { id: 'analytics', analytics: true, enabled: true },
      ],
    })
    const cats = buildCategories(true) // gpcActive
    expect(cats!.analytics.enabled).toBe(false) // off by default…
    expect(cats!.analytics.readOnly).toBe(false) // …but the toggle stays operable
  })

  it('forces a clamped category off and locked under GPC without override', () => {
    configureConsent({
      mode: 'opt-out',
      allowGpcOverride: false,
      categories: [
        { id: 'necessary', enabled: true, readOnly: true },
        { id: 'analytics', analytics: true, enabled: true },
      ],
    })
    const cats = buildCategories(true)
    expect(cats!.analytics.enabled).toBe(false)
    expect(cats!.analytics.readOnly).toBe(true)
  })

  it('leaves an enabled category on by default when GPC is inactive', () => {
    configureConsent({
      mode: 'opt-out',
      allowGpcOverride: true,
      categories: [{ id: 'analytics', analytics: true, enabled: true }],
    })
    const cats = buildCategories(false)
    expect(cats!.analytics.enabled).toBe(true)
  })
})
