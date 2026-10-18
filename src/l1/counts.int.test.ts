import { describe, it, expect, beforeEach } from 'vitest'
import { reset } from './harness'
import * as s from './scenarios'

beforeEach(() => reset())

const counts = async (scenario: () => Promise<s.Started>) => {
  const { reloads: _, ...rest } = s.tally(await scenario())
  return rest
}

describe('count table: consent:change, GCM update, fbq consent, analytics runs', () => {
  it('fresh opt-in, load', async () => {
    expect(await counts(s.freshOptInLoad)).toEqual({ events: 1, gcm: [], fbq: [], runs: 0 })
  })

  it('fresh opt-in, Accept all', async () => {
    expect(await counts(s.freshOptInAcceptAll)).toEqual({
      events: 2,
      gcm: ['granted'],
      fbq: ['grant'],
      runs: 1,
    })
  })

  it('fresh opt-in, reject', async () => {
    expect(await counts(s.freshOptInReject)).toEqual({ events: 2, gcm: [], fbq: [], runs: 0 })
  })

  it('returning-accepted, opt-in load', async () => {
    expect(await counts(s.returningAcceptedOptInLoad)).toEqual({
      events: 1,
      gcm: ['granted'],
      fbq: ['grant'],
      runs: 1,
    })
  })

  it('returning-rejected, opt-in load', async () => {
    expect(await counts(s.returningRejectedOptInLoad)).toEqual({
      events: 1,
      gcm: [],
      fbq: [],
      runs: 0,
    })
  })

  it('returning-accepted, withdraw + save', async () => {
    expect(await counts(s.returningAcceptedWithdraw)).toEqual({
      events: 2,
      gcm: ['granted', 'denied'],
      fbq: ['grant', 'revoke'],
      runs: 1,
    })
  })

  it('fresh opt-out, load', async () => {
    expect(await counts(s.freshOptOutLoad)).toEqual({
      events: 1,
      gcm: ['granted'],
      fbq: ['grant'],
      runs: 1,
    })
  })

  it('fresh opt-out, Accept all (= defaults)', async () => {
    expect(await counts(s.freshOptOutAcceptAll)).toEqual({
      events: 2,
      gcm: ['granted'],
      fbq: ['grant'],
      runs: 1,
    })
  })

  it('fresh opt-out, reject', async () => {
    expect(await counts(s.freshOptOutReject)).toEqual({
      events: 2,
      gcm: ['granted', 'denied'],
      fbq: ['grant', 'revoke'],
      runs: 1,
    })
  })

  it('fresh GPC lock (opt-in), load', async () => {
    expect(await counts(s.freshGpcLockLoad)).toEqual({ events: 1, gcm: [], fbq: [], runs: 0 })
  })

  it('age gate, before confirmAge()', async () => {
    expect(await counts(s.ageGateBeforeConfirm)).toEqual({ events: 0, gcm: [], fbq: [], runs: 0 })
  })

  it('age gate, confirmAge() (fresh opt-in)', async () => {
    expect(await counts(s.ageGateConfirm)).toEqual({ events: 1, gcm: [], fbq: [], runs: 0 })
  })
})
