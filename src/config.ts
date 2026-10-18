import { deepMerge } from './deepMerge'
import { AGE_GATE_COOKIE } from './ageGate'
import {
  defaultConsentConfig,
  type AgeGateConfig,
  type ConsentConfig,
} from './config.default'
import { RELOAD_POLICIES } from './core/reload'

export type { ConsentConfig } from './config.default'

/**
 * Config after merging `initConsent()` options over the defaults. A deeply
 * frozen copy; `ageGate.cookieName` is filled in. Integrations are kept by
 * reference.
 */
export type ResolvedConfig = Readonly<
  Omit<ConsentConfig, 'ageGate'> & {
    ageGate?: Readonly<AgeGateConfig & { cookieName: string }>
  }
>

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
  if (config.ageGate) {
    config.ageGate = { ...config.ageGate, cookieName: config.ageGate.cookieName ?? AGE_GATE_COOKIE }
  }
  const { integrations, ...data } = config
  return Object.freeze({
    ...frozenCopy(data),
    integrations: Object.freeze([...integrations]),
  }) as ResolvedConfig
}

let resolved: ResolvedConfig = resolveConfig()

/**
 * Resolve and store the active config. Called once by the controller at init.
 *
 * Runs the resolved config through {@link validateConsentConfig} and
 * `console.warn`s any issues — never throws, so a misconfigured project keeps
 * running rather than crashing on load.
 */
export function configureConsent(
  overrides: Partial<ConsentConfig> = {},
): ResolvedConfig {
  resolved = resolveConfig(overrides)

  for (const warning of validateConsentConfig(resolved)) {
    console.warn('[consent] ' + warning)
  }

  return resolved
}

/** The active consent config (defaults until `configureConsent` runs). */
export function getConsentConfig(): ResolvedConfig {
  return resolved
}

/** Back to the defaults, when the controller is destroyed. */
export function resetConsentConfig(): void {
  resolved = resolveConfig()
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

  const clampable = new Set(
    config.categories.filter((category) => !category.readOnly).map((category) => category.id),
  )
  if (!gpcClampedCategoryIds(config).some((id) => clampable.has(id))) {
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

/** Id of the category gate helpers target when a gate names none. */
export function defaultGateCategoryId(
  config: Readonly<ConsentConfig> = resolved,
): string {
  return config.gateCategory ?? 'analytics'
}

/**
 * Category ids subject to the GPC clamp. If any category sets `gpc`, the set is
 * exactly the categories with `gpc: true`; otherwise it defaults to the default
 * gate category.
 */
export function gpcClampedCategoryIds(
  config: Readonly<ConsentConfig> = resolved,
): string[] {
  const anyGpcFlag = config.categories.some(
    (category) => category.gpc !== undefined,
  )
  if (anyGpcFlag) {
    return config.categories
      .filter((category) => category.gpc)
      .map((category) => category.id)
  }
  return [defaultGateCategoryId(config)]
}

/** Whether a category is subject to the GPC clamp. */
export function isGpcClamped(categoryId: string): boolean {
  return gpcClampedCategoryIds().includes(categoryId)
}
