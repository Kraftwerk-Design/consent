import { describe, it, expect, beforeEach } from 'vitest'
import type { ConsentConfig } from '../config.default'
import type { ChangeCause } from '../core/library'
import { BANNER_ACCEPT_ALL, click, config, load, reset, seed } from './harness'

beforeEach(() => reset())

async function start(options: Partial<ConsentConfig> = config('opt-in')) {
  const { lib } = await load()
  const { resolveConfig } = await import('../config')
  const { planCategories } = await import('../core/categories')
  const { startLibrary } = await import('../core/library')
  const resolved = resolveConfig(options)
  const causes: ChangeCause[] = []
  const session = startLibrary(resolved, planCategories(resolved, 'none'), (cause) => causes.push(cause))
  return { lib, session, causes }
}

const settled = (promise: Promise<unknown>): Promise<boolean> =>
  Promise.race([promise.then(() => true, () => true), new Promise<boolean>((r) => setTimeout(() => r(false)))])

describe('library session', () => {
  it.each(['opt-in', 'opt-out'] as const)('%s fresh Accept all emits only choice', async (mode) => {
    const { session, causes } = await start(config(mode))
    await session.ready
    causes.length = 0

    click(BANNER_ACCEPT_ALL)

    expect(causes.length).toBeGreaterThan(0)
    expect(new Set(causes)).toEqual(new Set(['choice']))
  })

  it('a returning visitor gets one load, when run() resolves', async () => {
    await seed(config('opt-in'), 'all')
    const { session, causes } = await start()

    expect(causes).toEqual([])
    await session.ready
    expect(causes).toEqual(['load'])
    expect(session.read()).toEqual({ recorded: true, accepted: ['necessary', 'analytics'] })
  })

  it('reset() leaves ready pending and removes the banner', async () => {
    const { session, causes } = await start()

    session.reset()

    expect(await settled(session.ready)).toBe(false)
    expect(causes).toEqual([])
    expect(document.querySelector('#cc-main')).toBeNull()
  })

  it('show() opens the banner before a choice and the preferences after one', async () => {
    const { session } = await start()
    await session.ready
    const shown = (modal: string) =>
      document.documentElement.classList.contains(`show--${modal}`)

    session.show()
    expect(shown('consent')).toBe(true)
    expect(shown('preferences')).toBe(false)

    click(BANNER_ACCEPT_ALL)
    session.show()
    expect(shown('preferences')).toBe(true)
  })
})
