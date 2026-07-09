import { describe, it, expect } from 'vitest'
import { readConsentCookie } from './consentCookie'

const NAME = 'kd_cookie_consent'

/** vanilla-cookieconsent stores encodeURIComponent(JSON.stringify(value)). */
function encode(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value))
}

describe('readConsentCookie', () => {
  it('returns null when no cookie of that name is present', () => {
    expect(readConsentCookie('other=1; another=2', NAME)).toBeNull()
    expect(readConsentCookie('', NAME)).toBeNull()
  })

  it('parses the accepted categories from the saved cookie', () => {
    const cookie = `${NAME}=${encode({
      categories: ['necessary', 'analytics'],
      revision: 0,
      consentId: 'abc',
    })}`
    expect(readConsentCookie(cookie, NAME)).toEqual({
      categories: ['necessary', 'analytics'],
    })
  })

  it('finds the cookie among others regardless of position', () => {
    const value = encode({ categories: ['necessary'] })
    expect(
      readConsentCookie(`foo=bar; ${NAME}=${value}; baz=qux`, NAME),
    ).toEqual({ categories: ['necessary'] })
  })

  it('does not match a cookie whose name is a superstring', () => {
    const value = encode({ categories: ['analytics'] })
    // `other_kd_cookie_consent` must not satisfy a request for `kd_cookie_consent`
    expect(readConsentCookie(`other_${NAME}=${value}`, NAME)).toBeNull()
  })

  it('escapes regex-special characters in the cookie name', () => {
    const weird = 'my.cookie[1]'
    const value = encode({ categories: ['necessary'] })
    expect(readConsentCookie(`${weird}=${value}`, weird)).toEqual({
      categories: ['necessary'],
    })
  })

  it('returns null for malformed JSON', () => {
    expect(readConsentCookie(`${NAME}=not-json`, NAME)).toBeNull()
    expect(
      readConsentCookie(`${NAME}=${encodeURIComponent('{broken')}`, NAME),
    ).toBeNull()
  })

  it('returns null when categories is missing or not an array', () => {
    expect(
      readConsentCookie(`${NAME}=${encode({ revision: 0 })}`, NAME),
    ).toBeNull()
    expect(
      readConsentCookie(`${NAME}=${encode({ categories: 'analytics' })}`, NAME),
    ).toBeNull()
  })

  it('treats an empty accepted set as a valid saved choice', () => {
    // A returning visitor who opted out entirely saves `categories: []`.
    expect(readConsentCookie(`${NAME}=${encode({ categories: [] })}`, NAME)).toEqual(
      { categories: [] },
    )
  })
})
