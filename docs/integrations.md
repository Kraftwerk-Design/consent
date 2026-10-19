# Integrations

An integration signals a vendor's consent API from the consent snapshot. The
library ships [`googleConsentMode`](google-consent-mode.md) and
[`metaPixel`](meta-pixel.md). Vendors without a consent API are handled by
script gating instead (recipes below).

## Recipes

Gate the vendor tag on a category and clear its first-party cookies on opt-out.
Put `gpc: true` on every tracking category: once any category sets `gpc`, only
the `gpc: true` ones are clamped.

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', gpc: true, autoClear: [{ name: /^_ga/ }, { name: '_gid' }] },
  { id: 'marketing', gpc: true, autoClear: [/* per vendor, below */] },
]
```

### LinkedIn Insight Tag

```html
<script type="text/plain" data-category="marketing">
  _linkedin_partner_id = 'YOUR_PARTNER_ID';
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  window._linkedin_data_partner_ids.push(_linkedin_partner_id);
</script>
<script type="text/plain" data-category="marketing"
        src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>
```

`autoClear: [{ name: /^li_/ }, { name: 'ln_or' }]`

### Klaviyo

```html
<script type="text/plain" data-category="marketing"
        src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=YOUR_ID"></script>
```

`autoClear: [{ name: '__kla_id' }]`

Klaviyo signup forms load with this script, so they disappear when `marketing`
is denied. If forms must always show, load the script untyped (ungated);
`__kla_id` is then set before consent. A `necessary` `text/plain` script won't
do: under opt-in it waits for a choice, and with an age gate for
`confirmAge()`.

## Writing an integration

```ts
interface ConsentIntegration {
  readonly name: string
  readonly categories: readonly string[]
  init?(context: { baseline: ConsentSnapshot; mode: 'opt-in' | 'opt-out' | undefined }): void
  apply(next: ConsentSnapshot, prev: ConsentSnapshot): void
}
```

- `categories` lists the ids it reads; the validator warns about unknown ones.
- `init` runs once, synchronously, before the age gate. Send `baseline`, the
  deny-first default (readOnly categories granted, the rest denied), and
  nothing that transmits.
- `apply` never runs while the age gate is pending (`init` does, before
  `confirmAge()`).
- `apply` runs on the first snapshot (`prev` is `baseline`) and on each
  distinct change. Diff against `prev` and send nothing when what you map did
  not change.
- Grant a vendor signal if **any** of its categories is granted.
- Don't throw when the vendor global is absent. Don't stub a global whose
  loader skips init when it already exists (Meta's `fbq`).
- A throw is isolated: it is rethrown asynchronously and other integrations
  still run.

In this repo, `describeSignalAdapter` (`src/testing/signalAdapter.contract.ts`)
is the contract every bundled integration passes; see
`src/integrations/*.test.ts`.
