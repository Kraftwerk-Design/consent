import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom for the DOM-touching suites (elements, L1).
    // Pure-logic suites can opt down with `// @vitest-environment node`.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
