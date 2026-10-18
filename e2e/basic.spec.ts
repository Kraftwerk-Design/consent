import type { Page } from '@playwright/test'
import { test, expect, navigations, runs, unloads } from './recorder'

const URL = '/e2e/site/basic.html'

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

const consentCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === 'e2e_consent')

test('first visit shows the banner and holds analytics', async ({ page }) => {
  await page.goto(URL)
  await ready(page)

  await expect(page.locator('#cc-main .cm')).toBeVisible()
  expect(await runs(page, 'analytics')).toBe(0)
  expect(await consentCookie(page)).toBeUndefined()
})

test('S-B1 accept all saves consent and runs analytics once, without reloading', async ({ page }) => {
  await page.goto(URL)
  await ready(page)
  const nav = await navigations(page)

  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()

  expect(await consentCookie(page)).toBeDefined()
  expect(await unloads(page)).toBe(0)
  expect(await navigations(page)).toBe(nav)
  expect(await runs(page, 'analytics')).toBe(1)
})

test('S-B2 reject keeps analytics blocked across reloads', async ({ page }) => {
  await page.goto(URL)
  await ready(page)
  const nav = await navigations(page)

  await page.locator('#cc-main .cm [data-role="show"]').click()
  await page.locator('#cc-main .pm [data-role="necessary"]').click()
  await expect(page.locator('#cc-main .pm')).toBeHidden()

  expect(await consentCookie(page)).toBeDefined()
  expect(await unloads(page)).toBe(0)
  expect(await navigations(page)).toBe(nav)
  expect(await runs(page, 'analytics')).toBe(0)

  await page.reload()
  await ready(page)

  expect(await navigations(page)).toBe(nav + 1)
  expect(await runs(page, 'analytics')).toBe(0)
  await expect(page.locator('#cc-main .cm')).toBeHidden()
})

test('S-M3 default policy: analytics runs once per page lifetime', async ({ page }) => {
  await page.goto(URL)
  await ready(page)
  const nav = await navigations(page)

  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()

  expect(await unloads(page)).toBe(0)
  expect(await navigations(page)).toBe(nav)
  expect(await runs(page, 'analytics')).toBe(1)

  await page.reload()
  await ready(page)

  expect(await navigations(page)).toBe(nav + 1)
  expect(await runs(page, 'analytics')).toBe(2)
})

test("S-M3 'on-change': accept runs analytics live, then again after the reload", async ({ page }) => {
  await page.goto(URL + '?reload=on-change')
  await ready(page)
  const nav = await navigations(page)

  const reloaded = page.waitForEvent('load')
  await page.locator('#cc-main .cm [data-role="all"]').click()
  await reloaded
  await ready(page)

  expect(await unloads(page)).toBe(1)
  expect(await navigations(page)).toBe(nav + 1)
  expect(await runs(page, 'analytics')).toBe(2)
})

test('a GPC signal shows the banner with a notice and records nothing', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }),
  )
  await page.goto(URL)
  await ready(page)

  await expect(page.locator('#cc-main .cm')).toBeVisible()
  await expect(page.locator('#cc-main .cm')).toContainText('Global Privacy Control')
  expect(await runs(page, 'analytics')).toBe(0)
  expect(await page.evaluate(() => window.KDConsent!.has())).toBe(false)
  expect(await consentCookie(page)).toBeUndefined()
})

test('a GPC signal renders the clamped preference section without a toggle', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }),
  )
  await page.goto(URL)
  await ready(page)

  await page.locator('#cc-main .cm [data-role="show"]').click()
  await expect(page.locator('#cc-main .pm')).toContainText('Analytics & marketing')
  await expect(page.locator('#cc-main .pm input.section__toggle[value="analytics"]')).toHaveCount(0)
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
  expect(await runs(page, 'analytics')).toBe(0)
})
