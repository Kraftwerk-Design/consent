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

/** Id of the category gate helpers target when a gate names none. */
export function defaultGateCategoryId(): string {
  return (
    resolved.gateCategory ??
    resolved.categories.find((category) => category.analytics)?.id ??
    'analytics'
  )
}

/**
 * Category ids subject to the GPC clamp. If any category sets `gpc`, the set is
 * exactly the categories with `gpc: true`; otherwise it defaults to the default
 * gate category (the `analytics` one).
 */
export function gpcClampedCategoryIds(): string[] {
  const anyGpcFlag = resolved.categories.some(
    (category) => category.gpc !== undefined,
  )
  if (anyGpcFlag) {
    return resolved.categories
      .filter((category) => category.gpc)
      .map((category) => category.id)
  }
  return [defaultGateCategoryId()]
}

/** Whether a category is subject to the GPC clamp. */
export function isGpcClamped(categoryId: string): boolean {
  return gpcClampedCategoryIds().includes(categoryId)
}
