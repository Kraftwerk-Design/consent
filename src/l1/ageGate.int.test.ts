import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  AGE,
  config,
  gcm,
  handle,
  init,
  installFbq,
  load,
  recordEvents,
  reset,
  runs,
  script,
  seed,
} from './harness'

beforeEach(() => reset())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))
const quiet = () => vi.spyOn(console, 'warn').mockImplementation(() => {})

/** The `document.cookie` writes for `name`. */
function cookieWrites(setter: { mock: { calls: unknown[][] } }, name: string): string[] {
  return setter.mock.calls.map((args) => String(args[0])).filter((value) => value.startsWith(`${name}=`))
}

describe('age gate', () => {
  it('S-F4 confirmAge() twice runs the banner once', async () => {
    const { pkg } = await load()
    const events = recordEvents()
    const ready = init(pkg, config('opt-in', AGE))

    pkg.confirmAge()
    pkg.confirmAge()
    await ready
    await tick()

    expect(document.querySelectorAll('#cc-main')).toHaveLength(1)
    expect(events).toHaveLength(1)
  })

  it('S-F4 confirmAge() before init writes AGE_GATE_COOKIE and init runs without waiting', async () => {
    const { pkg } = await load()

    pkg.confirmAge()
    expect(document.cookie).toContain('kd_age_verified=1')

    await init(pkg, config('opt-in', { ageGate: {} }))
    expect(document.querySelector('#cc-main .cm')).not.toBeNull()
  })

  it('S-F4 confirmAge({ cookieName }) before init writes that cookie and init runs without waiting', async () => {
    const { pkg } = await load()

    pkg.confirmAge({ cookieName: 'l1_age_verified' })
    expect(document.cookie).toContain('l1_age_verified=1')

    await init(pkg, config('opt-in', AGE))
    expect(document.querySelector('#cc-main .cm')).not.toBeNull()
  })

  it('S-F7 deny-first GCM default and Meta revoke are sent before confirmAge()', async () => {
    const { pkg } = await load()
    const fbq = installFbq()
    quiet()

    void init(pkg, config('opt-in', AGE))
    await tick()

    expect(gcm()).toEqual([['consent', 'default', expect.objectContaining({ analytics_storage: 'denied' })]])
    expect(fbq.mock.calls).toEqual([['consent', 'revoke']])
  })

  it.each(['opt-in', 'opt-out'] as const)(
    'S-F1 %s unverified: no run, no banner, no script, only deny-first commands',
    async (mode) => {
      const { pkg } = await load(script('necessary') + script('analytics'))
      const fbq = installFbq()
      const events = recordEvents()
      quiet()

      void init(pkg, config(mode, AGE))
      await tick()

      expect((window as { _ccRun?: boolean })._ccRun).toBeUndefined()
      expect(document.querySelector('#cc-main')).toBeNull()
      expect(runs('necessary')).toBe(0)
      expect(runs('analytics')).toBe(0)
      expect(gcm()).toEqual([['consent', 'default', expect.objectContaining({ analytics_storage: 'denied' })]])
      expect(fbq.mock.calls).toEqual([['consent', 'revoke']])
      expect(handle().has('necessary')).toBe(false)
      expect(handle().has('analytics')).toBe(false)
      expect(handle().require('analytics')).toBe(false)
      handle().prompt()
      expect(document.querySelector('#cc-main')).toBeNull()
      expect(events).toEqual([])
    },
  )
})

describe('S-F1 returning visitor', () => {
  it.each(['opt-in', 'opt-out'] as const)(
    '%s: accepted all, no age cookie → every category denied before confirmAge()',
    async (mode) => {
      await seed(config(mode), 'all')
      const { pkg } = await load(script('necessary') + script('analytics'))
      const events = recordEvents()

      void init(pkg, config(mode, AGE))
      await tick()

      expect(handle().getSnapshot()).toMatchObject({
        stage: 'awaiting-age',
        categories: { necessary: false, analytics: false },
      })
      expect(handle().has('analytics')).toBe(false)
      expect(document.querySelector('#cc-main')).toBeNull()
      expect(runs('necessary')).toBe(0)
      expect(runs('analytics')).toBe(0)
      expect(gcm('update')).toEqual([])
      expect(events).toEqual([])
    },
  )
})

