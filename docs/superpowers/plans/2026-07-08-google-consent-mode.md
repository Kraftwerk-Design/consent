# Google Consent Mode v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, off-by-default Google Consent Mode v2 signaling layer that pushes mode-aware `default` and `update` consent commands mapped from each category's `google` signals.

**Architecture:** A new isolated module `src/googleConsentMode.ts` exposes two no-op-when-off functions (`pushGoogleConsentDefault`, `pushGoogleConsentUpdate`). Both derive a managed-signal map from config: the `default` command uses each category's `enabled` baseline (which encodes opt-in vs opt-out) minus the GPC clamp; the `update` command uses `hasConsent()` (which already honors GPC). `run.ts` calls them at init and alongside each `dispatchConsentChange()`. The feature never blocks or unblocks tags — it only emits signals.

**Tech Stack:** TypeScript (ESM), vitest + jsdom, vanilla-cookieconsent (peer).

## Global Constraints

- **Off by default:** `googleConsentMode` defaults to `false`; when off, no `gtag`/`dataLayer` access occurs at all.
- **SSR-safe:** every exported function no-ops when `typeof window === 'undefined'` (the package has `sideEffects: false` and must import cleanly in Node).
- **Never clobber:** reuse `window.dataLayer` (`||= []`) and define a `gtag` shim only if none exists.
- **Arguments form:** consent commands MUST be pushed as the `arguments` object (`dataLayer.push(arguments)`), not a plain array — GTM only recognizes the arguments form as a gtag command.
- **`googleConsentMode` is a `boolean`** for now (no options object). `wait_for_update` is a fixed `500`.
- **The 7 signals** are exactly: `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`, `functionality_storage`, `personalization_storage`, `security_storage`.
- Follow existing test conventions: default env is jsdom; mock `vanilla-cookieconsent` and `./gpc`.

---

### Task 1: Config types & defaults

**Files:**
- Modify: `src/config.default.ts` (add `GoogleConsentSignal`, `ConsentCategory.google`, `ConsentConfig.googleConsentMode`, defaults)
- Modify: `src/index.ts:8` (export the new type)
- Test: `src/config.default.test.ts` (assert defaults)

**Interfaces:**
- Produces: `type GoogleConsentSignal` (union of the 7 signal strings); `ConsentCategory.google?: GoogleConsentSignal[]`; `ConsentConfig.googleConsentMode: boolean`; default categories `necessary` and `analytics` carry `google` maps; `defaultConsentConfig.googleConsentMode === false`.

- [ ] **Step 1: Write the failing test**

Add to `src/config.default.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { defaultConsentConfig } from './config.default'

describe('googleConsentMode defaults', () => {
  it('is off by default', () => {
    expect(defaultConsentConfig.googleConsentMode).toBe(false)
  })

  it('maps default categories to Consent Mode signals', () => {
    const byId = Object.fromEntries(
      defaultConsentConfig.categories.map((c) => [c.id, c]),
    )
    expect(byId.necessary.google).toEqual([
      'security_storage',
      'functionality_storage',
    ])
    expect(byId.analytics.google).toEqual([
      'analytics_storage',
      'ad_storage',
      'ad_user_data',
      'ad_personalization',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.default.test.ts -t "googleConsentMode defaults"`
Expected: FAIL — `googleConsentMode` is `undefined`, and `.google` is `undefined`.

- [ ] **Step 3: Add the type**

In `src/config.default.ts`, after the imports (top of file), add:

```ts
/** A Google Consent Mode v2 signal. */
export type GoogleConsentSignal =
  | 'ad_storage'
  | 'ad_user_data'
  | 'ad_personalization'
  | 'analytics_storage'
  | 'functionality_storage'
  | 'personalization_storage'
  | 'security_storage'
```

- [ ] **Step 4: Add the `google` field to `ConsentCategory`**

In `src/config.default.ts`, inside `interface ConsentCategory`, after the `autoClear` field, add:

