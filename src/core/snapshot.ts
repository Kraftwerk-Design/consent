import type { ConsentConfig } from '../config.default'
import { gpcClampedCategoryIds } from '../config'

export type GpcState = 'none' | 'default-off' | 'locked'

/** Effective consent state. Also the `consent:change` event detail. */
export interface ConsentSnapshot {
  readonly stage: 'pending' | 'awaiting-age' | 'ready'
  /** A choice is saved in the consent cookie. */
  readonly recorded: boolean
  readonly gpc: GpcState
  /** Effective per category, GPC clamp applied. */
  readonly categories: Readonly<Record<string, boolean>>
}

export interface SnapshotInput {
  config: Readonly<ConsentConfig>
  ageOk: boolean
  gpc: GpcState
  recorded: boolean
  accepted: readonly string[]
}

export function gpcState(signal: boolean, allowOverride: boolean): GpcState {
  if (!signal) return 'none'
  return allowOverride ? 'default-off' : 'locked'
}

function allFalse(config: Readonly<ConsentConfig>): Record<string, boolean> {
  return Object.fromEntries(config.categories.map((category) => [category.id, false]))
}

function freeze(snapshot: ConsentSnapshot): ConsentSnapshot {
  Object.freeze(snapshot.categories)
  return Object.freeze(snapshot)
}

/** The snapshot before the library has reported any state. */
export function pendingSnapshot(
  config: Readonly<ConsentConfig>,
  gpc: GpcState,
): ConsentSnapshot {
  return freeze({ stage: 'pending', recorded: false, gpc, categories: allFalse(config) })
}

export function computeSnapshot({
  config,
  ageOk,
  gpc,
  recorded,
  accepted,
}: SnapshotInput): ConsentSnapshot {
  if (!ageOk) {
    return freeze({ stage: 'awaiting-age', recorded, gpc, categories: allFalse(config) })
  }

  const clamped = new Set(gpcClampedCategoryIds(config))
  const categories: Record<string, boolean> = {}
  for (const category of config.categories) {
    const { id } = category
    if (category.readOnly) {
      categories[id] = true
    } else if (recorded) {
      categories[id] = accepted.includes(id) && !(gpc === 'locked' && clamped.has(id))
    } else if (config.mode === 'opt-out') {
      categories[id] = (category.enabled ?? false) && !(gpc !== 'none' && clamped.has(id))
    } else {
      categories[id] = false
    }
  }

  return freeze({ stage: 'ready', recorded, gpc, categories })
}

export function snapshotsEqual(a: ConsentSnapshot, b: ConsentSnapshot): boolean {
  if (a.stage !== b.stage || a.recorded !== b.recorded || a.gpc !== b.gpc) return false
  const ids = Object.keys(a.categories)
  return (
    ids.length === Object.keys(b.categories).length &&
    ids.every((id) => a.categories[id] === b.categories[id])
  )
}
