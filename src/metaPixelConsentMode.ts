import { hasConsent } from './analytics'
import { getConsentConfig, gpcClampedOff } from './config'
import type { ConsentCategory } from './config.default'

/**
 * The page's `fbq` if it is already a function, else a no-op. Deliberately does
 * NOT synthesize an `fbq` stub: the Meta base snippet self-guards with
 * `if (f.fbq) return`, so any stub we define would suppress pixel init. The
 * pixel base code must therefore load before initConsent().
 */
export function getFbq(): (...args: unknown[]) => void {
  const w = window as unknown as { fbq?: (...args: unknown[]) => void }
  return typeof w.fbq === 'function' ? w.fbq : () => {}
}

/**
 * True if ANY `meta`-flagged category counts as granted under `granted`.
 * Categories without `meta` are ignored (the pixel is binary — one OR'd state).
 */
export function computeMetaPixelGranted(
  granted: (category: ConsentCategory) => boolean,
): boolean {
  return getConsentConfig().categories.some(
    (category) => category.meta && granted(category),
  )
}

/**
 * Apply the binary pixel state, mode-aware:
 * - granted            → grant (+ clear LDU in opt-out)
 * - not granted, opt-in→ revoke
 * - not granted, opt-out→ LDU + revoke (held everywhere; limited where Meta
 *   geolocates a covered US state). opt-in never emits dataProcessingOptions.
 */
export function applyMetaPixelState(granted: boolean): void {
  const fbq = getFbq()
  const optOut = getConsentConfig().mode === 'opt-out'
  if (granted) {
    fbq('consent', 'grant')
    if (optOut) fbq('dataProcessingOptions', [])
  } else if (optOut) {
    fbq('dataProcessingOptions', ['LDU'], 0, 0)
    fbq('consent', 'revoke')
  } else {
    fbq('consent', 'revoke')
  }
}

/**
 * Best-effort default at init (before CookieConsent.run initializes
 * acceptedCategory), from the `enabled` baseline minus any GPC clamp — mirrors
 * pushGoogleConsentDefault. The authoritative page-load state is the consumer's
 * inline `<head>` snippet (see README); this only bites if the pixel base code
 * is itself deferred past initConsent().
 */
export function pushMetaPixelConsentDefault(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().metaPixelConsentMode) return
  const granted = computeMetaPixelGranted(
    (category) => (category.enabled ?? false) && !gpcClampedOff(category.id),
  )
  applyMetaPixelState(granted)
}

/**
 * Update on a recorded consent change, derived from hasConsent (which honors the
 * GPC clamp). Pushed wherever the library dispatches its consent-change event.
 */
export function pushMetaPixelConsentUpdate(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().metaPixelConsentMode) return
  const granted = computeMetaPixelGranted((category) => hasConsent(category.id))
  applyMetaPixelState(granted)
}
