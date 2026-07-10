import * as CookieConsent from 'vanilla-cookieconsent'
import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { dispatchConsentChange } from './analytics'
import { buildEnglishCopy } from './copy/en'
import {
  gpcClampedCategoryIds,
  isGpcClamped,
  getConsentConfig,
} from './config'
import { hasGpcSignal } from './gpc'
import {
  pushGoogleConsentDefault,
  pushGoogleConsentUpdate,
} from './googleConsentMode'
import {
  pushMetaPixelConsentDefault,
  pushMetaPixelConsentUpdate,
} from './metaPixelConsentMode'

function isGpcCompliant(): boolean {
  if (!CookieConsent.validConsent()) return false
  return gpcClampedCategoryIds().every(
    (id) => !CookieConsent.acceptedCategory(id),
  )
}

/** Apply necessary-only consent for GPC (no reload). */
function applyGpcIfNeeded(): void {
  if (!hasGpcSignal() || isGpcCompliant()) return

  // Override mode: GPC is the default, not a lock. Analytics is already off via
  // the category's default-disabled state (so the signal is honored), and we
  // record nothing automatically — that leaves the visitor free to opt in and
  // never overturns a choice they've already saved.
  if (getConsentConfig().allowGpcOverride) return

  CookieConsent.acceptCategory([])
}

/** Show an informational banner confirming GPC was honored. */
function showGpcBannerIfNeeded(): void {
  if (!hasGpcSignal()) return
  if (sessionStorage.getItem(getConsentConfig().gpcBannerAckKey) === '1') return

  CookieConsent.show(true)
}

/** Build the vanilla-cookieconsent category map from config. */
export function buildCategories(
  gpcActive: boolean,
): CookieConsentConfig['categories'] {
  const categories: NonNullable<CookieConsentConfig['categories']> = {}

  for (const category of getConsentConfig().categories) {
    // GPC forces a clamped category off by default whenever a signal is present
    // — regardless of `allowGpcOverride`. Override only governs whether the
    // toggle stays operable (readOnly below) and whether a saved opt-in persists
    // via the cookie; it must not leave the category on-by-default for a GPC
    // visitor (which would fire opt-out `enabled: true` tags against the signal).
    const gpcClamped = isGpcClamped(category.id) && gpcActive

    categories[category.id] = {
      enabled: gpcClamped ? false : (category.enabled ?? false),
      readOnly:
        (category.readOnly ?? false) ||
        (gpcClamped && !getConsentConfig().allowGpcOverride),
      ...(category.autoClear
        ? { autoClear: { cookies: category.autoClear } }
        : {}),
    }
  }

  return categories
}

let hasRun = false

/**
 * Clear the {@link runConsent} re-init guard so it can be called again.
 *
 * @internal test-only. Not part of the public API — call this between test
 * cases in the same module so each one can exercise a fresh `runConsent()`.
 */
export function __resetConsentRunForTests(): void {
  hasRun = false
}

/**
 * Initialize consent for the page: runs `CookieConsent.run()` with the
 * resolved config, pushes the Google Consent Mode / Meta Pixel consent
 * defaults before the analytics/ad containers load, wires the
 * onFirstConsent/onConsent/onChange callbacks to dispatch consent-change
 * events and push consent-mode updates, and — once the banner has
 * initialized — applies the GPC clamp (forcing a non-compliant category off)
 * and shows the informational GPC banner, then dispatches the initial
 * consent-change event.
 *
 * Call once per page, after `configureConsent()`. `CookieConsent.run()`
 * itself silently no-ops on a second call while still holding its original
 * config, so `runConsent()` guards against being invoked more than once: a
 * second call logs a `console.warn` and resolves immediately without
 * touching `CookieConsent.run` or re-dispatching, rather than running its own
 * continuation against a config the banner never adopted.
 */
export function runConsent(): Promise<void> {
  if (hasRun) {
    console.warn(
      '[consent] runConsent() already initialized; ignoring re-init — call configureConsent()+runConsent() only once per page.',
    )
    return Promise.resolve()
  }
  hasRun = true

  const config = getConsentConfig()
  const gpcActive = hasGpcSignal()

  /**
   * Consent changes reload so blocked script tags re-activate. Skipped under
   * GPC — where consent is fixed — unless override is enabled, in which case a
   * GPC visitor's own opt-in must activate scripts just like any other.
   */
  const reloadIfNeeded = (): void => {
    if (hasGpcSignal() && !config.allowGpcOverride) return
    if (!config.reloadOnConsentChange) return
    window.location.reload()
  }

  pushGoogleConsentDefault()
  pushMetaPixelConsentDefault()

  return CookieConsent.run({
    mode: config.mode,

    cookie: {
      name: config.cookieName,
    },

    autoShow: !gpcActive,

    guiOptions: config.guiOptions,

    categories: buildCategories(gpcActive),

    onFirstConsent: () => {
      dispatchConsentChange()
      pushGoogleConsentUpdate()
      pushMetaPixelConsentUpdate()
      reloadIfNeeded()
    },

    onConsent: () => {
      dispatchConsentChange()
      pushGoogleConsentUpdate()
      pushMetaPixelConsentUpdate()
    },

    onChange: () => {
      dispatchConsentChange()
      pushGoogleConsentUpdate()
      pushMetaPixelConsentUpdate()
      reloadIfNeeded()
    },

    onModalHide: ({ modalName }) => {
      if (hasGpcSignal() && modalName === 'consentModal') {
        sessionStorage.setItem(config.gpcBannerAckKey, '1')
      }
    },

    language: (config.buildCopy ?? buildEnglishCopy)(gpcActive),
  }).then(() => {
    applyGpcIfNeeded()
    showGpcBannerIfNeeded()
    dispatchConsentChange()
    // Only reflect a *recorded* choice on load. A fresh visitor has no valid
    // consent yet, so the mode-aware `default` (granted in opt-out) must stand
    // — deriving an update from hasConsent() here would wrongly force denied.
    if (CookieConsent.validConsent()) {
      pushGoogleConsentUpdate()
      pushMetaPixelConsentUpdate()
    }
  })
}
