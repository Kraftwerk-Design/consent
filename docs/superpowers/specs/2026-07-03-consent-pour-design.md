# `<consent-pour>` — consent-gated PourNow wine-finder embed

**Date:** 2026-07-03
**Status:** Approved

## Problem

PourNow ships a wine-finder as an `<iframe>` plus a companion script. The
companion script assumes the classic "iframe is in the page at parse time"
lifecycle:

```js
const IFRAME_ID = "pournow-shelf";
document.addEventListener("DOMContentLoaded", function () {
  const iframe = document.getElementById(IFRAME_ID);
  iframe.style.height = "1130px";
  window.addEventListener("message", function (event) {
    if (event.data?.type === "iframeHeight" && typeof event.data.height === "number") {
      if (iframe && iframe.contentWindow === event.source) {
        iframe.style.height = `${event.data.height}px`;
      }
    }
  });
  const productId = new URLSearchParams(window.location.search).get("productId");
  if (productId) {
    iframe.addEventListener("load", function () {
      setTimeout(() => {
        iframe.contentWindow.postMessage({ type: "productId", productId }, "*");
      }, 500);
    });
  }
});
```

Under consent gating the iframe must **not** exist (and must **not** fetch
`find.pour.now`) until the visitor opts in. That breaks all three of the
script's assumptions: it runs at `DOMContentLoaded`, it finds the iframe by id
then, and it wires `load` / `message` handlers against a live iframe.

The generic `<consent-embed>` (`<template>`-stamped) can gate the iframe, but it
offers no hook to run the companion script after the iframe is stamped in, and
the script itself is written for the wrong lifecycle.

## Decision

Add a dedicated web component, `<consent-pour>`, published in the package. It
**internalizes** the companion script: it owns the iframe, so there is no
external script, no `DOMContentLoaded`, and no `getElementById`. On consent it
builds the iframe and runs the height/`productId` logic scoped to its own
element; on withdrawal it tears the iframe down and detaches its listener.

This is deliberately vendor-specific (`find.pour.now`, the `iframeHeight`
protocol). It reuses the existing `setupConsentGate` primitive exactly as
`<consent-embed>` does, so initial-state / click-to-prompt / live
withdraw-and-restore behavior comes for free.

## API

```html
<consent-pour shelf="2556d19f-4e68-4b41-bbef-15ee098aea17"
              category="functionality" autoactivate>
  <button data-poster>…Your privacy choices are blocking the wine finder…</button>
</consent-pour>
```

| Attribute | Required | Role |
|---|---|---|
| `shelf` | yes | Shelf UUID. Builds `src="https://find.pour.now/{shelf}"`. Base URL is hardcoded (no override — trivial to add later if needed). |
| `category` | no | Consent category the gate depends on. Defaults to the default gate category. |
| `autoactivate` | no | Load as soon as consent is present; otherwise wait for a click on `[data-poster]`. |
| `height` | no | Initial height in px (default `1130`). The iframe's own `iframeHeight` messages take over once it loads. |

An optional `[data-poster]` child is the placeholder / click-to-load
affordance, matching `<consent-embed>`.

## Behavior

`defineConsentPour()` registers the element (idempotent). It is called inside
`initConsent()` alongside `defineConsentEmbed()`, and exported from the package
for manual wiring.

### activate()

Builds the iframe once (re-shows it on later activations):

1. Create `<iframe>` with:
   - `src = https://find.pour.now/{shelf}`
   - `allow="geolocation"`
   - `width="100%"`, `loading="eager"`, `fetchpriority="high"`
   - `style="border:none;width:100%;height:{height}px"`
   - **no `id`** — the component holds a direct reference; a fixed id would
     collide if two shelves share a page.
2. Register a `window` `message` listener scoped by
   `iframe.contentWindow === event.source`, resizing on
   `{ type: 'iframeHeight', height: number }`.
3. If `productId` is present in `location.search`, attach a one-time iframe
   `load` handler that `setTimeout(500)` → `postMessage({ type: 'productId',
   productId }, '*')`.
4. Append the iframe to the element's **light DOM**; hide the poster.

### deactivate()

Consent withdrawn:

- Remove the iframe.
- `removeEventListener` the `message` handler (the original script leaked this
  listener permanently; internalizing it lets us clean up).
- Show the poster.

### Consent safety

Nothing exists before consent: no `find.pour.now` request, no geolocation
prompt, no cookies. Withdrawal tears the embed down and re-arms the gate.

## Multi-shelf correctness

The original script kept a single module-level `iframe` and a global `message`
listener, so two shelves on one page would cross-talk. Because each
`<consent-pour>` owns its own iframe and a listener closed over that iframe
(matched by `contentWindow === event.source`), multiple shelves are naturally
isolated.

## Files

- `src/embeds/consentPour.ts` — `defineConsentPour()` (new)
- `src/embeds/consentPour.test.ts` — tests (new)
- `src/embeds/index.ts` — re-export `defineConsentPour`
- `src/index.ts` — export `defineConsentPour`; call it in `initConsent()`
- `README.md` — new row in the "Gate embeds & widgets" table + usage block

## Tests

Mirror `consentEmbed.test.ts` (jsdom, mocked `vanilla-cookieconsent`):

1. No iframe before consent for the element's category.
2. On consent, an iframe with `src="https://find.pour.now/{shelf}"` is appended.
3. An `iframeHeight` message from the iframe's `contentWindow` updates its height;
   a message from another source is ignored.
4. With `?productId=…` in the URL, an iframe `load` posts the `productId`
   message (after the timer).
5. `deactivate` (consent withdrawn) removes the iframe and detaches the
   `message` listener.
6. `autoactivate` loads on present consent; without it, a `[data-poster]` click
   activates.
7. `category` isolation: an unrelated category's grant does not activate.

## Out of scope

- No lifecycle events on `<consent-pour>` — it internalizes the script, so
  there is nothing external to hook.
- No changes to `<consent-embed>` — its `<template>` mode stays as-is.
- No configurable base URL / message-type / param name — vendor-specific by
  design.
