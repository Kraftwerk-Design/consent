import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ConsentSnapshot } from '../core/snapshot'
import { describeSignalAdapter } from '../testing/signalAdapter.contract'
import { googleConsentMode } from './google'

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown }
const w = window as W

function consentCommands(): unknown[][] {
  return (w.dataLayer ?? [])
    .map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((args) => args[0] === 'consent')
}

const create = (ids: readonly string[]) =>
  googleConsentMode({
    security_storage: 'necessary',
    functionality_storage: 'necessary',
    analytics_storage: ids,
    ad_storage: ids,
    ad_user_data: ids,
    ad_personalization: ids,
  })

const signals = (gated: 'granted' | 'denied') => ({
  security_storage: 'granted',
  functionality_storage: 'granted',
  analytics_storage: gated,
  ad_storage: gated,
  ad_user_data: gated,
  ad_personalization: gated,
})

const expectations = {
  init: [['consent', 'default', { ...signals('denied'), wait_for_update: 500 }]],
  denied: [],
  granted: [['consent', 'update', signals('granted')]],
  withdraw: [['consent', 'update', signals('denied')]],
  regrant: [['consent', 'update', signals('granted')]],
}

describeSignalAdapter({
  name: 'googleConsentMode',
  create,
  install: () => {
    delete w.gtag
    w.dataLayer = []
  },
  remove: () => {
    delete w.dataLayer
    delete w.gtag
  },
  present: () => typeof w.gtag === 'function',
  calls: consentCommands,
  shims: true,
  expected: { 'opt-in': expectations, 'opt-out': expectations },
})

const snap = (categories: Record<string, boolean>): ConsentSnapshot => ({
  stage: 'ready',
  recorded: true,
  gpc: 'none',
  categories,
})

const BASELINE: ConsentSnapshot = {
  stage: 'pending',
  recorded: false,
  gpc: 'none',
  categories: { necessary: true, a: false, b: false },
}
const CONTEXT = { baseline: BASELINE, mode: 'opt-in' } as const

afterEach(() => {
  delete w.dataLayer
  delete w.gtag
})

describe('googleConsentMode', () => {
  it('S-G1 default pushes only mapped signals', () => {
    googleConsentMode({ analytics_storage: 'a' }).init!(CONTEXT)
    expect(consentCommands()).toEqual([
      ['consent', 'default', { analytics_storage: 'denied', wait_for_update: 500 }],
    ])
  })

  it('S-G2 ORs each signal over its own categories', () => {
    const adapter = googleConsentMode({
      analytics_storage: ['a', 'b'],
      ad_storage: 'b',
      security_storage: ['necessary', 'a'],
    })
    adapter.init!(CONTEXT)
    adapter.apply(snap({ necessary: true, a: true, b: false }), BASELINE)

    expect(consentCommands()).toEqual([
      ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', security_storage: 'granted', wait_for_update: 500 }],
      ['consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', security_storage: 'granted' }],
    ])
  })

  it('reuses an existing gtag and dataLayer', () => {
    const gtag = vi.fn()
    w.dataLayer = [{ existing: true }]
    w.gtag = gtag
    googleConsentMode({ analytics_storage: 'a' }).init!(CONTEXT)

    expect(gtag).toHaveBeenCalledWith('consent', 'default', {
      analytics_storage: 'denied',
      wait_for_update: 500,
    })
    expect(w.dataLayer).toEqual([{ existing: true }])
  })
})
