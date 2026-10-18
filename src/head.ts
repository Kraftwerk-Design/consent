import { AGE_GATE_COOKIE } from './ageGate'
import type { GoogleConsentSignal } from './integrations/google'

/** Signals set by {@link GOOGLE_CONSENT_DEFAULT_HEAD}. */
export const GOOGLE_HEAD_SIGNALS: Partial<Record<GoogleConsentSignal, 'granted' | 'denied'>> = {
  security_storage: 'granted',
  functionality_storage: 'granted',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
}

/** How long Google tags hold their first pings for the bundle's `update`. */
export const WAIT_FOR_UPDATE = 500

/**
 * The synchronous Consent Mode `default` to inline in `<head>` **above** an
 * *unblocked* Google tag or GTM container (Model B). Static and config-free,
 * so it is safe on statically cached pages: `security_storage` and
 * `functionality_storage` granted, analytics and ad signals denied,
 * `wait_for_update: 500`. It equals the integration's init `default` only
 * for exactly those six signals, with `security_storage` and
 * `functionality_storage` mapped to `readOnly` categories and the other four
 * to consent-gated ones. `googleConsentMode` warns at init when an earlier
 * `default` grants a signal its map denies before consent.
 *
 * A Google tag that is `type="text/plain"` and released by the bundle
 * (Model A) doesn't need it.
 */
export const GOOGLE_CONSENT_DEFAULT_HEAD = `<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('consent', 'default', {
${Object.entries(GOOGLE_HEAD_SIGNALS)
  .map(([signal, state]) => `    ${signal}: '${state}',\n`)
  .join('')}    wait_for_update: ${WAIT_FOR_UPDATE},
  });
</script>`

/**
 * The `<head>` script that adds `className` (default `'age-verified'`) to
 * `<html>` before paint when the age cookie (default `AGE_GATE_COOKIE`) is
 * set, so CSS can hide the gate for returning visitors on cached pages.
 * Matches cookies exactly as `isAgeVerified()` does.
 */
export function ageGateHeadScript({
  cookieName = AGE_GATE_COOKIE,
  className = 'age-verified',
}: { cookieName?: string; className?: string } = {}): string {
  const literal = (value: string): string => JSON.stringify(value).replace(/</g, '\\u003c')
  return `<script>
  if (document.cookie.split(/;\\s*/).includes(${literal(`${cookieName}=1`)}))
    document.documentElement.classList.add(${literal(className)})
</script>`
}
