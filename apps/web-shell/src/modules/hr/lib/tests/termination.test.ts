/**
 * v0.2.2 Блок 5 — ажлаас гаргах / дахин ажилд авах цонхны дүрэм
 */
import { describe, expect, it } from 'vitest'
import mn from '@s-project/i18n/web.mn.json'
import en from '@s-project/i18n/web.en.json'
import zh from '@s-project/i18n/web.zh.json'
import { lifecycleActions, terminationEffects, terminationFormError, TERMINATION_REASONS } from '../termination'
import { P } from '../../../camp/lib/permissions'

const TODAY = '2026-10-17'

describe('terminationFormError', () => {
  const ok = { date: TODAY, reason: 'RESIGNED' as const, note: '' }
  it('зөв маягт → null', () => {
    expect(terminationFormError(ok, TODAY)).toBeNull()
    expect(terminationFormError({ ...ok, date: '2026-01-01' }, TODAY)).toBeNull()
  })
  it('огноо: хоосон/буруу, ирээдүй', () => {
    expect(terminationFormError({ ...ok, date: '' }, TODAY)).toBe('hr.term.err.date')
    expect(terminationFormError({ ...ok, date: '2026-10-18' }, TODAY)).toBe('hr.term.err.future')
  })
  it('шалтгаан заавал; OTHER бол тайлбар (хоосон зай тооцохгүй)', () => {
    expect(terminationFormError({ ...ok, reason: '' }, TODAY)).toBe('hr.term.err.reason')
    expect(terminationFormError({ ...ok, reason: 'OTHER', note: '  ' }, TODAY)).toBe('hr.term.err.note')
    expect(terminationFormError({ ...ok, reason: 'OTHER', note: 'гэрээ' }, TODAY)).toBeNull()
  })
})

describe('lifecycleActions', () => {
  const can = { terminate: true, viewPiiLog: false }
  it('эрхгүй → юу ч үгүй', () => {
    expect(lifecycleActions({ status: 'ACTIVE', rehiredAs: null, can: { ...can, terminate: false } })).toEqual({ terminate: false, rehire: false })
  })
  it('идэвхтэй/идэвхгүй → гаргах; гарсан → дахин авах (өмнө нь аваагүй бол)', () => {
    expect(lifecycleActions({ status: 'ACTIVE', rehiredAs: null, can })).toEqual({ terminate: true, rehire: false })
    expect(lifecycleActions({ status: 'INACTIVE', rehiredAs: null, can })).toEqual({ terminate: true, rehire: false })
    expect(lifecycleActions({ status: 'TERMINATED', rehiredAs: null, can })).toEqual({ terminate: false, rehire: true })
    expect(lifecycleActions({ status: 'TERMINATED', rehiredAs: { id: 'e2', employeeCode: 'X', status: 'ACTIVE' }, can })).toEqual({ terminate: false, rehire: false })
  })
})

describe('terminationEffects', () => {
  it('кемпэд байгаа, нээлттэй өрөө, идэвхтэй хэрэглэгч → бүх мөр', () => {
    const fx = terminationEffects(
      {
        attendance: { inCampSince: '2026-10-10', movements: [] },
        rooms: [{ id: 'a', roomNo: '101', buildingName: 'B1', startDate: '2026-10-01', endDate: null }],
        user: { id: 'u', isActive: true, phone: '99112233', username: null, hasEmail: false },
      },
      TODAY,
    )
    expect(fx.map((f) => f.key)).toEqual(['hr.term.effect.departure', 'hr.term.effect.room', 'hr.term.effect.user', 'hr.term.effect.record'])
    expect(fx[1].params).toEqual({ room: 'B1 · 101' })
  })
  it('хаагдсан өрөө, нэвтрэх эрхгүй → зөвхөн бүртгэлийн мөр', () => {
    const fx = terminationEffects(
      { attendance: { inCampSince: null, movements: [] }, rooms: [{ id: 'a', roomNo: '1', buildingName: 'B', startDate: '2026-01-01', endDate: '2026-02-01' }], user: null },
      TODAY,
    )
    expect(fx.map((f) => f.key)).toEqual(['hr.term.effect.record'])
  })
})

describe('орчуулга (mn/en/zh)', () => {
  it('шалтгаан, төлөв, эрх, цонхны түлхүүр бүр 3 хэлээр', () => {
    const keys = [
      ...TERMINATION_REASONS.map((r) => `camp.enum.termination_reason.${r}`),
      'camp.enum.employee_status.TERMINATED',
      `perm.${P.EMPLOYEE_TERMINATE}`,
      'hr.term.err.date', 'hr.term.err.future', 'hr.term.err.reason', 'hr.term.err.note',
      'hr.term.effect.departure', 'hr.term.effect.room', 'hr.term.effect.user', 'hr.term.effect.record',
      ...['info', 'attendance', 'rooms', 'history', 'views'].map((k) => `hr.profile.tab.${k}`),
    ]
    for (const d of [mn, en, zh] as Record<string, string>[]) for (const k of keys) expect(d[k], k).toBeTruthy()
  })
})
