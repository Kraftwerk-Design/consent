export const RELOAD_POLICIES = ['never', 'on-withdraw', 'on-change'] as const

/** When a visitor's choice reloads the page. */
export type ReloadPolicy = (typeof RELOAD_POLICIES)[number]

export function reloadPage(): void {
  window.location.reload()
}
