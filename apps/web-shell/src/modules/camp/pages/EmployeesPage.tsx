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

/** /camp/:campId/employees — ажилтан (employee_code = ирцийн импортын түлхүүр). Бичих: employee.manage */
export default function EmployeesPage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canEdit = perms.can(P.EMPLOYEE_MANAGE)
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => campApi.departments(campId) })
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => campApi.crews(campId) })
  const [filter, setFilter] = useState<EmployeeQuery>({ status: 'ACTIVE' })
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Employee | 'new' | null>(null)

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
    <Card title="Ажилтан" actions={canEdit && <Button size="sm" onClick={() => setModal('new')}>+ Ажилтан</Button>}>
      <div className="flex flex-wrap gap-2 mb-3">
        <input aria-label="Ажилтан хайх" className={`${inputSmCls} w-56 max-w-full`} placeholder="Код эсвэл нэрээр хайх" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Хэлтсээр шүүх" className={`${inputSmCls} w-auto`} value={filter.departmentId ?? ''} onChange={(e) => setF('departmentId', e.target.value)}>
          <option value="">Бүх хэлтэс</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} · {d.name}
            </option>
          ))}
        </select>
        <select aria-label="Багаар шүүх" className={`${inputSmCls} w-auto`} value={filter.crewId ?? ''} onChange={(e) => setF('crewId', e.target.value)}>
          <option value="">Бүх баг</option>
          {crews.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <select aria-label="Төлвөөр шүүх" className={`${inputSmCls} w-auto`} value={filter.status ?? ''} onChange={(e) => setF('status', e.target.value)}>
          <option value="">Бүх төлөв</option>
          <option value="ACTIVE">Идэвхтэй</option>
          <option value="INACTIVE">Идэвхгүй</option>
        </select>
      </div>
      {list.isLoading && <Loading />}
      <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      {list.data && rows.length === 0 && <Empty>Ажилтан олдсонгүй</Empty>}
      {rows.length > 0 && (
        <Table head={['Код', 'Нэр', 'Албан тушаал', 'Хэлтэс', 'Баг', 'Байгууллага', 'Төлөв', '']}>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className={`${td} font-mono`}>{e.employeeCode}</td>
              <td className={`${td} font-medium text-gray-900`}>{e.fullName}</td>
              <td className={`${td} text-gray-600`}>{e.position ?? '—'}</td>
              <td className={td}>{e.department.code}</td>
              <td className={td}>{e.crew?.code ?? <span className="text-gray-400">Баггүй</span>}</td>
              <td className={`${td} text-gray-600`}>{e.organization.name}</td>
              <td className={td}>
                <Badge tone={e.status === 'ACTIVE' ? 'green' : 'gray'}>{EMPLOYEE_STATUS_LABEL[e.status]}</Badge>
              </td>
              <td className={`${td} text-right`}>
                {canEdit && (
                  <Button variant="ghost" onClick={() => setModal(e)}>
                    Засах
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
            Цааш ачаалах
          </Button>
        </div>
      )}
      {modal && <EmployeeModal campId={campId} emp={modal === 'new' ? null : modal} onClose={() => setModal(null)} />}
    </Card>
  )
}

function EmployeeModal({ campId, emp, onClose }: { campId: string; emp: Employee | null; onClose: () => void }) {
  const orgs = useQuery({ queryKey: [...campKeys.organizations, 'active'], queryFn: () => campApi.organizations({ activeOnly: true }) })
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => campApi.departments(campId) })
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => campApi.crews(campId) })
  const [f, setF] = useState({
    employeeCode: emp?.employeeCode ?? '',
    fullName: emp?.fullName ?? '',
    position: emp?.position ?? '',
    phone: emp?.phone ?? '',
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
      title={emp ? `Ажилтан ${emp.employeeCode} засах` : 'Ажилтан нэмэх'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!ready}>
            Хадгалах
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Ажилтны код" hint="Ирцийн xlsx-ийн employee_code">
          {(id) => <input id={id} className={inputCls} value={f.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} maxLength={50} />}
        </Field>
        <div className="col-span-2">
          <Field label="Овог нэр">{(id) => <input id={id} className={inputCls} value={f.fullName} onChange={(e) => set('fullName', e.target.value)} maxLength={200} />}</Field>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Албан тушаал">{(id) => <input id={id} className={inputCls} value={f.position} onChange={(e) => set('position', e.target.value)} maxLength={100} />}</Field>
        <Field label="Утас">{(id) => <input id={id} className={inputCls} value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={50} />}</Field>
      </div>
      <Field label="Байгууллага">
        {(id) => (
          <select id={id} className={inputCls} value={f.organizationId} onChange={(e) => set('organizationId', e.target.value)}>
            <option value="">— Сонгох —</option>
            {orgs.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {emp && !orgs.data?.some((o) => o.id === emp.organizationId) && <option value={emp.organizationId}>{emp.organization.name} (идэвхгүй)</option>}
          </select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Хэлтэс" hint="Ээлжийн загвар, хоол идэх байршил хэлтсээс">
          {(id) => (
            <select id={id} className={inputCls} value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
              <option value="">— Сонгох —</option>
              {activeDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Баг" hint="Баггүй = ростергүй (жнь захиргаа)">
          {(id) => (
            <select id={id} className={inputCls} value={f.crewId} onChange={(e) => set('crewId', e.target.value)}>
              <option value="">Баггүй</option>
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
        <Field label="Төлөв">
          {(id) => (
            <select id={id} className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ACTIVE">Идэвхтэй</option>
              <option value="INACTIVE">Идэвхгүй</option>
            </select>
          )}
        </Field>
      )}
      <ErrorBox error={m.error ?? orgs.error ?? depts.error} />
    </Modal>
  )
}
