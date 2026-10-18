import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { hrApi } from '../api/hr-api'
import type { EmployeeProfile, TerminationReason } from '../../camp/api/types'
import { campKeys } from '../../camp/hooks/useCampPermissions'
import { useCampMutation } from '../../camp/hooks/useCampMutation'
import { DIRECTION_LABEL, EMPLOYEE_STATUS_LABEL, MEAL_LABEL, TERMINATION_REASON_LABEL } from '../../camp/lib/labels'
import { todayUb } from '../../camp/lib/dates'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, td } from '../../camp/components/ui'
import { lifecycleActions, terminationEffects, terminationFormError, TERMINATION_REASONS, type TerminationForm } from '../lib/termination'

type Tab = 'info' | 'attendance' | 'rooms' | 'history' | 'views'
const STATUS_TONE = { ACTIVE: 'green', INACTIVE: 'gray', TERMINATED: 'red' } as const
const dateTime = (iso: string) => new Date(iso).toLocaleString()

/**
 * /hr/:campId/employees/:employeeId — v0.2.2 Блок 5 ажилтны профайл (C-09, PIL-03).
 * Нээх бүрт хувийн мэдээлэл үзсэн лог (backend, 15 мин-д 1). Ажлаас гаргах / дахин ажилд авах — `camp.employee.terminate`.
 * «Хэн үзсэн» — системийн админ (SEC-009). Хөрөнгийн таб v0.2.3-т (B5-Q1).
 */
