import { defineGatedElement } from './gated'

const POUR_BASE = 'https://find.pour.now/'
const DEFAULT_HEIGHT = 1130

/** Builds the shelf iframe named by the `shelf` attribute and runs its height / `productId` protocol. */
function mountPour(host: HTMLElement): (() => void) | null {
  const shelf = host.getAttribute('shelf')
  if (!shelf) return null

  const height = Number(host.getAttribute('height')) || DEFAULT_HEIGHT
  const frame = document.createElement('iframe')
  frame.src = `${POUR_BASE}${shelf}`
  frame.setAttribute('allow', 'geolocation')
  frame.setAttribute('width', '100%')
  frame.setAttribute('loading', 'eager')
  frame.setAttribute('fetchpriority', 'high')
  frame.style.border = 'none'
  frame.style.width = '100%'
  frame.style.height = `${height}px`

  // Resize from the iframe's own postMessage protocol. Scoped by
  // contentWindow so multiple shelves on a page never cross-talk.
  const onMessage = (event: MessageEvent): void => {
    if (
      frame.contentWindow === event.source &&
      event.data &&
      event.data.type === 'iframeHeight' &&
      typeof event.data.height === 'number'
    ) {
      frame.style.height = `${event.data.height}px`
    }
  }
  window.addEventListener('message', onMessage)

  // Product anchoring: forward ?productId into the shelf once it loads.
  const productId = new URLSearchParams(location.search).get('productId')
  if (productId) {
    frame.addEventListener(
      'load',
      () => {
        setTimeout(() => {
          frame.contentWindow?.postMessage({ type: 'productId', productId }, '*')
        }, 500)
      },
      { once: true },
    )
  }

  host.append(frame) // light DOM
  return () => window.removeEventListener('message', onMessage)
}

/**
 * Register `<consent-pour>` — a consent-gated PourNow wine-finder embed.
 *
 * PourNow normally ships an `<iframe>` plus a companion script that hooks
 * `DOMContentLoaded`, finds the iframe by id, resizes it from `iframeHeight`
 * postMessages, and forwards a `?productId` into it on load. That lifecycle is
 * incompatible with consent gating (the iframe must not exist — or fetch
 * `find.pour.now` — before opt-in). This element internalizes the script: it
 * owns the iframe, so there is no external script, no `DOMContentLoaded`, and
 * no `getElementById`.
 *
 *   <consent-pour shelf="2556d19f-…" category="functionality" autoactivate>
 *     <button data-poster>Enable the wine finder</button>
 *   </consent-pour>
 *
 * `shelf` (required) is the shelf UUID → `https://find.pour.now/{shelf}`.
 * `category` picks the consent category (defaults to the gate category).
 * `height` sets the initial px height (default 1130) until the iframe's own
 * `iframeHeight` messages take over. Add `autoactivate` to load as soon as
 * consent is present instead of waiting for a `[data-poster]` click.
 *
 * Idempotent; `initConsent()` calls it.
 */
export function defineConsentPour(): void {
  defineGatedElement('consent-pour', mountPour)
}

declare global {
  interface HTMLElementTagNameMap {
    'consent-pour': HTMLElement
  }
}
