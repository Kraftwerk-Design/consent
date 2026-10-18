import { expect } from 'vitest'
import type { ConsentConfig } from '../config.default'
import {
  AGE,
  BANNER_ACCEPT_ALL,
  BANNER_PREFS,
  PREFS_REJECT,
  PREFS_SAVE,
  click,
  config,
  fbqConsent,
  gcmUpdates,
  init,
  installFbq,
  load,
  recordEvents,
  runs,
  script,
  seed,
  setGpc,
  toggle,
  type Loaded,
} from './harness'

// The rows of the README count table, shared by counts.int.test.ts and
// reload.int.test.ts.

export interface Started extends Loaded {
  events: unknown[]
  ready: Promise<void>
}

async function start(options: Partial<ConsentConfig>, { awaitReady = true } = {}): Promise<Started> {
  const loaded = await load(script('analytics'))
  installFbq()
  const events = recordEvents()
  const ready = init(loaded.pkg, options)
  if (awaitReady) await ready
  return { ...loaded, events, ready }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))

/**
 * Counts per column. `fbq` drops the first `fbq('consent')` call, the
 * deny-first init command.
 */
export function tally({ events, reloadPage }: Started) {
  return {
    events: events.length,
    gcm: gcmUpdates(),
    fbq: fbqConsent().slice(1),
    reloads: reloadPage.mock.calls.length,
    runs: runs('analytics'),
  }
}

function reject(): void {
  click(BANNER_PREFS)
  click(PREFS_REJECT)
}

function withdraw(): void {
  const analytics = toggle('analytics')
  expect(analytics?.checked).toBe(true)
  analytics!.click()
  click(PREFS_SAVE)
}

export const freshOptInLoad = (extra: Partial<ConsentConfig> = {}) =>
  start(config('opt-in', extra))

export async function freshOptInAcceptAll(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  const started = await freshOptInLoad(extra)
  click(BANNER_ACCEPT_ALL)
  return started
}

export async function freshOptInReject(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  const started = await freshOptInLoad(extra)
  reject()
  return started
}

export async function returningAcceptedOptInLoad(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  await seed(config('opt-in'), 'all')
  return start(config('opt-in', extra))
}

export async function returningRejectedOptInLoad(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  await seed(config('opt-in'), [])
  return start(config('opt-in', extra))
}

export async function returningAcceptedWithdraw(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  const started = await returningAcceptedOptInLoad(extra)
  started.lib.showPreferences()
  withdraw()
  return started
}

export const freshOptOutLoad = (extra: Partial<ConsentConfig> = {}) =>
  start(config('opt-out', extra))

export async function freshOptOutAcceptAll(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  const started = await freshOptOutLoad(extra)
  click(BANNER_ACCEPT_ALL)
  return started
}

export async function freshOptOutReject(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  const started = await freshOptOutLoad(extra)
  reject()
  return started
}

export function freshGpcLockLoad(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  setGpc(true)
  return start(config('opt-in', extra))
}

export async function ageGateBeforeConfirm(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  const started = await start(config('opt-in', { ...AGE, ...extra }), { awaitReady: false })
  await tick()
  return started
}

export async function ageGateConfirm(extra: Partial<ConsentConfig> = {}): Promise<Started> {
  const started = await start(config('opt-in', { ...AGE, ...extra }), { awaitReady: false })
  started.pkg.confirmAge()
  await started.ready
  return started
}
