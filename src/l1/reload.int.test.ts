import { describe, it, expect, beforeEach } from 'vitest'
import type { ConsentConfig } from '../config.default'
import { RELOAD_POLICIES, type ReloadPolicy } from '../core/reload'
import {
  AGE,
  BANNER_ACCEPT_ALL,
  PREFS_ACCEPT_ALL,
  PREFS_SAVE,
  click,
  config,
  fbqConsent,
  gcmUpdates,
  handle,
  init,
  installFbq,
  load,
  reset,
  runs,
  script,
  seed,
  setGpc,
  toggle,
} from './harness'
import * as s from './scenarios'

beforeEach(() => reset())

type Scenario = (extra?: Partial<ConsentConfig>) => Promise<s.Started>
type Counts = Omit<ReturnType<typeof s.tally>, 'reloads'>

const NONE: Counts = { events: 1, gcm: [], fbq: [], runs: 0 }

// S-M1: the README count table under each policy.
const rows: [string, Scenario, Counts, Record<ReloadPolicy, number>][] = [
  ['fresh opt-in, load', s.freshOptInLoad, NONE, { never: 0, 'on-withdraw': 0, 'on-change': 0 }],
  [
    'fresh opt-in, Accept all',
    s.freshOptInAcceptAll,
    { events: 2, gcm: ['granted'], fbq: ['grant'], runs: 1 },
    { never: 0, 'on-withdraw': 0, 'on-change': 1 },
  ],
  [
    'fresh opt-in, reject',
    s.freshOptInReject,
    { ...NONE, events: 2 },
    { never: 0, 'on-withdraw': 0, 'on-change': 0 },
  ],
  [
    'returning-accepted, opt-in load',
    s.returningAcceptedOptInLoad,
    { events: 1, gcm: ['granted'], fbq: ['grant'], runs: 1 },
    { never: 0, 'on-withdraw': 0, 'on-change': 0 },
  ],
  [
    'returning-rejected, opt-in load',
    s.returningRejectedOptInLoad,
    NONE,
    { never: 0, 'on-withdraw': 0, 'on-change': 0 },
  ],
  [
    'returning-accepted, withdraw + save',
    s.returningAcceptedWithdraw,
    { events: 2, gcm: ['granted', 'denied'], fbq: ['grant', 'revoke'], runs: 1 },
    { never: 0, 'on-withdraw': 1, 'on-change': 1 },
  ],
  [
    'fresh opt-out, load',
    s.freshOptOutLoad,
    { events: 1, gcm: ['granted'], fbq: ['grant'], runs: 1 },
    { never: 0, 'on-withdraw': 0, 'on-change': 0 },
  ],
  [
    'fresh opt-out, Accept all (= defaults)',
    s.freshOptOutAcceptAll,
    { events: 2, gcm: ['granted'], fbq: ['grant'], runs: 1 },
    { never: 0, 'on-withdraw': 0, 'on-change': 0 },
  ],
  [
    'fresh opt-out, reject',
    s.freshOptOutReject,
    { events: 2, gcm: ['granted', 'denied'], fbq: ['grant', 'revoke'], runs: 1 },
    { never: 0, 'on-withdraw': 1, 'on-change': 1 },
  ],
  [
    'fresh GPC lock (opt-in), load',
    s.freshGpcLockLoad,
    NONE,
    { never: 0, 'on-withdraw': 0, 'on-change': 0 },
  ],
  [
    'age gate, before confirmAge()',
    s.ageGateBeforeConfirm,
    { ...NONE, events: 0 },
    { never: 0, 'on-withdraw': 0, 'on-change': 0 },
  ],
  [
    'age gate, confirmAge() (fresh opt-in)',
    s.ageGateConfirm,
    NONE,
    { never: 0, 'on-withdraw': 0, 'on-change': 0 },
  ],
]

describe.each(RELOAD_POLICIES)("count table: reload: '%s'", (policy) => {
  it.each(rows)('%s', async (_, scenario, counts, reloads) => {
    expect(s.tally(await scenario({ reload: policy }))).toEqual({
      ...counts,
      reloads: reloads[policy],
    })
  })
})

describe('count table: default policy', () => {
  it.each(rows)('%s', async (_, scenario, counts, reloads) => {
    expect(s.tally(await scenario())).toEqual({ ...counts, reloads: reloads['on-withdraw'] })
  })
})

