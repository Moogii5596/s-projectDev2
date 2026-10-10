import { describe, expect, it } from 'vitest'
import { formatMoney } from '../money'
import { availableActions, canEditDetails, canEditParts, type MaintenanceActor } from '../maintenance'
import { canInAnyCamp } from '../permissions'

const actor = (p: Partial<MaintenanceActor> = {}): MaintenanceActor => ({ canParts: false, canClose: false, canCreate: false, isReporter: false, ...p })

describe('formatMoney (string → float-гүй)', () => {
  it('мянгатын зай, 2 оронтой бутархай, ₮', () => {
    expect(formatMoney('1234567.5')).toBe('1 234 567.50 ₮')
    expect(formatMoney('22000.00')).toBe('22 000.00 ₮')
    expect(formatMoney('0')).toBe('0.00 ₮')
    expect(formatMoney('999')).toBe('999.00 ₮')
    expect(formatMoney('1000')).toBe('1 000.00 ₮')
    expect(formatMoney('-150.1')).toBe('-150.10 ₮')
  })
  it('float-ийн алдаагүй (их тоо, урт бутархай тасална)', () => {
    expect(formatMoney('12345678901234567.89')).toBe('12 345 678 901 234 567.89 ₮')
    expect(formatMoney('0.105')).toBe('0.10 ₮') // backend аль хэдийн 2 оронтой тоймолсон байдаг; энд тоймлохгүй
    expect(formatMoney('007')).toBe('7.00 ₮')
  })
  it('null / буруу → —; валютгүй', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney('abc')).toBe('—')
    expect(formatMoney('1.2.3')).toBe('—')
    expect(formatMoney('1500', '')).toBe('1 500.00')
  })
})

describe('maintenance.availableActions (backend maintenance-flow-тэй ижил)', () => {
  const all = actor({ canParts: true, canClose: true, canCreate: true })
  it('бүх эрхтэй: төлөв бүрийн үйлдэл', () => {
    expect(availableActions('OPEN', all)).toEqual(['start', 'cancel'])
    expect(availableActions('IN_PROGRESS', all)).toEqual(['complete', 'cancel'])
    expect(availableActions('DONE', all)).toEqual(['reopen', 'close'])
    expect(availableActions('CLOSED', all)).toEqual([])
    expect(availableActions('CANCELLED', all)).toEqual([])
  })
  it('parts эрх: эхлүүлэх/дуусгах; close эрх: дахин нээх/хаах/цуцлах', () => {
    expect(availableActions('OPEN', actor({ canParts: true }))).toEqual(['start'])
    expect(availableActions('DONE', actor({ canParts: true }))).toEqual([])
    expect(availableActions('DONE', actor({ canClose: true }))).toEqual(['reopen', 'close'])
    expect(availableActions('OPEN', actor({ canClose: true }))).toEqual(['cancel'])
  })
  it('үүсгэсэн хүн (create эрхтэй) цуцалж болно; create эрхгүй бол үгүй', () => {
    expect(availableActions('IN_PROGRESS', actor({ isReporter: true, canCreate: true }))).toEqual(['cancel'])
    expect(availableActions('IN_PROGRESS', actor({ isReporter: true }))).toEqual([])
    expect(availableActions('OPEN', actor({ canCreate: true }))).toEqual([])
  })
  it('сэлбэг: OPEN/IN_PROGRESS/DONE + parts; дэлгэрэнгүй: OPEN/IN_PROGRESS + close эсвэл үүсгэсэн хүн', () => {
    expect(canEditParts('DONE', actor({ canParts: true }))).toBe(true)
    expect(canEditParts('CLOSED', actor({ canParts: true }))).toBe(false)
    expect(canEditParts('OPEN', actor({ canClose: true }))).toBe(false)
    expect(canEditDetails('IN_PROGRESS', actor({ isReporter: true, canCreate: true }))).toBe(true)
    expect(canEditDetails('DONE', actor({ canClose: true }))).toBe(false)
    expect(canEditDetails('OPEN', actor({ canParts: true }))).toBe(false)
  })
})

describe('permissions.canInAnyCamp', () => {
  it('admin / global / аль нэг кемп', () => {
    expect(canInAnyCamp(undefined, 'camp.asset.manage')).toBe(false)
    expect(canInAnyCamp({ isTenantAdmin: true, permissions: [], byCamp: {} }, 'camp.asset.manage')).toBe(true)
    expect(canInAnyCamp({ isTenantAdmin: false, permissions: ['camp.asset.manage'], byCamp: {} }, 'camp.asset.manage')).toBe(true)
    expect(canInAnyCamp({ isTenantAdmin: false, permissions: [], byCamp: { c2: ['camp.asset.manage'] } }, 'camp.asset.manage')).toBe(true)
    expect(canInAnyCamp({ isTenantAdmin: false, permissions: [], byCamp: { c2: ['camp.room.manage'] } }, 'camp.asset.manage')).toBe(false)
  })
})
