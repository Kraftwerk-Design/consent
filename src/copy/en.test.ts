import { describe, it, expect, beforeEach } from 'vitest'
import { configureConsent } from '../config'
import type { GpcState } from '../core/categories'
import { buildEnglishCopy } from './en'

type Mode = 'opt-in' | 'opt-out'

function copy(gpc: GpcState, mode: Mode) {
  const language = buildEnglishCopy({ gpc, mode })!
  const { consentModal, preferencesModal } = language.translations.en as {
    consentModal: Record<string, string | undefined>
    preferencesModal: {
      acceptAllBtn?: string
      acceptNecessaryBtn?: string
      savePreferencesBtn?: string
      sections: { description?: string; linkedCategory?: string }[]
    }
  }
  return {
    banner: [consentModal.acceptAllBtn, consentModal.acceptNecessaryBtn, consentModal.showPreferencesBtn],
    bannerDescription: consentModal.description!,
    preferences: [
      preferencesModal.acceptAllBtn,
      preferencesModal.acceptNecessaryBtn,
      preferencesModal.savePreferencesBtn,
    ],
    choicesDescription: preferencesModal.sections[0].description!,
    sections: preferencesModal.sections.map((section) => section.linkedCategory).filter(Boolean),
  }
}

const PREFERENCES = ['Accept all', 'Reject non-essential', 'Save preferences']
const MODES: Mode[] = ['opt-in', 'opt-out']

beforeEach(() => {
  configureConsent({ categories: [{ id: 'necessary', readOnly: true }, { id: 'analytics' }] })
})

describe('buildEnglishCopy', () => {
  it.each(MODES)('S-N1 no GPC (%s): Accept all / Manage preferences, no GPC notice', (mode) => {
    const c = copy('none', mode)
    expect(c.banner).toEqual(['Accept all', undefined, 'Manage preferences'])
    expect(c.preferences).toEqual(PREFERENCES)
    expect(c.bannerDescription).not.toMatch(/Global Privacy Control/)
    expect(c.choicesDescription).not.toMatch(/Global Privacy Control/)
  })

  it.each(MODES)('S-N1 GPC locked (%s): normal banner with a GPC notice', (mode) => {
    const c = copy('locked', mode)
    expect(c.banner).toEqual(['Accept all', undefined, 'Manage preferences'])
    expect(c.preferences).toEqual(PREFERENCES)
    expect(c.bannerDescription).toMatch(/Global Privacy Control/)
    expect(c.choicesDescription).toMatch(/cannot be enabled/)
  })

  it.each(MODES)('S-N1 GPC default-off (%s): override banner offers Accept all / Keep off', (mode) => {
    const c = copy('default-off', mode)
    expect(c.banner).toEqual(['Accept all', 'Keep off', 'Manage preferences'])
    expect(c.preferences).toEqual(PREFERENCES)
    expect(c.bannerDescription).toMatch(/Global Privacy Control/)
    expect(c.choicesDescription).toMatch(/overrides the GPC signal/)
  })

  it.each(['none', 'locked', 'default-off'] as GpcState[])(
    'S-N1 renders a section per category, clamped included (GPC %s)',
    (gpc) => {
      expect(copy(gpc, 'opt-in').sections).toEqual(['necessary', 'analytics'])
    },
  )

  it('S-C5 preferences description is mode-aware', () => {
    expect(copy('none', 'opt-in').choicesDescription).toMatch(/only load after you opt in/)
    expect(copy('none', 'opt-out').choicesDescription).toMatch(/on by default/)
  })

  it.each(['none', 'locked', 'default-off'] as GpcState[])(
    'S-C5 opt-out copy never says tools load only after opting in (GPC %s)',
    (gpc) => {
      const c = copy(gpc, 'opt-out')
      expect(c.bannerDescription).not.toMatch(/only load after you opt in/)
      expect(c.choicesDescription).not.toMatch(/only load after you opt in/)
    },
  )
})
