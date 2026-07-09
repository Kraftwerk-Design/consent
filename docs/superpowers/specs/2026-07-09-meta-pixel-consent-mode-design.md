# Meta Pixel Consent Mode (optional) — design

**Date:** 2026-07-09 (revised 2026-07-09 after spec review: reframed the page-load
model — the library cannot own the pre-`init` state; opt-out "not granted" now
emits revoke + LDU; GPC/override semantics corrected)
**Status:** Approved (design), pending re-review

## Problem

Some sites run the **Meta Pixel** (`fbq`) and want to feed consent state into it
the way `googleConsentMode` already does for Google tags. Meta exposes its own
signaling protocol, but it differs from Google Consent Mode in ways that shape —
and constrain — the design:

1. **It is binary.** There are no per-purpose signals. `fbq('consent','revoke')`
   holds all pixel events; `fbq('consent','grant')` releases them. The whole
   pixel is on or off — not a map of `analytics_storage` / `ad_*` states.
2. **CCPA has a separate lever.** For US-state opt-outs, Meta's sanctioned path
   is **Limited Data Use (LDU)** — `fbq('dataProcessingOptions', ['LDU'], 0, 0)`
   (the `0, 0` lets Meta auto-geolocate). LDU keeps events flowing but restricts
   processing (no cross-context behavioral ads / "sale"), preserving Meta's
   *modeled* conversions.
3. **No update buffering.** This is the load-bearing difference from Google
   Consent Mode. GCM's `default` can safely emit `granted` and be corrected by a
   later `update` because gtag **holds tags** via `wait_for_update: 500`. Meta
   has **no equivalent** — the pixel fires `PageView` at `fbq('init', …)`
   immediately, and `dataProcessingOptions` must be set **before** `init`. There
   is no window in which a late correction can catch an already-fired PageView.

Like Consent Mode, this is optional and must be strictly additive and off by
default. The library manages *signals only* — it never owns, injects, or blocks
the pixel base code.

### What the library can and cannot guarantee (consequence of #3)

Because the pixel base code lives in `<head>` and fires `PageView` before the
app-entry module (where `initConsent()` runs) executes, **the library cannot
control the page-load PageView.** It runs too late. This is true in *both* modes
and is the central design constraint:

- **The library reliably manages the live session** — on a consent *change* it
  applies grant / revoke / LDU so all *subsequent* events reflect the choice.
- **The authoritative page-load / reload state is the consumer's responsibility**,
  set inline in `<head>` before `fbq('init', …)`. The library's init-time
  "default" push is **best-effort** (it only helps when the pixel base code is
  itself deferred until after `initConsent()`), not a guarantee.

This mirrors how `googleConsentMode` already instructs opt-out sites to inline
the `default` in `<head>` above GTM — Meta just can't lean on the buffer to
paper over a returning visitor's saved state, so the inline requirement is
firmer and applies to opt-out too, not only opt-in.

### Compliance framing

The feature rides on the existing `mode: 'opt-in' | 'opt-out'` + per-category
`enabled` + GPC clamp:

- **opt-in (GDPR / prior consent):** pixel starts **revoked**; `grant`ed when a
  `meta`-flagged category is consented; withdrawal re-`revoke`s. LDU is **never**
  used in opt-in mode (GDPR wants a full hold, and DPO is a US-state construct).
- **opt-out (CCPA):** pixel starts **granted**; opting out emits
  `fbq('dataProcessingOptions', ['LDU'], 0, 0)` **and** `fbq('consent','revoke')`
  (see "strict opt-out" below); opting back in `grant`s and clears LDU.
- **GPC is the through-line.** A GPC signal on a clamped `meta` category forces
  "not granted" by default — **independent of `allowGpcOverride`** (override only
  unlocks the toggle / lets a *saved* opt-in persist; it never leaves the
  category on-by-default for a GPC visitor). So a GPC visitor is `revoke`d under
  opt-in, and revoke + LDU under opt-out. This matches `gpcClampedOff()` and
  commit `3ab4f47`.

### Strict opt-out: revoke + LDU (design decision)

`['LDU'], 0, 0` only takes effect for visitors Meta geolocates to a covered US
state. LDU **alone** would therefore leave an opted-out visitor *outside* those
states fully tracked despite a recorded opt-out. So opt-out "not granted" emits
**both**: `dataProcessingOptions(['LDU'], …)` (limits processing where covered,
signals intent) **and** `fbq('consent','revoke')` (holds events everywhere). The
recorded opt-out thus stops the pixel for every visitor. Trade-off, accepted:
revoke also suppresses modeled conversions in covered states, so LDU is largely
belt-and-suspenders here — it matters mainly as an explicit DPO signal and for
the moment the visitor opts back in (grant + clear LDU). A future
`metaOptOutMode: 'ldu' | 'revoke'` option could relax this; out of scope now.

