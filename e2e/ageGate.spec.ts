import { test, expect, type Page } from '@playwright/test'

const URL = '/e2e/site/age-gate.html'

const flag = (page: Page, name: string) =>
  page.evaluate((n) => Boolean((window as never)[n]), name)

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

test('holds the whole consent stack until the gate passes', async ({ page }) => {
  await page.goto(URL)

  await expect(page.locator('#age-gate')).toBeVisible()
  await expect(page.locator('#cc-main')).toHaveCount(0)
  expect(await flag(page, 'necessaryRan')).toBe(false)
  expect(await flag(page, 'analyticsRan')).toBe(false)
  expect(await page.evaluate(() => window.KDConsent!.hasConsent('necessary'))).toBe(false)
})

test('passing the gate writes the cookie and shows the banner', async ({ page }) => {
  await page.goto(URL)
  await page.locator('#age-yes').click()
  await ready(page)

  await expect(page.locator('#age-gate')).toBeHidden()
  await expect(page.locator('#cc-main .cm')).toBeVisible()
  expect(await flag(page, 'analyticsRan')).toBe(false)

  const cookie = (await page.context().cookies()).find((c) => c.name === 'e2e_age_verified')
  expect(cookie?.value).toBe('1')
  const days = (cookie!.expires - Date.now() / 1000) / 86400
  expect(days).toBeGreaterThan(29.9)
  expect(days).toBeLessThanOrEqual(30)
})

test('a returning verified visitor never sees the gate', async ({ page, context }) => {
  await context.addCookies([
    { name: 'e2e_age_verified', value: '1', url: 'http://localhost:4173' },
  ])
  await page.goto(URL)
  await ready(page)

  expect(await flag(page, 'gateShownAtParse')).toBe(false)
  await expect(page.locator('#age-gate')).toBeHidden()
  await expect(page.locator('#cc-main .cm')).toBeVisible()
})

test('accepting after the gate releases scripts and keeps the gate passed', async ({ page }) => {
  await page.goto(URL)
  await page.locator('#age-yes').click()
  await ready(page)

  const reloaded = page.waitForEvent('load')
  await page.locator('#cc-main .cm [data-role="all"]').click()
  await reloaded
  await ready(page)

  expect(await flag(page, 'gateShownAtParse')).toBe(false)
  expect(await flag(page, 'necessaryRan')).toBe(true)
  expect(await flag(page, 'analyticsRan')).toBe(true)
  await expect(page.locator('#cc-main .cm')).toBeHidden()
})
