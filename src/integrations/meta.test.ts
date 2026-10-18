import { describe, it, expect, vi, type Mock } from 'vitest'
import { resolveConfig } from '../config'
import type { ConsentSnapshot } from '../core/snapshot'
import { describeSignalAdapter, type SignalAdapterExpectations } from '../testing/signalAdapter.contract'
import { metaPixel } from './meta'

type W = typeof window & { fbq?: Mock }
const w = window as W

const LDU = ['dataProcessingOptions', ['LDU'], 0, 0]
const CLEAR_LDU = ['dataProcessingOptions', []]
const GRANT = ['consent', 'grant']
const REVOKE = ['consent', 'revoke']

const plain: SignalAdapterExpectations = {
  init: [REVOKE],
  denied: [],
  granted: [GRANT],
  withdraw: [REVOKE],
  regrant: [GRANT],
}
const limited: SignalAdapterExpectations = {
  init: [REVOKE],
  denied: [LDU],
  granted: [GRANT],
  withdraw: [LDU, REVOKE],
  regrant: [GRANT, CLEAR_LDU],
}

const recorder = {
  install: () => {
    w.fbq = vi.fn()
  },
  remove: () => {
    delete w.fbq
  },
  present: () => typeof w.fbq === 'function',
  calls: () => w.fbq?.mock.calls ?? [],
  shims: false,
}

describeSignalAdapter({
  name: 'metaPixel',
  create: (ids) => metaPixel({ category: ids }),
  ...recorder,
  expected: { 'opt-in': plain, 'opt-out': limited },
})

describeSignalAdapter({
  name: 'metaPixel ldu: false',
  create: (ids) => metaPixel({ category: ids, ldu: false }),
  ...recorder,
  expected: { 'opt-in': plain, 'opt-out': plain },
})

const snap = (analytics: boolean): ConsentSnapshot => ({
  stage: 'ready',
  recorded: true,
  gpc: 'none',
  categories: { necessary: true, analytics },
})

describe('metaPixel ldu table (S-H6)', () => {
  const table: [string, 'opt-in' | 'opt-out', boolean | undefined, unknown[][], unknown[][]][] = [
    ['opt-in, default', 'opt-in', undefined, [REVOKE], [GRANT]],
    ['opt-in, true', 'opt-in', true, [REVOKE], [GRANT]],
    ['opt-in, false', 'opt-in', false, [REVOKE], [GRANT]],
    ['opt-out, default', 'opt-out', undefined, [LDU, REVOKE], [GRANT, CLEAR_LDU]],
    ['opt-out, true', 'opt-out', true, [LDU, REVOKE], [GRANT, CLEAR_LDU]],
    ['opt-out, false', 'opt-out', false, [REVOKE], [GRANT]],
  ]

  it.each(table)('%s: init revoke, denied and granted per the table', (_, mode, ldu, denied, granted) => {
    const fbq = (w.fbq = vi.fn())
    const adapter = metaPixel({ category: 'analytics', ...(ldu === undefined ? {} : { ldu }) })
    adapter.init!(resolveConfig({ mode }))
    expect(fbq.mock.calls).toEqual([REVOKE])

    fbq.mockClear()
    adapter.apply(snap(false), snap(true))
    expect(fbq.mock.calls).toEqual(denied)

    fbq.mockClear()
    adapter.apply(snap(true), snap(false))
    expect(fbq.mock.calls).toEqual(granted)
    delete w.fbq
  })
})
