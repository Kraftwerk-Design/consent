import { deepMerge } from './deepMerge'
import { defaultConsentConfig, type ConsentConfig } from './config.default'
import { hasGpcSignal } from './gpc'

export type { ConsentConfig } from './config.default'

let resolved: ConsentConfig = defaultConsentConfig

/**
 * Merge per-project overrides onto the defaults and store the result. Called
 * once by `initConsent()` before anything reads config. Arrays (categories,
 * autoClear cookies) replace rather than concatenate, so a project can define
 * its own category set cleanly; nested objects (guiOptions) deep-merge.
 *
 * Runs the resolved config through {@link validateConsentConfig} and
 * `console.warn`s any issues — never throws, so a misconfigured project keeps
 * running rather than crashing on load.
 */
export function configureConsent(
  overrides: Partial<ConsentConfig> = {},
): ConsentConfig {
  resolved = deepMerge(defaultConsentConfig, overrides)

  for (const warning of validateConsentConfig(resolved)) {
    console.warn('[consent] ' + warning)
  }

  return resolved
}

/** The resolved consent config (defaults until `configureConsent` runs). */
export function getConsentConfig(): Readonly<ConsentConfig> {
  return resolved
}

/**
 * Pure config sanity checks — catches footguns that would otherwise fail
 * silently at runtime (a gate that always returns false, signals nobody ever
 * sends). Returns human-readable warning strings; empty when the config is
 * clean. Never throws.
 */
export function validateConsentConfig(config: ConsentConfig): string[] {
  const warnings: string[] = []

  // Duplicate category ids — later entries silently shadow earlier ones.
  const seenIds = new Set<string>()
  const duplicateIds = new Set<string>()
  for (const category of config.categories) {
    if (seenIds.has(category.id)) duplicateIds.add(category.id)
    seenIds.add(category.id)
  }
  for (const id of duplicateIds) {
    warnings.push(
      `duplicate category id '${id}' — later entries overwrite earlier ones.`,
    )
  }

  // More than one category flagged analytics: true — only one can be "the"
  // gate helpers' default target.
  const analyticsCategories = config.categories.filter(
    (category) => category.analytics,
  )
  if (analyticsCategories.length > 1) {
    warnings.push(
      `multiple categories are flagged analytics: true (${analyticsCategories
        .map((category) => category.id)
        .join(', ')}) — only one should be; the gate helpers' default target is ambiguous.`,
    )
  }

  // The resolved default gate category id (explicit gateCategory, else the
  // analytics-flagged category, else the literal 'analytics' id) must match a
  // configured category, or hasConsent()/requireConsent() permanently return
  // false for it.
  const resolvedGateCategoryId =
    config.gateCategory ?? analyticsCategories[0]?.id ?? 'analytics'
  const gateCategoryExists = config.categories.some(
    (category) => category.id === resolvedGateCategoryId,
  )
  if (!gateCategoryExists) {
    warnings.push(
      `the resolved default gate category '${resolvedGateCategoryId}' does not match any configured category id — hasConsent()/requireConsent() will permanently return false for it.`,
    )
  }

  // Google Consent Mode signals configured but the signaling itself is off.
  if (!config.googleConsentMode) {
    for (const category of config.categories) {
      if (category.google && category.google.length > 0) {
        warnings.push(
          `category '${category.id}' declares google signals but googleConsentMode is false — they will never be pushed.`,
        )
      }
    }
  }

  // Meta Pixel grant configured but the signaling itself is off.
  if (!config.metaPixelConsentMode) {
    for (const category of config.categories) {
      if (category.meta) {
        warnings.push(
          `category '${category.id}' sets meta: true but metaPixelConsentMode is false — the Meta Pixel consent signal will never be sent.`,
        )
      }
    }
  }

  return warnings
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
 * gate category.
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

/**
 * True when GPC forces this category off by default. Independent of
 * `allowGpcOverride` — override governs the toggle/persistence, not the
 * default-off state — mirroring the `enabled` downgrade in run.ts
 * `buildCategories`. Consumed by both consent-mode modules.
 */
export function gpcClampedOff(categoryId: string): boolean {
  return isGpcClamped(categoryId) && hasGpcSignal()
}
