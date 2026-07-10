# Assume-denied Consent Mode default — design

**Date:** 2026-07-10
**Status:** Approved; implemented on `feat/assume-denied-consent-default`

## Problem

`renderGoogleConsentDefaultScript()` returns a synchronous, cookie- and
GPC-aware Consent Mode `default` `<script>` to inline in `<head>` above the
Google tag/GTM container. It exists to close a **race**: the init-time
`gtag('consent','default',…)` runs inside the *deferred* bundle — after any
Google tag already in `<head>` — so a returning opted-out visitor can be fired
**granted, then flipped to denied**.

To make the synchronous default match each visitor's *actual* saved state, the
script re-derives everything at runtime: it parses the consent cookie, reads
`navigator.globalPrivacyControl`, and replays the per-category grant logic from a
serialized config payload (`P`). That payload **duplicates the consent config
into the page**. On a server-rendered/Twig site there is no JS runtime at render
time to call the function, so consumers paste a pre-generated minified IIFE and —
if they override `cookieName`, `categories`, or `allowGpcOverride` — hand-edit
the embedded `P` object *inside minified JavaScript*. That hand-maintained
duplicate is the pain: unreadable, drift-prone, and a second source of truth for
the same config.

## Key insight: the race only exists for *unblocked* tags

There are two integration models:

- **Model A — GTM is `type="text/plain"`, un-gated by our bundle.** The container
  is inert until the bundle flips it, and the bundle only flips it *after*
  pushing the consent default (`run.ts` calls `pushGoogleConsentDefault()` at
  line 128, before `CookieConsent.run()` at line 131, which is what releases the
  blocked scripts). The tag therefore **cannot execute before the bundle**. There
  is **no race**, and no head script is needed at all.

- **Model B — GTM/gtag loads *unblocked* in `<head>`** and relies on Consent Mode
  signals (typical opt-out / "advanced" Consent Mode with cookieless modeling).
  The tag loads and reads `consent default` on its own, early, before the
  deferred bundle runs. This is the only place the synchronous head script earns
  its keep.

## Decision: assume denied until the bundle runs

Instead of reproducing each visitor's exact state synchronously, the head script
pushes **`denied` for the consent-gated signals** (necessary/`readOnly` signals
granted) plus `wait_for_update: 500`, unconditionally. This is Google's own
canonical baseline snippet.

**It solves the race by construction.** Nothing ever starts granted, so the only
flips that can occur afterward are **denied → granted** (when the bundle reads
the real state and pushes an `update`). The dangerous **granted → denied** flip
becomes impossible. `wait_for_update: 500` holds the unblocked tag's first pings
long enough for the bundle to upgrade a consenting visitor with no data loss, as
long as the bundle runs within the window.

**It eliminates the duplication.** The head script no longer depends on config —
no cookie regex, no GPC branch, no per-category payload — so there is nothing to
duplicate, hand-edit, or regenerate. It becomes a static constant.

**Accepted trade-off:** a returning *granted* visitor no longer gets an instant
granted default; they start denied and wait for the bundle's `update` (covered by
`wait_for_update` unless the bundle is slower than the window). This is a
first-ping modeling nicety, never a compliance issue — denied is always the safe
side. The user has accepted this.

## The opt-out fresh-visitor constraint (load-bearing)

Assume-denied is **not pure deletion** on the bundle side. In **opt-out** mode a
*fresh* visitor is meant to be **granted** (consent-by-default). If the default is
`denied`, that visitor must be actively **upgraded** by the bundle once it runs —
otherwise they stay denied forever, because opt-out visitors never "opt in." The
current bundle relies on `pushGoogleConsentDefault()` pushing a mode-aware
*granted* default for this case, and `run.ts:175–181` **deliberately skips**
pushing an update for fresh visitors on load.

Two `consent default` commands cannot fix this: a second `default` pushed after
the tag has loaded does not upgrade it — only an `update` does. So the bundle
must push a **mode-baseline `update`** on load for fresh visitors.

## Design

### 1. Head script → static constant

`renderGoogleConsentDefaultScript()` keeps its signature and its `googleConsentMode`
off → `''` behavior, but returns a **fixed** `<script>` string:

```html
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('consent', 'default', {
    security_storage: 'granted',
    functionality_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500
  });
</script>
```

