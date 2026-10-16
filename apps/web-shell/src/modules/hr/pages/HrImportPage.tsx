import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { hrApi } from '../api/hr-api'
import type { DataImportType } from '../../camp/api/types'
import { campKeys, useCampPermissions } from '../../camp/hooks/useCampPermissions'
import { P } from '../../camp/lib/permissions'
import { IMPORT_STATUS_LABEL } from '../../camp/lib/labels'
import ImportDialog, { ExportButton } from '../../camp/components/ImportDialog'
import { Badge, Button, Card, Empty, ErrorBox, Loading, Table, td } from '../../camp/components/ui'
import { DEPARTMENT_IMPORT_COLUMNS, EMPLOYEE_IMPORT_COLUMNS } from '../lib/import-columns'

const STATUS_TONE = { PREVIEW: 'yellow', CONFIRMED: 'green', CANCELLED: 'gray' } as const
const fmt = (iso: string) => iso.slice(0, 16).replace('T', ' ')

/**
 * /hr/:campId/import — v0.2.2 H2 (H2-Q4): мастер өгөгдлийн импорт (ажилтан, хэлтэс) + экспорт,
 * импортын түүх (`GET /hr/sites/:campId/data-imports`) ба ирцийн импортын түүх. Ирцийн файл оруулах — «Ирц» хуудсанд.
 */
export default function HrImportPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canEmployees = perms.can(P.EMPLOYEE_MANAGE)
  const canDepartments = perms.can(P.MASTER_MANAGE)
  const canMovements = perms.can(P.MOVEMENT_IMPORT)
  const [importing, setImporting] = useState<DataImportType | null>(null)

  const data = useQuery({ queryKey: campKeys.dataImports(campId), queryFn: () => hrApi.dataImports(campId) })
  const movements = useQuery({ queryKey: campKeys.imports(campId), queryFn: () => hrApi.imports(campId), enabled: canMovements })

  const kinds: { type: DataImportType; title: string; can: boolean }[] = [
    { type: 'employees', title: t('hr.section.employees'), can: canEmployees },
    { type: 'departments', title: t('hr.section.departments'), can: canDepartments },
  ]

  return (
    <div className="space-y-4">
      <Card title={t('hr.import.master_title')}>
        <p className="text-xs text-gray-500 mb-3">{t('camp.import.excel_help')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {kinds.map((k) => (
            <div key={k.type} className="rounded-lg border border-gray-200 p-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-gray-900">{k.title}</span>
              <div className="flex gap-2">
                <ExportButton campId={campId} type={k.type} />
                {k.can && (
                  <Button size="sm" variant="secondary" onClick={() => setImporting(k.type)}>
                    {t('camp.import.import')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('hr.import.history_title')}>
        {data.isLoading && <Loading />}
        <ErrorBox error={data.error} onRetry={() => data.refetch()} />
        {data.data && data.data.length === 0 && <Empty>{t('hr.import.history_empty')}</Empty>}
        {data.data && data.data.length > 0 && (
          <Table
            head={[t('hr.import.col.date'), t('hr.import.col.type'), t('hr.import.col.file'), t('hr.import.col.rows'), t('hr.import.col.status')]}
          >
            {data.data.map((h) => (
              <tr key={h.id} className="border-t border-gray-100">
                <td className={`${td} whitespace-nowrap text-gray-600`}>{fmt(h.createdAt)}</td>
                <td className={td}>{t(h.type === 'EMPLOYEES' ? 'hr.section.employees' : 'hr.section.departments')}</td>
                <td className={`${td} text-gray-600`}>{h.fileName ?? t('camp.import.mode.grid')}</td>
                <td className={`${td} text-xs text-gray-600`}>
                  {[
                    t('camp.import.count.create', { n: h.createRows }),
                    t('camp.import.count.update', { n: h.updateRows }),
                    t('camp.import.count.error', { n: h.errorRows }),
                  ].join(' · ')}
                </td>
                <td className={td}>
                  <Badge tone={STATUS_TONE[h.status]}>{IMPORT_STATUS_LABEL[h.status]}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {canMovements && (
        <Card
          title={t('hr.import.movements_title')}
          actions={
            <Link to="../attendance" relative="path" className="text-sm text-blue-600 hover:underline">
              {t('hr.import.to_attendance')}
            </Link>
          }
        >
          {movements.isLoading && <Loading />}
          <ErrorBox error={movements.error} onRetry={() => movements.refetch()} />
          {movements.data && movements.data.length === 0 && <Empty>{t('hr.import.history_empty')}</Empty>}
          {movements.data && movements.data.length > 0 && (
            <Table head={[t('hr.import.col.date'), t('hr.import.col.file'), t('hr.import.col.rows'), t('hr.import.col.status')]}>
              {movements.data.map((h) => (
                <tr key={h.id} className="border-t border-gray-100">
                  <td className={`${td} whitespace-nowrap text-gray-600`}>{fmt(h.createdAt)}</td>
                  <td className={`${td} text-gray-600`}>{h.fileName}</td>
                  <td className={`${td} text-xs text-gray-600`}>
                    {h.totalRows} · {t('camp.import.count.error', { n: h.errorRows })}
                  </td>
                  <td className={td}>
                    <Badge tone={STATUS_TONE[h.status]}>{IMPORT_STATUS_LABEL[h.status]}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {importing && (
        <ImportDialog
          campId={campId}
          type={importing}
          title={t(importing === 'employees' ? 'camp.emp.import_title' : 'camp.dept.import_title')}
          columns={importing === 'employees' ? EMPLOYEE_IMPORT_COLUMNS : DEPARTMENT_IMPORT_COLUMNS}
          invalidate={
            importing === 'employees'
              ? [campKeys.dataImports(campId), campKeys.employees(campId), campKeys.departments(campId), campKeys.crews(campId), campKeys.catalog('positions'), ...campKeys.operational(campId)]
              : [campKeys.dataImports(campId), campKeys.departments(campId)]
          }
          onClose={() => {
            setImporting(null)
            void data.refetch()
          }}
        />
      )}
    </div>
  )
}
