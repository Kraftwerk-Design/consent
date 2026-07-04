# Google Consent Mode v2 (optional) — design

**Date:** 2026-07-03
**Status:** Approved

## Problem

Some sites want to feed consent state into Google's tags (GA4 / Google Ads via
a GTM container) using **Google Consent Mode v2**. Consent Mode is a *signaling*
protocol: `gtag('consent', 'default'|'update', { …signals })` tells Google tags
whether they may use storage/identifiers. It is optional — most sites won't
enable it — so it must be strictly additive and off by default.

### Compliance framing (CPRA + CIPA)

Consent Mode's headline feature, **modeling**, requires the Google tag to load
and send cookieless "pings" **for every visitor, including before consent** —
which still transmits IP/user-agent to Google at page load. That is precisely
the pattern CIPA plaintiffs target, so it is **not** the default posture here.

This library ships **Posture A** only: analytics/GTM stays blocked until opt-in
(the existing `type="text/plain"` + reload model), and Consent Mode is layered
on top purely as **signals**, so Google tags behave correctly once they load and
GPC forces the relevant signals to `denied`. Modeling (**Posture B**: unblocked
GTM) is reachable *later* with no library change — see "A → B path" — but is a
per-site compliance decision, not something this feature encourages.

## Decision

Add an optional, off-by-default `googleConsentMode` boolean. When enabled, the
library:

1. Pushes a **default** consent command at init (before GTM can read it),
   derived from the initial consent state, with `wait_for_update: 500`.
2. Pushes an **update** consent command on every consent change, wherever the
   library already dispatches its consent-change event.

Which signals each category grants is expressed **per category** via a new
`google` field, consistent with the existing per-category flags (`analytics`,
`gpc`, `autoClear`). The mapping is the single source of truth — there are no
hidden signal rules.

The tunable options object (region, `ads_data_redaction`, `url_passthrough`,
configurable `alwaysGranted`/`waitForUpdate`) is **out of scope for now**;
`googleConsentMode` is a boolean. The field type is `boolean` today but the
signal-derivation logic is written so an options object can be added later
without changing the mapping model.

## API

### Enable (off by default)

```ts
interface ConsentConfig {
  // …existing…
  /**
   * Enable Google Consent Mode v2 signaling (Posture A: signals only; GTM stays
   * blocked until opt-in). Off when omitted. Pushes a default-denied consent
   * state at init and a consent 'update' on every change, mapped from each
   * category's `google` signals.
   */
  googleConsentMode: boolean
}
```

Default in `defaultConsentConfig`: `googleConsentMode: false`.

### Per-category signal mapping

```ts
type GoogleConsentSignal =
  | 'ad_storage'
  | 'ad_user_data'
  | 'ad_personalization'
  | 'analytics_storage'
  | 'functionality_storage'
  | 'personalization_storage'
  | 'security_storage'

interface ConsentCategory {
  // …existing…
  /** Google Consent Mode signals this category grants when consented. */
  google?: GoogleConsentSignal[]
}
```

Default categories ship with a sensible (inert unless enabled) mapping:

```ts
{ id: 'necessary', enabled: true, readOnly: true,
  google: ['security_storage', 'functionality_storage'] }

{ id: 'analytics', analytics: true,
  google: ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'] }
```

## Behavior

### Signal derivation (single rule for default *and* update)

- **Managed set** = the union of every category's `google` array. Signals never
  mapped are left unmanaged (never pushed).
- For each managed signal `S`: `'granted'` if **any category that maps `S` is
  currently consented** (`hasConsent(category.id)`), else `'denied'`.
- Because `hasConsent` already honors the GPC clamp, a GPC visitor's
  `analytics_storage` / `ad_*` come out `denied` automatically — no special
  casing. "Always granted" signals (e.g. `security_storage`) fall out naturally
  from mapping them to the always-consented `necessary` category.

### Commands

- **Default** — `gtag('consent', 'default', { …managed signals from initial
  state…, wait_for_update: 500 })`, pushed once at the top of `runConsent()`
  (before `CookieConsent.run`). In Posture A, GTM is blocked until consent, so
  this is trivially early; for Posture B the consumer additionally inlines the
  same default in `<head>` above GTM.
