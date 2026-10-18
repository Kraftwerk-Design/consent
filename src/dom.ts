import type { AgeGateConfig } from './config.default'
import type { ConsentSnapshot } from './core/snapshot'

/** Imperative consent API exposed on `window.KDConsent`. */
export interface ConsentApi {
  has(category?: string): boolean
  require(category?: string): boolean
  prompt(category?: string): void
  confirmAge(opts?: AgeGateConfig): void
  getSnapshot(): ConsentSnapshot
}

declare global {
  interface Window {
    KDConsent?: ConsentApi
  }
}

/**
 * Expose `window.KDConsent` and gate clicks on `[data-require-consent]`
 * (a category id, or empty for the default gate category). Returns the teardown.
 */
export function installDom(api: ConsentApi): () => void {
  const onClick = (event: MouseEvent): void => {
    const trigger = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-require-consent]',
    )
    if (!trigger) return

    const categoryId = trigger.dataset.requireConsent || undefined
    if (api.has(categoryId)) return

    event.preventDefault()
    event.stopPropagation()
    api.prompt(categoryId)
  }

  window.KDConsent = api
  document.addEventListener('click', onClick, true)

  return () => {
    document.removeEventListener('click', onClick, true)
    if (window.KDConsent === api) delete window.KDConsent
  }
}
