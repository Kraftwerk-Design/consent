// @vitest-environment node
/// <reference types="vite/client" />
import { it, expect } from 'vitest'
import readme from '../README.md?raw'
import gcmDoc from '../docs/google-consent-mode.md?raw'
import ageGateFixture from '../e2e/site/age-gate.html?raw'
import modelBFixture from '../e2e/site/gcm-model-b-blitz.html?raw'
import { ageGateHeadScript } from './ageGate'
import { GOOGLE_CONSENT_DEFAULT_HEAD } from './integrations/google'

const between = (source: string, marker: string): string | undefined =>
  source.match(new RegExp(`<!-- ${marker} -->\\n([\\s\\S]*?)\\n<!-- /${marker} -->`))?.[1]

const fenced = (source: string, marker: string): string | undefined =>
  between(source, marker)?.replace(/^```html\n/, '').replace(/\n```$/, '')

it('S-L3 docs/google-consent-mode.md shows GOOGLE_CONSENT_DEFAULT_HEAD byte-for-byte', () => {
  expect(fenced(gcmDoc, 'gcm-head')).toBe(GOOGLE_CONSENT_DEFAULT_HEAD)
})

it('S-L3 the README age-gate block is ageGateHeadScript() output byte-for-byte', () => {
  expect(fenced(readme, 'age-gate-head')).toBe(ageGateHeadScript({ cookieName: 'acme_age_verified' }))
})

it('S-F3 the age-gate e2e fixture inlines ageGateHeadScript()', () => {
  expect(between(ageGateFixture, 'age-gate-head')).toBe(
    ageGateHeadScript({ cookieName: 'e2e_age_verified' }),
  )
})

it('S-L1 the Model B e2e fixture inlines GOOGLE_CONSENT_DEFAULT_HEAD', () => {
  expect(between(modelBFixture, 'gcm-head')).toBe(GOOGLE_CONSENT_DEFAULT_HEAD)
})
