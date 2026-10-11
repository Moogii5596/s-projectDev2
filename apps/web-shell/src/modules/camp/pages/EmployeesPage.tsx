import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { campApi, type EmployeeQuery } from '../api/camp-api'
import type { Employee, EmployeeStatus } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { EMPLOYEE_STATUS_LABEL } from '../lib/labels'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../components/ui'
import ImportDialog, { ExportButton, type GridColumn } from '../components/ImportDialog'
import { useTranslation } from 'react-i18next'

/** FB-08 (v0.2.0): Excel / хүснэгтээр оруулах — баганын түлхүүр backend EMPLOYEES_SPEC-тэй ижил */
const IMPORT_COLUMNS: GridColumn[] = [
  { key: 'employeeCode', label: 'camp.emp.col.code', required: true },
  { key: 'fullName', label: 'camp.emp.col.full_name', required: true },
  { key: 'position', label: 'camp.emp.col.position' },
  { key: 'phone', label: 'camp.emp.col.phone' },
  { key: 'email', label: 'camp.emp.col.email' },
  { key: 'organization', label: 'camp.emp.col.organization', required: true },
  { key: 'department', label: 'camp.emp.col.department', required: true },
  { key: 'crew', label: 'camp.emp.col.crew' },
  { key: 'status', label: 'camp.emp.col.status' },
]

