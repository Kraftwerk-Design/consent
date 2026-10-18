import { describe, it, expect, beforeEach } from 'vitest'
import {
  BANNER_ACCEPT_ALL,
  BANNER_PREFS,
  PREFS_REJECT,
  PREFS_SAVE,
  click,
  config,
  gcm,
  gcmUpdates,
  handle,
  init,
  installFbq,
  load,
  recordEvents,
  reset,
  runs,
  script,
  seed,
  setGpc,
} from './harness'

beforeEach(() => reset())

const AGE = { ageGate: { cookieName: 'l1_age_verified' } }
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))
const html = document.documentElement

async function start(options = config('opt-in'), body = script('analytics')) {
  const loaded = await load(body)
  const fbq = installFbq()
  const events = recordEvents()
  await init(loaded.pkg, options)
  return { ...loaded, fbq, events }
}

function analyticsToggle(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(
    '#cc-main .pm input.section__toggle[value="analytics"]',
  )!
}

// A blocked script that records what has('analytics') reports when it runs.
// jsdom runs inline scripts in its own global, so `probeHas` is handed over
// on the shared `document`.
const PROBE = `<script type="text/plain" data-category="analytics">
  document.documentElement.dataset.sawConsent = String(document.probeHas('analytics'))
</script>`

async function startProbe() {
  const loaded = await load(PROBE)
  const probe = document as Document & { probeHas?: (id: string) => boolean }
  probe.probeHas = (id) => handle().has(id)
  await init(loaded.pkg, config('opt-in'))
}

const THREE = [
  { id: 'necessary', enabled: true, readOnly: true },
  { id: 'functionality' },
  { id: 'analytics' },
]

describe('has() inside released scripts', () => {
  it('returning-accepted opt-in: a released script sees consent', async () => {
    await seed(config('opt-in'), 'all')
    await startProbe()

    expect(html.dataset.sawConsent).toBe('true')
  })

  it('fresh opt-in, Accept all: a released script sees consent', async () => {
    await startProbe()
    expect(html.dataset.sawConsent).toBeUndefined()

    click(BANNER_ACCEPT_ALL)

    expect(html.dataset.sawConsent).toBe('true')
  })
})

describe('getSnapshot', () => {
  it('S-I6 returns the same reference while unchanged, awaiting-age and ready', async () => {
    const { pkg, lib } = await load()
    const events = recordEvents()
    const ready = init(pkg, config('opt-in', AGE))

    const waiting = handle().getSnapshot()
    expect(waiting.stage).toBe('awaiting-age')
    expect(handle().getSnapshot()).toBe(waiting)

    pkg.confirmAge()
    await ready
    const first = handle().getSnapshot()
    expect(first.stage).toBe('ready')
    expect(handle().getSnapshot()).toBe(first)
    expect(events.at(-1)).toBe(first)

    lib.acceptCategory('all')
    expect(handle().getSnapshot()).not.toBe(first)
    expect(handle().getSnapshot()).toBe(events.at(-1))
  })

  it('a listener mutating the detail changes nothing', async () => {
    await seed(config('opt-in'), 'all')
    const { pkg } = await load(script('analytics'))
    const events = recordEvents()
    document.addEventListener('consent:change', (event) => {
      try {
        ;(event as CustomEvent).detail.categories.analytics = false
      } catch {
        // Frozen: strict-mode assignment throws.
      }
    })
    await init(pkg, config('opt-in'))

    expect(events).toHaveLength(1)
    expect(handle().has('analytics')).toBe(true)
  })
})

describe('opt-in, returning visitor', () => {
  it('S-B3 returning-accepted: analytics once, no banner, one event / GCM / Meta', async () => {
    await seed(config('opt-in'), 'all')
    const { fbq, events } = await start()

    expect(runs('analytics')).toBe(1)
    expect(html.classList.contains('show--consent')).toBe(false)
    expect(handle().has('analytics')).toBe(true)
    expect(events).toHaveLength(1)
    expect(gcmUpdates()).toEqual(['granted'])
    expect(fbq.mock.calls).toEqual([
      ['consent', 'revoke'],
      ['consent', 'grant'],
    ])
  })

  it('S-B4 returning-rejected: no script, no GCM update, no extra revoke', async () => {
    await seed(config('opt-in'), [])
    const { fbq } = await start()

    expect(runs('analytics')).toBe(0)
    expect(gcmUpdates()).toEqual([])
    expect(fbq.mock.calls).toEqual([['consent', 'revoke']])
  })

  it('S-B5 withdraw: autoClear cookies removed, one event / GCM / Meta', async () => {
    await seed(config('opt-in'), 'all')
    const { lib, fbq } = await start()
    document.cookie = '_ga=GA1.1.1; Path=/'
    const events = recordEvents()
    const updatesBefore = gcmUpdates().length
    fbq.mockClear()

    lib.showPreferences()
    analyticsToggle().click()
    click(PREFS_SAVE)

    expect(document.cookie).not.toContain('_ga=')
    expect(events).toHaveLength(1)
    expect(gcmUpdates().slice(updatesBefore)).toEqual(['denied'])
    expect(fbq.mock.calls).toEqual([['consent', 'revoke']])
  })

  it('S-I3 re-saving the same preferences dispatches nothing', async () => {
    await seed(config('opt-in'), 'all')
    const { lib, fbq } = await start()
    const events = recordEvents()
    const updatesBefore = gcm('update').length
    fbq.mockClear()

    lib.showPreferences()
    click(PREFS_SAVE)

    expect(events).toEqual([])
    expect(gcm('update')).toHaveLength(updatesBefore)
    expect(fbq).not.toHaveBeenCalled()
  })
})

