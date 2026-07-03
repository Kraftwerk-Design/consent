# Customizable Gate Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project target individual consent gates at specific categories (multiple gated categories coexisting on one site), while every existing `analytics`-named surface keeps working unchanged.

**Architecture:** Split the three jobs currently fused onto the `analytics: true` flag — gate bucket, gate target, and GPC clamp — into independent, category-parameterized pieces. General helpers (`hasConsent(id)` etc.) key off any category; a `gateCategory` config field names the default; a per-category `gpc?` flag decides the GPC-clamped set; the consent-change event carries every category's state. The old `analytics*` helpers become thin aliases for the default category.

**Tech Stack:** TypeScript (ESM, `verbatimModuleSyntax`, strict), tsdown build, `vanilla-cookieconsent` v3 (peer dep, already a devDep), Vitest + jsdom (added in Task 1).

## Global Constraints

- **Full backward compatibility.** Keep `hasAnalyticsConsent`, `requireAnalyticsConsent`, `promptAnalyticsConsent`, `onAnalyticsConsentChange`, `[data-require-analytics]`, `detail.accepted`, and the `analytics: true` category flag all working with unchanged behavior.
- **Pre-1.0 breaking change allowed for the event only:** rename config field `analyticsConsentEvent` → `consentChangeEvent` and event name `site:analytics-consent` → `consent:change`. Nothing consumes it yet, so no alias.
- **Green build every task.** `npm run typecheck` (`tsc --noEmit` over `src`) and `npm run build` must pass at the end of each task. `noUnusedLocals`/`noUnusedParameters` are on — remove imports you stop using, prefix deliberately-unused params with `_`.
- **`verbatimModuleSyntax`:** type-only imports must use `import type`.
- **Default gate category resolution order (verbatim):** `config.gateCategory` → id of the category with `analytics: true` → `'analytics'`.
- **GPC-clamped set (verbatim):** if any category sets `gpc` (defined), the set is exactly the categories with `gpc: true`; otherwise it defaults to `[defaultGateCategoryId()]`.
- **Package never references `HTMLElement` at module top level** (SSR safety) — the custom element class stays defined lazily inside `defineConsentEmbed`.

---

## File Structure

- `vitest.config.ts` *(new)* — test runner config, jsdom environment.
- `package.json` — devDeps (`vitest`, `jsdom`) + `test` scripts; `prepublishOnly` runs tests.
- `src/config.default.ts` — `ConsentConfig`/`ConsentCategory` type additions; field rename; defaults.
- `src/config.ts` — resolvers: `defaultGateCategoryId`, `gpcClampedCategoryIds`, `isGpcClamped`.
- `src/analytics.ts` — general helpers + aliases; category-aware GPC block; widened event; `[data-require-consent]`; `ConsentApi`.
- `src/run.ts` — GPC-clamped-set logic; general dispatch call.
- `src/gate.ts` — `category?` on `ConsentGate`; general helpers.
- `src/embeds/consentEmbed.ts` — `category` attribute.
- `src/index.ts` — export the new helpers.
- `src/*.test.ts` *(new, co-located)* — Vitest suites.
- `README.md` — document every new surface.

---

## Task 1: Vitest test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: `src/deepMerge.test.ts` (new — first real suite, proves infra + covers an untested pure module)

**Interfaces:**
- Consumes: existing `deepMerge` from `src/deepMerge.ts`.
- Produces: `npm test` runs Vitest; jsdom is the default environment.

- [ ] **Step 1: Install dev dependencies**

```bash
npm install -D vitest jsdom
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom for the DOM-touching suites (analytics, gate, consentEmbed).
    // Pure-logic suites can opt down with `// @vitest-environment node`.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add test scripts and wire tests into prepublish**

In `package.json`, add to `scripts` (keep every existing script) `test` and `test:watch`, and extend `prepublishOnly` to run tests:

```jsonc
"test": "vitest run",
"test:watch": "vitest",
"prepublishOnly": "npm run typecheck && npm test && npm run build",
```

- [ ] **Step 4: Write the first failing test**

Create `src/deepMerge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deepMerge } from './deepMerge'

describe('deepMerge', () => {
  it('recursively merges plain objects', () => {
    const result = deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3 } })
    expect(result).toEqual({ a: { x: 1, y: 3 } })
  })

  it('replaces arrays wholesale instead of concatenating', () => {
    const result = deepMerge({ items: [1, 2, 3] }, { items: [9] })
    expect(result).toEqual({ items: [9] })
  })

  it('skips undefined overrides so they never clobber a default', () => {
    const result = deepMerge({ a: 1 }, { a: undefined })
    expect(result).toEqual({ a: 1 })
  })
})
```

- [ ] **Step 5: Run the suite and verify it passes**

Run: `npm test`
Expected: 3 passing tests; Vitest exits 0.

- [ ] **Step 6: Verify typecheck still passes (test files are now type-checked)**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/deepMerge.test.ts
git commit -m "test: add Vitest with jsdom + first deepMerge suite"
```

---

## Task 2: Config type additions and event rename

**Files:**
- Modify: `src/config.default.ts`
- Modify: `src/analytics.ts` (mechanical: two references to the renamed field)
- Test: `src/config.default.test.ts` (new)

**Interfaces:**
- Consumes: `configureConsent`, `getConsentConfig` from `src/config.ts` (existing).
- Produces:
  - `ConsentCategory.gpc?: boolean`
  - `ConsentConfig.gateCategory?: string`
  - `ConsentConfig.consentChangeEvent: string` (was `analyticsConsentEvent`), default `'consent:change'`.

- [ ] **Step 1: Write the failing test**

Create `src/config.default.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { configureConsent, getConsentConfig } from './config'
import { defaultConsentConfig } from './config.default'

