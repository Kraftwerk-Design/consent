import { deepMerge } from './deepMerge'
import {
  defaultConsentConfig,
  type ConsentConfig,
} from './config.default'
import { defaultGateCategoryId, gpcClampedCategoryIds } from './core/categories'
import { RELOAD_POLICIES } from './core/reload'

export type { ConsentConfig } from './config.default'

/**
 * Config after merging `initConsent()` options over the defaults. A deeply
 * frozen copy; integrations are kept by reference.
 */
export type ResolvedConfig = Readonly<ConsentConfig>

/** Copy plain objects and arrays, then freeze the copies. Other values are kept. */
function frozenCopy<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy)) as T
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const copy = Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, frozenCopy(entry)]),
    )
    return Object.freeze(copy) as T
  }
  return value
}

/**
 * Merge per-project overrides onto the defaults. Arrays (categories, autoClear
 * cookies) replace rather than concatenate, so a project can define its own
 * category set cleanly; nested objects (guiOptions) deep-merge.
 */
export function resolveConfig(overrides: Partial<ConsentConfig> = {}): ResolvedConfig {
  const config = deepMerge(defaultConsentConfig, overrides)
  const { integrations, ...data } = config
  return Object.freeze({
    ...frozenCopy(data),
    integrations: Object.freeze([...integrations]),
  }) as ResolvedConfig
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

  // The default gate category must match a configured category, or
  // has()/require() permanently return false for it.
  const resolvedGateCategoryId = defaultGateCategoryId(config)
  if (!seenIds.has(resolvedGateCategoryId)) {
    warnings.push(
      `the resolved default gate category '${resolvedGateCategoryId}' does not match any configured category id — has()/require() will permanently return false for it.`,
    )
  }

  for (const category of config.categories) {
    if (!category.readOnly || !category.gpc) continue
    warnings.push(
      `category '${category.id}' is readOnly, so gpc: true has no effect — readOnly categories are never clamped.`,
    )
  }

  if (gpcClampedCategoryIds(config).length === 0) {
    warnings.push(
      'no configured category is subject to the GPC clamp — a Global Privacy Control signal turns nothing off. Set gpc: true on the tracking categories.',
    )
  }

  for (const integration of config.integrations) {
    for (const id of integration.categories) {
      if (seenIds.has(id)) continue
      warnings.push(
        `integration '${integration.name}' names unknown category '${id}' — it is never granted.`,
      )
    }
  }

  if ('reloadOnConsentChange' in config) {
    warnings.push(
      "reloadOnConsentChange was removed and is ignored — use reload: 'never', 'on-withdraw' (default) or 'on-change'.",
    )
  }

  if (!RELOAD_POLICIES.includes(config.reload)) {
    warnings.push(
      `reload must be one of ${RELOAD_POLICIES.map((policy) => `'${policy}'`).join(', ')} (got ${JSON.stringify(config.reload)}) — the page never reloads.`,
    )
  }

  const maxAgeDays = config.ageGate?.maxAgeDays
  if (maxAgeDays !== undefined && !(maxAgeDays > 0)) {
    warnings.push(
      `ageGate.maxAgeDays must be a positive number of days (got ${maxAgeDays}) — the age cookie would be deleted on write and the gate would return on the next page.`,
    )
  }

  return warnings
}
