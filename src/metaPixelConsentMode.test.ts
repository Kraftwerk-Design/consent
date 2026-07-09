import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { hasGpcSignal } from './gpc'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import {
  pushMetaPixelConsentDefault,
  pushMetaPixelConsentUpdate,
} from './metaPixelConsentMode'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => false),
  acceptedCategory: vi.fn(() => false),
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
  // clearAllMocks does not undo mockReturnValue, so pin defaults explicitly.
  vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  vi.mocked(hasGpcSignal).mockReturnValue(false)
  ;(window as W).fbq = vi.fn()
})

afterEach(() => {
  delete (window as W).fbq
})

describe('metaPixelConsentMode', () => {
  it('1. off: pushes nothing', () => {
    configureConsent({ metaPixelConsentMode: false, categories: CATS })
    pushMetaPixelConsentDefault()
    pushMetaPixelConsentUpdate()
    expect(fbqCalls()).toHaveLength(0)
  })

  it('2. absent fbq: no throw, no stub synthesized', () => {
    delete (window as W).fbq
    configureConsent({ metaPixelConsentMode: true, categories: CATS })
    expect(() => pushMetaPixelConsentDefault()).not.toThrow()
    expect((window as W).fbq).toBeUndefined()
  })

  it('3. default, opt-in: revoke, no DPO', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    pushMetaPixelConsentDefault()
    expect(consentCalls()).toContain('revoke')
    expect(dpoCalls()).toHaveLength(0)
  })

  it('4. default, opt-out: grant + clear LDU, never LDU', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-out',
      categories: OPTOUT_CATS,
    })
    pushMetaPixelConsentDefault()
    expect(consentCalls()).toContain('grant')
    expect(dpoCalls()).toContainEqual(['dataProcessingOptions', []])
    expect(
      dpoCalls().some(
        (c) => Array.isArray(c[1]) && (c[1] as unknown[]).includes('LDU'),
      ),
    ).toBe(false)
  })

  it('5. update grant, opt-in: grant, no DPO', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    pushMetaPixelConsentUpdate()
    expect(consentCalls()).toContain('grant')
    expect(dpoCalls()).toHaveLength(0)
  })

  it('6. update opt-out withdrawal: LDU + revoke', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-out',
      categories: OPTOUT_CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    pushMetaPixelConsentUpdate()
    expect(dpoCalls()).toContainEqual(['dataProcessingOptions', ['LDU'], 0, 0])
    expect(consentCalls()).toContain('revoke')
  })

  it('7. update opt-in no consent: revoke, no DPO', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    pushMetaPixelConsentUpdate()
    expect(consentCalls()).toContain('revoke')
    expect(dpoCalls()).toHaveLength(0)
  })

  it('8. opt-in never emits dataProcessingOptions', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    pushMetaPixelConsentDefault()
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(true)
    pushMetaPixelConsentUpdate()
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    pushMetaPixelConsentUpdate()
    expect(dpoCalls()).toHaveLength(0)
  })

  it('9. GPC opt-in: default revoke', () => {
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    pushMetaPixelConsentDefault()
    expect(consentCalls()).toContain('revoke')
  })

  it.each([false, true])(
    '10. GPC opt-out (allowGpcOverride=%s): default LDU + revoke (override-independent)',
    (allowGpcOverride) => {
      vi.mocked(hasGpcSignal).mockReturnValue(true)
      configureConsent({
        metaPixelConsentMode: true,
        mode: 'opt-out',
        allowGpcOverride,
        categories: OPTOUT_CATS,
      })
      pushMetaPixelConsentDefault()
      expect(dpoCalls()).toContainEqual([
        'dataProcessingOptions',
        ['LDU'],
        0,
        0,
      ])
      expect(consentCalls()).toContain('revoke')
    },
  )

  it('11. OR across meta categories: one consented → grant', () => {
    const cats: ConsentCategory[] = [
      { id: 'a', analytics: true, meta: true },
      { id: 'b', meta: true },
    ]
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: cats,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'b',
    )
    pushMetaPixelConsentUpdate()
    expect(consentCalls()).toContain('grant')
  })
})
