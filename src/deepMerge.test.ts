import { describe, it, expect } from 'vitest'
import { deepMerge } from './deepMerge'

describe('deepMerge', () => {
  it('recursively merges plain objects', () => {
    const result = deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3 } } as Partial<{ a: { x: number; y: number } }>)
    expect(result).toEqual({ a: { x: 1, y: 3 } })
  })

  it('replaces arrays wholesale instead of concatenating', () => {
    const result = deepMerge({ items: [1, 2, 3] }, { items: [9] })
    expect(result).toEqual({ items: [9] })
  })

  it('skips undefined overrides so they never clobber a default', () => {
    const result = deepMerge({ a: 1 }, { a: undefined })
    expect(result).toEqual({ a: 1 })
  })
})
