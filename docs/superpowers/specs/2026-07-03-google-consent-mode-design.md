# Google Consent Mode v2 (optional) — design

**Date:** 2026-07-03 (revised 2026-07-08: retargeted to CCPA opt-out; default
command is now mode-aware)
**Status:** Approved

## Problem

Some sites want to feed consent state into Google's tags (GA4 / Google Ads via
a GTM container) using **Google Consent Mode v2**. Consent Mode is a *signaling*
protocol: `gtag('consent', 'default'|'update', { …signals })` tells Google tags
whether they may use storage/identifiers. It is optional — most sites won't
enable it — so it must be strictly additive and off by default.

### Compliance framing (CCPA opt-out, and opt-in still supported)

The primary target is now **CCPA opt-out**: for California adults a business may
process/share personal info **by default**, offering a "Do Not Sell/Share"
opt-out and honoring **GPC** as a binding opt-out signal. That is the opposite of
a prior-consent (opt-in) regime — under opt-out, Google tags may load and run by
default and consent is *withdrawn* on opt-out or GPC.

The library must not hardcode one regime. It already carries `mode: 'opt-in' |
'opt-out'` and per-category `enabled`; Consent Mode rides on top of that:

- **opt-out (CCPA):** the `default` command emits **granted** for the mapped
  signals (per each category's `enabled` state), and `update` flips them to
  `denied` when the visitor opts out or GPC is present. Tags typically load
  unblocked; `reloadOnConsentChange` is usually off.
- **opt-in (CPRA + CIPA style):** the `default` command emits **denied**, and
  `update` grants on opt-in. This pairs with the existing `type="text/plain"` +
  reload blocking model.

**GPC is the through-line in both:** because signals derive from the same
consent state the rest of the library uses (`hasConsent`, which honors the GPC
clamp), a GPC visitor's `analytics_storage` / `ad_*` come out `denied`
regardless of mode — and under CCPA that is a binding opt-out, so it matters
more, not less.

The blocking/loading of GTM itself stays the **consumer's** choice (how the GTM
snippet is tagged). The library only manages *signals*; it never blocks or
unblocks tags. Whether a site is opt-in-blocked or opt-out-unblocked is a config
+ markup decision, not library code.

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
   * Enable Google Consent Mode v2 signaling. Off when omitted. Pushes a consent
   * `default` at init and a consent `update` on every change, mapped from each
   * category's `google` signals. Direction follows `mode`: opt-out defaults to
   * granted (CCPA); opt-in defaults to denied. GPC forces the clamped signals
   * denied either way.
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

### Signal derivation

- **Managed set** = the union of every category's `google` array. Signals never
  mapped are left unmanaged (never pushed).
- A signal is `'granted'` if **any category that maps it counts as granted**,
  else `'denied'`. What "granted" means differs between the two commands:

  - **`update`** (a real, recorded choice): a category is granted iff
    `hasConsent(category.id)` — the same GPC-honoring check the rest of the
    library uses. This is unchanged by mode.
  - **`default`** (first load, *before* any recorded choice): must be
    **mode-aware**, because `hasConsent` is `false` pre-interaction in *both*
    modes (`validConsent()` is false until a choice is saved) — a naive derive
    would wrongly emit `denied` for an opt-out site. So the default uses:
    - **opt-out:** a category is granted iff it is `enabled` (its opt-out
      baseline) **and not GPC-clamped-off** — i.e. `granted` unless GPC (or an
      already-saved opt-out) applies.
    - **opt-in:** `denied` for every consent-gated category (only always-on
      `necessary`-mapped signals like `security_storage` are `granted`).
- GPC is applied in the default too: a GPC-clamped category is forced `denied`
  regardless of mode/`enabled` (unless `allowGpcOverride`), mirroring
  `buildCategories()` / `isGpcClamped()` in `run.ts`.
- "Always granted" signals (e.g. `security_storage`) need no special case — they
  fall out of mapping them to the always-on `necessary` category.

### Commands

- **Default** — `gtag('consent', 'default', { …managed signals per the
  mode-aware rule…, wait_for_update: 500 })`, pushed once at the top of
  `runConsent()` (before `CookieConsent.run`). When the site blocks GTM until a
  choice (opt-in), this is trivially early; when GTM loads unblocked (opt-out),
  the consumer additionally inlines the same default in `<head>` above GTM so it
  is read before the container.
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

## Load model follows `mode` (config/markup, no library change)

The same `googleConsentMode: true` serves both regimes; which one a site runs is
a config + markup decision the library doesn't encode:

- **CCPA opt-out (load by default):** `mode: 'opt-out'`, categories `enabled:
  true`, GTM snippet **not** blocked, inline the (mode-aware, granted) default in
  `<head>` above GTM, and `reloadOnConsentChange: false`. Opt-out / GPC push an
  `update` flipping signals to `denied`.
- **Opt-in (block until choice):** `mode: 'opt-in'`, GTM tagged
  `type="text/plain"`, default emits `denied`, `update` grants on opt-in, and
  the existing reload re-activates blocked tags.

The library's job is identical in both — emit the mode-correct signals; it never
blocks or unblocks the tag itself.

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
  Mode" subsection (CCPA opt-out vs opt-in, mode-aware default, per-category
  mapping, GPC note, load-model config)

## Tests

Vitest + jsdom, mocking `vanilla-cookieconsent` and `../gpc` as the existing
suites do; assert against `window.dataLayer`.

1. **Off:** feature omitted/false → no pushes at init or on change; `dataLayer`
   untouched.
2. **Default, opt-in mode:** `mode: 'opt-in'` → `['consent','default',{…}]` with
   `analytics_storage`/`ad_*` `denied`, `security_storage`/`functionality_storage`
   `granted` (from always-on `necessary`), and `wait_for_update: 500`.
3. **Default, opt-out mode:** `mode: 'opt-out'`, analytics `enabled: true` →
   default emits `analytics_storage`/`ad_*` **`granted`** at first load (pre-
   interaction), reflecting the opt-out baseline.
4. **Update on choice:** recording a choice → `['consent','update',{…}]` with
   signals from `hasConsent()` (grant on opt-in; deny on opt-out).
5. **GPC honored in both modes:** GPC signal present → analytics/ad signals stay
   `denied` in the default **even in opt-out mode** (binding opt-out) and in the
   update, unless `allowGpcOverride`.
6. **Managed set:** only mapped signals appear; unmapped signals never pushed.
7. **dataLayer reuse:** a pre-existing `window.dataLayer` / `gtag` is reused, not
   replaced; pushes use the `arguments` form.

## Out of scope

- Options object (`ads_data_redaction`, `url_passthrough`, region targeting,
  configurable `alwaysGranted`/`waitForUpdate`) — a later, additive change.
- Automating the load model (un-blocking GTM, emitting the head snippet) —
  handled by the consumer via config/markup, documented but not code.
- Central `analytics → [signals]` mapping — rejected in favor of per-category
  `google` for consistency with existing category flags.
