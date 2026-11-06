import { describe, expect, it } from 'vitest'
import type { PaymentTerm } from '../../api/contract-types'
import { contractCatalogName, contractStatusTone, isWithinDateRange, paymentTermsPercentTotal } from '../contract'

describe('contract helpers', () => {
  it('chooses a catalog name for the active language with a useful fallback', () => {
    const names = { nameMn: 'Нэр', nameEn: 'Name', nameZh: null }
    expect(contractCatalogName(names, 'mn')).toBe('Нэр')
    expect(contractCatalogName(names, 'en-US')).toBe('Name')
    expect(contractCatalogName(names, 'zh-CN')).toBe('Нэр')
  })

  it('maps contract statuses to badge tones', () => {
    expect(contractStatusTone('DRAFT')).toBe('yellow')
    expect(contractStatusTone('ACTIVE')).toBe('green')
    expect(contractStatusTone('TERMINATED')).toBe('gray')
  })

  it('sums payment-term percentages to two decimal places', () => {
    const terms: PaymentTerm[] = [
      { percent: 30, rule: 'AFTER_INVOICE_DAYS', n: 5, note: null },
      { percent: 69.99, rule: 'AFTER_MONTHS', n: 1, note: null },
    ]
    expect(paymentTermsPercentTotal(terms)).toBe(99.99)
  })

  it('checks inclusive date ranges and rejects malformed dates', () => {
    expect(isWithinDateRange('2026-04-10', '2026-04-10', '2026-04-20')).toBe(true)
    expect(isWithinDateRange('2026-04-21', '2026-04-10', null)).toBe(true)
    expect(isWithinDateRange('2026-03-31', '2026-04-10', '2026-04-20')).toBe(false)
    expect(isWithinDateRange('not-a-date', '2026-04-10', null)).toBe(false)
    expect(isWithinDateRange('2026-02-30', '2026-02-01', null)).toBe(false)
  })
})
