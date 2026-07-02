# Consent framework

Cookie consent built on [vanilla-cookieconsent](https://cookieconsent.orestbida.com/) with GPC support, analytics gating, and consent-gated third-party embeds.

Config is **passed into `initConsent()` as data** — the package ships shared
defaults and each project supplies only its overrides.

## Quick start (new project)

### 1. Install

```bash
npm install @kraftwerk/consent vanilla-cookieconsent
```

`vanilla-cookieconsent` is a peer dependency — you control its version and own
its stylesheet (see **Styles** below).

### 2. Configure

Create your per-project override object (`Partial<ConsentConfig>`), e.g. in
`src/consent.config.ts`:

```ts
import type { ConsentConfig } from '@kraftwerk/consent'

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
| `analyticsConsentEvent` | Custom event name (optional override) |
| `gpcBannerAckKey` | sessionStorage key for GPC banner dismiss (optional override) |
| `allowGpcOverride` | Let visitors opt back into analytics despite a GPC signal — GPC becomes an overridable default rather than a hard lock (default `false`). See the [GPC note](#notes) |
| `windowNamespace` | Global namespace object for the imperative API (default `KDConsent`) |
| `reloadOnConsentChange` | Reload on non-GPC consent change so blocked scripts activate (default `true`) |
| `buildCopy` | Override banner/preferences copy wholesale (optional) |

Any field of `ConsentConfig` is overridable, including `mode` and `guiOptions`
(vanilla-cookieconsent layout/position). All defaults live in `config.default.ts`;
anything you omit falls through to them.

### 3. Initialize in app entry

```js
import { initConsent } from '@kraftwerk/consent'
import { consentConfig } from './consent.config'

// The package ships no CSS side-effect — import the banner styles yourself.
import 'vanilla-cookieconsent/dist/cookieconsent.css'

initConsent(consentConfig)
```

`initConsent(overrides)` merges the config, exposes the imperative API on
`window`, registers the `<consent-embed>` element, and runs the banner. To run
pieces yourself, call `configureConsent(overrides)` first, then
`initConsentApi()`, `defineConsentEmbed()`, and `runConsent()`.

**Styles:** the module never imports CSS itself (so it stays a pure-JS,
tree-shakeable, package-ready module). Import `vanilla-cookieconsent`'s
stylesheet once in your app entry — as shown above, or from your main CSS:

```css
@import 'vanilla-cookieconsent/dist/cookieconsent.css';
```

You can also import your own overrides after it to restyle the banner.

### 4. Craft / Twig (server-side)

**Analytics scripts** — tag third-party scripts so vanilla-cookieconsent blocks them until opt-in:

```html
<script type="text/plain" data-category="analytics" src="…"></script>
```

For SEOmatic, re-tag script container tags in the layout (see `templates/_layouts/baseHtml.twig`).

> **GPC is detected entirely client-side** via `navigator.globalPrivacyControl`
> — no `Sec-GPC` header check or Twig function is needed. Do **not** gate markup
> server-side on the header: it's redundant (blocked `text/plain` scripts never
> run for GPC visitors anyway) and breaks on statically-cached pages, where a
> server-rendered flag is frozen for every visitor.

### 5. Gate embeds & widgets

| Pattern | When to use |
|---|---|
| `<lite-youtube>` + gate wired in app entry | YouTube — click-to-play or muted-autoplay `background` |
| `<consent-embed>` element | Maps, social embeds, any third-party embed without a dedicated facade |
| `setupConsentGate()` primitive | Imperative escape hatch for bespoke JS widgets (chat, custom SDKs) |
| `[data-require-analytics]` attribute | Generic click-to-consent on links/buttons |

> Self-hosted `<video>`/MP4 is **not** in scope — it sets no tracking cookies and
> needs no consent. Gate only third-party embeds that phone home.

**`lite-youtube` web component** — the component stays standalone (no consent
import); the app wires it to the framework via static gates:

```ts
import { LiteYTEmbed } from '@/js/lib/liteYoutube.ts'
import { hasAnalyticsConsent, requireAnalyticsConsent } from '@kraftwerk/consent'

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
<consent-embed>
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

The element self-upgrades, so `<consent-embed>` markup injected dynamically
(AJAX/Alpine) is gated too — no re-scan needed. Adding a new embed type is just
new markup; no JS registration. YouTube/Vimeo keep their own facades and don't
use this.

**Gating a bespoke JS widget** (chat, a custom SDK that isn't `<template>`-able)
— use the `setupConsentGate` primitive directly:

```ts
import { setupConsentGate } from '@kraftwerk/consent'

setupConsentGate({
  activate: () => { /* load widget; return false if no consent */ return true },
  deactivate: () => { /* tear it down */ },
  triggers: [placeholderEl],
  autoActivate: false,
})
```

**Imperative API (components):**

```ts
import { requireAnalyticsConsent, hasAnalyticsConsent } from '@kraftwerk/consent'

if (!requireAnalyticsConsent()) return // opens consent UI
```

**Listen for consent changes:**

```ts
import { onAnalyticsConsentChange } from '@kraftwerk/consent'

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

## Migrating an existing site

Porting a project off the pre-config-injection version:

| Old | New |
|---|---|
| `initConsent()` (no args) | `initConsent(siteConsentConfig)` |
| `consentConfig` singleton import | `getConsentConfig()` |
| `window.requireAnalyticsConsent` / `window.bvRequireAnalyticsConsent` | `window.KDConsent.requireAnalyticsConsent` |
| `categories: { necessary, analytics }` object in config | `categories: [...]` array (see [Adding a category](#adding-a-category)) |
| Consent imported inside `lite-youtube` | Component is standalone; wire `LiteYTEmbed.consentGate` / `consentReady` in the app entry |
| Section copy hard-coded in `copy/en.ts` | Per-category copy lives on the category config; `en.ts` renders the shell |
| `media/` folder, `initConsentGatedMedia()` | `<consent-embed>` element (`defineConsentEmbed()`); the shared lifecycle is `gate.ts` `setupConsentGate()` |
| `[data-consent-embed]` markup + registry (`registerEmbedType`/`initConsentEmbeds`) | `<consent-embed>` with the embed in a `<template>` — self-upgrading, no registry |
| `consentYoutube.twig` macro / `[data-consent-youtube*]` markup | YouTube uses `<lite-youtube>` (`background` for muted-autoplay); other embeds use `<consent-embed>` |
| `[data-consent-video]` native video | Removed — not a consent concern (self-hosted MP4 sets no tracking cookies) |
| `hasGlobalPrivacyControl()` Twig fn / `head.twig` GPC flag / server `{% if not gpc %}` markup gating | Removed — GPC is detected client-side via `navigator.globalPrivacyControl`; drop the Twig function, `gpcWindowKey`, and any header-based markup omission |
| CSS auto-imported by `run.ts` | Import `vanilla-cookieconsent/dist/cookieconsent.css` yourself in the app entry — the module no longer imports it |

Importing `analytics.ts` no longer registers globals — anything relying on that
side effect must ensure `initConsent()` (or `initConsentApi()`) runs. If a
third-party/vendor snippet calls the bare `window.requireAnalyticsConsent`,
repoint it at `window.KDConsent.requireAnalyticsConsent`.