## Decision

Add an optional, off-by-default `metaPixelConsentMode` boolean. When enabled the
library:

1. Pushes a **best-effort default** state at init (only authoritative if the
   pixel base code is deferred past `initConsent()`).
2. Pushes an **update** on every consent change, wherever the library already
   dispatches its consent-change event — this is the reliable, live-session path.

Which categories grant the pixel is expressed **per category** via a new boolean
`meta` flag, consistent with the per-category `google` array. Because Meta is
binary the flag is a `boolean`: the pixel is granted if **any** `meta`-flagged
category counts as granted (OR).

Naming: the config flag is `metaPixelConsentMode` (not `metaConsentMode`) —
Meta's server-side Conversions API (CAPI) is out of scope, so the name is scoped
to the browser pixel. The module and functions carry the same scoping for
consistency: `src/metaPixelConsentMode.ts`, `pushMetaPixelConsent*`.

## API

### Enable (off by default)

```ts
interface ConsentConfig {
  // …existing…
  /**
   * Enable Meta Pixel consent signaling. Off when omitted. Grants/revokes the
   * pixel (`fbq('consent', …)`) from each category's `meta` flag on consent
   * change. Direction follows `mode`: opt-in starts revoked and grants on
   * consent; opt-out starts granted and, on opt-out, applies Limited Data Use
   * (LDU) *and* revokes. GPC forces the clamped categories off either way.
   *
   * The library manages the live session only — it cannot suppress the page-load
   * PageView (which fires before initConsent runs). Set the pre-`fbq('init')`
   * state inline in `<head>` yourself (see README). The pixel base code must
   * load before initConsent() — the library never injects or stubs `fbq`.
   */
  metaPixelConsentMode: boolean
}
```

Default in `defaultConsentConfig`: `metaPixelConsentMode: false`.

### Per-category flag

```ts
interface ConsentCategory {
  // …existing…
  /** Grants the Meta Pixel when this category is consented (binary). */
  meta?: boolean
}
```

The default `analytics` category gains `meta: true` (inert unless the feature is
enabled), alongside its existing `google: [...]` map. `necessary` does **not**
set `meta`.

## Behavior

### Grant derivation

The pixel counts as **granted** if **any** `meta`-flagged category counts as
granted, else **not granted**. "Granted" per category differs between the two
commands, reusing the exact predicates `googleConsentMode.ts` uses
(`computeSignals` callers):

- **update** (a recorded choice, pushed *after* `CookieConsent.run()`): granted
  iff `hasConsent(category.id)` — the GPC-honoring check the rest of the library
  uses. Mode-independent.
- **default** (pushed *before* `CookieConsent.run()`): mode-aware, granted iff
  `(category.enabled ?? false) && !gpcClampedOff(category.id)`. It uses the
  `enabled` baseline, **not** `hasConsent`, for a timing reason:
  `pushMetaPixelConsentDefault()` runs before `CookieConsent.run()` initializes
  `acceptedCategory`, so `hasConsent` isn't reliable yet. (Note: `hasConsent`
  returns *true* pre-interaction in opt-out mode per `analytics.ts` — so it is
  not usable as a proxy for the default even conceptually. Same rationale as
  GCM's `pushGoogleConsentDefault`.)

Consequence to state plainly: the default reflects the *config baseline*, not a
returning visitor's *saved* choice. In opt-out mode a returning opted-out visitor
computes `granted` at the default. This is exactly why the default is best-effort
and the inline `<head>` state is required (see page-load section). The post-run
`.then()` update (guarded by `validConsent()`) will apply the correct state for
subsequent events, but cannot retract the page-load PageView.

### Applying state — the mode-aware core

Given a single `granted` boolean and the resolved `mode`:

```
granted                → fbq('consent','grant');  if mode === 'opt-out': fbq('dataProcessingOptions', [])
not granted, opt-in    → fbq('consent','revoke')
not granted, opt-out   → fbq('dataProcessingOptions', ['LDU'], 0, 0); fbq('consent','revoke')
```

- `fbq('dataProcessingOptions', [])` (empty array) clears LDU — used when opting
  back in under opt-out so normal processing resumes on grant.
- **opt-in mode never emits any `dataProcessingOptions` call** (invariant; tested).
- `0, 0` lets Meta auto-geolocate LDU (no country/state config).

