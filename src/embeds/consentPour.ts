import { hasConsent } from '../analytics'
import { setupConsentGate, hide, show } from '../gate'

const POUR_BASE = 'https://find.pour.now/'
const DEFAULT_HEIGHT = 1130

/**
 * Register `<consent-pour>` — a consent-gated PourNow wine-finder embed.
 *
 * PourNow normally ships an `<iframe>` plus a companion script that hooks
 * `DOMContentLoaded`, finds the iframe by id, resizes it from `iframeHeight`
 * postMessages, and forwards a `?productId` into it on load. That lifecycle is
 * incompatible with consent gating (the iframe must not exist — or fetch
 * `find.pour.now` — before opt-in). This element internalizes the script: it
 * owns the iframe, so there is no external script, no `DOMContentLoaded`, and
 * no `getElementById`. On consent it builds the iframe and runs the height /
 * `productId` logic scoped to its own element; on withdrawal it tears the
 * iframe down and detaches its listener.
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
 * Idempotent; call after `configureConsent()`. Defined lazily so importing the
 * module never references `HTMLElement` (safe in Node/SSR).
 */
export function defineConsentPour(): void {
  if (typeof customElements === 'undefined') return
  if (customElements.get('consent-pour')) return

  class ConsentPour extends HTMLElement {
    private wired = false
    private teardown: (() => void) | null = null

    connectedCallback(): void {
      if (this.wired) return
      this.wired = true

      const category = this.getAttribute('category') ?? undefined
      const shelf = this.getAttribute('shelf')
      const poster = this.querySelector<HTMLElement>('[data-poster]')

      let iframe: HTMLIFrameElement | null = null
      let onMessage: ((event: MessageEvent) => void) | null = null

      const activate = (): boolean => {
        if (!hasConsent(category) || !shelf) return false

        if (!iframe) {
          const height = Number(this.getAttribute('height')) || DEFAULT_HEIGHT
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
          onMessage = (event: MessageEvent): void => {
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
                  frame.contentWindow?.postMessage(
                    { type: 'productId', productId },
                    '*',
                  )
                }, 500)
              },
              { once: true },
            )
          }

          iframe = frame
          this.append(frame) // light DOM
        }

        hide(poster)
        return true
      }

      const deactivate = (): void => {
        if (onMessage) {
          window.removeEventListener('message', onMessage)
          onMessage = null
        }
        iframe?.remove()
        iframe = null
        show(poster)
      }

      this.teardown = setupConsentGate({
        category,
        activate,
        deactivate,
        triggers: [poster],
        autoActivate: this.hasAttribute('autoactivate'),
      })
    }

    disconnectedCallback(): void {
      this.teardown?.()
      this.teardown = null
      this.wired = false
    }
  }

  customElements.define('consent-pour', ConsentPour)
}

declare global {
  interface HTMLElementTagNameMap {
    'consent-pour': HTMLElement
  }
}
