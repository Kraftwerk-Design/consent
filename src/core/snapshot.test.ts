import { describe, it, expect } from 'vitest'
import { resolveConfig } from '../config'
import { planCategories, type GpcState } from './categories'
import type { ReloadPolicy } from './reload'
import { createSnapshotStore } from './snapshot'

const plan = (gpc: GpcState = 'none') =>
  planCategories(
    resolveConfig({
      mode: 'opt-in',
      categories: [
        { id: 'necessary', enabled: true, readOnly: true },
        { id: 'analytics' },
        { id: 'marketing' },
      ],
    }),
    gpc,
  )

interface LibraryState {
  recorded: boolean
  accepted: string[]
}

function setup({
  gpc = 'none' as GpcState,
  reload = 'never' as ReloadPolicy,
  awaitingAge = false,
  state = { recorded: false, accepted: ['necessary'] } as LibraryState,
} = {}) {
  const library = { state }
  const store = createSnapshotStore({ plan: plan(gpc), reload, awaitingAge })
  const attach = () => store.attach(() => library.state)
  const set = (recorded: boolean, accepted: string[]) => {
    library.state = { recorded, accepted }
  }
  return { store, attach, set }
}

describe('before the library reports', () => {
  it('pending: every category false', () => {
    expect(setup().store.current()).toEqual({
      stage: 'pending',
      recorded: false,
      gpc: 'none',
      categories: { necessary: false, analytics: false, marketing: false },
    })
  })

  it('awaiting-age: every category false, readOnly included', () => {
    const snapshot = setup({ awaitingAge: true }).store.current()
    expect(snapshot.stage).toBe('awaiting-age')
    expect(snapshot.categories).toEqual({ necessary: false, analytics: false, marketing: false })
  })
})

describe('current', () => {
  it("attached: ready with the plan's effective categories", () => {
    const { store, attach } = setup({ state: { recorded: true, accepted: ['analytics'] } })
    attach()
    expect(store.current()).toMatchObject({
      stage: 'ready',
      categories: { necessary: true, analytics: true, marketing: false },
    })
  })

  it('carries recorded and gpc through, frozen', () => {
    const { store, attach } = setup({
      gpc: 'locked',
      state: { recorded: true, accepted: ['necessary'] },
    })
    attach()
    const snapshot = store.current()
    expect(snapshot).toMatchObject({ recorded: true, gpc: 'locked' })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.categories)).toBe(true)
  })

  it('keeps the reference until the state changes', () => {
    const { store, attach, set } = setup()
    attach()
    const first = store.current()
    set(false, ['necessary'])
    expect(store.current()).toBe(first)
    set(true, ['necessary'])
    expect(store.current()).not.toBe(first)
  })

  it('detached: keeps the last snapshot', () => {
    const { store, attach, set } = setup()
    const detach = attach()
    set(true, ['analytics'])
    const last = store.current()
    detach()
    set(false, [])
    expect(store.current()).toBe(last)
  })
})

describe('commit', () => {
  it('the first change: prev is the snapshot before the library reported', () => {
    const { store, attach } = setup({ awaitingAge: true })
    const before = store.current()
    attach()
    const change = store.commit('load')
    expect(change).toEqual({ next: store.current(), prev: before, reload: false })
    expect(change?.next).toBe(store.current())
    expect(change?.prev).toBe(before)
  })

  it('null when nothing changed since the last commit', () => {
    const { store, attach } = setup()
    attach()
    store.commit('load')
    expect(store.commit('choice')).toBeNull()
  })

  it.each<[string, LibraryState, LibraryState]>([
    [
      'recorded',
      { recorded: false, accepted: ['necessary'] },
      { recorded: true, accepted: ['necessary'] },
    ],
    [
      'a category',
      { recorded: true, accepted: ['necessary'] },
      { recorded: true, accepted: ['necessary', 'analytics'] },
    ],
  ])('a change when %s differs; prev is the last commit', (_, from, to) => {
    const { store, attach, set } = setup({ state: from })
    attach()
    const applied = store.commit('load')?.next
    set(to.recorded, to.accepted)
    const change = store.commit('choice')
    expect(change?.prev).toBe(applied)
    expect(change?.next).toBe(store.current())
  })

  describe('reload', () => {
    const NONE = ['necessary']
    const ANALYTICS = ['necessary', 'analytics']
    const MARKETING = ['necessary', 'marketing']

    const choices: [string, LibraryState, LibraryState][] = [
      ['grant', { recorded: true, accepted: NONE }, { recorded: true, accepted: ANALYTICS }],
      ['withdraw', { recorded: true, accepted: ANALYTICS }, { recorded: true, accepted: NONE }],
      ['recorded-only', { recorded: false, accepted: NONE }, { recorded: true, accepted: NONE }],
      [
        'grant one, withdraw another',
        { recorded: true, accepted: ANALYTICS },
        { recorded: true, accepted: MARKETING },
      ],
    ]

    const reloadsOnChoice: Record<ReloadPolicy, string[]> = {
      never: [],
      'on-withdraw': ['withdraw', 'grant one, withdraw another'],
      'on-change': ['grant', 'withdraw', 'grant one, withdraw another'],
    }

    const policies = Object.keys(reloadsOnChoice) as ReloadPolicy[]

    describe.each(policies)("'%s'", (policy) => {
      it.each(choices)('%s on choice', (name, from, to) => {
        const { store, attach, set } = setup({ reload: policy, state: from })
        attach()
        store.commit('load')
        set(to.recorded, to.accepted)
        expect(store.commit('choice')?.reload).toBe(reloadsOnChoice[policy].includes(name))
      })

      it.each(choices)('%s on load never reloads', (_, from, to) => {
        const { store, attach, set } = setup({ reload: policy, state: from })
        attach()
        store.commit('load')
        set(to.recorded, to.accepted)
        expect(store.commit('load')?.reload).toBe(false)
      })

      it.each([false, true])('the first change never reloads (awaitingAge: %s)', (awaitingAge) => {
        const { store, attach } = setup({
          reload: policy,
          awaitingAge,
          state: { recorded: true, accepted: ANALYTICS },
        })
        attach()
        expect(store.commit('choice')?.reload).toBe(false)
      })
    })
  })
})
