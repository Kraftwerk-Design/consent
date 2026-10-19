import type { ConsentIntegration } from '../config.default'
import type { ConsentSnapshot } from '../core/snapshot'

/**
 * The page's `fbq` if it is already a function, else a no-op. Deliberately does
 * NOT synthesize an `fbq` stub: the Meta base snippet self-guards with
 * `if (f.fbq) return`, so any stub we define would suppress pixel init. The
 * pixel base code must therefore load before initConsent().
 */
function getFbq(): (...args: unknown[]) => void {
  const w = window as unknown as { fbq?: (...args: unknown[]) => void }
  return typeof w.fbq === 'function' ? w.fbq : () => {}
}

interface MetaPixelState {
  granted: boolean
  /** Limited Data Use, held while an opt-out visitor's ready snapshot is not granted. */
  ldu: boolean
}

/**
 * Meta Pixel consent (`fbq('consent', 'grant' | 'revoke')`). The pixel is
 * binary: granted if ANY of `category` is granted.
 *
 * Init sends the baseline's consent value (`revoke` unless `category` includes
 * a readOnly one) in every mode, with no Limited Data Use, so a visitor whose
 * snapshot turns out granted is never left limited. With `ldu` (default
 * `true`) in opt-out mode a denied visitor also gets
 * `dataProcessingOptions(['LDU'], 0, 0)`, cleared on grant; opt-in never sends
 * `dataProcessingOptions`. Each change sends only what differs from the
 * previous state: the consent value when it flips, LDU when it is set or
 * cleared (set before a revoke, cleared after a grant).
 */
export function metaPixel({
  category,
  ldu = true,
}: {
  category: string | readonly string[]
  ldu?: boolean
}): ConsentIntegration {
  const ids = typeof category === 'string' ? [category] : [...category]
  let limit = false

  const state = (snapshot: ConsentSnapshot): MetaPixelState => {
    const granted = ids.some((id) => snapshot.categories[id] === true)
    return { granted, ldu: limit && snapshot.stage === 'ready' && !granted }
  }

  return {
    name: 'meta-pixel',
    categories: ids,
    init({ baseline, mode }) {
      limit = ldu && mode === 'opt-out'
      getFbq()('consent', state(baseline).granted ? 'grant' : 'revoke')
    },
    apply(next, prev) {
      const to = state(next)
      const from = state(prev)
      const fbq = getFbq()
      if (to.ldu && !from.ldu) fbq('dataProcessingOptions', ['LDU'], 0, 0)
      if (to.granted !== from.granted) fbq('consent', to.granted ? 'grant' : 'revoke')
      if (!to.ldu && from.ldu) fbq('dataProcessingOptions', [])
    },
  }
}
