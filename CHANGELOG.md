# Changelog

All notable changes to `@kraftwerkdesign/consent` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/Kraftwerk-Design/consent/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/Kraftwerk-Design/consent/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/Kraftwerk-Design/consent/releases/tag/v0.1.5
