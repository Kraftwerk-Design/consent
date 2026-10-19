import { resolveConfig, validateConsentConfig } from '../config'
import type { AgeGateConfig, ConsentConfig } from '../config.default'
import { hasGpcSignal } from '../gpc'
import { createAgeGate, warnDefaultNamePass, warnUngatedTags, type AgeGate } from '../ageGate'
import { installDom } from '../dom'
import { startLibrary, type ChangeCause, type LibrarySession } from './library'
import { reloadPage } from './reload'
import { defaultGateCategoryId, gpcState, planCategories } from './categories'
import { baselineSnapshot, createSnapshotStore, type ConsentSnapshot } from './snapshot'

export type ConsentListener = (next: ConsentSnapshot, prev: ConsentSnapshot) => void

/** The page's consent controller, returned by `initConsent()`. */
export interface ConsentHandle {
  /**
   * Resolves once the banner has run and the first snapshot is applied.
   * Stays pending if the handle is destroyed first.
   */
  readonly ready: Promise<void>
  /** The effective consent state. Same reference until it changes. */
  getSnapshot(): ConsentSnapshot
  /** Called once per distinct change after it is applied. Returns the unsubscribe. */
  subscribe(fn: ConsentListener): () => void
  /** Whether the category (default: the default gate category) is effective. */
  has(category?: string): boolean
  /**
   * True when the category is effective; otherwise opens the consent UI
   * (nothing opens while the age gate is open).
   */
  require(category?: string): boolean
  /**
   * Open the consent UI: the banner before a choice, the preferences after.
   * The preferences modal is not category-scoped; `category` has no effect.
   */
  prompt(category?: string): void
  /**
   * Remove the banner, the wrapper's listeners, `window.KDConsent`,
   * subscribers and a pending age wait, and unmount gated elements.
   * `initConsent()` can then run again.
   * A `ready` that has not resolved yet stays pending.
   */
  destroy(): void
}

/** What the page's active controller shares with every copy of this module. */
export interface Controller {
  readonly handle: ConsentHandle
  /** Null when no `ageGate` is configured. */
  readonly ageGate: AgeGate | null
}

// On globalThis so every copy of this module (separate bundles, module resets
// in tests) shares the page's one controller. Bump the version when
// `Controller` changes shape so mismatched copies stay independent.
const KEY = '@kraftwerkdesign/consent.controller@1'
const ACTIVE_CONTROLLER = Symbol.for(KEY)
/** Dispatched on `document` when the active controller changes. */
const CONTROLLER_EVENT = KEY
const page = globalThis as { [ACTIVE_CONTROLLER]?: Controller | null }
const active = (): Controller | null => page[ACTIVE_CONTROLLER] ?? null

/** The live controller's handle; null before `initConsent()` and after `destroy()`. */
export function activeHandle(): ConsentHandle | null {
  return active()?.handle ?? null
}

/**
 * Make `controller` the page's active one and notify watchers. Returns the
 * clear, which does nothing once another controller has replaced it.
 */
export function publishController(controller: Controller): () => void {
  page[ACTIVE_CONTROLLER] = controller
  document.dispatchEvent(new Event(CONTROLLER_EVENT))
  return () => {
    if (active() !== controller) return
    page[ACTIVE_CONTROLLER] = null
    document.dispatchEvent(new Event(CONTROLLER_EVENT))
  }
}

/** Call `fn` with the active handle now and on every change. Returns the unsubscribe. */
export function watchActiveHandle(fn: (handle: ConsentHandle | null) => void): () => void {
  const notify = (): void => fn(activeHandle())
  document.addEventListener(CONTROLLER_EVENT, notify)
  notify()
  return () => document.removeEventListener(CONTROLLER_EVENT, notify)
}

/**
 * Initialize consent for the page: resolve the config, expose
 * `window.KDConsent`, run each integration's deny-first `init`, and run the
 * banner. With `ageGate` configured the banner waits for
 * `confirmAge()`; nothing else runs before it.
 *
 * Call once per page. A repeat call returns the same handle and ignores its
 * options (with a warning); `destroy()` the handle first to re-initialize.
 */
