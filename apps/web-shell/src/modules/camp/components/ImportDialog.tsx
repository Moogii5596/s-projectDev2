import { useMemo, useRef, useState, type ClipboardEvent } from 'react'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import type { DataImportPreview, DataImportResult, DataImportType, ExportType } from '../api/types'
import { downloadBlob } from '../lib/download'
import { parseTsv, emptyGrid, gridToRows, pasteInto } from '../lib/grid'
import { Badge, Button, ErrorBox, Modal } from './ui'

/**
 * v0.2.0 §0.5 — Нийтлэг импорт: "Excel оруулах" ЭСВЭЛ "Хүснэгтээр оруулах" (Excel-ээс хуулж Ctrl+V) →
 * урьдчилсан харагдац (шинэ / шинэчлэх / өөрчлөлтгүй / алдаатай) → баталгаажуулах.
 * Баганын түлхүүр backend-ийн TableSpec-тэй ижил (employees.handler.ts, departments.handler.ts).
 */
export interface GridColumn {
  key: string
  /** Орчуулгын түлхүүр */
  label: string
  required?: boolean
  width?: string
}

const OP_TONE = { create: 'green', update: 'blue', unchanged: 'gray', error: 'red' } as const

export default function ImportDialog({
  campId,
  type,
  title,
  columns,
  invalidate,
  onClose,
}: {
  campId: string
  type: DataImportType
  title: string
  columns: GridColumn[]
  invalidate: QueryKey[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'excel' | 'grid'>('excel')
  const [grid, setGrid] = useState<string[][]>(() => emptyGrid(5, columns.length))
  const [preview, setPreview] = useState<DataImportPreview | null>(null)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [skipErrors, setSkipErrors] = useState(true)
  const [result, setResult] = useState<DataImportResult | null>(null)

  const template = useMutation({
    mutationFn: () => campApi.dataTemplate(campId, type),
    onSuccess: (blob) => downloadBlob(blob, `${type}-template.xlsx`),
  })
  const upload = useMutation({
    mutationFn: (input: File | Record<string, unknown>[]) =>
      input instanceof File ? campApi.dataUploadXlsx(campId, type, input) : campApi.dataUploadRows(campId, type, input),
    onSuccess: (p) => {
      setPreview(p)
      setOnlyErrors(false)
    },
  })
  const confirm = useMutation({
    mutationFn: () => campApi.dataConfirm(campId, type, preview!.import.id, skipErrors),
    onSuccess: (r) => {
      setResult(r)
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: k })
    },
  })
  const cancel = useMutation({ mutationFn: () => campApi.dataCancel(campId, type, preview!.import.id), onSuccess: () => setPreview(null) })

  const labels = useMemo(() => columns.map((c) => t(c.label)), [columns, t])
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return // нэг нүд — энгийн paste
    e.preventDefault()
    setGrid((g) => pasteInto(g, parseTsv(text), r, c, labels))
  }

  const rows = preview?.rows.filter((r) => !onlyErrors || r.op === 'error') ?? []
  const h = preview?.import
  const applicable = h ? h.createRows + h.updateRows : 0

  return (
    <Modal title={title} onClose={onClose} wide>
      {result ? (
        <div className="space-y-3">
          <div role="status" className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            {t('camp.import.done', { created: result.created, updated: result.updated, skipped: result.skipped, unchanged: result.unchanged })}
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>{t('camp.common.close')}</Button>
          </div>
        </div>
      ) : !preview ? (
        <div className="space-y-3">
          <div role="tablist" className="flex gap-1 border-b border-gray-200">
            {(['excel', 'grid'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px ${mode === m ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-600'}`}
              >
                {t(`camp.import.mode.${m}`)}
              </button>
            ))}
          </div>
          {mode === 'excel' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">{t('camp.import.excel_help')}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => template.mutate()} loading={template.isPending}>
                  {t('camp.import.template')}
                </Button>
                <Button onClick={() => fileRef.current?.click()} loading={upload.isPending}>
                  {t('camp.import.choose_file')}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  aria-label={t('camp.import.choose_file')}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) upload.mutate(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">{t('camp.import.grid_help')}</p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="text-sm min-w-full">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-2 py-1 w-8">#</th>
                      {columns.map((c, i) => (
                        <th key={c.key} scope="col" className={`px-2 py-1 text-left font-medium whitespace-nowrap ${c.width ?? ''}`}>
                          {labels[i]}
                          {c.required && <span className="text-red-500"> *</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.map((row, r) => (
                      <tr key={r} className="border-t border-gray-100">
                        <td className="px-2 text-xs text-gray-400">{r + 1}</td>
                        {columns.map((c, ci) => (
                          <td key={c.key} className="p-0">
                            <input
                              aria-label={`${labels[ci]} ${r + 1}`}
                              className="w-full min-w-[7rem] px-2 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-blue-200"
                              value={row[ci] ?? ''}
                              onPaste={(e) => onPaste(e, r, ci)}
                              onChange={(e) => setGrid((g) => g.map((x, i) => (i === r ? x.map((v, j) => (j === ci ? e.target.value : v)) : x)))}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setGrid((g) => [...g, ...emptyGrid(5, columns.length)])}>
                  {t('camp.import.add_rows')}
                </Button>
                <Button onClick={() => upload.mutate(gridToRows(grid, columns.map((c) => c.key)))} loading={upload.isPending}>
                  {t('camp.import.check')}
                </Button>
              </div>
            </div>
          )}
          <ErrorBox error={upload.error ?? template.error} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="green">{t('camp.import.count.create', { n: h!.createRows })}</Badge>
            <Badge tone="blue">{t('camp.import.count.update', { n: h!.updateRows })}</Badge>
            <Badge>{t('camp.import.count.unchanged', { n: h!.unchangedRows })}</Badge>
            <Badge tone="red">{t('camp.import.count.error', { n: h!.errorRows })}</Badge>
            {h!.errorRows > 0 && (
              <label className="inline-flex items-center gap-1 ml-auto text-gray-600">
                <input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} /> {t('camp.import.only_errors')}
              </label>
            )}
          </div>
          <div className="max-h-[50vh] overflow-auto border border-gray-200 rounded-lg">
            <table className="text-sm min-w-full">
              <thead className="bg-gray-50 text-gray-600 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">{t('camp.common.status')}</th>
                  {columns.map((c, i) => (
                    <th key={c.key} className="px-2 py-1 text-left whitespace-nowrap">
                      {labels[i]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={`border-t border-gray-100 align-top ${r.op === 'error' ? 'bg-red-50' : r.op === 'update' ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-2 py-1 text-gray-400">{r.row}</td>
                    <td className="px-2 py-1">
                      <Badge tone={OP_TONE[r.op]}>{r.opLabel}</Badge>
                    </td>
                    {columns.map((c) => {
                      const err = r.errors.find((e) => e.column === c.key)
                      const ch = r.changes[c.key]
                      const v = r.values[c.key]
                      return (
                        <td key={c.key} className={`px-2 py-1 whitespace-nowrap ${err ? 'outline outline-2 -outline-offset-2 outline-red-400' : ''}`} title={err?.message}>
                          {ch ? (
                            <>
                              <s className="text-gray-400">{String(ch.from ?? '—')}</s> {String(ch.to ?? '—')}
                            </>
                          ) : v === undefined || v === null ? (
                            ''
                          ) : (
                            String(v)
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.some((r) => r.errors.length > 0) && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 space-y-0.5 max-h-40 overflow-auto">
              {preview.rows
                .filter((r) => r.errors.length > 0)
                .map((r) => (
                  <div key={r.row}>
                    <b>{t('camp.i18n.row', { row: r.row })}:</b> {r.errors.map((e) => (e.columnLabel ? `${e.columnLabel} — ${e.message}` : e.message)).join(' · ')}
                  </div>
                ))}
            </div>
          )}
          <ErrorBox error={confirm.error ?? cancel.error} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {h!.errorRows > 0 && (
              <label className="inline-flex items-center gap-2 text-sm mr-auto">
                <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} /> {t('camp.import.skip_errors')}
              </label>
            )}
            <Button variant="secondary" onClick={() => cancel.mutate()} loading={cancel.isPending}>
              {t('camp.import.back')}
            </Button>
            <Button onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={applicable === 0 || (h!.errorRows > 0 && !skipErrors)}>
              {t('camp.import.confirm', { n: applicable })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Экспорт товч: импортын форматтай Excel (хэрэглэгчийн хэлээр) */
export function ExportButton({ campId, type }: { campId: string; type: ExportType }) {
  const { t } = useTranslation()
  const m = useMutation({
    mutationFn: () => campApi.exportFile(campId, type),
    onSuccess: ({ blob, fileName }) => downloadBlob(blob, fileName),
  })
  return (
    <Button variant="secondary" size="sm" onClick={() => m.mutate()} loading={m.isPending} title={m.error ? String((m.error as Error).message) : undefined}>
      {t('camp.import.export')}
    </Button>
  )
}
