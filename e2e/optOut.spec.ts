import type { Page } from '@playwright/test'
import {
  test,
  expect,
  consentCommands,
  events,
  fbqCalls,
  navigations,
  runs,
  type Entry,
} from './recorder'

const URL = '/e2e/site/opt-out.html'

const ready = (page: Page) =>
  page.evaluate(() => (window as unknown as { consentReady: Promise<void> }).consentReady)

type Detail = { categories: Record<string, boolean> }

const consentCookie = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === 'e2e_consent')

const onNav = <T extends { nav: number }>(entries: T[], nav: number) =>
  entries.filter((entry) => entry.nav === nav)

const updates = (entries: Entry<unknown[]>[]) =>
  entries
    .filter(({ value }) => value[1] === 'update')
    .map(({ value }) => (value[2] as Record<string, string>).analytics_storage)

test('S-C1 fresh load runs the defaults once and reports them granted', async ({ page }) => {
  await page.goto(URL)
  await ready(page)

  expect(await runs(page, 'analytics')).toBe(1)
  expect(await consentCookie(page)).toBeUndefined()
  expect(await page.evaluate(() => window.KDConsent!.has('analytics'))).toBe(true)
  expect((await events<Detail>(page)).map((e) => e.value.categories)).toEqual([
    { necessary: true, analytics: true },
  ])
  expect(updates(await consentCommands(page))).toEqual(['granted'])
  expect((await fbqCalls(page)).map((e) => e.value)).toEqual([
    ['consent', 'revoke'],
    ['consent', 'grant'],
  ])
})

test('S-C2 reject records necessary-only with one event, one denied update, LDU + revoke once', async ({ page }) => {
  await page.goto(URL)
  await ready(page)
  const nav = await navigations(page)

  const reloaded = page.waitForEvent('load')
  await page.locator('#cc-main .cm [data-role="show"]').click()
  await page.locator('#cc-main .pm [data-role="necessary"]').click()
  await reloaded

  expect(decodeURIComponent((await consentCookie(page))!.value)).toContain(
    '"categories":["necessary"]',
  )
  const loadAndReject = onNav(await events<Detail>(page), nav)
  expect(loadAndReject.map((e) => e.value.categories.analytics)).toEqual([true, false])
  expect(updates(onNav(await consentCommands(page), nav))).toEqual(['granted', 'denied'])
  expect(onNav(await fbqCalls(page), nav).map((e) => e.value)).toEqual([
    ['consent', 'revoke'],
    ['consent', 'grant'],
    ['dataProcessingOptions', ['LDU'], 0, 0],
    ['consent', 'revoke'],
  ])
})
