import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { hrApi } from '../api/hr-api'
import type { DataImportEnum, DataImportType } from '../../camp/api/types'
import { campKeys, useCampPermissions } from '../../camp/hooks/useCampPermissions'
import { P } from '../../camp/lib/permissions'
import { IMPORT_STATUS_LABEL } from '../../camp/lib/labels'
import ImportDialog, { ExportButton } from '../../camp/components/ImportDialog'
import { Badge, Button, Card, Empty, ErrorBox, Loading, Table, td } from '../../camp/components/ui'
import {
  BUILDING_IMPORT_COLUMNS,
  BUILDING_TYPE_IMPORT_COLUMNS,
  DEPARTMENT_IMPORT_COLUMNS,
  EMPLOYEE_IMPORT_COLUMNS,
  FORMER_EMPLOYEE_IMPORT_COLUMNS,
  POSITION_IMPORT_COLUMNS,
  ROOM_ALLOCATION_IMPORT_COLUMNS,
  ROOM_IMPORT_COLUMNS,
} from '../lib/import-columns'
import type { GridColumn } from '../../camp/components/ImportDialog'
import type { QueryKey } from '@tanstack/react-query'

const STATUS_TONE = { PREVIEW: 'yellow', CONFIRMED: 'green', CANCELLED: 'gray' } as const
const fmt = (iso: string) => iso.slice(0, 16).replace('T', ' ')
/** DB enum (EMPLOYEES, ROOM_ALLOCATIONS …) → URL төрөл (employees, room-allocations …) */
const urlType = (e: DataImportEnum) => e.toLowerCase().replace(/_/g, '-') as DataImportType

interface Kind {
  type: DataImportType
  group: 'hr' | 'rooms'
  can: boolean
  columns: GridColumn[]
  invalidate: QueryKey[]
}

/**
 * /hr/:campId/import — v0.2.2 H2 (H2-Q4): мастер өгөгдлийн импорт + экспорт (v0.2.3 Блок D: + албан тушаал, гарсан ажилтан,
 * өрөөний тохиргоо, өрөөнд байрлуулалт — дарааллаар),
 * импортын түүх (`GET /hr/sites/:campId/data-imports`) ба ирцийн импортын түүх. Ирцийн файл оруулах — «Ирц» хуудсанд.
 */
export default function HrImportPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canEmployees = perms.can(P.EMPLOYEE_MANAGE)
  const canMaster = perms.can(P.MASTER_MANAGE)
  const canMovements = perms.can(P.MOVEMENT_IMPORT)
  const [importing, setImporting] = useState<DataImportType | null>(null)

  const data = useQuery({ queryKey: campKeys.dataImports(campId), queryFn: () => hrApi.dataImports(campId) })
  const movements = useQuery({ queryKey: campKeys.imports(campId), queryFn: () => hrApi.imports(campId), enabled: canMovements })

  // v0.2.3 Блок D: дарааллаар (хэлтэс → албан тушаал → ажилтан → гарсан ажилтан; байрны төрөл → байр → өрөө → байрлуулалт)
  const emp = [campKeys.employees(campId), campKeys.departments(campId), campKeys.crews(campId), campKeys.catalog('positions'), ...campKeys.operational(campId)]
  const rooms = [campKeys.buildings(campId), campKeys.rooms(campId), campKeys.roomBoard(campId), campKeys.allocations(campId)]
  const kinds: Kind[] = [
    { type: 'departments', group: 'hr', can: canMaster, columns: DEPARTMENT_IMPORT_COLUMNS, invalidate: [campKeys.departments(campId)] },
    { type: 'positions', group: 'hr', can: canMaster, columns: POSITION_IMPORT_COLUMNS, invalidate: [campKeys.catalog('positions')] },
    { type: 'employees', group: 'hr', can: canEmployees, columns: EMPLOYEE_IMPORT_COLUMNS, invalidate: emp },
    { type: 'former-employees', group: 'hr', can: perms.can(P.EMPLOYEE_TERMINATE), columns: FORMER_EMPLOYEE_IMPORT_COLUMNS, invalidate: emp },
    { type: 'building-types', group: 'rooms', can: canMaster, columns: BUILDING_TYPE_IMPORT_COLUMNS, invalidate: [campKeys.catalog('building-types'), ...rooms] },
    { type: 'buildings', group: 'rooms', can: canMaster, columns: BUILDING_IMPORT_COLUMNS, invalidate: rooms },
    { type: 'rooms', group: 'rooms', can: canMaster || perms.can(P.ROOM_MANAGE), columns: ROOM_IMPORT_COLUMNS, invalidate: rooms },
    { type: 'room-allocations', group: 'rooms', can: perms.can(P.ROOM_MANAGE), columns: ROOM_ALLOCATION_IMPORT_COLUMNS, invalidate: [...rooms, campKeys.employees(campId)] },
  ]
  const active = kinds.find((k) => k.type === importing)

  return (
    <div className="space-y-4">
      <Card title={t('hr.import.master_title')}>
        <p className="text-xs text-gray-500 mb-1">{t('camp.import.excel_help')}</p>
        <p className="text-xs text-gray-500 mb-3">{t('hr.import.order_hint')}</p>
        {(['hr', 'rooms'] as const).map((g) => (
          <div key={g} className="mb-4 last:mb-0">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{t(`hr.import.group.${g}`)}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {kinds
                .filter((k) => k.group === g)
                .map((k, i) => (
                  <div key={k.type} className="rounded-lg border border-gray-200 p-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      <span className="text-gray-400 mr-1">{i + 1}.</span>
                      {t(`hr.import.kind.${k.type}`)}
                    </span>
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
          </div>
        ))}
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
                <td className={td}>{t(`hr.import.kind.${urlType(h.type)}`)}</td>
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

      {active && (
        <ImportDialog
          campId={campId}
          type={active.type}
          title={t(`hr.import.kind.${active.type}`)}
          columns={active.columns}
          invalidate={[campKeys.dataImports(campId), ...active.invalidate]}
          onClose={() => {
            setImporting(null)
            void data.refetch()
          }}
        />
      )}
    </div>
  )
}
