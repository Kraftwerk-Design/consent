import { describe, it, expect, afterEach, vi } from 'vitest'
import { ageGateHeadScript, createAgeGate, warnDefaultNamePass } from './ageGate'

/** Execute a `<script>…</script>` snippet in the jsdom global scope. */
function run(html: string): void {
  const js = html.replace(/^<script>/, '').replace(/<\/script>$/, '')
  ;(0, eval)(js)
}

function cookieWrites(name: string): { writes: () => string[] } {
  const setter = vi.spyOn(document, 'cookie', 'set')
  return {
    writes: () =>
      setter.mock.calls.map((args) => String(args[0])).filter((value) => value.startsWith(`${name}=`)),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const cookie of document.cookie.split(/;\s*/)) {
    const name = cookie.split('=')[0]
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
  document.documentElement.className = ''
})

describe('createAgeGate', () => {
  it.each([
    ['x_age=1', true],
    ['foo_x_age=1', false],
    ['x_age=10', false],
  ])('passed() with cookie %s → %s, matching the head script', (cookie, verified) => {
    document.cookie = `${cookie}; Path=/`
    run(ageGateHeadScript({ cookieName: 'x_age' }))

    expect(createAgeGate({ cookieName: 'x_age' }).passed()).toBe(verified)
    expect(document.documentElement.classList.contains('age-verified')).toBe(verified)
  })

  it('confirm() writes AGE_GATE_COOKIE for 30 days by default', () => {
    const cookie = cookieWrites('kd_age_verified')
    createAgeGate().confirm()
    expect(cookie.writes()).toEqual(['kd_age_verified=1; Path=/; Max-Age=2592000; SameSite=Lax'])
  })

  it.each([
    [7, 'Max-Age=604800;'],
    [1.1, 'Max-Age=95040;'],
  ])('honors maxAgeDays %s, rounded to whole seconds', (maxAgeDays, expected) => {
    const cookie = cookieWrites('x_age')
    createAgeGate({ cookieName: 'x_age', maxAgeDays }).confirm()
    expect(cookie.writes()[0]).toContain(expected)
  })

  it('adds Secure over https', () => {
    vi.stubGlobal('location', { protocol: 'https:' })
    const cookie = cookieWrites('kd_age_verified')
    createAgeGate().confirm()
    expect(cookie.writes()[0]).toMatch(/; Secure$/)
  })

  it('onPass runs at once when passed, else once on the first confirm()', () => {
    const before = vi.fn()
    const gate = createAgeGate()
    gate.onPass(before)
    expect(before).not.toHaveBeenCalled()
    expect(gate.passed()).toBe(false)

    gate.confirm()
    gate.confirm()
    expect(before).toHaveBeenCalledTimes(1)
    expect(gate.passed()).toBe(true)

    const after = vi.fn()
    gate.onPass(after)
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('a cancelled onPass never runs', () => {
    const fn = vi.fn()
    const gate = createAgeGate()
    gate.onPass(fn)()
    gate.confirm()
    expect(fn).not.toHaveBeenCalled()
  })

  it('stays passed after the cookie goes', () => {
    const gate = createAgeGate()
    gate.confirm()
    document.cookie = 'kd_age_verified=; Path=/; Max-Age=0'
    expect(gate.passed()).toBe(true)
  })
})

describe('warnDefaultNamePass', () => {
  it.each([
    ['a custom name with only the default cookie', { cookieName: 'x_age' }, ['kd_age_verified'], 1],
    ['the custom cookie also set', { cookieName: 'x_age' }, ['kd_age_verified', 'x_age'], 0],
    ['no default cookie', { cookieName: 'x_age' }, [], 0],
    ['the default name', {}, ['kd_age_verified'], 0],
  ])('%s → %i warnings', (_, config, cookies, warnings) => {
    for (const name of cookies) document.cookie = `${name}=1; Path=/`
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnDefaultNamePass(config)
    expect(warn).toHaveBeenCalledTimes(warnings)
  })
})

describe('ageGateHeadScript', () => {
  it('escapes an awkward cookie name and still agrees with passed()', () => {
    const cookieName = "a'b\\c</script>"
    const html = ageGateHeadScript({ cookieName })
    expect(html.indexOf('</script>')).toBe(html.length - '</script>'.length)

    document.cookie = `${cookieName}=1; Path=/`
    run(html)
    expect(createAgeGate({ cookieName }).passed()).toBe(true)
    expect(document.documentElement.classList.contains('age-verified')).toBe(true)
  })

  it('defaults to AGE_GATE_COOKIE and adds a custom class', () => {
    document.cookie = 'kd_age_verified=1; Path=/'
    run(ageGateHeadScript({ className: 'of-age' }))
    expect(document.documentElement.classList.contains('of-age')).toBe(true)
  })
})
