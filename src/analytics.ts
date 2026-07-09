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

  // In opt-out mode a default-enabled category counts as consented before the
  // visitor interacts — `validConsent()` stays false until a choice is saved,
  // but the category is already accepted (and its `text/plain` tags already
  // fire). Requiring `validConsent()` here would strand JS-gated embeds
  // (`<consent-embed autoactivate>`, `lite-youtube` consentReady) on their
  // opted-out placeholder while scripts track. Opt-in is unchanged.
  const validByDefault =
    CookieConsent.validConsent() || getConsentConfig().mode === 'opt-out'

  return validByDefault && CookieConsent.acceptedCategory(categoryId)
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

export function dispatchConsentChange(): void {
  const config = getConsentConfig()
  const categories: Record<string, boolean> = {}
  for (const category of config.categories) {
    categories[category.id] = hasConsent(category.id)
  }

  document.dispatchEvent(
    new CustomEvent(config.consentChangeEvent, {
      detail: { accepted: hasConsent(), categories },
    }),
  )
}

/**
 * Subscribe to consent changes. With `categoryId`, the handler receives that
 * category's state; without it, the default gate category's. Returns an
 * unsubscribe function.
 */
export function onConsentChange(
  handler: (accepted: boolean) => void,
  categoryId?: string,
): () => void {
  const eventName = getConsentConfig().consentChangeEvent
  const listener = (event: Event): void => {
    const detail = (
      event as CustomEvent<{
        accepted: boolean
        categories: Record<string, boolean>
      }>
    ).detail
    const accepted =
      categoryId === undefined
        ? detail?.accepted
        : detail?.categories?.[categoryId]
    handler(Boolean(accepted))
  }

  document.addEventListener(eventName, listener)
  return () => document.removeEventListener(eventName, listener)
}

/** Back-compat alias — the default gate category. */
export const onAnalyticsConsentChange = (
  handler: (accepted: boolean) => void,
): (() => void) => onConsentChange(handler)

/** Imperative consent API exposed on `window[windowNamespace]`. */
export interface ConsentApi {
  hasConsent: typeof hasConsent
  requireConsent: typeof requireConsent
  promptConsent: typeof promptConsent
  onConsentChange: typeof onConsentChange
  // Back-compat aliases (default gate category):
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

/** Delegated click gate for `[data-require-consent]` / `[data-require-analytics]`. */
function handleRequireConsentClick(event: MouseEvent): void {
  const trigger = (event.target as Element | null)?.closest<HTMLElement>(
    '[data-require-consent],[data-require-analytics]',
  )

  if (!trigger) return

  // `data-require-consent="functionality"` names a category; an empty value or
  // the legacy `data-require-analytics` attribute means the default category.
  const categoryId = trigger.dataset.requireConsent || defaultGateCategoryId()
  if (hasConsent(categoryId)) return

  event.preventDefault()
  event.stopPropagation()
  promptConsent(categoryId)
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
    hasConsent,
    requireConsent,
    promptConsent,
    onConsentChange,
    hasAnalyticsConsent,
    requireAnalyticsConsent,
    promptAnalyticsConsent,
    onAnalyticsConsentChange,
  }
  ;(window as unknown as Record<string, unknown>)[namespace] = api

  document.addEventListener('click', handleRequireConsentClick, true)
}
