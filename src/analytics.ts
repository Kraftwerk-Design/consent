import * as CookieConsent from 'vanilla-cookieconsent'
import {
  defaultGateCategoryId,
  isGpcClamped,
  getConsentConfig,
} from './config'
import { hasGpcSignal } from './gpc'

/**
 * Whether the given consent category is granted. GPC forces a *clamped*
 * category off (unless the visitor opted back in under `allowGpcOverride`);
 * unclamped categories are unaffected by GPC. Omit `categoryId` to check the
 * default gate category.
 */
export function hasConsent(
  categoryId: string = defaultGateCategoryId(),
): boolean {
  if (
    isGpcClamped(categoryId) &&
    hasGpcSignal() &&
    !getConsentConfig().allowGpcOverride
  ) {
    return false
  }

  return (
    CookieConsent.validConsent() && CookieConsent.acceptedCategory(categoryId)
  )
}

/** Open the consent UI when a gated thing is activated without consent. */
export function promptConsent(_categoryId?: string): void {
  if (!CookieConsent.validConsent()) {
    CookieConsent.show()
    return
  }

  CookieConsent.showPreferences()
}

/** True when the category is granted; otherwise opens the consent UI. */
export function requireConsent(
  categoryId: string = defaultGateCategoryId(),
): boolean {
  if (hasConsent(categoryId)) return true

  promptConsent(categoryId)
  return false
}

/** Back-compat aliases — the default gate category. */
export const hasAnalyticsConsent = (): boolean => hasConsent()
export const requireAnalyticsConsent = (): boolean => requireConsent()
export const promptAnalyticsConsent = (): void => promptConsent()

export function dispatchAnalyticsConsentChange(): void {
  document.dispatchEvent(
    new CustomEvent(getConsentConfig().consentChangeEvent, {
      detail: { accepted: hasAnalyticsConsent() },
    }),
  )
}

/** Subscribe to analytics consent changes. Returns an unsubscribe function. */
export function onAnalyticsConsentChange(
  handler: (accepted: boolean) => void,
): () => void {
  const eventName = getConsentConfig().consentChangeEvent
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
