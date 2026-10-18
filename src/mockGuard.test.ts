// @vitest-environment node
/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'

// Files still allowed to mock the library. Each owner removes its entries.
const LEGACY: Record<string, string> = {}

const MOCK = /\bvi(?:test)?\.(?:mock|doMock)\(\s*(?:import\(\s*)?['"`]vanilla-cookieconsent/
const sources = import.meta.glob<string>('./**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const mocking = Object.entries(sources)
  .filter(([, source]) => MOCK.test(source))
  .map(([path]) => path.slice(2))

describe('vanilla-cookieconsent mock guard', () => {
  it('only legacy files mock the library', () => {
    expect(mocking.filter((file) => !(file in LEGACY))).toEqual([])
  })

  it('the legacy list has no stale entries', () => {
    expect(Object.keys(LEGACY).filter((file) => !mocking.includes(file))).toEqual([])
  })
})
