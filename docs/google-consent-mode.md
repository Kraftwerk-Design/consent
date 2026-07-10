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
  categories `enabled: true`. A fresh visitor is granted by a mode-baseline
  `update` once the bundle runs; opting out (or GPC) pushes an `update` flipping
  the signals to `denied`. Tags usually load unblocked, so there's typically
  nothing to re-activate on opt-out — commonly pair with
  `reloadOnConsentChange: false`. If your tag loads *unblocked*, also inline the
  [synchronous `<head>` default](#synchronous-head-default) above the GTM snippet
  so a returning opted-out visitor is `denied` synchronously (see Model A vs B
  below).

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
tag already in `<head>`. Whether that's a race depends on how your Google tag is
gated:

- **`type="text/plain"`, released by this bundle (Model A).** The tag is inert
  until the bundle flips it, and the bundle sets the consent `default` *before*
  releasing the tag — so the tag can never fire early. **There is no race, and
  you don't need a `<head>` script at all.** This is the common setup with
  vanilla-cookieconsent managing your GTM/gtag tag.

- **Loaded *unblocked* (Model B).** The Google tag loads and reads the consent
  `default` on its own, early — before the deferred bundle runs. A returning
  opted-out visitor risks being fired granted, then flipped to denied. This is
  the only case the `<head>` script is for (typical of opt-out / "advanced"
  Consent Mode with cookieless modeling).

For **Model B**, inline `renderGoogleConsentDefaultScript()`'s output **above**
the GTM/gtag snippet:

```ts
import { configureConsent, renderGoogleConsentDefaultScript } from '@kraftwerkdesign/consent'
import { consentConfig } from './consent.config'

configureConsent(consentConfig)
const headHtml = renderGoogleConsentDefaultScript() // '' when googleConsentMode is off
```

It emits a **static, denied-by-default** snippet — Google's own canonical
baseline with `wait_for_update: 500`. It carries **no config**: nothing to
duplicate from your `consent.config`, hand-edit, or regenerate, and it's
byte-identical for every site (safe to serve from any static/CDN cache). It
solves the race by **construction** — nothing starts granted, so the only flips
are the safe `denied → granted` ones the deferred bundle pushes as an `update`:

- **Returning granted visitor** — starts denied, upgraded to granted once the
  bundle runs. `wait_for_update: 500` holds the tag's first pings up to 500ms, so
  a timely bundle loses nothing (a slower bundle costs only first-ping modeling
  fidelity, never compliance — denied is always the safe side).
- **Returning opted-out visitor** — denied, and stays denied. This is the flip
  the script exists to prevent.
- **Fresh opt-out visitor** — denied synchronously, then upgraded to granted by
  the bundle's mode-baseline `update` on load. Consent-by-default is preserved,
  just a beat later.

## Server-rendered / Twig (Craft, PHP) sites

Because the snippet is config-free, there's nothing to generate or bake in — and
`renderGoogleConsentDefaultScript()` being a JS function is no obstacle on a Twig
site. Paste the fixed block straight into `_layout.twig`'s `<head>`, **above**
the GTM/gtag snippet:

```html
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('consent', 'default', {
    security_storage: 'granted',
    functionality_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });
</script>
```

That's the whole integration — the same fixed snippet for every site, no
per-config edits (denying is always the safe side, so it holds even if you remap
signals). **If your Google tag is `type="text/plain"` and released by the bundle
(Model A), you don't need this block at all.**
