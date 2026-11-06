import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { hrApi } from '../api/hr-api'
import type { ImportPreview, ImportRow, ImportRowEdit, MealType } from '../../camp/api/types'
import { campKeys } from '../../camp/hooks/useCampPermissions'
import { useCampMutation } from '../../camp/hooks/useCampMutation'
import { DIRECTION_LABEL, KIND_LABEL, MEAL_LABEL, SHIFT_LABEL } from '../../camp/lib/labels'
import { Button, Empty, ErrorBox, Table, inputSmCls, td } from '../../camp/components/ui'
import {
  type RowDraft,
  type RowFilter,
  buildEdits,
  defaultFilter,
  deleteErrorRowsEdits,
  fileName,
  filterCounts,
  filterRows,
  hasErrors,
  pickerQuery,
  rowPlace,
} from '../lib/import-rows'

/**
 * v0.2.3 Блок R4.4–R4.6 — ирцийн импортын PREVIEW хүснэгт.
 *   R4.4 хүснэгт (хуудас · мөр, файлын нэр / ID, сунгалт, анхааруулга) + шүүлт (алдаатай / анхааруулгатай / бүгд)
 *   R4.5 засварлах горим: алдаатай мөрүүд нэг дор — ажилтан сонгох / устгах → нэг PATCH
 *   R4.6 «Алдаатай бүх мөрийг устгах» (баталгаажуулалттай)
 * Эцэг нь `key={import.id}`-ээр дахин үүсгэнэ (шинэ файл → шүүлт, горим анхдагч).
 */
