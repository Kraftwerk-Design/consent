import { describe, it, expect, beforeEach } from 'vitest'
import {
  BANNER_ACCEPT_ALL,
  click,
  config,
  init,
  load,
  recordEvents,
  reset,
  runs,
  script,
} from './harness'

beforeEach(() => reset())

describe('L1 harness', () => {
  it('runs the real library: banner Accept all releases the script', async () => {
    const { pkg } = await load(script('analytics'))
    await init(pkg, config('opt-in'))
    expect(runs('analytics')).toBe(0)

    const events = recordEvents()
    click(BANNER_ACCEPT_ALL)

    expect(document.documentElement.dataset.runAnalytics).toBe('1')
    expect(events.length).toBeGreaterThan(0)
  })

  it('starts each test from a fresh visit', async () => {
    const { pkg } = await load(script('analytics'))
    await init(pkg, config('opt-in'))

    expect(runs('analytics')).toBe(0)
    expect(document.querySelector('#cc-main .cm')).not.toBeNull()
  })
})
