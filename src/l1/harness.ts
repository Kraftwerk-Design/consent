import { afterAll, vi, type Mock } from 'vitest'
import type { ConsentConfig } from '../config.default'
import type { ConsentHandle } from '../core/controller'
import { googleConsentMode } from '../integrations/google'
import { metaPixel } from '../integrations/meta'

type Lib = typeof import('vanilla-cookieconsent')
type Pkg = typeof import('../index')

type W = Window & {
  _ccRun?: boolean
  dataLayer?: ArrayLike<unknown>[]
  gtag?: unknown
  fbq?: Mock
  KDConsent?: unknown
}
const w = window as W

export interface Loaded {
  pkg: Pkg
  lib: Lib
  reloadPage: Mock
}

let lib: Lib | null = null
let current: ConsentHandle | null = null

// Listeners the package adds to document/window survive a module reset, so
// they are removed on every reset.
const tracked: [EventTarget, Parameters<EventTarget['addEventListener']>][] = []
for (const target of [document, window] as EventTarget[]) {
  const add = target.addEventListener
  target.addEventListener = function (...args: Parameters<typeof add>) {
    tracked.push([target, args])
    return add.apply(this, args)
  }
}

// Unmount gated elements while jsdom is still up.
afterAll(() => reset())

/** Return the jsdom page to a fresh visit. `keepCookies` keeps a seeded choice. */
export function reset({ keepCookies = false } = {}): void {
  current?.destroy()
  current = null
  lib?.reset(!keepCookies)
  lib = null
  vi.resetModules()
  delete w._ccRun

  for (const [target, args] of tracked.splice(0)) target.removeEventListener(...args)
  if (!keepCookies) {
    for (const cookie of document.cookie.split(/;\s*/)) {
      const name = cookie.split('=')[0]
      if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
    }
  }
  document.body.innerHTML = ''
  for (const key of Object.keys(document.documentElement.dataset)) {
    delete document.documentElement.dataset[key]
  }

  delete w.dataLayer
  delete w.gtag
  delete w.fbq
  delete w.KDConsent
  sessionStorage.clear()
  setGpc(false)
}

/** Import fresh package and library instances after `body` is in the document. */
export async function load(body = ''): Promise<Loaded> {
  document.body.innerHTML = body
  const reloadPage = vi.fn()
  vi.doMock('../core/reload', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    reloadPage,
  }))
  lib = await import('vanilla-cookieconsent')
  const pkg = await import('../index')
  return { pkg, lib, reloadPage }
}

/** Starts the package. Resolves once consent is ready. */
export function init(pkg: Pkg, options: Partial<ConsentConfig>): Promise<void> {
  current = pkg.initConsent(options)
  return current.ready
}

/** The handle from the last {@link init}. */
export function handle(): ConsentHandle {
  if (!current) throw new Error('init() has not run')
  return current
}

/** Record a returning visitor's choice through the real library, then reset with the cookie kept. */
export async function seed(
  options: Partial<ConsentConfig>,
  accept: string | string[],
): Promise<void> {
  const { pkg, lib } = await load()
  await init(pkg, options)
  lib.acceptCategory(accept)
  reset({ keepCookies: true })
}

export function setGpc(on: boolean): void {
  if (on) {
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
      configurable: true,
      get: () => true,
    })
  } else {
    delete (Navigator.prototype as { globalPrivacyControl?: boolean }).globalPrivacyControl
  }
}

const runKey = (category: string): string =>
  'run' + category[0].toUpperCase() + category.slice(1)

/** A blocked script that counts its executions in `dataset.run<Category>`. */
export function script(category: string): string {
  const key = runKey(category)
  return `<script type="text/plain" data-category="${category}">
    document.documentElement.dataset.${key} = String(Number(document.documentElement.dataset.${key} ?? 0) + 1)
  </script>`
}

export function runs(category: string): number {
  return Number(document.documentElement.dataset[runKey(category)] ?? 0)
}

/** Collects `consent:change` details from now on. */
export function recordEvents(): unknown[] {
  const details: unknown[] = []
  document.addEventListener('consent:change', (event) => details.push((event as CustomEvent).detail))
  return details
}

/** Consent Mode commands in `dataLayer`, as arrays. */
export function gcm(command?: 'default' | 'update'): unknown[][] {
  return Array.from(w.dataLayer ?? [], (entry) => Array.from(entry)).filter(
    (args) => args[0] === 'consent' && (!command || args[1] === command),
  )
}

/** `analytics_storage` of each Consent Mode update. */
export function gcmUpdates(): unknown[] {
  return gcm('update').map((args) => (args[2] as Record<string, unknown>).analytics_storage)
}

/** Installs a recording `window.fbq`. */
export function installFbq(): Mock {
  w.fbq = vi.fn()
  return w.fbq
}

/** The second argument of each `fbq('consent', …)` call. */
export function fbqConsent(): unknown[] {
  return (w.fbq?.mock.calls ?? []).filter((args) => args[0] === 'consent').map((args) => args[1])
}

export function click(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) throw new Error(`no element matches ${selector}`)
  el.click()
}

/** The preferences toggle for `id`; null when the section has none. */
export const toggle = (id: string) =>
  document.querySelector<HTMLInputElement>(`#cc-main .pm input.section__toggle[value="${id}"]`)

export const AGE = { ageGate: { cookieName: 'l1_age_verified' } }

export const BANNER_ACCEPT_ALL = '#cc-main .cm [data-role="all"]'
export const BANNER_PREFS = '#cc-main .cm [data-role="show"]'
export const PREFS_REJECT = '#cc-main .pm [data-role="necessary"]'
export const PREFS_SAVE = '#cc-main .pm [data-role="save"]'
export const PREFS_ACCEPT_ALL = '#cc-main .pm [data-role="all"]'

/** Default categories with Consent Mode and Meta integrations; opt-out enables analytics. */
export function config(
  mode: 'opt-in' | 'opt-out',
  overrides: Partial<ConsentConfig> = {},
): Partial<ConsentConfig> {
  return {
    mode,
    integrations: [
      googleConsentMode({
        security_storage: 'necessary',
        functionality_storage: 'necessary',
        analytics_storage: 'analytics',
        ad_storage: 'analytics',
        ad_user_data: 'analytics',
        ad_personalization: 'analytics',
      }),
      metaPixel({ category: 'analytics' }),
    ],
    categories: [
      { id: 'necessary', enabled: true, readOnly: true },
      {
        id: 'analytics',
        enabled: mode === 'opt-out',
        autoClear: [{ name: /^_ga/ }],
      },
    ],
    ...overrides,
  }
}
