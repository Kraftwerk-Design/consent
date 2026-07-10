# Meta Pixel Consent Mode

Feed consent state into the Meta Pixel. Off by default — set
`metaPixelConsentMode: true` to enable.

Meta's consent API is **binary**: `fbq('consent','grant')` /
`fbq('consent','revoke')` turn the whole pixel on/off, plus **Limited Data Use
(LDU)** for US-state opt-outs. Flag the granting categories with `meta: true`
— the pixel is granted if **any** `meta` category is consented:

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', analytics: true, meta: true,
    google: ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'] },
]
```

## Direction follows `mode`

- **opt-in (GDPR):** the pixel starts revoked and is granted on consent;
  withdrawal revokes. LDU is never used.
- **opt-out (CCPA):** the pixel starts granted; opting out emits **both**
  `fbq('dataProcessingOptions', ['LDU'], 0, 0)` and `fbq('consent','revoke')`,
  and opting back in grants and clears LDU (`fbq('dataProcessingOptions', [])`).

> **LDU geo caveat:** `['LDU'], 0, 0` only takes effect where Meta geolocates a
> covered US state — which is why opt-out also `revoke`s, so a recorded opt-out
> holds events everywhere. The trade-off is that revoke suppresses Meta's
> modeled conversions even in covered states.

**GPC is honored in both modes** — a GPC visitor's `meta` category is forced off
by default (revoke under opt-in; revoke + LDU under opt-out), **even under
`allowGpcOverride`** (override only lets a saved opt-in later grant).

## The page-load PageView is yours to set (both modes)

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
> because the Meta base snippet's `if (f.fbq) return` guard would then skip
> pixel initialization. Keep the pixel base code in `<head>`, above your bundle.
