# Meta Pixel Consent Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, off-by-default `metaPixelConsentMode` that feeds consent state into the Meta Pixel (`fbq`) as grant/revoke/LDU signals, mirroring the existing `googleConsentMode` feature.

**Architecture:** A new internal module `src/metaPixelConsentMode.ts` exposes two push functions (`pushMetaPixelConsentDefault` at init, `pushMetaPixelConsentUpdate` on change) wired into `run.ts` alongside their Google counterparts. Category→pixel mapping is a per-category boolean `meta` flag (OR across categories). Direction is mode-aware: opt-in grants/revokes; opt-out grants + clears LDU when consented, and revokes + applies LDU when not. A shared `gpcClampedOff()` helper moves from `googleConsentMode.ts` to `config.ts` so both consent-mode modules use one GPC-clamp rule.

**Tech Stack:** TypeScript (strict), vanilla-cookieconsent (peer), Vitest + jsdom.

## Global Constraints

- **No new dependencies.** Only `vanilla-cookieconsent` (peer) and existing devDeps.
- **Functions stay internal** — do NOT re-export the new module from `src/index.ts`. The only public surface change is two `ConsentConfig`/`ConsentCategory` fields.
- **Never synthesize an `fbq` stub.** `getFbq()` returns the real `window.fbq` only if it is already a function, else a no-op. A stub would trip the Meta base snippet's `if (f.fbq) return` guard and suppress pixel init.
- **SSR-safe:** both push functions no-op when `typeof window === 'undefined'`, and early-return unless `metaPixelConsentMode` is on.
- **opt-in mode never emits any `dataProcessingOptions` call** — LDU is opt-out-only.
- **GPC clamp is independent of `allowGpcOverride`** — `gpcClampedOff()` must not consult `allowGpcOverride` (guards commit `3ab4f47`).
- **Naming:** config flag `metaPixelConsentMode`; module `src/metaPixelConsentMode.ts`; functions `getFbq`, `computeMetaPixelGranted`, `applyMetaPixelState`, `pushMetaPixelConsentDefault`, `pushMetaPixelConsentUpdate`.
- **Commits:** end each commit message body with `Claude-Session: https://claude.ai/code/session_01JctXWaZguF7785htmt2T4P`.
- Run the full suite with `npm test` and typecheck with `npm run typecheck`.

---

### Task 1: Move `gpcClampedOff` to `config.ts` (shared helper refactor)

Pure refactor with existing test coverage (`googleConsentMode.test.ts`, `run.gcm.test.ts` must stay green). `gpcClampedOff` is currently private in `googleConsentMode.ts`; move it to `config.ts` next to `isGpcClamped` and export it. Verified no import cycle: `config.ts` will import `hasGpcSignal` from `gpc.ts`, and `gpc.ts` imports nothing from `config.ts`.

**Files:**
- Modify: `src/config.ts` (add import + exported function)
- Modify: `src/googleConsentMode.ts:1-17` (remove local copy + `hasGpcSignal` import; import from `config`)

**Interfaces:**
- Produces: `gpcClampedOff(categoryId: string): boolean` exported from `src/config.ts` — true iff the category is GPC-clamped AND a GPC signal is present; independent of `allowGpcOverride`.

- [ ] **Step 1: Add `gpcClampedOff` to `config.ts`**

Add this import at the top of `src/config.ts` (below the existing imports):

```ts
import { hasGpcSignal } from './gpc'
```

Append this function to the end of `src/config.ts`:

```ts
/**
 * True when GPC forces this category off by default. Independent of
 * `allowGpcOverride` — override governs the toggle/persistence, not the
 * default-off state — mirroring the `enabled` downgrade in run.ts
 * `buildCategories`. Consumed by both consent-mode modules.
 */
export function gpcClampedOff(categoryId: string): boolean {
  return isGpcClamped(categoryId) && hasGpcSignal()
}
```

- [ ] **Step 2: Point `googleConsentMode.ts` at the shared helper**

