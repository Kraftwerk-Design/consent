import type { Page } from '@playwright/test'
import { test, expect, runs, consentCommands, events, navigations, unloads } from './recorder'

const URL = '/e2e/site/age-gate.html'

const flag = (page: Page, name: string) =>
  page.evaluate((n) => Boolean((window as never)[n]), name)

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

const has = (page: Page, category: string) =>
  page.evaluate((c) => window.KDConsent!.has(c), category)

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

test('S-F1 a returning consented visitor without the age cookie runs nothing until the gate passes', async ({
  page,
  context,
}) => {
  await page.goto(URL)
  await page.locator('#age-yes').click()
  await ready(page)
  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#map')).toHaveAttribute('state', 'active')
  expect(await runs(page, 'analytics')).toBe(1)

  await context.clearCookies({ name: 'e2e_age_verified' })
  await page.reload()
  const nav = await navigations(page)

  await expect(page.locator('#age-gate')).toBeVisible()
  await expect(page.locator('#cc-main')).toHaveCount(0)
  await expect(page.locator('#map')).toHaveAttribute('state', 'blocked')
  await expect(page.locator('#map iframe')).toHaveCount(0)
  expect(await runs(page, 'necessary')).toBe(1)
  expect(await runs(page, 'analytics')).toBe(1)
  expect(await has(page, 'analytics')).toBe(false)
  expect((await events(page)).filter((e) => e.nav === nav)).toEqual([])
  expect(
    (await consentCommands(page)).filter((c) => c.nav === nav).map((c) => c.value[1]),
  ).toEqual(['default'])

  await page.locator('#age-yes').click()
  await ready(page)

  await expect(page.locator('#map')).toHaveAttribute('state', 'active')
  await expect(page.locator('#cc-main .cm')).toBeHidden()
  expect(await runs(page, 'necessary')).toBe(2)
  expect(await runs(page, 'analytics')).toBe(2)
})

test('opt-out: the gate holds the defaults and gated elements, then releases them at once', async ({ page }) => {
  await page.goto(URL + '?mode=opt-out')

  await expect(page.locator('#age-gate')).toBeVisible()
  await expect(page.locator('#map')).toHaveAttribute('state', 'blocked')
  await expect(page.locator('#map iframe')).toHaveCount(0)
  expect(await runs(page, 'necessary')).toBe(0)
  expect(await runs(page, 'analytics')).toBe(0)
  expect(await has(page, 'analytics')).toBe(false)
  expect(await events(page)).toEqual([])

  await page.locator('#age-yes').click()
  await ready(page)

  await expect(page.locator('#map')).toHaveAttribute('state', 'active')
  await expect(page.locator('#map iframe')).toHaveCount(1)
  expect(await runs(page, 'necessary')).toBe(1)
  expect(await runs(page, 'analytics')).toBe(1)
  expect(await has(page, 'analytics')).toBe(true)
})

test('data-require-consent blocks the click while the gate is open and opens nothing', async ({ page }) => {
  await page.goto(URL)

  await page.locator('#gated').click()
  expect(page.url()).not.toContain('#')
  await expect(page.locator('#cc-main')).toHaveCount(0)

  await page.locator('#age-yes').click()
  await ready(page)
  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()

  await page.locator('#gated').click()
  await expect(page).toHaveURL(/#next$/)
})
