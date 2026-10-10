import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { Camp, CampSettings, MealLocation } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { WEEKDAYS } from '../lib/labels'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Table, inputCls, td } from '../components/ui'

/** /camp/:campId/settings — кемпийн мэдээлэл, тохиргоо (НӨАТ, ростер, байршил, катеринг), хоол идэх байршил */
export default function CampSettingsPage() {
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const camp = useQuery({ queryKey: campKeys.camp(campId), queryFn: () => campApi.camp(campId) })
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        {camp.data && <CampInfoCard camp={camp.data} canEdit={perms.can(P.MASTER_MANAGE)} />}
        <Card title="Хоол идэх байршил">
          {locations.isLoading && <Loading />}
          <ErrorBox error={locations.error} />
          {locations.data && <MealLocations campId={campId} rows={locations.data} canEdit={perms.can(P.SETTINGS_MANAGE)} />}
        </Card>
      </div>
      <Card title="Кемпийн тохиргоо">
        {(settings.isLoading || locations.isLoading) && <Loading />}
        <ErrorBox error={settings.error} />
        {settings.data && locations.data && (
          <SettingsForm campId={campId} s={settings.data} locations={locations.data} canEdit={perms.can(P.SETTINGS_MANAGE)} />
        )}
      </Card>
    </div>
  )
}

function CampInfoCard({ camp, canEdit }: { camp: Camp; canEdit: boolean }) {
  const [name, setName] = useState(camp.name)
  const [location, setLocation] = useState(camp.location ?? '')
  const [isActive, setIsActive] = useState(camp.isActive)
  useEffect(() => {
    setName(camp.name)
    setLocation(camp.location ?? '')
    setIsActive(camp.isActive)
  }, [camp])
  const m = useCampMutation(
    () => campApi.updateCamp(camp.id, { name: name.trim(), location: location.trim() || null, isActive }),
    [campKeys.camps],
  )
  const dirty = name !== camp.name || location !== (camp.location ?? '') || isActive !== camp.isActive
  return (
    <Card title="Кемпийн мэдээлэл">
      <div className="space-y-3">
        <Field label="Код" hint="Код өөрчлөгдөхгүй">
          {(id) => <input id={id} className={inputCls} value={camp.code} disabled />}
        </Field>
        <Field label="Нэр">
          {(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={200} />}
        </Field>
        <Field label="Байршил">
          {(id) => <input id={id} className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} disabled={!canEdit} maxLength={300} />}
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={!canEdit} /> Идэвхтэй
        </label>
        <ErrorBox error={m.error} />
        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!dirty || !name.trim()}>
              Хадгалах
            </Button>
            {m.isSuccess && !dirty && <span className="text-sm text-green-600">Хадгалагдлаа</span>}
          </div>
        )}
      </div>
    </Card>
  )
}

