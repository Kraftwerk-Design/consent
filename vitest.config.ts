import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom for the DOM-touching suites (analytics, gate, consentEmbed).
    // Pure-logic suites can opt down with `// @vitest-environment node`.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
