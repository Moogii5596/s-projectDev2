import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { hrApi } from '../api/hr-api'
import type { Employee } from '../api/camp-bridge'
import { inputCls } from '../../../core/ui'
import { useTranslation } from 'react-i18next'

export interface PickedEmployee {
  id: string
  employeeCode: string
  fullName: string
}

/** Хайлтын утгыг тайван болтол хүлээнэ (сервер рүү үсэг бүрт хүсэлт явуулахгүй) */
function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/**
 * Ажилтан сонгогч (код/нэрээр хайна, зөвхөн идэвхтэй). multiple = олныг сонгоно (ээлжийн зохицуулалт).
 * Сонгосон ажилтнуудыг chip хэлбэрээр харуулна.
 */
export default function EmployeePicker({
  campId,
  label,
  value,
  onChange,
  multiple = false,
}: {
  campId: string
  label: string
  value: PickedEmployee[]
  onChange: (v: PickedEmployee[]) => void
  multiple?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim())
  const results = useQuery({
    queryKey: ['camp', campId, 'employee-search', term],
    queryFn: () => hrApi.employees(campId, { q: term || undefined, status: 'ACTIVE', limit: 20 }),
    enabled: term.length > 0,
  })
  const pick = (e: Employee) => {
    const p = { id: e.id, employeeCode: e.employeeCode, fullName: e.fullName }
    onChange(multiple ? (value.some((v) => v.id === e.id) ? value : [...value, p]) : [p])
    setQ('')
  }
  const showSearch = multiple || value.length === 0

  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-gray-600">{label}</span>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-800 text-xs px-2 py-1">
              {v.employeeCode} · {v.fullName}
              <button type="button" aria-label={t('camp.picker.remove', { code: v.employeeCode })} className="text-blue-400 hover:text-red-600" onClick={() => onChange(value.filter((x) => x.id !== v.id))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {showSearch && (
        <div className="relative">
          <input aria-label={t('camp.picker.search_label', { label })} className={inputCls} placeholder={t('camp.picker.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          {term.length > 0 && (
            <ul role="listbox" className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
              {results.isLoading && <li className="px-3 py-2 text-gray-400">{t('camp.picker.searching')}</li>}
              {results.data?.data.length === 0 && <li className="px-3 py-2 text-gray-400">{t('camp.error.not_found')}</li>}
              {results.data?.data.map((e) => (
                <li key={e.id}>
                  <button type="button" role="option" aria-selected={false} className="w-full text-left px-3 py-2 hover:bg-blue-50" onClick={() => pick(e)}>
                    <span className="font-mono text-gray-500 mr-2">{e.employeeCode}</span>
                    {e.fullName}
                    <span className="text-gray-400 text-xs ml-2">
                      {e.department.code}
                      {e.crew ? ` · ${t('camp.picker.roster', { code: e.crew.code })}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
