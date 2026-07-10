import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import { hasGpcSignal } from './gpc'
import {
  pushGoogleConsentDefault,
  pushGoogleConsentUpdate,
  pushGoogleConsentBaselineUpdate,
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

const COOKIE_NAME = 'kd_cookie_consent'

/** Write a vanilla-cookieconsent-shaped cookie for the given accepted set. */
function setSavedConsent(categories: string[]): void {
  const value = encodeURIComponent(JSON.stringify({ categories, revision: 0 }))
  document.cookie = `${COOKIE_NAME}=${value}`
}
function clearSavedConsent(): void {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
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
  clearSavedConsent()
  delete (window as W).dataLayer
  delete (window as W).gtag
})

afterEach(() => {
  clearSavedConsent()
  delete (window as W).dataLayer
  delete (window as W).gtag
})

// The `default` is denied-by-default: consent-gated signals start denied,
// readOnly (necessary) signals granted, INDEPENDENT of mode, cookie, and GPC.
// Per-visitor state is applied afterward as an `update`.
describe('pushGoogleConsentDefault', () => {
  it('does nothing when the feature is off', () => {
    configureConsent({
      googleConsentMode: false,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    expect((window as W).dataLayer).toBeUndefined()
  })

  it('denies consent-gated signals and grants readOnly ones, with wait_for_update', () => {
    configureConsent({
      googleConsentMode: true,
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

  it('stays denied in opt-out mode with enabled categories (no early granted)', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentDefault()
    expect(lastCommand('default')!.analytics_storage).toBe('denied')
  })

  it('ignores a saved cookie — the default never reflects a returning choice', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-in',
      categories: [NECESSARY, ANALYTICS],
    })
    setSavedConsent(['necessary', 'analytics']) // opted in
    pushGoogleConsentDefault()
    expect(lastCommand('default')!.analytics_storage).toBe('denied')
  })

  it('ignores GPC — the denied baseline is already the safe state', () => {
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    expect(d.analytics_storage).toBe('denied')
    expect(d.security_storage).toBe('granted')
  })

  it('only pushes mapped signals', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    expect('personalization_storage' in lastCommand('default')!).toBe(false)
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

// The fresh-visitor baseline `update`: mode baseline applied on top of the
// denied default so a fresh opt-out visitor upgrades to granted. GPC still
// clamps; a returning visitor never takes this path.
describe('pushGoogleConsentBaselineUpdate', () => {
  it('does nothing when the feature is off', () => {
    configureConsent({
      googleConsentMode: false,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentBaselineUpdate()
    expect((window as W).dataLayer).toBeUndefined()
  })

  it('opt-out: upgrades enabled categories to granted', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentBaselineUpdate()
    const u = lastCommand('update')!
    expect(u.analytics_storage).toBe('granted')
    expect(u.ad_personalization).toBe('granted')
    expect(u.security_storage).toBe('granted')
  })

  it('opt-in: re-states the denied baseline', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-in',
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentBaselineUpdate()
    const u = lastCommand('update')!
    expect(u.analytics_storage).toBe('denied')
    expect(u.security_storage).toBe('granted')
  })

  it('GPC forces clamped signals denied even for an enabled opt-out category', () => {
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      allowGpcOverride: false,
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentBaselineUpdate()
    const u = lastCommand('update')!
    expect(u.analytics_storage).toBe('denied') // clamp beats enabled
    expect(u.security_storage).toBe('granted') // necessary not clamped
  })

  it('GPC clamp holds even under allowGpcOverride (baseline has no saved opt-in)', () => {
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      allowGpcOverride: true,
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentBaselineUpdate()
    // Override only lets a *saved* opt-in flip the signal — the fresh baseline
    // has none, so GPC still clamps it denied.
    expect(lastCommand('update')!.analytics_storage).toBe('denied')
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
