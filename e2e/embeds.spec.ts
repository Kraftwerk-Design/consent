import type { Page } from '@playwright/test'
import { test, expect } from './recorder'

const URL = '/e2e/site/embeds.html'

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

const content = '[data-consent-embed-content]'

test('S-K15 router-style move leaves exactly one content node', async ({ page }) => {
  await page.goto(URL)
  await ready(page)
  await expect(page.locator(content)).toHaveCount(1)

  await page.click('[data-action="router-move"]')

  await expect(page.locator('#next #map')).toHaveCount(1)
  await expect(page.locator(content)).toHaveCount(1)
  await expect(page.locator('#map')).toHaveAttribute('state', 'active')
})

test('S-K15 body-snapshot swap after withdrawal leaves zero iframes', async ({ page }) => {
  await page.goto(URL)
  await ready(page)
  await expect(page.locator('consent-embed iframe, consent-pour iframe')).toHaveCount(2)

  await page.click('[data-action="snapshot"]')
  await page.locator('#cc-main .cm [data-role="show"]').click()
  await page.locator('#cc-main .pm [data-role="necessary"]').click()
  await expect(page.locator('iframe')).toHaveCount(0)

  await page.click('[data-action="restore"]')

  await expect(page.locator('#map')).toHaveAttribute('state', 'blocked')
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.locator('#map [data-poster]')).toBeVisible()
})

test('same-task move keeps the mount; an active clone mounts only its own copy', async ({ page }) => {
  await page.goto(URL)
  await ready(page)
  await page.locator(content).evaluate((node) => node.setAttribute('data-original', ''))

  await page.click('[data-action="move"]')
  await expect(page.locator('#side #map [data-original]')).toHaveCount(1)

  await page.click('[data-action="clone"]')
  await expect(page.locator('#side consent-embed')).toHaveCount(2)
  await expect(page.locator(content)).toHaveCount(2)
  await expect(page.locator('[data-original]')).toHaveCount(1)
})
