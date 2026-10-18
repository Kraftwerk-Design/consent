import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineConsentPour } from './pour'
import {
  describeGatedEmbed,
  installFakeController,
  type FakeController,
} from '../testing/gatedEmbed.contract'

const SHELF = '2556d19f-4e68-4b41-bbef-15ee098aea17'
const SRC = `https://find.pour.now/${SHELF}`

function makePour(): HTMLElement {
  const el = document.createElement('consent-pour')
  el.setAttribute('shelf', SHELF)
  el.innerHTML = '<button data-poster>Show</button>'
  return el
}

describeGatedEmbed({
  tag: 'consent-pour',
  define: defineConsentPour,
  make: makePour,
  probe: (el) => {
    const iframes = el.querySelectorAll('iframe').length
    return { activeNodes: iframes, iframes }
  },
})

describe('<consent-pour>', () => {
  let ctl: FakeController

  beforeEach(() => {
    defineConsentPour()
    ctl = installFakeController()
    ctl.grant('functionality')
  })

  afterEach(() => {
    document.body.innerHTML = ''
    ctl.destroy()
    history.replaceState({}, '', '/')
    vi.useRealTimers()
  })

  function connect(): HTMLIFrameElement {
    const el = makePour()
    el.setAttribute('category', 'functionality')
    el.setAttribute('autoactivate', '')
    document.body.append(el)
    return el.querySelector('iframe')!
  }

  it('S-K7 builds the shelf iframe', () => {
    const frame = connect()
    expect(frame.src).toBe(SRC)
    expect(frame.getAttribute('allow')).toBe('geolocation')
  })

  it('S-K7 resizes from an iframeHeight message scoped to its own iframe', () => {
    const frame = connect()

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'iframeHeight', height: 742 },
        source: frame.contentWindow,
      }),
    )
    expect(frame.style.height).toBe('742px')

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'iframeHeight', height: 99 },
        source: window,
      }),
    )
    expect(frame.style.height).toBe('742px')
  })

  it('S-K7 forwards ?productId into the shelf on load', () => {
    vi.useFakeTimers()
    history.replaceState({}, '', '/?productId=merlot-123')
    const frame = connect()
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')

    frame.dispatchEvent(new Event('load'))
    vi.advanceTimersByTime(500)

    expect(post).toHaveBeenCalledWith({ type: 'productId', productId: 'merlot-123' }, '*')
  })

  it('stops resizing after withdrawal', () => {
    const frame = connect()
    ctl.grant()

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'iframeHeight', height: 500 },
        source: frame.contentWindow,
      }),
    )
    expect(frame.style.height).not.toBe('500px')
  })
})
