import { defineConsentEmbed } from './embed'
import { describeGatedEmbed } from '../testing/gatedEmbed.contract'

describeGatedEmbed({
  tag: 'consent-embed',
  define: defineConsentEmbed,
  make: () => {
    const el = document.createElement('consent-embed')
    el.innerHTML =
      '<button data-poster>Show</button><template><iframe src="about:blank"></iframe></template>'
    return el
  },
  probe: (el) => ({
    activeNodes: el.querySelectorAll('[data-consent-embed-content]').length,
    iframes: el.querySelectorAll('iframe').length,
  }),
})
