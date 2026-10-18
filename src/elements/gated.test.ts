import { describe, it, expect, afterEach, vi } from 'vitest'
import { attachGate, defineGatedElement } from './gated'
import { describeGatedEmbed, installFakeController } from '../testing/gatedEmbed.contract'

describeGatedEmbed({
  tag: 'test-gated',
  define: () =>
    defineGatedElement('test-gated', (host) => {
      const node = document.createElement('div')
      node.dataset.testContent = ''
      host.append(node)
      const onMessage = (): void => {}
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }),
  make: () => {
    const el = document.createElement('test-gated')
    el.innerHTML = '<button data-poster>Show</button>'
    return el
  },
  probe: (el) => ({
    activeNodes: el.querySelectorAll('[data-test-content]').length,
    iframes: el.querySelectorAll('iframe').length,
  }),
})

const queueRethrows = (): (() => void)[] => {
  const queued: (() => void)[] = []
  vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((fn) => {
    queued.push(fn)
  })
  return queued
}

describe('defineGatedElement', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('retries a mount that returned null or threw on the next click', () => {
    const ctl = installFakeController()
    const queued = queueRethrows()
    let result: 'null' | 'throw' | 'ok' = 'null'
    defineGatedElement('test-gated-flaky', (host) => {
      host.append(document.createElement('p'))
      if (result === 'throw') throw new Error('boom')
      return result === 'ok' ? () => {} : null
    })
    ctl.grant('analytics')
    const el = document.createElement('test-gated-flaky')
    el.innerHTML = '<button data-poster>Show</button>'
    document.body.append(el)
    const poster = el.querySelector<HTMLElement>('[data-poster]')!

    for (const next of ['null', 'throw'] as const) {
      result = next
      poster.click()
      expect(el.getAttribute('state')).toBe('blocked')
      expect(el.querySelectorAll('p')).toHaveLength(0)
    }
    expect(queued).toHaveLength(1)
    expect(queued[0]).toThrow('boom')

    result = 'ok'
    poster.click()
    expect(el.getAttribute('state')).toBe('active')
    expect(el.querySelectorAll('p')).toHaveLength(1)
    expect(ctl.subscribers()).toBe(1)

    vi.mocked(queueMicrotask).mockRestore()
    ctl.destroy()
  })
})

describe('attachGate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('the teardown unmounts and stops reacting', () => {
    const ctl = installFakeController()
    const unmount = vi.fn()
    const mount = vi.fn(() => unmount)
    const trigger = document.createElement('button')
    ctl.grant('analytics')
    const detach = attachGate({ triggers: [trigger], autoActivate: true, mount })
    expect(mount).toHaveBeenCalledTimes(1)

    detach()
    ctl.grant()
    ctl.grant('analytics')
    trigger.click()

    expect(unmount).toHaveBeenCalledTimes(1)
    expect(mount).toHaveBeenCalledTimes(1)
    expect(ctl.subscribers()).toBe(0)
    ctl.destroy()
  })

  it('destroy() unmounts and it ignores the next controller', () => {
    const first = installFakeController()
    const unmount = vi.fn()
    const mount = vi.fn(() => unmount)
    first.grant('analytics')
    attachGate({ triggers: [], autoActivate: true, mount })

    first.destroy()
    expect(unmount).toHaveBeenCalledTimes(1)

    const ctl = installFakeController()
    ctl.grant('analytics')
    expect(mount).toHaveBeenCalledTimes(1)
    expect(ctl.subscribers()).toBe(0)
    ctl.destroy()
  })

  it('a throwing mount is rethrown asynchronously and leaves the gate usable', () => {
    const ctl = installFakeController()
    const queued = queueRethrows()
    const unmount = vi.fn()
    const mount = vi.fn().mockImplementationOnce(() => {
      throw new Error('boom')
    })
    mount.mockReturnValue(unmount)
    ctl.grant('analytics')

    const detach = attachGate({ triggers: [], autoActivate: true, mount })
    expect(queued).toHaveLength(1)
    expect(queued[0]).toThrow('boom')
    expect(ctl.subscribers()).toBe(1)

    ctl.grant()
    ctl.grant('analytics')
    expect(mount).toHaveBeenCalledTimes(2)
    detach()
    expect(unmount).toHaveBeenCalledTimes(1)
    expect(ctl.subscribers()).toBe(0)

    vi.mocked(queueMicrotask).mockRestore()
    ctl.destroy()
  })

  it('warns and does nothing without a controller', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mount = vi.fn(() => () => {})
    attachGate({ triggers: [], autoActivate: true, mount })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(mount).not.toHaveBeenCalled()
  })
})