### Commands & wiring

- **Default** — `pushMetaPixelConsentDefault()`, at the top of `runConsent()`
  right after `pushGoogleConsentDefault()` (before `CookieConsent.run`). Applies
  `applyMetaPixelState(granted)` with the default predicate. Best-effort per
  above.
- **Update** — `pushMetaPixelConsentUpdate()`, pushed wherever
  `pushGoogleConsentUpdate()` fires today: `onFirstConsent`, `onConsent`,
  `onChange`, and the post-`applyGpcIfNeeded()` settle in the `.then()` (guarded
  by `validConsent()`, matching `run.ts:133`).

### Page-load state (consumer responsibility — for both modes)

The library cannot control the head PageView. The consumer sets the pre-`init`
state inline in `<head>` before `fbq('init', …)`:

- **opt-in:** inline `fbq('consent','revoke');` before `fbq('init', …)`. The
  pixel holds all events until the library `grant`s on consent. Static and
  reliable.
- **opt-out:** a static inline snippet cannot reproduce a *returning* visitor's
  saved opt-out (it would need to read the consent cookie inline). Two supported
  patterns, documented with their trade-offs:
  1. **Recommended for reliable opt-out:** treat the pixel base code as a gated
     script — block it (`type="text/plain" data-category` or defer its load)
     until the library reports consent, so `init`/PageView only fire post-choice.
     This collapses opt-out to the opt-in loading model for Meta specifically,
     which is the only way to reliably honor a returning opt-out given #3.
  2. **Fire-by-default (accepts a one-PageView leak on the opt-out reload):**
     load the pixel normally; a returning opted-out visitor's *first* PageView on
     each load fires before the library revokes, then all subsequent events are
     held. Only acceptable where that single modeled event is tolerable.

This limitation is inherent to Meta's protocol, not to this library, and must be
called out prominently in the README.

### `fbq` safety — the key divergence from `getGtag`

`getFbq()` returns `window.fbq` **only if it is already a function**, otherwise a
**no-op**. It deliberately does **not** synthesize an `fbq` stub the way
`getGtag()` shims `gtag`:

- The standard Meta base snippet begins `if (f.fbq) return;`. A competing stub we
  define would make that guard true and **suppress pixel initialization
  entirely** — the pixel would never load.
- We cannot safely replicate Meta's own `.queue` stub for the same reason.

Contract: **the pixel base code must load before `initConsent()`** (standard
`<head>` placement). If `fbq` is absent when a command would fire, the library
no-ops rather than risk breaking the pixel.

- No-op when `typeof window === 'undefined'` (SSR-safe).
- Early-return in both push functions unless `metaPixelConsentMode` is on.

### Off path

When `metaPixelConsentMode` is `false`/omitted, neither command is pushed and
`fbq` is never called, even if categories carry `meta: true`.

## Isolation

New module `src/metaPixelConsentMode.ts`:

- `getFbq(): (...args) => void` — real `window.fbq` or a no-op; never a stub.
- `computeMetaPixelGranted(granted): boolean` — OR over `meta`-flagged categories.
- `applyMetaPixelState(granted): void` — the mode-aware grant/revoke/LDU switch.
- `pushMetaPixelConsentDefault(): void`
- `pushMetaPixelConsentUpdate(): void`

Both push functions read `getConsentConfig()` / `hasConsent()` internally, so
`run.ts` gains only a few one-line calls. Like Google Consent Mode, these stay
**internal** — not re-exported from `index.ts`; the only public surface change is
the two config fields.

### Shared helper (small, justified refactor)

`gpcClampedOff(categoryId)` is currently a private helper in
`googleConsentMode.ts`. Move it to `config.ts` (alongside `isGpcClamped`) and
export it, so both consent-mode modules share the one GPC-clamp rule.
`googleConsentMode.ts` then imports it from `config`. Verified no import cycle:
`config.ts` imports from `gpc.ts`, and `gpc.ts` imports nothing from `config`.
`gpcClampedOff` is **independent of `allowGpcOverride`** and must stay so.

## Implementation note — verify DPO runtime behavior first

Meta documents `dataProcessingOptions` primarily as *pre-`init`* configuration.
Applying `['LDU']` on a mid-session opt-out and clearing with `[]` on opt-back-in
(both *after* `init`) is relied on by the opt-out path but is not prominently
documented. Before/while implementing, do a quick manual spike (real pixel, watch
the `dpo`/`dpoco`/`dpost` params on outgoing `/tr` requests in the Network tab
across a grant→opt-out→grant cycle) to confirm runtime toggling takes effect. If
it doesn't, the opt-out path leans entirely on `revoke` and LDU becomes init-only
(README-documented as a static inline snippet). Note the outcome in the README.

