import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import { hasGpcSignal } from './gpc'
import {
  hasConsent,
  hasAnalyticsConsent,
  requireConsent,
  promptConsent,
} from './analytics'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => false),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

const accepted = (...ids: string[]) =>
  vi.mocked(CookieConsent.acceptedCategory).mockImplementation((id) =>
    ids.includes(id as string),
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  vi.mocked(hasGpcSignal).mockReturnValue(false)
  configureConsent({
    allowGpcOverride: false,
    categories: [
      { id: 'necessary' },
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
})

describe('hasConsent', () => {
  it('is true only when the category is accepted and consent is valid', () => {
    accepted('functionality')
    expect(hasConsent('functionality')).toBe(true)
    expect(hasConsent('analytics')).toBe(false)
  })

  it('defaults to the default gate category when no id is given', () => {
    accepted('analytics')
    expect(hasConsent()).toBe(true)
    expect(hasAnalyticsConsent()).toBe(true)
  })

  it('GPC blocks a clamped category but not an unclamped one', () => {
    accepted('functionality', 'analytics')
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    expect(hasConsent('analytics')).toBe(false) // clamped
    expect(hasConsent('functionality')).toBe(true) // not clamped
  })

  it('respects a saved opt-in under allowGpcOverride', () => {
    configureConsent({
      allowGpcOverride: true,
      categories: [{ id: 'analytics', analytics: true }],
    })
    accepted('analytics')
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    expect(hasConsent('analytics')).toBe(true)
  })
})

describe('hasConsent opt-out mode', () => {
  it('treats a default-enabled category as consented before interaction', () => {
    configureConsent({
      mode: 'opt-out',
      allowGpcOverride: false,
      categories: [{ id: 'analytics', analytics: true, enabled: true }],
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(false) // fresh visit
    accepted('analytics') // opt-out default-accepts enabled categories
    expect(hasConsent('analytics')).toBe(true)
  })

  it('still requires a recorded choice in opt-in mode', () => {
    configureConsent({
      mode: 'opt-in',
      categories: [{ id: 'analytics', analytics: true }],
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
    accepted('analytics')
    expect(hasConsent('analytics')).toBe(false)
  })

  it('opt-out + GPC (no override) stays off before interaction', () => {
    configureConsent({
      mode: 'opt-out',
      allowGpcOverride: false,
      categories: [{ id: 'analytics', analytics: true, enabled: true }],
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    accepted('analytics')
    expect(hasConsent('analytics')).toBe(false) // GPC clamp beats the opt-out default
  })
})

describe('requireConsent', () => {
  it('returns true and does not prompt when consent is present', () => {
    accepted('analytics')
    expect(requireConsent('analytics')).toBe(true)
    expect(CookieConsent.show).not.toHaveBeenCalled()
    expect(CookieConsent.showPreferences).not.toHaveBeenCalled()
  })

  it('prompts and returns false when consent is missing', () => {
    expect(requireConsent('analytics')).toBe(false)
    expect(CookieConsent.showPreferences).toHaveBeenCalledOnce()
  })
})

describe('promptConsent', () => {
  it('shows the banner when there is no valid consent yet', () => {
    vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
    promptConsent('analytics')
    expect(CookieConsent.show).toHaveBeenCalledOnce()
  })

  it('shows preferences when consent already exists', () => {
    promptConsent('analytics')
    expect(CookieConsent.showPreferences).toHaveBeenCalledOnce()
  })
})
