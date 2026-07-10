import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import { installWindowApi } from './analytics'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => false),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  configureConsent({
    categories: [
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
  installWindowApi() // idempotent; registers the delegated handler once
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('window API', () => {
  it('exposes the general helpers and the aliases', () => {
    const api = (window as unknown as Record<string, Record<string, unknown>>)
      .KDConsent
    for (const name of [
      'hasConsent',
      'requireConsent',
      'promptConsent',
      'onConsentChange',
      'hasAnalyticsConsent',
      'requireAnalyticsConsent',
      'promptAnalyticsConsent',
      'onAnalyticsConsentChange',
    ]) {
      expect(typeof api[name]).toBe('function')
    }
  })
})

describe('[data-require-consent] delegation', () => {
  it('prompts for the named category when it lacks consent', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-require-consent', 'functionality')
    document.body.append(btn)

    btn.click()

    expect(CookieConsent.showPreferences).toHaveBeenCalledOnce()
  })

  it('does not prompt when the named category is granted', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const btn = document.createElement('button')
    btn.setAttribute('data-require-consent', 'functionality')
    document.body.append(btn)

    btn.click()

    expect(CookieConsent.showPreferences).not.toHaveBeenCalled()
  })

  it('legacy [data-require-analytics] gates on the default category', () => {
    const link = document.createElement('a')
    link.setAttribute('data-require-analytics', '')
    document.body.append(link)

    link.click()

    expect(CookieConsent.showPreferences).toHaveBeenCalledOnce()
  })
})
