import { useState } from 'react'
import { invalidPhones, joinPhones, splitPhones } from '../lib/phones'
import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-bridge'
import { hrApi, type EmployeeQuery } from '../api/hr-api'
import type { CatalogItem, Employee, EmployeeStatus, ValueSource } from '../api/camp-bridge'
import { inherited } from '../api/camp-bridge'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { P } from '../../../core/permissions'
import { EMPLOYEE_STATUS_LABEL, localizedCatalogName } from '../../../core/labels'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, inputSmCls, td } from '../../../core/ui'
import ImportDialog, { ExportButton } from '../../../core/ImportDialog'
import { EMPLOYEE_IMPORT_COLUMNS } from '../lib/import-columns'
import EmployeeAccess from '../components/EmployeeAccess'
import { useTranslation } from 'react-i18next'
import { autoCodeExample, codePayload, codeReady, suggestAutoCode } from '../lib/employee-form'


/** <select>-ийн утга ↔ boolean | null ('' = албан тушаалаас / анхдагч) */
const toTri = (v: string): boolean | null => (v === '' ? null : v === 'yes')
const fromTri = (v: boolean | null | undefined) => (v === null || v === undefined ? '' : v ? 'yes' : 'no')

function SourceTag({ source }: { source: ValueSource }) {
  const { t } = useTranslation()
  if (source === 'EMPLOYEE') return null
  return <span className="ml-1 text-[11px] text-gray-400">({t(`camp.emp.source.${source}`)})</span>
}

/**
 * /camp/:campId/employees — ажилтан (employee_code = ирцийн импортын түлхүүр). Бичих: employee.manage
 * v0.2.1: албан тушаал (каталог), ажлын хоолны байршил, хоол авах — эцсийн утга + эх сурвалж; олноор үйлдэл (Д-2).
 */
