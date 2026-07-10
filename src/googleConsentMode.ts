import { hasConsent } from './analytics'
import { getConsentConfig, gpcClampedOff } from './config'
import type { ConsentCategory } from './config.default'

type ConsentSignalState = 'granted' | 'denied'

/**
 * Build the managed-signal map. `granted` decides, per category, whether that
 * category counts as granted for the command being built. A signal is
 * `'granted'` if ANY category that maps it is granted, else `'denied'`.
 * Signals no category maps are omitted (unmanaged).
 */
export function computeSignals(
  granted: (category: ConsentCategory) => boolean,
): Record<string, ConsentSignalState> {
  const signals: Record<string, ConsentSignalState> = {}
  for (const category of getConsentConfig().categories) {
    if (!category.google) continue
    const state: ConsentSignalState = granted(category) ? 'granted' : 'denied'
    for (const signal of category.google) {
      if (signals[signal] === 'granted') continue // OR across categories
      signals[signal] = state
    }
  }
  return signals
}

/** Reuse the page's dataLayer/gtag; define a gtag shim only if absent. */
export function getGtag(): (...args: unknown[]) => void {
  const w = window as unknown as {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  w.dataLayer = w.dataLayer || []
  if (typeof w.gtag !== 'function') {
    // Push the real `arguments` object — GTM only treats that form as a gtag
    // command, not a plain array.
    w.gtag = function gtag() {
      w.dataLayer!.push(arguments)
    }
  }
  return w.gtag
}

/**
 * Push the Consent Mode `default` command once, at init, before GTM reads it.
 *
 * Denied-by-default: consent-gated signals start `denied` and `readOnly`
 * (necessary) signals `granted`, regardless of mode, cookie, or GPC. The only
 * flips that can follow are `denied → granted` (the safe direction), never
 * `granted → denied`. This mirrors the static `<head>` snippet
 * ({@link renderGoogleConsentDefaultScript}) exactly, so the two never diverge.
 *
 * A returning visitor's real choice, and a fresh opt-out visitor's granted
 * baseline, are applied afterward as an `update` — see
 * {@link pushGoogleConsentUpdate} / {@link pushGoogleConsentBaselineUpdate}.
 */
export function pushGoogleConsentDefault(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().googleConsentMode) return
  const signals = computeSignals((category) => category.readOnly ?? false)
  getGtag()('consent', 'default', { ...signals, wait_for_update: 500 })
}

/**
 * Push the mode-baseline as an `update`, for a *fresh* visitor with no recorded
 * choice. In opt-out this upgrades enabled categories `denied → granted`
 * (consent-by-default), closing the gap left by the denied `default`; in opt-in
 * it re-states the denied baseline (a harmless no-op against the default). GPC
 * still forces clamped categories `denied` (via {@link gpcClampedOff}).
 *
 * A returning visitor goes through {@link pushGoogleConsentUpdate} instead —
 * never this — so a saved opt-out is honored.
 */
export function pushGoogleConsentBaselineUpdate(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().googleConsentMode) return
  const signals = computeSignals(
    (category) =>
      (category.readOnly ?? false) ||
      ((category.enabled ?? false) && !gpcClampedOff(category.id)),
  )
  getGtag()('consent', 'update', signals)
}

/**
 * The synchronous Consent Mode `default` script to inline in `<head>` **above**
 * an *unblocked* Google tag/GTM container (Model B), solving the race where the
 * init-time default (inside the deferred bundle) runs after the tag.
 *
 * It is a **static** snippet — denied-by-default with `wait_for_update: 500`,
 * Google's own canonical baseline. It carries **no config**: nothing to
 * duplicate from `consent.config`, hand-edit, or regenerate. The race is solved
 * by construction — nothing starts granted, so the only flips are the safe
 * `denied → granted` ones the deferred bundle pushes as an `update`. Returning
 * granted visitors upgrade once the bundle runs (held by `wait_for_update`).
 *
 * If your Google tag is `type="text/plain"` and released by this bundle
 * (Model A), you do **not** need this at all — the bundle sets the default
 * before it releases the tag, so the tag can never fire early.
 *
 * Returns `''` when `googleConsentMode` is off.
 */
export function renderGoogleConsentDefaultScript(): string {
  if (!getConsentConfig().googleConsentMode) return ''
  return DEFAULT_HEAD_SCRIPT
}

/**
 * Google's canonical denied-by-default baseline. `readOnly` (necessary) signals
 * granted, consent-gated signals denied — matching the shipped default config.
 * Denying is always the safe side, so this stays correct even for sites that
 * remap signals: the worst case is a necessary feature waiting for the bundle.
 */
const DEFAULT_HEAD_SCRIPT = `<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('consent', 'default', {
    security_storage: 'granted',
    functionality_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });
</script>`

/**
 * Push the Consent Mode `update` command on every consent change. Derives from
 * `hasConsent` (a real recorded choice), which already honors the GPC clamp.
 */
export function pushGoogleConsentUpdate(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().googleConsentMode) return
  const signals = computeSignals((category) => hasConsent(category.id))
  getGtag()('consent', 'update', signals)
}
