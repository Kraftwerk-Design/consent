import { describe, it, expect } from 'vitest'
import { shouldReload, type ReloadPolicy } from './reload'
import type { ConsentSnapshot } from './snapshot'

const snap = (
  categories: Record<string, boolean>,
  overrides: Partial<ConsentSnapshot> = {},
): ConsentSnapshot => ({
  stage: 'ready',
  recorded: true,
  gpc: 'none',
  categories: { necessary: true, ...categories },
  ...overrides,
})

const UNRECORDED = snap({ analytics: false }, { recorded: false })
const REJECTED = snap({ analytics: false })
const ACCEPTED = snap({ analytics: true })

const changes: [string, ConsentSnapshot, ConsentSnapshot][] = [
  ['grant', REJECTED, ACCEPTED],
  ['withdraw', ACCEPTED, REJECTED],
  ['recorded-only', UNRECORDED, REJECTED],
  ['no change', ACCEPTED, ACCEPTED],
  ['grant one, withdraw another', snap({ a: true, b: false }), snap({ a: false, b: true })],
]

const reloadsOnChoice: Record<ReloadPolicy, string[]> = {
  never: [],
  'on-withdraw': ['withdraw', 'grant one, withdraw another'],
  'on-change': ['grant', 'withdraw', 'grant one, withdraw another'],
}

const policies = Object.keys(reloadsOnChoice) as ReloadPolicy[]

describe('shouldReload', () => {
  describe.each(policies)("'%s'", (policy) => {
    it.each(changes)('%s on choice', (name, prev, next) => {
      expect(shouldReload(prev, next, policy, 'choice')).toBe(
        reloadsOnChoice[policy].includes(name),
      )
    })

    it.each(changes)('%s on load never reloads', (_, prev, next) => {
      expect(shouldReload(prev, next, policy, 'load')).toBe(false)
    })

    // analytics: true so a withdraw or change would reload but for the stage.
    it.each(['awaiting-age', 'pending'] as const)(
      'a %s prev never reloads',
      (stage) => {
        const prev: ConsentSnapshot = {
          stage,
          recorded: true,
          gpc: 'none',
          categories: { necessary: false, analytics: true },
        }
        for (const next of [REJECTED, ACCEPTED]) {
          expect(shouldReload(prev, next, policy, 'choice')).toBe(false)
          expect(shouldReload(prev, next, policy, 'load')).toBe(false)
        }
      },
    )
  })
})
