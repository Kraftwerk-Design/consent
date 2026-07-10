import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { hasGpcSignal } from './gpc'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import { runConsent, __resetConsentRunForTests } from './run'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => false),
  acceptedCategory: vi.fn(() => false),
  acceptCategory: vi.fn(),
  run: vi.fn(() => Promise.resolve()),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

type W = typeof window & { fbq?: ReturnType<typeof vi.fn> }

function fbqCalls(): unknown[][] {
  const fbq = (window as W).fbq
  return fbq ? fbq.mock.calls.map((c) => Array.from(c)) : []
}
function consentCalls(): unknown[] {
  return fbqCalls()
    .filter((c) => c[0] === 'consent')
    .map((c) => c[1])
}
function dpoCalls(): unknown[][] {
  return fbqCalls().filter((c) => c[0] === 'dataProcessingOptions')
}

const CATS: ConsentCategory[] = [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', analytics: true, meta: true },
]
const OPTOUT_CATS: ConsentCategory[] = [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', enabled: true, analytics: true, meta: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  __resetConsentRunForTests()
  vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  vi.mocked(hasGpcSignal).mockReturnValue(false)
  ;(window as W).fbq = vi.fn()
})

afterEach(() => {
  delete (window as W).fbq
})

describe('runConsent + Meta Pixel consent', () => {
  it('pushes a default at init when on', async () => {
    configureConsent({
      metaPixelConsentMode: true,
      reloadOnConsentChange: false,
      mode: 'opt-in',
      categories: CATS,
    })
    await runConsent()
    expect(consentCalls().length).toBeGreaterThan(0)
  })

  it('pushes nothing when off', async () => {
    configureConsent({
      metaPixelConsentMode: false,
      reloadOnConsentChange: false,
      categories: CATS,
    })
    await runConsent()
    expect(fbqCalls()).toHaveLength(0)
  })

  it('onChange pushes an update reflecting hasConsent', async () => {
    configureConsent({
      metaPixelConsentMode: true,
      reloadOnConsentChange: false,
      mode: 'opt-in',
      categories: CATS,
    })
    await runConsent()
    const cfg = vi.mocked(CookieConsent.run).mock
      .calls[0][0] as CookieConsentConfig
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    ;(window as W).fbq = vi.fn() // isolate the onChange push
    cfg.onChange!({} as never)
    expect(consentCalls()).toContain('grant')
  })

  it('fresh no-consent load pushes only the default (opt-in revoke), no update', async () => {
    configureConsent({
      metaPixelConsentMode: true,
      reloadOnConsentChange: false,
      mode: 'opt-in',
      categories: CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
    await runConsent()
    expect(consentCalls()).toEqual(['revoke'])
    expect(dpoCalls()).toHaveLength(0)
  })

  it('returning opted-out visitor: .then() update applies LDU + revoke (opt-out)', async () => {
    configureConsent({
      metaPixelConsentMode: true,
      reloadOnConsentChange: false,
      mode: 'opt-out',
      categories: OPTOUT_CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false) // saved opt-out
    await runConsent()
    // Default fires grant + clear-LDU first (the page-load limitation), then the
    // .then() update corrects subsequent events to LDU + revoke.
    expect(dpoCalls()).toContainEqual(['dataProcessingOptions', ['LDU'], 0, 0])
    expect(consentCalls()).toContain('revoke')
  })
})
