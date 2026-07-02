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
  const { privacyPolicyUrl, categories } = getConsentConfig()

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
            ? 'Your browser\'s Global Privacy Control (GPC) signal is on. We\'ve applied your choice — only strictly necessary cookies are in use and analytics or marketing tools will not load. You can review details anytime.'
            : 'We use cookies to keep our site running and (with your consent) to understand how you found us and show you relevant ads. You can change your mind anytime.',
          acceptAllBtn: gpcActive ? undefined : 'Accept all',
          acceptNecessaryBtn: gpcActive ? 'Got it' : undefined,
          showPreferencesBtn: 'Manage preferences',
        },
        preferencesModal: {
          title: 'Cookie preferences',
          acceptAllBtn: gpcActive ? undefined : 'Accept all',
          acceptNecessaryBtn: 'Reject non-essential',
          savePreferencesBtn: 'Save preferences',
          closeIconLabel: 'Close',
          sections: [
            {
              title: 'Your privacy choices',
              description: gpcActive
                ? 'Global Privacy Control (GPC) is enabled in your browser. Analytics and marketing cookies are turned off and cannot be enabled while this signal is active.'
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
