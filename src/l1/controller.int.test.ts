import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ConsentIntegration } from '../config.default'
import type { ConsentSnapshot } from '../core/snapshot'
import {
  AGE,
  click,
  config,
  handle,
  init,
  load,
  recordEvents,
  reset,
  runs,
  script,
  seed,
} from './harness'

beforeEach(() => reset())
afterEach(() => vi.restoreAllMocks())

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))
const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {})

const THREE = [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'functionality' },
  { id: 'analytics' },
]

describe('one controller per page', () => {
  it('S-A3 repeat initConsent returns the same handle, warns only with options, no re-dispatch', async () => {
    const { pkg } = await load()
    const events = recordEvents()
    await init(pkg, config('opt-in'))
    const warn = quiet()

    expect(pkg.initConsent()).toBe(handle())
    expect(warn).not.toHaveBeenCalled()
    expect(pkg.initConsent(config('opt-out'))).toBe(handle())
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/already initialized/)

    await handle().ready
    await tick()
    expect(document.querySelectorAll('#cc-main')).toHaveLength(1)
    expect(events).toHaveLength(1)
  })

  it('S-P3 repeat initConsent while awaiting age: one run after confirmAge()', async () => {
    const { pkg } = await load()
    const events = recordEvents()
    const ready = init(pkg, config('opt-in', AGE))
    const first = handle()
    quiet()

    expect(pkg.initConsent(config('opt-in'))).toBe(first)
    expect(document.querySelector('#cc-main')).toBeNull()

    pkg.confirmAge()
    await ready
    await tick()

    expect(document.querySelectorAll('#cc-main')).toHaveLength(1)
    expect(events).toHaveLength(1)
  })

  it('S-A4 repeat initConsent(otherCfg) → has() keeps the first config', async () => {
    await seed(config('opt-in', { categories: THREE }), ['functionality'])
    const { pkg } = await load()
    await init(pkg, config('opt-in', { categories: THREE }))
    quiet()

    pkg.initConsent(config('opt-out', { categories: THREE, gateCategory: 'functionality' }))

    expect(handle().has()).toBe(false)
    expect(window.KDConsent!.has()).toBe(false)
    expect(handle().has('functionality')).toBe(true)
    expect(Object.keys(handle().getSnapshot().categories)).toEqual([
      'necessary',
      'functionality',
      'analytics',
    ])
  })
})

describe('S-I6 getSnapshot / subscribe', () => {
  it('notifies once per change after the event, with the previous snapshot', async () => {
    const { pkg, lib } = await load()
    await init(pkg, config('opt-in'))
    const events = recordEvents()
    const calls: [ConsentSnapshot, ConsentSnapshot, number][] = []
    const before = handle().getSnapshot()

    handle().subscribe((next, prev) => calls.push([next, prev, events.length]))
    lib.acceptCategory('all')

    expect(calls).toEqual([[handle().getSnapshot(), before, 1]])
    expect(calls[0][0]).toBe(handle().getSnapshot())
    expect(calls[0][1]).toBe(before)

    lib.acceptCategory('all')
    expect(calls).toHaveLength(1)
  })

  it('the first notification follows the age gate, prev = awaiting-age', async () => {
    const { pkg } = await load()
    const ready = init(pkg, config('opt-out', AGE))
    const waiting = handle().getSnapshot()
    const calls: [ConsentSnapshot, ConsentSnapshot][] = []
    handle().subscribe((next, prev) => calls.push([next, prev]))

    pkg.confirmAge()
    await ready

    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe(handle().getSnapshot())
    expect(calls[0][0].stage).toBe('ready')
    expect(calls[0][1]).toBe(waiting)
  })

  it('a throwing subscriber does not starve the others; the error is rethrown async', async () => {
    const { pkg, lib } = await load()
    await init(pkg, config('opt-in'))
    const queued: (() => void)[] = []
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) => {
      queued.push(fn)
    })
    const boom = new Error('boom')
    const after = vi.fn()

    handle().subscribe(() => {
      throw boom
    })
    handle().subscribe(after)
    lib.acceptCategory('all')

    expect(after).toHaveBeenCalledTimes(1)
    expect(queued).toHaveLength(1)
    expect(queued[0]).toThrow(boom)
  })

  it('no calls after unsubscribing, even mid-notification', async () => {
    const { pkg, lib } = await load()
    await init(pkg, config('opt-in'))
    const second = vi.fn()
    const first = vi.fn(() => unsubscribeSecond())

    const unsubscribeFirst = handle().subscribe(first)
    const unsubscribeSecond = handle().subscribe(second)
    lib.acceptCategory('all')

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()

    unsubscribeFirst()
    lib.acceptCategory([])
    expect(first).toHaveBeenCalledTimes(1)
  })
})

