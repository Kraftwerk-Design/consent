import { test, expect, type Page } from '@playwright/test'

const URL = '/e2e/site/basic.html'

const flag = (page: Page, name: string) =>
  page.evaluate((n) => Boolean((window as never)[n]), name)

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

const consentCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === 'e2e_consent')

test('first visit shows the banner and holds analytics', async ({ page }) => {
  await page.goto(URL)
  await ready(page)

  await expect(page.locator('#cc-main .cm')).toBeVisible()
  expect(await flag(page, 'analyticsRan')).toBe(false)
  expect(await consentCookie(page)).toBeUndefined()
})

test('accept all saves consent, reloads and runs analytics', async ({ page }) => {
  await page.goto(URL)
  await ready(page)

  const reloaded = page.waitForEvent('load')
  await page.locator('#cc-main .cm [data-role="all"]').click()
  await reloaded
  await ready(page)

  expect(await flag(page, 'analyticsRan')).toBe(true)
  expect(await consentCookie(page)).toBeDefined()
  await expect(page.locator('#cc-main .cm')).toBeHidden()
})

test('reject keeps analytics blocked across reloads', async ({ page }) => {
  await page.goto(URL)
  await ready(page)

  await page.locator('#cc-main .cm [data-role="show"]').click()
  const reloaded = page.waitForEvent('load')
  await page.locator('#cc-main .pm [data-role="necessary"]').click()
  await reloaded
  await ready(page)

  expect(await flag(page, 'analyticsRan')).toBe(false)
  expect(await consentCookie(page)).toBeDefined()
  await expect(page.locator('#cc-main .cm')).toBeHidden()
})

test('a GPC signal records necessary-only consent and holds analytics', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }),
  )
  await page.goto(URL)
  await ready(page)

  await expect(page.locator('#cc-main .cm [data-role="all"]')).toHaveCount(0)
  expect(await flag(page, 'analyticsRan')).toBe(false)
  expect(await page.evaluate(() => window.KDConsent!.hasConsent())).toBe(false)
  expect(decodeURIComponent((await consentCookie(page))!.value)).toContain(
    '"categories":["necessary"]',
  )
})

test('a GPC signal locks the clamped preference toggle off', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }),
  )
  await page.goto(URL)
  await ready(page)

  await page.locator('#cc-main .cm [data-role="show"]').click()
  const toggle = page.locator('#cc-main .pm input.section__toggle[value="analytics"]')
  await expect(toggle).toBeDisabled()
  await expect(toggle).not.toBeChecked()
})

test('a GPC signal from a bot does not break init', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true })
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => true })
  })
  await page.goto(URL)
  await ready(page)

  expect(errors).toEqual([])
  expect(await flag(page, 'analyticsRan')).toBe(false)
})