- **Update** — `gtag('consent', 'update', { …managed signals from current
  state… })`, pushed wherever `dispatchConsentChange()` fires today:
  `onFirstConsent`, `onConsent`, `onChange`, and the post-`applyGpcIfNeeded()`
  settle in the `.then()` (so the GPC clamp is reflected).

### dataLayer safety

- Reuse `window.dataLayer` (`window.dataLayer ||= []`); define a `gtag` shim
  only if one isn't already present.
- Push the real `arguments` form GTM/gtag expect (`dataLayer.push(arguments)`),
  **not** an array — an array-form consent command is not recognized.
- Never clobber an existing gtag/dataLayer/GTM bootstrap.
- No-op when `typeof window === 'undefined'` (SSR-safe, matching the rest of the
  package).

### Off path

When `googleConsentMode` is `false`/omitted, neither command is pushed and
`window.dataLayer` is never touched — even if categories carry `google` arrays.

## Isolation

New module `src/googleConsentMode.ts` with two exported functions, both no-ops
when the feature is off:

- `pushGoogleConsentDefault(): void`
- `pushGoogleConsentUpdate(): void`

Both read `getConsentConfig()` and `hasConsent()` internally, so `run.ts` only
gains three or four one-line calls and the signal/mapping logic stays out of the
run wiring. Unit-tested against a fake `window.dataLayer`.

## A → B path (later, no library change)

A site moves from signals-only to modeling by config/markup alone:

1. Un-block the GTM snippet (drop `type="text/plain"` / server re-tagging).
2. Inline the default-denied `gtag('consent','default',…)` in `<head>` above
   GTM (documented snippet).
3. Set `reloadOnConsentChange: false`.

Same `googleConsentMode: true` drives both postures.

## Files

- `src/googleConsentMode.ts` — `pushGoogleConsentDefault` / `pushGoogleConsentUpdate` (new)
- `src/googleConsentMode.test.ts` — tests (new)
- `src/config.default.ts` — add `GoogleConsentSignal`, `ConsentCategory.google`,
  `ConsentConfig.googleConsentMode` (default `false`), and `google` maps on the
  default categories
- `src/run.ts` — call `pushGoogleConsentDefault()` at the top of `runConsent()`;
  pair `pushGoogleConsentUpdate()` with each `dispatchConsentChange()`
- `src/index.ts` — export the `GoogleConsentSignal` type
- `README.md` — `googleConsentMode` row in the config table + a "Google Consent
  Mode" subsection (Posture A, CIPA note, mapping, A→B path)

## Tests

Vitest + jsdom, mocking `vanilla-cookieconsent` and `../gpc` as the existing
suites do; assert against `window.dataLayer`.

1. **Off:** feature omitted/false → no pushes at init or on change; `dataLayer`
   untouched.
2. **Default at init:** enabled → a `['consent','default',{…}]` entry with
   `analytics_storage`/`ad_*` `denied`, `security_storage`/`functionality_storage`
   `granted` (from `necessary`), and `wait_for_update: 500`.
3. **Update on grant:** granting analytics → a `['consent','update',{…}]` entry
   flipping `analytics_storage` + the ad signals to `granted`.
4. **GPC honored:** GPC signal present → analytics/ad signals stay `denied` in
   both default and update despite acceptance state.
5. **Managed set:** only mapped signals appear; unmapped signals never pushed.
6. **dataLayer reuse:** a pre-existing `window.dataLayer` / `gtag` is reused, not
   replaced; pushes use the `arguments` form.

## Out of scope

- Options object (`ads_data_redaction`, `url_passthrough`, region targeting,
  configurable `alwaysGranted`/`waitForUpdate`) — a later, additive change.
- Posture B automation (un-blocking GTM, emitting the head snippet) — handled by
  the consumer via config/markup, documented but not code.
- Central `analytics → [signals]` mapping — rejected in favor of per-category
  `google` for consistency with existing category flags.