```ts
  /** Google Consent Mode v2 signals this category grants when consented. */
  google?: GoogleConsentSignal[]
```

- [ ] **Step 5: Add `googleConsentMode` to `ConsentConfig`**

In `src/config.default.ts`, inside `interface ConsentConfig`, after the `reloadOnConsentChange` field, add:

```ts
  /**
   * Enable Google Consent Mode v2 signaling. Off when omitted/false. Pushes a
   * consent `default` at init and a consent `update` on every change, mapped
   * from each category's `google` signals. Direction follows `mode` via each
   * category's `enabled` baseline: opt-out categories (`enabled: true`) default
   * to granted (CCPA); opt-in consent-gated categories (`enabled: false`)
   * default to denied. GPC forces the clamped signals denied either way.
   */
  googleConsentMode: boolean
```

- [ ] **Step 6: Set the defaults**

In `src/config.default.ts`, in `defaultConsentConfig`, add `googleConsentMode: false` next to `reloadOnConsentChange: true`:

```ts
  reloadOnConsentChange: true,

  googleConsentMode: false,
```

Add `google` to the `necessary` category object (alongside `enabled`/`readOnly`):

```ts
    {
      id: 'necessary',
      enabled: true,
      readOnly: true,
      google: ['security_storage', 'functionality_storage'],
      copy: {
```

Add `google` to the `analytics` category object (alongside `analytics`/`autoClear`):

```ts
    {
      id: 'analytics',
      analytics: true,
      google: [
        'analytics_storage',
        'ad_storage',
        'ad_user_data',
        'ad_personalization',
      ],
      autoClear: [
```

- [ ] **Step 7: Export the type**

In `src/index.ts`, change line 8 from:

```ts
export type { ConsentCategory } from './config.default'
```

to:

```ts
export type { ConsentCategory, GoogleConsentSignal } from './config.default'
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/config.default.test.ts`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/config.default.ts src/index.ts src/config.default.test.ts
git commit -m "feat: add googleConsentMode config type, per-category google signals, defaults"
```

---

### Task 2: `googleConsentMode.ts` — default command + signal derivation

**Files:**
- Create: `src/googleConsentMode.ts`
- Test: `src/googleConsentMode.test.ts`

**Interfaces:**
- Consumes: `getConsentConfig`, `isGpcClamped` from `./config`; `hasGpcSignal` from `./gpc`; `ConsentCategory` type from `./config.default`.
- Produces: `pushGoogleConsentDefault(): void`. (Task 3 adds `pushGoogleConsentUpdate` to the same file; Task 4 imports both.)

- [ ] **Step 1: Write the failing tests**

Create `src/googleConsentMode.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import { hasGpcSignal } from './gpc'
import { pushGoogleConsentDefault } from './googleConsentMode'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => false),
  acceptedCategory: vi.fn(() => false),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown }

/** Every dataLayer entry, each normalized from its `arguments` object. */
function entries(): unknown[][] {
  const dl = (window as W).dataLayer ?? []
  return dl.map((e) => Array.from(e as ArrayLike<unknown>))
}
function lastCommand(name: string): Record<string, unknown> | undefined {
  const found = entries().filter((e) => e[0] === 'consent' && e[1] === name)
  return found.length
    ? (found[found.length - 1][2] as Record<string, unknown>)
    : undefined
}

const NECESSARY: ConsentCategory = {
  id: 'necessary',
  enabled: true,
  readOnly: true,
  google: ['security_storage', 'functionality_storage'],
}
const ANALYTICS: ConsentCategory = {
  id: 'analytics',
  analytics: true,
  google: [
    'analytics_storage',
    'ad_storage',
    'ad_user_data',
    'ad_personalization',
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(hasGpcSignal).mockReturnValue(false)
  delete (window as W).dataLayer
  delete (window as W).gtag
})

afterEach(() => {
  delete (window as W).dataLayer
  delete (window as W).gtag
})

