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

export type ChangeCause = 'load' | 'choice'

/** One run of the banner. */
export interface LibrarySession {
  /** Settles when `run()` does; stays pending after {@link LibrarySession.reset}. */
  readonly ready: Promise<void>
  /** The library's consent state. The cookie loads before `run()`'s first await, so this is current from the start. */
  read(): { recorded: boolean; accepted: string[] }
  /** The banner before a choice, the preferences after one. */
  show(): void
  /** Remove the library's DOM and tracked listeners; the consent cookie stays. */
  reset(): void
}

/**
 * Run the banner for `config`. `onChanged` gets `'load'` once when `run()`
 * resolves and `'choice'` on each visitor choice, possibly more than once per
 * choice. `onConsent` is ignored: it only repeats one of those.
 */
export function startLibrary(
  config: ResolvedConfig,
  plan: CategoryPlan,
  onChanged: (cause: ChangeCause) => void,
): LibrarySession {
  const { gpc } = plan
  let reset = false

  const running = CookieConsent.run({
    mode: config.mode,

    cookie: {
      name: config.cookieName,
    },

    guiOptions: config.guiOptions,

    categories: libraryCategories(plan),

    onFirstConsent: () => onChanged('choice'),

    onChange: () => onChanged('choice'),

    onModalReady: ({ modalName, modal }) => {
      if (modalName === 'consentModal' && gpc === 'default-off') {
        interceptKeepOff(modal, plan)
      }
    },

    language: (config.buildCopy ?? buildEnglishCopy)({
      gpc,
      mode: config.mode,
      categories: config.categories,
      privacyPolicyUrl: config.privacyPolicyUrl,
    }),
  })
  CookieConsent.eraseCookies([...plan.erase])

  const pending = new Promise<void>(() => {})
  const ready = running.then(
    () => (reset ? pending : onChanged('load')),
    // A run() still in flight fails once reset() tears the library down.
    (error) => (reset ? pending : Promise.reject(error)),
  )

  return {
    ready,
    read: () => ({
      recorded: CookieConsent.validConsent(),
      accepted: CookieConsent.getUserPreferences().acceptedCategories,
    }),
    show() {
      if (!CookieConsent.validConsent()) {
        CookieConsent.show()
        return
      }
      CookieConsent.showPreferences()
    },
    reset() {
      if (reset) return
      reset = true
      CookieConsent.reset(false)
    },
  }
}
