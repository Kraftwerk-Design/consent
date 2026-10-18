import type { ConsentIntegration } from '../config.default'
import type { ConsentSnapshot } from '../core/snapshot'
import { WAIT_FOR_UPDATE } from '../head'

/** A Google Consent Mode v2 signal. */
export type GoogleConsentSignal =
  | 'ad_storage'
  | 'ad_user_data'
  | 'ad_personalization'
  | 'analytics_storage'
  | 'functionality_storage'
  | 'personalization_storage'
  | 'security_storage'

/** Each managed signal and the category id or ids that grant it. */
export type GoogleConsentMap = Partial<Record<GoogleConsentSignal, string | readonly string[]>>

type ConsentSignalState = 'granted' | 'denied'
type Signals = Record<string, ConsentSignalState>

/** Reuse the page's dataLayer/gtag; define a gtag shim only if absent. */
function getGtag(): (...args: unknown[]) => void {
  const w = window as unknown as {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  w.dataLayer = w.dataLayer || []
  if (typeof w.gtag !== 'function') {
    // Push the real `arguments` object — GTM only treats that form as a gtag
    // command, not a plain array.
    w.gtag = function gtag() {
      w.dataLayer!.push(arguments)
    }
  }
  return w.gtag
}

/** Signals granted by `consent` `default` commands already in `dataLayer`. */
function earlierDefaultGrants(): Set<string> {
  const granted = new Set<string>()
  const dataLayer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []
  for (const entry of dataLayer) {
    const args = entry as ArrayLike<unknown> | null
    if (args?.[0] !== 'consent' || args[1] !== 'default') continue
    for (const [signal, state] of Object.entries(Object(args[2]))) {
      if (state === 'granted') granted.add(signal)
    }
  }
  return granted
}

/**
 * Google Consent Mode v2. A signal is `'granted'` if ANY category mapping it is
 * granted, else `'denied'`. Unmapped signals are left to Google's defaults.
 *
 * Init pushes the deny-first `default` (signals of `readOnly` categories
 * granted, the rest denied, `wait_for_update: 500`) regardless of mode,
 * cookie or GPC, so the only flips that follow are `denied → granted`. It
 * mirrors the static `<head>` snippet (`GOOGLE_CONSENT_DEFAULT_HEAD`)
 * for the usual necessary/analytics mapping. Each change then pushes an
 * `update` with every mapped signal.
 *
 *   googleConsentMode({
 *     security_storage: 'necessary',
 *     analytics_storage: 'analytics',
 *     ad_storage: ['analytics', 'marketing'],
 *   })
 */
export function googleConsentMode(map: GoogleConsentMap): ConsentIntegration {
  const entries: [string, readonly string[]][] = []
  for (const [signal, ids] of Object.entries(map)) {
    if (ids !== undefined) entries.push([signal, typeof ids === 'string' ? [ids] : [...ids]])
  }
  const signals = (granted: (id: string) => boolean): Signals =>
    Object.fromEntries(
      entries.map(([signal, ids]) => [signal, ids.some(granted) ? 'granted' : 'denied']),
    )
  const fromSnapshot = (snapshot: ConsentSnapshot): Signals =>
    signals((id) => snapshot.categories[id] === true)
  let baseline = signals(() => false)

  return {
    name: 'google-consent-mode',
    categories: [...new Set(entries.flatMap(([, ids]) => ids))],
    init(config) {
      const readOnly = new Set(
        config.categories.filter((category) => category.readOnly).map((category) => category.id),
      )
      baseline = signals((id) => readOnly.has(id))
      const early = earlierDefaultGrants()
      const conflicts = entries
        .map(([signal]) => signal)
        .filter((signal) => baseline[signal] === 'denied' && early.has(signal))
      if (conflicts.length) {
        console.warn(
          `[consent] an earlier consent default (the <head> snippet) grants ${conflicts.join(', ')} before consent, but googleConsentMode maps ${conflicts.length > 1 ? 'them' : 'it'} to consent-gated categories. Map ${conflicts.length > 1 ? 'them' : 'it'} to readOnly categories, or drop the head snippet and gate the Google tag (Model A).`,
        )
      }
      getGtag()('consent', 'default', { ...baseline, wait_for_update: WAIT_FOR_UPDATE })
    },
    apply(next, prev) {
      const to = fromSnapshot(next)
      const from = prev ? fromSnapshot(prev) : baseline
      if (entries.every(([signal]) => to[signal] === from[signal])) return
      getGtag()('consent', 'update', to)
    },
  }
}
