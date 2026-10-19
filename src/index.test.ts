/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest'
import readme from '../README.md?raw'
import source from './index.ts?raw'
import * as pkg from './index'

const typeExports = [...source.matchAll(/export type \{([^}]*)\}/g)].flatMap(([, names]) =>
  names.split(',').map((name) => name.trim()).filter(Boolean),
)

const exportsSection = readme.match(/^### Exports\n([\s\S]*?)(?=^---$|^##? )/m)?.[1] ?? ''

describe('public exports', () => {
  it('exports exactly the public API', () => {
    expect(Object.keys(pkg).sort()).toEqual([
      'AGE_GATE_COOKIE',
      'GOOGLE_CONSENT_DEFAULT_HEAD',
      'ageGateHeadScript',
      'attachGate',
      'confirmAge',
      'defineConsentEmbed',
      'defineConsentPour',
      'defineGatedElement',
      'googleConsentMode',
      'hasGpcSignal',
      'initConsent',
      'isAgeVerified',
      'metaPixel',
      'validateConsentConfig',
    ])
  })

  it('exports exactly the public types', () => {
    expect([...typeExports].sort()).toEqual([
      'AgeGateConfig',
      'AutoClearCookie',
      'CategoryCopy',
      'ConsentApi',
      'ConsentCategory',
      'ConsentConfig',
      'ConsentHandle',
      'ConsentIntegration',
      'ConsentListener',
      'ConsentSnapshot',
      'CopyContext',
      'GateOptions',
      'GoogleConsentMap',
      'GoogleConsentSignal',
      'GpcState',
      'Mount',
      'ReloadPolicy',
    ])
  })

  it('README Exports section names every value and type export', () => {
    expect(exportsSection).not.toBe('')
    const missing = [...Object.keys(pkg), ...typeExports].filter(
      (name) => !new RegExp(`\\b${name}\\b`).test(exportsSection),
    )
    expect(missing).toEqual([])
  })
})
