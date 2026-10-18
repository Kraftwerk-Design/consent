import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveConfig } from '../config'
import type { ConsentIntegration } from '../config.default'
import type { ConsentSnapshot } from '../core/snapshot'

type Mode = 'opt-in' | 'opt-out'
type Calls = unknown[][]

/** Vendor commands for the mapped categories, `necessary` always granted. */
export interface SignalAdapterExpectations {
  init: Calls
  /** First apply (`prev = null`) of a denied snapshot. */
  denied: Calls
  /** First apply (`prev = null`) of a granted snapshot. */
  granted: Calls
  /** Granted → denied. */
  withdraw: Calls
  /** Denied → granted. */
  regrant: Calls
}

export interface SignalAdapterSpec {
  name: string
  /** The adapter with its consent-gated signals mapped to `categories` (and readOnly ones to `necessary`). */
  create(categories: readonly string[]): ConsentIntegration
  /** Install a recording vendor global. Called before every test. */
  install(): void
  /** Remove the vendor global and anything init defined. Called after every test. */
  remove(): void
  /** Whether the vendor global is defined. */
  present(): boolean
  /** Vendor commands recorded so far. */
  calls(): Calls
  /** Whether `init` defines the global when the page has none (a queueing shim). */
  shims: boolean
  expected: Record<Mode, SignalAdapterExpectations>
}

const MODES: Mode[] = ['opt-in', 'opt-out']

const snap = (
  categories: Record<string, boolean>,
  recorded = true,
): ConsentSnapshot => ({
  stage: 'ready',
  recorded,
  gpc: 'none',
  categories: { necessary: true, ...categories },
})

/**
 * Contract every `ConsentIntegration` that signals a vendor must pass: absent
 * global safe, stub policy, deny-first `init` independent of mode, per-mode
 * mapping, OR across categories (S-G2), and no commands when nothing it maps
 * changed (first apply equal to the init baseline, recorded-only or
 * unmapped-category changes).
 */
export function describeSignalAdapter(spec: SignalAdapterSpec): void {
  const start = (mode: Mode, ids: readonly string[] = ['analytics']) => {
    const adapter = spec.create(ids)
    adapter.init?.(
      resolveConfig({
        mode,
        categories: [
          { id: 'necessary', enabled: true, readOnly: true },
          ...ids.map((id) => ({ id, enabled: mode === 'opt-out' })),
        ],
      }),
    )
    return adapter
  }
  const during = (fn: () => void): Calls => {
    const before = spec.calls().length
    fn()
    return spec.calls().slice(before)
  }

  const GRANTED = snap({ analytics: true })
  const DENIED = snap({ analytics: false })

  describe(`signal adapter contract: ${spec.name}`, () => {
    beforeEach(() => spec.install())
    afterEach(() => spec.remove())

    it('names the categories it reads', () => {
      expect(spec.create(['a', 'b']).categories).toEqual(expect.arrayContaining(['a', 'b']))
    })

    it(`absent vendor global: never throws; ${spec.shims ? 'defines a shim' : 'defines no stub'}`, () => {
      spec.remove()
      expect(() => {
        const adapter = start('opt-out')
        adapter.apply(GRANTED, null)
        adapter.apply(DENIED, GRANTED)
      }).not.toThrow()
      expect(spec.present()).toBe(spec.shims)
    })

    it('deny-first init is the same in every mode', () => {
      expect(spec.expected['opt-out'].init).toEqual(spec.expected['opt-in'].init)
      expect(spec.expected['opt-in'].init.length).toBeGreaterThan(0)
    })

    describe.each(MODES)('%s', (mode) => {
      const expected = spec.expected[mode]

      it('init sends the deny-first default', () => {
        expect(during(() => start(mode))).toEqual(expected.init)
      })

      it.each([
        ['denied', DENIED, null],
        ['granted', GRANTED, null],
        ['withdraw', DENIED, GRANTED],
        ['regrant', GRANTED, DENIED],
      ] as const)('apply: %s', (key, next, prev) => {
        const adapter = start(mode)
        expect(during(() => adapter.apply(next, prev))).toEqual(expected[key])
      })

      it.each([
        ['only a', { a: true, b: false }],
        ['only b', { a: false, b: true }],
        ['both', { a: true, b: true }],
      ])('granted if any mapped category is (%s)', (_, categories) => {
        const adapter = start(mode, ['a', 'b'])
        expect(during(() => adapter.apply(snap(categories), null))).toEqual(expected.granted)
      })

      it('denied when no mapped category is granted', () => {
        const adapter = start(mode, ['a', 'b'])
        expect(during(() => adapter.apply(snap({ a: false, b: false }), null))).toEqual(
          expected.denied,
        )
      })

      it('nothing when only `recorded` changes', () => {
        const adapter = start(mode)
        expect(
          during(() => {
            adapter.apply(GRANTED, snap({ analytics: true }, false))
            adapter.apply(DENIED, snap({ analytics: false }, false))
          }),
        ).toEqual([])
      })

      it('nothing when only an unmapped category changes', () => {
        const adapter = start(mode)
        expect(
          during(() => {
            adapter.apply(snap({ analytics: true, other: true }), snap({ analytics: true, other: false }))
            adapter.apply(snap({ analytics: false, other: false }), snap({ analytics: false, other: true }))
          }),
        ).toEqual([])
      })
    })

    it('opt-in: nothing when the first snapshot equals the init baseline', () => {
      const adapter = start('opt-in')
      expect(during(() => adapter.apply(DENIED, null))).toEqual([])
    })
  })
}
