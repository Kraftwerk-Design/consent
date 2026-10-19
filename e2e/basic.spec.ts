import type { Page } from '@playwright/test'
import { test, expect, navigations, runs, unloads } from './recorder'

const URL = '/e2e/site/basic.html'

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

const consentCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === 'e2e_consent')

const gaCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === '_ga')

const has = (page: Page) => page.evaluate(() => window.KDConsent!.has())

const signalGpc = (page: Page) =>
  page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }),
  )

const setGa = (page: Page) =>
  page.context().addCookies([{ name: '_ga', value: 'GA1.1.e2e', url: 'http://localhost:4173' }])

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

test('S-D5 under GPC, Accept all in the banner releases nothing, across reloads', async ({ page }) => {
  await signalGpc(page)
  await page.goto(URL)
  await ready(page)

  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()

  expect(await consentCookie(page)).toBeDefined()
  expect(await runs(page, 'analytics')).toBe(0)
  expect(await has(page)).toBe(false)

  await page.reload()
  await ready(page)

  expect(await runs(page, 'analytics')).toBe(0)
  expect(await has(page)).toBe(false)
})

test('S-D5b S-D7 under GPC, data-cc="accept-all" and acceptCategory() release nothing', async ({ page }) => {
  await signalGpc(page)
  await page.goto(URL)
  await ready(page)

  await page.locator('#page-accept-all').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()
  await page.addScriptTag({
    type: 'module',
    content: `import { acceptCategory } from 'vanilla-cookieconsent'
      acceptCategory('analytics')
      window.accepted = true`,
  })
  await page.waitForFunction(() => (window as unknown as { accepted?: boolean }).accepted)

  expect(await runs(page, 'analytics')).toBe(0)
  expect(await has(page)).toBe(false)
})

test('S-D3 a returning accepted visitor who now sends GPC: analytics never runs, its cookies are erased', async ({
  page,
}) => {
  await page.goto(URL)
  await ready(page)
  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()
  expect(await runs(page, 'analytics')).toBe(1)

  await setGa(page)
  await signalGpc(page)
  await page.reload()
  await ready(page)

  expect(await runs(page, 'analytics')).toBe(1)
  expect(await gaCookie(page)).toBeUndefined()
  expect(await has(page)).toBe(false)
})

test('S-E1 S-E3 GPC override: the banner offers Keep off; opting in releases analytics and sticks', async ({
  page,
}) => {
  await signalGpc(page)
  await page.goto(URL + '?gpcOverride=1')
  await ready(page)

  await expect(page.locator('#cc-main .cm [data-role="necessary"]')).toHaveText('Keep off')
  expect(await runs(page, 'analytics')).toBe(0)
  expect(await has(page)).toBe(false)

  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()

  expect(await runs(page, 'analytics')).toBe(1)
  expect(await has(page)).toBe(true)

  await page.reload()
  await ready(page)

  expect(await runs(page, 'analytics')).toBe(2)
  await expect(page.locator('#cc-main .cm')).toBeHidden()
})

test('S-B5 withdraw under the default policy reloads once, erases autoClear cookies, analytics stays off', async ({
  page,
}) => {
  await page.goto(URL)
  await ready(page)
  await page.locator('#cc-main .cm [data-role="all"]').click()
  await expect(page.locator('#cc-main .cm')).toBeHidden()
  expect(await runs(page, 'analytics')).toBe(1)
  await setGa(page)
  const nav = await navigations(page)

  await page.evaluate(() => window.KDConsent!.prompt())
  const toggle = page.locator('#cc-main .pm input.section__toggle[value="analytics"]')
  await expect(toggle).toBeChecked()
  await page
    .locator('#cc-main .pm .section__toggle-wrapper', { has: page.locator('input[value="analytics"]') })
    .click()
  await expect(toggle).not.toBeChecked()
  const reloaded = page.waitForEvent('load')
  await page.locator('#cc-main .pm [data-role="save"]').click()
  await reloaded
  await ready(page)

  expect(await unloads(page)).toBe(1)
  expect(await navigations(page)).toBe(nav + 1)
  expect(await runs(page, 'analytics')).toBe(1)
  expect(await gaCookie(page)).toBeUndefined()
  expect(await has(page)).toBe(false)
  await expect(page.locator('#cc-main .cm')).toBeHidden()
})

test('S-J1 data-require-consent blocks the link and opens preferences until consent, then navigates', async ({
  page,
}) => {
  await page.goto(URL)
  await ready(page)
  await page.locator('#cc-main .cm [data-role="show"]').click()
  await page.locator('#cc-main .pm [data-role="necessary"]').click()
  await expect(page.locator('#cc-main .pm')).toBeHidden()

  await page.locator('#gated').click()

  expect(page.url()).not.toContain('#')
  await expect(page.locator('#cc-main .pm')).toBeVisible()

  await page.locator('#cc-main .pm [data-role="all"]').click()
  await expect(page.locator('#cc-main .pm')).toBeHidden()
  await page.locator('#gated').click()

  await expect(page).toHaveURL(/#next$/)
})
