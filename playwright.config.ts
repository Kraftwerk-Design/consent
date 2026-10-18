import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // vanilla-cookieconsent's `hideFromBots` skips the UI when
        // navigator.webdriver is true.
        launchOptions: { args: ['--disable-blink-features=AutomationControlled'] },
      },
    },
  ],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://localhost:4173/e2e/site/basic.html',
    reuseExistingServer: !process.env.CI,
  },
})
