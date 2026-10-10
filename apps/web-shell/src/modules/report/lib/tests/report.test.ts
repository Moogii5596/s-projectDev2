import { describe, expect, it } from 'vitest'
import { canWrite } from '../../../../lib/roles'
import { barWidth, csvFileName, sortStatuses, statusLabel, utilizationTone } from '../report'

describe('report lib', () => {
  it('statusLabel: backend-ийн 6 статус монголоор; мэдэгдэхгүй → өөрөө', () => {
    expect(statusLabel('PROVISIONALLY_APPROVED')).toBe('Түр батлагдсан')
    expect(statusLabel('CANCELLED')).toBe('Цуцлагдсан')
    expect(statusLabel('NEW_STATUS')).toBe('NEW_STATUS')
  })

  it('sortStatuses: урсгалын дарааллаар, мэдэгдэхгүй нь төгсгөлд', () => {
    const order = sortStatuses({ REJECTED: 1, ZZZ: 1, DRAFT: 1, APPROVED: 1, AAA: 1 }).map(([s]) => s)
    expect(order).toEqual(['DRAFT', 'APPROVED', 'REJECTED', 'AAA', 'ZZZ'])
  })

  it('utilizationTone / barWidth: 80% шар, 100% улаан; өргөн 0–100', () => {
    expect(utilizationTone(79.9)).toBe('green')
    expect(utilizationTone(80)).toBe('yellow')
    expect(utilizationTone(100)).toBe('red')
    expect(barWidth(135.5)).toBe(100)
    expect(barWidth(-3)).toBe(0)
    expect(barWidth(Number.NaN)).toBe(0)
  })

  it('csvFileName: Улаанбаатарын огноо (UTC 16:00 = UB 00:00 → дараа өдөр)', () => {
    expect(csvFileName(new Date('2026-10-10T15:59:00Z'))).toBe('s-project-summary-2026-10-10.csv')
    expect(csvFileName(new Date('2026-10-10T16:00:00Z'))).toBe('s-project-summary-2026-10-11.csv')
  })

  it('canWrite: зөвхөн OWNER/ADMIN (backend WRITE_ROLES)', () => {
    expect(canWrite('OWNER')).toBe(true)
    expect(canWrite('ADMIN')).toBe(true)
    for (const r of ['APPROVER', 'REQUESTER', 'VIEWER'] as const) expect(canWrite(r)).toBe(false)
    expect(canWrite(null)).toBe(false)
    expect(canWrite(undefined)).toBe(false)
  })
})
