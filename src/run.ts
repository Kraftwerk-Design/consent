import * as CookieConsent from 'vanilla-cookieconsent'
import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { dispatchAnalyticsConsentChange } from './analytics'
import { buildEnglishCopy } from './copy/en'
import { analyticsCategoryId, getConsentConfig } from './config'
import { hasGpcSignal } from './gpc'

function isGpcCompliant(): boolean {
  return (
    CookieConsent.validConsent() &&
    !CookieConsent.acceptedCategory(analyticsCategoryId())
  )
}

/** Apply necessary-only consent for GPC (no reload). */
function applyGpcIfNeeded(): void {
  if (!hasGpcSignal() || isGpcCompliant()) return

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
      readOnly: (category.readOnly ?? false) || (category.analytics === true && gpcActive),
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

  /** Non-GPC consent changes reload so blocked script tags re-activate. */
  const reloadIfNeeded = (): void => {
    if (hasGpcSignal()) return
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
      dispatchAnalyticsConsentChange()
      reloadIfNeeded()
    },

    onConsent: () => {
      dispatchAnalyticsConsentChange()
    },

    onChange: () => {
      dispatchAnalyticsConsentChange()
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
    dispatchAnalyticsConsentChange()
  })
}
