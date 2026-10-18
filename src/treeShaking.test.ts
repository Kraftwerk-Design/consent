// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rolldown } from 'rolldown'

const INDEX = decodeURIComponent(new URL('./index.ts', import.meta.url).pathname)

async function bundle(entry: string): Promise<string> {
  const build = await rolldown({
    input: 'entry',
    external: ['vanilla-cookieconsent'],
    platform: 'browser',
    logLevel: 'silent',
    plugins: [
      {
        name: 'entry',
        resolveId: (id) => (id === 'entry' ? id : null),
        load: (id) => (id === 'entry' ? entry.replace('INDEX', JSON.stringify(INDEX)) : null),
      },
    ],
  })
  const { output } = await build.generate({ format: 'esm' })
  await build.close()
  return output[0].code
}

describe('tree shaking', () => {
  it('S-O3 a bundle importing only initConsent contains no Meta code', async () => {
    const code = await bundle('import { initConsent } from INDEX\ninitConsent()')
    expect(code).toContain('initConsent')
    expect(code).not.toMatch(/meta-pixel|dataProcessingOptions/)
  })

  it('keeps Meta code when metaPixel is imported', async () => {
    const code = await bundle(
      "import { initConsent, metaPixel } from INDEX\ninitConsent({ integrations: [metaPixel({ category: 'analytics' })] })",
    )
    expect(code).toMatch(/meta-pixel/)
    expect(code).toMatch(/dataProcessingOptions/)
  })
})
