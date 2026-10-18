import type { Page } from '@playwright/test'
import {
  test,
  expect,
  consentCommands,
  fbqCalls,
  navigations,
  runs,
  type Entry,
} from './recorder'

const URL = '/e2e/site/spa.html'

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

const gaCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === '_ga')

const updates = (entries: Entry<unknown[]>[]) =>
  entries
    .filter(({ value }) => value[1] === 'update')
    .map(({ value }) => (value[2] as Record<string, string>).analytics_storage)

test("S-P1 reload: 'never' applies accept and withdraw live, without navigating", async ({ page }) => {
  await page.goto(URL)
  await ready(page)
  const nav = await navigations(page)
  await expect(page.locator('#map')).toHaveAttribute('state', 'blocked')
  await expect(page.locator('iframe')).toHaveCount(0)

  await page.locator('#cc-main .cm [data-role="all"]').click()

  await expect(page.locator('#map')).toHaveAttribute('state', 'active')
  await expect(page.locator('#map iframe')).toHaveCount(1)
  expect(await runs(page, 'analytics')).toBe(1)
  expect(await gaCookie(page)).toBeDefined()
  expect(updates(await consentCommands(page))).toEqual(['granted'])
  expect((await fbqCalls(page)).map((e) => e.value)).toEqual([
    ['consent', 'revoke'],
    ['consent', 'grant'],
  ])

  await page.evaluate(() => window.KDConsent!.prompt())
  const toggle = page.locator('#cc-main .pm input.section__toggle[value="analytics"]')
  await expect(toggle).toBeChecked()
  await page
    .locator('#cc-main .pm .section__toggle-wrapper', { has: page.locator('input[value="analytics"]') })
    .click()
  await expect(toggle).not.toBeChecked()
  await page.locator('#cc-main .pm [data-role="save"]').click()

  await expect(page.locator('#map')).toHaveAttribute('state', 'blocked')
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.locator('#map [data-poster]')).toBeVisible()
  expect(await gaCookie(page)).toBeUndefined()
  expect(updates(await consentCommands(page))).toEqual(['granted', 'denied'])
  expect((await fbqCalls(page)).map((e) => e.value)).toEqual([
    ['consent', 'revoke'],
    ['consent', 'grant'],
    ['consent', 'revoke'],
  ])
  expect(await runs(page, 'analytics')).toBe(1)
  expect(await navigations(page)).toBe(nav)
})