describe('opt-out, returning visitor', () => {
  it('S-C4 returning-rejected: exact Meta sequence', async () => {
    await seed(config('opt-out'), [])
    const { fbq } = await start(config('opt-out'))

    expect(runs('analytics')).toBe(0)
    expect(fbq.mock.calls).toEqual([
      ['consent', 'revoke'],
      ['dataProcessingOptions', ['LDU'], 0, 0],
    ])
  })
})

describe('age gate', () => {
  it.each([
    ['opt-in', false],
    ['opt-out', true],
  ] as const)('S-F6 %s: confirmAge() with no choice → has(analytics) %s', async (mode, expected) => {
    const { pkg } = await load(script('analytics'))
    const ready = init(pkg, config(mode, AGE))
    await tick()

    expect(document.querySelector('#cc-main')).toBeNull()
    expect(handle().has('analytics')).toBe(false)

    pkg.confirmAge()
    await ready

    expect(document.cookie).not.toContain('kd_cookie_consent=')
    expect(handle().has('analytics')).toBe(expected)
  })
})

describe('Google Consent Mode', () => {
  it('S-G3 one update after the default per distinct change, none when unchanged', async () => {
    await seed(config('opt-in'), 'all')
    const { lib } = await start()

    expect(gcm().map((args) => args[1])).toEqual(['default', 'update'])

    lib.showPreferences()
    click(PREFS_SAVE)
    expect(gcm('update')).toHaveLength(1)

    analyticsToggle().click()
    click(PREFS_SAVE)
    expect(gcmUpdates()).toEqual(['granted', 'denied'])
  })

  it('S-G6 no integrations: pushes nothing', async () => {
    await seed(config('opt-in'), 'all')
    const { fbq } = await start(config('opt-in', { integrations: [] }))

    expect(gcm()).toEqual([])
    expect(fbq).not.toHaveBeenCalled()
  })
})

describe('Meta Pixel', () => {
  it('S-H3 fresh opt-in: the init revoke is the only call', async () => {
    const { fbq } = await start()

    expect(fbq.mock.calls).toEqual([['consent', 'revoke']])
  })

  it.each([
    ['opt-in', false],
    ['opt-out', false],
    ['opt-in', true],
    ['opt-out', true],
  ] as const)('S-H4 %s (GPC %s): init is revoke with no dataProcessingOptions', async (mode, gpc) => {
    setGpc(gpc)
    const { fbq } = await start(config(mode))

    expect(fbq.mock.calls[0]).toEqual(['consent', 'revoke'])
  })
})

describe('consent:change', () => {
  it('S-I1 detail is the snapshot', async () => {
    await seed(config('opt-in'), 'all')
    const { events } = await start()

    expect(events).toEqual([
      {
        stage: 'ready',
        recorded: true,
        gpc: 'none',
        categories: { necessary: true, analytics: true },
      },
    ])
  })

  it('S-I1 detail reports the GPC state', async () => {
    setGpc(true)
    const { events } = await start(config('opt-out'))

    expect(events.at(-1)).toMatchObject({ gpc: 'locked', categories: { analytics: false } })
  })

  it('S-I2 subscribe and unsubscribe through the DOM event', async () => {
    const { lib } = await start()
    const details: unknown[] = []
    const listener = (event: Event) => details.push((event as CustomEvent).detail)

    document.addEventListener('consent:change', listener)
    lib.acceptCategory('all')
    document.removeEventListener('consent:change', listener)
    lib.acceptCategory([])

    expect(details).toEqual([
      expect.objectContaining({ categories: { necessary: true, analytics: true } }),
    ])
  })
})

describe('window API', () => {
  it('S-I4 window.KDConsent exposes exactly the imperative helpers', async () => {
    await start()

    expect(Object.keys(window.KDConsent!).sort()).toEqual([
      'confirmAge',
      'getSnapshot',
      'has',
      'prompt',
      'require',
    ])
  })

  it('has() with no argument checks the default gate category', async () => {
    await seed(config('opt-in', { categories: THREE }), ['functionality'])
    await start(config('opt-in', { categories: THREE }))

    expect(handle().has('functionality')).toBe(true)
    expect(handle().has()).toBe(false)
  })

  it('has() with no argument follows gateCategory', async () => {
    const options = config('opt-in', { categories: THREE, gateCategory: 'functionality' })
    await seed(options, ['functionality'])
    await start(options)

    expect(handle().has()).toBe(true)
  })
})

describe('data-require-consent', () => {
  const GATED = '<a id="gated" href="#x" data-require-consent="analytics">go</a>'

  function clickGated(): boolean {
    let reached = false
    const link = document.querySelector('#gated')!
    const listener = (event: Event) => {
      reached = !event.defaultPrevented
    }
    link.addEventListener('click', listener)
    click('#gated')
    link.removeEventListener('click', listener)
    return reached
  }

  it('S-J1 blocks and prompts without consent, passes through with it', async () => {
    const { lib } = await start(config('opt-in'), script('analytics') + GATED)
    click(BANNER_PREFS)
    click(PREFS_REJECT)
    lib.hidePreferences()

    expect(clickGated()).toBe(false)
    expect(html.classList.contains('show--preferences')).toBe(true)

    lib.acceptCategory('all')
    lib.hidePreferences()

    expect(clickGated()).toBe(true)
    expect(html.classList.contains('show--preferences')).toBe(false)
  })

  it('S-J1 require() shows the banner when unrecorded, preferences when recorded', async () => {
    const { lib } = await start()
    lib.hide()

    expect(handle().require('analytics')).toBe(false)
    expect(html.classList.contains('show--consent')).toBe(true)

    lib.acceptCategory([])
    lib.hide()
    handle().prompt()

    expect(html.classList.contains('show--preferences')).toBe(true)
  })
})
