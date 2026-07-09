/**
 * The subset of vanilla-cookieconsent's saved cookie this package reads. The
 * cookie is stored as `encodeURIComponent(JSON.stringify(value))`; `categories`
 * is the list of accepted category ids (readOnly categories included once a
 * choice is saved).
 */
export interface SavedConsent {
  categories: string[]
}

/** Escape regex metacharacters so a cookie name is matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parse the vanilla-cookieconsent cookie out of a raw cookie string (e.g.
 * `document.cookie`). Returns the accepted categories, or `null` when the
 * cookie is absent, malformed, or missing a valid `categories` array. This is
 * the package's single source of truth for cookie parsing — nothing else should
 * decode the cookie JSON.
 */
export function readConsentCookie(
  cookieString: string,
  cookieName: string,
): SavedConsent | null {
  const match = cookieString.match(
    new RegExp(`(?:^|;\\s*)${escapeRegExp(cookieName)}=([^;]*)`),
  )
  if (!match) return null

  try {
    const value = JSON.parse(decodeURIComponent(match[1])) as unknown
    if (
      typeof value === 'object' &&
      value !== null &&
      Array.isArray((value as { categories?: unknown }).categories)
    ) {
      return { categories: (value as SavedConsent).categories }
    }
  } catch {
    // Malformed cookie — treat as no saved choice.
  }
  return null
}
