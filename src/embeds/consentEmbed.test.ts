import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from '../config'
import { defineConsentEmbed } from './consentEmbed'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => false),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('../gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

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
  defineConsentEmbed() // idempotent registration
})

afterEach(() => {
  document.body.innerHTML = ''
})

function makeEmbed(category?: string): HTMLElement {
  const el = document.createElement('consent-embed')
  if (category) el.setAttribute('category', category)
  el.setAttribute('autoactivate', '')
  el.innerHTML = `<button data-poster>Show</button><template><p data-loaded></p></template>`
  return el
}

const isStamped = (el: HTMLElement) => !!el.querySelector('[data-loaded]')

describe('<consent-embed category>', () => {
  it('stays inert without consent for its category', () => {
    const el = makeEmbed('functionality')
    document.body.append(el) // connectedCallback fires
    expect(isStamped(el)).toBe(false)
  })

  it('stamps once its category is granted, independent of analytics', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const el = makeEmbed('functionality')
    document.body.append(el)
    expect(isStamped(el)).toBe(true)
  })

  it('an analytics-only grant does not activate a functionality embed', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    const el = makeEmbed('functionality')
    document.body.append(el)
    expect(isStamped(el)).toBe(false)
  })
})
