# Meta Pixel Consent Mode (optional) — design

**Date:** 2026-07-09
**Status:** Approved

## Problem

Some sites run the **Meta Pixel** (`fbq`) and want to feed consent state into it
the way `googleConsentMode` already does for Google tags. Meta exposes its own
signaling protocol, but it differs from Google Consent Mode in two ways that
shape the design:

1. **It is binary.** There are no per-purpose signals. `fbq('consent','revoke')`
   holds all pixel events; `fbq('consent','grant')` releases them. The whole
   pixel is on or off — not a map of `analytics_storage` / `ad_*` states.
2. **CCPA has a separate lever.** For US-state opt-outs, Meta's sanctioned path
   is **Limited Data Use (LDU)** — `fbq('dataProcessingOptions', ['LDU'], 0, 0)`
   (the `0, 0` lets Meta auto-geolocate). LDU keeps events flowing but restricts
   processing (no cross-context behavioral ads / "sale"), preserving Meta's
   *modeled* conversions. A hard `revoke` would instead drop that modeled signal.

Like Consent Mode, this is optional and must be strictly additive and off by
default. The library manages *signals only* — it never owns, injects, or blocks
the pixel base code.

### Compliance framing (mirrors `googleConsentMode`)

The feature rides on the existing `mode: 'opt-in' | 'opt-out'` + per-category
`enabled` + GPC clamp, exactly as Google Consent Mode does:

- **opt-in (GDPR / prior consent):** the pixel starts **revoked** and is
  `grant`ed only when a `meta`-flagged category is consented. Withdrawal
  re-`revoke`s. LDU is **not** used — GDPR calls for a full hold, not LDU.
- **opt-out (CCPA):** the pixel starts **granted**; opting out applies **LDU**
  (events still flow, modeled) rather than a hard revoke; opting back in clears
  LDU. This is the CCPA-correct path.
- **GPC is the through-line in both.** A GPC signal on a clamped `meta` category
  forces "not granted" by default (unless `allowGpcOverride`), so a GPC visitor
  is `revoke`d under opt-in and LDU'd under opt-out — GPC being a binding opt-out
  under CCPA, this matters more, not less.

## Decision

Add an optional, off-by-default `metaPixelConsentMode` boolean. When enabled, the
library:

1. Pushes a **default** Meta consent state at init (before the pixel would fire),
   derived from the initial consent state and `mode`.
2. Pushes an **update** on every consent change, wherever the library already
   dispatches its consent-change event.

Which categories grant the pixel is expressed **per category** via a new boolean
`meta` flag, consistent with the existing per-category `google` array. Because
Meta is binary, the flag is a `boolean` (not a signal list): the pixel is
granted if **any** `meta`-flagged category counts as granted (OR).

Naming: `metaPixelConsentMode` (not `metaConsentMode`) — Meta's server-side
Conversions API (CAPI) is explicitly out of scope, so the name is scoped to the
browser pixel.

## API

### Enable (off by default)

