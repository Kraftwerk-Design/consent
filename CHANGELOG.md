# Changelog

All notable changes to `@kraftwerkdesign/consent` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Runtime rewrite around one controller and a consent snapshot. Contains breaking
changes; no deprecation shims.

### Changed

- **BREAKING:** `initConsent()` returns a `ConsentHandle`, not a promise:
  `await initConsent()` → `await initConsent().ready`. The handle has `ready`,
  `getSnapshot`, `subscribe`, `has`, `require`, `prompt` and `destroy`.
- **BREAKING:** `window.KDConsent` is
  `{ has, require, prompt, confirmAge, getSnapshot }`.
- **BREAKING:** the config is resolved and frozen at init. A repeat
  `initConsent()` returns the same handle and warns when given options.
- **BREAKING:** `consent:change` detail is the `ConsentSnapshot`
  `{ stage, recorded, gpc, categories }`, frozen; `accepted` is dropped. It
  fires once when ready and once per distinct change.
- **BREAKING:** integrations: `integrations: [googleConsentMode({...}),
  metaPixel({...})]` replaces the `googleConsentMode` / `metaPixelConsentMode`
  booleans and the per-category `google` / `meta` fields. The gate category is
  `gateCategory`, falling back to `'analytics'`. The default categories carry
  no vendor mappings.
- **BREAKING:** `validateConsentConfig(config)` takes one argument.
- **BREAKING:** Meta: init sends `fbq('consent', 'revoke')` in every mode, with
  no LDU. Each change sends only what differs, so a returning-rejected opt-out
  visitor gets LDU only and a fresh opt-out visitor one `grant`.
- **BREAKING:** GPC: a fresh GPC visitor gets the normal banner with a GPC
  notice, and nothing is recorded automatically. Under the lock, clamped
  categories are not registered with vanilla-cookieconsent and their autoClear
  cookies are erased. `buildCopy` receives a `CopyContext`
  `{ gpc, mode, categories, privacyPolicyUrl }` instead of a boolean. GPC visitors follow the reload policy.
- **BREAKING:** reload: `reloadOnConsentChange` → `reload: 'never' |
  'on-withdraw' | 'on-change'`, default `'on-withdraw'`. Accepting and an
  opt-in reject no longer reload, so released scripts no longer run twice under
  the default. `'on-change'` runs inline tags twice on a first Accept all. The
  validator warns on the legacy key.
- **BREAKING:** gated elements: `setupConsentGate()` → `attachGate()` and
  `defineGatedElement()`, and `ConsentGate { activate, deactivate }` →
  `GateOptions { mount: () => teardown | null }`. `attachGate()` needs
  `initConsent()` first; without it, it warns and does nothing. Elements bind
  only once a controller exists. Hosts carry `state="blocked|active"` and the
  poster uses `hidden` instead of inline `display` styles; author CSS setting
  `display` on the poster overrides `hidden`.
- **BREAKING:** `renderGoogleConsentDefaultScript()` → the
  `GOOGLE_CONSENT_DEFAULT_HEAD` constant (same snippet).

### Removed

- **BREAKING:** exports `configureConsent`, `getConsentConfig`, `runConsent`,
  `installWindowApi`, `initConsentApi`, `hasConsent`, `requireConsent`,
  `promptConsent`, `onConsentChange`, `hasAnalyticsConsent`,
  `requireAnalyticsConsent`, `promptAnalyticsConsent`,
  `onAnalyticsConsentChange`, `setupConsentGate`,
  `renderGoogleConsentDefaultScript` and the `ConsentGate` type. Use the handle
  or `window.KDConsent`.
- **BREAKING:** the `data-require-analytics` attribute; use
  `data-require-consent`.
- **BREAKING:** the `analytics` field on `ConsentCategory`.
- **BREAKING:** the `checkSignalMappings` argument of `validateConsentConfig`.
- **BREAKING:** `gpcBannerAckKey`.

### Added

