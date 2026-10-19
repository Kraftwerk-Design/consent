import type { Page } from '@playwright/test'
import { test, expect } from './recorder'
import { GOOGLE_HEAD_SIGNALS, WAIT_FOR_UPDATE } from '../src/integrations/google'

const URL = '/e2e/site/gcm-model-b-blitz.html'

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

interface Gtag {
  seen: unknown[][]
  later: { ms: number; value: unknown[] }[]
}
const gtag = (page: Page) => page.evaluate(() => (window as unknown as { __gtag: Gtag }).__gtag)

const HEAD_DEFAULT = [
  'consent',
  'default',
  { ...GOOGLE_HEAD_SIGNALS, wait_for_update: WAIT_FOR_UPDATE },
]

/** Asserts one granted update within `wait_for_update` and no `default` after it. */
async function expectTimelyGrant(page: Page): Promise<void> {
  const { seen, later } = await gtag(page)
  expect(seen).toEqual([HEAD_DEFAULT])

  const updates = later.filter(({ value }) => value[0] === 'consent' && value[1] === 'update')
  expect(updates.map(({ value }) => (value[2] as Record<string, string>).analytics_storage)).toEqual([
    'granted',
  ])
  expect(updates[0].ms).toBeLessThan(WAIT_FOR_UPDATE)

  const firstUpdate = later.indexOf(updates[0])
  expect(later.slice(firstUpdate).filter(({ value }) => value[1] === 'default')).toEqual([])
}

test('S-L1 the head default is the only dataLayer entry gtag.js finds', async ({ page }) => {
  await page.goto(URL)
  await ready(page)

  const { seen, later } = await gtag(page)
  expect(seen).toEqual([HEAD_DEFAULT])
  expect(later.map(({ value }) => value[1])).toEqual(['default'])
})

test('S-G5 returning accepted: granted update within 500 ms of gtag.js', async ({ page }) => {
  await page.goto(URL)
  await ready(page)
  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()

  await page.reload()
  await ready(page)

  await expectTimelyGrant(page)
})

test('S-G5 fresh opt-out: granted update within 500 ms of gtag.js', async ({ page }) => {
  await page.goto(URL + '?mode=opt-out')
  await ready(page)

  await expectTimelyGrant(page)
})
