// The project has no @types/node (nothing else in src/ touches Node builtins),
// so `node:fs`/`process` have no ambient types available. vitest itself runs
// on Node and resolves these fine at runtime — only `tsc --noEmit` needs the
// nudge, since it can't find type declarations for either.
// @ts-expect-error -- no @types/node devDependency; resolves fine at runtime under vitest/Node.
import { readFileSync } from 'node:fs'
declare const process: { cwd: () => string }

import { describe, it, expect } from 'vitest'
import { configureConsent } from './config'
import { renderGoogleConsentDefaultScript } from './googleConsentMode'

const START_MARKER = '<!-- gcm-default-script:start -->'
const END_MARKER = '<!-- gcm-default-script:end -->'

/**
 * Pull the pasted `<script>` block out of the README's "Server-rendered /
 * Twig (Craft, PHP) sites" subsection: the text between the drift-guard HTML
 * comments, with the surrounding ```html fence lines and whitespace stripped.
 */
function extractReadmeGcmSnippet(): string {
  // Vitest always runs with the repo root (where README.md lives) as cwd.
  const readmePath = `${process.cwd()}/README.md`
  const readme = readFileSync(readmePath, 'utf8')

  const start = readme.indexOf(START_MARKER)
  const end = readme.indexOf(END_MARKER)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Could not find ${START_MARKER}/${END_MARKER} markers in README.md`,
    )
  }

  const between = readme.slice(start + START_MARKER.length, end).trim()

  const lines = between.split('\n')
  if (lines[0]?.trim() !== '```html' || lines[lines.length - 1]?.trim() !== '```') {
    throw new Error(
      'Expected the README gcm-default-script block to be wrapped in a ```html fence',
    )
  }

  return lines.slice(1, -1).join('\n').trim()
}

describe('README Google Consent Mode Twig snippet', () => {
  it('matches renderGoogleConsentDefaultScript() for the default config exactly', () => {
    configureConsent({ googleConsentMode: true })
    const expected = renderGoogleConsentDefaultScript()

    expect(extractReadmeGcmSnippet()).toBe(expected)
  })
})