describe('reload policy', () => {
  it("S-M2 'never': Accept all releases the scripts live, once", async () => {
    const started = await s.freshOptInAcceptAll({ reload: 'never' })

    expect(s.tally(started)).toMatchObject({ reloads: 0, runs: 1 })
    expect(handle().has('analytics')).toBe(true)
  })

  it("S-B6 returning-rejected, 'never', accept: scripts released live once, no reload", async () => {
    const started = await s.returningRejectedOptInLoad({ reload: 'never' })
    expect(runs('analytics')).toBe(0)

    started.lib.showPreferences()
    click(PREFS_ACCEPT_ALL)

    expect(s.tally(started)).toMatchObject({ reloads: 0, runs: 1 })
    expect(handle().has('analytics')).toBe(true)
  })

  it.each<[ReloadPolicy]>([['never'], ['on-withdraw'], ['on-change']])(
    "S-M4 '%s': confirmAge() for a returning-accepted visitor never reloads; a later choice follows the policy",
    async (policy) => {
      await seed(config('opt-in'), 'all')
      const { pkg, reloadPage } = await load(script('analytics'))
      const ready = init(pkg, config('opt-in', { ...AGE, reload: policy }))

      pkg.confirmAge()
      await ready

      expect(runs('analytics')).toBe(1)
      expect(reloadPage).not.toHaveBeenCalled()

      handle().prompt()
      toggle('analytics')!.click()
      click(PREFS_SAVE)

      expect(handle().has('analytics')).toBe(false)
      expect(reloadPage).toHaveBeenCalledTimes(policy === 'never' ? 0 : 1)
    },
  )

  it('GPC lock: choices about unclamped categories follow the policy', async () => {
    setGpc(true)
    const categories = [
      { id: 'necessary', enabled: true, readOnly: true },
      { id: 'functionality' },
      { id: 'analytics' },
    ]
    const { pkg, lib, reloadPage } = await load()
    await init(pkg, config('opt-in', { categories }))

    click(BANNER_ACCEPT_ALL)
    expect(handle().has('functionality')).toBe(true)
    expect(reloadPage).not.toHaveBeenCalled()

    lib.showPreferences()
    toggle('functionality')!.click()
    click(PREFS_SAVE)

    expect(handle().has('functionality')).toBe(false)
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it("GPC lock, 'on-change': accepting an unclamped category reloads", async () => {
    setGpc(true)
    const categories = [
      { id: 'necessary', enabled: true, readOnly: true },
      { id: 'functionality' },
      { id: 'analytics' },
    ]
    const { pkg, reloadPage } = await load()
    await init(pkg, config('opt-in', { categories, reload: 'on-change' }))

    click(BANNER_ACCEPT_ALL)

    expect(handle().has('functionality')).toBe(true)
    expect(handle().has('analytics')).toBe(false)
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })
})

describe("S-P1 SPA, reload: 'never'", () => {
  it('accept releases scripts and mounts embeds; withdraw clears cookies, unmounts and denies, all without reloading', async () => {
    const { pkg, lib, reloadPage } = await load(
      script('analytics') +
        `<consent-embed autoactivate category="analytics"><button data-poster>Show</button><template><p id="embedded">embed</p></template></consent-embed>`,
    )
    installFbq()
    await init(pkg, config('opt-in', { reload: 'never' }))
    const el = document.querySelector('consent-embed')!

    click(BANNER_ACCEPT_ALL)

    expect(runs('analytics')).toBe(1)
    expect(document.querySelector('#embedded')).not.toBeNull()
    expect(el.getAttribute('state')).toBe('active')
    expect(gcmUpdates()).toEqual(['granted'])
    expect(fbqConsent().slice(1)).toEqual(['grant'])

    document.cookie = '_ga=GA1.1; Path=/'
    lib.showPreferences()
    toggle('analytics')!.click()
    click(PREFS_SAVE)

    expect(document.cookie).not.toContain('_ga=')
    expect(document.querySelector('#embedded')).toBeNull()
    expect(el.getAttribute('state')).toBe('blocked')
    expect(el.querySelector<HTMLElement>('[data-poster]')!.hidden).toBe(false)
    expect(gcmUpdates()).toEqual(['granted', 'denied'])
    expect(fbqConsent().slice(1)).toEqual(['grant', 'revoke'])
    expect(runs('analytics')).toBe(1)
    expect(reloadPage).not.toHaveBeenCalled()
  })
})