/** /camp/:campId/employees — ажилтан (employee_code = ирцийн импортын түлхүүр). Бичих: employee.manage */
export default function EmployeesPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canEdit = perms.can(P.EMPLOYEE_MANAGE)
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => campApi.departments(campId) })
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => campApi.crews(campId) })
  const [filter, setFilter] = useState<EmployeeQuery>({ status: 'ACTIVE' })
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Employee | 'new' | null>(null)
  const [importing, setImporting] = useState(false)

  const q: EmployeeQuery = { ...filter, q: search.trim() || undefined, limit: 50 }
  const list = useInfiniteQuery({
    queryKey: [...campKeys.employees(campId), q],
    queryFn: ({ pageParam }) => campApi.employees(campId, { ...q, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.data) ?? []
  const setF = (k: keyof EmployeeQuery, v: string) => setFilter((f) => ({ ...f, [k]: v || undefined }))

  return (
    <Card
      title={t('camp.emp.title')}
      actions={
        <div className="flex flex-wrap gap-2">
          <ExportButton campId={campId} type="employees" />
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setImporting(true)}>
              {t('camp.import.import')}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={() => setModal('new')}>
              {t('camp.emp.add')}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        <input aria-label={t('camp.emp.search')} className={`${inputSmCls} w-56 max-w-full`} placeholder={t('camp.picker.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t('camp.filter.department')} className={`${inputSmCls} w-auto`} value={filter.departmentId ?? ''} onChange={(e) => setF('departmentId', e.target.value)}>
          <option value="">{t('camp.filter.all_departments')}</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} · {d.name}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.filter.crew')} className={`${inputSmCls} w-auto`} value={filter.crewId ?? ''} onChange={(e) => setF('crewId', e.target.value)}>
          <option value="">{t('camp.filter.all_crews')}</option>
          <option value="none">{t('camp.emp.no_crew')}</option>
          {crews.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.filter.status')} className={`${inputSmCls} w-auto`} value={filter.status ?? ''} onChange={(e) => setF('status', e.target.value)}>
          <option value="">{t('camp.filter.all_statuses')}</option>
          <option value="ACTIVE">{EMPLOYEE_STATUS_LABEL.ACTIVE}</option>
          <option value="INACTIVE">{EMPLOYEE_STATUS_LABEL.INACTIVE}</option>
        </select>
      </div>
      {list.isLoading && <Loading />}
      <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      {list.data && rows.length === 0 && <Empty>{t('camp.emp.empty')}</Empty>}
      {rows.length > 0 && (
        <Table head={[t('camp.common.code'), t('camp.common.name'), t('camp.emp.col.position'), t('camp.emp.department'), t('camp.emp.crew'), t('camp.emp.organization'), t('camp.common.status'), '']}>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className={`${td} font-mono`}>{e.employeeCode}</td>
              <td className={`${td} font-medium text-gray-900`}>{e.fullName}</td>
              <td className={`${td} text-gray-600`}>{e.position ?? '—'}</td>
              <td className={td}>{e.department.code}</td>
              <td className={td}>{e.crew?.code ?? <span className="text-gray-400">{t('camp.emp.no_crew')}</span>}</td>
              <td className={`${td} text-gray-600`}>{e.organization.name}</td>
              <td className={td}>
                <Badge tone={e.status === 'ACTIVE' ? 'green' : 'gray'}>{EMPLOYEE_STATUS_LABEL[e.status]}</Badge>
              </td>
              <td className={`${td} text-right`}>
                {canEdit && (
                  <Button variant="ghost" onClick={() => setModal(e)}>
                    {t('camp.common.edit')}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {list.hasNextPage && (
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            {t('camp.common.load_more')}
          </Button>
        </div>
      )}
      {modal && <EmployeeModal campId={campId} emp={modal === 'new' ? null : modal} onClose={() => setModal(null)} />}
      {importing && (
        <ImportDialog
          campId={campId}
          type="employees"
          title={t('camp.emp.import_title')}
          columns={IMPORT_COLUMNS}
          invalidate={[campKeys.employees(campId), campKeys.departments(campId), campKeys.crews(campId)]}
          onClose={() => setImporting(false)}
        />
      )}
    </Card>
  )
}

function EmployeeModal({ campId, emp, onClose }: { campId: string; emp: Employee | null; onClose: () => void }) {
  const { t } = useTranslation()
  const orgs = useQuery({ queryKey: [...campKeys.organizations, 'active'], queryFn: () => campApi.organizations({ activeOnly: true }) })
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => campApi.departments(campId) })
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => campApi.crews(campId) })
  const [f, setF] = useState({
    employeeCode: emp?.employeeCode ?? '',
    fullName: emp?.fullName ?? '',
    position: emp?.position ?? '',
    phone: emp?.phone ?? '',
    email: emp?.email ?? '',
    organizationId: emp?.organizationId ?? '',
    departmentId: emp?.departmentId ?? '',
    crewId: emp?.crewId ?? '',
    status: (emp?.status ?? 'ACTIVE') as EmployeeStatus,
  })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const body = () => ({
    employeeCode: f.employeeCode.trim(),
    fullName: f.fullName.trim(),
    position: f.position.trim() || null,
    phone: f.phone.trim() || null,
    email: f.email.trim() || null,
    organizationId: f.organizationId,
    departmentId: f.departmentId,
    crewId: f.crewId || null,
  })
  const m = useCampMutation(
    () => (emp ? campApi.updateEmployee(campId, emp.id, { ...body(), status: f.status }) : campApi.createEmployee(campId, body())),
    [campKeys.employees(campId), ...campKeys.operational(campId)],
    onClose,
  )
  const activeDepts = (depts.data ?? []).filter((d) => d.isActive || d.id === f.departmentId)
  const activeCrews = (crews.data ?? []).filter((c) => c.isActive || c.id === f.crewId)
  const ready = f.employeeCode.trim() && f.fullName.trim() && f.organizationId && f.departmentId

  return (
    <Modal
      title={emp ? t('camp.emp.edit_title', { code: emp.employeeCode }) : t('camp.emp.add_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!ready}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('camp.emp.col.code')} hint={t('camp.emp.code_hint')}>
          {(id) => <input id={id} className={inputCls} value={f.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} maxLength={50} />}
        </Field>
        <div className="col-span-2">
          <Field label={t('camp.emp.col.full_name')}>{(id) => <input id={id} className={inputCls} value={f.fullName} onChange={(e) => set('fullName', e.target.value)} maxLength={200} />}</Field>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.emp.col.position')}>{(id) => <input id={id} className={inputCls} value={f.position} onChange={(e) => set('position', e.target.value)} maxLength={100} />}</Field>
        <Field label={t('camp.emp.col.phone')}>{(id) => <input id={id} className={inputCls} value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={50} />}</Field>
      </div>
      <Field label={t('camp.emp.col.email')} hint={t('camp.emp.email_hint')}>
        {(id) => <input id={id} type="email" className={inputCls} value={f.email} onChange={(e) => set('email', e.target.value)} maxLength={254} />}
      </Field>
      <Field label={t('camp.emp.organization')}>
        {(id) => (
          <select id={id} className={inputCls} value={f.organizationId} onChange={(e) => set('organizationId', e.target.value)}>
            <option value="">{t('camp.common.choose')}</option>
            {orgs.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {emp && !orgs.data?.some((o) => o.id === emp.organizationId) && <option value={emp.organizationId}>{emp.organization.name} ({t('camp.common.inactive')})</option>}
          </select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.emp.department')} hint={t('camp.emp.department_hint')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
              <option value="">{t('camp.common.choose')}</option>
              {activeDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('camp.emp.crew')} hint={t('camp.emp.crew_hint')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.crewId} onChange={(e) => set('crewId', e.target.value)}>
              <option value="">{t('camp.emp.no_crew')}</option>
              {activeCrews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                  {c.name ? ` · ${c.name}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {emp && (
        <Field label={t('camp.common.status')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ACTIVE">{EMPLOYEE_STATUS_LABEL.ACTIVE}</option>
              <option value="INACTIVE">{EMPLOYEE_STATUS_LABEL.INACTIVE}</option>
            </select>
          )}
        </Field>
      )}
      <ErrorBox error={m.error ?? orgs.error ?? depts.error} />
    </Modal>
  )
}
