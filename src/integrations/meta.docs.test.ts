// @vitest-environment node
/// <reference types="vite/client" />
import { it, expect } from 'vitest'
import doc from '../../docs/meta-pixel.md?raw'
import fixture from '../../e2e/site/meta-head.html?raw'

const between = (source: string): string | undefined =>
  source.match(/<!-- meta-head -->\n([\s\S]*?)<!-- \/meta-head -->/)?.[1]

it('S-H5 the e2e fixture head is the documented Meta head block', () => {
  const block = between(doc)?.replace(/^```html\n/, '').replace(/```\n$/, '')
  expect(block).toMatch(/^<script>[\s\S]*fbq\('track', 'PageView'\);\n<\/script>\n$/)
  expect(between(fixture)).toBe(block)
})
