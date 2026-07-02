import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { getConsentConfig } from '../config'

/**
 * Default English banner copy. The framework shell (intro, buttons, privacy
 * intro, more-info) lives here and is GPC-aware; per-category sections are
 * generated from `config.categories`, so adding a category needs no edit here.
 * Override the whole thing per project via `config.buildCopy`.
 */
export function buildEnglishCopy(
  gpcActive: boolean,
): CookieConsentConfig['language'] {
  const { privacyPolicyUrl, categories, allowGpcOverride } = getConsentConfig()

  // GPC as a hard lock vs. GPC as an overridable default.
  const gpcLocked = gpcActive && !allowGpcOverride

  const gpcConsentDescription = gpcLocked
    ? 'Your browser\'s Global Privacy Control (GPC) signal is on. We\'ve applied your choice — only strictly necessary cookies are in use and analytics or marketing tools will not load. You can review details anytime.'
    : 'Your browser\'s Global Privacy Control (GPC) signal is on, so only strictly necessary cookies are in use by default. You can turn on analytics and marketing anytime under Manage preferences.'

  const gpcChoicesDescription = gpcLocked
    ? 'Global Privacy Control (GPC) is enabled in your browser. Analytics and marketing cookies are turned off and cannot be enabled while this signal is active.'
    : 'Global Privacy Control (GPC) is enabled in your browser, so analytics and marketing cookies are turned off by default. You can choose to enable them below — doing so overrides the GPC signal for this site.'

  const categorySections = categories.map((category) => ({
    title: category.copy?.title ?? category.id,
    description: category.copy?.description ?? '',
    linkedCategory: category.id,
  }))

  return {
    default: 'en',
    translations: {
      en: {
        consentModal: {
          title: gpcActive
            ? 'Your privacy settings'
            : 'Enjoy the full experience',
          description: gpcActive
            ? gpcConsentDescription
            : 'We use cookies to keep our site running and (with your consent) to understand how you found us and show you relevant ads. You can change your mind anytime.',
          acceptAllBtn: gpcActive ? undefined : 'Accept all',
          acceptNecessaryBtn: gpcActive ? 'Got it' : undefined,
          showPreferencesBtn: 'Manage preferences',
        },
        preferencesModal: {
          title: 'Cookie preferences',
          acceptAllBtn: gpcLocked ? undefined : 'Accept all',
          acceptNecessaryBtn: 'Reject non-essential',
          savePreferencesBtn: 'Save preferences',
          closeIconLabel: 'Close',
          sections: [
            {
              title: 'Your privacy choices',
              description: gpcActive
                ? gpcChoicesDescription
                : 'You can change these settings at any time. Non-essential tools will only load after you opt in.',
            },
            ...categorySections,
            {
              title: 'More information',
              description: `For more information about our policy on cookies and your choices, please view our <a class="cc-link" href="${privacyPolicyUrl}">privacy policy</a>.`,
            },
          ],
        },
      },
    },
  }
}
