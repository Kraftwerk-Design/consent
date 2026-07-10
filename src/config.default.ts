import type { CookieConsentConfig } from 'vanilla-cookieconsent'

/** A Google Consent Mode v2 signal. */
export type GoogleConsentSignal =
  | 'ad_storage'
  | 'ad_user_data'
  | 'ad_personalization'
  | 'analytics_storage'
  | 'functionality_storage'
  | 'personalization_storage'
  | 'security_storage'

/** A cookie a category clears on opt-out. */
export interface AutoClearCookie {
  name: string | RegExp
}

/** Copy for a category's section in the preferences modal. */
export interface CategoryCopy {
  title: string
  description: string
}

/**
 * A consent category. Add as many as a project needs — each one is registered
 * with vanilla-cookieconsent and rendered as a section in the preferences
 * modal. Exactly one category should set `analytics: true`; that is the bucket
 * the imperative gate helpers (`hasAnalyticsConsent` / `requireAnalyticsConsent`)
 * key off, and the one GPC forces to read-only (unless `allowGpcOverride`).
 */
export interface ConsentCategory {
  /** Category id used by vanilla-cookieconsent and `linkedCategory` in copy. */
  id: string
  /** Enabled by default (necessary categories only). */
  enabled?: boolean
  /**
   * Locked on (necessary categories). GPC also forces any GPC-clamped category
   * read-only — unless `allowGpcOverride` is set, in which case the visitor
   * keeps control of it. See the per-category `gpc` flag for which categories are clamped.
   */
  readOnly?: boolean
  /** Marks the consent-gated tracking bucket the JS gate helpers check. */
  analytics?: boolean
  /**
   * Subject to the GPC clamp — forced read-only / off when a GPC signal is
   * present (unless `allowGpcOverride`). When no category sets this flag, the
   * clamped set defaults to the default gate category (the `analytics` one).
   */
  gpc?: boolean
  /** Grants the Meta Pixel when this category is consented (binary). */
  meta?: boolean
  /** Cookies cleared when this category is opted out of. */
  autoClear?: AutoClearCookie[]
  /** Google Consent Mode v2 signals this category grants when consented. */
  google?: GoogleConsentSignal[]
  /** Preferences-modal section copy. Add copy here when adding a category. */
  copy?: CategoryCopy
}

/**
 * Full resolved consent config. `defaultConsentConfig` supplies every field;
 * a project passes a `Partial<ConsentConfig>` to `initConsent()` to override.
 */
export interface ConsentConfig {
  mode: CookieConsentConfig['mode']
  /** Consent cookie name — override per project. */
  cookieName: string
  /** Privacy policy link shown in the preferences modal. */
  privacyPolicyUrl: string
  /** Consent categories (see {@link ConsentCategory}). */
  categories: ConsentCategory[]
  /**
   * Id of the category the JS gate helpers target when a gate names none.
   * Falls back to the category flagged `analytics: true`, then `'analytics'`.
   */
  gateCategory?: string
  /** Custom DOM event dispatched when consent changes. */
  consentChangeEvent: string
  /** sessionStorage key — GPC acknowledgment banner dismissed this session. */
  gpcBannerAckKey: string
  /**
   * Let a visitor explicitly opt back into the analytics category even when
   * their browser sends a GPC signal. When `true`, GPC is honored as the
   * *default* — analytics starts off and the banner explains the signal — but
   * the preferences toggle stays operable and a saved opt-in is respected on
   * every load. When `false` (the default), GPC is a hard lock: the analytics
   * category is forced read-only and re-clamped to necessary-only each load.
   *
   * Enabling this has legal implications where GPC is a binding opt-out
   * (e.g. CCPA/CPRA); the override must be a genuine, user-initiated action.
   * The GPC spec contemplates it — a "specific arrangement with that person may
   * permit a website to ignore a generally applicable preference" — but treat
   * it as a compliance decision, not a default. See README.
   */
  allowGpcOverride: boolean
  /**
   * Reload the page when consent changes (non-GPC) so server-blocked
   * `type="text/plain"` script tags re-activate. Set false for SPA-style
   * sites that rely on the live `onAnalyticsConsentChange` listeners instead.
   */
  reloadOnConsentChange: boolean
  /**
   * Enable Google Consent Mode v2 signaling. Off when omitted/false. Pushes a
   * consent `default` at init and a consent `update` on every change, mapped
   * from each category's `google` signals. Direction follows `mode` via each
   * category's `enabled` baseline: opt-out categories (`enabled: true`) default
   * to granted (CCPA); opt-in consent-gated categories (`enabled: false`)
   * default to denied. GPC forces the clamped signals denied either way.
   */
  googleConsentMode: boolean
  /**
   * Enable Meta Pixel consent signaling. Off when omitted. Grants/revokes the
   * pixel (`fbq('consent', …)`) from each category's `meta` flag on consent
   * change. Direction follows `mode`: opt-in starts revoked and grants on
   * consent; opt-out starts granted and, on opt-out, applies Limited Data Use
   * (LDU) *and* revokes. GPC forces the clamped categories off either way.
   * The library manages the live session only — it cannot suppress the
   * page-load PageView (set the pre-`fbq('init')` state inline in `<head>`; see
   * README). The pixel base code must load before initConsent() — the library
   * never injects or stubs `fbq`.
   */
  metaPixelConsentMode: boolean
  guiOptions: CookieConsentConfig['guiOptions']
  /**
   * Override the banner/preferences copy wholesale. Defaults to the built-in
   * English copy, which renders a section per configured category.
   */
  buildCopy?: (gpcActive: boolean) => CookieConsentConfig['language']
}

/** Defaults shared across Kraftwerk consent implementations. */
export const defaultConsentConfig: ConsentConfig = {
  mode: 'opt-in',

  cookieName: 'kd_cookie_consent',

  privacyPolicyUrl: '/policies/privacy-policy',

  categories: [
    {
      id: 'necessary',
      enabled: true,
      readOnly: true,
      google: ['security_storage', 'functionality_storage'],
      copy: {
        title: 'Strictly necessary',
        description:
          'Required for core functionality, accessibility, security and performance of the website. These cannot be disabled.',
      },
    },
    {
      id: 'analytics',
      analytics: true,
      meta: true,
      google: [
        'analytics_storage',
        'ad_storage',
        'ad_user_data',
        'ad_personalization',
      ],
      autoClear: [
        { name: /^_ga/ },
        { name: '_gid' },
        { name: /^_gcl/ },
        { name: /^_fbp/ },
        { name: /^dd_/ },
      ],
      copy: {
        title: 'Analytics & marketing',
        description:
          'Includes analytics and ad tracking, social media plugins and email newsletter tools. These services may set cookies to measure engagement, personalize communications, or support marketing — even when their main purpose is chat or signup.',
      },
    },
  ],

  consentChangeEvent: 'consent:change',

  gpcBannerAckKey: 'site_gpc_banner_ack',

  allowGpcOverride: false,

  reloadOnConsentChange: true,

  googleConsentMode: false,

  metaPixelConsentMode: false,

  guiOptions: {
    consentModal: {
      layout: 'cloud',
      position: 'bottom center',
      equalWeightButtons: true,
      flipButtons: true,
    },
    preferencesModal: {
      layout: 'box',
      equalWeightButtons: true,
      flipButtons: false,
    },
  },
}
