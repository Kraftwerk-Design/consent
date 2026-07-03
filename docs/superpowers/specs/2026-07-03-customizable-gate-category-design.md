# Customizable gate category — design

**Date:** 2026-07-03
**Status:** Approved for planning

## Problem

Consent gating is hardwired to a single category. Three distinct concerns are
all fused onto the one `analytics: true` flag on a category:

1. **Gate bucket** — the category the JS gate helpers read
   (`hasAnalyticsConsent()` → `analyticsCategoryId()` in `config.ts`).
2. **Gate targets** — `<consent-embed>`, `[data-require-analytics]`, and
   `setupConsentGate()` always depend on that same single category.
3. **GPC clamp** — the category GPC forces read-only (`run.ts` `buildCategories`,
   `applyGpcIfNeeded`, and the GPC hard-block in `hasAnalyticsConsent`).

A site now wants to gate video embeds behind a `functionality` category while
still gating other content behind `analytics`. That is impossible today: every
gate resolves to the one `analytics: true` category, and moving content to
`functionality` would also (incorrectly) subject it to the GPC clamp.

## Goal

Let a project target individual gates at specific consent categories, with
multiple gated categories coexisting on one site. Preserve full backward
compatibility for existing single-category (`analytics`-named) consumers.

Non-goals: no change to the vanilla-cookieconsent integration surface beyond
category wiring; no new category-registration API (categories already are the
buckets); no server-side changes.

## Design

### 1. Category-parameterized gate helpers

Introduce general helpers keyed by category id, and keep the existing
`analytics*` names as zero-argument aliases so no current consumer breaks.

New (in `analytics.ts`):

```ts
hasConsent(categoryId?: string): boolean          // omit → default gate category
requireConsent(categoryId?: string): boolean
promptConsent(categoryId?: string): void
onConsentChange(handler: (accepted: boolean) => void, categoryId?: string): () => void
```

Retained aliases (unchanged signatures and behavior):

```ts
hasAnalyticsConsent()        = () => hasConsent()
requireAnalyticsConsent()    = () => requireConsent()
promptAnalyticsConsent()     = () => promptConsent()
onAnalyticsConsentChange(h)  = (h) => onConsentChange(h)
```

`promptConsent` ignores its argument for behavior (it opens the same consent /
preferences UI regardless of category); the parameter exists only for a
symmetric signature.

### 2. Default gate category (config)

Add a config field naming the category a gate targets when it specifies none:

```ts
gateCategory?: string
```

Resolution order (replaces `analyticsCategoryId()`, which is renamed to
`defaultGateCategoryId()` and kept as the resolver):

1. `config.gateCategory` if set,
2. else the id of the category carrying `analytics: true`,
3. else the literal `'analytics'`.

This is fully backward compatible: existing configs that set `analytics: true`
on a category keep resolving to that category with no `gateCategory` field.

`analyticsCategoryId` is renamed to `defaultGateCategoryId`. It is an internal
helper (not part of the package's public exports — `index.ts` does not export
it), so this rename is safe.

### 3. Per-gate targeting

Each gate names its category, defaulting to the default gate category.

- **Custom element:** `<consent-embed category="functionality">`. When the
  attribute is absent, the embed uses the default gate category (current
  behavior).
- **Declarative trigger:** `[data-require-consent="functionality"]`. The
  existing `[data-require-analytics]` attribute is kept as an alias for
  "require the default gate category." The delegated click handler reads the
  category from `data-require-consent` first, falling back to
  `data-require-analytics` (→ default category).
- **Programmatic gate:** `ConsentGate` gains an optional `category?: string`
  field; `setupConsentGate` reads/writes consent for that category (default gate
  category when omitted). `setupConsentGate` uses `hasConsent(category)`,
  `requireConsent(category)`, and `onConsentChange(_, category)` internally
  instead of the analytics-specific helpers.

### 4. Consent-change event carries all categories

The single dispatched event cannot represent multiple gated categories with one
boolean. Widen its detail, and rename the event to a neutral name (nothing
consumes the old name yet, so no alias is needed):