- The granted signals mirror the default config's `readOnly` (necessary)
  category; the denied signals are the consent-gated ones. This matches the
  shipped default config. Denying is always safe, so the constant stays correct
  even for sites that remap signals — the worst case is a necessary feature
  waiting a few hundred ms for the bundle. (Implementation note: the exact signal
  list may be derived once from the default config so it can't silently diverge
  from the shipped mapping, but the *output is config-independent* — it does not
  read the consumer's overrides.)
- Keeping it a function preserves backward compatibility for existing importers
  and the `googleConsentMode: false → ''` contract.

**Deleted from `src/googleConsentMode.ts`:**

- The `payload` object + the vanilla-JS `body` IIFE (the cookie regex, GPC read,
  per-category grant loop, signal aggregation).
- `serializeForScript()` — only used to embed `P`.
- `escapeRegExp()` — only used to build `P.rx`; `consentCookie.ts` keeps its own
  copy for real cookie reads.

### 2. Bundle default → static denied; upgrade fresh opt-out visitors

- `pushGoogleConsentDefault()` pushes a **static** default:
  `computeSignals(category => category.readOnly)` (readOnly granted, everything
  else denied) plus `wait_for_update: 500`. It no longer reads the cookie or GPC.
  This is correct for **both** models: in Model B it is idempotent with the head
  script's identical default; in Model A it is the sole default.
- `run.ts` `.then()` on load:
  - **Returning visitor** (`CookieConsent.validConsent()`): `pushGoogleConsentUpdate()`
    (unchanged — `hasConsent`-based, already GPC-clamped; this already reproduces
    what the old cookie-aware default computed for returning visitors).
  - **Fresh visitor** (no valid consent): push a **mode-baseline `update`** —
    `computeSignals(category => (category.enabled ?? false) && !gpcClampedOff(category.id))`.
    In opt-out this upgrades to granted; in opt-in it is denied (a harmless no-op
    against the denied default). This is the surviving half of the old
    `categoryGrantedByDefault` "no saved cookie" branch, relocated from a
    *default* computation to a fresh-visitor *update*.
- **Delete `categoryGrantedByDefault()`** — its saved-cookie branch is redundant
  with `pushGoogleConsentUpdate`/`hasConsent`; its no-cookie branch relocates as
  above.

**Kept:** `computeSignals`, `getGtag`, `pushGoogleConsentUpdate`.

### 3. Tests

- `renderGoogleConsentDefaultScript.test.ts` (~189 lines): replace almost
  entirely with a small test that the function returns the fixed constant and
  `''` when `googleConsentMode` is off.
- `readmeGcmSnippet.test.ts` (~54 lines): **delete.** It is a drift-guard between
  the generated script and a pasted docs block; a static snippet cannot drift, so
  the guard is moot. (Remove the `<!-- gcm-default-script:start/end -->` markers
  from the doc too.)
- `googleConsentMode.test.ts` / `run.gcm.test.ts`: update for the static default
  and add coverage for the fresh opt-out → mode-baseline-update upgrade (the
  load-bearing new behavior), and that a returning opted-out visitor never passes
  through granted.

### 4. Docs (`docs/google-consent-mode.md`)

- Collapse "Synchronous `<head>` default" (64–95) and "Server-rendered / Twig"
  (97–145) into one short section: paste the fixed snippet above GTM; explain
  `wait_for_update` and that returning granted visitors upgrade once the bundle
  runs. Delete the entire "hand-edit the `P` object" guidance.
- **Add a Model A note:** if GTM is `type="text/plain"` and released by the
  bundle, the head script is **not needed** — the bundle's default-then-release
  already forecloses the race. The snippet is only for unblocked-tag (Model B)
  pages.
- Note the opt-out behavior: with a Model B unblocked tag, a fresh opt-out
  visitor starts denied and is upgraded to granted by the bundle on load.

## Out of scope / non-goals

- No CLI, build-time generator, or "readable/split config" head script — the
  static snippet removes the reason those were being considered.
- No PHP/Twig port of the grant logic.
- Meta Pixel consent (separate module) is untouched.

## Risk / correctness summary

- **Race:** eliminated by construction (only denied→granted flips possible).
- **Opt-out fresh visitors:** preserved via the mode-baseline update on load —
  the one piece that must be implemented, not merely deleted.
- **Returning granted first-ping fidelity:** depends on `wait_for_update` timing;
  accepted.
- **Model A:** unaffected and no longer needs a head script.