export default function EmployeesPage() {
  const { t, i18n } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useAppPermissions(campId)
  const canEdit = perms.can(P.EMPLOYEE_MANAGE)
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => hrApi.departments(campId) })
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => hrApi.crews(campId) })
  const [filter, setFilter] = useState<EmployeeQuery>({ status: 'ACTIVE' })
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Employee | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const positions = useQuery({ queryKey: campKeys.catalog('positions'), queryFn: () => campApi.catalog('positions') })
  const orgs = useQuery({ queryKey: [...campKeys.organizations, 'all'], queryFn: () => campApi.organizations({}) })
  const [notice, setNotice] = useState<string | null>(null)

  const q: EmployeeQuery = { ...filter, q: search.trim() || undefined, limit: 50 }
  const list = useInfiniteQuery({
    queryKey: [...campKeys.employees(campId), q],
    queryFn: ({ pageParam }) => hrApi.employees(campId, { ...q, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const rows = list.data?.pages.flatMap((p) => p.data) ?? []
  const setF = (k: keyof EmployeeQuery, v: string) => {
    setSelected(new Set())
    setFilter((f) => ({ ...f, [k]: v || undefined }))
  }
  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  // v0.2.2 Блок 5: ажлаас гарсан бүртгэлийг олноор өөрчлөхгүй
  const selectable = rows.filter((r) => r.status !== 'TERMINATED')
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id))

  return (
    <Card
      title={t('camp.emp.title')}
      actions={
        <div className="flex flex-wrap gap-2">
          <ExportButton exportFile={() => hrApi.exportFile(campId, 'employees')} />
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
      {notice && (
        <div role="status" className="mb-3 flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          <span>{notice}</span>
          <button type="button" aria-label={t('camp.common.close')} className="text-green-500 hover:text-green-800" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-3">
        <input aria-label={t('camp.emp.search')} className={`${inputSmCls} w-56 max-w-full`} placeholder={t('camp.picker.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label={t('camp.filter.department')} className={`${inputSmCls} w-auto`} value={filter.departmentId ?? ''} onChange={(e) => setF('departmentId', e.target.value)}>
          <option value="">{t('camp.filter.all_departments')}</option>
          {depts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} · {localizedCatalogName(d, i18n.resolvedLanguage ?? i18n.language)}
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
        <select aria-label={t('camp.filter.position')} className={`${inputSmCls} w-auto`} value={filter.positionId ?? ''} onChange={(e) => setF('positionId', e.target.value)}>
          <option value="">{t('camp.filter.all_positions')}</option>
          <option value="none">{t('camp.emp.no_position')}</option>
          {positions.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {localizedCatalogName(p, i18n.resolvedLanguage ?? i18n.language)}
            </option>
          ))}
        </select>
        {/* v0.2.3 R8: байгууллагаар (гэрээт — харуул, ээлжийн унаа г.м.) */}
        <select aria-label={t('camp.filter.organization')} className={`${inputSmCls} w-auto`} value={filter.organizationId ?? ''} onChange={(e) => setF('organizationId', e.target.value)}>
          <option value="">{t('camp.filter.all_organizations')}</option>
          {orgs.data?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select aria-label={t('camp.filter.status')} className={`${inputSmCls} w-auto`} value={filter.status ?? ''} onChange={(e) => setF('status', e.target.value)}>
          <option value="">{t('camp.filter.all_statuses')}</option>
          <option value="ACTIVE">{EMPLOYEE_STATUS_LABEL.ACTIVE}</option>
          <option value="INACTIVE">{EMPLOYEE_STATUS_LABEL.INACTIVE}</option>
          <option value="TERMINATED">{EMPLOYEE_STATUS_LABEL.TERMINATED}</option>
        </select>
        {/* v0.2.3 Блок D (S9) */}
        <label className="flex items-center gap-1 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={filter.dataIssues === true}
            onChange={(e) => {
              setSelected(new Set())
              setFilter((f) => ({ ...f, dataIssues: e.target.checked ? true : undefined }))
            }}
          />
          {t('hr.issue.filter')}
        </label>
      </div>
      {canEdit && selected.size > 0 && (
        <BulkBar campId={campId} ids={[...selected]} positions={positions.data ?? []} onDone={() => setSelected(new Set())} />
      )}
      {list.isLoading && <Loading />}
      <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      {list.data && rows.length === 0 && <Empty>{t('camp.emp.empty')}</Empty>}
      {rows.length > 0 && (
        <Table
          head={[
            ...(canEdit
              ? [
                  <input
                    key="all"
                    type="checkbox"
                    aria-label={t('camp.emp.select_all')}
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.filter((r) => r.status !== 'TERMINATED').map((r) => r.id)))}
                  />,
                ]
              : []),
            t('camp.common.code'),
            t('camp.common.name'),
            t('camp.emp.col.position'),
            t('camp.emp.department'),
            t('camp.emp.crew'),
            t('camp.emp.col.meal_location'),
            t('camp.emp.col.meals_included'),
            t('camp.emp.organization'),
            t('camp.common.status'),
            '',
          ]}
        >
          {rows.map((e) => (
            <tr key={e.id} className={selected.has(e.id) ? 'bg-blue-50/50' : ''}>
              {canEdit && (
                <td className={td}>
                  {e.status !== 'TERMINATED' && (
                    <input type="checkbox" aria-label={t('camp.emp.select', { code: e.employeeCode })} checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  )}
                </td>
              )}
              <td className={`${td} font-mono`}>{e.employeeCode}</td>
              <td className={`${td} font-medium text-gray-900`}>
                <Link to={`/hr/${campId}/employees/${e.id}`} className="hover:text-blue-700 hover:underline">
                  {e.fullName}
                </Link>
                {(e.dataIssues?.length ?? 0) > 0 && (
                  <span className="ml-2" title={e.dataIssues!.map((i) => t(`hr.issue.field.${i.field}`)).join(', ')}>
                    <Badge tone="yellow">{t('hr.issue.badge')}</Badge>
                  </span>
                )}
              </td>
              <td className={`${td} text-gray-600`}>
                {e.positionRef ? localizedCatalogName(e.positionRef, i18n.resolvedLanguage ?? i18n.language) : e.position ?? '—'}
              </td>
              <td className={td}>{e.department.code}</td>
              <td className={td}>{e.crew?.code ?? <span className="text-gray-400">{t('camp.emp.no_crew')}</span>}</td>
              <td className={td}>
                {e.effective ? (
                  <>
                    {e.effective.mealLocationName
                      ? localizedCatalogName(
                          { name: e.effective.mealLocationName, nameI18n: e.effective.mealLocationNameI18n },
                          i18n.resolvedLanguage ?? i18n.language,
                        )
                      : '—'}
                    <SourceTag source={e.effective.mealLocationSource} />
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className={td}>
                {e.effective &&
                  (e.effective.mealsIncluded ? (
                    <span className="text-gray-700">{t('camp.common.yes')}</span>
                  ) : (
                    <Badge tone="yellow">{t('camp.emp.no_meals')}</Badge>
                  ))}
                {e.effective && <SourceTag source={e.effective.mealsIncludedSource} />}
              </td>
              <td className={`${td} text-gray-600`}>{e.organization.name}</td>
              <td className={td}>
                <Badge tone={e.status === 'ACTIVE' ? 'green' : e.status === 'TERMINATED' ? 'red' : 'gray'}>{EMPLOYEE_STATUS_LABEL[e.status]}</Badge>
                {e.status === 'TERMINATED' && e.terminatedAt && <span className="ml-1 text-[11px] text-gray-400">{e.terminatedAt.slice(0, 10)}</span>}
              </td>
              <td className={`${td} text-right`}>
                {canEdit && e.status !== 'TERMINATED' && (
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
      {modal && <EmployeeModal campId={campId} emp={modal === 'new' ? null : modal} onClose={() => setModal(null)} onAutoCode={(e) => setNotice(t('camp.emp.auto_code_done', { code: e.employeeCode, name: e.fullName }))} />}
      {importing && (
        <ImportDialog
          title={t('camp.emp.import_title')}
          columns={EMPLOYEE_IMPORT_COLUMNS}
          invalidate={[campKeys.employees(campId), campKeys.departments(campId), campKeys.crews(campId), campKeys.catalog('positions'), ...campKeys.operational(campId)]}
          templateFileName="employees-template.xlsx"
          downloadTemplate={() => hrApi.dataTemplate(campId, 'employees')}
          uploadFile={(file) => hrApi.dataUploadXlsx(campId, 'employees', file)}
          uploadRows={(rows) => hrApi.dataUploadRows(campId, 'employees', rows)}
          confirmImport={(id, skipErrors) => hrApi.dataConfirm(campId, 'employees', id, skipErrors)}
          cancelImport={(id) => hrApi.dataCancel(campId, 'employees', id)}
          onClose={() => setImporting(false)}
        />
      )}
    </Card>
  )
}

function EmployeeModal({ campId, emp, onClose, onAutoCode }: { campId: string; emp: Employee | null; onClose: () => void; onAutoCode?: (e: Employee) => void }) {
  const { t, i18n } = useTranslation()
  const orgs = useQuery({ queryKey: [...campKeys.organizations, 'active'], queryFn: () => campApi.organizations({ activeOnly: true }) })
  const depts = useQuery({ queryKey: campKeys.departments(campId), queryFn: () => hrApi.departments(campId) })
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => hrApi.crews(campId) })
  const positions = useQuery({ queryKey: campKeys.catalog('positions'), queryFn: () => campApi.catalog('positions') })
  const posSettings = useQuery({ queryKey: campKeys.positionSettings(campId), queryFn: () => campApi.positionSettings(campId) })
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })
  const [f, setF] = useState({
    employeeCode: emp?.employeeCode ?? '',
    lastName: emp ? (emp.lastName ?? '') : '',
    firstName: emp ? (emp.firstName ?? emp.fullName) : '',
    familyName: emp?.familyName ?? '',
    extraPhones: joinPhones(emp?.extraPhones),
    positionId: emp?.positionId ?? '',
    mealLocationId: emp?.mealLocationId ?? '',
    mealsIncluded: fromTri(emp?.mealsIncluded),
    phone: emp?.phone ?? '',
    email: emp?.email ?? '',
    organizationId: emp?.organizationId ?? '',
    departmentId: emp?.departmentId ?? '',
    crewId: emp?.crewId ?? '',
    status: (emp?.status ?? 'ACTIVE') as EmployeeStatus,
  })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  // v0.2.3 R8: «Код автоматаар олгох» — зөвхөн нэмэхэд; гэрээт байгууллага сонгоход санал болгоно (хэрэглэгч буцааж болно)
  const [autoCode, setAutoCode] = useState(false)
  const pickOrg = (id: string) => {
    set('organizationId', id)
    if (!emp) setAutoCode(suggestAutoCode(orgs.data?.find((o) => o.id === id)?.orgType))
  }
  const body = () => ({
    ...codePayload(!emp && autoCode, f.employeeCode),
    lastName: f.lastName.trim() || null,
    firstName: f.firstName.trim(),
    familyName: f.familyName.trim() || null,
    extraPhones: splitPhones(f.extraPhones),
    positionId: f.positionId || null,
    mealLocationId: f.mealLocationId || null,
    mealsIncluded: toTri(f.mealsIncluded),
    phone: f.phone.trim() || null,
    email: f.email.trim() || null,
    organizationId: f.organizationId,
    departmentId: f.departmentId,
    crewId: f.crewId || null,
  })
  const m = useAppMutation(
    () => (emp ? hrApi.updateEmployee(campId, emp.id, { ...body(), status: f.status }) : hrApi.createEmployee(campId, body())),
    [campKeys.employees(campId), ...campKeys.operational(campId)],
    (saved) => {
      if (!emp && autoCode) onAutoCode?.(saved)
      onClose()
    },
  )
  const activeDepts = (depts.data ?? []).filter((d) => d.isActive || d.id === f.departmentId)
  const activeCrews = (crews.data ?? []).filter((c) => c.isActive || c.id === f.crewId)
  const usablePositions = (positions.data ?? []).filter((p) => p.isActive || p.id === f.positionId)
  const usableLocations = (locations.data ?? []).filter((l) => l.isActive || l.id === f.mealLocationId)
  const inh = inherited(f.positionId, posSettings.data, locations.data?.find((l) => l.id === settings.data?.defaultMealLocationId))
  const inhFrom = t(`camp.emp.source.${inh.from}`)
  const badPhones = invalidPhones(splitPhones(f.extraPhones))
  const ready = codeReady(!emp && autoCode, f.employeeCode) && f.firstName.trim() && f.organizationId && f.departmentId && badPhones.length === 0

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
        <Field label={t('camp.emp.col.code')} hint={!emp && autoCode ? t('camp.emp.auto_code_hint', { example: autoCodeExample(settings.data?.autoCodePrefix) }) : t('camp.emp.code_hint')}>
          {(id) => (
            <div className="space-y-1">
              <input
                id={id}
                className={inputCls}
                value={!emp && autoCode ? '' : f.employeeCode}
                placeholder={!emp && autoCode ? autoCodeExample(settings.data?.autoCodePrefix) : undefined}
                onChange={(e) => set('employeeCode', e.target.value)}
                maxLength={50}
                disabled={!emp && autoCode}
              />
              {!emp && (
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input type="checkbox" checked={autoCode} onChange={(e) => setAutoCode(e.target.checked)} />
                  {t('camp.emp.auto_code')}
                </label>
              )}
            </div>
          )}
        </Field>
        <Field label={t('camp.emp.col.last_name')}>{(id) => <input id={id} className={inputCls} value={f.lastName} onChange={(e) => set('lastName', e.target.value)} maxLength={100} />}</Field>
        <Field label={t('camp.emp.col.first_name')}>{(id) => <input id={id} className={inputCls} value={f.firstName} onChange={(e) => set('firstName', e.target.value)} maxLength={100} />}</Field>
      </div>
      <Field label={t('camp.emp.col.family_name')}>{(id) => <input id={id} className={inputCls} value={f.familyName} onChange={(e) => set('familyName', e.target.value)} maxLength={100} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.emp.col.position')} hint={t('camp.emp.position_hint')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.positionId} onChange={(e) => set('positionId', e.target.value)}>
              <option value="">{t('camp.emp.no_position')}</option>
              {usablePositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {localizedCatalogName(p, i18n.resolvedLanguage ?? i18n.language)}
                  {p.isActive ? '' : ` (${t('camp.common.inactive')})`}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('camp.emp.col.phone')}>{(id) => <input id={id} className={inputCls} value={f.phone} onChange={(e) => set('phone', e.target.value)} maxLength={50} />}</Field>
      </div>
      <Field
        label={t('camp.emp.col.extra_phones')}
        hint={badPhones.length ? t('camp.emp.extra_phones_bad', { values: badPhones.join(', ') }) : t('camp.emp.extra_phones_hint')}
      >
        {(id) => <input id={id} className={inputCls} value={f.extraPhones} onChange={(e) => set('extraPhones', e.target.value)} maxLength={300} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.emp.col.meal_location')} hint={t('camp.emp.meal_location_hint')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.mealLocationId} onChange={(e) => set('mealLocationId', e.target.value)}>
              <option value="">
                {t('camp.emp.inherit', {
                  from: inhFrom,
                  value: inh.locationName
                    ? localizedCatalogName(
                        {
                          name: inh.locationName,
                          nameI18n:
                            posSettings.data?.find((p) => p.positionId === f.positionId)?.mealLocationNameI18n ??
                            locations.data?.find((l) => l.id === settings.data?.defaultMealLocationId)?.nameI18n,
                        },
                        i18n.resolvedLanguage ?? i18n.language,
                      )
                    : '—',
                })}
              </option>
              {usableLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {localizedCatalogName(l, i18n.resolvedLanguage ?? i18n.language)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('camp.emp.col.meals_included')} hint={t('camp.emp.meals_hint')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.mealsIncluded} onChange={(e) => set('mealsIncluded', e.target.value)}>
              <option value="">{t('camp.emp.inherit', { from: inhFrom, value: inh.mealsIncluded ? t('camp.common.yes') : t('camp.emp.no_meals') })}</option>
              <option value="yes">{t('camp.common.yes')}</option>
              <option value="no">{t('camp.emp.no_meals')}</option>
            </select>
          )}
        </Field>
      </div>
      <Field label={t('camp.emp.col.email')} hint={t('camp.emp.email_hint')}>
        {(id) => <input id={id} type="email" className={inputCls} value={f.email} onChange={(e) => set('email', e.target.value)} maxLength={254} />}
      </Field>
      <Field label={t('camp.emp.organization')}>
        {(id) => (
          <select id={id} className={inputCls} value={f.organizationId} onChange={(e) => pickOrg(e.target.value)}>
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
                  {d.code} · {localizedCatalogName(d, i18n.resolvedLanguage ?? i18n.language)}
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
      {emp && <EmployeeAccess campId={campId} emp={emp} />}
      <ErrorBox error={m.error ?? orgs.error ?? depts.error} />
    </Modal>
  )
}

/** v0.2.1 (Д-2) — сонгосон ажилтнуудад нэг дор: хоол авах / ажлын хоолны байршил / албан тушаал (нэг transaction, түүхэнд) */
function BulkBar({ campId, ids, positions, onDone }: { campId: string; ids: string[]; positions: CatalogItem[]; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })
  const [action, setAction] = useState<'' | 'meals' | 'location' | 'position'>('')
  const [value, setValue] = useState('')
  const m = useAppMutation(
    () =>
      hrApi.bulkEmployees(campId, {
        ids,
        ...(action === 'meals' ? { mealsIncluded: toTri(value) } : {}),
        ...(action === 'location' ? { mealLocationId: value || null } : {}),
        ...(action === 'position' ? { positionId: value || null } : {}),
      }),
    [campKeys.employees(campId), campKeys.positionSettings(campId), ...campKeys.operational(campId)],
    () => {
      setAction('')
      setValue('')
      onDone()
    },
  )
  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 flex flex-wrap items-center gap-2 text-sm" role="region" aria-label={t('camp.emp.bulk.title')}>
      <span className="font-medium text-blue-900">{t('camp.emp.bulk.selected', { n: ids.length })}</span>
      <select
        aria-label={t('camp.emp.bulk.action')}
        className={`${inputSmCls} w-auto`}
        value={action}
        onChange={(e) => {
          setAction(e.target.value as typeof action)
          setValue(e.target.value === 'meals' ? 'no' : '')
        }}
      >
        <option value="">{t('camp.emp.bulk.choose')}</option>
        <option value="meals">{t('camp.emp.col.meals_included')}</option>
        <option value="location">{t('camp.emp.col.meal_location')}</option>
        <option value="position">{t('camp.emp.col.position')}</option>
      </select>
      {action === 'meals' && (
        <select aria-label={t('camp.emp.bulk.value')} className={`${inputSmCls} w-auto`} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="no">{t('camp.emp.no_meals')}</option>
          <option value="yes">{t('camp.common.yes')}</option>
          <option value="">{t('camp.emp.bulk.reset')}</option>
        </select>
      )}
      {action === 'location' && (
        <select aria-label={t('camp.emp.bulk.value')} className={`${inputSmCls} w-auto`} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">{t('camp.emp.bulk.reset')}</option>
          {locations.data
            ?.filter((l) => l.isActive)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {localizedCatalogName(l, i18n.resolvedLanguage ?? i18n.language)}
              </option>
            ))}
        </select>
      )}
      {action === 'position' && (
        <select aria-label={t('camp.emp.bulk.value')} className={`${inputSmCls} w-auto`} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">{t('camp.emp.no_position')}</option>
          {positions
            .filter((p) => p.isActive)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {localizedCatalogName(p, i18n.resolvedLanguage ?? i18n.language)}
              </option>
            ))}
        </select>
      )}
      <Button size="sm" disabled={!action} loading={m.isPending} onClick={() => m.mutate(undefined)}>
        {t('camp.emp.bulk.apply')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        {t('camp.emp.bulk.clear')}
      </Button>
      <div className="w-full">
        <ErrorBox error={m.error} />
      </div>
    </div>
  )
}
