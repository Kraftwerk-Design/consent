type PlainObject = Record<string, unknown>

function isPlainObject(value: unknown): value is PlainObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

/**
 * Deep-merge `override` onto `base`, returning a new object.
 *
 * - Plain objects merge recursively.
 * - Arrays, `RegExp`, functions, and class instances **replace** wholesale
 *   (so a project defining `categories`/`autoClearCookies` replaces the default
 *   set rather than concatenating).
 * - `undefined` values in `override` are skipped (they never clobber a default).
 */
export function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result: PlainObject = { ...(base as PlainObject) }
  const source = override as PlainObject

  for (const key of Object.keys(source)) {
    const overrideValue = source[key]
    if (overrideValue === undefined) continue

    const baseValue = (base as PlainObject)[key]
    result[key] =
      isPlainObject(baseValue) && isPlainObject(overrideValue)
        ? deepMerge(baseValue, overrideValue)
        : overrideValue
  }

  return result as T
}
