// Stands in for an unblocked gtag.js: records the dataLayer it finds on load,
// then every later push with its time since load.
;(() => {
  const loadedAt = performance.now()
  const args = (entry) => Array.from(entry)
  const gtag = (window.__gtag = { seen: Array.from(dataLayer, args), later: [] })
  const push = dataLayer.push
  dataLayer.push = (...entries) => {
    for (const entry of entries) gtag.later.push({ ms: performance.now() - loadedAt, value: args(entry) })
    return push.apply(dataLayer, entries)
  }
})()
