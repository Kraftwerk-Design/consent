import { describe, it, expect } from 'vitest'
import { resolveConfig } from '../config'
import { buildCategories } from './library'

describe('buildCategories GPC lock', () => {
  it('leaves only the clamped categories out when locked', () => {
    const config = resolveConfig({
      mode: 'opt-out',
      allowGpcOverride: false,
      categories: [
        { id: 'necessary', enabled: true, readOnly: true },
        { id: 'functionality', enabled: true },
        { id: 'analytics', enabled: true },
      ],
    })
    const cats = buildCategories(config, 'locked')
    expect(Object.keys(cats)).toEqual(['necessary', 'functionality'])
    expect(cats.necessary).toMatchObject({ enabled: true, readOnly: true })
    expect(cats.functionality.enabled).toBe(true)
  })

  it('honors explicit gpc:true on a non-analytics category', () => {
    const config = resolveConfig({
      allowGpcOverride: false,
      categories: [
        { id: 'analytics', gpc: true },
        { id: 'marketing', gpc: true, enabled: true },
        { id: 'functionality', enabled: true },
      ],
    })
    expect(Object.keys(buildCategories(config, 'locked'))).toEqual(['functionality'])
  })
})

describe('buildCategories GPC default-off', () => {
  // vanilla-cookieconsent always accepts readOnly categories, so a readOnly
  // clamp would release the very scripts GPC is meant to hold.
  it('registers a clamped category off by default, never readOnly', () => {
    const config = resolveConfig({
      mode: 'opt-out',
      allowGpcOverride: true,
      categories: [
        { id: 'necessary', enabled: true, readOnly: true },
        { id: 'analytics', enabled: true },
      ],
    })
    const cats = buildCategories(config, 'default-off')
    expect(cats.analytics).toMatchObject({ enabled: false, readOnly: false })
    expect(cats.necessary).toMatchObject({ enabled: true, readOnly: true })
  })

  it('leaves an enabled category on by default without GPC', () => {
    const config = resolveConfig({
      mode: 'opt-out',
      allowGpcOverride: true,
      categories: [{ id: 'analytics', enabled: true }],
    })
    expect(buildCategories(config, 'none').analytics.enabled).toBe(true)
  })
})
