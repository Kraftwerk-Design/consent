import * as CookieConsent from 'vanilla-cookieconsent'
import { analyticsCategoryId, getConsentConfig } from './config'
import { hasGpcSignal } from './gpc'

export function hasAnalyticsConsent(): boolean {
  if (hasGpcSignal()) return false

  return (
    CookieConsent.validConsent() &&
    CookieConsent.acceptedCategory(analyticsCategoryId())
  )
}

/** Open consent UI when a gated embed is activated without analytics consent. */
export function promptAnalyticsConsent(): void {
  if (!CookieConsent.validConsent()) {
    CookieConsent.show()
    return
  }

  CookieConsent.showPreferences()
}

/** Returns true when analytics is allowed; otherwise opens the consent UI. */
export function requireAnalyticsConsent(): boolean {
  if (hasAnalyticsConsent()) return true

  promptAnalyticsConsent()
  return false
}

export function dispatchAnalyticsConsentChange(): void {
  document.dispatchEvent(
    new CustomEvent(getConsentConfig().analyticsConsentEvent, {
      detail: { accepted: hasAnalyticsConsent() },
    }),
  )
}

/** Subscribe to analytics consent changes. Returns an unsubscribe function. */
export function onAnalyticsConsentChange(
  handler: (accepted: boolean) => void,
): () => void {
  const eventName = getConsentConfig().analyticsConsentEvent
  const listener = (event: Event) => {
    const accepted = (event as CustomEvent<{ accepted: boolean }>).detail
      ?.accepted
    handler(Boolean(accepted))
  }

  document.addEventListener(eventName, listener)
  return () => document.removeEventListener(eventName, listener)
}

/** Imperative consent API exposed on `window[windowNamespace]`. */
export interface ConsentApi {
  hasAnalyticsConsent: typeof hasAnalyticsConsent
  requireAnalyticsConsent: typeof requireAnalyticsConsent
  promptAnalyticsConsent: typeof promptAnalyticsConsent
  onAnalyticsConsentChange: typeof onAnalyticsConsentChange
}

declare global {
  interface Window {
    /** Default namespace; a project may rename it via `windowNamespace`. */
    KDConsent?: ConsentApi
  }
}

/** Delegated click gate for `[data-require-analytics]` links/buttons. */
function handleRequireAnalyticsClick(event: MouseEvent): void {
  const trigger = (event.target as Element | null)?.closest(
    '[data-require-analytics]',
  )

  if (!trigger) return
  if (hasAnalyticsConsent()) return

  event.preventDefault()
  event.stopPropagation()
  promptAnalyticsConsent()
}

let apiInitialized = false

/**
 * Register the global consent surface: the `window[windowNamespace]` API object
 * and the `[data-require-analytics]` click delegation. Called by `initConsent()`
 * — importing this module no longer has side effects, so the pure predicates can
 * be imported anywhere without wiring up globals. Idempotent.
 */
export function initConsentApi(): void {
  if (apiInitialized) return
  apiInitialized = true

  const namespace = getConsentConfig().windowNamespace
  const api: ConsentApi = {
    hasAnalyticsConsent,
    requireAnalyticsConsent,
    promptAnalyticsConsent,
    onAnalyticsConsentChange,
  }
  ;(window as unknown as Record<string, unknown>)[namespace] = api

  document.addEventListener('click', handleRequireAnalyticsClick, true)
}
