import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-bridge'
import { hrApi } from '../api/hr-api'
import type { Crew } from '../api/camp-bridge'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { P } from '../../../core/permissions'
import { weekdayName } from '../../../core/labels'
import { isoWeekday } from '../../../core/dates'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, td } from '../../../core/ui'
import { useTranslation } from 'react-i18next'

/** Тохиргоо › Ростер (FB-06: "Баг" → "Ростер"). Ирэх өдөр нь кемпийн солигдох гарагтай таарна */
export default function CrewsPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useAppPermissions(campId)
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => hrApi.crews(campId) })
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const [modal, setModal] = useState<Crew | 'new' | null>(null)
  const canEdit = perms.can(P.MASTER_MANAGE)
  const changeover = settings.data?.changeoverWeekday ?? 3
  const cycle = settings.data ? settings.data.rosterOnDays + settings.data.rosterOffDays : 28

  return (
    <Card
      title={t('camp.crew.title')}
      actions={
        canEdit && (
          <Button size="sm" onClick={() => setModal('new')}>
            {t('camp.crew.add')}
          </Button>
        )
      }
    >
      <p className="text-xs text-gray-500 mb-3">
        {t('camp.crew.help', { cycle, weekday: weekdayName(changeover) })}
      </p>
      {(crews.isLoading || settings.isLoading) && <Loading />}
      <ErrorBox error={crews.error ?? settings.error} />
      {crews.data && crews.data.length === 0 && <Empty>{t('camp.crew.empty')}</Empty>}
      {crews.data && crews.data.length > 0 && (
        <Table head={[t('camp.common.code'), t('camp.common.name'), t('camp.crew.anchor'), t('camp.crew.employees'), t('camp.common.status'), '']}>
          {crews.data.map((c) => (
            <tr key={c.id}>
              <td className={`${td} font-mono font-medium`}>{c.code}</td>
              <td className={td}>{c.name ?? '—'}</td>
              <td className={td}>
                {c.rosterAnchorDate} <span className="text-gray-400">({weekdayName(isoWeekday(c.rosterAnchorDate))})</span>
              </td>
              <td className={td}>{c.employeeCount ?? '—'}</td>
              <td className={td}>
                <ActiveBadge active={c.isActive} />
              </td>
              <td className={`${td} text-right`}>
                {canEdit && (
                  <Button variant="ghost" onClick={() => setModal(c)}>
                    {t('camp.common.edit')}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {modal && <CrewModal campId={campId} crew={modal === 'new' ? null : modal} changeover={changeover} onClose={() => setModal(null)} />}
    </Card>
  )
}

function CrewModal({ campId, crew, changeover, onClose }: { campId: string; crew: Crew | null; changeover: number; onClose: () => void }) {
  const { t } = useTranslation()
  const [code, setCode] = useState(crew?.code ?? '')
  const [name, setName] = useState(crew?.name ?? '')
  const [anchor, setAnchor] = useState(crew?.rosterAnchorDate ?? '')
  const [isActive, setIsActive] = useState(crew?.isActive ?? true)
  const wrongDay = anchor !== '' && isoWeekday(anchor) !== changeover
  const m = useAppMutation(
    () =>
      crew
        ? hrApi.updateCrew(campId, crew.id, { name: name.trim() || null, rosterAnchorDate: anchor, isActive })
        : hrApi.createCrew(campId, { code: code.trim(), name: name.trim() || null, rosterAnchorDate: anchor }),
    [campKeys.crews(campId)],
    onClose,
  )
  return (
    <Modal
      title={crew ? t('camp.crew.edit_title', { code: crew.code }) : t('camp.crew.add_title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!anchor || wrongDay || (!crew && !code.trim())}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('camp.common.code')}>{(id) => <input id={id} className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} disabled={!!crew} maxLength={10} />}</Field>
        <div className="col-span-2">
          <Field label={t('camp.common.name')}>{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}</Field>
        </div>
      </div>
      <Field
        label={t('camp.crew.anchor')}
        hint={t('camp.crew.anchor_hint', { weekday: weekdayName(changeover) })}
        error={wrongDay ? t('camp.crew.wrong_day', { date: anchor, weekday: weekdayName(isoWeekday(anchor)), changeover: weekdayName(changeover) }) : null}
      >
        {(id) => <input id={id} type="date" className={inputCls} value={anchor} onChange={(e) => setAnchor(e.target.value)} />}
      </Field>
      {crew && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> {t('camp.common.active')}
        </label>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}