describe('S-F9 ungated vendor tags', () => {
  it('warns about an unblocked Google or Meta tag', async () => {
    const warn = quiet()
    const { pkg } = await load(
      '<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>' +
        '<script type="text/plain" data-category="analytics" src="https://connect.facebook.net/en_US/fbevents.js"></script>',
    )

    void init(pkg, config('opt-in', AGE))

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('googletagmanager.com')
  })

  it('warns when window.fbq already exists', async () => {
    const warn = quiet()
    const { pkg } = await load()
    installFbq()

    void init(pkg, config('opt-in', AGE))

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('window.fbq')
  })

  it('stays quiet without an age gate', async () => {
    const warn = quiet()
    const { pkg } = await load('<script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>')
    installFbq()

    await init(pkg, config('opt-in'))

    expect(warn).not.toHaveBeenCalled()
  })
})

describe('age cookie', () => {
  it('confirmAge() writes the configured cookie with a 30-day default lifetime', async () => {
    const { pkg } = await load()
    const ready = init(pkg, config('opt-in', AGE))
    const setter = vi.spyOn(document, 'cookie', 'set')

    pkg.confirmAge()
    await ready

    expect(cookieWrites(setter, 'l1_age_verified')).toEqual([
      'l1_age_verified=1; Path=/; Max-Age=2592000; SameSite=Lax',
    ])
    expect(pkg.isAgeVerified()).toBe(true)
  })

  it('confirmAge() uses the configured maxAgeDays after init and opts before it', async () => {
    const { pkg } = await load()
    const setter = vi.spyOn(document, 'cookie', 'set')

    pkg.confirmAge({ cookieName: 'early_age', maxAgeDays: 1 })
    const ready = init(pkg, config('opt-in', { ageGate: { cookieName: 'l1_age_verified', maxAgeDays: 7 } }))
    pkg.confirmAge({ cookieName: 'ignored', maxAgeDays: 1 })
    await ready

    expect(cookieWrites(setter, 'early_age')[0]).toContain('Max-Age=86400;')
    expect(cookieWrites(setter, 'l1_age_verified')[0]).toContain('Max-Age=604800;')
    expect(cookieWrites(setter, 'ignored')).toEqual([])
  })

  it('isAgeVerified(opts) before init; the configured gate after it', async () => {
    const { pkg } = await load()
    document.cookie = 'other_age=1; Path=/'

    expect(pkg.isAgeVerified({ cookieName: 'other_age' })).toBe(true)
    void init(pkg, config('opt-in', AGE))
    expect(pkg.isAgeVerified({ cookieName: 'other_age' })).toBe(false)
  })

  it('warns at init when a pre-init confirmAge() used the default name', async () => {
    const { pkg } = await load()
    const warn = quiet()

    pkg.confirmAge()
    void init(pkg, config('opt-in', AGE))

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain("ageGate.cookieName is 'l1_age_verified'")
    expect(pkg.isAgeVerified()).toBe(false)
  })

  it('isAgeVerified() is true after init without an age gate', async () => {
    const { pkg } = await load()

    expect(pkg.isAgeVerified()).toBe(false)
    await init(pkg, config('opt-in'))
    expect(pkg.isAgeVerified()).toBe(true)
  })

  it('confirmAge() after init without an age gate still writes the cookie', async () => {
    const { pkg } = await load()
    await init(pkg, config('opt-in'))
    const setter = vi.spyOn(document, 'cookie', 'set')

    pkg.confirmAge()
    pkg.confirmAge({ cookieName: 'l1_age_verified' })

    expect(cookieWrites(setter, 'kd_age_verified')).toEqual([
      'kd_age_verified=1; Path=/; Max-Age=2592000; SameSite=Lax',
    ])
    expect(cookieWrites(setter, 'l1_age_verified')).toHaveLength(1)
  })
})
