import { deepMerge } from './deepMerge'
import { defaultConsentConfig, type ConsentConfig } from './config.default'

export type { ConsentConfig } from './config.default'

let resolved: ConsentConfig = defaultConsentConfig

/**
 * Merge per-project overrides onto the defaults and store the result. Called
 * once by `initConsent()` before anything reads config. Arrays (categories,
 * autoClear cookies) replace rather than concatenate, so a project can define
 * its own category set cleanly; nested objects (guiOptions) deep-merge.
 */
export function configureConsent(
  overrides: Partial<ConsentConfig> = {},
): ConsentConfig {
  resolved = deepMerge(defaultConsentConfig, overrides)
  return resolved
}

/** The resolved consent config (defaults until `configureConsent` runs). */
export function getConsentConfig(): ConsentConfig {
  return resolved
}

/** Id of the consent-gated tracking category the gate helpers key off. */
export function analyticsCategoryId(): string {
  return (
    resolved.categories.find((category) => category.analytics)?.id ??
    'analytics'
  )
}