describe('pushGoogleConsentDefault', () => {
  it('does nothing when the feature is off', () => {
    configureConsent({
      googleConsentMode: false,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    expect((window as W).dataLayer).toBeUndefined()
  })

  it('opt-in mode defaults consent-gated signals to denied', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-in',
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    expect(d.analytics_storage).toBe('denied')
    expect(d.ad_storage).toBe('denied')
    expect(d.security_storage).toBe('granted')
    expect(d.functionality_storage).toBe('granted')
    expect(d.wait_for_update).toBe(500)
  })

  it('opt-out mode defaults enabled categories to granted', () => {
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    expect(d.analytics_storage).toBe('granted')
    expect(d.ad_personalization).toBe('granted')
  })

  it('GPC forces clamped signals denied even in opt-out mode', () => {
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    configureConsent({
      googleConsentMode: true,
      mode: 'opt-out',
      allowGpcOverride: false,
      categories: [NECESSARY, { ...ANALYTICS, enabled: true }],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    expect(d.analytics_storage).toBe('denied') // clamp beats enabled
    expect(d.security_storage).toBe('granted') // necessary not clamped
  })

  it('only pushes mapped signals', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    const d = lastCommand('default')!
    expect('personalization_storage' in d).toBe(false)
  })

  it('reuses an existing gtag/dataLayer instead of replacing it', () => {
    const existingGtag = vi.fn()
    ;(window as W).dataLayer = [{ existing: true }]
    ;(window as W).gtag = existingGtag
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentDefault()
    expect(existingGtag).toHaveBeenCalledWith(
      'consent',
      'default',
      expect.objectContaining({ wait_for_update: 500 }),
    )
    expect((window as W).dataLayer).toContainEqual({ existing: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/googleConsentMode.test.ts`
Expected: FAIL — cannot import `pushGoogleConsentDefault` (module doesn't exist).

- [ ] **Step 3: Write the module**

Create `src/googleConsentMode.ts`:

```ts
import { getConsentConfig, isGpcClamped } from './config'
import type { ConsentCategory } from './config.default'
import { hasGpcSignal } from './gpc'

type ConsentSignalState = 'granted' | 'denied'

/** True when GPC forces this category off (mirrors run.ts buildCategories). */
function gpcClampedOff(categoryId: string): boolean {
  return (
    isGpcClamped(categoryId) &&
    hasGpcSignal() &&
    !getConsentConfig().allowGpcOverride
  )
}

/**
 * Build the managed-signal map. `granted` decides, per category, whether that
 * category counts as granted for the command being built. A signal is
 * `'granted'` if ANY category that maps it is granted, else `'denied'`.
 * Signals no category maps are omitted (unmanaged).
 */
export function computeSignals(
  granted: (category: ConsentCategory) => boolean,
): Record<string, ConsentSignalState> {
  const signals: Record<string, ConsentSignalState> = {}
  for (const category of getConsentConfig().categories) {
    if (!category.google) continue
    const state: ConsentSignalState = granted(category) ? 'granted' : 'denied'
    for (const signal of category.google) {
      if (signals[signal] === 'granted') continue // OR across categories
      signals[signal] = state
    }
  }
  return signals
}

/** Reuse the page's dataLayer/gtag; define a gtag shim only if absent. */
export function getGtag(): (...args: unknown[]) => void {
  const w = window as unknown as {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  w.dataLayer = w.dataLayer || []
  if (typeof w.gtag !== 'function') {
    // Push the real `arguments` object — GTM only treats that form as a gtag
    // command, not a plain array.
    w.gtag = function gtag() {
      w.dataLayer!.push(arguments)
    }
  }
  return w.gtag
}

/**
 * Push the Consent Mode `default` command once, at init, before GTM reads it.
 * Direction is mode-aware via each category's `enabled` baseline: opt-out
 * categories (`enabled: true`) → granted; opt-in consent-gated categories
 * (`enabled: false`) → denied. GPC forces clamped signals denied regardless.
 */
export function pushGoogleConsentDefault(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().googleConsentMode) return
  const signals = computeSignals(
    (category) => (category.enabled ?? false) && !gpcClampedOff(category.id),
  )
  getGtag()('consent', 'default', { ...signals, wait_for_update: 500 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/googleConsentMode.test.ts`
Expected: PASS (6 cases).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/googleConsentMode.ts src/googleConsentMode.test.ts
git commit -m "feat: add pushGoogleConsentDefault with mode-aware signal derivation"
```

---

### Task 3: `pushGoogleConsentUpdate`

**Files:**
- Modify: `src/googleConsentMode.ts` (add the update function)
- Test: `src/googleConsentMode.test.ts` (add an update describe block)

**Interfaces:**
- Consumes: `hasConsent` from `./analytics`; `computeSignals`/`getGtag` already in the module.
- Produces: `pushGoogleConsentUpdate(): void`.

- [ ] **Step 1: Write the failing test**

Append to `src/googleConsentMode.test.ts` (add the import and a new describe block). Update the top import line:

```ts
import {
  pushGoogleConsentDefault,
  pushGoogleConsentUpdate,
} from './googleConsentMode'
```

Add `import * as CookieConsent from 'vanilla-cookieconsent'` below the existing imports, then append:

```ts
describe('pushGoogleConsentUpdate', () => {
  it('grants the signals of consented categories', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics' || id === 'necessary',
    )
    pushGoogleConsentUpdate()
    const u = lastCommand('update')!
    expect(u.analytics_storage).toBe('granted')
    expect(u.ad_user_data).toBe('granted')
    expect(u.security_storage).toBe('granted')
  })

  it('denies the signals of non-consented categories', () => {
    configureConsent({
      googleConsentMode: true,
      categories: [NECESSARY, ANALYTICS],
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'necessary',
    )
    pushGoogleConsentUpdate()
    const u = lastCommand('update')!
    expect(u.analytics_storage).toBe('denied')
    expect(u.security_storage).toBe('granted')
  })

  it('does nothing when the feature is off', () => {
    configureConsent({
      googleConsentMode: false,
      categories: [NECESSARY, ANALYTICS],
    })
    pushGoogleConsentUpdate()
    expect((window as W).dataLayer).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/googleConsentMode.test.ts -t "pushGoogleConsentUpdate"`
Expected: FAIL — `pushGoogleConsentUpdate` is not exported.

- [ ] **Step 3: Add the update function**

In `src/googleConsentMode.ts`, add the import at the top (below the existing imports):

```ts
import { hasConsent } from './analytics'
```

Append at the end of the file:

```ts
/**
 * Push the Consent Mode `update` command on every consent change. Derives from
 * `hasConsent` (a real recorded choice), which already honors the GPC clamp.
 */
export function pushGoogleConsentUpdate(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().googleConsentMode) return
  const signals = computeSignals((category) => hasConsent(category.id))
  getGtag()('consent', 'update', signals)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/googleConsentMode.test.ts`
Expected: PASS (9 cases total).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/googleConsentMode.ts src/googleConsentMode.test.ts
git commit -m "feat: add pushGoogleConsentUpdate driven by hasConsent"
```

---

### Task 4: Wire into `run.ts`

**Files:**
- Modify: `src/run.ts` (import + 5 call sites)
- Test: `src/run.gcm.test.ts` (new, jsdom)

**Interfaces:**
- Consumes: `pushGoogleConsentDefault`, `pushGoogleConsentUpdate` from `./googleConsentMode`; `runConsent` from `./run`.
- Produces: no new exports — `runConsent()` now emits a `default` at init and an `update` alongside every `dispatchConsentChange()`.

- [ ] **Step 1: Write the failing test**

Create `src/run.gcm.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import { runConsent } from './run'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => false),
  acceptedCategory: vi.fn(() => false),
  acceptCategory: vi.fn(),
  run: vi.fn(() => Promise.resolve()),
  show: vi.fn(),
  showPreferences: vi.fn(),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

type W = typeof window & { dataLayer?: unknown[]; gtag?: unknown }

function entries(): unknown[][] {
  const dl = (window as W).dataLayer ?? []
  return dl.map((e) => Array.from(e as ArrayLike<unknown>))
}
function hasCommand(name: string): boolean {
  return entries().some((e) => e[0] === 'consent' && e[1] === name)
}

const CATS: ConsentCategory[] = [
  {
    id: 'necessary',
    enabled: true,
    readOnly: true,
    google: ['security_storage', 'functionality_storage'],
  },
  {
    id: 'analytics',
    analytics: true,
    google: ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  delete (window as W).dataLayer
  delete (window as W).gtag
})

afterEach(() => {
  delete (window as W).dataLayer
  delete (window as W).gtag
})

describe('runConsent + Google Consent Mode', () => {
  it('pushes a default command at init', async () => {
    configureConsent({
      googleConsentMode: true,
      reloadOnConsentChange: false,
      categories: CATS,
    })
    await runConsent()
    expect(hasCommand('default')).toBe(true)
  })

  it('pushes an update when vanilla-cookieconsent reports a change', async () => {
    configureConsent({
      googleConsentMode: true,
      reloadOnConsentChange: false,
      categories: CATS,
    })
    await runConsent()

    const cfg = vi.mocked(CookieConsent.run).mock
      .calls[0][0] as CookieConsentConfig
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics' || id === 'necessary',
    )
    cfg.onChange!({} as never)

    // runConsent's own `.then` already pushed an initial (denied) update, so
    // assert on the LAST update — the one from this onChange.
    const updates = entries().filter(
      (e) => e[0] === 'consent' && e[1] === 'update',
    )
    const last = updates[updates.length - 1]
    expect((last[2] as Record<string, unknown>).analytics_storage).toBe(
      'granted',
    )
  })

  it('pushes nothing when the feature is off', async () => {
    configureConsent({
      googleConsentMode: false,
      reloadOnConsentChange: false,
      categories: CATS,
    })
    await runConsent()
    expect((window as W).dataLayer).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/run.gcm.test.ts`
Expected: FAIL — no `default`/`update` commands pushed (wiring absent); `dataLayer` undefined.

- [ ] **Step 3: Add the import**

In `src/run.ts`, after the existing imports (below the `import { hasGpcSignal } from './gpc'` line), add:

```ts
import {
  pushGoogleConsentDefault,
  pushGoogleConsentUpdate,
} from './googleConsentMode'
```

- [ ] **Step 4: Push the default at init**

In `src/run.ts`, inside `runConsent()`, immediately before `return CookieConsent.run({`, add:

```ts
  pushGoogleConsentDefault()

```

- [ ] **Step 5: Push updates alongside each consent change**

In `src/run.ts`, add `pushGoogleConsentUpdate()` after each `dispatchConsentChange()` call. There are four:

`onFirstConsent`:

```ts
    onFirstConsent: () => {
      dispatchConsentChange()
      pushGoogleConsentUpdate()
      reloadIfNeeded()
    },
```

`onConsent`:

```ts
    onConsent: () => {
      dispatchConsentChange()
      pushGoogleConsentUpdate()
    },
```

`onChange`:

```ts
    onChange: () => {
      dispatchConsentChange()
      pushGoogleConsentUpdate()
      reloadIfNeeded()
    },
```

The final `.then()`:

```ts
  }).then(() => {
    applyGpcIfNeeded()
    showGpcBannerIfNeeded()
    dispatchConsentChange()
    pushGoogleConsentUpdate()
  })
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/run.gcm.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all suites PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/run.ts src/run.gcm.test.ts
git commit -m "feat: emit Google Consent Mode default at init and update on consent change"
```

---

### Task 5: Documentation + build verification

**Files:**
- Modify: `README.md` (config-table row + a "Google Consent Mode" subsection)

**Interfaces:** none (docs only).

- [ ] **Step 1: Add the config-table row**

In `README.md`, in the "Overridable settings" table (the `| Setting | Description |` table), add a row after the `reloadOnConsentChange` row:

```md
| `googleConsentMode` | Emit Google Consent Mode v2 signals (`default` at init, `update` on change), mapped from each category's `google` list. Off by default. See [Google Consent Mode](#google-consent-mode-v2-optional). |
```

- [ ] **Step 2: Add the subsection**

In `README.md`, immediately before the `### 5. Gate embeds & widgets` heading, add:

````md
### Google Consent Mode v2 (optional)

Off by default. Set `googleConsentMode: true` to feed consent state into Google's
tags (GA4 / Google Ads via GTM) as Consent Mode signals. The library pushes a
`gtag('consent','default',…)` at init and a `gtag('consent','update',…)` on every
change; it reuses the page's `dataLayer`/`gtag` and never blocks or unblocks the
tag itself.

Map each category to the signals it grants with a `google` array:

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true,
    google: ['security_storage', 'functionality_storage'] },
  { id: 'analytics', analytics: true,
    google: ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'] },
]
```

**Direction follows `mode`** (via each category's `enabled` baseline):

- **opt-out (CCPA):** `mode: 'opt-out'`, consent-gated categories `enabled: true`.
  The `default` emits **granted**; opting out (or GPC) pushes an `update` flipping
  the signals to `denied`. Tags usually load unblocked and `reloadOnConsentChange`
  is off. Inline the same default in `<head>` above the GTM snippet so it is read
  before the container loads:

  ```html
  <script>
    window.dataLayer = window.dataLayer || []
    function gtag(){ dataLayer.push(arguments) }
    gtag('consent', 'default', {
      analytics_storage: 'granted', ad_storage: 'granted',
      ad_user_data: 'granted', ad_personalization: 'granted',
      security_storage: 'granted', functionality_storage: 'granted',
      wait_for_update: 500,
    })
  </script>
  ```

- **opt-in (prior consent):** `mode: 'opt-in'`, GTM tagged `type="text/plain"`.
  The `default` emits **denied**; opting in pushes an `update` granting the
  signals, and the existing reload re-activates the blocked tag.

**GPC is honored in both** — a GPC visitor's `analytics_storage`/`ad_*` come out
`denied` regardless of mode (unless `allowGpcOverride`), because signals derive
from the same consent state the rest of the library uses.
````

- [ ] **Step 3: Build to confirm the package still compiles and includes the type**

Run: `npm run build`
Expected: build completes; `dist/index.d.ts` contains `GoogleConsentSignal`.

Verify:

```bash
grep -c "GoogleConsentSignal\|googleConsentMode" dist/index.d.ts
```

Expected: a non-zero count.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document googleConsentMode (opt-in/opt-out, per-category signals, GPC)"
```

---

## Notes for the implementer

- **Why the `default` command doesn't branch on `config.mode`:** mode-awareness is carried by each category's `enabled` flag, which projects already set per mode (opt-out projects mark analytics `enabled: true`; opt-in projects leave it `false`). So `granted = enabled && !gpcClampedOff` is correct for both — simpler than reading `mode` directly, and consistent with how `buildCategories()` already derives read-only state.
- **`update` vs `default` derivation differ deliberately:** `update` uses `hasConsent()` (a recorded choice, GPC-aware); `default` uses `enabled` because `hasConsent()` is `false` pre-interaction in both modes and would wrongly deny an opt-out site at first load.
- **Arguments form matters:** the shim pushes `arguments`, not `['consent',…]`. Tests normalize with `Array.from(entry)`, which works for both, but real GTM only recognizes the arguments form.
