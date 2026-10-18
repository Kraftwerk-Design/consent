import type { ConsentSnapshot } from './snapshot'

export const RELOAD_POLICIES = ['never', 'on-withdraw', 'on-change'] as const

/** When a visitor's choice reloads the page. */
export type ReloadPolicy = (typeof RELOAD_POLICIES)[number]

/**
 * Whether a refresh from `prev` to `next` reloads the page. Only a visitor's
 * choice on a ready page reloads: never on load or after `confirmAge()`.
 * `recorded`-only changes never reload.
 */
export function shouldReload(
  prev: ConsentSnapshot,
  next: ConsentSnapshot,
  policy: ReloadPolicy,
  cause: 'load' | 'choice',
): boolean {
  if (cause !== 'choice' || prev.stage !== 'ready') return false
  const ids = Object.keys(prev.categories)
  if (policy === 'on-withdraw') return ids.some((id) => prev.categories[id] && !next.categories[id])
  if (policy === 'on-change') return ids.some((id) => prev.categories[id] !== next.categories[id])
  return false
}

export function reloadPage(): void {
  window.location.reload()
}
