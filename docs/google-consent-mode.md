# Google Consent Mode v2

Feed consent state into Google's tags (GA4 / Google Ads via GTM) as [Consent
Mode](https://developers.google.com/tag-platform/security/guides/consent) signals.
Off by default — set `googleConsentMode: true` to enable.

The library pushes a `gtag('consent','default',…)` at init and a
`gtag('consent','update',…)` on every consent change. It reuses the page's
`dataLayer`/`gtag` and **never blocks or unblocks the tag itself** — it only
signals.

```ts
import type { ConsentConfig } from '@kraftwerkdesign/consent'

export const consentConfig: Partial<ConsentConfig> = {
  googleConsentMode: true,
}
```

## Map categories to signals

Each category grants the signals in its `google` array when consented:

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true,
    google: ['security_storage', 'functionality_storage'] },
  { id: 'analytics', analytics: true,
    google: ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'] },
]
```

A signal is `granted` if **any** category mapping it is granted (OR-merged).

## Direction follows `mode`

The `default` a fresh visitor gets is driven by each category's `enabled`
baseline:

- **opt-in (prior consent, GDPR):** `mode: 'opt-in'`, GTM tagged
  `type="text/plain"`. The `default` emits **denied**; opting in pushes an
  `update` granting the signals, and the page reload re-activates the blocked
  tag.

- **opt-out (consent-by-default, CCPA):** `mode: 'opt-out'`, consent-gated
  categories `enabled: true`. The `default` emits **granted** for a fresh
  visitor; opting out (or GPC) pushes an `update` flipping the signals to
  `denied`. Tags usually load unblocked, so there's typically nothing to
  re-activate on opt-out — commonly pair with `reloadOnConsentChange: false`.
  Also inline the [synchronous `<head>` default](#synchronous-head-default)
  above the GTM snippet so a returning opted-out visitor defaults `denied`
  synchronously.

**GPC is honored in both modes** — a GPC visitor's `analytics_storage`/`ad_*`
come out `denied` by default. This holds **even under `allowGpcOverride`**:
override only lets a *saved* opt-in flip the signal to `granted`; a GPC visitor
with no saved opt-in defaults denied. The same rule governs the category's
`enabled` state, so its `text/plain` tags stay blocked until that opt-in too.

> **Signal mapping + GPC:** if you map one signal (e.g. `ad_storage`) to both a
> GPC-clamped category and a non-clamped one, GPC won't force it off (OR wins).
> Put `gpc: true` on every category that maps a signal you want GPC to clamp.

## Synchronous `<head>` default

The init-time `default` runs inside the deferred bundle — **after** any Google
tag already in `<head>`. For opt-out especially, that risks a returning
opted-out visitor being granted-then-flipped.

`renderGoogleConsentDefaultScript()` returns a `<script>` string to inline
**above** the GTM/gtag snippet so a consent `default` is set before the
container loads. Unlike a hand-authored snippet it is **cookie-aware and
GPC-aware** — a returning opted-out visitor gets `denied` synchronously:

```ts
import { configureConsent, renderGoogleConsentDefaultScript } from '@kraftwerkdesign/consent'
import { consentConfig } from './consent.config'

// Framework-agnostic — emit the string server-side, above your GTM snippet.
configureConsent(consentConfig) // the same config object passed to initConsent()
const headHtml = renderGoogleConsentDefaultScript()
```

Call it **after** `configureConsent()`, with the same config you pass to
`initConsent()` — it reads from the resolved config store, not the raw
overrides. It returns `''` when `googleConsentMode` is off.

The returned script reads `document.cookie` and
`navigator.globalPrivacyControl` at **runtime**, so it stays correct
per-visitor even served from a static/CDN cache. Its per-signal derivation
matches the init-time `default` exactly (a parity test guarantees it): no saved
cookie → the mode baseline; a valid saved cookie → the visitor's actual
acceptance (OR-merged); GPC → clamped signals `denied` unless a saved opt-in
under `allowGpcOverride`. `readOnly` categories stay `granted`. Cookie parsing
lives entirely in the package — consumers never touch the cookie JSON.

## Server-rendered / Twig (Craft, PHP) sites

`renderGoogleConsentDefaultScript()` is a function — it's no help on a Twig
site with no JS runtime to call it. For the **default** config shipped in
`config.default.ts`, the block below is that same function's output,
pre-generated and ready to paste as-is into `_layout.twig`'s `<head>`,
**above** the GTM/gtag snippet:

<!-- gcm-default-script:start -->
```html
<script>(function(){
var P={"rx":"(?:^|;\\s*)kd_cookie_consent=([^;]*)","override":false,"categories":[{"id":"necessary","enabled":true,"readOnly":true,"clamped":false,"google":["security_storage","functionality_storage"]},{"id":"analytics","enabled":false,"readOnly":false,"clamped":true,"google":["analytics_storage","ad_storage","ad_user_data","ad_personalization"]}]};
var saved=null;
try{var m=document.cookie.match(new RegExp(P.rx));if(m){var v=JSON.parse(decodeURIComponent(m[1]));if(v&&Array.isArray(v.categories))saved=v.categories;}}catch(e){}
var gpc=navigator.globalPrivacyControl===true;
var s={};
for(var i=0;i<P.categories.length;i++){
var c=P.categories[i],granted;
if(c.readOnly){granted=true;}
else{var off=c.clamped&&gpc;if(saved){granted=(off&&!P.override)?false:saved.indexOf(c.id)!==-1;}else{granted=c.enabled&&!off;}}
for(var j=0;j<c.google.length;j++){var sig=c.google[j];if(s[sig]==='granted')continue;s[sig]=granted?'granted':'denied';}
}
s.wait_for_update=500;
window.dataLayer=window.dataLayer||[];
var gtag=window.gtag||(window.gtag=function(){window.dataLayer.push(arguments);});
gtag('consent','default',s);
})();</script>
```
<!-- gcm-default-script:end -->

This is exactly what
`configureConsent({ googleConsentMode: true })` +
`renderGoogleConsentDefaultScript()` produces for an otherwise-default config
(a test in the repo asserts this block never drifts from that output). If your
project overrides `cookieName`, `categories`, or `allowGpcOverride`, hand-edit
the embedded `P = {…}` object to match:

- `P.rx` — the regex used to find the consent cookie; derived from `cookieName`,
  so swap in your cookie name if you override it.
- `P.categories[]` — one entry per category with a `google` list, each with
  `id`, `enabled` (the mode baseline), `readOnly` (necessary categories),
  `clamped` (subject to the GPC clamp), and `google` (the signals it grants).
  Add/remove/edit entries to match your `categories` config.
- `P.override` — your `allowGpcOverride` setting.

If you're rendering pages from Node (or any JS/TS build/render step) instead of
Twig, skip the hand-editing — call `renderGoogleConsentDefaultScript()`
directly at build/render time and it will always match your actual config.
