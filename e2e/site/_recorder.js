// Load first in <head>. Logs survive reloads in sessionStorage; each entry
// carries the navigation it happened on. Add `data-fbq` to install a
// recording `window.fbq`.
;(() => {
  const read = (key) => JSON.parse(sessionStorage.getItem('rec:' + key) ?? 'null')
  const write = (key, value) => sessionStorage.setItem('rec:' + key, JSON.stringify(value))

  const nav = (read('nav') ?? 0) + 1
  write('nav', nav)
  const log = (kind, value) => write(kind, [...(read(kind) ?? []), { nav, value }])

  window.__rec = {
    ran: (category) => write('run:' + category, (read('run:' + category) ?? 0) + 1),
  }

  document.addEventListener('consent:change', (event) => log('events', event.detail))
  window.addEventListener('beforeunload', () => write('unload', (read('unload') ?? 0) + 1))

  const dataLayer = (window.dataLayer = [])
  dataLayer.push = (...entries) => {
    for (const entry of entries) {
      const isArguments = Object.prototype.toString.call(entry) === '[object Arguments]'
      log('dataLayer', isArguments ? Array.from(entry) : entry)
    }
    return Array.prototype.push.apply(dataLayer, entries)
  }

  if (document.currentScript.hasAttribute('data-fbq')) {
    window.fbq = (...args) => log('fbq', args)
  }
})()
