import { hasAnalyticsConsent } from '../analytics'
import { setupConsentGate, hide, show } from '../gate'

/**
 * Register `<consent-embed>` — gates a third-party embed behind analytics
 * consent. Idempotent; call after `configureConsent()`.
 *
 * The real embed lives in a `<template>` (inert: no iframe fetch, no script
 * run) and is stamped into the element's **light DOM** only once consent is
 * present — light DOM so third-party embed SDKs (Google Maps, Twitter/X,
 * Instagram, …) can find and hydrate it. An optional `[data-poster]` child is
 * the placeholder / click-to-load affordance.
 *
 *   <consent-embed>
 *     <button data-poster>Show map</button>
 *     <template><iframe src="https://www.google.com/maps/embed?…"></iframe></template>
 *   </consent-embed>
 *
 * Add `autoactivate` to load automatically when consent is already present
 * instead of waiting for a click. YouTube/Vimeo use their own facades, not this.
 *
 * The element class is defined lazily inside this function (not at module top
 * level) so importing the module never references `HTMLElement` — the package
 * stays safe to import in Node/SSR environments.
 */
export function defineConsentEmbed(): void {
  if (typeof customElements === 'undefined') return
  if (customElements.get('consent-embed')) return

  class ConsentEmbed extends HTMLElement {
    private wired = false

    connectedCallback(): void {
      if (this.wired) return
      this.wired = true

      const template = this.querySelector('template')
      const poster = this.querySelector<HTMLElement>('[data-poster]')
      let content: HTMLElement | null = null

      const activate = (): boolean => {
        if (!hasAnalyticsConsent() || !template) return false

        if (!content) {
          content = document.createElement('div')
          content.dataset.consentEmbedContent = ''

          const fragment = template.content.cloneNode(true) as DocumentFragment
          // Scripts cloned from a <template> are inert; re-create them so the
          // embed SDK actually executes when inserted.
          fragment.querySelectorAll('script').forEach((original) => {
            const script = document.createElement('script')
            for (const attr of original.attributes) {
              script.setAttribute(attr.name, attr.value)
            }
            script.textContent = original.textContent
            original.replaceWith(script)
          })

          content.append(fragment)
          this.append(content) // light DOM → embed SDKs can hydrate it
        }

        hide(poster)
        return true
      }

      const deactivate = (): void => {
        content?.remove()
        content = null
        show(poster)
      }

      setupConsentGate({
        activate,
        deactivate,
        triggers: [poster],
        autoActivate: this.hasAttribute('autoactivate'),
      })
    }
  }

  customElements.define('consent-embed', ConsentEmbed)
}

declare global {
  interface HTMLElementTagNameMap {
    'consent-embed': HTMLElement
  }
}
