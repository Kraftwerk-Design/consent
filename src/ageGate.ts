/** Default name of the cookie recording a passed age gate. */
export const AGE_GATE_COOKIE = 'kd_age_verified'

const DEFAULT_MAX_AGE_DAYS = 30

export function hasAgeCookie(cookieName: string): boolean {
  return document.cookie.split(/;\s*/).includes(`${cookieName}=1`)
}

export function writeAgeCookie(
  cookieName: string,
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
): void {
  const maxAge = Math.round(maxAgeDays * 86400)
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${cookieName}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

/**
 * Warn about vendor tags that can track before `confirmAge()`: Google or Meta
 * scripts not blocked as `type="text/plain"`, or a Meta Pixel already running.
 */
export function warnUngatedTags(): void {
  const tags = document.querySelectorAll<HTMLScriptElement>(
    'script[src*="googletagmanager.com"], script[src*="connect.facebook.net"]',
  )
  for (const tag of tags) {
    if (tag.getAttribute('type') === 'text/plain') continue
    console.warn(
      `[consent] ${tag.src} is not blocked (type="text/plain" data-category="…"), so it can track before confirmAge(). Ungated vendor tags are unsupported with the age gate.`,
    )
  }
  if ('fbq' in window) {
    console.warn(
      '[consent] window.fbq exists before confirmAge(): an ungated Meta Pixel can track before the age gate passes. Ungated vendor tags are unsupported with the age gate.',
    )
  }
}