## Files

- `src/metaPixelConsentMode.ts` — new module (functions above)
- `src/metaPixelConsentMode.test.ts` — unit tests (new)
- `src/run.meta.test.ts` — run-wiring tests, mirroring `run.gcm.test.ts` (new)
- `src/config.default.ts` — add `ConsentCategory.meta`,
  `ConsentConfig.metaPixelConsentMode` (default `false`), and `meta: true` on the
  default `analytics` category
- `src/config.ts` — add exported `gpcClampedOff()` (moved from
  `googleConsentMode.ts`)
- `src/googleConsentMode.ts` — import `gpcClampedOff` from `config` (remove local
  copy; no behavior change)
- `src/run.ts` — call `pushMetaPixelConsentDefault()` after
  `pushGoogleConsentDefault()`; pair `pushMetaPixelConsentUpdate()` with each
  `pushGoogleConsentUpdate()`
- `README.md` — `metaPixelConsentMode` row in the config table + a "Meta Pixel
  Consent Mode" subsection: per-category `meta` mapping, the **page-load /
  pre-`init` responsibility for both modes** (opt-in inline revoke; opt-out
  gate-or-accept-leak), strict opt-out (revoke + LDU) with the LDU geo caveat,
  and the base-code-loads-first / no-stub caveat

## Tests

Vitest + jsdom, mocking `vanilla-cookieconsent` and `./gpc` as the existing
suites do. Meta has no `window.fbq` in the test env, so tests define a
`window.fbq` spy (`vi.fn()`) and assert against its recorded calls.

**`metaPixelConsentMode.test.ts` (unit):**

1. **Off:** feature omitted/false → push functions call nothing; `window.fbq`
   untouched.
2. **Absent fbq:** feature on, no `window.fbq` → no throw, **no stub created**
   (`window.fbq` stays undefined).
3. **Default, opt-in:** `mode: 'opt-in'` → `fbq('consent','revoke')`; **no**
   `dataProcessingOptions` call.
4. **Default, opt-out (granted baseline):** `mode: 'opt-out'`, `meta` category
   `enabled: true` → `fbq('consent','grant')` + `fbq('dataProcessingOptions', [])`;
   never an `['LDU']` call.
5. **Update grant:** recorded consent on a `meta` category → `fbq('consent','grant')`
   (+ `dataProcessingOptions', []` in opt-out; nothing DPO in opt-in).
6. **Update opt-out → revoke + LDU:** opt-out withdrawal →
   `fbq('dataProcessingOptions', ['LDU'], 0, 0)` **and** `fbq('consent','revoke')`.
7. **Update opt-in → revoke:** opt-in withdrawal / no consent →
   `fbq('consent','revoke')`, and **no** `dataProcessingOptions` call.
8. **opt-in never emits DPO:** across default + update + grant + revoke in opt-in
   mode, `dataProcessingOptions` is never called (invariant).
9. **GPC in opt-in:** GPC on the clamped category → default `revoke`.
10. **GPC in opt-out — override-independent:** GPC on the clamped category →
    default revoke + LDU **both with `allowGpcOverride: false` and `true`**
    (clamp is override-independent; this guards commit `3ab4f47`).
11. **OR across categories:** two `meta` categories, one consented → granted.

**`run.meta.test.ts` (wiring, mirrors `run.gcm.test.ts`):**

1. Default pushed at init when on; nothing when off (`window.fbq` untouched).
2. `onChange` pushes an update reflecting `hasConsent`.
3. Fresh no-consent load does not push an update over the default (`validConsent`
   guard).
4. **Returning visitor:** `validConsent()` true on load + a recorded opt-out →
   the `.then()` update applies revoke (+ LDU in opt-out). This is the most
   important wiring path given the page-load limitation; assert it explicitly.

## Out of scope

- **Meta Conversions API (server-side / CAPI)** — browser pixel only.
- `metaOptOutMode: 'ldu' | 'revoke'` toggle — opt-out is fixed at revoke + LDU
  for now; an additive option later.
- Configurable LDU country/state — `0, 0` (auto-geolocate) only.
- Owning/injecting the pixel base code or an `fbq` stub — consumer places base
  code in `<head>`; library only signals.
- Multiple distinct pixels with independent consent — the signal is global to
  `fbq`.
- Automatically suppressing the page-load PageView — impossible from library code
  given Meta's no-buffer protocol; handled by the consumer's inline/gating choice.
