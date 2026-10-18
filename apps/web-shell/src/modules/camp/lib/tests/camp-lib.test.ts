import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { daysToSegments, formatRanges, missingDays, patternProblem, segmentsToDays } from '../shift-pattern'
import { P, isSystemAdmin, makeCan, mergeRolePermissions, visiblePermissions } from '../permissions'
import { apiErrorMessage } from '../errors'
import { addDays, isoWeekday, todayUb } from '../dates'

const axiosErr = (status: number | null, data?: unknown) => {
  const e = new AxiosError('fail')
  if (status !== null) {
    e.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } }
  }
  return e
}

describe('shift-pattern', () => {
  it('мөр ↔ өдөр: Уулын хэсэг (1–7 өдөр, 8–14 шөнө) нэгтгэгдэнэ', () => {
    const days = segmentsToDays([{ dayFrom: 1, dayTo: 7, shift: 'DAY' }, { dayFrom: 8, dayTo: 14, shift: 'NIGHT' }], 14)
    expect(days.filter((d) => d === 'DAY')).toHaveLength(7)
    expect(days[7]).toBe('NIGHT')
    expect(daysToSegments(days)).toEqual([
      { dayFrom: 1, dayTo: 7, shift: 'DAY' },
      { dayFrom: 8, dayTo: 14, shift: 'NIGHT' },
    ])
  })

  it('хөрш ижил мөрүүд нэгтгэгдэнэ, хоосон өдөр мөр тасална', () => {
    expect(daysToSegments(['DAY', 'DAY', null, 'DAY', 'NIGHT'])).toEqual([
      { dayFrom: 1, dayTo: 2, shift: 'DAY' },
      { dayFrom: 4, dayTo: 4, shift: 'DAY' },
      { dayFrom: 5, dayTo: 5, shift: 'NIGHT' },
    ])
    expect(daysToSegments([null, null])).toEqual([])
  })

  it('ростер богиноссон бол мужаас гадуурхыг тасална', () => {
    expect(segmentsToDays([{ dayFrom: 1, dayTo: 14, shift: 'DAY' }], 10)).toEqual(Array(10).fill('DAY'))
  })

  it('patternProblem: бүрэн эсвэл бүхэлдээ хоосон → OK; хэсэгчилсэн → дутуу өдрийг нэрлэнэ', () => {
    expect(patternProblem(Array(14).fill('DAY'))).toBeNull()
    expect(patternProblem(Array(14).fill(null))).toBeNull()
    const d = Array(14).fill('DAY')
    d[2] = null
    d[3] = null
    d[9] = null
    expect(missingDays(d)).toEqual([3, 4, 10])
    expect(patternProblem(d)).toContain('Дутуу өдөр: 3–4, 10')
    expect(formatRanges([5, 1, 2, 3, 7])).toBe('1–3, 5, 7')
  })
})

describe('permissions', () => {
  it('makeCan: admin бүгд; эрхүүдийн аль нэг; ачаалагдаагүй → false', () => {
    expect(makeCan(undefined)(P.MASTER_MANAGE)).toBe(false)
    expect(makeCan({ isTenantAdmin: true, permissions: [] })(P.ROLES_MANAGE)).toBe(true)
    const can = makeCan({ isTenantAdmin: false, permissions: [P.ROOM_MANAGE] })
    expect(can(P.MASTER_MANAGE)).toBe(false)
    expect(can(P.ROOM_MANAGE, P.MASTER_MANAGE)).toBe(true)
  })

  it('visiblePermissions: V2-ийг нууна; SEC-009 — camp.roles.manage (хуучирсан) нууна', () => {
    expect(visiblePermissions([{ code: 'a', availableIn: 'v1' }, { code: 'b', availableIn: 'v2' }]).map((p) => p.code)).toEqual(['a'])
    expect(visiblePermissions([{ code: 'camp.roles.manage', availableIn: 'v1' }, { code: 'a', availableIn: 'v1' }]).map((p) => p.code)).toEqual(['a'])
    expect(isSystemAdmin({ isTenantAdmin: true })).toBe(true)
    expect(isSystemAdmin({ isTenantAdmin: false })).toBe(false)
    expect(isSystemAdmin(undefined)).toBe(false)
  })

  it('mergeRolePermissions: нуугдсан V2 эрх хадгалахад хасагдахгүй; харагдах эрх сонголтоор солигдоно', () => {
    const current = [P.MEAL_ORDER, P.REPORT_VIEW, P.SHIFT_ADJUST, P.ROOM_MANAGE]
    const visible = [P.SHIFT_ADJUST, P.ROOM_MANAGE, P.ASSET_MANAGE]
    expect(mergeRolePermissions(current, visible, [P.ASSET_MANAGE, P.ROOM_MANAGE])).toEqual(
      [P.ASSET_MANAGE, P.MEAL_ORDER, P.REPORT_VIEW, P.ROOM_MANAGE].sort(),
    )
    // UI-д харагдаагүй код сонголтоор орж ирэхгүй
    expect(mergeRolePermissions([], visible, [P.HAUL_APPROVE])).toEqual([])
  })
})

describe('apiErrorMessage', () => {
  it('backend-ийн мессеж (string / validation массив) шууд', () => {
    expect(apiErrorMessage(axiosErr(409, { message: 'Ангилал "А" аль хэдийн бүртгэгдсэн' }))).toBe('Ангилал "А" аль хэдийн бүртгэгдсэн')
    expect(apiErrorMessage(axiosErr(400, { message: ['code шаардлагатай', 'name шаардлагатай'] }))).toBe('code шаардлагатай; name шаардлагатай')
  })
  it('мессежгүй: 403 / 404 / сүлжээ / бусад', () => {
    expect(apiErrorMessage(axiosErr(403, {}))).toBe('Энэ үйлдэлд эрх алга')
    expect(apiErrorMessage(axiosErr(404))).toBe('Олдсонгүй')
    expect(apiErrorMessage(axiosErr(null))).toBe('Сервертэй холбогдож чадсангүй')
    expect(apiErrorMessage(axiosErr(500, ''))).toBe('Алдаа гарлаа (500)')
    expect(apiErrorMessage(new Error('x'))).toBe('x')
    expect(apiErrorMessage(42)).toBe('Алдаа гарлаа')
  })
})

describe('dates', () => {
  it('гараг, өдөр нэмэх (UTC, сарын шилжилт)', () => {
    expect(isoWeekday('2026-10-07')).toBe(3) // Лхагва
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('todayUb: UTC 17:00 = Улаанбаатарын маргааш', () => {
    expect(todayUb(new Date('2026-10-09T17:00:00Z'))).toBe('2026-10-10')
    expect(todayUb(new Date('2026-10-09T15:59:00Z'))).toBe('2026-10-09')
  })
})