function SettingsForm({ campId, s, locations, canEdit }: { campId: string; s: CampSettings; locations: MealLocation[]; canEdit: boolean }) {
  const catering = useQuery({
    queryKey: [...campKeys.organizations, 'catering'],
    queryFn: () => campApi.organizations({ activeOnly: true, serviceType: 'CATERING' }),
  })
  const init = () => ({
    vatRate: s.vatRate,
    changeoverWeekday: String(s.changeoverWeekday),
    rosterOnDays: String(s.rosterOnDays),
    rosterOffDays: String(s.rosterOffDays),
    mealOrderCutoffTime: s.mealOrderCutoffTime ?? '',
    defaultMealLocationId: s.defaultMealLocationId ?? '',
    cateringOrganizationId: s.cateringOrganizationId ?? '',
  })
  const [f, setF] = useState(init)
  // сервер дээр хадгалагдсан утга өөрчлөгдвөл (хадгалсны дараа) формыг шинэчилнэ
  useEffect(() => setF(init()), [s])
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))

  const m = useCampMutation(
    () =>
      campApi.saveSettings(campId, {
        vatRate: Number(f.vatRate),
        changeoverWeekday: Number(f.changeoverWeekday),
        rosterOnDays: Number(f.rosterOnDays),
        rosterOffDays: Number(f.rosterOffDays),
        mealOrderCutoffTime: f.mealOrderCutoffTime || null,
        defaultMealLocationId: f.defaultMealLocationId || null,
        cateringOrganizationId: f.cateringOrganizationId || null,
      }),
    [campKeys.settings(campId)],
  )
  const activeLocations = locations.filter((l) => l.isActive || l.id === f.defaultMealLocationId)
  const cycle = Number(f.rosterOnDays) + Number(f.rosterOffDays)

  return (
    <form
      className="space-y-3"
      noValidate // шалгалтыг backend хийж монгол мессеж буцаана (браузерын англи мессеж биш)
      onSubmit={(e) => {
        e.preventDefault()
        m.mutate(undefined)
      }}
    >
      {!s.configured && <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">Анхдагч утгууд — хадгалахад тохиргоо үүснэ.</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="НӨАТ (%)">
          {(id) => <input id={id} type="number" step="0.01" min={0} max={99.99} className={inputCls} value={f.vatRate} onChange={(e) => set('vatRate', e.target.value)} disabled={!canEdit} />}
        </Field>
        <Field label="Ээлж солигдох гараг">
          {(id) => (
            <select id={id} className={inputCls} value={f.changeoverWeekday} onChange={(e) => set('changeoverWeekday', e.target.value)} disabled={!canEdit}>
              {WEEKDAYS.map((w, i) => (
                <option key={i} value={i}>
                  {w}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Ажиллах хоног">
          {(id) => <input id={id} type="number" min={1} max={28} className={inputCls} value={f.rosterOnDays} onChange={(e) => set('rosterOnDays', e.target.value)} disabled={!canEdit} />}
        </Field>
        <Field label="Амрах хоног" hint="Ирэх, явах замын хоног амралтад орно (≥ 2)">
          {(id) => <input id={id} type="number" min={2} max={28} className={inputCls} value={f.rosterOffDays} onChange={(e) => set('rosterOffDays', e.target.value)} disabled={!canEdit} />}
        </Field>
      </div>
      {Number.isFinite(cycle) && cycle > 0 && (
        <p className="text-xs text-gray-500">
          Мөчлөг {cycle} хоног: {WEEKDAYS[Number(f.changeoverWeekday)]} ирж, {f.rosterOnDays} хоног ажиллаад дараагийн өдөр нь явна.
        </p>
      )}
      <Field label="Хоолны захиалгын эцсийн цаг" hint="Хоосон = хязгааргүй">
        {(id) => <input id={id} type="time" className={inputCls} value={f.mealOrderCutoffTime} onChange={(e) => set('mealOrderCutoffTime', e.target.value)} disabled={!canEdit} />}
      </Field>
      <Field label="Анхдагч хоол идэх байршил" hint="Кемпийн гал тогоо — өглөө, оройн хоол энд">
        {(id) => (
          <select id={id} className={inputCls} value={f.defaultMealLocationId} onChange={(e) => set('defaultMealLocationId', e.target.value)} disabled={!canEdit}>
            <option value="">— Сонгоогүй —</option>
            {activeLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Катерингийн үйлчилгээ үзүүлэгч" hint="Засварын сэлбэгийн зардал энэ байгууллагад бүртгэгдэнэ. Жагсаалтад зөвхөн 'Катеринг' төрөлтэй идэвхтэй байгууллага.">
        {(id) => (
          <select id={id} className={inputCls} value={f.cateringOrganizationId} onChange={(e) => set('cateringOrganizationId', e.target.value)} disabled={!canEdit}>
            <option value="">— Сонгоогүй —</option>
            {catering.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {f.cateringOrganizationId && catering.data && !catering.data.some((o) => o.id === f.cateringOrganizationId) && (
              <option value={f.cateringOrganizationId}>(одоогийн — идэвхгүй/катеринг биш)</option>
            )}
          </select>
        )}
      </Field>
      <ErrorBox error={m.error ?? catering.error} />
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" loading={m.isPending}>
            Тохиргоо хадгалах
          </Button>
          {m.isSuccess && <span className="text-sm text-green-600">Хадгалагдлаа</span>}
        </div>
      )}
    </form>
  )
}

function MealLocations({ campId, rows, canEdit }: { campId: string; rows: MealLocation[]; canEdit: boolean }) {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const add = useCampMutation(() => campApi.createMealLocation(campId, name.trim()), [campKeys.mealLocations(campId)], () => setName(''))
  const update = useCampMutation(
    (v: { id: string; name?: string; isActive?: boolean }) => campApi.updateMealLocation(campId, v.id, { name: v.name, isActive: v.isActive }),
    [campKeys.mealLocations(campId), campKeys.departments(campId)],
    () => setEditing(null),
  )
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <Empty>Байршил бүртгэгдээгүй (жнь: Кемпийн гал тогоо, Уулын хэсэг)</Empty>
      ) : (
        <Table head={['Нэр', 'Төлөв', '']}>
          {rows.map((l) => (
            <tr key={l.id}>
              <td className={td}>
                {editing?.id === l.id ? (
                  <input
                    aria-label="Байршлын нэр"
                    className={inputCls}
                    value={editing.name}
                    onChange={(e) => setEditing({ id: l.id, name: e.target.value })}
                    maxLength={100}
                    autoFocus
                  />
                ) : (
                  l.name
                )}
              </td>
              <td className={td}>
                <ActiveBadge active={l.isActive} />
              </td>
              <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                {canEdit &&
                  (editing?.id === l.id ? (
                    <>
                      <Button
                        variant="ghost"
                        disabled={!editing.name.trim() || editing.name.trim() === l.name}
                        onClick={() => update.mutate({ id: l.id, name: editing.name.trim() })}
                      >
                        Хадгалах
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing(null)}>
                        Болих
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" onClick={() => setEditing({ id: l.id, name: l.name })}>
                        Нэр солих
                      </Button>
                      <Button variant="ghost" onClick={() => update.mutate({ id: l.id, isActive: !l.isActive })}>
                        {l.isActive ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
                      </Button>
                    </>
                  ))}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {canEdit && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) add.mutate(undefined)
          }}
        >
          <input aria-label="Шинэ байршлын нэр" className={inputCls} placeholder="Шинэ байршлын нэр" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <Button type="submit" loading={add.isPending} disabled={!name.trim()}>
            Нэмэх
          </Button>
        </form>
      )}
      <ErrorBox error={add.error ?? update.error} />
    </div>
  )
}
