import { hasConsent } from './analytics'
import { getConsentConfig, isGpcClamped } from './config'
import type { ConsentCategory } from './config.default'
import { readConsentCookie } from './consentCookie'
import { hasGpcSignal } from './gpc'

type ConsentSignalState = 'granted' | 'denied'

/**
 * Build the managed-signal map. `granted` decides, per category, whether that
 * category counts as granted for the command being built. A signal is
 * `'granted'` if ANY category that maps it is granted, else `'denied'`.
 * Signals no category maps are omitted (unmanaged).
 */
export function computeSignals(
  granted: (category: ConsentCategory) => boolean,
): Record<string, ConsentSignalState> {
  const signals: Record<string, ConsentSignalState> = {}
  for (const category of getConsentConfig().categories) {
    if (!category.google) continue
    const state: ConsentSignalState = granted(category) ? 'granted' : 'denied'
    for (const signal of category.google) {
      if (signals[signal] === 'granted') continue // OR across categories
      signals[signal] = state
    }
  }
  return signals
}

/** Reuse the page's dataLayer/gtag; define a gtag shim only if absent. */
export function getGtag(): (...args: unknown[]) => void {
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

/**
 * Whether a category counts as granted for the *default* command. Shared by the
 * init-time push and the inline `<head>` script so the two never diverge.
 *
 * - readOnly (necessary) categories are always granted, even if a stale cookie
 *   predates them being saved.
 * - No saved cookie → mode baseline (`enabled`), with GPC forcing clamped
 *   categories off regardless of `allowGpcOverride`.
 * - Valid saved cookie → the visitor's actual acceptance, except a GPC-clamped
 *   category stays denied unless the visitor saved an opt-in *and*
 *   `allowGpcOverride` is on. Mirrors `hasConsent`'s GPC clamp.
 */
export function categoryGrantedByDefault(
  category: ConsentCategory,
  saved: string[] | null,
  gpcActive: boolean,
): boolean {
  if (category.readOnly) return true

  const clampedOff = isGpcClamped(category.id) && gpcActive

  if (saved) {
    if (clampedOff && !getConsentConfig().allowGpcOverride) return false
    return saved.includes(category.id)
  }

  return (category.enabled ?? false) && !clampedOff
}

/**
 * Push the Consent Mode `default` command once, at init, before GTM reads it.
 * Cookie-aware: a returning visitor's saved choice drives the default so it
 * never diverges from the synchronous inline `<head>` default
 * ({@link renderGoogleConsentDefaultScript}). A fresh visitor falls back to the
 * mode baseline. GPC forces clamped signals denied unless a saved opt-in under
 * `allowGpcOverride`.
 */
export function pushGoogleConsentDefault(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().googleConsentMode) return
  const saved = readConsentCookie(
    document.cookie,
    getConsentConfig().cookieName,
  )
  const gpcActive = hasGpcSignal()
  const signals = computeSignals((category) =>
    categoryGrantedByDefault(category, saved?.categories ?? null, gpcActive),
  )
  getGtag()('consent', 'default', { ...signals, wait_for_update: 500 })
}

/** Escape regex metacharacters so a cookie name is matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Serialize a config payload for embedding in an inline `<script>`. Escapes the
 * characters that could break out of the script element (`<`) or a JS string
 * literal (the U+2028 / U+2029 line separators).
 */
function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/[\u2028\u2029]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16))
}

/**
 * Build a synchronous, cookie-aware, GPC-aware Consent Mode `default` script for
 * inlining in `<head>` *above* the Google tag/GTM container — solving the race
 * where the init-time default (inside the deferred bundle) runs after the tag.
 *
 * Framework-agnostic: returns a complete `<script>…</script>` string the
 * consumer emits server-side. All per-visitor state is read at *runtime* inside
 * the returned script (`document.cookie` + `navigator.globalPrivacyControl`), so
 * the string is a config constant safe to serve from a static/CDN cache — it
 * never bakes one visitor's consent into the page. Returns `''` when
 * `googleConsentMode` is off.
 *
 * The derivation matches the init-time default's category-by-category
 * grant logic and signal aggregation exactly — guaranteed by a parity test —
 * so the inline and init-time defaults never diverge. Consumers never parse
 * the consent cookie themselves.
 */
export function renderGoogleConsentDefaultScript(): string {
  const config = getConsentConfig()
  if (!config.googleConsentMode) return ''

  const payload = {
    rx: `(?:^|;\\s*)${escapeRegExp(config.cookieName)}=([^;]*)`,
    override: config.allowGpcOverride,
    categories: config.categories
      .filter((category) => category.google && category.google.length > 0)
      .map((category) => ({
        id: category.id,
        enabled: category.enabled ?? false,
        readOnly: category.readOnly ?? false,
        clamped: isGpcClamped(category.id),
        google: category.google,
      })),
  }

  // Mirrors categoryGrantedByDefault + computeSignals in vanilla JS so it can run
  // before the bundle (and before vanilla-cookieconsent) loads.
  const body = `(function(){
var P=${serializeForScript(payload)};
var saved=null;
try{var m=document.cookie.match(new RegExp(P.rx));if(m){var v=JSON.parse(decodeURIComponent(m[1]));if(v&&Array.isArray(v.categories))saved=v.categories;}}catch(e){}
var gpc=navigator.globalPrivacyControl===true;
var s={};
for(var i=0;i<P.categories.length;i++){
var c=P.categories[i],granted;
if(c.readOnly){granted=true;}
else{var off=c.clamped&&gpc;if(saved){granted=(off&&!P.override)?false:saved.indexOf(c.id)!==-1;}else{granted=c.enabled&&!off;}}
for(var j=0;j<c.google.length;j++){var sig=c.google[j];if(s[sig]==='granted')continue;s[sig]=granted?'granted':'denied';}
}
s.wait_for_update=500;
window.dataLayer=window.dataLayer||[];
var gtag=window.gtag||(window.gtag=function(){window.dataLayer.push(arguments);});
gtag('consent','default',s);
})();`

  return `<script>${body}</script>`
}

/**
 * Push the Consent Mode `update` command on every consent change. Derives from
 * `hasConsent` (a real recorded choice), which already honors the GPC clamp.
 */
export function pushGoogleConsentUpdate(): void {
  if (typeof window === 'undefined') return
  if (!getConsentConfig().googleConsentMode) return
  const signals = computeSignals((category) => hasConsent(category.id))
  getGtag()('consent', 'update', signals)
}
