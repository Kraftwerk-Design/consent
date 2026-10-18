# Google Consent Mode v2

Feed consent state into Google's tags (GA4 / Google Ads via GTM) as [Consent
Mode](https://developers.google.com/tag-platform/security/guides/consent) signals.
Add the `googleConsentMode` integration to enable it.

At init it pushes a deny-first `gtag('consent','default',…)` (signals mapped to
`readOnly` categories granted, the rest denied, `wait_for_update: 500`) in every
mode, then a full `gtag('consent','update',…)` whenever a mapped signal changes.
It reuses the page's `dataLayer`/`gtag` and **never blocks or unblocks the tag
itself** — it only signals.

## Map signals to categories

```ts
import { initConsent, googleConsentMode } from '@kraftwerkdesign/consent'

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
  ],
})
```

A value may be an array of category ids (`ad_storage: ['analytics', 'marketing']`);
the signal is `granted` if **any** of them is granted (OR-merged).
Unmapped signals are never pushed, leaving them to Google's defaults.

## Direction follows `mode`

- **opt-in (prior consent, GDPR):** `mode: 'opt-in'`, GTM tagged
  `type="text/plain"`. The `default` emits **denied**; opting in pushes an
  `update` granting the signals and releases the blocked tag in the page.

- **opt-out (consent-by-default, CCPA):** `mode: 'opt-out'`, consent-gated
  categories `enabled: true`. A fresh visitor is granted by an `update` once
  the bundle runs; opting out (or GPC) pushes an `update` flipping
  the signals to `denied`. Tags usually load unblocked and honor that `update`
  live, so commonly pair with `reload: 'never'`. If your tag loads *unblocked*,
  also inline the [synchronous `<head>` default](#synchronous-head-default)
  above the GTM snippet so a returning opted-out visitor is `denied`
  synchronously (see Model A vs B below).

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

For **Model B**, inline `GOOGLE_CONSENT_DEFAULT_HEAD` (a `<script>` string)
**above** the GTM/gtag snippet:

```ts
import { GOOGLE_CONSENT_DEFAULT_HEAD } from '@kraftwerkdesign/consent'
```

It is a **static** snippet with `wait_for_update: 500`. It carries **no config**:
nothing to duplicate from your `consent.config`, hand-edit, or regenerate, and
it's byte-identical for every site (safe to serve from any static/CDN cache).
`security_storage` and `functionality_storage` start `granted`; the analytics
and ad signals start `denied`, so their only flips are the safe
`denied → granted` ones the deferred bundle pushes as an `update`:

- **Returning granted visitor** — starts denied, upgraded to granted once the
  bundle runs. `wait_for_update: 500` holds the tag's first pings up to 500ms, so
  a timely bundle loses nothing (a slower bundle costs only first-ping modeling
  fidelity).
- **Returning opted-out visitor** — denied, and stays denied. This is the flip
  the script exists to prevent.
- **Fresh opt-out visitor** — denied synchronously, then upgraded to granted by
  the bundle's mode-baseline `update` on load. Consent-by-default is preserved,
  just a beat later.

Map `security_storage` and `functionality_storage` only to `readOnly`
categories: the head grants them before consent, so a site that maps either to
a consent-gated category must leave the head default out and use Model A.
`googleConsentMode` warns at init when an earlier `default` grants a signal its
map denies. The head doesn't set `personalization_storage`: mapped to a gated
category, it stays unset until the bundle's `default` runs, so on Model B leave
it unmapped or accept that gap.

## Server-rendered / Twig (Craft, PHP) sites

The snippet is config-free, so paste it straight into `_layout.twig`'s `<head>`,
**above** the GTM/gtag snippet. It equals `GOOGLE_CONSENT_DEFAULT_HEAD`:

<!-- gcm-head -->
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
<!-- /gcm-head -->

**If your Google tag is `type="text/plain"` and released by the bundle
(Model A), you don't need this block at all.**
