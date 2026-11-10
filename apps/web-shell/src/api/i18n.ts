import apiClient from './client'
import type { Lang } from '../i18n'

/** v0.2.0 §0.7 — орчуулгын API */
export interface WebMessages {
  lang: Lang
  version: string
  messages: Record<string, string>
}

export async function getWebMessages(lang: Lang): Promise<WebMessages> {
  const { data } = await apiClient.get<WebMessages>(`/api/v1/i18n/web/${lang}`)
  return data
}

export async function saveLocale(locale: Lang): Promise<void> {
  await apiClient.patch('/api/v1/i18n/me/locale', { locale })
}

interface I18nChange {
  key: string
  lang: Lang
  from: string
  to: string | null
}
interface I18nRowError {
  row: number
  key: string
  lang?: Lang
  code: string
  message: string
}
export interface I18nPreview {
  changes: I18nChange[]
  errors: I18nRowError[]
  unchanged: number
}

export async function exportTranslations(): Promise<Blob> {
  const { data } = await apiClient.get('/api/v1/i18n/admin/export', { responseType: 'blob' })
  return data as Blob
}

export async function previewTranslations(file: File): Promise<I18nPreview> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post<I18nPreview>('/api/v1/i18n/admin/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return data
}

export async function applyTranslations(changes: { key: string; lang: Lang; to: string | null }[]): Promise<{ applied: number }> {
  const { data } = await apiClient.post<{ applied: number }>('/api/v1/i18n/admin/apply', { changes })
  return data
}

export interface I18nOverrideRow {
  key: string
  lang: Lang
  text: string
  default: string | null
  updatedAt: string
}
export interface I18nCatalogRow {
  key: string
  section: 'web' | 'server' | 'term'
  defaults: Record<Lang, string>
  texts: Record<Lang, string>
}
export async function listCatalog(): Promise<I18nCatalogRow[]> {
  const { data } = await apiClient.get<I18nCatalogRow[]>('/api/v1/i18n/admin/catalog')
  return data
}

export async function listOverrides(): Promise<I18nOverrideRow[]> {
  const { data } = await apiClient.get<I18nOverrideRow[]>('/api/v1/i18n/admin/overrides')
  return data
}

export interface I18nHistoryRow {
  id: string
  key: string
  lang: Lang
  oldText: string | null
  newText: string | null
  source: 'IMPORT' | 'RESET'
  changedByName: string | null
  changedAt: string
}
export async function listHistory(key?: string): Promise<I18nHistoryRow[]> {
  const { data } = await apiClient.get<I18nHistoryRow[]>('/api/v1/i18n/admin/history', { params: key ? { key } : {} })
  return data
}
