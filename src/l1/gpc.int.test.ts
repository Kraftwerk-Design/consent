import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ConsentConfig } from '../config.default'
import {
  AGE,
  BANNER_ACCEPT_ALL,
  BANNER_PREFS,
  PREFS_ACCEPT_ALL,
  PREFS_SAVE,
  click,
  config,
  handle,
  init,
  load,
  recordEvents,
  reset,
  runs,
  script,
  seed,
  setGpc,
  toggle,
} from './harness'

beforeEach(() => reset())

const customCopy: ConsentConfig['buildCopy'] = () => ({
  default: 'en',
  translations: {
    en: {
      consentModal: {
        title: 'Cookies',
        description: 'Custom copy',
        acceptAllBtn: 'Accept all',
        acceptNecessaryBtn: 'Reject',
        showPreferencesBtn: 'Manage',
      },
      preferencesModal: {
        title: 'Preferences',
        acceptAllBtn: 'Accept all',
        acceptNecessaryBtn: 'Reject',
        savePreferencesBtn: 'Save',
        sections: [
          { title: 'Necessary', linkedCategory: 'necessary' },
          { title: 'Analytics', linkedCategory: 'analytics' },
        ],
      },
    },
  },
})

const BANNER_KEEP_OFF = '#cc-main .cm [data-role="necessary"]'
const OVERRIDE = { allowGpcOverride: true }

const withFunctionality = (mode: 'opt-in' | 'opt-out', extra: Partial<ConsentConfig> = {}) =>
  config(mode, {
    categories: [
      { id: 'necessary', enabled: true, readOnly: true },
      { id: 'functionality', enabled: mode === 'opt-out' },
      { id: 'analytics', enabled: mode === 'opt-out' },
    ],
    ...extra,
  })

async function lockedOptIn(body = script('analytics'), extra: Partial<ConsentConfig> = {}) {
  setGpc(true)
  const loaded = await load(body)
  await init(loaded.pkg, config('opt-in', extra))
  return loaded
}

describe('GPC lock', () => {
  it('S-D3 returning-accepted visitor with a new GPC signal: clamped scripts never run, autoClear cookies erased', async () => {
    await seed(config('opt-in'), 'all')
    document.cookie = '_ga=GA1.1; Path=/'

    await lockedOptIn()

    expect(runs('analytics')).toBe(0)
    expect(handle().has('analytics')).toBe(false)
    expect(document.cookie).not.toContain('_ga=')
  })

  it('S-D4 fresh opt-out: unclamped enabled categories stay accepted and run', async () => {
    setGpc(true)
    const { pkg } = await load(script('functionality') + script('analytics'))
    await init(
      pkg,
      config('opt-out', {
        categories: [
          { id: 'necessary', enabled: true, readOnly: true },
          { id: 'functionality', enabled: true },
          { id: 'analytics', enabled: true },
        ],
      }),
    )

    expect(runs('functionality')).toBe(1)
    expect(runs('analytics')).toBe(0)
    expect(handle().has('functionality')).toBe(true)
    expect(handle().has('analytics')).toBe(false)
  })

  it('S-D5a custom buildCopy banner Accept all keeps the clamped category rejected', async () => {
    const { lib } = await lockedOptIn(script('analytics'), { buildCopy: customCopy })

    click(BANNER_ACCEPT_ALL)

    expect(runs('analytics')).toBe(0)
    expect(lib.getCookie('categories')).not.toContain('analytics')
    expect(handle().has('analytics')).toBe(false)
  })

  it('S-D5b <button data-cc="accept-all"> keeps the clamped category rejected', async () => {
    const { lib } = await lockedOptIn(
      script('analytics') + '<button id="all" data-cc="accept-all">Accept all</button>',
    )

    click('#all')

    expect(runs('analytics')).toBe(0)
    expect(lib.getCookie('categories')).not.toContain('analytics')
    expect(handle().has('analytics')).toBe(false)
  })

  it('S-D5c custom buildCopy preferences Accept all keeps the clamped category rejected', async () => {
    const { lib } = await lockedOptIn(script('analytics'), { buildCopy: customCopy })

    lib.showPreferences()
    click(PREFS_ACCEPT_ALL)

    expect(runs('analytics')).toBe(0)
    expect(lib.getCookie('categories')).not.toContain('analytics')
    expect(handle().has('analytics')).toBe(false)
  })

  it("S-D7 page code calling acceptCategory('analytics') releases nothing", async () => {
    const { lib } = await lockedOptIn()

    lib.acceptCategory('analytics')

    expect(runs('analytics')).toBe(0)
    expect(handle().has('analytics')).toBe(false)
  })

  it('S-D1 fresh visitor: normal banner with a GPC notice, nothing recorded, clamped section has no toggle', async () => {
    setGpc(true)
    const { pkg, lib } = await load(script('analytics'))
    const events = recordEvents()
    await init(pkg, config('opt-in'))

    expect(document.querySelector('#cc-main .cm')?.textContent).toContain('Global Privacy Control')
    expect(document.querySelector(BANNER_ACCEPT_ALL)).not.toBeNull()
    expect(lib.validConsent()).toBe(false)
    expect(document.cookie).not.toContain('kd_cookie_consent')
    expect(events).toHaveLength(1)
    expect(handle().has('analytics')).toBe(false)

    lib.showPreferences()
    expect(document.querySelector('#cc-main .pm')?.textContent).toContain('analytics')
    expect(toggle('analytics')).toBeNull()

    click(BANNER_ACCEPT_ALL)
    expect(runs('analytics')).toBe(0)
    expect(handle().has('analytics')).toBe(false)
  })

  it('S-D6 saving preferences keeps the clamp', async () => {
    setGpc(true)
    const { pkg, lib } = await load(script('functionality') + script('analytics'))
    await init(pkg, withFunctionality('opt-in'))

    click(BANNER_PREFS)
    toggle('functionality')!.click()
    click(PREFS_SAVE)

    expect(runs('functionality')).toBe(1)
    expect(runs('analytics')).toBe(0)
    expect(lib.getCookie('categories')).toEqual(['necessary', 'functionality'])
    expect(handle().has('analytics')).toBe(false)
  })

  it('S-F5 age gate: the clamp applies once confirmAge() runs the banner', async () => {
    await seed(config('opt-in'), 'all')
    setGpc(true)
    const { pkg, lib } = await load(script('analytics'))
    const ready = init(pkg, config('opt-in', AGE))

    pkg.confirmAge()
    await ready

    expect(runs('analytics')).toBe(0)
    expect(handle().has('analytics')).toBe(false)
    lib.showPreferences()
    expect(toggle('analytics')).toBeNull()
  })

  it('a readOnly category flagged gpc is never clamped', async () => {
    setGpc(true)
    const { pkg } = await load(script('necessary'))
    await init(
      pkg,
      config('opt-in', {
        categories: [
          { id: 'necessary', enabled: true, readOnly: true, gpc: true },
          { id: 'analytics', gpc: true },
        ],
      }),
    )
    click(BANNER_ACCEPT_ALL)

    expect(runs('necessary')).toBe(1)
    expect(handle().has('necessary')).toBe(true)
  })

  it('S-N2 custom buildCopy gets the GPC state and cannot add a toggle for the clamped category', async () => {
    const buildCopy = vi.fn(customCopy)
    const { lib } = await lockedOptIn(script('analytics'), { buildCopy })

    expect(buildCopy).toHaveBeenCalledWith({ gpc: 'locked', mode: 'opt-in' })
    lib.showPreferences()
    expect(toggle('necessary')).not.toBeNull()
    expect(toggle('analytics')).toBeNull()
  })
})

