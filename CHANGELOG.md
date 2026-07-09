# Changelog

All notable changes to `@kraftwerkdesign/consent` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Kraftwerk-Design/consent/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/Kraftwerk-Design/consent/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Kraftwerk-Design/consent/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/Kraftwerk-Design/consent/releases/tag/v0.1.5
