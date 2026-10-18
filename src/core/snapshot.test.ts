import { describe, it, expect } from 'vitest'
import type { ConsentCategory, ConsentConfig } from '../config.default'
import { defaultConsentConfig } from '../config.default'
import {
  computeSnapshot,
  gpcState,
  pendingSnapshot,
  snapshotsEqual,
  type ConsentSnapshot,
  type SnapshotInput,
} from './snapshot'

const NECESSARY: ConsentCategory = { id: 'necessary', enabled: true, readOnly: true }
const ANALYTICS: ConsentCategory = { id: 'analytics' }

function cfg(
  mode: 'opt-in' | 'opt-out',
  categories: ConsentCategory[] = [
    NECESSARY,
    { ...ANALYTICS, enabled: mode === 'opt-out' },
  ],
): ConsentConfig {
  return { ...defaultConsentConfig, mode, categories }
}

function input(overrides: Partial<SnapshotInput>): SnapshotInput {
  return {
    config: cfg('opt-in'),
    ageOk: true,
    gpc: 'none',
    recorded: false,
    accepted: [],
    ...overrides,
  }
}

describe('computeSnapshot', () => {
  it('pending: every category false', () => {
    expect(pendingSnapshot(cfg('opt-out'), 'none')).toEqual({
      stage: 'pending',
      recorded: false,
      gpc: 'none',
      categories: { necessary: false, analytics: false },
    })
  })

  it('awaiting-age: every category false, readOnly included', () => {
    const snapshot = computeSnapshot(
      input({ ageOk: false, recorded: true, accepted: ['necessary', 'analytics'] }),
    )
    expect(snapshot.stage).toBe('awaiting-age')
    expect(snapshot.categories).toEqual({ necessary: false, analytics: false })
  })

  it('readOnly is true even when not accepted', () => {
    expect(computeSnapshot(input({})).categories.necessary).toBe(true)
  })

  it.each<[string, Partial<SnapshotInput>, boolean]>([
    ['recorded accepted', { recorded: true, accepted: ['analytics'] }, true],
    ['recorded rejected', { recorded: true, accepted: ['necessary'] }, false],
    [
      'recorded accepted, GPC locked',
      { recorded: true, accepted: ['analytics'], gpc: 'locked' },
      false,
    ],
    [
      'recorded accepted, GPC default-off keeps the saved opt-in',
      { recorded: true, accepted: ['analytics'], gpc: 'default-off' },
      true,
    ],
    [
      'recorded rejected, opt-out ignores enabled',
      { config: cfg('opt-out'), recorded: true, accepted: ['necessary'] },
      false,
    ],
    ['unrecorded opt-out, enabled', { config: cfg('opt-out') }, true],
    ['unrecorded opt-out, GPC locked', { config: cfg('opt-out'), gpc: 'locked' }, false],
    [
      'unrecorded opt-out, GPC default-off',
      { config: cfg('opt-out'), gpc: 'default-off' },
      false,
    ],
    [
      'unrecorded opt-out, not enabled',
      { config: cfg('opt-out', [NECESSARY, ANALYTICS]) },
      false,
    ],
    ['unrecorded opt-in', { accepted: ['analytics'] }, false],
  ])('%s → analytics %s', (_, overrides, expected) => {
    const snapshot = computeSnapshot(input(overrides))
    expect(snapshot.stage).toBe('ready')
    expect(snapshot.categories.analytics).toBe(expected)
  })

  it('GPC clamps only the gpc-flagged categories when any is flagged', () => {
    const config = cfg('opt-out', [
      NECESSARY,
      { ...ANALYTICS, enabled: true },
      { id: 'marketing', enabled: true, gpc: true },
    ])
    expect(computeSnapshot(input({ config, gpc: 'locked' })).categories).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
    })
  })

  it('carries recorded and gpc through', () => {
    const snapshot = computeSnapshot(
      input({ recorded: true, gpc: 'locked', accepted: ['necessary'] }),
    )
    expect(snapshot).toMatchObject({ recorded: true, gpc: 'locked' })
  })
})

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

describe('snapshotsEqual', () => {
  const base: ConsentSnapshot = {
    stage: 'ready',
    recorded: true,
    gpc: 'none',
    categories: { necessary: true, analytics: false },
  }

  it('is true for equal values in different objects', () => {
    expect(snapshotsEqual(base, { ...base, categories: { ...base.categories } })).toBe(true)
  })

  it.each<[string, Partial<ConsentSnapshot>]>([
    ['stage', { stage: 'awaiting-age' }],
    ['recorded', { recorded: false }],
    ['gpc', { gpc: 'locked' }],
    ['a category', { categories: { necessary: true, analytics: true } }],
    ['the category set', { categories: { necessary: true } }],
  ])('is false when %s differs', (_, change) => {
    expect(snapshotsEqual(base, { ...base, ...change })).toBe(false)
  })
})
