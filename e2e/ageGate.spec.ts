import type { Page } from '@playwright/test'
import { test, expect, runs, consentCommands, navigations, unloads } from './recorder'

const URL = '/e2e/site/age-gate.html'

const flag = (page: Page, name: string) =>
  page.evaluate((n) => Boolean((window as never)[n]), name)

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

test('S-F8 holds the whole consent stack until the gate passes', async ({ page, thirdParty }) => {
  await page.goto(URL)

  await expect(page.locator('#age-gate')).toBeVisible()
  await expect(page.locator('#cc-main')).toHaveCount(0)
  expect(await runs(page, 'necessary')).toBe(0)
  expect(await runs(page, 'analytics')).toBe(0)
  expect(await page.evaluate(() => window.KDConsent!.has('necessary'))).toBe(false)
  expect(thirdParty).toEqual([])

  const commands = await consentCommands(page)
  expect(commands).toHaveLength(1)
  expect(commands[0].value).toEqual([
    'consent',
    'default',
    expect.objectContaining({ analytics_storage: 'denied', security_storage: 'granted' }),
  ])
})

test('S-F2 passing the gate writes the cookie and shows the banner', async ({ page }) => {
  await page.goto(URL)
  await page.locator('#age-yes').click()
  await ready(page)

  await expect(page.locator('#age-gate')).toBeHidden()
  await expect(page.locator('#cc-main .cm')).toBeVisible()
  expect(await runs(page, 'necessary')).toBe(0)
  expect(await runs(page, 'analytics')).toBe(0)

  const cookie = (await page.context().cookies()).find((c) => c.name === 'e2e_age_verified')
  expect(cookie?.value).toBe('1')
  const days = (cookie!.expires - Date.now() / 1000) / 86400
  expect(days).toBeGreaterThan(29.9)
  expect(days).toBeLessThanOrEqual(30)
})

test('S-F3 a returning verified visitor never sees the gate (exported head snippet)', async ({ page, context }) => {
  await context.addCookies([
    { name: 'e2e_age_verified', value: '1', url: 'http://localhost:4173' },
  ])
  await page.goto(URL)
  await ready(page)

  expect(await flag(page, 'gateShownAtParse')).toBe(false)
  await expect(page.locator('#age-gate')).toBeHidden()
  await expect(page.locator('#cc-main .cm')).toBeVisible()
})

test('accepting after the gate releases scripts once without reloading and keeps the gate passed', async ({ page }) => {
  await page.goto(URL)
  await page.locator('#age-yes').click()
  await ready(page)
  const nav = await navigations(page)

  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()

  expect(await unloads(page)).toBe(0)
  expect(await navigations(page)).toBe(nav)
  expect(await runs(page, 'necessary')).toBe(1)
  expect(await runs(page, 'analytics')).toBe(1)

  await page.reload()
  await ready(page)

  expect(await flag(page, 'gateShownAtParse')).toBe(false)
  expect(await runs(page, 'necessary')).toBe(2)
  expect(await runs(page, 'analytics')).toBe(2)
  await expect(page.locator('#cc-main .cm')).toBeHidden()
})