- **Age gate:** `ageGate: { cookieName?, maxAgeDays? }`, `confirmAge(opts?)`,
  `isAgeVerified(opts?)` and `AGE_GATE_COOKIE` (`'kd_age_verified'`, the
  default cookie name). Nothing tracks before `confirmAge()`: no banner, no
  script release (`necessary` included), no integration updates, no event.
  Only the deny-first defaults (Consent Mode `default`, Meta `revoke` when
  `fbq` exists) run before the gate. `confirmAge()` before init, or with no
  gate, writes the cookie its `opts` (`AgeGateConfig`) describe. With `ageGate`
  set, init warns about ungated Google / Meta tags, an existing `window.fbq`,
  and a pre-init pass written under the default name. Passing never grants consent,
  overrides GPC or reloads.
- `ageGateHeadScript({ cookieName?, className? })`.
- `ConsentHandle.subscribe` / `getSnapshot` (fit `useSyncExternalStore`) and
  `destroy()` for HMR and tests. `destroy()` unmounts gated elements and clears
  a click's activation; they bind to the next controller.
- One controller per page, shared by every copy of the package (global
  versioned key).
- `googleConsentMode(map)`: each signal maps to one or more categories.
- `metaPixel({ category, ldu? })`: `ldu` defaults to `true` and only acts in
  opt-out mode.
- `ConsentIntegration` for custom integrations;
  [docs/integrations.md](docs/integrations.md) with LinkedIn / Klaviyo recipes.
- GPC override banner (`allowGpcOverride`): **Accept all** / **Keep off**.
- `googleConsentMode` warns at init when an earlier `default` (the head
  snippet) grants a signal the config denies before consent.
- The validator warns on an empty GPC clamp set, unknown integration
  categories, an unknown `reload` and a non-positive `ageGate.maxAgeDays`.
- Gated-element content carries `data-consent-gated`.
- Types: `AgeGateConfig`, `ConsentHandle`, `ConsentListener`,
  `ConsentSnapshot`, `GpcState`, `ReloadPolicy`, `ResolvedConfig`,
  `CopyContext`, `ConsentIntegration`, `GateOptions`, `Mount`,
  `GoogleConsentMap`.
- CI on pull requests and `main` (typecheck, unit tests, build, Playwright);
  Playwright e2e suite (`npm run test:e2e`); a dry-run dispatch for the publish
  workflow.

### Fixed

- The GPC lock leaked: returning visitors who had accepted before enabling GPC
  had their scripts released, and `data-cc="accept-all"`, a custom `buildCopy`
  Accept all or `CookieConsent.acceptCategory()` could release clamped scripts.
- The GPC lock rejected every non-necessary category, not only the clamped ones.
- A readOnly category with `gpc: true` was dropped under the GPC lock while
  `has()` reported it granted. readOnly categories are never clamped; the
  validator warns about the flag.
- **BREAKING:** fresh opt-out visitors: `hasConsent()` was false, embeds stayed
  blocked, `data-require-consent` blocked and the event said `accepted: false`
  while their scripts ran. `has()` and `detail.categories` are now true for
  the `enabled` defaults.
- `consent:change`, Consent Mode updates and Meta calls fired 2–4 times per
  load or choice.
- Accepting released scripts live and then reloaded (double pageview); an
  opt-in reject reloaded.
- Embeds: a move across ticks duplicated content (it now re-creates the
  mount), a clone kept Pour's iframe without consent, a withdrawal while
  detached left content, Pour leaked `message` listeners, and a poster click
  before consent needed a second click.
- A second `initConsent()` swapped the config under a running banner.
- Opt-out preferences copy said tools "only load after you opt in"; the copy is
  mode-aware.
- An integration or subscriber throw no longer stops later callbacks.
- GPC visitors detected as bots (`hideFromBots`) made `initConsent()` reject.
- The docs no longer claim the Consent Mode head default is safe for any
  mapping. Drift tests now guard the documented head snippets.
- `postversion` pushed the tag and created the GitHub Release before any test
  ran. `preversion` now runs the unit tests and `publish.yml` runs CI before
  `npm publish`.

## [0.7.0] - 2026-07-10

### Fixed

- `configureConsent()` no longer emits spurious "google/meta flag set while
  consent mode is off" warnings for the shipped defaults — a plain quick-start
  install (no `categories` override) now runs clean. The signal-mapping checks
  only apply to categories the project authored; `validateConsentConfig()`
  gained a `{ checkSignalMappings }` option (default `true`) to control this.

