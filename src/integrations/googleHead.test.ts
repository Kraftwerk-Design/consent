import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolveConfig } from '../config'
import { googleConsentMode, GOOGLE_CONSENT_DEFAULT_HEAD } from './google'

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown }
const w = window as W

/** Execute a `<script>…</script>` snippet in the jsdom global scope. */
function run(html: string): void {
  const js = html.replace(/^<script>/, '').replace(/<\/script>$/, '')
  ;(0, eval)(js)
}

const dataLayerArgs = (): unknown[][] =>
  (w.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))

afterEach(() => {
  vi.restoreAllMocks()
  delete w.dataLayer
  delete w.gtag
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
