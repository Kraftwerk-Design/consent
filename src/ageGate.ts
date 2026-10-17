import { getConsentConfig } from './config'

const DEFAULT_MAX_AGE_DAYS = 30

let verified = false
let waiters: (() => void)[] = []

/**
 * @internal test-only. Clears the in-memory verified flag and pending waiters.
 */
export function __resetAgeGateForTests(): void {
  verified = false
  waiters = []
}

/**
 * True when no `ageGate` is configured, or the visitor has passed it (this page
 * or within the cookie's lifetime). Until then the whole consent stack is held:
 * no banner, no released scripts, and `hasConsent()` is false for every
 * category.
 */
export function isAgeVerified(): boolean {
  const gate = getConsentConfig().ageGate
  if (!gate || verified) return true

  return document.cookie.split(/;\s*/).includes(`${gate.cookieName}=1`)
}

/**
 * Record that the visitor passed the age gate and release the consent stack.
 * Input-agnostic: the site decides eligibility (yes/no, date of birth, …) and
 * calls this only on a pass. Never stores the answer itself.
 */
export function confirmAge(): void {
  const gate = getConsentConfig().ageGate
  if (!gate) return

  const maxAge = Math.round((gate.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 86400)
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${gate.cookieName}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
  verified = true

  const pending = waiters
  waiters = []
  pending.forEach((resolve) => resolve())
}

/** Resolves on the next `confirmAge()`. Check `isAgeVerified()` first. */
export function whenAgeConfirmed(): Promise<void> {
  return new Promise((resolve) => waiters.push(resolve))
}
