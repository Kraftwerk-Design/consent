import { hasConsent } from './analytics'
import { getConsentConfig, isGpcClamped } from './config'
import type { ConsentCategory } from './config.default'
import { hasGpcSignal } from './gpc'

type ConsentSignalState = 'granted' | 'denied'

/**
 * True when GPC forces this category off by default. Independent of
 * `allowGpcOverride` — override governs the toggle/persistence, not the
 * default-off state — mirroring the `enabled` downgrade in run.ts
 * `buildCategories`. So the Consent Mode `default` signals `denied` for a GPC
 * visitor even under override; a saved opt-in later flips it via `update`.
 */
function gpcClampedOff(categoryId: string): boolean {
  return isGpcClamped(categoryId) && hasGpcSignal()
}

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
 * Direction is mode-aware via each category's `enabled` baseline: opt-out
 * categories (`enabled: true`) → granted; opt-in consent-gated categories
 * (`enabled: false`) → denied. GPC forces clamped signals denied regardless.
 */
export function pushGoogleConsentDefault(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().googleConsentMode) return
  const signals = computeSignals(
    (category) => (category.enabled ?? false) && !gpcClampedOff(category.id),
  )
  getGtag()('consent', 'default', { ...signals, wait_for_update: 500 })
}

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
