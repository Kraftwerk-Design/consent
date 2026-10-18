import { describe, it, expect, beforeEach } from 'vitest'
import {
  BANNER_ACCEPT_ALL,
  BANNER_PREFS,
  PREFS_REJECT,
  click,
  config,
  gcmUpdates,
  init,
  installFbq,
  load,
  recordEvents,
  reset,
  script,
} from './harness'

beforeEach(() => reset())

async function freshOptOut(body = script('analytics')) {
  const loaded = await load(body)
  const fbq = installFbq()
  const events = recordEvents()
  await init(loaded.pkg, config('opt-out'))
  return { ...loaded, fbq, events }
}

function reject(): void {
  click(BANNER_PREFS)
  click(PREFS_REJECT)
}

type Detail = { categories: Record<string, boolean> }

describe('fresh opt-out visitor', () => {
  it('S-C2 reject: necessary-only, one event, one denied update, LDU + revoke once', async () => {
    const { lib, fbq } = await freshOptOut()
    const events = recordEvents()
    const updatesBefore = gcmUpdates().length
    fbq.mockClear()

    reject()

    expect(lib.getCookie('categories')).toEqual(['necessary'])
    expect(events).toHaveLength(1)
    expect(gcmUpdates().slice(updatesBefore)).toEqual(['denied'])
    expect(fbq.mock.calls).toEqual([
      ['dataProcessingOptions', ['LDU'], 0, 0],
      ['consent', 'revoke'],
    ])
  })

  it('S-C3 Accept all (= defaults): one event, no GCM or Meta call', async () => {
    const { fbq } = await freshOptOut()
    const events = recordEvents()
    const updatesBefore = gcmUpdates().length
    fbq.mockClear()

    click(BANNER_ACCEPT_ALL)

    expect(events).toHaveLength(1)
    expect(gcmUpdates().length).toBe(updatesBefore)
    expect(fbq).not.toHaveBeenCalled()
  })

  it('S-I5 the load event reports analytics granted', async () => {
    const { events } = await freshOptOut()

    expect((events.at(-1) as Detail).categories.analytics).toBe(true)
  })

  it('S-J2 data-require-consent passes the click through', async () => {
    await freshOptOut(script('analytics') + '<a id="gated" href="#x" data-require-consent="analytics">go</a>')
    let reached = false
    document.querySelector('#gated')!.addEventListener('click', (event) => {
      reached = !event.defaultPrevented
    })

    click('#gated')

    expect(reached).toBe(true)
  })
})