describe('S-P2 destroy', () => {
  type Call = [EventTarget, string, unknown, boolean]

  function trackListeners() {
    const added: Call[] = []
    const removed: Call[] = []
    const capture = (options: unknown): boolean =>
      typeof options === 'boolean' ? options : Boolean((options as { capture?: boolean })?.capture)
    for (const target of [document, window] as EventTarget[]) {
      const add = target.addEventListener
      const remove = target.removeEventListener
      vi.spyOn(target, 'addEventListener').mockImplementation(function (this: EventTarget, type, fn, options) {
        added.push([target, type, fn, capture(options)])
        return add.call(this, type, fn, options)
      })
      vi.spyOn(target, 'removeEventListener').mockImplementation(function (this: EventTarget, type, fn, options) {
        removed.push([target, type, fn, capture(options)])
        return remove.call(this, type, fn, options)
      })
    }
    return { added, removed }
  }

  it('removes #cc-main, the wrapper listeners and window.KDConsent; re-init works', async () => {
    const GATED = '<a id="gated" href="#x" data-require-consent="analytics">go</a>'
    const { pkg } = await load(script('analytics') + GATED)
    const { added, removed } = trackListeners()
    await init(pkg, config('opt-in'))
    expect(added.length).toBeGreaterThan(0)

    handle().destroy()

    expect(document.querySelector('#cc-main')).toBeNull()
    expect(window.KDConsent).toBeUndefined()
    const unremoved = added.filter(
      ([target, type, fn, capture]) =>
        !removed.some((r) => r[0] === target && r[1] === type && r[2] === fn && r[3] === capture),
    )
    expect(unremoved.map(([, type]) => type)).toEqual([])

    let prevented = false
    document.querySelector('#gated')!.addEventListener('click', (event) => {
      prevented = event.defaultPrevented
    })
    click('#gated')
    expect(prevented).toBe(false)

    await init(pkg, config('opt-out'))

    expect(document.querySelectorAll('#cc-main')).toHaveLength(1)
    expect(window.KDConsent).toBeDefined()
    expect(handle().has('analytics')).toBe(true)
    expect(runs('analytics')).toBe(1)
  })

  it('destroy in the same tick as init: ready stays pending, no banner, re-init works', async () => {
    const { pkg } = await load(script('analytics'))
    const settled = vi.fn()

    const first = pkg.initConsent(config('opt-in'))
    first.destroy()
    first.ready.then(settled, settled)
    await tick()
    await tick()

    expect(settled).not.toHaveBeenCalled()
    expect(document.querySelector('#cc-main')).toBeNull()

    await init(pkg, config('opt-out'))
    expect(handle()).not.toBe(first)
    expect(document.querySelectorAll('#cc-main')).toHaveLength(1)
    expect(runs('analytics')).toBe(1)
  })

  it('destroy while awaiting age: a later confirmAge() starts nothing', async () => {
    const { pkg } = await load(script('analytics'))
    const events = recordEvents()
    void init(pkg, config('opt-out', AGE))

    handle().destroy()
    pkg.confirmAge()
    await tick()

    expect(document.querySelector('#cc-main')).toBeNull()
    expect(runs('analytics')).toBe(0)
    expect(events).toEqual([])
  })
})

describe('integration isolation', () => {
  it('a throwing integration does not stop the next one, the event or subscribers; the error is rethrown in a microtask', async () => {
    const errors: unknown[] = []
    const queue = queueMicrotask
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) =>
      queue(() => {
        try {
          fn()
        } catch (error) {
          errors.push(error)
        }
      }),
    )
    const calls: string[] = []
    const integration = (name: string, fail: boolean): ConsentIntegration => ({
      name,
      categories: ['analytics'],
      init() {
        calls.push(`${name} init`)
        if (fail) throw new Error(`${name} init`)
      },
      apply() {
        calls.push(`${name} apply`)
        if (fail) throw new Error(`${name} apply`)
      },
    })
    const { pkg } = await load()
    document.addEventListener('consent:change', () => calls.push('event'))

    const consent = pkg.initConsent(
      config('opt-in', { integrations: [integration('broken', true), integration('ok', false)] }),
    )
    consent.subscribe(() => calls.push('subscriber'))
    expect(calls).toEqual(['broken init', 'ok init'])
    expect(errors).toEqual([])

    await consent.ready
    await tick()
    expect(calls).toEqual(['broken init', 'ok init', 'broken apply', 'ok apply', 'event', 'subscriber'])
    expect(errors).toEqual([new Error('broken init'), new Error('broken apply')])
    consent.destroy()
  })
})
