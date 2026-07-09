# Consent framework

Cookie consent built on [vanilla-cookieconsent](https://cookieconsent.orestbida.com/) with GPC support, analytics gating, and consent-gated third-party embeds.

Config is **passed into `initConsent()` as data** — the package ships shared
defaults and each project supplies only its overrides.

## Quick start (new project)

### 1. Install

```bash
npm install @kraftwerkdesign/consent vanilla-cookieconsent
```

`vanilla-cookieconsent` is a peer dependency — you control its version and own
its stylesheet (see **Styles** below).

### 2. Configure

Create your per-project override object (`Partial<ConsentConfig>`), e.g. in
`src/consent.config.ts`:

```ts
import type { ConsentConfig } from '@kraftwerkdesign/consent'

export const consentConfig: Partial<ConsentConfig> = {
  cookieName: 'acme_cookie_consent',
  privacyPolicyUrl: '/policies/privacy-policy',
}
```

Overridable settings:

| Setting | Description |
|---|---|
| `cookieName` | Consent cookie name |
| `privacyPolicyUrl` | Link in preferences modal |
| `categories` | Full category list — replaces the default `necessary`/`analytics` set |
| `gateCategory` | Id of the category gate helpers target by default when a gate names none. Falls back to the `analytics: true` category, then `'analytics'`. |
| `consentChangeEvent` | Custom DOM event dispatched when consent changes (default `consent:change`). Its `detail` is `{ accepted, categories }`. |
| `gpcBannerAckKey` | sessionStorage key for GPC banner dismiss (optional override) |
| `allowGpcOverride` | Let visitors opt back into analytics despite a GPC signal — GPC becomes an overridable default rather than a hard lock (default `false`). See the [GPC note](#notes) |
| `windowNamespace` | Global namespace object for the imperative API (default `KDConsent`) |
| `reloadOnConsentChange` | Reload on non-GPC consent change so blocked scripts activate (default `true`) |
| `googleConsentMode` | Emit Google Consent Mode v2 signals (`default` at init, `update` on change), mapped from each category's `google` list. Off by default. See [Google Consent Mode](#google-consent-mode-v2-optional). |
| `metaPixelConsentMode` | Emit Meta Pixel consent signals (`fbq('consent', …)`) on consent change, mapped from each category's `meta` flag. Opt-out adds Limited Data Use (LDU). Off by default. See [Meta Pixel Consent Mode](#meta-pixel-consent-mode-optional). |
| `buildCopy` | Override banner/preferences copy wholesale (optional) |

Any field of `ConsentConfig` is overridable, including `mode` and `guiOptions`
(vanilla-cookieconsent layout/position). All defaults live in `config.default.ts`;
anything you omit falls through to them.

### 3. Initialize in app entry

```js
import { initConsent } from '@kraftwerkdesign/consent'
import { consentConfig } from './consent.config'

// The package ships no CSS side-effect — import the banner styles yourself.
import 'vanilla-cookieconsent/dist/cookieconsent.css'

initConsent(consentConfig)
```

`initConsent(overrides)` merges the config, exposes the imperative API on
`window`, registers the `<consent-embed>` and `<consent-pour>` elements, and
runs the banner. To run pieces yourself, call `configureConsent(overrides)`
first, then `initConsentApi()`, `defineConsentEmbed()`, `defineConsentPour()`,
and `runConsent()`.

### 4. Templates

**Analytics scripts** — tag third-party scripts so vanilla-cookieconsent blocks them until opt-in:

```html
<script type="text/plain" data-category="analytics" src="…"></script>
```

**SEOmatic** 
```twig
{% set scriptContainer = seomatic.script.container %}
{% if scriptContainer %}
  {% for tag in scriptContainer.data %}
    {% do tag.tagAttrs({
      "type": "text/plain",
      "data-category": "analytics",
    }) %}
  {% endfor %}
{% endif %}  
```

### Google Consent Mode v2 (optional)

Off by default. Set `googleConsentMode: true` to feed consent state into Google's
tags (GA4 / Google Ads via GTM) as Consent Mode signals. The library pushes a
`gtag('consent','default',…)` at init and a `gtag('consent','update',…)` on every
change; it reuses the page's `dataLayer`/`gtag` and never blocks or unblocks the
tag itself.

Map each category to the signals it grants with a `google` array:

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true,
    google: ['security_storage', 'functionality_storage'] },
  { id: 'analytics', analytics: true,
    google: ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'] },
]
```

**Direction follows `mode`** (via each category's `enabled` baseline):

- **opt-out (CCPA):** `mode: 'opt-out'`, consent-gated categories `enabled: true`.
  The `default` emits **granted** for a fresh visitor; opting out (or GPC) pushes
  an `update` flipping the signals to `denied`. Tags usually load unblocked and
  `reloadOnConsentChange` is off. Inline the same default in `<head>` above the
  GTM snippet so it is read before the container loads — use
  [`renderGoogleConsentDefaultScript()`](#synchronous-head-default) so a returning
  opted-out visitor defaults `denied` synchronously, with no dependency on the
  async `update` landing inside `wait_for_update`.

- **opt-in (prior consent):** `mode: 'opt-in'`, GTM tagged `type="text/plain"`.
  The `default` emits **denied**; opting in pushes an `update` granting the
  signals, and the existing reload re-activates the blocked tag.

**GPC is honored in both** — a GPC visitor's `analytics_storage`/`ad_*` come out
`denied` by default in either mode. This holds **even under `allowGpcOverride`**:
override only lets a *saved* opt-in flip the signal to `granted`; a GPC visitor
with no saved opt-in defaults denied. The same rule governs the category's
`enabled` state, so its `text/plain` tags stay blocked until that opt-in too.

#### Synchronous `<head>` default

The init-time `default` runs inside the deferred bundle — **after** any Google
tag already in `<head>`. `renderGoogleConsentDefaultScript()` returns a
`<script>` string to inline **above** the GTM/gtag snippet so a consent `default`
is set before the container loads. Unlike a hand-authored snippet it is
**cookie-aware and GPC-aware**, so a returning opted-out visitor gets `denied`
*synchronously* — never granted-then-flipped:

```ts
import { renderGoogleConsentDefaultScript } from '@kraftwerkdesign/consent'

// Framework-agnostic — emit the string server-side, above your GTM snippet.
const headHtml = renderGoogleConsentDefaultScript()
```

The returned script reads `document.cookie` and `navigator.globalPrivacyControl`
at **runtime**, so it stays correct per-visitor even served from a static/CDN
cache — nothing about the visitor is baked in at render time. Its per-signal
derivation matches the init-time `default` exactly (a parity test guarantees it):
no saved cookie → the mode baseline; a valid saved cookie → the visitor's actual
acceptance (OR-merged across categories); GPC → clamped signals `denied` unless a
saved opt-in under `allowGpcOverride`. `readOnly` categories stay `granted`.
Cookie parsing lives entirely in the package — consumers never touch the cookie
JSON. Returns `''` when `googleConsentMode` is off.

> **Signal mapping + GPC:** a signal is `granted` if **any** category mapping it
> is granted (OR). If you map one Google signal (e.g. `ad_storage`) to both a
> GPC-clamped category and a non-clamped one, GPC won't force it off. Put
> `gpc: true` on every category that maps a signal you want GPC to clamp.

### Meta Pixel Consent Mode (optional)

Off by default. Set `metaPixelConsentMode: true` to feed consent state into the
Meta Pixel. Meta's consent API is **binary** — `fbq('consent','grant')` /
`fbq('consent','revoke')` turn the whole pixel on/off — plus **Limited Data Use
(LDU)** for US-state opt-outs. Flag the granting categories with `meta: true`
(the pixel is granted if **any** `meta` category is consented):

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', analytics: true, meta: true,
    google: ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'] },
]
```

**Direction follows `mode`:**

- **opt-in (GDPR):** the pixel starts revoked and is granted on consent;
  withdrawal revokes. LDU is never used.
- **opt-out (CCPA):** the pixel starts granted; opting out emits **both**
  `fbq('dataProcessingOptions', ['LDU'], 0, 0)` and `fbq('consent','revoke')`,
  and opting back in grants and clears LDU (`fbq('dataProcessingOptions', [])`).

> **LDU geo caveat:** `['LDU'], 0, 0` only takes effect where Meta geolocates a
> covered US state — which is why opt-out also `revoke`s, so a recorded opt-out
> holds events everywhere. The trade-off is that revoke suppresses Meta's modeled
> conversions even in covered states.

**GPC is honored in both** — a GPC visitor's `meta` category is forced off by
default (revoke under opt-in; revoke + LDU under opt-out), **even under
`allowGpcOverride`** (override only lets a saved opt-in later grant).

#### The page-load PageView is yours to set (both modes)

Unlike Google Consent Mode, Meta has **no update buffering** (`wait_for_update`),
and `dataProcessingOptions` must be set **before** `fbq('init', …)`. The pixel
base code fires `PageView` at `init` — before `initConsent()` runs — so the
library **cannot** suppress that first PageView. It manages the *live session*
(every event after a consent change); the page-load state is set inline in
`<head>` before `fbq('init', …)`:

- **opt-in** — inline `fbq('consent','revoke');` before `fbq('init', …)` so the
  pixel holds all events until the library grants on consent:

  ```html
  <script>
    // …standard Meta base code up to fbq definition…
    fbq('consent', 'revoke');
    fbq('init', 'YOUR_PIXEL_ID');
    fbq('track', 'PageView');
  </script>
  ```

- **opt-out** — a static inline snippet can't reproduce a *returning* visitor's
  saved opt-out. For reliable opt-out, **gate the pixel base code** like any
  blocked script (`type="text/plain" data-category="analytics"` or defer its
  load) so `init`/PageView only fire after a choice. Otherwise a returning
  opted-out visitor's first PageView on each load fires before the library
  revokes.

> **Base code must load first, and the library never stubs `fbq`.** `getFbq()`
> uses `window.fbq` only if it is already defined; it never synthesizes a stub,
> because the Meta base snippet's `if (f.fbq) return` guard would then skip pixel
> initialization. Keep the pixel base code in `<head>`, above your bundle.

### 5. Gate embeds & widgets

| Pattern | When to use |
|---|---|
| `<lite-youtube>` + gate wired in app entry | YouTube — click-to-play or muted-autoplay `background` |
| `<consent-embed>` element | Maps, social embeds, any third-party embed without a dedicated facade |
| `<consent-pour>` element | PourNow wine-finder — dedicated facade that internalizes its companion script |
| `setupConsentGate()` primitive | Imperative escape hatch for bespoke JS widgets (chat, custom SDKs) |
| `[data-require-analytics]` attribute | Generic click-to-consent on links/buttons |

> Self-hosted `<video>`/MP4 is **not** in scope — it sets no tracking cookies and
> needs no consent. Gate only third-party embeds that phone home.

**`lite-youtube` web component** — the component stays standalone (no consent
import); the app wires it to the framework via static gates:

```ts
import { LiteYTEmbed } from '@/js/lib/liteYoutube.ts'
import { hasAnalyticsConsent, requireAnalyticsConsent } from '@kraftwerkdesign/consent'

LiteYTEmbed.consentGate = requireAnalyticsConsent  // click: may open UI
LiteYTEmbed.consentReady = hasAnalyticsConsent      // passive: warm/autoload
```

**YouTube markup** — the component builds its own thumbnail and iframe from
`videoid`; add `background` for a muted, looping video that autoplays (after
consent) on scroll into view:

```html
<!-- click-to-play -->
<lite-youtube videoid="ID" videotitle="…" nocookie></lite-youtube>

<!-- muted-autoplay background video -->
<lite-youtube videoid="ID" nocookie background></lite-youtube>
```

**`<consent-embed>` element** — for embeds without a dedicated facade (Google
Maps, Twitter/X, Instagram, Facebook, …). The real embed goes in a `<template>`
so nothing fetches or executes until consent; on activation it's stamped into
the element's **light DOM** (so third-party SDKs can hydrate it), and any
`<script>` in the template is re-created so it runs. An optional `[data-poster]`
child is the placeholder / click-to-load affordance; add `autoactivate` to load
automatically when consent is already present.

```html
<!-- Google Map (pure iframe) -->
<consent-embed autoactivate>
  <button data-poster>Show map</button>
  <template>
    <iframe src="https://www.google.com/maps/embed?…" loading="lazy"></iframe>
  </template>
</consent-embed>

<!-- Social embed (SDK-driven) -->
<consent-embed>
  <button data-poster>Show post</button>
  <template>
    <blockquote class="twitter-tweet"><a href="https://twitter.com/…/status/…"></a></blockquote>
    <script async src="https://platform.twitter.com/widgets.js"></script>
  </template>
</consent-embed>
```

**`<consent-pour>` element** — the PourNow wine-finder ships an iframe plus a
companion script that hooks `DOMContentLoaded`. That lifecycle is incompatible 
with gating, so this element **internalizes** the script: it owns the iframe, 
builds it on consent from the `shelf` UUID, runs the height/`productId` logic 
scoped to itself, and tears everything down (iframe + its `message` listener) 
on withdrawal.

```html
<consent-pour shelf="2556d19f-…" category="functionality" autoactivate>
  <button data-poster>Enable the wine finder</button>
</consent-pour>
```

`shelf` (required) becomes `https://find.pour.now/{shelf}`. `category` defaults
to the gate category; `height` sets the initial px height (default `1130`) until
the iframe's own messages take over; `autoactivate` loads as soon as consent is
present, otherwise a `[data-poster]` click activates. Each element owns its
iframe, so multiple shelves on a page never cross-talk.

**Registration** — like `<consent-embed>`, the element must be defined before
its markup upgrades. `initConsent()` calls `defineConsentPour()` for you, so no
extra step is needed in the standard setup. If you wire the pieces manually
(you called `configureConsent()`/`runConsent()` yourself instead of
`initConsent()`), call `defineConsentPour()` too — otherwise `<consent-pour>`
stays an inert unknown element that renders only its `[data-poster]` child and
never reacts to consent:

```ts
import { defineConsentPour } from '@kraftwerkdesign/consent'

defineConsentPour() // idempotent; safe to call more than once
```

The element self-upgrades, so `<consent-pour>` injected dynamically after
registration is gated too. A quick sanity check in the browser console —
`customElements.get('consent-pour')` should return the class, not `undefined`;
`undefined` means the package build in use predates the element (rebuild /
reinstall) or `defineConsentPour()` never ran.

**Gating a bespoke JS widget** (chat, a custom SDK that isn't `<template>`-able)
— use the `setupConsentGate` primitive directly:

```ts
import { setupConsentGate } from '@kraftwerkdesign/consent'

setupConsentGate({
  activate: () => { /* load widget; return false if no consent */ return true },
  deactivate: () => { /* tear it down */ },
  triggers: [placeholderEl],
  autoActivate: false,
})
```

**Imperative API (components):**

```ts
import { requireAnalyticsConsent, hasAnalyticsConsent } from '@kraftwerkdesign/consent'

if (!requireAnalyticsConsent()) return // opens consent UI
```

**Listen for consent changes:**

```ts
import { onAnalyticsConsentChange } from '@kraftwerkdesign/consent'

const unsubscribe = onAnalyticsConsentChange((accepted) => {
  // react to consent change
})
```

## Adding a category

`categories` is config-driven. Pass a full `categories` array in your config
object (it replaces the default set). Each entry registers with vanilla-cookieconsent and
renders a preferences-modal section from its `copy`. Mark exactly one category
`analytics: true` — that is the bucket the gate helpers (`hasAnalyticsConsent` /
`requireAnalyticsConsent`) check and the one GPC forces read-only.

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true, copy: { title: '…', description: '…' } },
  { id: 'analytics', analytics: true, autoClear: [{ name: /^_ga/ }], copy: { title: '…', description: '…' } },
  { id: 'marketing', autoClear: [{ name: /^_fbp/ }], copy: { title: '…', description: '…' } },
]
```

Each category also accepts an optional `gpc: boolean`. When any category sets
`gpc`, GPC clamps exactly the `gpc: true` categories; otherwise it clamps the
default gate category (the `analytics: true` one). This lets, e.g., a
`functionality` category stay usable under a GPC signal while `analytics`
remains blocked.

## Targeting a specific category

By default every gate keys off the default gate category (see `gateCategory`).
To gate individual content behind a different category:

- **Embeds:** `<consent-embed category="functionality">…</consent-embed>`
- **Links/buttons:** `<a href="…" data-require-consent="functionality">` (the
  legacy `data-require-analytics` still works and means the default category)
- **Programmatic:** `setupConsentGate({ category: 'functionality', … })`
- **Imperative API:** `hasConsent('functionality')`,
  `requireConsent('functionality')`,
  `onConsentChange(handler, 'functionality')`

For example, gating a third-party video player (one without its own facade —
not YouTube/Vimeo) behind `functionality` instead of `analytics`: the click-to-
play poster loads it once `functionality` consent is given, independent of the
`analytics` category, and — because `functionality` isn't GPC-clamped — it still
loads for a visitor sending a GPC signal:

```html
<consent-embed category="functionality">
  <button data-poster>Play video</button>
  <template>
    <iframe
      src="https://play.example-video.com/embed/abc123"
      allow="autoplay; fullscreen; picture-in-picture"
      loading="lazy"
    ></iframe>
  </template>
