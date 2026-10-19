# Meta Pixel Consent Mode

Feed consent state into the Meta Pixel. Add the `metaPixel` integration to
enable it:

```ts
import { initConsent, metaPixel } from '@kraftwerkdesign/consent'

initConsent({
  integrations: [metaPixel({ category: 'analytics' })],
})
```

Meta's consent API is **binary**: `fbq('consent','grant')` /
`fbq('consent','revoke')` turn the whole pixel on/off. `category` takes one id
or an array; the pixel is granted if **any** of them is granted.

## What it sends

Init sends `fbq('consent','revoke')` in every mode (`grant` when `category`
includes a readOnly one). Each change then sends only what differs from the
previous state.

| Mode | `ldu` | Denied | Granted |
|---|---|---|---|
| opt-in | any | `revoke` | `grant` |
| opt-out | `true` (default) | `dataProcessingOptions(['LDU'], 0, 0)` + `revoke` | `grant` + `dataProcessingOptions([])` |
| opt-out | `false` | `revoke` | `grant` |

**Limited Data Use (LDU)** is for US-state opt-outs; `0, 0` lets Meta geolocate
and only covered states are limited, which is why opt-out also `revoke`s. Opt-in
never calls `dataProcessingOptions`. Set `ldu: false` to skip it.

**GPC is honored in both modes** — a GPC visitor's category is forced off by
default, **even under `allowGpcOverride`** (override only lets a saved opt-in
later grant).

## Head / init order

Meta has **no update buffering** (`wait_for_update`), and Meta documents
`dataProcessingOptions` **before** `fbq('init', …)`. The integration runs after
the base code, so LDU only reaches a pixel that is already running and may apply
late, and the library **cannot** suppress the PageView the base code fires at
`init`. It manages every event after that.

The library **never stubs `fbq`**: the base snippet's `if (f.fbq) return` guard
would then skip pixel init. Keep the base code in `<head>` **above** the bundle:

<!-- meta-head -->
```html
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('consent', 'revoke');
fbq('init', 'YOUR_PIXEL_ID');
fbq('track', 'PageView');
</script>
```
<!-- /meta-head -->

```html
<script type="module">
  import { initConsent, metaPixel } from '@kraftwerkdesign/consent'
  initConsent({
    mode: 'opt-out',
    integrations: [metaPixel({ category: 'analytics' })],
  })
</script>
```

The inline `fbq('consent','revoke')` before `init` holds the page-load PageView
until the library grants. A static snippet can't reproduce a returning
visitor's saved opt-out, so for strict opt-out **gate the base code** instead
(`type="text/plain" data-category="analytics"`): `fbq` is then absent at init,
the integration sends nothing, and the pixel only loads once its category is
granted.
