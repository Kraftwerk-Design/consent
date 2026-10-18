import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  BANNER_ACCEPT_ALL,
  PREFS_SAVE,
  click,
  config,
  gcmUpdates,
  handle,
  init,
  installFbq,
  load,
  recordEvents,
  reset,
  runs,
  script,
} from './harness'

beforeEach(() => reset())

function embed(attrs: string, template = '<p id="embedded">embed</p>'): string {
  return `<consent-embed ${attrs}><button data-poster>Show</button><template>${template}</template></consent-embed>`
}

const COUNTING_SCRIPT = `<script>
  document.documentElement.dataset.runEmbed = String(Number(document.documentElement.dataset.runEmbed ?? 0) + 1)
</script>`

describe('fresh opt-out visitor', () => {
  it('S-C1 load: defaults run once and every consumer sees them as granted', async () => {
    const { pkg } = await load(script('analytics') + embed('autoactivate category="analytics"'))
    const fbq = installFbq()
    const events = recordEvents()
    await init(pkg, config('opt-out'))

    expect(runs('analytics')).toBe(1)
    expect(document.cookie).not.toContain('kd_cookie_consent=')
    expect(handle().has('analytics')).toBe(true)
    expect(events).toEqual([
      expect.objectContaining({ categories: { necessary: true, analytics: true } }),
    ])
    expect(document.querySelector('#embedded')).not.toBeNull()
    expect(gcmUpdates()).toEqual(['granted'])
    expect(fbq.mock.calls).toEqual([
      ['consent', 'revoke'],
      ['consent', 'grant'],
    ])
  })
})

describe('opt-in, fresh visitor', () => {
  it('markup present before init: a poster click, then accepting, mounts the embed', async () => {
    const { pkg } = await load(embed('category="analytics"'))
    await init(pkg, config('opt-in'))
    const el = document.querySelector('consent-embed')!
    expect(el.getAttribute('state')).toBe('blocked')

    click('consent-embed [data-poster]')
    expect(document.querySelector('#embedded')).toBeNull()

    click(BANNER_ACCEPT_ALL)
    expect(document.querySelector('#embedded')).not.toBeNull()
    expect(el.getAttribute('state')).toBe('active')
  })
})

describe('opt-in, accepted visitor', () => {
  it('S-B5 withdraw tears the embed down', async () => {
    const { pkg, lib } = await load(embed('autoactivate category="analytics"'))
    await init(pkg, config('opt-in'))
    click(BANNER_ACCEPT_ALL)
    expect(document.querySelector('#embedded')).not.toBeNull()

    lib.showPreferences()
    document
      .querySelector<HTMLInputElement>('#cc-main .pm input.section__toggle[value="analytics"]')!
      .click()
    click(PREFS_SAVE)

    expect(document.querySelector('#embedded')).toBeNull()
  })
})

describe('repeat initConsent', () => {
  it('S-A4 repeat initConsent(otherCfg) → embeds keep the first default category', async () => {
    const categories = [
      { id: 'necessary', enabled: true, readOnly: true },
      { id: 'functionality' },
      { id: 'analytics' },
    ]
    const { pkg, lib } = await load(embed('autoactivate'))
    await init(pkg, config('opt-in', { categories }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    pkg.initConsent(config('opt-in', { categories, gateCategory: 'functionality' }))
    lib.acceptCategory(['functionality'])

    expect(handle().has('functionality')).toBe(true)
    expect(document.querySelector('#embedded')).toBeNull()

    lib.acceptCategory(['functionality', 'analytics'])
    expect(document.querySelector('#embedded')).not.toBeNull()
  })
})

describe('S-K16 destroy and re-init', () => {
  it('destroy() unmounts active embeds; after re-init they follow the new controller', async () => {
    const IFRAME = '<iframe src="about:blank"></iframe>'
    const { pkg } = await load(
      embed('id="auto" autoactivate category="analytics"', IFRAME) +
        embed('id="manual" category="analytics"', IFRAME),
    )
    await init(pkg, config('opt-in'))
    click(BANNER_ACCEPT_ALL)
    click('#manual [data-poster]')
    expect(document.querySelectorAll('iframe')).toHaveLength(2)

    handle().destroy()

    expect(document.querySelectorAll('iframe')).toHaveLength(0)
    expect(document.querySelectorAll('[data-consent-gated]')).toHaveLength(0)
    for (const el of document.querySelectorAll('consent-embed')) {
      expect(el.getAttribute('state')).toBe('blocked')
      expect(el.querySelector<HTMLElement>('[data-poster]')!.hidden).toBe(false)
    }

    await init(pkg, config('opt-in'))

    expect(handle().has('analytics')).toBe(true)
    expect(document.querySelector('#auto')!.getAttribute('state')).toBe('active')
    expect(document.querySelector('#manual')!.getAttribute('state')).toBe('blocked')
    expect(document.querySelectorAll('iframe')).toHaveLength(1)

    click('#manual [data-poster]')
    expect(document.querySelector('#manual')!.getAttribute('state')).toBe('active')
    expect(document.querySelectorAll('iframe')).toHaveLength(2)
  })
})

describe('<consent-embed> template scripts', () => {
  it('S-K13 run once when stamped, not before consent or on a same-task move', async () => {
    const { pkg } = await load(embed('autoactivate category="analytics"', COUNTING_SCRIPT))
    await init(pkg, config('opt-in'))
    const el = document.querySelector('consent-embed')!
    expect(runs('embed')).toBe(0)

    click(BANNER_ACCEPT_ALL)
    expect(runs('embed')).toBe(1)

    const other = document.createElement('div')
    document.body.append(other)
    other.append(el)
    await new Promise((resolve) => setTimeout(resolve))

    expect(runs('embed')).toBe(1)
  })
})
