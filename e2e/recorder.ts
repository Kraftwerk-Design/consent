import { test as base, expect, type Page } from '@playwright/test'

// Readers for e2e/site/_recorder.js, plus a `thirdParty` fixture that aborts
// and logs every request not served by the fixture server.

export interface Entry<T = unknown> {
  nav: number
  value: T
}

const read = <T>(page: Page, key: string): Promise<T | null> =>
  page.evaluate((k) => JSON.parse(sessionStorage.getItem('rec:' + k) ?? 'null'), key)

/** Page loads in this tab, reloads included. */
export const navigations = async (page: Page): Promise<number> =>
  (await read<number>(page, 'nav')) ?? 0

/** `beforeunload`s in this tab: a navigation started, even one that hasn't loaded yet. */
export const unloads = async (page: Page): Promise<number> =>
  (await read<number>(page, 'unload')) ?? 0

/** Executions of `__rec.ran(category)` across reloads. */
export const runs = async (page: Page, category: string): Promise<number> =>
  (await read<number>(page, 'run:' + category)) ?? 0

export const events = async <T = unknown>(page: Page): Promise<Entry<T>[]> =>
  (await read<Entry<T>[]>(page, 'events')) ?? []

export const fbqCalls = async (page: Page): Promise<Entry<unknown[]>[]> =>
  (await read<Entry<unknown[]>[]>(page, 'fbq')) ?? []

/** `gtag('consent', …)` commands pushed to `dataLayer`. */
export const consentCommands = async (page: Page): Promise<Entry<unknown[]>[]> =>
  ((await read<Entry<unknown[]>[]>(page, 'dataLayer')) ?? []).filter(
    (entry) => Array.isArray(entry.value) && entry.value[0] === 'consent',
  )

export const test = base.extend<{ thirdParty: string[] }>({
  thirdParty: [
    async ({ context }, use) => {
      const requests: string[] = []
      await context.route(
        (url) => url.hostname !== 'localhost',
        (route) => {
          requests.push(route.request().url())
          return route.abort()
        },
      )
      await use(requests)
    },
    { auto: true },
  ],
})

export { expect }