```ts
detail: {
  accepted: boolean                     // default gate category
  categories: Record<string, boolean>   // every configured category id → accepted
}
```

- **Config field rename:** `analyticsConsentEvent` → `consentChangeEvent`,
  default `'consent:change'` (was `'site:analytics-consent'`). This is a
  breaking rename of a config field, acceptable pre-1.0 since nothing consumes
  it yet.
- `dispatchAnalyticsConsentChange` is renamed to `dispatchConsentChange`
  (internal only). It computes `accepted` from the default gate category and
  builds `categories` from `hasConsent(id)` for each configured category id.
- `onConsentChange(handler, categoryId)` subscribes to the DOM event. When
  `categoryId` is given it resolves to `detail.categories[categoryId]` (the map
  contains every configured category id, including the default one); when
  `categoryId` is omitted it uses `detail.accepted` (the default gate category).
- The retained `onAnalyticsConsentChange` alias subscribes to the same event via
  `onConsentChange(handler)`.

### 5. Decouple GPC clamping from gating

GPC (a do-not-sell / do-not-share signal) must clamp only tracking categories,
not every gated category. A `functionality`-gated video must load under GPC.

Add an optional per-category flag:

```ts
interface ConsentCategory {
  // ...existing fields...
  /**
   * This category is subject to the GPC clamp (forced off / read-only when a
   * GPC signal is present, unless allowGpcOverride). Defaults to the analytics
   * category when no category sets this flag.
   */
  gpc?: boolean
}
```

**GPC-clamped set resolution:**

- If any category sets `gpc` (true or false explicitly), the clamped set is
  exactly the categories with `gpc: true`.
- If no category sets `gpc` at all, the clamped set defaults to
  `{ defaultGateCategoryId() }` (the `analytics: true` category) — current
  behavior.

Introduce an internal helper, e.g. `isGpcClamped(categoryId): boolean`, used in
three places:

- **`analytics.ts` `hasConsent`:** the GPC hard-block applies only when the
  target category is GPC-clamped:
  ```ts
  if (isGpcClamped(categoryId) && hasGpcSignal() && !allowGpcOverride) return false
  return validConsent() && acceptedCategory(categoryId)
  ```
  A non-clamped category (e.g. `functionality`) is therefore unaffected by GPC.
- **`run.ts` `buildCategories`:** a category is forced `readOnly` under GPC when
  it is GPC-clamped (replacing the `category.analytics === true` check).
- **`run.ts` `applyGpcIfNeeded` / `isGpcCompliant`:** "GPC compliant" means no
  GPC-clamped category is accepted (rather than checking only the analytics
  category). `applyGpcIfNeeded` continues to clamp to necessary-only (an empty
  accept) when a GPC signal is present, non-compliant, and override is off — the
  set-based check just generalizes what "compliant" means.

`buildEnglishCopy` needs no structural change; its GPC copy remains general
("analytics and marketing"). Projects with a differently-shaped clamped set can
override copy via `config.buildCopy` as today.

## Backward compatibility summary

| Existing surface | Status |
|---|---|
| `analytics: true` on a category | Still selects the default gate category and (absent `gpc` flags) the GPC-clamped category |
| `hasAnalyticsConsent` / `requireAnalyticsConsent` / `promptAnalyticsConsent` / `onAnalyticsConsentChange` | Kept as aliases, unchanged behavior |
| `[data-require-analytics]` | Kept as alias for the default gate category |
| Consent-change event | Renamed `site:analytics-consent` → `consent:change` (nothing consumes it yet); config field `analyticsConsentEvent` → `consentChangeEvent`; `detail.accepted` retained, `detail.categories` added |
| `ConsentGate` shape | `category?` added (optional) |
| `analyticsCategoryId()` | Renamed to internal `defaultGateCategoryId()` (not publicly exported) |

## Public API changes (exports in `index.ts`)

Add: `hasConsent`, `requireConsent`, `promptConsent`, `onConsentChange`.
Keep all existing exports. Extend the `ConsentApi` interface (the
`window[windowNamespace]` object) with the four new general helpers alongside
the existing analytics-named ones.

