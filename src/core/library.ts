import * as CookieConsent from 'vanilla-cookieconsent'
import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { buildEnglishCopy } from '../copy/en'
import type { ResolvedConfig } from '../config'
import type { CategoryPlan } from './categories'

type Categories = NonNullable<CookieConsentConfig['categories']>

function libraryCategories(plan: CategoryPlan): Categories {
  return Object.fromEntries(
    Object.entries(plan.registered).map(([id, { enabled, readOnly, autoClear }]) => [
      id,
      { enabled, readOnly, ...(autoClear ? { autoClear: { cookies: autoClear } } : {}) },
    ]),
  )
}

/**
 * Keep off: the library's own click listener on the banner's necessary button
 * accepts necessary only and can't be removed, so intercept the click before it.
 */
function interceptKeepOff(modal: HTMLElement, plan: CategoryPlan): void {
  modal.addEventListener(
    'click',
    (event) => {
      if (!(event.target as Element).closest('[data-role="necessary"]')) return
      event.stopPropagation()
      const keep = plan.keepOff(
        CookieConsent.validConsent()
          ? CookieConsent.getUserPreferences().acceptedCategories
          : null,
      )
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
  plan: CategoryPlan,
  on: LibraryCallbacks,
): Promise<void> {
  const { gpc } = plan

  const running = CookieConsent.run({
    mode: config.mode,

    cookie: {
      name: config.cookieName,
    },

    guiOptions: config.guiOptions,

    categories: libraryCategories(plan),

    onFirstConsent: () => on.choice(),

    onConsent: () => on.load(),

    onChange: () => on.choice(),

    onModalReady: ({ modalName, modal }) => {
      if (modalName === 'consentModal' && gpc === 'default-off') {
        interceptKeepOff(modal, plan)
      }
    },

    language: (config.buildCopy ?? buildEnglishCopy)({ gpc, mode: config.mode }),
  })
  CookieConsent.eraseCookies([...plan.erase])

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
