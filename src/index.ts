import type { ConsentConfig } from './config'
import { initConsent as createConsent, type ConsentHandle } from './core/controller'
import { defineConsentEmbed } from './elements/embed'
import { defineConsentPour } from './elements/pour'

export { validateConsentConfig } from './config'
export type { ConsentConfig, ResolvedConfig } from './config'
export type {
  ConsentCategory,
  ConsentIntegration,
  AutoClearCookie,
  CategoryCopy,
  AgeGateConfig,
  CopyContext,
} from './config.default'

export { confirmAge, isAgeVerified } from './core/controller'
export type { ConsentHandle, ConsentListener } from './core/controller'
export { AGE_GATE_COOKIE, ageGateHeadScript } from './ageGate'

export { hasGpcSignal } from './gpc'

export type { ConsentApi } from './dom'
export type { ConsentSnapshot } from './core/snapshot'
export type { GpcState } from './core/categories'
export type { ReloadPolicy } from './core/reload'

export { attachGate, defineGatedElement } from './elements/gated'
export type { GateOptions, Mount } from './elements/gated'

export { googleConsentMode } from './integrations/google'
export type { GoogleConsentMap, GoogleConsentSignal } from './integrations/google'
export { metaPixel } from './integrations/meta'

export { GOOGLE_CONSENT_DEFAULT_HEAD } from './head'

export { defineConsentEmbed } from './elements/embed'
export { defineConsentPour } from './elements/pour'

/**
 * Initialize the full consent stack: resolve and freeze the config, expose
 * `window.KDConsent`, run the integrations' deny-first `init`,
 * register the `<consent-embed>` and `<consent-pour>` elements, and run the
 * banner (after `confirmAge()` when `ageGate` is set).
 *
 * Call once per page; a repeat call returns the same handle and ignores its
 * options. Await `.ready` for the banner to have run.
 */
export function initConsent(options?: Partial<ConsentConfig>): ConsentHandle {
  const handle = createConsent(options)
  defineConsentEmbed()
  defineConsentPour()
  return handle
}