## Files touched

- `config.default.ts` — `gateCategory` on `ConsentConfig`; `gpc` on
  `ConsentCategory`; rename `analyticsConsentEvent` → `consentChangeEvent`
  (default `'consent:change'`); doc updates.
- `config.ts` — `gateCategory` resolution; rename `analyticsCategoryId` →
  `defaultGateCategoryId`; add `isGpcClamped` (or place in a small gpc-set
  helper).
- `analytics.ts` — general `hasConsent` / `requireConsent` / `promptConsent` /
  `onConsentChange`; analytics-named aliases; category-aware GPC block; widened
  event detail; `data-require-consent` handling; `ConsentApi` extension.
- `gate.ts` — `category?` on `ConsentGate`; use general helpers.
- `embeds/consentEmbed.ts` — read `category` attribute; pass through.
- `run.ts` — GPC-clamped-set logic in `buildCategories`, `isGpcCompliant`,
  `applyGpcIfNeeded`.
- `index.ts` — export new helpers.
- `README.md` — document `gateCategory`, per-category `gpc`, the
  `consentChangeEvent` rename, per-gate targeting (`category` attribute,
  `data-require-consent`, `setupConsentGate({ category })`), and the general
  helpers.
- **New:** `vitest.config.ts`, `package.json` (devDeps + test scripts), and test
  files under `src/**/*.test.ts` (or `test/`).

## Testing

Introduce **Vitest** as the test runner. The package is ESM + TypeScript with
`vanilla-cookieconsent` already a devDependency, so Vitest runs with no build
step. `CookieConsent.*` calls are mocked per-test with `vi.mock('vanilla-cookieconsent')`;
DOM-touching suites use the `jsdom` (or `happy-dom`) environment; pure modules
run in the default node environment.

**Setup:**

- Add devDeps: `vitest`, and a DOM env (`jsdom` or `happy-dom`).
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- `vitest.config.ts` with `environment: 'jsdom'` (individual pure-module suites
  can opt down to node via a per-file `// @vitest-environment node` docblock).
- Wire `npm test` into `prepublishOnly` alongside typecheck + build.

**Coverage (highest-value first):**

_Pure / logic units — no DOM:_
1. `defaultGateCategoryId()` resolution: explicit `gateCategory` wins → else
   `analytics: true` category → else `'analytics'`.
2. GPC-clamped-set resolution: no `gpc` flags → defaults to the default gate
   category; some `gpc: true` → exactly those; `isGpcClamped(id)` correct for
   members and non-members.
3. `configureConsent` merge behavior for the new fields (arrays replace, new
   scalar fields override).

_Behavioral units — mocked `CookieConsent`, jsdom:_
4. `hasConsent(categoryId)`: returns `acceptedCategory(id) && validConsent()`;
   GPC hard-block applies **only** to clamped categories — `hasConsent('functionality')`
   is unaffected by a GPC signal, `hasConsent('analytics')` is blocked (and is
   respected again under `allowGpcOverride`).
5. Aliases: `hasAnalyticsConsent()` === `hasConsent()` (default category).
6. Event: `dispatchConsentChange` emits `consent:change` with correct `accepted`
   and a `categories` map for every configured id;
   `onConsentChange(h, 'functionality')` fires with the right boolean; the
   `onAnalyticsConsentChange` alias reflects the default category.
7. `[data-require-consent="…"]` / `[data-require-analytics]` delegated click:
   prevents default and prompts when the named category lacks consent; no-ops
   when consent is present.
8. `setupConsentGate({ category })`: initial sync, auto-activate, click→prompt,
   and teardown on withdrawal all key off the specified category.

_Custom element — jsdom:_
9. `<consent-embed category="functionality">`: stays inert (template not
   stamped) without `functionality` consent; stamps into light DOM once that
   category is granted; independent of `analytics` state.

**Manual smoke (still worth doing, not a substitute):** a real two-category page
(video → `functionality`, other embed → `analytics`) under a GPC signal to
confirm the video loads while the analytics embed stays blocked.