export function initConsent(options?: Partial<ConsentConfig>): ConsentHandle {
  const current = active()
  if (current) {
    if (options !== undefined) {
      console.warn(
        '[consent] initConsent() already initialized; ignoring these options. Use the returned handle, or destroy() it first.',
      )
    }
    return current.handle
  }
  return createController(options ?? {})
}

/**
 * Record that the visitor passed the age gate and release the consent stack.
 * Input-agnostic: the site decides eligibility (yes/no, date of birth, …) and
 * calls this only on a pass. Never stores the answer itself.
 *
 * Writes the age cookie with the configured `ageGate`, else with `opts`
 * (before `initConsent()`, or with no `ageGate`); a later `initConsent()`
 * with the same options then runs at once.
 */
export function confirmAge(opts: AgeGateConfig = {}): void {
  ;(active()?.ageGate ?? createAgeGate(opts)).confirm()
}

/**
 * Whether the visitor has passed the age gate. After `initConsent()`, uses the
 * configured `ageGate` and is true when none is configured. Before it, checks
 * the cookie `opts` names.
 */
export function isAgeVerified(opts: AgeGateConfig = {}): boolean {
  const current = active()
  if (current) return current.ageGate?.passed() ?? true
  return createAgeGate(opts).passed()
}

/** Run `fn`; report a throw without stopping the caller. */
function isolate(fn: () => void): void {
  try {
    fn()
  } catch (error) {
    queueMicrotask(() => {
      throw error
    })
  }
}

function createController(options: Partial<ConsentConfig>): ConsentHandle {
  const config = resolveConfig(options)
  for (const warning of validateConsentConfig(config)) console.warn('[consent] ' + warning)
  const plan = planCategories(config, gpcState(hasGpcSignal(), config.allowGpcOverride))
  const subscribers = new Set<ConsentListener>()

  const ageGate = config.ageGate ? createAgeGate(config.ageGate) : null
  let cancelAgeWait = (): void => {}
  let session: LibrarySession | null = null
  let detach = (): void => {}
  let destroyed = false

  const store = createSnapshotStore({
    plan,
    reload: config.reload,
    awaitingAge: ageGate !== null && !ageGate.passed(),
  })
  const getSnapshot = store.current
  let signalled = baselineSnapshot(plan)

  const refresh = (cause: ChangeCause): void => {
    if (destroyed) return
    const change = store.commit(cause)
    if (!change) return
    const { next, prev } = change

    for (const integration of config.integrations) {
      isolate(() => integration.apply(next, signalled))
    }
    signalled = next
    document.dispatchEvent(
      new CustomEvent(config.consentChangeEvent, { detail: next }),
    )
    if (change.reload) reloadPage()
    for (const fn of subscribers) isolate(() => fn(next, prev))
  }

  const start = (): Promise<void> => {
    session = startLibrary(config, plan, refresh)
    detach = store.attach(session.read)
    return session.ready
  }

  const has = (category = defaultGateCategoryId(config)): boolean =>
    getSnapshot().categories[category] === true

  const prompt = (): void => {
    session?.show()
  }

  const require = (category?: string): boolean => {
    if (has(category)) return true
    prompt()
    return false
  }

  const removeDom = installDom({ has, require, prompt, confirmAge, getSnapshot })
  if (config.ageGate) {
    warnDefaultNamePass(config.ageGate)
    warnUngatedTags()
  }
  const context = { baseline: signalled, mode: config.mode }
  for (const integration of config.integrations) isolate(() => integration.init?.(context))

  const ready = new Promise<void>((resolve) => {
    const run = (): void => resolve(start())
    if (ageGate) cancelAgeWait = ageGate.onPass(run)
    else run()
  })

  const handle: ConsentHandle = {
    ready,
    getSnapshot,
    subscribe(fn) {
      if (destroyed) return () => {}
      subscribers.add(fn)
      return () => {
        subscribers.delete(fn)
      }
    },
    has,
    require,
    prompt,
    destroy() {
      if (destroyed) return
      destroyed = true
      cancelAgeWait()
      subscribers.clear()
      removeDom()
      detach()
      session?.reset()
      session = null
      unpublish()
    },
  }

  const unpublish = publishController({ handle, ageGate })
  return handle
}
