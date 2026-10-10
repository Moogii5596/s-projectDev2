import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { Crew } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { WEEKDAYS } from '../lib/labels'
import { isoWeekday } from '../lib/dates'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, Table, inputCls, td } from '../components/ui'

/** /camp/:campId/crews — баг (ростер). Ирэх өдөр нь кемпийн солигдох гарагтай таарна */
export default function CrewsPage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const crews = useQuery({ queryKey: campKeys.crews(campId), queryFn: () => campApi.crews(campId) })
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const [modal, setModal] = useState<Crew | 'new' | null>(null)
  const canEdit = perms.can(P.MASTER_MANAGE)
  const changeover = settings.data?.changeoverWeekday ?? 3
  const cycle = settings.data ? settings.data.rosterOnDays + settings.data.rosterOffDays : 28

  return (
    <Card title="Баг (ростер)" actions={canEdit && <Button size="sm" onClick={() => setModal('new')}>+ Баг</Button>}>
      <p className="text-xs text-gray-500 mb-3">
        Баг бүр {cycle} хоногийн мөчлөгтэй. "Ирэх өдөр" — багийн ирдэг аль нэг {WEEKDAYS[changeover]} гараг (жнь А баг 2026-10-07). Үүнээс
        хойш/өмнө {cycle} хоног тутам давтагдана.
      </p>
      {(crews.isLoading || settings.isLoading) && <Loading />}
      <ErrorBox error={crews.error ?? settings.error} />
      {crews.data && crews.data.length === 0 && <Empty>Баг бүртгэгдээгүй</Empty>}
      {crews.data && crews.data.length > 0 && (
        <Table head={['Код', 'Нэр', 'Ирэх өдөр', 'Төлөв', '']}>
          {crews.data.map((c) => (
            <tr key={c.id}>
              <td className={`${td} font-mono font-medium`}>{c.code}</td>
              <td className={td}>{c.name ?? '—'}</td>
              <td className={td}>
                {c.rosterAnchorDate} <span className="text-gray-400">({WEEKDAYS[isoWeekday(c.rosterAnchorDate)]})</span>
              </td>
              <td className={td}>
                <ActiveBadge active={c.isActive} />
              </td>
              <td className={`${td} text-right`}>
                {canEdit && (
                  <Button variant="ghost" onClick={() => setModal(c)}>
                    Засах
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
  const [code, setCode] = useState(crew?.code ?? '')
  const [name, setName] = useState(crew?.name ?? '')
  const [anchor, setAnchor] = useState(crew?.rosterAnchorDate ?? '')
  const [isActive, setIsActive] = useState(crew?.isActive ?? true)
  const wrongDay = anchor !== '' && isoWeekday(anchor) !== changeover
  const m = useCampMutation(
    () =>
      crew
        ? campApi.updateCrew(campId, crew.id, { name: name.trim() || null, rosterAnchorDate: anchor, isActive })
        : campApi.createCrew(campId, { code: code.trim(), name: name.trim() || null, rosterAnchorDate: anchor }),
    [campKeys.crews(campId)],
    onClose,
  )
  return (
    <Modal
      title={crew ? `Баг ${crew.code} засах` : 'Баг нэмэх'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!anchor || wrongDay || (!crew && !code.trim())}>
            Хадгалах
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Код">{(id) => <input id={id} className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} disabled={!!crew} maxLength={10} />}</Field>
        <div className="col-span-2">
          <Field label="Нэр">{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />}</Field>
        </div>
      </div>
      <Field
        label="Ирэх өдөр"
        hint={`${WEEKDAYS[changeover]} гараг байх ёстой`}
        error={wrongDay ? `${anchor} нь ${WEEKDAYS[isoWeekday(anchor)]} — кемпийн солигдох гараг ${WEEKDAYS[changeover]}` : null}
      >
        {(id) => <input id={id} type="date" className={inputCls} value={anchor} onChange={(e) => setAnchor(e.target.value)} />}
      </Field>
      {crew && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Идэвхтэй
        </label>
      )}
      <ErrorBox error={m.error} />
    </Modal>
  )
}
