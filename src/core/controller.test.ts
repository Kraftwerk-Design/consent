import { describe, it, expect, vi } from 'vitest'
import { publishController, watchActiveHandle, type ConsentHandle } from './controller'

const fakeHandle = (): ConsentHandle => ({}) as ConsentHandle

describe('watchActiveHandle', () => {
  it('calls at once, then on publish and on clear', () => {
    const fn = vi.fn()
    const stop = watchActiveHandle(fn)
    const handle = fakeHandle()

    const clear = publishController({ handle, ageGate: null })
    clear()
    stop()

    expect(fn.mock.calls).toEqual([[null], [handle], [null]])
  })

  it('a stale clear leaves the newer controller active', () => {
    const first = publishController({ handle: fakeHandle(), ageGate: null })
    const handle = fakeHandle()
    const clear = publishController({ handle, ageGate: null })
    const fn = vi.fn()
    const stop = watchActiveHandle(fn)

    first()

    expect(fn.mock.calls).toEqual([[handle]])
    stop()
    clear()
  })

  it('stops after the unsubscribe', () => {
    const fn = vi.fn()
    watchActiveHandle(fn)()

    publishController({ handle: fakeHandle(), ageGate: null })()

    expect(fn).toHaveBeenCalledTimes(1)
  })
})
