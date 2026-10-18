import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { getConsentConfig } from '../config'
import type { CopyContext } from '../config.default'

/**
 * Default English banner copy. The framework shell (intro, buttons, privacy
 * intro, more-info) lives here and is GPC- and mode-aware; per-category
 * sections are generated from `config.categories`, so adding a category needs
 * no edit here. Override the whole thing per project via `config.buildCopy`.
 */
export function buildEnglishCopy({
  gpc,
  mode,
}: CopyContext): CookieConsentConfig['language'] {
  const { privacyPolicyUrl, categories } = getConsentConfig()

  const consentDescription = {
    none: 'We use cookies to keep our site running and (with your consent) to understand how you found us and show you relevant ads. You can change your mind anytime.',
    locked:
      'Your browser\'s Global Privacy Control (GPC) signal is on, so analytics and marketing tools stay off. You can review your other choices under Manage preferences.',
    'default-off':
      'Your browser\'s Global Privacy Control (GPC) signal is on, so analytics and marketing tools are off by default. Accept all to turn them on for this site, or keep them off.',
  }[gpc]

  const choicesDescription = {
    none:
      mode === 'opt-out'
        ? 'You can change these settings at any time. Some non-essential tools are on by default; turn them off and save to opt out.'
        : 'You can change these settings at any time. Non-essential tools will only load after you opt in.',
    locked:
      'Global Privacy Control (GPC) is enabled in your browser. Analytics and marketing cookies are turned off and cannot be enabled while this signal is active.',
    'default-off':
      'Global Privacy Control (GPC) is enabled in your browser, so analytics and marketing cookies are turned off by default. You can choose to enable them below — doing so overrides the GPC signal for this site.',
  }[gpc]

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
          title: gpc === 'none' ? 'Enjoy the full experience' : 'Your privacy settings',
          description: consentDescription,
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: gpc === 'default-off' ? 'Keep off' : undefined,
          showPreferencesBtn: 'Manage preferences',
        },
        preferencesModal: {
          title: 'Cookie preferences',
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Reject non-essential',
          savePreferencesBtn: 'Save preferences',
          closeIconLabel: 'Close',
          sections: [
            {
              title: 'Your privacy choices',
              description: choicesDescription,
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
