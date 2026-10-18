import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolveConfig } from './config'
import { isAgeVerified } from './core/controller'
import { googleConsentMode } from './integrations/google'
import { GOOGLE_CONSENT_DEFAULT_HEAD, ageGateHeadScript } from './head'

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown }
const w = window as W

/** Execute a `<script>…</script>` snippet in the jsdom global scope. */
function run(html: string): void {
  const js = html.replace(/^<script>/, '').replace(/<\/script>$/, '')
  ;(0, eval)(js)
}

const dataLayerArgs = (): unknown[][] =>
  (w.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))

function clearCookies(): void {
  for (const cookie of document.cookie.split(/;\s*/)) {
    const name = cookie.split('=')[0]
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  delete w.dataLayer
  delete w.gtag
  clearCookies()
  document.documentElement.className = ''
})

const DOCUMENTED_MAP = {
  security_storage: 'necessary',
  functionality_storage: 'necessary',
  analytics_storage: 'analytics',
  ad_storage: 'analytics',
  ad_user_data: 'analytics',
  ad_personalization: 'analytics',
} as const

describe('GOOGLE_CONSENT_DEFAULT_HEAD', () => {
  it('S-G4 deep-equals the init default for the default categories with the documented six-signal map', () => {
    run(GOOGLE_CONSENT_DEFAULT_HEAD)
    const head = dataLayerArgs()
    delete w.dataLayer
    delete w.gtag

    googleConsentMode(DOCUMENTED_MAP).init!(resolveConfig())

    expect(head).toHaveLength(1)
    expect(head).toEqual(dataLayerArgs())
  })

  it('keeps an existing dataLayer', () => {
    w.dataLayer = [{ existing: true }]
    run(GOOGLE_CONSENT_DEFAULT_HEAD)
    expect(w.dataLayer[0]).toEqual({ existing: true })
    expect(dataLayerArgs()[1].slice(0, 2)).toEqual(['consent', 'default'])
  })
})

describe('googleConsentMode init after an earlier default (S-O2b)', () => {
  const init = (map: Parameters<typeof googleConsentMode>[0]) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    googleConsentMode(map).init!(resolveConfig())
    return warn
  }

  it('warns when the head grants a signal mapped to a gated category', () => {
    run(GOOGLE_CONSENT_DEFAULT_HEAD)
    const warn = init({ ...DOCUMENTED_MAP, functionality_storage: 'analytics' })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toMatch(/^\[consent\] .*functionality_storage.*readOnly.*Model A/)
  })

  it('is silent when the signal is also mapped to a readOnly category', () => {
    run(GOOGLE_CONSENT_DEFAULT_HEAD)
    expect(init({ ...DOCUMENTED_MAP, functionality_storage: ['necessary', 'analytics'] })).not.toHaveBeenCalled()
  })

  it('is silent without an earlier default', () => {
    expect(init({ ...DOCUMENTED_MAP, functionality_storage: 'analytics' })).not.toHaveBeenCalled()
  })

  it('is silent for the documented six-signal map with the head', () => {
    run(GOOGLE_CONSENT_DEFAULT_HEAD)
    expect(init(DOCUMENTED_MAP)).not.toHaveBeenCalled()
  })
})

describe('ageGateHeadScript', () => {
  it.each([
    ['x_age=1', true],
    ['foo_x_age=1', false],
    ['x_age=10', false],
  ])('S-L2 head check and isAgeVerified agree on %s', (cookie, verified) => {
    document.cookie = `${cookie}; Path=/`
    run(ageGateHeadScript({ cookieName: 'x_age' }))

    expect(document.documentElement.classList.contains('age-verified')).toBe(verified)
    expect(isAgeVerified({ cookieName: 'x_age' })).toBe(verified)
  })

  it('escapes an awkward cookie name and still agrees with isAgeVerified', () => {
    const cookieName = "a'b\\c</script>"
    const html = ageGateHeadScript({ cookieName })
    expect(html.indexOf('</script>')).toBe(html.length - '</script>'.length)

    document.cookie = `${cookieName}=1; Path=/`
    run(html)
    expect(isAgeVerified({ cookieName })).toBe(true)
    expect(document.documentElement.classList.contains('age-verified')).toBe(true)
  })

  it('defaults to AGE_GATE_COOKIE and adds a custom class', () => {
    document.cookie = 'kd_age_verified=1; Path=/'
    run(ageGateHeadScript({ className: 'of-age' }))
    expect(document.documentElement.classList.contains('of-age')).toBe(true)
  })
})
