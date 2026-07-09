import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import { runConsent } from './run'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => false),
  acceptedCategory: vi.fn(() => false),
  acceptCategory: vi.fn(),
  run: vi.fn(() => Promise.resolve()),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown }

function entries(): unknown[][] {
  const dl = (window as W).dataLayer ?? []
  return dl.map((e) => Array.from(e as ArrayLike<unknown>))
}
function hasCommand(name: string): boolean {
  return entries().some((e) => e[0] === 'consent' && e[1] === name)
}

const CATS: ConsentCategory[] = [
  {
    id: 'necessary',
    enabled: true,
    readOnly: true,
    google: ['security_storage', 'functionality_storage'],
  },
  {
    id: 'analytics',
    analytics: true,
    google: ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  delete (window as W).dataLayer
  delete (window as W).gtag
})

afterEach(() => {
  delete (window as W).dataLayer
  delete (window as W).gtag
})

describe('runConsent + Google Consent Mode', () => {
  it('pushes a default command at init', async () => {
    configureConsent({
      googleConsentMode: true,
      reloadOnConsentChange: false,
      categories: CATS,
    })
    await runConsent()
    expect(hasCommand('default')).toBe(true)
  })

  it('pushes an update when vanilla-cookieconsent reports a change', async () => {
    configureConsent({
      googleConsentMode: true,
      reloadOnConsentChange: false,
      categories: CATS,
    })
    await runConsent()

    const cfg = vi.mocked(CookieConsent.run).mock
      .calls[0][0] as CookieConsentConfig
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics' || id === 'necessary',
    )
    cfg.onChange!({} as never)

    // runConsent's own `.then` already pushed an initial (denied) update, so
    // assert on the LAST update — the one from this onChange.
    const updates = entries().filter(
      (e) => e[0] === 'consent' && e[1] === 'update',
    )
    const last = updates[updates.length - 1]
    expect((last[2] as Record<string, unknown>).analytics_storage).toBe(
      'granted',
    )
  })

  it('pushes nothing when the feature is off', async () => {
    configureConsent({
      googleConsentMode: false,
      reloadOnConsentChange: false,
      categories: CATS,
    })
    await runConsent()
    expect((window as W).dataLayer).toBeUndefined()
  })
})
