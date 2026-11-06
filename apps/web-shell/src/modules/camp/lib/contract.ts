import type { ContractStatus, PaymentTerm } from '../api/contract-types'

type CatalogNames = {
  nameMn: string
  nameEn: string | null
  nameZh: string | null
}

export function contractCatalogName(entry: CatalogNames, language: string): string {
  const preferred = language.toLowerCase().startsWith('zh')
    ? entry.nameZh
    : language.toLowerCase().startsWith('en')
      ? entry.nameEn
      : entry.nameMn
  return preferred || entry.nameMn || entry.nameEn || entry.nameZh || ''
}

export function contractStatusTone(status: ContractStatus): 'yellow' | 'green' | 'gray' {
  if (status === 'ACTIVE') return 'green'
  if (status === 'DRAFT') return 'yellow'
  return 'gray'
}

export function paymentTermsPercentTotal(terms: PaymentTerm[]): number {
  return Math.round(terms.reduce((total, term) => total + term.percent, 0) * 100) / 100
}

export function isWithinDateRange(date: string, startDate: string, endDate: string | null): boolean {
  const isDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  return isDate(date) &&
    isDate(startDate) &&
    date >= startDate &&
    (endDate === null || (isDate(endDate) && date <= endDate))
}
