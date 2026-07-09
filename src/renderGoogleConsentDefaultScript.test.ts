import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import {
  pushGoogleConsentDefault,
  renderGoogleConsentDefaultScript,
} from './googleConsentMode'

// This suite deliberately does NOT mock ./gpc: the init-time push and the
// rendered inline script must read the SAME `navigator.globalPrivacyControl`,
// so parity is meaningful.

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown }

const COOKIE_NAME = 'kd_cookie_consent'

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

function setGpc(on: boolean): void {
  Object.defineProperty(navigator, 'globalPrivacyControl', {
    value: on,
    configurable: true,
  })
}
function setSavedConsent(categories: string[] | null): void {
  if (categories === null) {
    document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    return
  }
  const value = encodeURIComponent(JSON.stringify({ categories, revision: 0 }))
  document.cookie = `${COOKIE_NAME}=${value}`
}

function resetDataLayer(): void {
  delete (window as W).dataLayer
  delete (window as W).gtag
}

/** The last `consent`/`default` payload pushed to dataLayer. */
function lastDefault(): Record<string, unknown> | undefined {
  const dl = (window as W).dataLayer ?? []
  const cmds = dl
    .map((e) => Array.from(e as ArrayLike<unknown>))
    .filter((e) => e[0] === 'consent' && e[1] === 'default')
  return cmds.length
    ? (cmds[cmds.length - 1][2] as Record<string, unknown>)
    : undefined
}

/** Execute the rendered `<script>…</script>` body in the jsdom global scope. */
function runRenderedScript(): void {
  const html = renderGoogleConsentDefaultScript()
  const js = html.replace(/^<script>/, '').replace(/<\/script>$/, '')
  // eslint-disable-next-line no-eval
  ;(0, eval)(js)
}

beforeEach(() => {
  setGpc(false)
  setSavedConsent(null)
  resetDataLayer()
})
afterEach(() => {
  setGpc(false)
  setSavedConsent(null)
  resetDataLayer()
})

describe('renderGoogleConsentDefaultScript', () => {
  it('returns an empty string when the feature is off', () => {
    configureConsent({
      googleConsentMode: false,
      categories: [NECESSARY, ANALYTICS],
    })
    expect(renderGoogleConsentDefaultScript()).toBe('')
  })

  it('returns a self-contained <script> that emits a consent default', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    const html = renderGoogleConsentDefaultScript()
    expect(html.startsWith('<script>')).toBe(true)
    expect(html.endsWith('</script>')).toBe(true)
    runRenderedScript()
    const d = lastDefault()!
    expect(d.wait_for_update).toBe(500)
    expect(d.analytics_storage).toBe('granted') // fresh opt-out
  })

  it('emits denied synchronously for a returning opted-out visitor', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    setSavedConsent(['necessary'])
    runRenderedScript()
    const d = lastDefault()!
    expect(d.analytics_storage).toBe('denied')
    expect(d.ad_storage).toBe('denied')
    expect(d.security_storage).toBe('granted')
  })

  it('does not clobber an existing dataLayer/gtag', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    ;(window as W).dataLayer = [{ existing: true }]
    runRenderedScript()
    expect((window as W).dataLayer).toContainEqual({ existing: true })
    expect(lastDefault()).toBeDefined()
  })

  it('only emits signals that a category maps', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    runRenderedScript()
    expect('personalization_storage' in lastDefault()!).toBe(false)
  })

  // The core guarantee: the inline default and the init-time default must agree
  // for every visitor state.
  describe('parity with pushGoogleConsentDefault', () => {
    const modes = ['opt-in', 'opt-out'] as const
    const overrides = [false, true]
    const gpcStates = [false, true]
    const savedStates: (string[] | null)[] = [
      null,
      [],
      ['necessary'],
      ['necessary', 'analytics'],
      ['analytics'],
    ]

    for (const mode of modes) {
      for (const override of overrides) {
        for (const gpc of gpcStates) {
          for (const saved of savedStates) {
            const label = `${mode} override=${override} gpc=${gpc} saved=${JSON.stringify(saved)}`
            it(`agrees: ${label}`, () => {
              configureConsent({
                googleConsentMode: true,
                mode,
                allowGpcOverride: override,
                categories: [
                  NECESSARY,
                  { ...ANALYTICS, enabled: mode === 'opt-out' },
                ],
              })
              setGpc(gpc)
              setSavedConsent(saved)

              resetDataLayer()
              pushGoogleConsentDefault()
              const initDefault = lastDefault()

              resetDataLayer()
              runRenderedScript()
              const inlineDefault = lastDefault()

              expect(inlineDefault).toEqual(initDefault)
            })
          }
        }
      }
    }
  })
})
