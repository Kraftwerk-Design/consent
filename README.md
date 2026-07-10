# @kraftwerkdesign/consent

Cookie consent for Kraftwerk projects, built on
[vanilla-cookieconsent](https://cookieconsent.orestbida.com/). It ships a
banner + preferences modal, honors [Global Privacy Control](https://globalprivacycontrol.org/)
out of the box, and gives you helpers and web components to hold third-party
embeds and scripts until the visitor consents.

You configure it by **passing data into `initConsent()`** — the package ships
sensible defaults and your project supplies only its overrides.

- **Banner + preferences modal** — categories, copy, and layout are config-driven.
- **GPC honored automatically** — a visitor sending a GPC signal is opted out on load.
- **Gate anything** — YouTube/Vimeo, maps, social embeds, chat widgets, or any tagged `<script>`.
- **Optional ad-tech signaling** — [Google Consent Mode v2](docs/google-consent-mode.md) and [Meta Pixel](docs/meta-pixel.md).

---

## Install

```bash
npm install @kraftwerkdesign/consent vanilla-cookieconsent
```

`vanilla-cookieconsent` is a **peer dependency** — you control its version and
own its stylesheet. The package ships no CSS side-effect; import the banner
styles yourself (see step 3 below).

---

## Quick start

Three steps get you a working banner that blocks analytics until opt-in.

**1. Write your config** (`src/consent.config.ts`). Override only what differs
from the defaults:

```ts
import type { ConsentConfig } from '@kraftwerkdesign/consent'

export const consentConfig: Partial<ConsentConfig> = {
  cookieName: 'acme_cookie_consent',
  privacyPolicyUrl: '/policies/privacy-policy',
}
```

**2. Initialize in your app entry:**

```ts
import { initConsent } from '@kraftwerkdesign/consent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import { consentConfig } from './consent.config'

initConsent(consentConfig)
```

`initConsent()` merges your config, exposes the imperative API on `window`,
registers the `<consent-embed>` / `<consent-pour>` elements, and runs the banner.

**3. Tag third-party scripts** so vanilla-cookieconsent blocks them until opt-in:

```html
<script type="text/plain" data-category="analytics" src="https://…"></script>
```

That's it. The default config defines two categories — `necessary` (always on)
and `analytics` (consent-gated) — in **opt-in** mode. See
[Configuration](#configuration) to change any of it.

> Using **Craft CMS / SEOmatic**? Tag its script tags in Twig:
> ```twig
> {% set scriptContainer = seomatic.script.container %}
> {% if scriptContainer %}
>   {% for tag in scriptContainer.data %}
>     {% do tag.tagAttrs({ "type": "text/plain", "data-category": "analytics" }) %}
>   {% endfor %}
> {% endif %}
> ```

---

## Recipes

Each embed or widget is gated a different way depending on what it is. Pick the
row that matches; a self-contained example follows.

| What you're gating | Use |
|---|---|
| YouTube / Vimeo video | `<lite-youtube>` / `<lite-vimeo>` + gate hooks |
| Map, social embed, any iframe/SDK | [`<consent-embed>`](#gate-a-map-or-social-embed) element |
| PourNow wine finder | [`<consent-pour>`](#gate-the-pournow-wine-finder) element |
| A bespoke JS widget (chat, custom SDK) | [`setupConsentGate()`](#gate-a-bespoke-widget) |
| A link or button | [`data-require-consent`](#gate-a-link-or-button) attribute |

> Self-hosted `<video>`/MP4 is **not** in scope — it sets no tracking cookies
> and needs no consent. Gate only third-party embeds that phone home.

### Gate a YouTube or Vimeo video

`<lite-youtube>` and `<lite-vimeo>` come from
[`@kraftwerkdesign/kd-components`](https://github.com/Kraftwerk-Design/kd-components).
The components stay standalone; you wire them to this package's gate helpers
**once** in your app entry via two static hooks:

```ts
import { LiteYTEmbed, LiteVimeoEmbed } from '@kraftwerkdesign/kd-components'
import { hasConsent, requireConsent } from '@kraftwerkdesign/consent'

for (const El of [LiteYTEmbed, LiteVimeoEmbed]) {
  El.consentGate = () => requireConsent()  // click: may open the consent UI
  El.consentReady = () => hasConsent()      // passive (autoload/scroll): just reports state
}
```

Register the components (see [kd-components docs](https://github.com/Kraftwerk-Design/kd-components)),
then drop the markup. The component builds its own thumbnail + iframe from
`videoid`; add `background` for a muted, looping video that autoplays (after
consent) on scroll into view:

```html
<!-- click-to-play -->
<lite-youtube videoid="ID" videotitle="…" nocookie></lite-youtube>

<!-- muted-autoplay background video -->
<lite-youtube videoid="ID" nocookie background></lite-youtube>
```

When a click is blocked, the component shows a dismissible "blocked until you
accept cookies" notice (customizable — see kd-components). To gate video behind
a category other than the default, pass its id to the hooks —
`() => requireConsent('functionality')` — see
[Gate behind a different category](#gate-behind-a-different-category).

### Gate a map or social embed

`<consent-embed>` is for any third-party embed without a dedicated facade
(Google Maps, Twitter/X, Instagram, Facebook, …). Put the real embed in a
`<template>` so nothing fetches or executes until consent. On activation it's
stamped into the element's **light DOM** (so SDKs can hydrate it), and any
`<script>` in the template is re-created so it runs.

- A `[data-poster]` child is the placeholder / click-to-load affordance.
- Add `autoactivate` to load automatically when consent is already present.

```html
<!-- Google Map (pure iframe) — auto-loads once consent exists -->
<consent-embed autoactivate>
  <button data-poster>Show map</button>
  <template>
    <iframe src="https://www.google.com/maps/embed?…" loading="lazy"></iframe>
  </template>
</consent-embed>

<!-- Social embed (SDK-driven) — click to load -->
<consent-embed>
  <button data-poster>Show post</button>
  <template>
    <blockquote class="twitter-tweet"><a href="https://twitter.com/…/status/…"></a></blockquote>
    <script async src="https://platform.twitter.com/widgets.js"></script>
  </template>
</consent-embed>
```

### Gate the PourNow wine finder

The PourNow wine-finder ships an iframe plus a companion script that hooks
`DOMContentLoaded` — a lifecycle that can't be gated normally. `<consent-pour>`
**internalizes** that script: it owns the iframe, builds it on consent from the
`shelf` UUID, runs the height/`productId` logic scoped to itself, and tears
everything down (iframe + its `message` listener) on withdrawal.

```html
<consent-pour shelf="11111111-…" category="functionality" autoactivate>
  <button data-poster>Enable the wine finder</button>
</consent-pour>
```

- `shelf` (**required**) becomes `https://find.pour.now/{shelf}`.
- `category` defaults to the gate category; `height` sets the initial px height
  (default `1130`) until the iframe's own messages take over.
- `autoactivate` loads as soon as consent is present; otherwise a
  `[data-poster]` click activates.

Each element owns its own iframe, so multiple shelves on a page never
cross-talk. `initConsent()` registers the element for you. (If you wire the
pieces manually instead of calling `initConsent()`, call `defineConsentPour()`
yourself — otherwise `<consent-pour>` stays an inert unknown element.)

### Gate a bespoke widget

For a JS widget that isn't `<template>`-able (chat, a custom SDK), use the
`setupConsentGate()` primitive directly:

```ts
import { setupConsentGate } from '@kraftwerkdesign/consent'

const teardown = setupConsentGate({
  activate: () => { /* load widget; return false if no consent */ return true },
  deactivate: () => { /* tear it down */ },
  triggers: [placeholderEl],   // elements whose click activates
  autoActivate: false,          // or true to load when consent already exists
  category: 'analytics',        // optional; defaults to the gate category
})
// teardown() unsubscribes its consent-change + trigger listeners.
```

### Gate a link or button

Add `data-require-consent` to any link or button — the click opens the consent
UI if consent is missing, then proceeds:

```html
<a href="https://maps.google.com/…" data-require-consent="analytics">Open in Google Maps</a>
```

Omit the value (`data-require-consent`) to use the default gate category. The
legacy `data-require-analytics` attribute still works and means the default
category.

Or gate imperatively inside a component:

```ts
import { requireConsent } from '@kraftwerkdesign/consent'

if (!requireConsent()) return // opens the consent UI, returns false
// …consent granted, proceed
```

---

## Categories

`categories` is config-driven. Passing a `categories` array **replaces** the
default set. Each entry registers with vanilla-cookieconsent and renders a
preferences-modal section from its `copy`. Mark **exactly one** category
`analytics: true` — that's the bucket the gate helpers check and the one GPC
clamps by default.

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true,
    copy: { title: 'Strictly necessary', description: '…' } },
  { id: 'analytics', analytics: true,
    autoClear: [{ name: /^_ga/ }, { name: '_gid' }],
    copy: { title: 'Analytics', description: '…' } },
  { id: 'marketing', autoClear: [{ name: /^_fbp/ }],
    copy: { title: 'Marketing', description: '…' } },
]
```

See [`ConsentCategory`](#category-fields) for every field.

### Gate behind a different category

By default every gate keys off the default gate category (`gateCategory`, which
falls back to the `analytics` one). To gate specific content behind another
category — e.g. a `functionality` category that stays usable under GPC:

- **Embeds:** `<consent-embed category="functionality">…</consent-embed>`
- **Links/buttons:** `<a data-require-consent="functionality">`
- **Programmatic:** `setupConsentGate({ category: 'functionality', … })`
- **Imperative:** `hasConsent('functionality')`, `requireConsent('functionality')`,
  `onConsentChange(handler, 'functionality')`

Each category also accepts `gpc: boolean`. When **any** category sets `gpc`, GPC
clamps exactly the `gpc: true` categories; otherwise it clamps the default gate
category. This lets a `functionality` category stay usable under a GPC signal
while `analytics` stays blocked.

---

## Opt-in vs opt-out (GDPR vs CCPA)

`mode` sets the consent direction:

- **`'opt-in'`** (default, GDPR) — nothing tracks until the visitor accepts.
  Tag scripts `type="text/plain"`; the page reloads on consent to activate them.
- **`'opt-out'`** (CCPA) — consent-by-default with a right to opt out. Set
  consent-gated categories `enabled: true`; you'll commonly also set
  `reloadOnConsentChange: false`.

**GPC is honored in both modes** — a visitor sending a Global Privacy Control
signal is opted out of the clamped category on load, no reload, with an
informational banner confirming the signal was honored. GPC is detected
client-side via `navigator.globalPrivacyControl` (cache-safe, no server header).

<a id="gpc-details"></a>
By default GPC is a **hard lock** — the analytics category is forced read-only
and re-clamped to necessary-only on every load, so a visitor can never turn
tracking back on. Set `allowGpcOverride: true` to treat GPC as an overridable
*default* instead: analytics still starts off and the banner explains the
signal was honored, but the preferences toggle stays operable, the banner
offers an explicit **Accept all** / **Keep off** choice, and a saved opt-in
sticks across loads (reloading to activate blocked scripts, like any non-GPC
change).

GPC is a legally binding opt-out where laws like CCPA/CPRA apply; only enable
override where a genuine, user-initiated override is appropriate, and treat it
as a compliance decision. The GPC spec explicitly contemplates it — *"a specific
arrangement with that person may permit a website to ignore a generally
applicable preference"* ([W3C GPC draft](https://w3c.github.io/gpc/)).

---

## Ad-tech consent signaling

Both are **off by default** and feed consent state into third-party tags
*without* blocking or unblocking the tags themselves.

- **[Google Consent Mode v2](docs/google-consent-mode.md)** — set
  `googleConsentMode: true` and map each category's `google` signals. Pushes a
  consent `default` at init and an `update` on change. Includes a
  cookie/GPC-aware `<head>` script for opt-out and a ready-to-paste Twig block.
- **[Meta Pixel](docs/meta-pixel.md)** — set `metaPixelConsentMode: true` and
  flag categories `meta: true`. Grants/revokes the pixel on consent change, with
  Limited Data Use (LDU) for US-state opt-outs.

---

## Configuration

Every field of `ConsentConfig` is overridable; anything you omit falls through
to `config.default.ts`.

| Setting | Description |
|---|---|
| `mode` | `'opt-in'` (default) or `'opt-out'`. See [above](#opt-in-vs-opt-out-gdpr-vs-ccpa). |
| `cookieName` | Consent cookie name. |
| `privacyPolicyUrl` | Link shown in the preferences modal. |
| `categories` | Full category list — **replaces** the default `necessary`/`analytics` set. |
| `gateCategory` | Category id the gate helpers target when a gate names none. Falls back to the `analytics: true` category, then `'analytics'`. |
| `consentChangeEvent` | DOM event dispatched on change (default `consent:change`). `detail` is `{ accepted, categories }`. |
| `allowGpcOverride` | Let visitors opt back into analytics despite a GPC signal (default `false`). See [GPC note](#gpc-details). |
| `reloadOnConsentChange` | Reload on non-GPC change so blocked scripts activate (default `true`). Set `false` for SPA-style sites relying on live listeners. |
| `googleConsentMode` | Emit [Google Consent Mode v2](docs/google-consent-mode.md) signals. Off by default. |
| `metaPixelConsentMode` | Emit [Meta Pixel](docs/meta-pixel.md) consent signals. Off by default. |
| `gpcBannerAckKey` | sessionStorage key for the GPC banner dismiss (optional override). |
| `guiOptions` | vanilla-cookieconsent layout/position. |
| `buildCopy` | Override banner/preferences copy wholesale (optional). |

`configureConsent()` (called by `initConsent()`) validates the resolved config
and `console.warn`s — never throws — on common mistakes: duplicate category ids,
more than one `analytics: true` category, an unresolvable `gateCategory`, or
`google`/`meta` flags on a category *you* defined while its consent mode is off.
(The shipped defaults carry `google`/`meta` mappings so the modes work the
moment you flip them on; those don't warn.)

### Category fields

Fields on each `ConsentCategory` entry:

| Field | Description |
|---|---|
| `id` | Category id used by vanilla-cookieconsent. |
| `enabled` | Start the category granted — set on necessary categories; under opt-out, also on consent-gated categories. |
| `readOnly` | Locked on. GPC also forces clamped categories read-only. |
| `analytics` | Marks the tracking bucket the JS gate helpers check. Set on exactly one category. |
| `gpc` | Subject to the GPC clamp. When no category sets it, the default gate category is clamped. |
| `meta` | Grants the [Meta Pixel](docs/meta-pixel.md) when consented. |
| `google` | [Google Consent Mode v2](docs/google-consent-mode.md) signals this category grants. |
| `autoClear` | Cookies cleared on opt-out — `[{ name: string \| RegExp }]`. |
| `copy` | Preferences-modal section copy — `{ title, description }`. |

---

## API reference

### Imperative API

Available as exports and on `window.KDConsent` (type `ConsentApi`):

```ts
import { hasConsent, requireConsent, promptConsent, onConsentChange } from '@kraftwerkdesign/consent'

hasConsent('analytics')          // → boolean, no side effect
requireConsent('analytics')      // → boolean; opens the consent UI if missing
promptConsent()                  // opens the consent UI
onConsentChange((accepted) => {}, 'analytics')  // → unsubscribe fn
```

`hasConsent`, `requireConsent`, and `onConsentChange` take an optional category
id, defaulting to the gate category. `promptConsent` opens the modal and takes
no meaningful argument (it can't deep-link to a section).

`hasGpcSignal()` is exported too (`→ boolean`), but is a plain export — it is
**not** on `window.KDConsent`.

> The `*Analytics*` variants (`hasAnalyticsConsent`, `requireAnalyticsConsent`,
> `promptAnalyticsConsent`, `onAnalyticsConsentChange`) still work as aliases
> scoped to the default gate category, but are **`@deprecated`** — prefer the
> category-taking functions above.

### Manual wiring

`initConsent(overrides)` is the shortcut for the four steps below. Run them
yourself if you need to insert logic between (e.g. emit the Google Consent Mode
`<head>` script after config resolves):

```ts
import {
  configureConsent, installWindowApi,
  defineConsentEmbed, defineConsentPour, runConsent,
} from '@kraftwerkdesign/consent'

configureConsent(consentConfig)  // resolve + validate config into the store
installWindowApi()               // expose window.KDConsent + data-require-consent delegation
defineConsentEmbed()             // register <consent-embed>
defineConsentPour()              // register <consent-pour>
runConsent()                     // run the banner
```

Importing modules has **no side effects** — `installWindowApi()` is what
registers the window API and `data-require-consent` delegation.

### Exports

`initConsent`, `configureConsent`, `getConsentConfig`, `validateConsentConfig`,
`runConsent`, `installWindowApi`, `defineConsentEmbed`, `defineConsentPour`,
`setupConsentGate`, `renderGoogleConsentDefaultScript`, `hasGpcSignal`, the
imperative API functions above, and types `ConsentConfig`, `ConsentCategory`,
`ConsentApi`, `ConsentGate`, `GoogleConsentSignal`, `AutoClearCookie`,
`CategoryCopy`.

---

## File map

```
src/
├── index.ts                 Public API + initConsent(overrides)
├── config.default.ts        Shared defaults + ConsentConfig/ConsentCategory types
├── config.ts                Runtime store: configureConsent() / getConsentConfig()
├── deepMerge.ts             Config deep-merge (arrays replace, undefined skipped)
├── gpc.ts                   Global Privacy Control detection
├── consentCookie.ts         Parses the saved cookie (single source of truth)
├── analytics.ts             has/require/prompt + event bus + installWindowApi()
├── googleConsentMode.ts     Google Consent Mode v2 pushes + renderGoogleConsentDefaultScript()
├── metaPixelConsentMode.ts  Meta Pixel grant/revoke + Limited Data Use (LDU)
├── run.ts                   CookieConsent.run() + lifecycle
├── gate.ts                  setupConsentGate() primitive
├── copy/en.ts               Banner shell copy; sections generated from categories
└── embeds/
    ├── index.ts             Re-exports defineConsentEmbed() + defineConsentPour()
    ├── consentEmbed.ts      <consent-embed> element (template → light DOM on consent)
    └── consentPour.ts       <consent-pour> element (PourNow wine-finder facade)

docs/
├── google-consent-mode.md   Google Consent Mode v2 — mapping, <head> script, Twig block
├── meta-pixel.md            Meta Pixel — grant/revoke, LDU, page-load PageView
└── releasing.md             Automated version-bump → npm publish flow
```

---

## Contributing & releasing

Run `npm test` (Vitest) and `npm run typecheck` before pushing. Releasing is
automated via `npm run release:{patch,minor,major}` — see
[docs/releasing.md](docs/releasing.md).
