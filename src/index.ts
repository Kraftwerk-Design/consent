import { initConsentApi } from './analytics'
import { configureConsent, type ConsentConfig } from './config'
import { defineConsentEmbed, defineConsentPour } from './embeds/index'
import { runConsent } from './run'

export { getConsentConfig, configureConsent } from './config'
export type { ConsentConfig } from './config'
export type { ConsentCategory } from './config.default'

export { hasGpcSignal } from './gpc'

export {
  hasConsent,
  requireConsent,
  promptConsent,
  onConsentChange,
  hasAnalyticsConsent,
  promptAnalyticsConsent,
  requireAnalyticsConsent,
  onAnalyticsConsentChange,
  initConsentApi,
} from './analytics'
export type { ConsentApi } from './analytics'

export { setupConsentGate } from './gate'
export type { ConsentGate } from './gate'

export { runConsent } from './run'

export { defineConsentEmbed, defineConsentPour } from './embeds/index'

/**
 * Initialize the full consent stack: merge per-project config, expose the
 * imperative API on `window`, register the `<consent-embed>` and
 * `<consent-pour>` elements, and run the banner.
 */
export function initConsent(
  overrides: Partial<ConsentConfig> = {},
): Promise<void> {
  configureConsent(overrides)
  initConsentApi()
  defineConsentEmbed()
  defineConsentPour()
  return runConsent()
}
