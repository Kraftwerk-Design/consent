import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import type { ReloadPolicy } from './core/reload'
import type { GpcState } from './core/categories'
import type { ConsentSnapshot } from './core/snapshot'

/** A cookie a category clears on opt-out. */
export interface AutoClearCookie {
  name: string | RegExp
}

/** Age-gate persistence. See {@link ConsentConfig.ageGate}. */
export interface AgeGateConfig {
  /** First-party cookie recording a passed gate. Defaults to `AGE_GATE_COOKIE`. */
  cookieName?: string
  /** Lifetime of a passed gate, in days. Defaults to 30. */
  maxAgeDays?: number
}

/** Copy for a category's section in the preferences modal. */
export interface CategoryCopy {
  title: string
  description: string
}

/**
 * A consent category. Add as many as a project needs — each one is registered
 * with vanilla-cookieconsent and rendered as a section in the preferences
 * modal. The default gate category (`gateCategory`, else `'analytics'`) is the
 * default target of `has()` / `require()`, and the one GPC clamps by default.
 */
export interface ConsentCategory {
  /** Category id used by vanilla-cookieconsent and `linkedCategory` in copy. */
  id: string
  /** Enabled by default (necessary categories only). */
  enabled?: boolean
  /** Locked on (necessary categories). */
  readOnly?: boolean
  /**
   * Subject to the GPC clamp: under a GPC signal it is not registered with the
   * banner and never effective (off by default with `allowGpcOverride`). When
   * no category sets this flag, the clamped set defaults to the default gate
   * category. Ignored on readOnly categories.
   */
  gpc?: boolean
  /** Cookies cleared when this category is opted out of. */
  autoClear?: AutoClearCookie[]
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
   * Falls back to `'analytics'`.
   */
  gateCategory?: string
  /**
   * Hold the entire consent stack until the visitor passes a site-rendered age
   * gate (`confirmAge()`). Off when omitted.
   */
  ageGate?: AgeGateConfig
  /** Custom DOM event dispatched when consent changes. */
  consentChangeEvent: string
  /**
   * Let a visitor explicitly opt back into the analytics category even when
   * their browser sends a GPC signal. When `true`, GPC is honored as the
   * *default* — analytics starts off and the banner explains the signal — but
   * the preferences toggle stays operable and a saved opt-in is respected on
   * every load. When `false` (the default), GPC is a hard lock: clamped
   * categories are not registered with the banner, so no button, toggle or
   * `acceptCategory()` call can release their scripts.
   *
   * Enabling this has legal implications where GPC is a binding opt-out
   * (e.g. CCPA/CPRA); the override must be a genuine, user-initiated action.
   * The GPC spec contemplates it — a "specific arrangement with that person may
   * permit a website to ignore a generally applicable preference" — but treat
   * it as a compliance decision, not a default. See README.
   */
  allowGpcOverride: boolean
  /**
   * When a visitor's choice reloads the page. Accepting releases blocked
   * scripts live, so only withdrawing needs a reload to stop scripts that
   * already ran. Never reloads on load or `confirmAge()`.
   * - `'on-withdraw'` (default): a category goes from granted to denied.
   * - `'on-change'`: any category changes. Scripts released by an accept run
   *   twice: live, then after the reload.
   * - `'never'`: SPAs and pages that react to `consent:change` themselves.
   */
  reload: ReloadPolicy
  /**
   * Vendor consent signaling, e.g.
   * `[googleConsentMode({...}), metaPixel({ category: 'analytics' })]`.
   */
  integrations: ConsentIntegration[]
  guiOptions: CookieConsentConfig['guiOptions']
  /**
   * Override the banner/preferences copy wholesale. Defaults to the built-in
   * English copy, which renders a section per configured category. Under GPC
   * `default-off` the banner's `acceptNecessaryBtn` acts as **Keep off**: it
   * saves the defaults minus the GPC-clamped categories.
   */
  buildCopy?: (context: CopyContext) => CookieConsentConfig['language']
}

/**
 * Feeds consent state into a vendor (Google Consent Mode, Meta Pixel, …).
 * Signals only: it never loads or blocks the vendor's tags.
 */
export interface ConsentIntegration {
  readonly name: string
  /** Category ids it reads. The validator warns about unknown ones. */
  readonly categories: readonly string[]
  /**
   * Called once at init, before any age gate: send `baseline`, the deny-first
   * default (readOnly categories granted, the rest denied). Synchronous and
   * non-transmitting (queue commands, never fetch).
   */
  init?(context: { baseline: ConsentSnapshot; mode: ConsentConfig['mode'] }): void
  /**
   * Called once per distinct snapshot change once ready, never while awaiting
   * the age gate. `prev` is the snapshot last applied, `baseline` on the first
   * call. Send only what changed.
   */
  apply(next: ConsentSnapshot, prev: ConsentSnapshot): void
}

/** What {@link ConsentConfig.buildCopy} is built for. */
export interface CopyContext {
  gpc: GpcState
  mode: ConsentConfig['mode']
  categories: readonly ConsentCategory[]
  privacyPolicyUrl: string
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
      copy: {
        title: 'Strictly necessary',
        description:
          'Required for core functionality, accessibility, security and performance of the website. These cannot be disabled.',
      },
    },
    {
      id: 'analytics',
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

  allowGpcOverride: false,

  reload: 'on-withdraw',

  integrations: [],

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
