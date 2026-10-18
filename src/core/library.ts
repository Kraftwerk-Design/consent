import * as CookieConsent from 'vanilla-cookieconsent'
import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { buildEnglishCopy } from '../copy/en'
import { gpcClampedCategoryIds, type ResolvedConfig } from '../config'
import type { GpcState } from './snapshot'

type Categories = NonNullable<CookieConsentConfig['categories']>

/**
 * Build the vanilla-cookieconsent category map from config. Under the GPC lock
 * clamped categories are left out: the library then never collects their
 * scripts, no button or `acceptCategory()` call can release them, and their
 * preferences section renders without a toggle. Under `default-off` they are
 * registered but off by default.
 */
export function buildCategories(config: ResolvedConfig, gpc: GpcState): Categories {
  const clampedIds = gpcClampedCategoryIds(config)
  const categories: Categories = {}

  for (const category of config.categories) {
    const clamped = gpc !== 'none' && clampedIds.includes(category.id)
    if (clamped && gpc === 'locked') continue

    categories[category.id] = {
      enabled: clamped ? false : (category.enabled ?? false),
      readOnly: category.readOnly ?? false,
      ...(category.autoClear
        ? { autoClear: { cookies: category.autoClear } }
        : {}),
    }
  }

  return categories
}

/** Erase the autoClear cookies of categories the lock keeps unregistered. */
function eraseClampedCookies(config: ResolvedConfig): void {
  const clampedIds = gpcClampedCategoryIds(config)
  for (const category of config.categories) {
    if (!clampedIds.includes(category.id) || !category.autoClear) continue
    CookieConsent.eraseCookies(category.autoClear.map((cookie) => cookie.name))
  }
}

/**
 * Keep off: the library's own click listener on the banner's necessary button
 * accepts necessary only and can't be removed, so intercept the click before
 * it. Save the current choice (or, before one, the registered defaults) minus
 * the clamped categories, which are off by default under `default-off`.
 */
function interceptKeepOff(
  config: ResolvedConfig,
  modal: HTMLElement,
  categories: Categories,
): void {
  const clampedIds = gpcClampedCategoryIds(config)
  const defaults = Object.keys(categories).filter(
    (id) => categories[id].enabled || categories[id].readOnly,
  )
  modal.addEventListener(
    'click',
    (event) => {
      if (!(event.target as Element).closest('[data-role="necessary"]')) return
      event.stopPropagation()
      const keep = CookieConsent.validConsent()
        ? CookieConsent.getUserPreferences().acceptedCategories.filter(
            (id) => !clampedIds.includes(id),
          )
        : defaults
      CookieConsent.hide()
      CookieConsent.acceptCategory(keep)
    },
    true,
  )
}

export interface LibraryCallbacks {
  /** `onFirstConsent` / `onChange`: the visitor made a choice. */
  choice(): void
  /** `onConsent` and the resolved `run()`. */
  load(): void
}

/**
 * Run the banner for `config`. The cookie is loaded synchronously, before
 * `run()`'s first await, so {@link readState} is current once this returns.
 */
export function runLibrary(
  config: ResolvedConfig,
  gpc: GpcState,
  on: LibraryCallbacks,
): Promise<void> {
  const categories = buildCategories(config, gpc)

  const running = CookieConsent.run({
    mode: config.mode,

    cookie: {
      name: config.cookieName,
    },

    guiOptions: config.guiOptions,

    categories,

    onFirstConsent: () => on.choice(),

    onConsent: () => on.load(),

    onChange: () => on.choice(),

    onModalReady: ({ modalName, modal }) => {
      if (modalName === 'consentModal' && gpc === 'default-off') {
        interceptKeepOff(config, modal, categories)
      }
    },

    language: (config.buildCopy ?? buildEnglishCopy)({ gpc, mode: config.mode }),
  })
  if (gpc === 'locked') eraseClampedCookies(config)

  return running.then(() => on.load())
}

export function readState(): { recorded: boolean; accepted: string[] } {
  return {
    recorded: CookieConsent.validConsent(),
    accepted: CookieConsent.getUserPreferences().acceptedCategories,
  }
}

/** The banner before a choice, the preferences after one. */
export function showConsentUi(): void {
  if (!CookieConsent.validConsent()) {
    CookieConsent.show()
    return
  }

  CookieConsent.showPreferences()
}

/** Remove the library's DOM and tracked listeners; the consent cookie stays. */
export function resetLibrary(): void {
  CookieConsent.reset(false)
}
