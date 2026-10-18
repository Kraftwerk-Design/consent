import type { Page } from '@playwright/test'
import { test, expect } from './recorder'

const URL = '/e2e/site/meta-head.html'

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

// fbevents.js is aborted, so the base snippet's stub queues every call.
const queue = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { fbq: { queue: ArrayLike<unknown>[] } }).fbq.queue.map((args) =>
      Array.from(args),
    ),
  )

const HEAD = [
  ['consent', 'revoke'],
  ['init', 'YOUR_PIXEL_ID'],
  ['track', 'PageView'],
]

test('S-H5 fresh opt-out: inline revoke, init, PageView, then library revoke and grant', async ({
  page,
  thirdParty,
}) => {
  await page.goto(URL)
  await ready(page)

  expect(thirdParty).toEqual(['https://connect.facebook.net/en_US/fbevents.js'])
  expect(await queue(page)).toEqual([...HEAD, ['consent', 'revoke'], ['consent', 'grant']])
})

test('S-H5 returning rejected opt-out: library revoke then LDU, no grant', async ({ page }) => {
  await page.goto(URL)
  await ready(page)

  const reloaded = page.waitForEvent('load')
  await page.locator('#cc-main .cm [data-role="show"]').click()
  await page.locator('#cc-main .pm [data-role="necessary"]').click()
  await reloaded
  await ready(page)

  expect(await queue(page)).toEqual([
    ...HEAD,
    ['consent', 'revoke'],
    ['dataProcessingOptions', ['LDU'], 0, 0],
  ])
})