describe('config defaults', () => {
  it('uses the neutral consent-change event name by default', () => {
    configureConsent({})
    expect(getConsentConfig().consentChangeEvent).toBe('consent:change')
  })

  it('exposes gateCategory as an optional override', () => {
    configureConsent({ gateCategory: 'functionality' })
    expect(getConsentConfig().gateCategory).toBe('functionality')
  })

  it('carries a per-category gpc flag through configuration', () => {
    configureConsent({
      categories: [{ id: 'analytics', analytics: true, gpc: true }],
    })
    expect(getConsentConfig().categories[0].gpc).toBe(true)
  })

  it('default config leaves gpc and gateCategory unset', () => {
    expect(defaultConsentConfig.gateCategory).toBeUndefined()
    expect(
      defaultConsentConfig.categories.every((c) => c.gpc === undefined),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.default.test.ts`
Expected: FAIL — `consentChangeEvent` is `undefined` (field still named `analyticsConsentEvent`), and TypeScript errors on `gateCategory` / `gpc`.

- [ ] **Step 3: Add the interface fields**

In `src/config.default.ts`, add to the `ConsentCategory` interface (after the `analytics?` field):

```ts
  /**
   * Subject to the GPC clamp — forced read-only / off when a GPC signal is
   * present (unless `allowGpcOverride`). When no category sets this flag, the
   * clamped set defaults to the default gate category (the `analytics` one).
   */
  gpc?: boolean
```

In the `ConsentConfig` interface, add (near `categories`):

```ts
  /**
   * Id of the category the JS gate helpers target when a gate names none.
   * Falls back to the category flagged `analytics: true`, then `'analytics'`.
   */
  gateCategory?: string
```

- [ ] **Step 4: Rename the event field on the interface and default**

In `src/config.default.ts`, rename the interface member `analyticsConsentEvent: string` to `consentChangeEvent: string` (keep the doc comment, updating its wording to "Custom DOM event dispatched when consent changes."). In `defaultConsentConfig`, change:

```ts
  analyticsConsentEvent: 'site:analytics-consent',
```

to:

```ts
  consentChangeEvent: 'consent:change',
```

- [ ] **Step 5: Update the two references in analytics.ts (keep build green)**

In `src/analytics.ts`, `dispatchAnalyticsConsentChange` currently reads `getConsentConfig().analyticsConsentEvent`; `onAnalyticsConsentChange` reads the same. Change both occurrences of `.analyticsConsentEvent` to `.consentChangeEvent`. (These functions are rewritten in Task 5; this is only to keep the build compiling now.)

- [ ] **Step 6: Run the test and typecheck**

Run: `npx vitest run src/config.default.test.ts && npm run typecheck`
Expected: 4 passing tests; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/config.default.ts src/analytics.ts src/config.default.test.ts
git commit -m "feat: add gateCategory + per-category gpc; rename event to consent:change"
```

---

## Task 3: Config resolvers (default gate category + GPC-clamped set)

**Files:**
- Modify: `src/config.ts`
- Modify: `src/analytics.ts` (mechanical: rename call site)
- Modify: `src/run.ts` (mechanical: rename import + call site)
- Test: `src/config.test.ts` (new)

**Interfaces:**
- Consumes: `getConsentConfig()`, resolved `ConsentConfig` (Task 2).
- Produces (all in `src/config.ts`):
  - `defaultGateCategoryId(): string` — renamed from `analyticsCategoryId`, now honors `gateCategory` first.
  - `gpcClampedCategoryIds(): string[]`
  - `isGpcClamped(categoryId: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/config.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  configureConsent,
  defaultGateCategoryId,
  gpcClampedCategoryIds,
  isGpcClamped,
} from './config'

describe('defaultGateCategoryId', () => {
  it('prefers an explicit gateCategory', () => {
    configureConsent({
      gateCategory: 'functionality',
      categories: [
        { id: 'functionality' },
        { id: 'analytics', analytics: true },
      ],
    })
    expect(defaultGateCategoryId()).toBe('functionality')
  })

  it('falls back to the analytics-flagged category', () => {
    configureConsent({
      categories: [{ id: 'necessary' }, { id: 'stats', analytics: true }],
    })
    expect(defaultGateCategoryId()).toBe('stats')
  })

  it("falls back to 'analytics' when nothing is flagged", () => {
    configureConsent({ categories: [{ id: 'necessary' }] })
    expect(defaultGateCategoryId()).toBe('analytics')
  })
})

describe('GPC-clamped set', () => {
  it('defaults to the default gate category when no gpc flags are set', () => {
    configureConsent({
      categories: [{ id: 'necessary' }, { id: 'analytics', analytics: true }],
    })
    expect(gpcClampedCategoryIds()).toEqual(['analytics'])
    expect(isGpcClamped('analytics')).toBe(true)
    expect(isGpcClamped('necessary')).toBe(false)
  })

  it('uses exactly the gpc:true categories once any gpc flag is present', () => {
    configureConsent({
      categories: [
        { id: 'necessary' },
        { id: 'functionality', gpc: false },
        { id: 'analytics', analytics: true, gpc: true },
        { id: 'marketing', gpc: true },
      ],
    })
    expect(gpcClampedCategoryIds().sort()).toEqual(['analytics', 'marketing'])
    expect(isGpcClamped('functionality')).toBe(false)
    expect(isGpcClamped('marketing')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — `defaultGateCategoryId`, `gpcClampedCategoryIds`, `isGpcClamped` are not exported.

- [ ] **Step 3: Replace `analyticsCategoryId` with the resolvers**

In `src/config.ts`, replace the existing `analyticsCategoryId` function with:

```ts
/** Id of the category gate helpers target when a gate names none. */
export function defaultGateCategoryId(): string {
  return (
    resolved.gateCategory ??
    resolved.categories.find((category) => category.analytics)?.id ??
    'analytics'
  )
}

/**
 * Category ids subject to the GPC clamp. If any category sets `gpc`, the set is
 * exactly the categories with `gpc: true`; otherwise it defaults to the default
 * gate category (the `analytics` one).
 */
export function gpcClampedCategoryIds(): string[] {
  const anyGpcFlag = resolved.categories.some(
    (category) => category.gpc !== undefined,
  )
  if (anyGpcFlag) {
    return resolved.categories
      .filter((category) => category.gpc)
      .map((category) => category.id)
  }
  return [defaultGateCategoryId()]
}

/** Whether a category is subject to the GPC clamp. */
export function isGpcClamped(categoryId: string): boolean {
  return gpcClampedCategoryIds().includes(categoryId)
}
```

- [ ] **Step 4: Update the two call sites of the old name (keep build green)**

In `src/analytics.ts`: change the import `import { analyticsCategoryId, getConsentConfig } from './config'` to `import { defaultGateCategoryId, getConsentConfig } from './config'`, and change `CookieConsent.acceptedCategory(analyticsCategoryId())` to `CookieConsent.acceptedCategory(defaultGateCategoryId())`. (This function is rewritten in Task 4.)

In `src/run.ts`: change the import `import { analyticsCategoryId, getConsentConfig } from './config'` to `import { defaultGateCategoryId, getConsentConfig } from './config'`, and in `isGpcCompliant` change `!CookieConsent.acceptedCategory(analyticsCategoryId())` to `!CookieConsent.acceptedCategory(defaultGateCategoryId())`. (This function is rewritten in Task 7.)

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/config.test.ts && npm run typecheck`
Expected: 5 passing tests; typecheck clean (no lingering `analyticsCategoryId`).

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/analytics.ts src/run.ts src/config.test.ts
git commit -m "feat: add default-gate-category and GPC-clamped-set resolvers"
```

---

## Task 4: Category-parameterized predicates + analytics aliases

**Files:**
- Modify: `src/analytics.ts`
- Test: `src/analytics.predicates.test.ts` (new)

**Interfaces:**
- Consumes: `defaultGateCategoryId`, `isGpcClamped`, `getConsentConfig` (Task 3); `hasGpcSignal` from `./gpc`; `CookieConsent.validConsent/acceptedCategory/show/showPreferences`.
- Produces (in `src/analytics.ts`):
  - `hasConsent(categoryId?: string): boolean`
  - `requireConsent(categoryId?: string): boolean`
  - `promptConsent(categoryId?: string): void`
  - aliases: `hasAnalyticsConsent()`, `requireAnalyticsConsent()`, `promptAnalyticsConsent()` (all zero-arg, target the default category).

- [ ] **Step 1: Write the failing test**

Create `src/analytics.predicates.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import { hasGpcSignal } from './gpc'
import {
  hasConsent,
  hasAnalyticsConsent,
  requireConsent,
  promptConsent,
} from './analytics'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => false),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

const accepted = (...ids: string[]) =>
  vi.mocked(CookieConsent.acceptedCategory).mockImplementation((id) =>
    ids.includes(id as string),
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  vi.mocked(hasGpcSignal).mockReturnValue(false)
  configureConsent({
    allowGpcOverride: false,
    categories: [
      { id: 'necessary' },
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
})

describe('hasConsent', () => {
  it('is true only when the category is accepted and consent is valid', () => {
    accepted('functionality')
    expect(hasConsent('functionality')).toBe(true)
    expect(hasConsent('analytics')).toBe(false)
  })

  it('defaults to the default gate category when no id is given', () => {
    accepted('analytics')
    expect(hasConsent()).toBe(true)
    expect(hasAnalyticsConsent()).toBe(true)
  })

  it('GPC blocks a clamped category but not an unclamped one', () => {
    accepted('functionality', 'analytics')
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    expect(hasConsent('analytics')).toBe(false) // clamped
    expect(hasConsent('functionality')).toBe(true) // not clamped
  })

  it('respects a saved opt-in under allowGpcOverride', () => {
    configureConsent({
      allowGpcOverride: true,
      categories: [{ id: 'analytics', analytics: true }],
    })
    accepted('analytics')
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    expect(hasConsent('analytics')).toBe(true)
  })
})

describe('requireConsent', () => {
  it('returns true and does not prompt when consent is present', () => {
    accepted('analytics')
    expect(requireConsent('analytics')).toBe(true)
    expect(CookieConsent.show).not.toHaveBeenCalled()
    expect(CookieConsent.showPreferences).not.toHaveBeenCalled()
  })

  it('prompts and returns false when consent is missing', () => {
    expect(requireConsent('analytics')).toBe(false)
    expect(CookieConsent.showPreferences).toHaveBeenCalledOnce()
  })
})

describe('promptConsent', () => {
  it('shows the banner when there is no valid consent yet', () => {
    vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
    promptConsent('analytics')
    expect(CookieConsent.show).toHaveBeenCalledOnce()
  })

  it('shows preferences when consent already exists', () => {
    promptConsent('analytics')
    expect(CookieConsent.showPreferences).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/analytics.predicates.test.ts`
Expected: FAIL — `hasConsent` / `requireConsent` / `promptConsent` are not exported.

- [ ] **Step 3: Rewrite the predicate block in analytics.ts**

In `src/analytics.ts`, replace the existing `hasAnalyticsConsent`, `promptAnalyticsConsent`, and `requireAnalyticsConsent` functions (top of file, lines ~5–34) with the general versions plus aliases. Update the config import to include `isGpcClamped`:

```ts
import * as CookieConsent from 'vanilla-cookieconsent'
import {
  defaultGateCategoryId,
  isGpcClamped,
  getConsentConfig,
} from './config'
import { hasGpcSignal } from './gpc'

/**
 * Whether the given consent category is granted. GPC forces a *clamped*
 * category off (unless the visitor opted back in under `allowGpcOverride`);
 * unclamped categories are unaffected by GPC. Omit `categoryId` to check the
 * default gate category.
 */
export function hasConsent(
  categoryId: string = defaultGateCategoryId(),
): boolean {
  if (
    isGpcClamped(categoryId) &&
    hasGpcSignal() &&
    !getConsentConfig().allowGpcOverride
  ) {
    return false
  }

  return (
    CookieConsent.validConsent() && CookieConsent.acceptedCategory(categoryId)
  )
}

/** Open the consent UI when a gated thing is activated without consent. */
export function promptConsent(_categoryId?: string): void {
  if (!CookieConsent.validConsent()) {
    CookieConsent.show()
    return
  }

  CookieConsent.showPreferences()
}

/** True when the category is granted; otherwise opens the consent UI. */
export function requireConsent(
  categoryId: string = defaultGateCategoryId(),
): boolean {
  if (hasConsent(categoryId)) return true

  promptConsent(categoryId)
  return false
}

/** Back-compat aliases — the default gate category. */
export const hasAnalyticsConsent = (): boolean => hasConsent()
export const requireAnalyticsConsent = (): boolean => requireConsent()
export const promptAnalyticsConsent = (): void => promptConsent()
```

- [ ] **Step 4: Run the suite and typecheck**

Run: `npx vitest run src/analytics.predicates.test.ts && npm run typecheck`
Expected: all passing; typecheck clean. (`gate.ts` and `embeds/consentEmbed.ts` still import `hasAnalyticsConsent`/`requireAnalyticsConsent`, which remain exported as aliases — build stays green.)

- [ ] **Step 5: Commit**

```bash
git add src/analytics.ts src/analytics.predicates.test.ts
git commit -m "feat: category-parameterized hasConsent/requireConsent/promptConsent + aliases"
```

---

## Task 5: Widened consent-change event

**Files:**
- Modify: `src/analytics.ts`
- Modify: `src/run.ts` (rename the three dispatch call sites + import)
- Test: `src/analytics.events.test.ts` (new)

**Interfaces:**
- Consumes: `hasConsent` (Task 4); `getConsentConfig().consentChangeEvent`, `getConsentConfig().categories`.
- Produces (in `src/analytics.ts`):
  - `dispatchConsentChange(): void` (renamed from `dispatchAnalyticsConsentChange`) — dispatches `CustomEvent(consentChangeEvent, { detail: { accepted, categories } })`.
  - `onConsentChange(handler: (accepted: boolean) => void, categoryId?: string): () => void`
  - alias `onAnalyticsConsentChange(handler): () => void`.

- [ ] **Step 1: Write the failing test**

Create `src/analytics.events.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import {
  dispatchConsentChange,
  onConsentChange,
  onAnalyticsConsentChange,
} from './analytics'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => false),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
  configureConsent({
    categories: [
      { id: 'necessary' },
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
})

describe('consent-change event', () => {
  it('dispatches consent:change with accepted + a full categories map', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const spy = vi.fn()
    document.addEventListener('consent:change', spy)

    dispatchConsentChange()

    const detail = spy.mock.calls[0][0].detail
    expect(detail.accepted).toBe(false) // default gate category = analytics
    expect(detail.categories).toEqual({
      necessary: false,
      functionality: true,
      analytics: false,
    })
    document.removeEventListener('consent:change', spy)
  })

  it('onConsentChange fires with the named category boolean', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const handler = vi.fn()
    const off = onConsentChange(handler, 'functionality')

    dispatchConsentChange()

    expect(handler).toHaveBeenCalledWith(true)
    off()
  })

  it('onAnalyticsConsentChange reflects the default gate category', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    const handler = vi.fn()
    const off = onAnalyticsConsentChange(handler)

    dispatchConsentChange()

    expect(handler).toHaveBeenCalledWith(true)
    off()
  })

  it('unsubscribe stops delivery', () => {
    const handler = vi.fn()
    const off = onConsentChange(handler)
    off()
    dispatchConsentChange()
    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/analytics.events.test.ts`
Expected: FAIL — `dispatchConsentChange` / `onConsentChange` are not exported (old names `dispatchAnalyticsConsentChange` / `onAnalyticsConsentChange` still present).

- [ ] **Step 3: Rewrite the event functions in analytics.ts**

In `src/analytics.ts`, replace `dispatchAnalyticsConsentChange` and `onAnalyticsConsentChange` (the block around lines 36–57) with:

```ts
export function dispatchConsentChange(): void {
  const config = getConsentConfig()
  const categories: Record<string, boolean> = {}
  for (const category of config.categories) {
    categories[category.id] = hasConsent(category.id)
  }

  document.dispatchEvent(
    new CustomEvent(config.consentChangeEvent, {
      detail: { accepted: hasConsent(), categories },
    }),
  )
}

/**
 * Subscribe to consent changes. With `categoryId`, the handler receives that
 * category's state; without it, the default gate category's. Returns an
 * unsubscribe function.
 */
export function onConsentChange(
  handler: (accepted: boolean) => void,
  categoryId?: string,
): () => void {
  const eventName = getConsentConfig().consentChangeEvent
  const listener = (event: Event): void => {
    const detail = (
      event as CustomEvent<{
        accepted: boolean
        categories: Record<string, boolean>
      }>
    ).detail
    const accepted =
      categoryId === undefined
        ? detail?.accepted
        : detail?.categories?.[categoryId]
    handler(Boolean(accepted))
  }

  document.addEventListener(eventName, listener)
  return () => document.removeEventListener(eventName, listener)
}

/** Back-compat alias — the default gate category. */
export const onAnalyticsConsentChange = (
  handler: (accepted: boolean) => void,
): (() => void) => onConsentChange(handler)
```

- [ ] **Step 4: Rename the dispatch call sites in run.ts**

In `src/run.ts`: change the import `import { dispatchAnalyticsConsentChange } from './analytics'` to `import { dispatchConsentChange } from './analytics'`. Replace all three calls to `dispatchAnalyticsConsentChange()` (in `onFirstConsent`, `onConsent`, `onChange`) and the one in the final `.then(...)` block with `dispatchConsentChange()`. (There are four call sites total.)

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/analytics.events.test.ts && npm run typecheck`
Expected: 4 passing; typecheck clean (no lingering `dispatchAnalyticsConsentChange`).

- [ ] **Step 6: Commit**

```bash
git add src/analytics.ts src/run.ts src/analytics.events.test.ts
git commit -m "feat: widen consent-change event to carry every category's state"
```

---

## Task 6: `[data-require-consent]` delegation + window API surface

**Files:**
- Modify: `src/analytics.ts`
- Test: `src/analytics.dom.test.ts` (new)

**Interfaces:**
- Consumes: `hasConsent`, `promptConsent`, `defaultGateCategoryId`; the four general helpers + four aliases (Tasks 4–5).
- Produces:
  - Delegated click handler recognizing `[data-require-consent="<id>"]` (value = category, empty/absent = default) **and** legacy `[data-require-analytics]`.
  - `ConsentApi` interface extended with `hasConsent`, `requireConsent`, `promptConsent`, `onConsentChange` alongside the existing four aliases.
  - `initConsentApi()` exposes all eight on `window[windowNamespace]` and wires the new click handler.

- [ ] **Step 1: Write the failing test**

Create `src/analytics.dom.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import { initConsentApi } from './analytics'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => false),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  configureConsent({
    windowNamespace: 'KDConsent',
    categories: [
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
  initConsentApi() // idempotent; registers the delegated handler once
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('window API', () => {
  it('exposes the general helpers and the aliases', () => {
    const api = (window as unknown as Record<string, Record<string, unknown>>)
      .KDConsent
    for (const name of [
      'hasConsent',
      'requireConsent',
      'promptConsent',
      'onConsentChange',
      'hasAnalyticsConsent',
      'requireAnalyticsConsent',
      'promptAnalyticsConsent',
      'onAnalyticsConsentChange',
    ]) {
      expect(typeof api[name]).toBe('function')
    }
  })
})

describe('[data-require-consent] delegation', () => {
  it('prompts for the named category when it lacks consent', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-require-consent', 'functionality')
    document.body.append(btn)

    btn.click()

    expect(CookieConsent.showPreferences).toHaveBeenCalledOnce()
  })

  it('does not prompt when the named category is granted', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const btn = document.createElement('button')
    btn.setAttribute('data-require-consent', 'functionality')
    document.body.append(btn)

    btn.click()

    expect(CookieConsent.showPreferences).not.toHaveBeenCalled()
  })

  it('legacy [data-require-analytics] gates on the default category', () => {
    const link = document.createElement('a')
    link.setAttribute('data-require-analytics', '')
    document.body.append(link)

    link.click()

    expect(CookieConsent.showPreferences).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/analytics.dom.test.ts`
Expected: FAIL — `window.KDConsent` lacks `hasConsent`/etc., and `[data-require-consent]` clicks are not intercepted.

- [ ] **Step 3: Replace the click handler**

In `src/analytics.ts`, replace `handleRequireAnalyticsClick` with a category-aware handler:

```ts
/** Delegated click gate for `[data-require-consent]` / `[data-require-analytics]`. */
function handleRequireConsentClick(event: MouseEvent): void {
  const trigger = (event.target as Element | null)?.closest<HTMLElement>(
    '[data-require-consent],[data-require-analytics]',
  )

  if (!trigger) return

  // `data-require-consent="functionality"` names a category; an empty value or
  // the legacy `data-require-analytics` attribute means the default category.
  const categoryId = trigger.dataset.requireConsent || defaultGateCategoryId()
  if (hasConsent(categoryId)) return

  event.preventDefault()
  event.stopPropagation()
  promptConsent(categoryId)
}
```

- [ ] **Step 4: Extend `ConsentApi` and `initConsentApi`**

In `src/analytics.ts`, replace the `ConsentApi` interface with:

```ts
/** Imperative consent API exposed on `window[windowNamespace]`. */
export interface ConsentApi {
  hasConsent: typeof hasConsent
  requireConsent: typeof requireConsent
  promptConsent: typeof promptConsent
  onConsentChange: typeof onConsentChange
  // Back-compat aliases (default gate category):
  hasAnalyticsConsent: typeof hasAnalyticsConsent
  requireAnalyticsConsent: typeof requireAnalyticsConsent
  promptAnalyticsConsent: typeof promptAnalyticsConsent
  onAnalyticsConsentChange: typeof onAnalyticsConsentChange
}
```

In `initConsentApi`, update the `api` object and the listener registration:

```ts
  const api: ConsentApi = {
    hasConsent,
    requireConsent,
    promptConsent,
    onConsentChange,
    hasAnalyticsConsent,
    requireAnalyticsConsent,
    promptAnalyticsConsent,
    onAnalyticsConsentChange,
  }
  ;(window as unknown as Record<string, unknown>)[namespace] = api

  document.addEventListener('click', handleRequireConsentClick, true)
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/analytics.dom.test.ts && npm run typecheck`
Expected: all passing; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/analytics.ts src/analytics.dom.test.ts
git commit -m "feat: data-require-consent delegation + full window API surface"
```

---

## Task 7: GPC clamp uses the clamped set in run.ts

**Files:**
- Modify: `src/run.ts`
- Test: `src/run.test.ts` (new)

**Interfaces:**
- Consumes: `isGpcClamped`, `gpcClampedCategoryIds`, `getConsentConfig` (Task 3).
- Produces: `buildCategories` marks a category `readOnly` under GPC when `isGpcClamped(id)`; `isGpcCompliant` returns true iff no clamped category is accepted.

- [ ] **Step 1: Write the failing test**

Create `src/run.test.ts` (this exercises the pure `buildCategories` helper; export it from `run.ts` in Step 3):

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureConsent } from './config'
import { buildCategories } from './run'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => false),
  acceptedCategory: vi.fn(() => false),
  run: vi.fn(() => Promise.resolve()),
  acceptCategory: vi.fn(),
  show: vi.fn(),
}))

beforeEach(() => {
  configureConsent({
    allowGpcOverride: false,
    categories: [
      { id: 'necessary', readOnly: true },
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
})

describe('buildCategories GPC clamp', () => {
  it('forces only clamped categories read-only when GPC is active', () => {
    const cats = buildCategories(true) // gpcActive = true
    expect(cats!.necessary.readOnly).toBe(true) // its own readOnly
    expect(cats!.analytics.readOnly).toBe(true) // clamped
    expect(cats!.functionality.readOnly).toBe(false) // not clamped
  })

  it('does not force clamp when GPC is inactive', () => {
    const cats = buildCategories(false)
    expect(cats!.analytics.readOnly).toBe(false)
  })

  it('honors explicit gpc:true on a non-analytics category', () => {
    configureConsent({
      allowGpcOverride: false,
      categories: [
        { id: 'analytics', analytics: true, gpc: true },
        { id: 'marketing', gpc: true },
      ],
    })
    const cats = buildCategories(true)
    expect(cats!.marketing.readOnly).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/run.test.ts`
Expected: FAIL — `buildCategories` is not exported.

- [ ] **Step 3: Generalize and export `buildCategories`; generalize `isGpcCompliant`**

In `src/run.ts`, update the import line to bring in the set helpers and drop the now-unused `defaultGateCategoryId`:

```ts
import {
  gpcClampedCategoryIds,
  isGpcClamped,
  getConsentConfig,
} from './config'
```

Change `isGpcCompliant` to:

```ts
function isGpcCompliant(): boolean {
  if (!CookieConsent.validConsent()) return false
  return gpcClampedCategoryIds().every(
    (id) => !CookieConsent.acceptedCategory(id),
  )
}
```

Export `buildCategories` and switch its `readOnly` computation to the clamped set:

```ts
/** Build the vanilla-cookieconsent category map from config. */
export function buildCategories(
  gpcActive: boolean,
): CookieConsentConfig['categories'] {
  const categories: NonNullable<CookieConsentConfig['categories']> = {}

  for (const category of getConsentConfig().categories) {
    categories[category.id] = {
      enabled: category.enabled ?? false,
      readOnly:
        (category.readOnly ?? false) ||
        (isGpcClamped(category.id) &&
          gpcActive &&
          !getConsentConfig().allowGpcOverride),
      ...(category.autoClear
        ? { autoClear: { cookies: category.autoClear } }
        : {}),
    }
  }

  return categories
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/run.test.ts && npm run typecheck`
Expected: 3 passing; typecheck clean (no unused `defaultGateCategoryId` import).

- [ ] **Step 5: Commit**

```bash
git add src/run.ts src/run.test.ts
git commit -m "feat: GPC clamp honors the configured clamped set"
```

---

## Task 8: `category` on `ConsentGate`

**Files:**
- Modify: `src/gate.ts`
- Test: `src/gate.test.ts` (new)

**Interfaces:**
- Consumes: `hasConsent`, `requireConsent`, `onConsentChange` (Tasks 4–5).
- Produces: `ConsentGate.category?: string`; `setupConsentGate` reads/subscribes to that category (default gate category when omitted).

- [ ] **Step 1: Write the failing test**

Create `src/gate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import { dispatchConsentChange } from './analytics'
import { setupConsentGate } from './gate'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => false),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  configureConsent({
    categories: [
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
})

describe('setupConsentGate with a category', () => {
  it('auto-activates when the named category is already granted', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const activate = vi.fn(() => true)
    setupConsentGate({
      category: 'functionality',
      activate,
      deactivate: vi.fn(),
      triggers: [],
      autoActivate: true,
    })
    expect(activate).toHaveBeenCalled()
  })

  it('stays inert when a different category is granted', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    const activate = vi.fn(() => true)
    setupConsentGate({
      category: 'functionality',
      activate,
      deactivate: vi.fn(),
      triggers: [],
      autoActivate: true,
    })
    expect(activate).not.toHaveBeenCalled()
  })

  it('tears down when the named category is withdrawn', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const deactivate = vi.fn()
    setupConsentGate({
      category: 'functionality',
      activate: vi.fn(() => true),
      deactivate,
      triggers: [],
      autoActivate: true,
    })
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    dispatchConsentChange()
    expect(deactivate).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gate.test.ts`
Expected: FAIL — `ConsentGate` has no `category` field (TS error) and the gate keys off analytics, not `functionality`.

- [ ] **Step 3: Add `category` and use the general helpers**

In `src/gate.ts`, change the imports:

```ts
import { hasConsent, onConsentChange, requireConsent } from './analytics'
```

Add to the `ConsentGate` interface (after `autoActivate`):

```ts
  /** Consent category this gate depends on. Defaults to the default gate category. */
  category?: string
```

In `setupConsentGate`, resolve the category once and thread it through the helpers. Replace `onTrigger`, `sync`, and the subscription:

```ts
  const category = gate.category

  const onTrigger = (event: Event): void => {
    event.preventDefault()
    if (activate()) return
    requireConsent(category)
  }

  gate.triggers.forEach((el) => el?.addEventListener('click', onTrigger))

  const sync = (): void => {
    if (!hasConsent(category)) {
      deactivate()
      return
    }
    if (gate.autoActivate || activated) activate()
  }

  sync()
  onConsentChange(sync, category)
```

Note: `hasConsent(undefined)` and `requireConsent(undefined)` fall back to the default gate category, so gates without a `category` behave exactly as before.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/gate.test.ts && npm run typecheck`
Expected: 3 passing; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/gate.ts src/gate.test.ts
git commit -m "feat: ConsentGate targets a configurable category"
```

---

## Task 9: `category` attribute on `<consent-embed>`

**Files:**
- Modify: `src/embeds/consentEmbed.ts`
- Test: `src/embeds/consentEmbed.test.ts` (new)

**Interfaces:**
- Consumes: `hasConsent` (Task 4); `setupConsentGate` with `category` (Task 8).
- Produces: `<consent-embed category="...">` gates on that category; absent attribute → default gate category.

- [ ] **Step 1: Write the failing test**

Create `src/embeds/consentEmbed.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { configureConsent } from '../config'
import { dispatchConsentChange } from '../analytics'
import { defineConsentEmbed } from './consentEmbed'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => true),
  acceptedCategory: vi.fn(() => false),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('../gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  configureConsent({
    categories: [
      { id: 'functionality' },
      { id: 'analytics', analytics: true },
    ],
  })
  defineConsentEmbed() // idempotent registration
})

afterEach(() => {
  document.body.innerHTML = ''
})

function makeEmbed(category?: string): HTMLElement {
  const el = document.createElement('consent-embed')
  if (category) el.setAttribute('category', category)
  el.setAttribute('autoactivate', '')
  el.innerHTML = `<button data-poster>Show</button><template><p data-loaded></p></template>`
  return el
}

const isStamped = (el: HTMLElement) => !!el.querySelector('[data-loaded]')

describe('<consent-embed category>', () => {
  it('stays inert without consent for its category', () => {
    const el = makeEmbed('functionality')
    document.body.append(el) // connectedCallback fires
    expect(isStamped(el)).toBe(false)
  })

  it('stamps once its category is granted, independent of analytics', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'functionality',
    )
    const el = makeEmbed('functionality')
    document.body.append(el)
    expect(isStamped(el)).toBe(true)
  })

  it('an analytics-only grant does not activate a functionality embed', () => {
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    const el = makeEmbed('functionality')
    document.body.append(el)
    expect(isStamped(el)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/embeds/consentEmbed.test.ts`
Expected: FAIL — the embed gates on analytics (`hasAnalyticsConsent`), so the `functionality` grant does not activate it.

- [ ] **Step 3: Read the `category` attribute and gate on it**

In `src/embeds/consentEmbed.ts`, change the import from analytics:

```ts
import { hasConsent } from '../analytics'
```

Inside `connectedCallback`, read the attribute near the top (after `this.wired = true`):

```ts
      const category = this.getAttribute('category') ?? undefined
```

In `activate`, gate on that category:

```ts
      const activate = (): boolean => {
        if (!hasConsent(category) || !template) return false
```

And pass the category to the gate:

```ts
      setupConsentGate({
        category,
        activate,
        deactivate,
        triggers: [poster],
        autoActivate: this.hasAttribute('autoactivate'),
      })
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/embeds/consentEmbed.test.ts && npm run typecheck`
Expected: 3 passing; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/embeds/consentEmbed.ts src/embeds/consentEmbed.test.ts
git commit -m "feat: <consent-embed category> gates on a specific category"
```

---

## Task 10: Export the new helpers

**Files:**
- Modify: `src/index.ts`
- Test: `src/index.test.ts` (new)

**Interfaces:**
- Consumes: the general helpers from `src/analytics.ts`.
- Produces: `hasConsent`, `requireConsent`, `promptConsent`, `onConsentChange` exported from the package root, alongside all existing exports.

- [ ] **Step 1: Write the failing test**

Create `src/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as pkg from './index'

describe('public exports', () => {
  it('exports the general and legacy helpers', () => {
    for (const name of [
      'hasConsent',
      'requireConsent',
      'promptConsent',
      'onConsentChange',
      'hasAnalyticsConsent',
      'requireAnalyticsConsent',
      'promptAnalyticsConsent',
      'onAnalyticsConsentChange',
      'setupConsentGate',
      'initConsent',
    ]) {
      expect(typeof (pkg as Record<string, unknown>)[name]).toBe('function')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/index.test.ts`
Expected: FAIL — `hasConsent`/`requireConsent`/`promptConsent`/`onConsentChange` are not exported from `index.ts`.

- [ ] **Step 3: Add the exports**

In `src/index.ts`, extend the analytics re-export block to include the general helpers:

```ts
export {
  hasConsent,
  requireConsent,
  promptConsent,
  onConsentChange,
  hasAnalyticsConsent,
  promptAnalyticsConsent,
  requireAnalyticsConsent,
  onAnalyticsConsentChange,
  initConsentApi,
} from './analytics'
export type { ConsentApi } from './analytics'
```

- [ ] **Step 4: Run tests, typecheck, and a full build**

Run: `npx vitest run src/index.test.ts && npm run typecheck && npm run build`
Expected: passing test; typecheck clean; `tsdown` build succeeds and emits `dist/index.d.ts` containing `hasConsent`.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: export hasConsent/requireConsent/promptConsent/onConsentChange"
```

---

## Task 11: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: every surface added in Tasks 2–10.
- Produces: user-facing docs. No test cycle — verification is a clean typecheck/build and a proofread.

- [ ] **Step 1: Document the new config fields**

In the "Overridable settings" table in `README.md`, add rows for `gateCategory` and update the event row, and note the per-category `gpc` flag:

```markdown
| `gateCategory` | Id of the category gate helpers target by default when a gate names none. Falls back to the `analytics: true` category, then `'analytics'`. |
| `consentChangeEvent` | Custom DOM event dispatched when consent changes (default `consent:change`). Its `detail` is `{ accepted, categories }`. |
```

Under the category documentation, add a note:

```markdown
Each category also accepts an optional `gpc: boolean`. When any category sets
`gpc`, GPC clamps exactly the `gpc: true` categories; otherwise it clamps the
default gate category (the `analytics: true` one). This lets, e.g., a
`functionality` category stay usable under a GPC signal while `analytics`
remains blocked.
```

- [ ] **Step 2: Document per-gate targeting**

Add a section describing how to target a category per gate:

```markdown
### Targeting a specific category

By default every gate keys off the default gate category (see `gateCategory`).
To gate individual content behind a different category:

- **Embeds:** `<consent-embed category="functionality">…</consent-embed>`
- **Links/buttons:** `<a href="…" data-require-consent="functionality">` (the
  legacy `data-require-analytics` still works and means the default category)
- **Programmatic:** `setupConsentGate({ category: 'functionality', … })`
- **Imperative API:** `hasConsent('functionality')`,
  `requireConsent('functionality')`,
  `onConsentChange(handler, 'functionality')`

Omitting the category everywhere reproduces the previous single-category
behavior. The `hasAnalyticsConsent` / `requireAnalyticsConsent` /
`promptAnalyticsConsent` / `onAnalyticsConsentChange` helpers remain as aliases
for the default gate category.
```

- [ ] **Step 3: Verify docs reference only real APIs**

Run: `npm run typecheck && npm run build`
Expected: clean (sanity that the surrounding code the docs describe still compiles).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document gateCategory, per-category gpc, and per-gate targeting"
```

---

## Final verification

- [ ] **Run the whole suite + typecheck + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all suites green; typecheck clean; build emits `dist/`.

- [ ] **Manual smoke (recommended, not a substitute for the suite)**

Build a page with two categories (video → `functionality`, another embed →
`analytics`). Under a GPC signal, confirm the `functionality` video loads while
the `analytics` embed stays blocked; without GPC, confirm both activate after
their category is accepted and that legacy `hasAnalyticsConsent`-based code is
unaffected.

---

## Self-review notes (for the implementer's awareness)

- **Spec coverage:** general helpers (T4), default gate category (T3), per-gate targeting via attribute/data-attr/param (T6, T8, T9), widened event + neutral rename (T2, T5), GPC decoupling via `gpc` flag + clamped set (T3, T7), Vitest harness (T1), all exports (T10), docs (T11). Every spec section maps to a task.
- **Rename coupling:** `analyticsCategoryId`→`defaultGateCategoryId` (T3), `analyticsConsentEvent`→`consentChangeEvent` (T2), `dispatchAnalyticsConsentChange`→`dispatchConsentChange` (T5) each update their call sites in the same task to keep the build green.
- **Type consistency:** the `onConsentChange(handler, categoryId?)` signature, the `{ accepted, categories }` event detail, and `ConsentGate.category?` are used identically wherever they appear across tasks.
