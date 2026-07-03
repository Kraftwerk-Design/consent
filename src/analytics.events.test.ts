import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import {
  dispatchConsentChange,
  onConsentChange,
  onAnalyticsConsentChange,
} from './analytics'

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
  configureConsent({
    categories: [
      { id: 'necessary' },
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
})

describe('consent-change event', () => {
  it('dispatches consent:change with accepted + a full categories map', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const spy = vi.fn()
    document.addEventListener('consent:change', spy)

    dispatchConsentChange()

    const detail = spy.mock.calls[0][0].detail
    expect(detail.accepted).toBe(false) // default gate category = analytics
    expect(detail.categories).toEqual({
      necessary: false,
      functionality: true,
      analytics: false,
    })
    document.removeEventListener('consent:change', spy)
  })

  it('onConsentChange fires with the named category boolean', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const handler = vi.fn()
    const off = onConsentChange(handler, 'functionality')

    dispatchConsentChange()

    expect(handler).toHaveBeenCalledWith(true)
    off()
  })

  it('onAnalyticsConsentChange reflects the default gate category', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    const handler = vi.fn()
    const off = onAnalyticsConsentChange(handler)

    dispatchConsentChange()

    expect(handler).toHaveBeenCalledWith(true)
    off()
  })

  it('unsubscribe stops delivery', () => {
    const handler = vi.fn()
    const off = onConsentChange(handler)
    off()
    dispatchConsentChange()
    expect(handler).not.toHaveBeenCalled()
  })
})