In `src/googleConsentMode.ts`, replace the top imports (lines 1-4) so it imports `gpcClampedOff` from `config` and drops the now-unused `isGpcClamped`/`hasGpcSignal` imports:

```ts
import { hasConsent } from './analytics'
import { getConsentConfig, gpcClampedOff } from './config'
import type { ConsentCategory } from './config.default'
```

Then delete the local `gpcClampedOff` definition (the JSDoc block + function at lines 8-17).

- [ ] **Step 3: Run the existing consent-mode suites to verify the refactor is behavior-preserving**

Run: `npx vitest run src/googleConsentMode.test.ts src/run.gcm.test.ts`
Expected: PASS (all existing Google Consent Mode tests still green).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors (confirms no dangling `isGpcClamped`/`hasGpcSignal` references in `googleConsentMode.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/googleConsentMode.ts
git commit -m "refactor: share gpcClampedOff via config.ts

Move the GPC-clamp helper out of googleConsentMode so the upcoming Meta
consent module can reuse the one rule. Behavior-preserving.

Claude-Session: https://claude.ai/code/session_01JctXWaZguF7785htmt2T4P"
```

---

### Task 2: Config types + defaults (`meta` flag, `metaPixelConsentMode`)

Add the two config fields and set `meta: true` on the default `analytics` category. Inert until the feature is enabled.

**Files:**
- Modify: `src/config.default.ts` (add `ConsentCategory.meta`, `ConsentConfig.metaPixelConsentMode`, default value, default-category flag)
- Test: `src/config.default.test.ts`

**Interfaces:**
- Produces: `ConsentCategory.meta?: boolean`; `ConsentConfig.metaPixelConsentMode: boolean` (default `false`); the default `analytics` category carries `meta: true`.

- [ ] **Step 1: Write the failing test**

Append to `src/config.default.test.ts`:

```ts
describe('Meta Pixel consent config', () => {
  it('defaults metaPixelConsentMode to false', () => {
    expect(defaultConsentConfig.metaPixelConsentMode).toBe(false)
  })

  it('flags the default analytics category with meta: true', () => {
    const analytics = defaultConsentConfig.categories.find((c) => c.analytics)
    expect(analytics?.meta).toBe(true)
  })
})
```

If `defaultConsentConfig` is not already imported at the top of that file, add:

```ts
import { defaultConsentConfig } from './config.default'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.default.test.ts`
Expected: FAIL — `metaPixelConsentMode` is `undefined`; `analytics?.meta` is `undefined`.

- [ ] **Step 3: Add the type fields and defaults**

In `src/config.default.ts`, add to the `ConsentCategory` interface (next to the `google?` field):

```ts
  /** Grants the Meta Pixel when this category is consented (binary). */
  meta?: boolean
```

Add to the `ConsentConfig` interface (next to `googleConsentMode`):

```ts
  /**
   * Enable Meta Pixel consent signaling. Off when omitted. Grants/revokes the
   * pixel (`fbq('consent', …)`) from each category's `meta` flag on consent
   * change. Direction follows `mode`: opt-in starts revoked and grants on
   * consent; opt-out starts granted and, on opt-out, applies Limited Data Use
   * (LDU) *and* revokes. GPC forces the clamped categories off either way.
   * The library manages the live session only — it cannot suppress the
   * page-load PageView (set the pre-`fbq('init')` state inline in `<head>`; see
   * README). The pixel base code must load before initConsent() — the library
   * never injects or stubs `fbq`.
   */
  metaPixelConsentMode: boolean
```

In `defaultConsentConfig`, add `metaPixelConsentMode: false` next to `googleConsentMode: false`:

```ts
  googleConsentMode: false,

  metaPixelConsentMode: false,
```

In the default `analytics` category object, add `meta: true` right after `analytics: true`:

```ts
    {
      id: 'analytics',
      analytics: true,
      meta: true,
      google: [
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.default.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.default.ts src/config.default.test.ts
git commit -m "feat: add metaPixelConsentMode + per-category meta flag

Off by default; default analytics category flagged meta: true (inert
until the feature is enabled).

Claude-Session: https://claude.ai/code/session_01JctXWaZguF7785htmt2T4P"
```

---

### Task 3: `metaPixelConsentMode.ts` module + unit tests

The core module. TDD: write the full unit suite, watch it fail, implement, watch it pass.

**Files:**
- Create: `src/metaPixelConsentMode.ts`
- Test: `src/metaPixelConsentMode.test.ts`

**Interfaces:**
- Consumes: `hasConsent` (`src/analytics.ts`), `getConsentConfig` + `gpcClampedOff` (`src/config.ts`, from Task 1), `ConsentCategory` (`src/config.default.ts`), `metaPixelConsentMode` + `meta` fields (Task 2).
- Produces (all exported from `src/metaPixelConsentMode.ts`):
  - `getFbq(): (...args: unknown[]) => void`
  - `computeMetaPixelGranted(granted: (category: ConsentCategory) => boolean): boolean`
  - `applyMetaPixelState(granted: boolean): void`
  - `pushMetaPixelConsentDefault(): void`
  - `pushMetaPixelConsentUpdate(): void`

- [ ] **Step 1: Write the failing unit test file**

Create `src/metaPixelConsentMode.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import { hasGpcSignal } from './gpc'
import { configureConsent } from './config'
import type { ConsentCategory } from './config.default'
import {
  pushMetaPixelConsentDefault,
  pushMetaPixelConsentUpdate,
} from './metaPixelConsentMode'

vi.mock('vanilla-cookieconsent', () => ({
  validConsent: vi.fn(() => false),
  acceptedCategory: vi.fn(() => false),
}))
vi.mock('./gpc', () => ({ hasGpcSignal: vi.fn(() => false) }))

type W = typeof window & { fbq?: ReturnType<typeof vi.fn> }

function fbqCalls(): unknown[][] {
  const fbq = (window as W).fbq
  return fbq ? fbq.mock.calls.map((c) => Array.from(c)) : []
}
function consentCalls(): unknown[] {
  return fbqCalls()
    .filter((c) => c[0] === 'consent')
    .map((c) => c[1])
}
function dpoCalls(): unknown[][] {
  return fbqCalls().filter((c) => c[0] === 'dataProcessingOptions')
}

const CATS: ConsentCategory[] = [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', analytics: true, meta: true },
]
const OPTOUT_CATS: ConsentCategory[] = [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', enabled: true, analytics: true, meta: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  // clearAllMocks does not undo mockReturnValue, so pin defaults explicitly.
  vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  vi.mocked(hasGpcSignal).mockReturnValue(false)
  ;(window as W).fbq = vi.fn()
})

afterEach(() => {
  delete (window as W).fbq
})

describe('metaPixelConsentMode', () => {
  it('1. off: pushes nothing', () => {
    configureConsent({ metaPixelConsentMode: false, categories: CATS })
    pushMetaPixelConsentDefault()
    pushMetaPixelConsentUpdate()
    expect(fbqCalls()).toHaveLength(0)
  })

  it('2. absent fbq: no throw, no stub synthesized', () => {
    delete (window as W).fbq
    configureConsent({ metaPixelConsentMode: true, categories: CATS })
    expect(() => pushMetaPixelConsentDefault()).not.toThrow()
    expect((window as W).fbq).toBeUndefined()
  })

  it('3. default, opt-in: revoke, no DPO', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    pushMetaPixelConsentDefault()
    expect(consentCalls()).toContain('revoke')
    expect(dpoCalls()).toHaveLength(0)
  })

  it('4. default, opt-out: grant + clear LDU, never LDU', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-out',
      categories: OPTOUT_CATS,
    })
    pushMetaPixelConsentDefault()
    expect(consentCalls()).toContain('grant')
    expect(dpoCalls()).toContainEqual(['dataProcessingOptions', []])
    expect(
      dpoCalls().some(
        (c) => Array.isArray(c[1]) && (c[1] as unknown[]).includes('LDU'),
      ),
    ).toBe(false)
  })

  it('5. update grant, opt-in: grant, no DPO', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    pushMetaPixelConsentUpdate()
    expect(consentCalls()).toContain('grant')
    expect(dpoCalls()).toHaveLength(0)
  })

  it('6. update opt-out withdrawal: LDU + revoke', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-out',
      categories: OPTOUT_CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    pushMetaPixelConsentUpdate()
    expect(dpoCalls()).toContainEqual(['dataProcessingOptions', ['LDU'], 0, 0])
    expect(consentCalls()).toContain('revoke')
  })

  it('7. update opt-in no consent: revoke, no DPO', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    pushMetaPixelConsentUpdate()
    expect(consentCalls()).toContain('revoke')
    expect(dpoCalls()).toHaveLength(0)
  })

  it('8. opt-in never emits dataProcessingOptions', () => {
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    pushMetaPixelConsentDefault()
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(true)
    pushMetaPixelConsentUpdate()
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
    pushMetaPixelConsentUpdate()
    expect(dpoCalls()).toHaveLength(0)
  })

  it('9. GPC opt-in: default revoke', () => {
    vi.mocked(hasGpcSignal).mockReturnValue(true)
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: CATS,
    })
    pushMetaPixelConsentDefault()
    expect(consentCalls()).toContain('revoke')
  })

  it.each([false, true])(
    '10. GPC opt-out (allowGpcOverride=%s): default LDU + revoke (override-independent)',
    (allowGpcOverride) => {
      vi.mocked(hasGpcSignal).mockReturnValue(true)
      configureConsent({
        metaPixelConsentMode: true,
        mode: 'opt-out',
        allowGpcOverride,
        categories: OPTOUT_CATS,
      })
      pushMetaPixelConsentDefault()
      expect(dpoCalls()).toContainEqual([
        'dataProcessingOptions',
        ['LDU'],
        0,
        0,
      ])
      expect(consentCalls()).toContain('revoke')
    },
  )

  it('11. OR across meta categories: one consented → grant', () => {
    const cats: ConsentCategory[] = [
      { id: 'a', analytics: true, meta: true },
      { id: 'b', meta: true },
    ]
    configureConsent({
      metaPixelConsentMode: true,
      mode: 'opt-in',
      categories: cats,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'b',
    )
    pushMetaPixelConsentUpdate()
    expect(consentCalls()).toContain('grant')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/metaPixelConsentMode.test.ts`
Expected: FAIL — cannot resolve `./metaPixelConsentMode` (module not created yet).

- [ ] **Step 3: Write the module**

Create `src/metaPixelConsentMode.ts`:

```ts
import { hasConsent } from './analytics'
import { getConsentConfig, gpcClampedOff } from './config'
import type { ConsentCategory } from './config.default'

/**
 * The page's `fbq` if it is already a function, else a no-op. Deliberately does
 * NOT synthesize an `fbq` stub: the Meta base snippet self-guards with
 * `if (f.fbq) return`, so any stub we define would suppress pixel init. The
 * pixel base code must therefore load before initConsent().
 */
export function getFbq(): (...args: unknown[]) => void {
  const w = window as unknown as { fbq?: (...args: unknown[]) => void }
  return typeof w.fbq === 'function' ? w.fbq : () => {}
}

/**
 * True if ANY `meta`-flagged category counts as granted under `granted`.
 * Categories without `meta` are ignored (the pixel is binary — one OR'd state).
 */
export function computeMetaPixelGranted(
  granted: (category: ConsentCategory) => boolean,
): boolean {
  return getConsentConfig().categories.some(
    (category) => category.meta && granted(category),
  )
}

/**
 * Apply the binary pixel state, mode-aware:
 * - granted            → grant (+ clear LDU in opt-out)
 * - not granted, opt-in→ revoke
 * - not granted, opt-out→ LDU + revoke (held everywhere; limited where Meta
 *   geolocates a covered US state). opt-in never emits dataProcessingOptions.
 */
export function applyMetaPixelState(granted: boolean): void {
  const fbq = getFbq()
  const optOut = getConsentConfig().mode === 'opt-out'
  if (granted) {
    fbq('consent', 'grant')
    if (optOut) fbq('dataProcessingOptions', [])
  } else if (optOut) {
    fbq('dataProcessingOptions', ['LDU'], 0, 0)
    fbq('consent', 'revoke')
  } else {
    fbq('consent', 'revoke')
  }
}

/**
 * Best-effort default at init (before CookieConsent.run initializes
 * acceptedCategory), from the `enabled` baseline minus any GPC clamp — mirrors
 * pushGoogleConsentDefault. The authoritative page-load state is the consumer's
 * inline `<head>` snippet (see README); this only bites if the pixel base code
 * is itself deferred past initConsent().
 */
export function pushMetaPixelConsentDefault(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().metaPixelConsentMode) return
  const granted = computeMetaPixelGranted(
    (category) => (category.enabled ?? false) && !gpcClampedOff(category.id),
  )
  applyMetaPixelState(granted)
}

/**
 * Update on a recorded consent change, derived from hasConsent (which honors the
 * GPC clamp). Pushed wherever the library dispatches its consent-change event.
 */
export function pushMetaPixelConsentUpdate(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().metaPixelConsentMode) return
  const granted = computeMetaPixelGranted((category) => hasConsent(category.id))
  applyMetaPixelState(granted)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/metaPixelConsentMode.test.ts`
Expected: PASS (all 11 cases; case 10 runs twice via `it.each`).

- [ ] **Step 5: Commit**

```bash
git add src/metaPixelConsentMode.ts src/metaPixelConsentMode.test.ts
git commit -m "feat: Meta Pixel consent signaling module

getFbq (no stub) + mode-aware grant/revoke/LDU push functions. opt-out
'not granted' emits LDU + revoke; opt-in never touches dataProcessingOptions.

Claude-Session: https://claude.ai/code/session_01JctXWaZguF7785htmt2T4P"
```

---

### Task 4: Wire into `run.ts` + run-wiring tests

Pair each Meta push with its Google counterpart in `runConsent()`.

**Files:**
- Modify: `src/run.ts:11-14` (imports), `:87` (default), `:104`/`:110`/`:115`/`:133` (updates)
- Test: `src/run.meta.test.ts`

**Interfaces:**
- Consumes: `pushMetaPixelConsentDefault` / `pushMetaPixelConsentUpdate` (Task 3), `runConsent` (`src/run.ts`).

- [ ] **Step 1: Write the failing wiring test file**

Create `src/run.meta.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as CookieConsent from 'vanilla-cookieconsent'
import type { CookieConsentConfig } from 'vanilla-cookieconsent'
import { hasGpcSignal } from './gpc'
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

type W = typeof window & { fbq?: ReturnType<typeof vi.fn> }

function fbqCalls(): unknown[][] {
  const fbq = (window as W).fbq
  return fbq ? fbq.mock.calls.map((c) => Array.from(c)) : []
}
function consentCalls(): unknown[] {
  return fbqCalls()
    .filter((c) => c[0] === 'consent')
    .map((c) => c[1])
}
function dpoCalls(): unknown[][] {
  return fbqCalls().filter((c) => c[0] === 'dataProcessingOptions')
}

const CATS: ConsentCategory[] = [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', analytics: true, meta: true },
]
const OPTOUT_CATS: ConsentCategory[] = [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', enabled: true, analytics: true, meta: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
  vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false)
  vi.mocked(hasGpcSignal).mockReturnValue(false)
  ;(window as W).fbq = vi.fn()
})

afterEach(() => {
  delete (window as W).fbq
})

describe('runConsent + Meta Pixel consent', () => {
  it('pushes a default at init when on', async () => {
    configureConsent({
      metaPixelConsentMode: true,
      reloadOnConsentChange: false,
      mode: 'opt-in',
      categories: CATS,
    })
    await runConsent()
    expect(consentCalls().length).toBeGreaterThan(0)
  })

  it('pushes nothing when off', async () => {
    configureConsent({
      metaPixelConsentMode: false,
      reloadOnConsentChange: false,
      categories: CATS,
    })
    await runConsent()
    expect(fbqCalls()).toHaveLength(0)
  })

  it('onChange pushes an update reflecting hasConsent', async () => {
    configureConsent({
      metaPixelConsentMode: true,
      reloadOnConsentChange: false,
      mode: 'opt-in',
      categories: CATS,
    })
    await runConsent()
    const cfg = vi.mocked(CookieConsent.run).mock
      .calls[0][0] as CookieConsentConfig
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockImplementation(
      (id) => id === 'analytics',
    )
    ;(window as W).fbq = vi.fn() // isolate the onChange push
    cfg.onChange!({} as never)
    expect(consentCalls()).toContain('grant')
  })

  it('fresh no-consent load pushes only the default (opt-in revoke), no update', async () => {
    configureConsent({
      metaPixelConsentMode: true,
      reloadOnConsentChange: false,
      mode: 'opt-in',
      categories: CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(false)
    await runConsent()
    expect(consentCalls()).toEqual(['revoke'])
    expect(dpoCalls()).toHaveLength(0)
  })

  it('returning opted-out visitor: .then() update applies LDU + revoke (opt-out)', async () => {
    configureConsent({
      metaPixelConsentMode: true,
      reloadOnConsentChange: false,
      mode: 'opt-out',
      categories: OPTOUT_CATS,
    })
    vi.mocked(CookieConsent.validConsent).mockReturnValue(true)
    vi.mocked(CookieConsent.acceptedCategory).mockReturnValue(false) // saved opt-out
    await runConsent()
    // Default fires grant + clear-LDU first (the page-load limitation), then the
    // .then() update corrects subsequent events to LDU + revoke.
    expect(dpoCalls()).toContainEqual(['dataProcessingOptions', ['LDU'], 0, 0])
    expect(consentCalls()).toContain('revoke')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/run.meta.test.ts`
Expected: FAIL — `run.ts` does not call the Meta push functions yet (e.g. "pushes a default at init" gets 0 consent calls).

- [ ] **Step 3: Wire the push calls into `run.ts`**

In `src/run.ts`, extend the consent-mode import block (currently lines 11-14) to add the Meta functions:

```ts
import {
  pushGoogleConsentDefault,
  pushGoogleConsentUpdate,
} from './googleConsentMode'
import {
  pushMetaPixelConsentDefault,
  pushMetaPixelConsentUpdate,
} from './metaPixelConsentMode'
```

Add the default push immediately after the existing `pushGoogleConsentDefault()` call (line 87):

```ts
  pushGoogleConsentDefault()
  pushMetaPixelConsentDefault()
```

Add `pushMetaPixelConsentUpdate()` immediately after each of the three `pushGoogleConsentUpdate()` calls inside the callbacks (`onFirstConsent`, `onConsent`, `onChange`). Each becomes:

```ts
      pushGoogleConsentUpdate()
      pushMetaPixelConsentUpdate()
```

And in the final `.then()` guard (line 133), pair it too:

```ts
    if (CookieConsent.validConsent()) {
      pushGoogleConsentUpdate()
      pushMetaPixelConsentUpdate()
    }
```

- [ ] **Step 4: Run the wiring tests to verify they pass**

Run: `npx vitest run src/run.meta.test.ts`
Expected: PASS (all 5 wiring cases).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, no type errors (confirms the `googleConsentMode`/`run.gcm` suites are unaffected by the wiring).

- [ ] **Step 6: Commit**

```bash
git add src/run.ts src/run.meta.test.ts
git commit -m "feat: wire Meta Pixel consent into runConsent

Pair each Meta push with its Google counterpart (default at init; update
on every consent change and the post-run validConsent settle).

Claude-Session: https://claude.ai/code/session_01JctXWaZguF7785htmt2T4P"
```

---

### Task 5: README documentation

Document the feature, the strict opt-out (revoke + LDU), the LDU geo caveat, and the page-load / pre-`init` responsibility for both modes.

**Files:**
- Modify: `README.md` (config-overrides table + new subsection after the Google Consent Mode section)

**Interfaces:** none (docs only).

- [ ] **Step 1: Add the config-table row**

In `README.md`, in the "Overridable settings" table, add this row immediately after the `googleConsentMode` row:

```markdown
| `metaPixelConsentMode` | Emit Meta Pixel consent signals (`fbq('consent', …)`) on consent change, mapped from each category's `meta` flag. Opt-out adds Limited Data Use (LDU). Off by default. See [Meta Pixel Consent Mode](#meta-pixel-consent-mode-optional). |
```

- [ ] **Step 2: Add the subsection**

In `README.md`, immediately after the "Google Consent Mode v2 (optional)" subsection (before "### 5. Gate embeds & widgets"), insert:

````markdown
### Meta Pixel Consent Mode (optional)

Off by default. Set `metaPixelConsentMode: true` to feed consent state into the
Meta Pixel. Meta's consent API is **binary** — `fbq('consent','grant')` /
`fbq('consent','revoke')` turn the whole pixel on/off — plus **Limited Data Use
(LDU)** for US-state opt-outs. Flag the granting categories with `meta: true`
(the pixel is granted if **any** `meta` category is consented):

```ts
categories: [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'analytics', analytics: true, meta: true,
    google: ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'] },
]
```

**Direction follows `mode`:**

- **opt-in (GDPR):** the pixel starts revoked and is granted on consent;
  withdrawal revokes. LDU is never used.
- **opt-out (CCPA):** the pixel starts granted; opting out emits **both**
  `fbq('dataProcessingOptions', ['LDU'], 0, 0)` and `fbq('consent','revoke')`,
  and opting back in grants and clears LDU (`fbq('dataProcessingOptions', [])`).

> **LDU geo caveat:** `['LDU'], 0, 0` only takes effect where Meta geolocates a
> covered US state — which is why opt-out also `revoke`s, so a recorded opt-out
> holds events everywhere. The trade-off is that revoke suppresses Meta's modeled
> conversions even in covered states.

**GPC is honored in both** — a GPC visitor's `meta` category is forced off by
default (revoke under opt-in; revoke + LDU under opt-out), **even under
`allowGpcOverride`** (override only lets a saved opt-in later grant).

#### The page-load PageView is yours to set (both modes)

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
> because the Meta base snippet's `if (f.fbq) return` guard would then skip pixel
> initialization. Keep the pixel base code in `<head>`, above your bundle.
````

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document Meta Pixel consent mode

Config row + subsection: per-category meta mapping, strict opt-out
(revoke + LDU) with the LDU geo caveat, and the page-load / pre-init
responsibility for both modes.

Claude-Session: https://claude.ai/code/session_01JctXWaZguF7785htmt2T4P"
```

---

## Notes for the implementer

- **DPO runtime spike (from the spec):** the opt-out path relies on toggling
  `dataProcessingOptions` *after* `init` (Meta documents it mainly as pre-`init`
  config). Before considering the feature done, do a quick manual check against a
  real pixel: watch the `dpo`/`dpoco`/`dpost` params on outgoing `/tr` requests
  across a grant→opt-out→grant cycle. If runtime toggling doesn't take effect,
  the opt-out path leans on `revoke` alone and LDU becomes init-only (an inline
  `<head>` snippet) — note the finding in the README. This is a real-pixel check,
  not a unit test.
- Tasks are ordered by dependency (1 → 5). Task 1 must land first (Task 3 imports
  `gpcClampedOff` from `config`).
