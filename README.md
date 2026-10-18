# @kraftwerkdesign/consent

Cookie consent for Kraftwerk projects, built on
[vanilla-cookieconsent](https://cookieconsent.orestbida.com/). It ships a
banner + preferences modal, honors [Global Privacy Control](https://globalprivacycontrol.org/)
out of the box, and gives you web components and helpers to hold third-party
embeds and scripts until the visitor consents.

You configure it by **passing data into `initConsent()`** — the package ships
sensible defaults and your project supplies only its overrides.

- **Banner + preferences modal** — categories, copy, and layout are config-driven.
- **GPC honored automatically** — clamped categories stay off and the banner says why.
- **Gate anything** — YouTube/Vimeo, maps, social embeds, chat widgets, or any tagged `<script>`.
- **Optional ad-tech signaling** — [Google Consent Mode v2](docs/google-consent-mode.md) and [Meta Pixel](docs/meta-pixel.md).
- **Optional age gate** — nothing tracks until the visitor passes it.

---

## Install

```bash
npm install @kraftwerkdesign/consent vanilla-cookieconsent
```

`vanilla-cookieconsent` is a **peer dependency** — you control its version and
own its stylesheet. The package ships no CSS side-effect; import the banner
styles yourself (see step 2 below).

---

## Quick start

**1. Write your config** (`src/consent.config.ts`). Override only what differs
from the defaults:

```ts
import type { ConsentConfig } from '@kraftwerkdesign/consent'

export const consentConfig: Partial<ConsentConfig> = {
  cookieName: 'acme_cookie_consent',
  privacyPolicyUrl: '/policies/privacy-policy',
}
```

**2. Initialize once in your app entry:**

```ts
import { initConsent } from '@kraftwerkdesign/consent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import { consentConfig } from './consent.config'

export const consent = initConsent(consentConfig)
```

`initConsent()` resolves and freezes your config, exposes `window.KDConsent`,
registers `<consent-embed>` / `<consent-pour>`, runs the banner and returns a
[handle](#the-handle). Its `ready` promise resolves once the banner has run.
With `ageGate`, `ready` waits for `confirmAge()`, so don't top-level-await it in
the module that wires the gate.

**3. Tag third-party scripts** so vanilla-cookieconsent blocks them until opt-in:

```html
<script type="text/plain" data-category="analytics" src="https://…"></script>
```

The default config defines two categories — `necessary` (always on) and
`analytics` (consent-gated) — in **opt-in** mode. See
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

| What you're gating | Use |
|---|---|
| YouTube / Vimeo video | [`<lite-youtube>` / `<lite-vimeo>` + gate hooks](#gate-a-youtube-or-vimeo-video) |
| Map, social embed, any iframe/SDK | [`<consent-embed>`](#gate-a-map-or-social-embed) |
| PourNow wine finder | [`<consent-pour>`](#gate-the-pournow-wine-finder) |
| Your own gated element | [`defineGatedElement()`](#your-own-gated-element) |
| A bespoke JS widget (chat, custom SDK) | [`attachGate()`](#gate-a-bespoke-widget) |
| A link or button | [`data-require-consent`](#gate-a-link-or-button) |

> Self-hosted `<video>`/MP4 is **not** in scope — it sets no tracking cookies
> and needs no consent. Gate only third-party embeds that phone home.

### Gate a YouTube or Vimeo video

`<lite-youtube>` and `<lite-vimeo>` come from
[`@kraftwerkdesign/kd-components`](https://github.com/Kraftwerk-Design/kd-components).
Wire their two static hooks to the handle **once** in your app entry:

```ts
import { LiteYTEmbed, LiteVimeoEmbed } from '@kraftwerkdesign/kd-components'

for (const El of [LiteYTEmbed, LiteVimeoEmbed]) {
  El.consentGate = () => consent.require()  // click: may open the consent UI
  El.consentReady = () => consent.has()     // passive (autoload/scroll): just reports state
}
```

```html
<!-- click-to-play -->
<lite-youtube videoid="ID" videotitle="…" nocookie></lite-youtube>

<!-- muted-autoplay background video -->
<lite-youtube videoid="ID" nocookie background></lite-youtube>
```

To gate video behind another category, pass its id to both hooks:

```ts
El.consentGate = () => consent.require('functionality')
El.consentReady = () => consent.has('functionality')
```

### Gate a map or social embed

`<consent-embed>` holds any third-party embed without a dedicated facade
(Google Maps, Twitter/X, Instagram, …). Put the real embed in a `<template>` so
nothing fetches or executes until consent. On activation it's stamped into the
element's **light DOM** (so SDKs can hydrate it) inside a
`[data-consent-embed-content]` wrapper, and any `<script>` in the template is
re-created so it runs.

```html
<!-- Google Map — auto-loads once consent exists -->
<consent-embed autoactivate>
  <button data-poster>Show map</button>
  <template>
    <iframe src="https://www.google.com/maps/embed?…" loading="lazy"></iframe>
  </template>
</consent-embed>

<!-- Social embed (SDK-driven) — click to load -->
<consent-embed category="marketing">
  <button data-poster>Show post</button>
  <template>
    <blockquote class="twitter-tweet"><a href="https://twitter.com/…/status/…"></a></blockquote>
    <script async src="https://platform.twitter.com/widgets.js"></script>
  </template>
</consent-embed>
```

### Gate the PourNow wine finder

PourNow ships an iframe plus a script that hooks `DOMContentLoaded`, which
can't be gated. `<consent-pour>` replaces that script: it builds the iframe on
consent from the `shelf` UUID, runs the height/`productId` logic scoped to
itself, and removes the iframe and its `message` listener on withdrawal.

```html
<consent-pour shelf="11111111-…" category="functionality" autoactivate>
  <button data-poster>Enable the wine finder</button>
</consent-pour>
```

- `shelf` (**required**) becomes `https://find.pour.now/{shelf}`.
- `height` sets the initial px height (default `1130`) until the iframe's own
  messages take over.

### Gated element behaviour

`<consent-embed>`, `<consent-pour>` and elements from `defineGatedElement()`
share one behaviour:

- `category` (default: the [gate category](#categories)) and `autoactivate`
  are read on connect.
- `autoactivate` mounts as soon as the category is granted. Otherwise a
  `[data-poster]` click mounts; before consent the click opens the consent UI
  and mounts on the grant, without a second click.
- Withdrawing the category unmounts the content.
- The host carries `state="blocked"` or `state="active"`; the poster gets
  `hidden` while active. The library writes no inline styles on the host or
  poster. Author CSS that sets `display` on the poster overrides `hidden`; add
  `[data-poster][hidden] { display: none }`.
- Mounted children carry `data-consent-gated`. Moving the element within one
  task keeps the mount; a later move re-creates it, keeping a click's
  activation. A clone (e.g. a router's page snapshot) drops the content it
  copied; a request it started may already be in flight.
- Elements connected before `initConsent()` bind when it runs.
  [`destroy()`](#the-handle) unmounts them and clears a click's activation;
  they bind to the next controller.

`initConsent()` registers both built-in elements. Calling
`defineConsentEmbed()` / `defineConsentPour()` yourself only lets the tags
exist before `initConsent()`; they bind once it runs.

### Your own gated element

```ts
import { defineGatedElement } from '@kraftwerkdesign/consent'

defineGatedElement('consent-calendly', (host) => {
  const url = host.getAttribute('url')
  if (!url) return null // can't mount; retried on the next click or grant
  const frame = document.createElement('iframe')
  frame.src = url
  host.append(frame) // append children; don't replace the host's content
  return () => {}    // release listeners/timers; appended children are removed for you
})
```

`Mount` is `(host) => (() => void) | null`. The element follows
[Gated element behaviour](#gated-element-behaviour).

### Gate a bespoke widget

For a widget that isn't an element (chat, a custom SDK), call `attachGate()`
after `initConsent()`:

```ts
import { attachGate } from '@kraftwerkdesign/consent'

const release = attachGate({
  category: 'functionality',   // optional; defaults to the gate category
  triggers: [placeholderEl],   // clicks mount, or open the consent UI and mount on grant
  autoActivate: false,         // true: mount as soon as the category is granted
  mount: () => {
    const widget = loadWidget()
    return () => widget.destroy() // teardown, or return null to retry later
  },
})
// release() unsubscribes, removes the trigger listeners and unmounts.
```

Withdrawal unmounts. `destroy()` unmounts it for good; attach again after re-init.

### Gate a link or button

Add `data-require-consent` to any link or button — the click is blocked and
opens the consent UI while the category is missing, and passes through once
granted:

```html
<a href="https://maps.google.com/…" data-require-consent="analytics">Open in Google Maps</a>
```

Omit the value (`data-require-consent`) to use the gate category. In code, use
`consent.require()` (or `window.KDConsent.require()`):

```ts
if (!consent.require('analytics')) return // opened the consent UI
// …consent granted, proceed
```

---

## Categories

`categories` is config-driven. Passing a `categories` array **replaces** the
default set. Each entry registers with vanilla-cookieconsent and renders a
preferences-modal section from its `copy`. `has()`, `require()`, gated elements
and `data-require-consent` default to `gateCategory` (falls back to
`'analytics'`), which is also the category GPC clamps by default.

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true,
    copy: { title: 'Strictly necessary', description: '…' } },
  { id: 'functionality',
    copy: { title: 'Functionality', description: '…' } },
  { id: 'analytics', gpc: true,
    autoClear: [{ name: /^_ga/ }, { name: '_gid' }],
    copy: { title: 'Analytics', description: '…' } },
  { id: 'marketing', gpc: true, autoClear: [{ name: /^_fbp/ }],
    copy: { title: 'Marketing', description: '…' } },
]
```

When **any** category sets `gpc`, GPC clamps exactly the `gpc: true`
categories; otherwise it clamps the gate category. This keeps a
`functionality` category usable under GPC while `analytics` stays blocked.
See [Category fields](#category-fields).

---

## Opt-in vs opt-out (GDPR vs CCPA)

`mode` sets the consent direction:

- **`'opt-in'`** (default, GDPR) — nothing tracks until the visitor accepts.
  Tag scripts `type="text/plain"`; accepting releases them in the page, without
  a reload. `necessary` `text/plain` scripts also wait for a first choice.
- **`'opt-out'`** (CCPA) — consent-by-default with a right to opt out. Set
  consent-gated categories `enabled: true`. A fresh visitor's defaults are
  effective at once (`has('analytics')` is true, their scripts run,
  auto-activated embeds mount). Opting out reloads the page by default; see [Reload](#reload).

### GPC

GPC is detected client-side via `navigator.globalPrivacyControl` (cache-safe,
no server header) and honored in both modes, without a reload.

By default GPC is a **hard lock**. Clamped categories are not registered with
the banner, so no button, `data-cc` attribute or `acceptCategory()` call can
release their scripts or make them effective, their preferences section has no
toggle, and their autoClear cookies are erased on every load. A fresh GPC
visitor sees the normal banner with a GPC notice, asking about the other
categories; nothing is recorded until they choose.

<a id="gpc-details"></a>
Set `allowGpcOverride: true` to treat GPC as an overridable *default* instead:
clamped categories start off, the banner offers **Accept all** / **Keep off**
(Keep off saves the defaults minus the clamped categories), and a saved opt-in
sticks across loads.

GPC is a legally binding opt-out where laws like CCPA/CPRA apply; only enable
override where a genuine, user-initiated override is appropriate, and treat it
as a compliance decision. The GPC spec explicitly contemplates it — *"a specific
arrangement with that person may permit a website to ignore a generally
applicable preference"* ([W3C GPC draft](https://w3c.github.io/gpc/)).

`buildCopy` receives `{ gpc, mode, categories, privacyPolicyUrl }` (`gpc` is
`'none'`, `'locked'` or `'default-off'`) to write copy for each case; custom
copy cannot unlock a clamped category.

---

## Reload

Accepting releases `type="text/plain"` scripts in the page at once. `reload`
sets when a visitor's choice also reloads the page:

| `reload` | Reloads when |
|---|---|
| `'on-withdraw'` (default) | a category goes from granted to denied, so scripts that already ran stop |
| `'on-change'` | any category changes |
| `'never'` | never (SPAs, pages that react to `consent:change` themselves) |

It never reloads on load, on `confirmAge()`, or when a choice changes no
category (e.g. an opt-out visitor accepting the defaults). GPC visitors follow
the policy for the categories they can still choose.

With `'on-change'`, scripts released by an accept run twice: live, then again
after the reload. A first Accept all runs an inline analytics tag 2 times on one
visit, so it counts two pageviews.

Without a reload, a withdrawal erases autoClear cookies, unmounts gated
embeds and sends denied signals, but scripts that already ran keep running
until the next page view.

SDKs that boot on `load` or `DOMContentLoaded` (e.g. Commerce7's
`window.onload = loadScript`) miss those events when a live accept releases
them. Use `reload: 'on-change'` so they start after the reload, or load them
ungated. `'on-change'` only helps when the choice turns the SDK's own
non-necessary category on; SDKs tagged `necessary` or held by the age gate
must load ungated.

---

## Age gate

For age-restricted sites (alcohol), set `ageGate` to hold the consent stack
until the visitor passes a gate you render:

```ts
ageGate: { cookieName: 'acme_age_verified', maxAgeDays: 30 }
```

Both fields are optional: `cookieName` defaults to `AGE_GATE_COOKIE`
(`'kd_age_verified'`), `maxAgeDays` to 30.

**Nothing tracks before `confirmAge()`** (or a valid age cookie): no banner, no
script release (`necessary` included), no integration updates, no
`consent:change` event. `has()` is false for every category, `require()`
returns false and `prompt()` does nothing; `getSnapshot().stage` is
`'awaiting-age'`. Only the integrations' deny-first defaults run before the
gate: the Consent Mode `default` pushed into `dataLayer`, and Meta's `revoke`
if `fbq` already exists. `ready` resolves after the gate passes and the banner
runs. Passing never grants consent or overrides GPC, and never reloads.

After the pass the banner behaves normally. In opt-in, `necessary`
`text/plain` scripts still wait for the visitor's first banner choice
(returning visitors release them on load); in opt-out they run at once.

**Ungated vendor tags are unsupported with the age gate.** Tag Google and Meta
scripts `type="text/plain" data-category="…"` (Model A). With `ageGate` set,
`initConsent()` warns about any `googletagmanager.com` or
`connect.facebook.net` script that isn't, and about a `window.fbq` that already
exists. Keep other untagged scripts (`<noscript>` pixels, unblocked SDKs) out
of the page — the gate only holds what the consent stack controls.

The library owns the state, not the UI. Your gate decides eligibility (yes/no,
date of birth) and calls `confirmAge()` on a pass; it never receives the answer.

Render the gate in the page HTML, visible by default, and hide it with CSS once
`<html>` has the `age-verified` class. For returning visitors the class is set
before paint, so a statically cached page never flashes content: inline
`ageGateHeadScript({ cookieName: 'acme_age_verified' })` in `<head>` (options
`cookieName`, default `AGE_GATE_COOKIE`, and `className`, default
`'age-verified'`). It renders:

<!-- age-gate-head -->
```html
<script>
  if (document.cookie.split(/;\s*/).includes("acme_age_verified=1"))
    document.documentElement.classList.add("age-verified")
</script>
```
<!-- /age-gate-head -->

```css
.age-verified #age-gate { display: none; }
```

On a pass, confirm and set the same class:

```ts
import { confirmAge } from '@kraftwerkdesign/consent'

yesButton.onclick = () => {
  confirmAge()
  document.documentElement.classList.add('age-verified')
}
```

`confirmAge()` writes the cookie, then releases the stack. Before
`initConsent()` (or with no `ageGate`) it uses its `opts`, the same
`{ cookieName?, maxAgeDays? }` shape as `ageGate`; a later `initConsent()`
with the same `ageGate` then runs at once. Keep one object and pass it to
`initConsent`, `confirmAge`, `isAgeVerified` and `ageGateHeadScript`:

```ts
const AGE = { cookieName: 'acme_age_verified', maxAgeDays: 30 }
confirmAge(AGE) // before initConsent({ ageGate: AGE })
```

Init warns when a pre-init pass landed under the default name instead.
`isAgeVerified(opts?)` checks the cookie `opts` names before `initConsent()`;
after it, it uses the configured gate and is true when no `ageGate` is
configured. `confirmAge` is also on `window.KDConsent`.

---

## Ad-tech consent signaling

Add integrations to `integrations` (none by default). They feed consent state
into third-party tags *without* blocking or unblocking the tags themselves.

```ts
import { initConsent, googleConsentMode, metaPixel } from '@kraftwerkdesign/consent'

initConsent({
  integrations: [
    googleConsentMode({
      security_storage: 'necessary',
      functionality_storage: 'necessary',
      analytics_storage: 'analytics',
      ad_storage: 'analytics',
      ad_user_data: 'analytics',
      ad_personalization: 'analytics',
    }),
    metaPixel({ category: 'analytics' }), // ldu: true by default (opt-out only)
  ],
})
```

- **[Google Consent Mode v2](docs/google-consent-mode.md)** — maps each signal
  to the categories that grant it. Pushes a deny-first consent `default` at
  init and an `update` on each change.
- **[Meta Pixel](docs/meta-pixel.md)** — sends `revoke` at init, then
  `grant`/`revoke` on change. `ldu` (default `true`) adds Limited Data Use for
  denied visitors in opt-out mode; opt-in never sends it.
- **[Other vendors](docs/integrations.md)** — LinkedIn / Klaviyo recipes and
  writing your own `ConsentIntegration`.

A signal is granted if any of its categories is granted. Integrations send
only when what they map changes. A throw in one doesn't stop the others.

---

## Head snippets

Static `<head>` scripts for statically cached pages. Inline them as-is:

- `GOOGLE_CONSENT_DEFAULT_HEAD` — the Consent Mode `default` to place above an
  *unblocked* Google tag (Model B). Only for the mapping above; see
  [Synchronous `<head>` default](docs/google-consent-mode.md#synchronous-head-default).
- `ageGateHeadScript({ cookieName?, className? })` — hides the age gate before
  paint for verified visitors; see [Age gate](#age-gate).

---

## SPAs

- Call `initConsent()` **once**, at the app root, and share the handle. A
  repeat call returns the same handle and warns if it gets options. Use
  `reload: 'never'` and react to `subscribe` instead.
- The library collects `script[data-category]` once, when the banner runs.
  Scripts a route inserts later are **never released**. Gate route content with
  [gated elements](#gated-element-behaviour) or `attachGate()` instead.
- `subscribe` + `getSnapshot` fit `useSyncExternalStore`: the snapshot keeps
  its reference until it changes.
- `destroy()` is for HMR and tests. It removes the banner, the wrapper's
  listeners, `window.KDConsent`, subscribers and a pending age wait; the
  consent cookie stays. Gated elements unmount and bind to the next
  controller when `initConsent()` runs again.
- vanilla-cookieconsent's own click and focus listeners on
  `[data-cc="show-preferencesModal"]` elements survive `destroy()`, and re-init
  adds them again. Under HMR, open preferences with `consent.prompt()` instead.

---

## Configuration

Every field of `ConsentConfig` is overridable; anything you omit takes the
default in the table below. The config is frozen at init.

| Setting | Description |
|---|---|
| `mode` | `'opt-in'` (default) or `'opt-out'`. See [above](#opt-in-vs-opt-out-gdpr-vs-ccpa). |
| `cookieName` | Consent cookie name (default `'kd_cookie_consent'`). |
| `privacyPolicyUrl` | Link shown in the preferences modal (default `'/policies/privacy-policy'`). |
| `categories` | Full category list — **replaces** the default `necessary`/`analytics` set. |
| `gateCategory` | Category id `has()`/`require()` and gates target when they name none. Falls back to `'analytics'`. |
| `ageGate` | `{ cookieName?, maxAgeDays? }` — hold everything until `confirmAge()`. See [Age gate](#age-gate). |
| `consentChangeEvent` | DOM event dispatched once per distinct change (default `consent:change`). `detail` is the [snapshot](#snapshot). |
| `allowGpcOverride` | Let visitors opt back into clamped categories despite a GPC signal (default `false`). See [GPC](#gpc-details). |
| `reload` | `'on-withdraw'` (default), `'on-change'` or `'never'`. See [Reload](#reload). |
| `integrations` | `googleConsentMode(…)`, `metaPixel(…)` or your own. None by default. See [Ad-tech](#ad-tech-consent-signaling). |
| `guiOptions` | vanilla-cookieconsent layout/position. Default: `cloud` banner at `bottom center` with flipped buttons, `box` preferences modal, equal-weight buttons in both. |
| `buildCopy` | `({ gpc, mode, categories, privacyPolicyUrl }) => language`: override banner/preferences copy wholesale (optional). Under GPC `default-off` the banner's necessary button is **Keep off**. |

`initConsent()` runs `validateConsentConfig(config)` on the resolved config and
`console.warn`s — never throws — on common mistakes: duplicate category ids, an
unresolvable `gateCategory`, no category subject to the GPC clamp, an
integration naming an unknown category, an unknown `reload` policy, the removed
`reloadOnConsentChange`, or a non-positive `ageGate.maxAgeDays`.

### Category fields

| Field | Description |
|---|---|
| `id` | Category id used by vanilla-cookieconsent. |
| `enabled` | Start the category granted — set on necessary categories; under opt-out, also on consent-gated categories. |
| `readOnly` | Locked on. |
| `gpc` | Subject to the GPC clamp. When no category sets it, the gate category is clamped. Ignored on `readOnly` categories (validator warns). |
| `autoClear` | Cookies cleared on opt-out — `[{ name: string \| RegExp }]`. |
| `copy` | Preferences-modal section copy — `{ title, description }`. |

---

## API reference

### The handle

`initConsent(options?)` returns a `ConsentHandle`:

| Member | Description |
|---|---|
| `ready` | Promise; resolves once the banner has run and the first snapshot is applied (after `confirmAge()` with an age gate). Stays pending if destroyed first. |
| `getSnapshot()` | The current [snapshot](#snapshot). Same reference until it changes. |
| `subscribe(fn)` | `fn(next, prev)` once per distinct change; returns the unsubscribe. |
| `has(category?)` | Whether the category (default: the gate category) is effective. No side effect. |
| `require(category?)` | `has()`, and opens the consent UI when false. |
| `prompt()` | Opens the banner before a choice, the preferences after. Not category-scoped. |
| `destroy()` | Tears the controller down; see [SPAs](#spas). |

### `window.KDConsent`

For inline scripts and no-build sites, `window.KDConsent` (type `ConsentApi`)
is `{ has, require, prompt, confirmAge, getSnapshot }`. It is set by
`initConsent()` and removed by `destroy()`. Subscribe with the DOM event.

### Snapshot

`getSnapshot()`, `subscribe` and the `consent:change` event detail share one
frozen `ConsentSnapshot`:

```ts
interface ConsentSnapshot {
  readonly stage: 'pending' | 'awaiting-age' | 'ready'
  readonly recorded: boolean   // a choice is saved in the cookie
  readonly gpc: 'none' | 'default-off' | 'locked'  // GpcState
  readonly categories: Readonly<Record<string, boolean>>  // effective, GPC clamp applied
}
```

```ts
document.addEventListener('consent:change', (event) => {
  const { categories } = (event as CustomEvent<ConsentSnapshot>).detail
  categories.analytics
})
```

`categories` is all false before the gate passes; `readOnly` categories are
true once ready. Unrecorded opt-out visitors get their `enabled` defaults
minus GPC-clamped categories, unrecorded opt-in visitors `readOnly` only. The event fires once when ready and
once per distinct change, never while `awaiting-age`.

### Exports

Functions and constants: `initConsent`, `confirmAge`, `isAgeVerified`,
`AGE_GATE_COOKIE`, `hasGpcSignal`, `validateConsentConfig`,
`googleConsentMode`, `metaPixel`, `defineGatedElement`, `attachGate`,
`defineConsentEmbed`, `defineConsentPour`, `GOOGLE_CONSENT_DEFAULT_HEAD`,
`ageGateHeadScript`.

Types: `ConsentConfig`, `ResolvedConfig`, `ConsentCategory`,
`ConsentIntegration`, `AutoClearCookie`, `CategoryCopy`, `AgeGateConfig`,
`CopyContext`, `ConsentHandle`, `ConsentListener`, `ConsentApi`,
`ConsentSnapshot`, `GpcState`, `ReloadPolicy`, `GateOptions`, `Mount`,
`GoogleConsentMap`, `GoogleConsentSignal`.

Importing the package has no side effects.

---

## File map

```
src/
├── index.ts                 Public API + initConsent()
├── config.default.ts        Defaults + ConsentConfig / ConsentCategory / ConsentIntegration types
├── config.ts                resolveConfig (frozen) + validateConsentConfig
├── deepMerge.ts             Config deep-merge (arrays replace, undefined skipped)
├── gpc.ts                   Global Privacy Control detection
├── ageGate.ts               Age gate: cookie, pass, wait, head script, warnings
├── dom.ts                   window.KDConsent + data-require-consent listener
├── head.ts                  GOOGLE_CONSENT_DEFAULT_HEAD
├── copy/en.ts               Banner copy (GPC- and mode-aware); sections from categories
├── core/
│   ├── controller.ts        initConsent / confirmAge / isAgeVerified; the page's one controller
│   ├── categories.ts        GPC state + category plan (registration, clamp, effective consent)
│   ├── library.ts           Only importer of vanilla-cookieconsent
│   ├── snapshot.ts          computeSnapshot + equality
│   └── reload.ts            shouldReload + reloadPage
├── integrations/
│   ├── google.ts            googleConsentMode()
│   └── meta.ts              metaPixel()
├── elements/
│   ├── gated.ts             defineGatedElement() + attachGate()
│   ├── embed.ts             <consent-embed>
│   └── pour.ts              <consent-pour> (PourNow wine finder)
├── testing/                 Contract kits for integrations and gated elements
└── l1/                      Tests against the real library in jsdom

docs/
├── google-consent-mode.md   Google Consent Mode v2 — mapping, static <head> snippet
├── meta-pixel.md            Meta Pixel — grant/revoke, LDU, head/init order
├── integrations.md          LinkedIn / Klaviyo recipes, writing an integration
└── releasing.md             Version bump → CI → npm publish
```

---

## Contributing & releasing

Run `npm test` (Vitest) and `npm run typecheck` before pushing.
`npm run test:e2e` builds `dist/` and runs Playwright against the fixture pages
in `e2e/site/` (first run: `npx playwright install chromium`). CI runs all of
these on pull requests and `main`. Releasing is automated via
`npm run release:{patch,minor,major}` — see [docs/releasing.md](docs/releasing.md).
