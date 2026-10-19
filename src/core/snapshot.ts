import type { CategoryPlan, GpcState } from './categories'
import type { ChangeCause, LibrarySession } from './library'
import type { ReloadPolicy } from './reload'

/** Effective consent state. Also the `consent:change` event detail. */
export interface ConsentSnapshot {
  readonly stage: 'pending' | 'awaiting-age' | 'ready'
  /** A choice is saved in the consent cookie. */
  readonly recorded: boolean
  readonly gpc: GpcState
  /** Effective per category, GPC clamp applied. */
  readonly categories: Readonly<Record<string, boolean>>
}

/** A distinct move from one snapshot to the next. */
export interface Change {
  readonly next: ConsentSnapshot
  /** On the first change, the snapshot before the library reported (`pending` or `awaiting-age`). */
  readonly prev: ConsentSnapshot
  readonly first: boolean
  /** The reload policy reloads the page: only on a visitor's choice after the first change. */
  readonly reload: boolean
}

/** The current snapshot for one page load. */
export interface SnapshotStore {
  /**
   * Same reference until it changes. Reads the library live once attached, so
   * scripts it releases before its callbacks fire already see the new state.
   */
  current(): ConsentSnapshot
  /** Read the library's state from now on. Returns the detach, after which `current()` keeps its last snapshot. */
  attach(read: LibrarySession['read']): () => void
  /** The change since the last commit, or null when there is none. */
  commit(cause: ChangeCause): Change | null
}

function freeze(snapshot: ConsentSnapshot): ConsentSnapshot {
  Object.freeze(snapshot.categories)
  return Object.freeze(snapshot)
}

function equal(a: ConsentSnapshot, b: ConsentSnapshot): boolean {
  if (a.stage !== b.stage || a.recorded !== b.recorded || a.gpc !== b.gpc) return false
  const ids = Object.keys(a.categories)
  return (
    ids.length === Object.keys(b.categories).length &&
    ids.every((id) => a.categories[id] === b.categories[id])
  )
}

function reloads(prev: ConsentSnapshot, next: ConsentSnapshot, policy: ReloadPolicy): boolean {
  const ids = Object.keys(prev.categories)
  if (policy === 'on-withdraw') return ids.some((id) => prev.categories[id] && !next.categories[id])
  if (policy === 'on-change') return ids.some((id) => prev.categories[id] !== next.categories[id])
  return false
}

/**
 * Start at `pending`, or `awaiting-age` while the age gate is open; the
 * library only runs after the pass, so an attached store is always `ready`.
 */
export function createSnapshotStore({
  plan,
  reload,
  awaitingAge,
}: {
  plan: CategoryPlan
  reload: ReloadPolicy
  awaitingAge: boolean
}): SnapshotStore {
  const { gpc } = plan
  const initial = freeze({
    stage: awaitingAge ? 'awaiting-age' : 'pending',
    recorded: false,
    gpc,
    categories: Object.fromEntries(plan.ids.map((id) => [id, false])),
  })
  let read: LibrarySession['read'] | null = null
  let latest = initial
  let applied = initial

  const current = (): ConsentSnapshot => {
    if (!read) return latest
    const { recorded, accepted } = read()
    const live = freeze({
      stage: 'ready',
      recorded,
      gpc,
      categories: plan.effective({ recorded, accepted }),
    })
    if (!equal(latest, live)) latest = live
    return latest
  }

  return {
    current,
    attach(reader) {
      read = reader
      return () => {
        if (read === reader) read = null
      }
    },
    commit(cause) {
      const next = current()
      const prev = applied
      if (equal(prev, next)) return null
      applied = next
      return {
        next,
        prev,
        first: prev === initial,
        reload: cause === 'choice' && prev.stage === 'ready' && reloads(prev, next, reload),
      }
    },
  }
}
