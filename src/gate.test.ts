import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import { dispatchConsentChange } from './analytics'
import { setupConsentGate } from './gate'

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
})

describe('setupConsentGate with a category', () => {
  it('auto-activates when the named category is already granted', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const activate = vi.fn(() => true)
    setupConsentGate({
      category: 'functionality',
      activate,
      deactivate: vi.fn(),
      triggers: [],
      autoActivate: true,
    })
    expect(activate).toHaveBeenCalled()
  })

  it('stays inert when a different category is granted', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    const activate = vi.fn(() => true)
    setupConsentGate({
      category: 'functionality',
      activate,
      deactivate: vi.fn(),
      triggers: [],
      autoActivate: true,
    })
    expect(activate).not.toHaveBeenCalled()
  })

  it('tears down when the named category is withdrawn', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const deactivate = vi.fn()
    setupConsentGate({
      category: 'functionality',
      activate: vi.fn(() => true),
      deactivate,
      triggers: [],
      autoActivate: true,
    })
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    dispatchConsentChange()
    expect(deactivate).toHaveBeenCalled()
  })

  it('returns a teardown that unsubscribes from consent changes', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const activate = vi.fn(() => true)
    const deactivate = vi.fn()
    const teardown = setupConsentGate({
      category: 'functionality',
      activate,
      deactivate,
      triggers: [],
      autoActivate: true,
    })
    activate.mockClear()
    deactivate.mockClear()

    teardown()

    // Consent is withdrawn and re-dispatched after teardown: with the
    // listener released, neither callback should fire again.
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    dispatchConsentChange()

    expect(deactivate).not.toHaveBeenCalled()
    expect(activate).not.toHaveBeenCalled()
  })

  it('teardown removes trigger click listeners too', () => {
    const activate = vi.fn(() => true)
    const trigger = document.createElement('button')
    const teardown = setupConsentGate({
      category: 'functionality',
      activate,
      deactivate: vi.fn(),
      triggers: [trigger],
      autoActivate: false,
    })
    activate.mockClear()

    teardown()
    trigger.click()

    expect(activate).not.toHaveBeenCalled()
  })
})