</consent-embed>
```

Add `autoactivate` to load it immediately when `functionality` consent is
already present instead of waiting for the poster click.

Omitting the category everywhere reproduces the previous single-category
behavior. The `hasAnalyticsConsent` / `requireAnalyticsConsent` /
`promptAnalyticsConsent` / `onAnalyticsConsentChange` helpers remain as aliases
for the default gate category.

## File map

```
src/
├── index.ts            Public API + initConsent(overrides)
├── config.default.ts   Shared defaults + ConsentConfig/ConsentCategory types
├── config.ts           Runtime store: configureConsent() / getConsentConfig()
├── deepMerge.ts        Config deep-merge (arrays replace, undefined skipped)
├── gpc.ts              Global Privacy Control detection
├── analytics.ts        has/require/prompt + event bus + initConsentApi()
├── run.ts              CookieConsent.run() + lifecycle
├── gate.ts             setupConsentGate() primitive
├── copy/
│   └── en.ts           Banner shell copy; sections generated from categories
└── embeds/
    ├── index.ts        Re-exports defineConsentEmbed()
    └── consentEmbed.ts  <consent-embed> element (template → light DOM on consent)
```

## Notes

- **Non-GPC:** consent changes trigger a full page reload so `manageScriptTags` activates blocked scripts. Set `reloadOnConsentChange: false` for SPA-style sites that rely on the live `onAnalyticsConsentChange` listeners instead.
- **GPC:** detected client-side via `navigator.globalPrivacyControl` (no server header check — cache-safe). No reload; opt-out only blocks scripts, and an informational banner confirms the signal was honored.
- **GPC override (`allowGpcOverride`, default `false`):** by default GPC is a hard lock — the analytics category is forced read-only and re-clamped to necessary-only on every load, so a visitor can never turn tracking back on. Set `allowGpcOverride: true` to treat GPC as an overridable *default* instead: analytics still starts off and the banner explains the signal was honored, but the preferences toggle stays operable, the banner offers an explicit **Accept all** / **Keep off** choice, and a saved opt-in sticks across loads (and reloads to activate blocked scripts, like any non-GPC change). GPC is a legally binding opt-out where laws like CCPA/CPRA apply; only enable this where a genuine, user-initiated override is appropriate, and treat it as a compliance decision. The GPC spec explicitly contemplates it — *"a specific arrangement with that person may permit a website to ignore a generally applicable preference"* ([W3C GPC draft](https://w3c.github.io/gpc/)).
- **Imperative API** is exposed at `window[windowNamespace]` (default `window.KDConsent`) with `hasAnalyticsConsent`, `requireAnalyticsConsent`, `promptAnalyticsConsent`, and `onAnalyticsConsentChange`.
- Importing `analytics.ts` has **no side effects**; the window API and `[data-require-analytics]` delegation are registered by `initConsentApi()` (called from `initConsent()`).

## Releasing

Publishing is fully automated — a version bump does the rest.

```bash
npm run release:patch   # 0.1.5 → 0.1.6   (bug fixes)
npm run release:minor   # 0.1.5 → 0.2.0   (new features)
npm run release:major   # 0.1.5 → 1.0.0   (breaking changes)
```

Each command runs `npm version`, which:

1. typechecks (`preversion`),
2. bumps `package.json` and creates a `vX.Y.Z` git tag,
3. pushes the commit and tag, then opens a GitHub Release with generated notes (`postversion`).

Publishing the GitHub Release triggers the **Publish to npm** workflow
(`.github/workflows/publish.yml`), which typechecks, builds, verifies the tag
matches `package.json`, and runs `npm publish`. Auth is npm **OIDC trusted
publishing** — no `NPM_TOKEN` secret, and provenance is generated automatically.

Work on a branch and merge to `main` before releasing; the release commit lands
on your current branch. If you need to publish by hand, `npm publish` runs
`prepublishOnly` (typecheck + build) first.