describe('GPC override', () => {
  async function overrideLoad(mode: 'opt-in' | 'opt-out' = 'opt-in', body = script('analytics')) {
    setGpc(true)
    const loaded = await load(body)
    const events = recordEvents()
    await init(loaded.pkg, config(mode, OVERRIDE))
    return { ...loaded, events }
  }

  it('S-E1 fresh visitor: clamped off by default, banner offers Accept all / Keep off, nothing recorded', async () => {
    const { lib, events } = await overrideLoad()

    expect(document.querySelector(BANNER_ACCEPT_ALL)?.textContent).toBe('Accept all')
    expect(document.querySelector(BANNER_KEEP_OFF)?.textContent).toBe('Keep off')
    expect(runs('analytics')).toBe(0)
    expect(handle().has('analytics')).toBe(false)
    expect(lib.validConsent()).toBe(false)
    expect(events).toEqual([expect.objectContaining({ gpc: 'default-off', recorded: false })])
  })

  it('S-E2 opting in releases the clamped scripts', async () => {
    const { lib } = await overrideLoad()

    click(BANNER_ACCEPT_ALL)

    expect(runs('analytics')).toBe(1)
    expect(handle().has('analytics')).toBe(true)
    expect(lib.getCookie('categories')).toContain('analytics')
  })

  it('S-E3 returning-accepted visitor keeps the choice', async () => {
    await seed(config('opt-in', OVERRIDE), 'all')
    await overrideLoad()

    expect(runs('analytics')).toBe(1)
    expect(handle().has('analytics')).toBe(true)
    expect(document.querySelector('#cc-main .cm')).toBeNull()
  })

  it('S-E4 fresh opt-out: the clamped category is off', async () => {
    await overrideLoad('opt-out')

    expect(runs('analytics')).toBe(0)
    expect(handle().has('analytics')).toBe(false)
  })

  it('S-E5 opt-out Keep off keeps functionality and rejects the clamped category', async () => {
    setGpc(true)
    const { pkg, lib } = await load(script('functionality') + script('analytics'))
    await init(pkg, withFunctionality('opt-out', OVERRIDE))

    click(BANNER_KEEP_OFF)

    expect(lib.validConsent()).toBe(true)
    expect(lib.getCookie('categories')).toEqual(['necessary', 'functionality'])
    expect(runs('functionality')).toBe(1)
    expect(runs('analytics')).toBe(0)
    expect(handle().has('functionality')).toBe(true)
    expect(handle().has('analytics')).toBe(false)
    expect(document.documentElement.classList).not.toContain('show--consent')
  })

  it('a readOnly category flagged gpc stays readOnly and runs', async () => {
    setGpc(true)
    const { pkg, lib } = await load(script('necessary'))
    await init(
      pkg,
      config('opt-in', {
        ...OVERRIDE,
        categories: [
          { id: 'necessary', enabled: true, readOnly: true, gpc: true },
          { id: 'analytics', gpc: true },
        ],
      }),
    )
    click(BANNER_KEEP_OFF)

    expect(runs('necessary')).toBe(1)
    expect(handle().has('necessary')).toBe(true)
    expect(lib.getCookie('categories')).toEqual(['necessary'])
  })

  it('S-E5 returning visitor reopening the banner: Keep off keeps the saved rejection', async () => {
    await seed(withFunctionality('opt-out', OVERRIDE), [])
    setGpc(true)
    const { pkg, lib } = await load(script('functionality') + script('analytics'))
    await init(pkg, withFunctionality('opt-out', OVERRIDE))

    lib.show(true)
    click(BANNER_KEEP_OFF)

    expect(lib.getCookie('categories')).toEqual(['necessary'])
    expect(runs('functionality')).toBe(0)
    expect(runs('analytics')).toBe(0)
    expect(handle().has('functionality')).toBe(false)
  })
})
