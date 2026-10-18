import { describe, it, expect } from 'vitest'
import { resolveConfig } from '../config'
import { planCategories, type GpcState } from './categories'
import {
  computeSnapshot,
  pendingSnapshot,
  snapshotsEqual,
  type ConsentSnapshot,
  type SnapshotInput,
} from './snapshot'

const plan = (gpc: GpcState = 'none') =>
  planCategories(
    resolveConfig({
      mode: 'opt-in',
      categories: [{ id: 'necessary', enabled: true, readOnly: true }, { id: 'analytics' }],
    }),
    gpc,
  )

function input(overrides: Partial<SnapshotInput>): SnapshotInput {
  return { plan: plan(), ageOk: true, recorded: false, accepted: [], ...overrides }
}

describe('computeSnapshot', () => {
  it('pending: every category false', () => {
    expect(pendingSnapshot(plan())).toEqual({
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

  it("ready: the plan's effective categories", () => {
    const snapshot = computeSnapshot(input({ recorded: true, accepted: ['analytics'] }))
    expect(snapshot.stage).toBe('ready')
    expect(snapshot.categories).toEqual({ necessary: true, analytics: true })
  })

  it('carries recorded and gpc through, frozen', () => {
    const snapshot = computeSnapshot(
      input({ plan: plan('locked'), recorded: true, accepted: ['necessary'] }),
    )
    expect(snapshot).toMatchObject({ recorded: true, gpc: 'locked' })
    expect(Object.isFrozen(snapshot.categories)).toBe(true)
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
