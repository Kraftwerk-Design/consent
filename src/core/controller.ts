import {
  resolveConfig,
  validateConsentConfig,
  type ResolvedConfig,
} from '../config'
import type { ConsentConfig } from '../config.default'
import { hasGpcSignal } from '../gpc'
import { AGE_GATE_COOKIE, hasAgeCookie, warnUngatedTags, writeAgeCookie } from '../ageGate'
import { installDom } from '../dom'
import { startLibrary, type ChangeCause, type LibrarySession } from './library'
import { reloadPage, shouldReload } from './reload'
import { defaultGateCategoryId, gpcState, planCategories } from './categories'
import {
  computeSnapshot,
  pendingSnapshot,
  snapshotsEqual,
  type ConsentSnapshot,
} from './snapshot'

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
  /** True when the category is effective; otherwise opens the consent UI. */
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

export interface Controller {
  readonly handle: ConsentHandle
  readonly config: ResolvedConfig
  ageOk(): boolean
  confirmAge(): void
}

// On globalThis so every copy of this module (separate bundles, module resets
// in tests) shares the page's one controller. Bump the version when
// `Controller` changes shape so mismatched copies stay independent.
const KEY = '@kraftwerkdesign/consent.controller@1'
export const ACTIVE_CONTROLLER = Symbol.for(KEY)
/** Dispatched on `document` when a controller becomes active and when it is destroyed. */
export const CONTROLLER_EVENT = KEY
const page = globalThis as { [ACTIVE_CONTROLLER]?: Controller | null }
const active = (): Controller | null => page[ACTIVE_CONTROLLER] ?? null

/** The live controller's handle; null before `initConsent()` and after `destroy()`. */
export function activeHandle(): ConsentHandle | null {
  return active()?.handle ?? null
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
  return createController(options ?? {}).handle
}

/**
 * Record that the visitor passed the age gate and release the consent stack.
 * Input-agnostic: the site decides eligibility (yes/no, date of birth, …) and
 * calls this only on a pass. Never stores the answer itself.
 *
 * Writes the age cookie, then notifies the controller if one exists. The
 * cookie uses the configured `ageGate`, else `opts.cookieName ?? AGE_GATE_COOKIE`;
 * before `initConsent()`, init then finds it and runs at once.
 */
export function confirmAge(opts: { cookieName?: string } = {}): void {
  const current = active()
  const gate = current?.config.ageGate
  writeAgeCookie(gate?.cookieName ?? opts.cookieName ?? AGE_GATE_COOKIE, gate?.maxAgeDays)
  current?.confirmAge()
}

/**
 * Whether the visitor has passed the age gate. After `initConsent()`, true
 * when no `ageGate` is configured. Before it, checks the
 * `opts.cookieName ?? AGE_GATE_COOKIE` cookie.
 */
export function isAgeVerified(opts: { cookieName?: string } = {}): boolean {
  const current = active()
  if (current) return current.ageOk()
  return hasAgeCookie(opts.cookieName ?? AGE_GATE_COOKIE)
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

function createController(options: Partial<ConsentConfig>): Controller {
  const config = resolveConfig(options)
  for (const warning of validateConsentConfig(config)) console.warn('[consent] ' + warning)
  const plan = planCategories(config, gpcState(hasGpcSignal(), config.allowGpcOverride))
  const subscribers = new Set<ConsentListener>()

  let ageOk = !config.ageGate || hasAgeCookie(config.ageGate.cookieName)
  let startAfterAge: (() => void) | null = null
  let session: LibrarySession | null = null
  let destroyed = false

  const initial = ageOk
    ? pendingSnapshot(plan)
    : computeSnapshot({ plan, ageOk, recorded: false, accepted: [] })
  let latest = initial
  let applied: ConsentSnapshot | null = null

  // Read live so scripts the library releases before its callbacks fire
  // already see the new state.
  const getSnapshot = (): ConsentSnapshot => {
    if (!session) return latest
    const live = computeSnapshot({ plan, ageOk, ...session.read() })
    if (!snapshotsEqual(latest, live)) latest = live
    return latest
  }

  const refresh = (cause: ChangeCause): void => {
    if (destroyed) return
    const next = getSnapshot()
    if (next.stage === 'awaiting-age') return
    const prev = applied
    if (prev && snapshotsEqual(prev, next)) return
    applied = next

    for (const integration of config.integrations) isolate(() => integration.apply(next, prev))
    document.dispatchEvent(
      new CustomEvent(config.consentChangeEvent, { detail: next }),
    )
    if (shouldReload(prev ?? initial, next, config.reload, cause)) reloadPage()
    for (const fn of subscribers) isolate(() => fn(next, prev ?? initial))
  }

  const start = (): Promise<void> => {
    session = startLibrary(config, plan, refresh)
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
  if (config.ageGate) warnUngatedTags()
  for (const integration of config.integrations) isolate(() => integration.init?.(config))

  const ready = ageOk
    ? start()
    : new Promise<void>((resolve) => {
        startAfterAge = () => resolve(start())
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
      startAfterAge = null
      subscribers.clear()
      removeDom()
      session?.reset()
      session = null
      page[ACTIVE_CONTROLLER] = null
      document.dispatchEvent(new Event(CONTROLLER_EVENT))
    },
  }

  const controller: Controller = {
    handle,
    config,
    ageOk: () => ageOk,
    confirmAge() {
      if (ageOk) return
      ageOk = true
      const go = startAfterAge
      startAfterAge = null
      go?.()
    },
  }
  page[ACTIVE_CONTROLLER] = controller
  document.dispatchEvent(new Event(CONTROLLER_EVENT))

  return controller
}