### Changed

- **`renderGoogleConsentDefaultScript()` is now a static, denied-by-default
  snippet.** It no longer serializes the consent config into the page: the
  synchronous `<head>` default emits Google's canonical `denied` baseline with
  `wait_for_update: 500`, config-free and byte-identical for every site. This
  removes the config duplication (and hand-editing of an embedded `P` object)
  that server-rendered/Twig sites had to maintain. The race is still solved —
  now by construction, since nothing starts granted, so the only flips are the
  safe `denied → granted` ones the bundle pushes as an `update`. A returning
  granted visitor upgrades once the bundle runs (held by `wait_for_update`); a
  fresh opt-out visitor is upgraded by a new mode-baseline `update` on load.
  Sites whose Google tag is `type="text/plain"` and released by the bundle
  (Model A) don't need the `<head>` snippet at all.
- The init-time `gtag('consent','default',…)` push is likewise denied-by-default
  (readOnly signals granted); per-visitor state is applied as an `update`.
- **Docs:** README rewritten around usage/recipes; Google Consent Mode, Meta
  Pixel, and release docs moved to `docs/`. `lite-youtube`/`lite-vimeo` now
  documented as coming from `@kraftwerkdesign/kd-components`.

## [0.6.0] - 2026-07-09

API-hardening pass from a multi-agent API review. Contains breaking changes.

> **Breaking:** the `windowNamespace` config option was removed (the imperative
> API is always `window.KDConsent`); `initConsentApi` was renamed to
> `installWindowApi` (a deprecated alias remains); `getConsentConfig()` now
> returns `Readonly<ConsentConfig>`.

### Added

- **Server-rendered / Twig (Craft, PHP) support** — a ready-to-paste static
  Google Consent Mode `<script>` block in the README for sites with no JS
  runtime to call `renderGoogleConsentDefaultScript()`. A drift-guard test keeps
  the documented block byte-identical to the function's output.
- **`validateConsentConfig()`** (exported) — pure config sanity checks.
  `configureConsent()` now runs it and `console.warn`s (never throws) on
  misconfigurations that previously failed silently: a resolved gate category
  that matches no configured category (the permanent-`false` footgun), multiple
  `analytics: true` categories, duplicate category ids, and `google`/`meta`
  flags set while their consent mode is off.
- **`installWindowApi()`** — the renamed, clearer entry point for installing the
  `window.KDConsent` imperative API.
- Exported the `AutoClearCookie` and `CategoryCopy` types (referenced by the
  already-exported `ConsentCategory` but previously unexported).
- `setupConsentGate()` now returns a teardown function that unsubscribes its
  consent-change and trigger listeners.

### Changed

- `getConsentConfig()` returns `Readonly<ConsentConfig>` so consumers can't
  mutate the shared internal config through the getter.
- `hasGpcSignal()` guards `typeof navigator`, so `hasConsent()` and the other
  import-safe predicates no longer throw on Node/edge runtimes without a global
  `navigator`.
- `runConsent()` guards against double-initialization: a second call warns and
  no-ops instead of running its continuation against a config the banner never
  adopted (SPA re-init / HMR / multi-tenant). Call once per page.
- `<consent-embed>` / `<consent-pour>` release their listeners in
  `disconnectedCallback`, fixing an unbounded listener leak under SPA DOM churn.
- `promptConsent`'s doc comment now states plainly that its category parameter
  is accepted for call-site symmetry but does not scope the (non-category-aware)
  preferences modal.

### Deprecated

- `initConsentApi` — use `installWindowApi`.
- `hasAnalyticsConsent` / `requireAnalyticsConsent` / `promptAnalyticsConsent` /
  `onAnalyticsConsentChange` — use `hasConsent()` / `requireConsent()` /
  `promptConsent()` / `onConsentChange()` with a category id. Still exported and
  still on the `window` API (deployed inline scripts rely on them).

### Removed

- The `windowNamespace` config option. The imperative API is always installed at
  `window.KDConsent`, so its type augmentation can no longer diverge from the
  runtime.

### Fixed

- The README `renderGoogleConsentDefaultScript()` example called it without a
  prior `configureConsent()`, so it silently returned `''`; it now configures
  first.
