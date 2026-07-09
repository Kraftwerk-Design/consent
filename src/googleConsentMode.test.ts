import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import { hasGpcSignal } from './gpc'
import {
  pushGoogleConsentDefault,
  pushGoogleConsentUpdate,
} from './googleConsentMode'
import * as CookieConsent from 'vanilla-cookieconsent'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => false),
  acceptedCategory: vi.fn(() => false),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown }

/** Every dataLayer entry, each normalized from its `arguments` object. */
function entries(): unknown[][] {
  const dl = (window as W).dataLayer ?? []
  return dl.map((e) => Array.from(e as ArrayLike<unknown>))
}
function lastCommand(name: string): Record<string, unknown> | undefined {
  const found = entries().filter((e) => e[0] === 'consent' && e[1] === name)
  return found.length
    ? (found[found.length - 1][2] as Record<string, unknown>)
    : undefined
}

const NECESSARY: ConsentCategory = {
  id: 'necessary',
  enabled: true,
  readOnly: true,
  google: ['security_storage', 'functionality_storage'],
}
const ANALYTICS: ConsentCategory = {
  id: 'analytics',
  analytics: true,
  google: [
    'analytics_storage',
    'ad_storage',
    'ad_user_data',
    'ad_personalization',
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(hasGpcSignal).mockReturnValue(false)
  delete (window as W).dataLayer
  delete (window as W).gtag
})

afterEach(() => {
  delete (window as W).dataLayer
  delete (window as W).gtag
})

describe('pushGoogleConsentDefault', () => {
  it('does nothing when the feature is off', () => {
    configureConsent({
      googleConsentMode: false,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    expect((window as W).dataLayer).toBeUndefined()
  })

  it('opt-in mode defaults consent-gated signals to denied', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-in',
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    expect(d.analytics_storage).toBe('denied')
    expect(d.ad_storage).toBe('denied')
    expect(d.security_storage).toBe('granted')
    expect(d.functionality_storage).toBe('granted')
    expect(d.wait_for_update).toBe(500)
  })

  it('opt-out mode defaults enabled categories to granted', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    expect(d.analytics_storage).toBe('granted')
    expect(d.ad_personalization).toBe('granted')
  })

  it('GPC forces clamped signals denied even in opt-out mode', () => {
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      allowGpcOverride: false,
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    expect(d.analytics_storage).toBe('denied') // clamp beats enabled
    expect(d.security_storage).toBe('granted') // necessary not clamped
  })

  it('GPC forces clamped signals denied in the default even with allowGpcOverride', () => {
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      allowGpcOverride: true,
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    // Override governs whether the toggle stays operable / a saved opt-in
    // persists — NOT the default-off state. A GPC visitor must default denied.
    expect(d.analytics_storage).toBe('denied')
    expect(d.security_storage).toBe('granted')
  })

  it('only pushes mapped signals', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    expect('personalization_storage' in d).toBe(false)
  })

  it('OR-merges a shared signal across categories regardless of order', () => {
    const GRANTED_CAT: ConsentCategory = {
      id: 'shared-granted',
      enabled: true,
      google: ['analytics_storage'],
    }
    const DENIED_CAT: ConsentCategory = {
      id: 'shared-denied',
      enabled: false,
      google: ['analytics_storage'],
    }

    configureConsent({
      googleConsentMode: true,
      categories: [DENIED_CAT, GRANTED_CAT],
    })
    pushGoogleConsentDefault()
    expect(lastCommand('default')!.analytics_storage).toBe('granted')

    configureConsent({
      googleConsentMode: true,
      categories: [GRANTED_CAT, DENIED_CAT],
    })
    pushGoogleConsentDefault()
    expect(lastCommand('default')!.analytics_storage).toBe('granted')
  })

  it('reuses an existing gtag/dataLayer instead of replacing it', () => {
    const existingGtag = vi.fn()
    ;(window as W).dataLayer = [{ existing: true }]
    ;(window as W).gtag = existingGtag
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    expect(existingGtag).toHaveBeenCalledWith(
      'consent',
      'default',
      expect.objectContaining({ wait_for_update: 500 }),
    )
    expect((window as W).dataLayer).toContainEqual({ existing: true })
  })
})

describe('pushGoogleConsentUpdate', () => {
  it('grants the signals of consented categories', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics' || id === 'necessary',
    )
    pushGoogleConsentUpdate()
    const u = lastCommand('update')!
    expect(u.analytics_storage).toBe('granted')
    expect(u.ad_user_data).toBe('granted')
    expect(u.security_storage).toBe('granted')
  })

  it('denies the signals of non-consented categories', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'necessary',
    )
    pushGoogleConsentUpdate()
    const u = lastCommand('update')!
    expect(u.analytics_storage).toBe('denied')
    expect(u.security_storage).toBe('granted')
  })

  it('does nothing when the feature is off', () => {
    configureConsent({
      googleConsentMode: false,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentUpdate()
    expect((window as W).dataLayer).toBeUndefined()
  })
})