```ts
interface ConsentConfig {
  // …existing…
  /**
   * Enable Meta Pixel consent signaling. Off when omitted. Grants/revokes the
   * pixel (`fbq('consent', …)`) from each category's `meta` flag. Direction
   * follows `mode`: opt-in starts revoked and grants on consent; opt-out starts
   * granted and applies Limited Data Use (LDU) on opt-out instead of revoking.
   * GPC forces the clamped categories off either way. The pixel base code must
   * load before initConsent() (standard `<head>` placement) — the library never
   * injects or stubs `fbq`.
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
set `meta` — the pixel is a tracking concern, not a strictly-necessary one.

## Behavior

### Grant derivation

- The pixel counts as **granted** if **any** `meta`-flagged category counts as
  granted, else **not granted**. What "granted" means per category differs
  between the two commands, reusing the exact predicates Google Consent Mode
  uses:

  - **update** (a real, recorded choice): granted iff `hasConsent(category.id)`
    — the same GPC-honoring check the rest of the library uses. Mode-independent.
  - **default** (first load, before any recorded choice): mode-aware, because
    `hasConsent` is `false` pre-interaction in both modes. Granted iff
    `(category.enabled ?? false) && !gpcClampedOff(category.id)` — i.e. the
    opt-out baseline, minus any GPC clamp. Under opt-in the consent-gated
    category is `enabled: false`, so the default is "not granted".

### Applying state — the mode-aware core

Given a single `granted` boolean and the resolved `mode`:

```
granted                → fbq('consent','grant');  if mode === 'opt-out': fbq('dataProcessingOptions', [])
not granted, opt-in    → fbq('consent','revoke')
not granted, opt-out   → fbq('consent','grant'); fbq('dataProcessingOptions', ['LDU'], 0, 0)
```

- `fbq('dataProcessingOptions', [])` (empty array) clears LDU — used when opting
  back in under opt-out so normal processing resumes.
- In opt-out mode the pixel stays `grant`ed throughout; LDU is the only lever, so
  events keep flowing (modeled) rather than being dropped.
- No country/state config: `0, 0` lets Meta auto-geolocate LDU.

### Commands

- **Default** — `pushMetaConsentDefault()`, pushed at the top of `runConsent()`
  right after `pushGoogleConsentDefault()` (before `CookieConsent.run`). Applies
  `applyMetaState(granted)` with the mode-aware default predicate.

  Ordering caveat: `fbq('consent','revoke')` must precede `fbq('init', …)` for
  the pixel to actually hold pre-consent events. Because `initConsent()` runs
  from an app-entry module that may execute *after* the pixel base code, an
  **opt-in** site must additionally inline `fbq('consent','revoke');` in `<head>`
  before its `fbq('init', …)` — the exact parallel to Google Consent Mode's
  inline `<head>` default. The library's own default push is then defensive/
  idempotent. (Opt-out sites need no inline command; granted is the baseline.)

- **Update** — `pushMetaConsentUpdate()`, pushed wherever
  `dispatchConsentChange()` / `pushGoogleConsentUpdate()` fire today:
  `onFirstConsent`, `onConsent`, `onChange`, and the post-`applyGpcIfNeeded()`
  settle in the `.then()` (guarded by `validConsent()`, so a fresh no-consent
  load does not clobber the mode-aware default — same rule as GCM).

### `fbq` safety — the key divergence from `getGtag`

`getFbq()` returns `window.fbq` **only if it is already a function**, otherwise a
**no-op**. It deliberately does **not** synthesize an `fbq` stub the way
`getGtag()` shims `gtag`:

- The standard Meta base snippet begins `if (f.fbq) return;`. A competing stub
  we define would make that guard true and **suppress pixel initialization
  entirely** — the pixel would never load.
- We also cannot safely replicate Meta's own stub (with `.queue`) for the same
  reason: defining any `fbq` blocks the real base code from initializing.

So the contract is: **the pixel base code must load before `initConsent()`**
(standard `<head>` placement). If `fbq` is absent when a command would fire, the
library no-ops rather than risk breaking the pixel. Documented as a caveat.

- No-op when `typeof window === 'undefined'` (SSR-safe).
- Early-return in both push functions unless `metaPixelConsentMode` is on.

### Off path

When `metaPixelConsentMode` is `false`/omitted, neither command is pushed and
`fbq` is never called, even if categories carry `meta: true`.

## Isolation

New module `src/metaConsentMode.ts`:

- `getFbq(): (...args) => void` — real `window.fbq` or a no-op; never a stub.
- `computeMetaGranted(granted): boolean` — OR over `meta`-flagged categories.
- `applyMetaState(granted): void` — the mode-aware grant/revoke/LDU switch.
- `pushMetaConsentDefault(): void`
- `pushMetaConsentUpdate(): void`

Both push functions read `getConsentConfig()` / `hasConsent()` internally, so
`run.ts` gains only a few one-line calls. Like Google Consent Mode, these
functions stay **internal** — not re-exported from `index.ts`; the only public
surface change is the two config fields.

### Shared helper (small, justified refactor)

`gpcClampedOff(categoryId)` is currently a private helper in
`googleConsentMode.ts`. Move it to `config.ts` (next to `isGpcClamped` /
`hasGpcSignal` usage) and export it, so both consent-mode modules share the one
GPC-clamp rule instead of duplicating it. `googleConsentMode.ts` imports it from
`config` after the move (no behavior change there).

## Load model follows `mode` (config/markup, no library change)

The same `metaPixelConsentMode: true` serves both regimes:

- **CCPA opt-out (load by default):** `mode: 'opt-out'`, `meta` category
  `enabled: true`, pixel base code loads normally, `reloadOnConsentChange: false`.
  Opt-out / GPC apply LDU; opting back in clears it.
- **GDPR opt-in (hold until choice):** `mode: 'opt-in'`, inline
  `fbq('consent','revoke')` before `fbq('init', …)` in `<head>`, base code may
  still load (events held). Consent grants; withdrawal revokes. The existing
  reload re-fires held events as needed.

## Files

- `src/metaConsentMode.ts` — `getFbq`, `computeMetaGranted`, `applyMetaState`,
  `pushMetaConsentDefault`, `pushMetaConsentUpdate` (new)
- `src/metaConsentMode.test.ts` — unit tests (new)
- `src/run.meta.test.ts` — run-wiring tests, mirroring `run.gcm.test.ts` (new)
- `src/config.default.ts` — add `ConsentCategory.meta`,
  `ConsentConfig.metaPixelConsentMode` (default `false`), and `meta: true` on the
  default `analytics` category
- `src/config.ts` — add exported `gpcClampedOff()` (moved from
  `googleConsentMode.ts`)
- `src/googleConsentMode.ts` — import `gpcClampedOff` from `config` (remove local
  copy)
- `src/run.ts` — call `pushMetaConsentDefault()` after `pushGoogleConsentDefault()`;
  pair `pushMetaConsentUpdate()` with each `pushGoogleConsentUpdate()`
- `README.md` — `metaPixelConsentMode` row in the config table + a "Meta Pixel
  Consent Mode" subsection (opt-in inline-revoke requirement, opt-out/GPC LDU,
  per-category `meta` mapping, base-code-loads-first caveat)

## Tests

Vitest + jsdom, mocking `vanilla-cookieconsent` and `./gpc` as the existing
suites do. Meta has no `window.fbq` in the test env, so tests define a
`window.fbq` spy (`vi.fn()`) and assert against its recorded calls; the "off"
and "absent fbq" cases assert `fbq` is untouched / never synthesized.

**`metaConsentMode.test.ts` (unit):**

1. **Off:** feature omitted/false → `applyMetaState`/push functions call nothing.
2. **Absent fbq:** feature on but no `window.fbq` → no throw, no stub created
   (`window.fbq` stays undefined).
3. **Default, opt-in:** `mode: 'opt-in'` → `fbq('consent','revoke')`.
4. **Default, opt-out:** `mode: 'opt-out'`, `meta` category `enabled: true` →
   `fbq('consent','grant')` + `fbq('dataProcessingOptions', [])` (LDU cleared);
   never an `['LDU']` call.
5. **Update grant:** recorded consent on a `meta` category → `fbq('consent','grant')`
   (+ `dataProcessingOptions', []` in opt-out).