export default function EmployeeProfilePage() {
  const { t } = useTranslation()
  const { campId = '', employeeId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('info')
  const [dialog, setDialog] = useState<'terminate' | 'rehire' | null>(null)
  const profile = useQuery({
    queryKey: campKeys.employeeProfile(campId, employeeId),
    queryFn: () => hrApi.employeeProfile(campId, employeeId),
    // PII лог — дахин дахин ачаалахгүй (цонх руу буцахад)
    refetchOnWindowFocus: false,
  })
  const p = profile.data
  const actions = p ? lifecycleActions(p) : { terminate: false, rehire: false }
  const tabs: Tab[] = ['info', 'attendance', 'rooms', 'history', ...(p?.can.viewPiiLog ? (['views'] as const) : [])]

  return (
    <div className="space-y-4">
      <Link to={`/hr/${campId}/employees`} className="text-sm text-blue-600 hover:underline">
        ← {t('hr.profile.back')}
      </Link>
      {profile.isLoading && <Loading />}
      <ErrorBox error={profile.error} onRetry={() => profile.refetch()} />
      {p && (
        <>
          <Card
            title={`${p.employeeCode} · ${p.fullName}`}
            actions={
              <div className="flex flex-wrap gap-2">
                {actions.terminate && (
                  <Button size="sm" variant="danger" onClick={() => setDialog('terminate')}>
                    {t('hr.term.action')}
                  </Button>
                )}
                {actions.rehire && (
                  <Button size="sm" onClick={() => setDialog('rehire')}>
                    {t('hr.rehire.action')}
                  </Button>
                )}
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge tone={STATUS_TONE[p.status]}>{EMPLOYEE_STATUS_LABEL[p.status]}</Badge>
              {p.status === 'TERMINATED' && p.terminatedAt && (
                <span className="text-gray-600">
                  {t('hr.profile.terminated_on', { date: p.terminatedAt })}
                  {p.terminationReason && ` · ${TERMINATION_REASON_LABEL[p.terminationReason]}`}
                  {p.terminationNote && ` — ${p.terminationNote}`}
                </span>
              )}
              {p.rehiredFrom && (
                <Link className="text-blue-600 hover:underline" to={`/hr/${campId}/employees/${p.rehiredFrom.id}`}>
                  {t('hr.profile.rehired_from', { code: p.rehiredFrom.employeeCode, date: p.rehiredFrom.terminatedAt ?? '' })}
                </Link>
              )}
              {p.rehiredAs && (
                <Link className="text-blue-600 hover:underline" to={`/hr/${campId}/employees/${p.rehiredAs.id}`}>
                  {t('hr.profile.rehired_as', { code: p.rehiredAs.employeeCode })}
                </Link>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-400">{t('hr.profile.pii_notice')}</p>
          </Card>

          <div role="tablist" className="flex flex-wrap gap-1 border-b border-gray-200">
            {tabs.map((k) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === k ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {t(`hr.profile.tab.${k}`)}
              </button>
            ))}
          </div>

          {tab === 'info' && <InfoTab p={p} />}
          {tab === 'attendance' && <AttendanceTab p={p} />}
          {tab === 'rooms' && <RoomsTab p={p} />}
          {tab === 'history' && <HistoryTab p={p} />}
          {tab === 'views' && <ViewsTab campId={campId} employeeId={employeeId} />}

          {dialog === 'terminate' && <TerminateDialog campId={campId} p={p} onClose={() => setDialog(null)} />}
          {dialog === 'rehire' && <RehireDialog campId={campId} p={p} onClose={() => setDialog(null)} />}
        </>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-gray-50 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="col-span-2 text-gray-900 break-words">{children ?? '—'}</dd>
    </div>
  )
}

function InfoTab({ p }: { p: EmployeeProfile }) {
  const { t } = useTranslation()
  return (
    <Card>
      <dl>
        <Row label={t('camp.emp.col.position')}>{p.positionRef?.name ?? p.position}</Row>
        <Row label={t('camp.emp.department')}>{`${p.department.code} · ${p.department.name}`}</Row>
        <Row label={t('camp.emp.crew')}>{p.crew?.code ?? t('camp.emp.no_crew')}</Row>
        <Row label={t('camp.emp.organization')}>{p.organization.name}</Row>
        <Row label={t('camp.emp.col.phone')}>{p.phone}</Row>
        <Row label={t('camp.emp.col.email')}>{p.email}</Row>
        <Row label={t('hr.profile.login')}>
          {p.user ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={p.user.isActive ? 'green' : 'red'}>{p.user.isActive ? t('camp.common.active') : t('camp.common.inactive')}</Badge>
              <span className="font-mono">{p.user.phone ?? p.user.username ?? '—'}</span>
            </span>
          ) : (
            t('hr.profile.no_login')
          )}
        </Row>
        <Row label={t('hr.profile.registered')}>{dateTime(p.createdAt)}</Row>
      </dl>
    </Card>
  )
}

function AttendanceTab({ p }: { p: EmployeeProfile }) {
  const { t } = useTranslation()
  return (
    <Card>
      <p className="mb-3 text-sm text-gray-700">
        {p.attendance.inCampSince ? t('hr.profile.in_camp_since', { date: p.attendance.inCampSince }) : t('hr.profile.not_in_camp')}
      </p>
      {p.attendance.movements.length === 0 ? (
        <Empty>{t('hr.profile.no_movements')}</Empty>
      ) : (
        <Table head={[t('hr.profile.col.date'), t('hr.profile.col.direction'), t('hr.profile.col.meals')]}>
          {p.attendance.movements.map((m) => (
            <tr key={m.id}>
              <td className={`${td} font-mono`}>{m.movementDate}</td>
              <td className={td}>{DIRECTION_LABEL[m.direction]}</td>
              <td className={`${td} text-gray-600`}>{m.meals.length ? m.meals.map((x) => MEAL_LABEL[x]).join(', ') : '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  )
}

function RoomsTab({ p }: { p: EmployeeProfile }) {
  const { t } = useTranslation()
  return (
    <Card>
      {p.rooms.length === 0 ? (
        <Empty>{t('hr.profile.no_rooms')}</Empty>
      ) : (
        <Table head={[t('hr.profile.col.room'), t('hr.profile.col.from'), t('hr.profile.col.to')]}>
          {p.rooms.map((r) => (
            <tr key={r.id}>
              <td className={td}>{`${r.buildingName} · ${r.roomNo}`}</td>
              <td className={`${td} font-mono`}>{r.startDate}</td>
              <td className={`${td} font-mono`}>{r.endDate ?? <Badge tone="green">{t('hr.profile.current')}</Badge>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  )
}

function HistoryTab({ p }: { p: EmployeeProfile }) {
  const { t } = useTranslation()
  return (
    <Card>
      {p.history.length === 0 ? (
        <Empty>{t('hr.profile.no_history')}</Empty>
      ) : (
        <ul className="divide-y divide-gray-100">
          {p.history.map((h) => (
            <li key={h.id} className="py-2 text-sm">
              <div className="text-gray-900">{h.summary}</div>
              <div className="text-xs text-gray-400">
                {dateTime(h.createdAt)} · {h.actorName ?? '—'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ViewsTab({ campId, employeeId }: { campId: string; employeeId: string }) {
  const { t } = useTranslation()
  const views = useQuery({ queryKey: campKeys.piiViews(campId, employeeId), queryFn: () => hrApi.piiViews(campId, employeeId) })
  return (
    <Card>
      <p className="mb-3 text-xs text-gray-500">{t('hr.profile.views_hint')}</p>
      {views.isLoading && <Loading />}
      <ErrorBox error={views.error} onRetry={() => views.refetch()} />
      {views.data && views.data.data.length === 0 && <Empty>{t('hr.profile.no_views')}</Empty>}
      {views.data && views.data.data.length > 0 && (
        <Table head={[t('hr.profile.col.viewer'), t('hr.profile.col.viewed_at')]}>
          {views.data.data.map((v) => (
            <tr key={v.id}>
              <td className={td}>{v.viewerName ?? '—'}</td>
              <td className={`${td} text-gray-600`}>{dateTime(v.viewedAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  )
}

function TerminateDialog({ campId, p, onClose }: { campId: string; p: EmployeeProfile; onClose: () => void }) {
  const { t } = useTranslation()
  const today = todayUb()
  const [form, setForm] = useState<TerminationForm>({ date: today, reason: '', note: '' })
  const [touched, setTouched] = useState(false)
  const err = terminationFormError(form, today)
  const mut = useCampMutation(
    () => hrApi.terminateEmployee(campId, p.id, { date: form.date, reason: form.reason as TerminationReason, note: form.note.trim() || null }),
    [campKeys.employees(campId), campKeys.users, campKeys.stays(campId), campKeys.roomBoard(campId), campKeys.allocations(campId), campKeys.movements(campId)],
    onClose,
  )
  const submit = () => {
    setTouched(true)
    if (!err) mut.mutate(undefined)
  }
  return (
    <Modal
      title={t('hr.term.title', { code: p.employeeCode, name: p.fullName })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button variant="danger" loading={mut.isPending} onClick={submit}>
            {t('hr.term.submit')}
          </Button>
        </>
      }
    >
      <Field label={t('hr.term.date')} hint={t('hr.term.date_hint')}>
        {(id) => <input id={id} type="date" max={today} className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}
      </Field>
      <Field label={t('hr.term.reason')}>
        {(id) => (
          <select id={id} className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value as TerminationReason | '' })}>
            <option value="">{t('camp.common.choose')}</option>
            {TERMINATION_REASONS.map((r) => (
              <option key={r} value={r}>
                {TERMINATION_REASON_LABEL[r]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={form.reason === 'OTHER' ? t('hr.term.note_required') : t('hr.term.note')}>
        {(id) => <textarea id={id} rows={2} maxLength={500} className={inputCls} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}
      </Field>
      <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <p className="font-medium mb-1">{t('hr.term.effects')}</p>
        <ul className="list-disc pl-4 space-y-0.5">
          {terminationEffects(p, form.date).map((e) => (
            <li key={e.key}>{t(e.key, e.params)}</li>
          ))}
        </ul>
      </div>
      {touched && err && <p className="text-sm text-red-600">{t(err, { today })}</p>}
      <ErrorBox error={mut.error} />
    </Modal>
  )
}

function RehireDialog({ campId, p, onClose }: { campId: string; p: EmployeeProfile; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState(p.employeeCode)
  const [transferUser, setTransferUser] = useState(true)
  const mut = useCampMutation(
    () => hrApi.rehireEmployee(campId, p.id, { employeeCode: code.trim() === p.employeeCode ? undefined : code.trim(), transferUser: p.user ? transferUser : false }),
    [campKeys.employees(campId), campKeys.users],
    (res) => {
      onClose()
      navigate(`/hr/${campId}/employees/${res.id}`)
    },
  )
  return (
    <Modal
      title={t('hr.rehire.title', { name: p.fullName })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button loading={mut.isPending} disabled={!code.trim()} onClick={() => mut.mutate(undefined)}>
            {t('hr.rehire.submit')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600">{t('hr.rehire.hint')}</p>
      <Field label={t('camp.emp.col.code')} hint={t('hr.rehire.code_hint')}>
        {(id) => <input id={id} className={inputCls} value={code} maxLength={50} onChange={(e) => setCode(e.target.value)} />}
      </Field>
      {p.user && (
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-0.5" checked={transferUser} onChange={(e) => setTransferUser(e.target.checked)} />
          <span>{t('hr.rehire.transfer_user', { login: p.user.phone ?? p.user.username ?? '' })}</span>
        </label>
      )}
      <ErrorBox error={mut.error} />
    </Modal>
  )
}
