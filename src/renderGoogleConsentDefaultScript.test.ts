import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import { renderGoogleConsentDefaultScript } from './googleConsentMode'

// The head script is now a STATIC denied-by-default snippet: it carries no
// per-visitor state and no config, so there is nothing to parse or re-derive.
// Its runtime parity with the init-time default is guaranteed by construction
// (pushGoogleConsentDefault emits the same denied baseline), not by executing
// the string — so these tests assert the constant's shape, not its behavior.

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown }

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

/** Execute the rendered `<script>…</script>` body in the jsdom global scope. */
function runRenderedScript(): void {
  const html = renderGoogleConsentDefaultScript()
  const js = html.replace(/^<script>/, '').replace(/<\/script>$/, '')
  // eslint-disable-next-line no-eval
  ;(0, eval)(js)
}
function lastDefault(): Record<string, unknown> | undefined {
  const dl = (window as W).dataLayer ?? []
  const cmds = dl
    .map((e) => Array.from(e as ArrayLike<unknown>))
    .filter((e) => e[0] === 'consent' && e[1] === 'default')
  return cmds.length
    ? (cmds[cmds.length - 1][2] as Record<string, unknown>)
    : undefined
}

beforeEach(() => {
  delete (window as W).dataLayer
  delete (window as W).gtag
})
afterEach(() => {
  delete (window as W).dataLayer
  delete (window as W).gtag
})

describe('renderGoogleConsentDefaultScript', () => {
  it('returns an empty string when the feature is off', () => {
    configureConsent({
      googleConsentMode: false,
      categories: [NECESSARY, ANALYTICS],
    })
    expect(renderGoogleConsentDefaultScript()).toBe('')
  })

  it('is a self-contained <script> and is independent of config', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      cookieName: 'custom_name',
      allowGpcOverride: true,
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    const a = renderGoogleConsentDefaultScript()

    configureConsent({
      googleConsentMode: true,
      mode: 'opt-in',
      cookieName: 'totally_different',
      categories: [NECESSARY, ANALYTICS],
    })
    const b = renderGoogleConsentDefaultScript()

    expect(a).toBe(b) // no per-config payload — same string regardless
    expect(a.startsWith('<script>')).toBe(true)
    expect(a.trimEnd().endsWith('</script>')).toBe(true)
    expect(a).not.toMatch(/custom_name|totally_different/) // no cookie name baked in
  })

  it('emits a denied-by-default consent command with wait_for_update', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    runRenderedScript()
    const d = lastDefault()!
    expect(d.wait_for_update).toBe(500)
    expect(d.analytics_storage).toBe('denied')
    expect(d.ad_storage).toBe('denied')
    expect(d.ad_user_data).toBe('denied')
    expect(d.ad_personalization).toBe('denied')
    // necessary (readOnly) signals stay granted
    expect(d.security_storage).toBe('granted')
    expect(d.functionality_storage).toBe('granted')
  })

  it('does not clobber an existing dataLayer', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    ;(window as W).dataLayer = [{ existing: true }]
    runRenderedScript()
    expect((window as W).dataLayer).toContainEqual({ existing: true })
    expect(lastDefault()).toBeDefined()
  })
})
