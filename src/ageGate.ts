import type { AgeGateConfig } from './config.default'

/** Default name of the cookie recording a passed age gate. */
export const AGE_GATE_COOKIE = 'kd_age_verified'

const DEFAULT_MAX_AGE_DAYS = 30

/** The `document.cookie` entry recording a pass. */
const passEntry = (cookieName: string): string => `${cookieName}=1`

const hasPassCookie = (cookieName: string): boolean =>
  document.cookie.split(/;\s*/).includes(passEntry(cookieName))

/** The visitor's age-gate state for one page. */
export interface AgeGate {
  /** The cookie existed at creation or {@link AgeGate.confirm} ran. Stays true for the page. */
  passed(): boolean
  /** Write the cookie, then run the {@link AgeGate.onPass} callbacks once. */
  confirm(): void
  /** Run `fn` on the pass: now if already passed, else on confirm. Returns the cancel. */
  onPass(fn: () => void): () => void
}

export function createAgeGate({
  cookieName = AGE_GATE_COOKIE,
  maxAgeDays = DEFAULT_MAX_AGE_DAYS,
}: Readonly<AgeGateConfig> = {}): AgeGate {
  let passed = hasPassCookie(cookieName)
  const waiting = new Set<() => void>()

  return {
    passed: () => passed,
    confirm() {
      const maxAge = Math.round(maxAgeDays * 86400)
      const secure = location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${passEntry(cookieName)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
      if (passed) return
      passed = true
      const callbacks = [...waiting]
      waiting.clear()
      for (const fn of callbacks) fn()
    },
    onPass(fn) {
      if (passed) {
        fn()
        return () => {}
      }
      waiting.add(fn)
      return () => {
        waiting.delete(fn)
      }
    },
  }
}

/**
 * Warn when `confirmAge()` ran before `initConsent()` without the configured
 * `cookieName`, so the pass landed under the default name.
 */
export function warnDefaultNamePass({ cookieName = AGE_GATE_COOKIE }: Readonly<AgeGateConfig>): void {
  if (cookieName === AGE_GATE_COOKIE || hasPassCookie(cookieName) || !hasPassCookie(AGE_GATE_COOKIE)) return
  console.warn(
    `[consent] confirmAge() before initConsent() wrote ${AGE_GATE_COOKIE}, but ageGate.cookieName is '${cookieName}'. Pass the same ageGate options to confirmAge() and isAgeVerified().`,
  )
}

/**
 * The `<head>` script that adds `className` (default `'age-verified'`) to
 * `<html>` before paint when the age cookie (default `AGE_GATE_COOKIE`) is
 * set, so CSS can hide the gate for returning visitors on cached pages.
 * Matches cookies exactly as `isAgeVerified()` does.
 */
export function ageGateHeadScript({
  cookieName = AGE_GATE_COOKIE,
  className = 'age-verified',
}: Readonly<AgeGateConfig> & { className?: string } = {}): string {
  const literal = (value: string): string => JSON.stringify(value).replace(/</g, '\\u003c')
  return `<script>
  if (document.cookie.split(/;\\s*/).includes(${literal(passEntry(cookieName))}))
    document.documentElement.classList.add(${literal(className)})
</script>`
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
