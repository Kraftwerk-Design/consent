import type { ResolvedConfig } from '../config'
import type { AutoClearCookie, ConsentConfig } from '../config.default'

export type GpcState = 'none' | 'default-off' | 'locked'

/** Id of the category gate helpers target when a gate names none. */
export function defaultGateCategoryId(config: Readonly<ConsentConfig>): string {
  return config.gateCategory ?? 'analytics'
}

export function gpcState(signal: boolean, allowOverride: boolean): GpcState {
  if (!signal) return 'none'
  return allowOverride ? 'default-off' : 'locked'
}

/**
 * Category ids subject to the GPC clamp. If any category sets `gpc`, the set is
 * exactly the categories with `gpc: true`; otherwise it defaults to the default
 * gate category. readOnly categories are never clamped.
 */
export function gpcClampedCategoryIds(config: Readonly<ConsentConfig>): string[] {
  const anyGpcFlag = config.categories.some((category) => category.gpc !== undefined)
  const gateId = defaultGateCategoryId(config)
  return config.categories
    .filter((category) => !category.readOnly)
    .filter((category) => (anyGpcFlag ? category.gpc : category.id === gateId))
    .map((category) => category.id)
}

export interface RegisteredCategory {
  readonly enabled: boolean
  readonly readOnly: boolean
  readonly autoClear?: AutoClearCookie[]
}

/** Every GPC decision for one page load, derived once from config and GPC state. */
export interface CategoryPlan {
  readonly gpc: GpcState
  /** Every configured category id. */
  readonly ids: readonly string[]
  /**
   * What the library registers. Under the lock clamped categories are left
   * out, so no button or `acceptCategory()` call can release their scripts.
   * Under `default-off` they are registered but off by default.
   */
  readonly registered: Readonly<Record<string, RegisteredCategory>>
  /** autoClear cookies to erase on load: the clamped categories' under the lock. */
  readonly erase: readonly (string | RegExp)[]
  /** Effective consent per category for the library's current state. */
  effective(state: { recorded: boolean; accepted: readonly string[] }): Record<string, boolean>
  /** Keep off: the saved choice (or, before one, the defaults) minus the clamped categories. */
  keepOff(saved: readonly string[] | null): string[]
}

export function planCategories(config: ResolvedConfig, gpc: GpcState): CategoryPlan {
  const clamped = new Set(gpc === 'none' ? [] : gpcClampedCategoryIds(config))
  const registered: Record<string, RegisteredCategory> = {}
  const erase: (string | RegExp)[] = []

  for (const category of config.categories) {
    if (clamped.has(category.id) && gpc === 'locked') {
      erase.push(...(category.autoClear ?? []).map((cookie) => cookie.name))
      continue
    }
    registered[category.id] = {
      enabled: clamped.has(category.id) ? false : (category.enabled ?? false),
      readOnly: category.readOnly ?? false,
      ...(category.autoClear ? { autoClear: category.autoClear } : {}),
    }
  }

  const ids = config.categories.map((category) => category.id)

  return {
    gpc,
    ids,
    registered,
    erase,
    effective({ recorded, accepted }) {
      return Object.fromEntries(
        ids.map((id) => {
          const entry = registered[id]
          if (!entry) return [id, false]
          if (entry.readOnly) return [id, true]
          if (recorded) return [id, accepted.includes(id)]
          return [id, config.mode === 'opt-out' && entry.enabled]
        }),
      )
    },
    keepOff(saved) {
      if (saved) return saved.filter((id) => !clamped.has(id))
      return Object.keys(registered).filter(
        (id) => registered[id].enabled || registered[id].readOnly,
      )
    },
  }
}
