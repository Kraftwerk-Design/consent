declare global {
  interface Navigator {
    /** https://developer.mozilla.org/en-US/docs/Web/API/Navigator/globalPrivacyControl */
    globalPrivacyControl?: boolean
  }
}

/**
 * True when the visitor has enabled Global Privacy Control (GPC).
 *
 * Detected purely client-side via `navigator.globalPrivacyControl`. Per the GPC
 * spec, any agent that sends the `Sec-GPC` header also exposes this API, so no
 * server-side header check is needed — which also keeps this correct on
 * statically-cached pages, where a server-rendered flag would be frozen for all
 * visitors.
 */
export function hasGpcSignal(): boolean {
  return navigator.globalPrivacyControl === true
}