6. **Update opt-out → LDU:** opt-out withdrawal → `fbq('consent','grant')` +
   `fbq('dataProcessingOptions', ['LDU'], 0, 0)`; **not** a revoke.
7. **Update opt-in → revoke:** opt-in withdrawal / no consent →
   `fbq('consent','revoke')`.
8. **GPC in opt-in:** GPC on the clamped category → default `revoke`.
9. **GPC in opt-out:** GPC on the clamped category → default `grant` + LDU
   (binding opt-out), unless `allowGpcOverride`.
10. **OR across categories:** two `meta` categories, one consented → granted.

**`run.meta.test.ts` (wiring, mirrors `run.gcm.test.ts`):**

1. Default pushed at init when on; nothing when off.
2. `onChange` pushes an update reflecting `hasConsent`.
3. Fresh no-consent load does not push an update over the default (`validConsent`
   guard).

## Out of scope

- **Meta Conversions API (server-side / CAPI)** — this feature is the browser
  pixel only; the name `metaPixelConsentMode` reflects that.
- Configurable LDU country/state — `0, 0` (auto-geolocate) only for now; an
  options object can be added later without changing the grant model.
- Owning/injecting the pixel base code or an `fbq` stub — the consumer places the
  base code in `<head>`; the library only signals.
- Multiple distinct pixels with independent consent — out of scope; the signal is
  global to `fbq`.
