// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { resolveConfig } from '../config'
import type { ConsentCategory } from '../config.default'
import { gpcClampedCategoryIds, gpcState, planCategories, type GpcState } from './categories'

type Mode = 'opt-in' | 'opt-out'

const categories = (mode: Mode): ConsentCategory[] => [
  { id: 'necessary', enabled: true, readOnly: true, gpc: true },
  { id: 'functionality', enabled: mode === 'opt-out' },
  { id: 'analytics', enabled: mode === 'opt-out', gpc: true, autoClear: [{ name: /^_ga/ }] },
]

const plan = (mode: Mode, gpc: GpcState) =>
  planCategories(resolveConfig({ mode, categories: categories(mode) }), gpc)

describe('gpcState', () => {
  it.each([
    [false, false, 'none'],
    [false, true, 'none'],
    [true, false, 'locked'],
    [true, true, 'default-off'],
  ])('signal %s, override %s → %s', (signal, allowOverride, expected) => {
    expect(gpcState(signal, allowOverride)).toBe(expected)
  })
})

describe('gpcClampedCategoryIds', () => {
  it('defaults to the default gate category when no gpc flags are set', () => {
    const config = resolveConfig({ categories: [{ id: 'necessary' }, { id: 'analytics' }] })
    expect(gpcClampedCategoryIds(config)).toEqual(['analytics'])
  })

  it('uses exactly the gpc:true categories once any gpc flag is present', () => {
    const config = resolveConfig({
      categories: [
        { id: 'necessary' },
        { id: 'functionality', gpc: false },
        { id: 'analytics', gpc: true },
        { id: 'marketing', gpc: true },
      ],
    })
    expect(gpcClampedCategoryIds(config)).toEqual(['analytics', 'marketing'])
  })

  it('never clamps a readOnly category', () => {
    expect(gpcClampedCategoryIds(resolveConfig({ categories: categories('opt-in') }))).toEqual([
      'analytics',
    ])
    const gate = resolveConfig({
      gateCategory: 'necessary',
      categories: [{ id: 'necessary', readOnly: true }, { id: 'analytics' }],
    })
    expect(gpcClampedCategoryIds(gate)).toEqual([])
  })
})

describe('planCategories', () => {
  it.each<[Mode, GpcState, Record<string, { enabled: boolean; readOnly: boolean }>]>([
    ['opt-out', 'none', {
      necessary: { enabled: true, readOnly: true },
      functionality: { enabled: true, readOnly: false },
      analytics: { enabled: true, readOnly: false },
    }],
    ['opt-out', 'default-off', {
      necessary: { enabled: true, readOnly: true },
      functionality: { enabled: true, readOnly: false },
      analytics: { enabled: false, readOnly: false },
    }],
    ['opt-out', 'locked', {
      necessary: { enabled: true, readOnly: true },
      functionality: { enabled: true, readOnly: false },
    }],
    ['opt-in', 'locked', {
      necessary: { enabled: true, readOnly: true },
      functionality: { enabled: false, readOnly: false },
    }],
  ])('%s, GPC %s registers', (mode, gpc, expected) => {
    const { registered } = plan(mode, gpc)
    expect(Object.keys(registered)).toEqual(Object.keys(expected))
    for (const [id, entry] of Object.entries(expected)) {
      expect(registered[id]).toMatchObject(entry)
    }
  })

  it('erases the clamped autoClear cookies only under the lock', () => {
    expect(plan('opt-in', 'locked').erase).toEqual([/^_ga/])
    expect(plan('opt-in', 'default-off').erase).toEqual([])
    expect(plan('opt-in', 'none').erase).toEqual([])
  })

  it.each<[Mode, GpcState, boolean, string[], [boolean, boolean, boolean]]>([
    ['opt-in', 'none', false, [], [true, false, false]],
    ['opt-in', 'none', false, ['necessary', 'analytics'], [true, false, false]],
    ['opt-in', 'none', true, ['necessary', 'analytics'], [true, false, true]],
    ['opt-in', 'locked', true, ['necessary', 'functionality', 'analytics'], [true, true, false]],
    ['opt-in', 'default-off', true, ['necessary', 'functionality', 'analytics'], [true, true, true]],
    ['opt-out', 'none', false, [], [true, true, true]],
    ['opt-out', 'locked', false, [], [true, true, false]],
    ['opt-out', 'default-off', false, [], [true, true, false]],
    ['opt-out', 'none', true, ['necessary'], [true, false, false]],
  ])('%s, GPC %s, recorded %s, accepted %j → effective %j', (mode, gpc, recorded, accepted, [n, f, a]) => {
    expect(plan(mode, gpc).effective({ recorded, accepted })).toEqual({
      necessary: n,
      functionality: f,
      analytics: a,
    })
  })

  it.each<[Mode, string[] | null, string[]]>([
    ['opt-out', null, ['necessary', 'functionality']],
    ['opt-in', null, ['necessary']],
    ['opt-out', ['necessary', 'functionality', 'analytics'], ['necessary', 'functionality']],
    ['opt-out', ['necessary'], ['necessary']],
  ])('%s Keep off from saved %j → %j', (mode, saved, expected) => {
    expect(plan(mode, 'default-off').keepOff(saved)).toEqual(expected)
  })
})