export default function ImportRowsTable({ campId, preview, onUpdated }: { campId: string; preview: ImportPreview; onUpdated: (p: ImportPreview) => void }) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<RowFilter>(() => defaultFilter(preview))
  const [editing, setEditing] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const save = useCampMutation((rows: ImportRowEdit[]) => hrApi.updateImportRows(campId, preview.import.id, rows), [campKeys.imports(campId)], (res) => {
    onUpdated(res)
    setEditing(false)
    setAskDelete(false)
  })
  const counts = filterCounts(preview.rows)
  const rows = filterRows(preview.rows, filter)

  if (editing) {
    return <EditErrorRows campId={campId} rows={preview.rows.filter(hasErrors)} saving={save.isPending} error={save.error} onSave={(e) => (e.length ? save.mutate(e) : setEditing(false))} onCancel={() => setEditing(false)} />
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={t('camp.att.filter.label')} className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['errors', 'warnings', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 ${filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {t(`camp.att.filter.${f}`, { n: counts[f] })}
            </button>
          ))}
        </div>
        {counts.errors > 0 && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              {t('camp.att.edit_errors')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAskDelete(true)}>
              {t('camp.att.delete_errors')}
            </Button>
          </>
        )}
      </div>
      {askDelete && counts.errors > 0 && (
        <div role="alertdialog" aria-label={t('camp.att.delete_errors')} className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{t('camp.att.delete_errors_confirm', { n: counts.errors })}</span>
          <Button size="sm" onClick={() => save.mutate(deleteErrorRowsEdits(preview.rows))} loading={save.isPending}>
            {t('camp.att.delete_errors_yes')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAskDelete(false)}>
            {t('camp.common.cancel')}
          </Button>
        </div>
      )}
      <ErrorBox error={save.error} />
      {rows.length === 0 ? (
        <Empty>{filter === 'errors' ? t('camp.att.no_error_rows') : filter === 'warnings' ? t('camp.att.no_warning_rows') : t('camp.att.no_rows')}</Empty>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <Table
            head={[
              t('camp.att.col.place'),
              t('camp.att.col.file_name'),
              t('camp.common.code'),
              t('camp.att.col.date'),
              t('camp.att.col.action'),
              t('camp.att.col.kind'),
              t('camp.att.col.meals'),
              t('camp.att.col.shift'),
              t('camp.att.col.note'),
            ]}
          >
            {rows.map((r) => (
              <tr key={r.row} className={r.deleted ? 'bg-gray-50 text-gray-400' : r.errors.length > 0 ? 'bg-red-50/60' : (r.warnings?.length ?? 0) > 0 ? 'bg-yellow-50/60' : ''}>
                <td className={`${td} text-gray-400 whitespace-nowrap`}>{rowPlace(r)}</td>
                <td className={td}>
                  {fileName(r) || '—'}
                  {r.source && <span className="ml-1 text-xs text-gray-400 font-mono">{r.source.idRaw || '—'}</span>}
                </td>
                <td className={`${td} font-mono`}>
                  {r.employeeCode || '—'}
                  {r.edited && <div className="text-xs text-blue-600 font-sans">{t('camp.att.edited_from', { code: r.edited.fromCode || '—' })}</div>}
                </td>
                <td className={`${td} whitespace-nowrap`}>{r.date ?? '—'}</td>
                <td className={`${td} whitespace-nowrap`}>{actionLabel(r, t)}</td>
                <td className={td}>{r.kind ? KIND_LABEL[r.kind] : '—'}</td>
                <td className={td}>{r.action === 'EXTEND' ? '' : mealsText(r.meals, t)}</td>
                <td className={td}>{r.shift ? SHIFT_LABEL[r.shift] : ''}</td>
                <td className={td}>
                  {r.deleted ? (
                    <span className="inline-flex items-center gap-2">
                      {t('camp.att.deleted')}
                      <Button size="sm" variant="ghost" onClick={() => save.mutate([{ row: r.row, deleted: false }])} loading={save.isPending}>
                        {t('camp.att.restore')}
                      </Button>
                    </span>
                  ) : (
                    <>
                      {r.errors.length > 0 && <div className="text-red-700">{r.errors.join('; ')}</div>}
                      {(r.warnings?.length ?? 0) > 0 && <div className="text-yellow-700">{r.warnings?.join('; ')}</div>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  )
}

type T = (k: string, o?: Record<string, unknown>) => string

function actionLabel(r: ImportRow, t: T): string {
  if (r.action === 'EXTEND') return r.extendTo ? t('camp.att.extend_range', { from: r.date ?? '—', to: r.extendTo }) : t('camp.att.extend')
  return r.direction ? DIRECTION_LABEL[r.direction] : '—'
}

function mealsText(m: MealType[] | null, t: T): string {
  if (m === null) return '—'
  return m.length === 0 ? t('camp.att.no_meal') : m.map((x) => MEAL_LABEL[x]).join(', ')
}

// ── R4.5 Засварлах горим ─────────────────────────────────────

function EditErrorRows({
  campId,
  rows,
  saving,
  error,
  onSave,
  onCancel,
}: {
  campId: string
  rows: ImportRow[]
  saving: boolean
  error: unknown
  onSave: (edits: ImportRowEdit[]) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const set = (row: number, d: RowDraft) => setDrafts((x) => ({ ...x, [row]: { ...x[row], ...d } }))
  const edits = buildEdits(rows, drafts)
  return (
    <div className="space-y-2" data-testid="import-edit-rows">
      <div className="text-sm font-medium">{t('camp.att.edit_title', { n: rows.length })}</div>
      <p className="text-xs text-gray-500">{t('camp.att.edit_help')}</p>
      <div className="max-h-[32rem] overflow-y-auto">
        <Table head={[t('camp.att.col.place'), t('camp.att.col.file_name'), t('camp.att.col.error'), t('camp.att.col.employee'), t('camp.att.col.delete')]}>
          {rows.map((r) => {
            const d = drafts[r.row] ?? {}
            return (
              <tr key={r.row} className={d.deleted ? 'bg-gray-50 text-gray-400' : ''}>
                <td className={`${td} text-gray-400 whitespace-nowrap`}>{rowPlace(r)}</td>
                <td className={td}>
                  {fileName(r) || r.employeeCode || '—'}
                  {r.source && <span className="ml-1 text-xs text-gray-400 font-mono">{r.source.idRaw || '—'}</span>}
                </td>
                <td className={`${td} text-red-700 text-xs`}>{r.errors.join('; ')}</td>
                <td className={`${td} min-w-64`}>
                  {!d.deleted && <RowEmployeeChooser campId={campId} row={r} value={d.employeeId} onChange={(id) => set(r.row, { employeeId: id })} />}
                </td>
                <td className={td}>
                  <input
                    type="checkbox"
                    aria-label={t('camp.att.delete_row', { row: rowPlace(r) })}
                    checked={!!d.deleted}
                    onChange={(e) => set(r.row, { deleted: e.target.checked })}
                  />
                </td>
              </tr>
            )
          })}
        </Table>
      </div>
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button onClick={() => onSave(edits)} loading={saving} disabled={edits.length === 0}>
          {t('camp.att.save_rows', { n: edits.length })}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('camp.common.cancel')}
        </Button>
      </div>
    </div>
  )
}

function useDebounced<V>(value: V, ms = 300): V {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/** Мөр бүрийн ажилтан сонгогч — файлын нэрээр урьдчилан хайна, үр дүн мөр дотор (давхарлахгүй) */
function RowEmployeeChooser({ campId, row, value, onChange }: { campId: string; row: ImportRow; value?: string; onChange: (id: string | undefined) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState(() => pickerQuery(row))
  const [picked, setPicked] = useState<{ code: string; name: string } | null>(null)
  const term = useDebounced(q.trim())
  const res = useQuery({
    queryKey: ['camp', campId, 'employee-search', term, 5],
    queryFn: () => hrApi.employees(campId, { q: term || undefined, status: 'ACTIVE', limit: 5 }),
    enabled: term.length > 0,
  })
  const list = res.data?.data ?? []
  return (
    <div className="space-y-1">
      <input aria-label={t('camp.att.choose_employee_for', { row: rowPlace(row) })} className={inputSmCls} placeholder={t('camp.att.choose_employee')} value={q} onChange={(e) => setQ(e.target.value)} />
      {value && picked && (
        <div className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
          {t('camp.att.chosen', { code: picked.code, name: picked.name })}
          <button
            type="button"
            aria-label={t('camp.picker.remove', { code: picked.code })}
            className="text-blue-400 hover:text-red-600"
            onClick={() => {
              setPicked(null)
              onChange(undefined)
            }}
          >
            ×
          </button>
        </div>
      )}
      {res.isLoading && term && <div className="text-xs text-gray-400">{t('camp.picker.searching')}</div>}
      {!res.isLoading && term && list.length === 0 && <div className="text-xs text-gray-400">{t('camp.error.not_found')}</div>}
      <div role="radiogroup" className="space-y-0.5">
        {list.map((e) => (
          <label key={e.id} className="flex items-center gap-2 text-xs">
            <input
              type="radio"
              name={`emp-${row.row}`}
              checked={value === e.id}
              onChange={() => {
                setPicked({ code: e.employeeCode, name: e.fullName })
                onChange(e.id)
              }}
            />
            <span className="font-mono">{e.employeeCode}</span> {e.fullName}
            <span className="text-gray-400">
              {[e.department?.code, e.crew?.code, e.position].filter(Boolean).join(' · ')}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
