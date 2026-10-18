import type { CategoryPlan, GpcState } from './categories'

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
  plan: CategoryPlan
  ageOk: boolean
  recorded: boolean
  accepted: readonly string[]
}

function allFalse(plan: CategoryPlan): Record<string, boolean> {
  return Object.fromEntries(plan.ids.map((id) => [id, false]))
}

function freeze(snapshot: ConsentSnapshot): ConsentSnapshot {
  Object.freeze(snapshot.categories)
  return Object.freeze(snapshot)
}

/** The snapshot before the library has reported any state. */
export function pendingSnapshot(plan: CategoryPlan): ConsentSnapshot {
  return freeze({ stage: 'pending', recorded: false, gpc: plan.gpc, categories: allFalse(plan) })
}

export function computeSnapshot({ plan, ageOk, recorded, accepted }: SnapshotInput): ConsentSnapshot {
  const { gpc } = plan
  if (!ageOk) {
    return freeze({ stage: 'awaiting-age', recorded, gpc, categories: allFalse(plan) })
  }
  return freeze({ stage: 'ready', recorded, gpc, categories: plan.effective({ recorded, accepted }) })
}

export function snapshotsEqual(a: ConsentSnapshot, b: ConsentSnapshot): boolean {
  if (a.stage !== b.stage || a.recorded !== b.recorded || a.gpc !== b.gpc) return false
  const ids = Object.keys(a.categories)
  return (
    ids.length === Object.keys(b.categories).length &&
    ids.every((id) => a.categories[id] === b.categories[id])
  )
}
