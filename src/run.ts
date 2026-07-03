import * as CookieConsent from 'vanilla-cookieconsent'
import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { dispatchConsentChange } from './analytics'
import { buildEnglishCopy } from './copy/en'
import { defaultGateCategoryId, getConsentConfig } from './config'
import { hasGpcSignal } from './gpc'

function isGpcCompliant(): boolean {
  return (
    CookieConsent.validConsent() &&
    !CookieConsent.acceptedCategory(defaultGateCategoryId())
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
function buildCategories(
  gpcActive: boolean,
): CookieConsentConfig['categories'] {
  const categories: NonNullable<CookieConsentConfig['categories']> = {}

  for (const category of getConsentConfig().categories) {
    categories[category.id] = {
      enabled: category.enabled ?? false,
      readOnly:
        (category.readOnly ?? false) ||
        (category.analytics === true && gpcActive && !getConsentConfig().allowGpcOverride),
      ...(category.autoClear
        ? { autoClear: { cookies: category.autoClear } }
        : {}),
    }
  }

  return categories
}

export function runConsent(): Promise<void> {
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
      reloadIfNeeded()
    },

    onConsent: () => {
      dispatchConsentChange()
    },

    onChange: () => {
      dispatchConsentChange()
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
  })
}
