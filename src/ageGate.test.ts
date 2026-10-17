import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import {
  isAgeVerified,
  confirmAge,
  whenAgeConfirmed,
  __resetAgeGateForTests,
} from './ageGate'
import { hasConsent, requireConsent, promptConsent } from './analytics'
import { runConsent, __resetConsentRunForTests } from './run'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => true),
  run: vi.fn(() => Promise.resolve()),
  acceptCategory: vi.fn(),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown; fbq?: unknown }

function clearCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0`
}

const gated = (overrides = {}) =>
  configureConsent({
    mode: 'opt-out',
    ageGate: { cookieName: 'site_age_verified', ...overrides },
    categories: [
      { id: 'necessary', enabled: true, readOnly: true },
      { id: 'analytics', analytics: true, enabled: true },
    ],
  })

beforeEach(() => {
  vi.clearAllMocks()
  __resetAgeGateForTests()
  __resetConsentRunForTests()
  clearCookie('site_age_verified')
  gated()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  clearCookie('site_age_verified')
  clearCookie('other_site_age_verified')
  delete (window as W).dataLayer
  delete (window as W).gtag
  delete (window as W).fbq
})

describe('isAgeVerified', () => {
  it('is true when no age gate is configured', () => {
    configureConsent({})
    expect(isAgeVerified()).toBe(true)
  })

  it('is false until the age cookie exists', () => {
    expect(isAgeVerified()).toBe(false)
    document.cookie = 'site_age_verified=1; Path=/'
    expect(isAgeVerified()).toBe(true)
  })

  it('does not match a cookie whose name merely ends with the gate name', () => {
    document.cookie = 'other_site_age_verified=1; Path=/'
    expect(isAgeVerified()).toBe(false)
  })
})

describe('confirmAge', () => {
  it('writes the age cookie with a 30-day default lifetime', () => {
    const setter = vi.spyOn(document, 'cookie', 'set')
    confirmAge()
    expect(setter.mock.calls[0][0]).toMatch(
      /^site_age_verified=1; Path=\/; Max-Age=2592000; SameSite=Lax/,
    )
    expect(isAgeVerified()).toBe(true)
  })

  it('honors a configured lifetime', () => {
    gated({ maxAgeDays: 7 })
    const setter = vi.spyOn(document, 'cookie', 'set')
    confirmAge()
    expect(setter.mock.calls[0][0]).toContain('Max-Age=604800')
  })

  it('rounds fractional days to whole seconds', () => {
    gated({ maxAgeDays: 1.1 })
    const setter = vi.spyOn(document, 'cookie', 'set')
    confirmAge()
    expect(setter.mock.calls[0][0]).toContain('Max-Age=95040;')
  })

  it('omits Secure over http', () => {
    const setter = vi.spyOn(document, 'cookie', 'set')
    confirmAge()
    expect(setter.mock.calls[0][0]).not.toContain('Secure')
  })

  it('adds Secure over https', () => {
    vi.stubGlobal('location', { protocol: 'https:' })
    const setter = vi.spyOn(document, 'cookie', 'set')
    confirmAge()
    expect(setter.mock.calls[0][0]).toMatch(/; Secure$/)
  })

  it('does nothing when no age gate is configured', () => {
    configureConsent({})
    const setter = vi.spyOn(document, 'cookie', 'set')
    confirmAge()
    expect(setter).not.toHaveBeenCalled()
  })

  it('resolves pending whenAgeConfirmed() waiters', async () => {
    const resolved = vi.fn()
    void whenAgeConfirmed().then(resolved)
    await Promise.resolve()
    expect(resolved).not.toHaveBeenCalled()

    confirmAge()
    await Promise.resolve()
    expect(resolved).toHaveBeenCalledTimes(1)
  })
})

describe('consent before the age gate passes', () => {
  it('denies every category, even accepted ones', () => {
    expect(hasConsent('analytics')).toBe(false)
    expect(hasConsent('necessary')).toBe(false)
  })

  it('never opens the consent UI', () => {
    expect(requireConsent('analytics')).toBe(false)
    promptConsent()
    expect(CookieConsent.show).not.toHaveBeenCalled()
    expect(CookieConsent.showPreferences).not.toHaveBeenCalled()
  })

  it('holds runConsent() until confirmAge(), then runs the banner', async () => {
    const ready = runConsent()
    await Promise.resolve()
    expect(CookieConsent.run).not.toHaveBeenCalled()

    confirmAge()
    await ready
    expect(CookieConsent.run).toHaveBeenCalledTimes(1)
    expect(hasConsent('analytics')).toBe(true)
  })

  it('runs immediately for a returning verified visitor', async () => {
    document.cookie = 'site_age_verified=1; Path=/'
    const ready = runConsent()
    expect(CookieConsent.run).toHaveBeenCalledTimes(1)
    await ready
  })

  it('runs immediately when confirmAge() came before runConsent()', async () => {
    confirmAge()
    const ready = runConsent()
    expect(CookieConsent.run).toHaveBeenCalledTimes(1)
    await ready
  })

  it('ignores a second runConsent() while the gate is pending', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first = runConsent()
    await runConsent()
    expect(warn).toHaveBeenCalledTimes(1)

    confirmAge()
    await first
    expect(CookieConsent.run).toHaveBeenCalledTimes(1)
  })

  it('sends no Consent Mode or Meta signals until the gate passes', async () => {
    configureConsent({
      mode: 'opt-out',
      ageGate: { cookieName: 'site_age_verified' },
      googleConsentMode: true,
      metaPixelConsentMode: true,
    })
    const fbq = vi.fn()
    ;(window as W).fbq = fbq

    const ready = runConsent()
    await Promise.resolve()
    expect((window as W).dataLayer).toBeUndefined()
    expect(fbq).not.toHaveBeenCalled()

    confirmAge()
    await ready
    expect((window as W).dataLayer?.length).toBeGreaterThan(0)
    expect(fbq).toHaveBeenCalled()
  })
})
