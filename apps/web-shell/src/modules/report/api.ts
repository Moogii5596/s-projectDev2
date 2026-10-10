import apiClient from '../../api/client'

/** Phase 6.0.4 — `/api/v1/reports` (backend: ReportService.ReportSummary) */
export interface ReportSummary {
  generatedAt: string
  requisitions: { total: number; totalAmount: string; byStatus: Record<string, { count: number; amount: string }> }
  budget: {
    enforced: boolean
    allocations: { department: string; period: string; total: string; committed: string; spent: string; utilizationPct: number }[]
  }
  inventory: { items: number; lowStock: number }
  vendors: { total: number; active: number }
}

export async function getReportSummary(): Promise<ReportSummary> {
  const { data } = await apiClient.get<ReportSummary>('/api/v1/reports/summary')
  return data
}

/**
 * CSV-г axios-оор (Authorization header-тэй) blob болгон татна — энгийн `<a href>` token дамжуулдаггүй.
 */
export async function downloadReportCsv(): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/api/v1/reports/summary.csv', { responseType: 'blob' })
  return data
}
