import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from '../config'
import { defineConsentPour } from './consentPour'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => false),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('../gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

const SHELF = '2556d19f-4e68-4b41-bbef-15ee098aea17'
const SRC = `https://find.pour.now/${SHELF}`

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
  defineConsentPour() // idempotent registration
})

afterEach(() => {
  document.body.innerHTML = ''
  history.replaceState({}, '', '/')
})

function grant(category: string): void {
  vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
    (id) => id === category,
  )
}

function makePour(category = 'functionality', autoactivate = true): HTMLElement {
  const el = document.createElement('consent-pour')
  el.setAttribute('shelf', SHELF)
  el.setAttribute('category', category)
  if (autoactivate) el.setAttribute('autoactivate', '')
  el.innerHTML = `<button data-poster>Show</button>`
  return el
}

const frameOf = (el: HTMLElement) => el.querySelector('iframe')

describe('<consent-pour>', () => {
  it('builds no iframe before consent (no fetch to find.pour.now)', () => {
    const el = makePour('functionality')
    document.body.append(el)
    expect(frameOf(el)).toBeNull()
  })

  it('builds the shelf iframe once its category is granted', () => {
    grant('functionality')
    const el = makePour('functionality')
    document.body.append(el)
    const frame = frameOf(el)
    expect(frame).not.toBeNull()
    expect(frame?.src).toBe(SRC)
    expect(frame?.getAttribute('allow')).toBe('geolocation')
  })

  it('an unrelated category grant does not activate', () => {
    grant('analytics')
    const el = makePour('functionality')
    document.body.append(el)
    expect(frameOf(el)).toBeNull()
  })

  it('activates on poster click when not autoactivate', () => {
    grant('functionality')
    const el = makePour('functionality', false)
    document.body.append(el)
    expect(frameOf(el)).toBeNull()
    el.querySelector<HTMLElement>('[data-poster]')!.click()
    expect(frameOf(el)).not.toBeNull()
  })

  it('resizes from an iframeHeight message scoped to its own iframe', () => {
    grant('functionality')
    const el = makePour('functionality')
    document.body.append(el)
    const frame = frameOf(el)!

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'iframeHeight', height: 742 },
        source: frame.contentWindow,
      }),
    )
    expect(frame.style.height).toBe('742px')

    // A message from another source is ignored.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'iframeHeight', height: 99 },
        source: window,
      }),
    )
    expect(frame.style.height).toBe('742px')
  })

  it('forwards ?productId into the shelf on load', () => {
    vi.useFakeTimers()
    history.replaceState({}, '', '/?productId=merlot-123')
    grant('functionality')
    const el = makePour('functionality')
    document.body.append(el)
    const frame = frameOf(el)!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')

    frame.dispatchEvent(new Event('load'))
    vi.advanceTimersByTime(500)

    expect(post).toHaveBeenCalledWith(
      { type: 'productId', productId: 'merlot-123' },
      '*',
    )
    vi.useRealTimers()
  })

  it('tears the iframe down and detaches its listener on withdrawal', () => {
    grant('functionality')
    const el = makePour('functionality')
    document.body.append(el)
    const frame = frameOf(el)!

    // Withdraw consent and re-dispatch the change event.
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    document.dispatchEvent(
      new CustomEvent('consent:change', {
        detail: { accepted: false, categories: { functionality: false } },
      }),
    )

    expect(frameOf(el)).toBeNull()

    // The old listener is gone: a stale message must not throw or resize.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'iframeHeight', height: 500 },
        source: frame.contentWindow,
      }),
    )
    expect(frame.style.height).not.toBe('500px')
  })
})