- Dangling `{@link}` references to non-exported internals in
  `renderGoogleConsentDefaultScript`'s JSDoc.
- README drift: removed the stale `windowNamespace` row, added the `mode`
  default, listed the full imperative-API surface, refreshed the file map, and
  fixed the broken "Styles" cross-reference.

## [0.5.0] - 2026-07-09

### Added

- **Synchronous `<head>` Google Consent default** — `renderGoogleConsentDefaultScript()`
  returns a framework-agnostic `<script>` string to inline in `<head>` above the
  GTM/gtag snippet. The emitted script reads the consent cookie and
  `navigator.globalPrivacyControl` at runtime, so a returning opted-out visitor
  gets `denied` *synchronously* — with no dependency on the async `update`
  landing inside `wait_for_update` — and the string stays a config constant safe
  to serve from a static/CDN cache. Returns `''` when `googleConsentMode` is off.
- **Meta Pixel Consent Mode** — `metaPixelConsentMode` config flag plus a
  per-category `meta` flag. Emits `fbq('consent', …)` grant/revoke on consent
  change, mapped from the `meta` categories (granted if any is consented). Opt-out
  additionally applies Limited Data Use (LDU). GPC forces clamped categories off.
  The pixel base code must load before `initConsent()`; the library manages the
  live session only (it never injects or stubs `fbq`).

### Changed

- `pushGoogleConsentDefault()` is now **cookie-aware**: a returning visitor's
  saved choice (and GPC) drives the init-time `default`, so it never diverges
  from the new inline `<head>` default. A parity test asserts the two agree
  across every mode / `allowGpcOverride` / GPC / saved-cookie combination.
- Consent-cookie parsing is centralized in a new internal module
  (`readConsentCookie`) as the package's single source of truth — consumers never
  read vanilla-cookieconsent's cookie JSON themselves.
- Internal: `gpcClampedOff` is shared via `config.ts` for reuse across the
  Google and Meta consent-mode modules.

## [0.4.1] - 2026-07-09

### Fixed

- CI: dropped an npm self-upgrade step that corrupted the publish (missing
  sigstore signatures). No API changes.

## [0.4.0] - 2026-07-09

### Added

- **Google Consent Mode v2** (optional, off by default) — `googleConsentMode`
  config flag plus a per-category `google` array mapping categories to Consent
  Mode v2 signals. Pushes `gtag('consent', 'default', …)` at init and
  `gtag('consent', 'update', …)` on every consent change, reusing the page's
  `dataLayer`/`gtag` without blocking or unblocking the tag itself. A signal is
  `granted` if any category mapping it is granted (OR-merge).
- Direction follows `mode` via each category's `enabled` baseline: opt-out
  (CCPA) defaults to granted, opt-in (prior consent) defaults to denied.

### Fixed

- Keep the opt-out `granted` default on a fresh load — the load-time `update` is
  skipped when there is no recorded consent, so a fresh visitor's mode-aware
  default stands.
- GPC forces clamped categories off by default under opt-out even with
  `allowGpcOverride`; opt-out now reads a category as consented before the
  visitor interacts, so JS-gated embeds are not stranded.

## [0.3.0] - 2026-07-03

### Added

- `<consent-pour>` — a consent-gated PourNow wine-finder embed element.

## [0.2.0] - 2026-07-03

### Added

- Category-parameterized gate helpers: `hasConsent` / `requireConsent` /
  `promptConsent` / `onConsentChange` (with back-compat `*Analytics*` aliases),
  exposed on the `window` namespace as the imperative consent API.
- `<consent-embed category>` gates on a specific category; `ConsentGate` targets
  a configurable gate category.
- Configurable gate category and per-category `gpc` clamp set, so GPC honors the
  exact set of clamped categories.
- `data-require-consent` click delegation and the full window API surface.
- The consent-change event now carries every category's state; renamed to
  `consent:change`.

### Added — testing

- Vitest with jsdom and the first `deepMerge` suite.

## [0.1.5] - 2026-07-02

- Initial published baseline.

[Unreleased]: https://github.com/Kraftwerk-Design/consent/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/Kraftwerk-Design/consent/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/Kraftwerk-Design/consent/releases/tag/v0.1.5
