import { useEffect, useState } from 'react'
import { Navigate, NavLink, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import type { Camp, CampSettings, MealLocation } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { weekdayName, weekdayNames } from '../lib/labels'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Table, inputCls, td } from '../components/ui'
import FacilitiesPage from './FacilitiesPage'
import PositionSettingsPage from './PositionSettingsPage'
import MealOrderSettings from '../components/MealOrderSettings'

/**
 * /camp/:campId/settings/:section — кемпийн тохиргооны каталог (FB-05, v0.2.0):
 * зүүн цэс (Ерөнхий · Хоолны байршил · Албан тушаалын хоол/ээлж · Байр, өрөө) → баруун талд тухайн хэсэг.
 * Хуучин /facilities → энд redirect. v0.2.2 H2: хэлтэс, бригад → «Хүний нөөц» (/hr/:campId/...) (CampRoutes).
 */
export const SETTINGS_SECTIONS = ['general', 'meal-locations', 'meal-orders', 'positions', 'facilities'] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export default function CampSettingsPage() {
  const { t } = useTranslation()
  const { section = 'general', campId = '' } = useParams()
  // relative="path": "..", URL-ийн нэг сегмент (route-relative бол :campId хүртэл гарч буруу хаяг болдог)
  if (!(SETTINGS_SECTIONS as readonly string[]).includes(section)) return <Navigate to="../general" relative="path" replace />
  return (
    <div className="flex flex-col gap-5 md:flex-row">
      <nav aria-label={t('camp.settings.menu')} className="md:w-52 shrink-0 flex md:flex-col gap-1 overflow-x-auto">
        {SETTINGS_SECTIONS.map((s) => (
          <NavLink
            key={s}
            to={`../${s}`}
            relative="path"
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg text-sm whitespace-nowrap ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`
            }
          >
            {t(`camp.settings.section.${s}`)}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {section === 'general' && <GeneralSection />}
        {section === 'meal-locations' && <MealLocationsSection />}
        {section === 'meal-orders' && <MealOrderSettings campId={campId} />}
        {section === 'positions' && <PositionSettingsPage />}
        {section === 'facilities' && <FacilitiesPage />}
      </div>
    </div>
  )
}

function GeneralSection() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const camp = useQuery({ queryKey: campKeys.camp(campId), queryFn: () => campApi.camp(campId) })
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {camp.data && <CampInfoCard camp={camp.data} canEdit={perms.can(P.MASTER_MANAGE)} />}
      <Card title={t('camp.settings.camp_settings')}>
        {(settings.isLoading || locations.isLoading) && <Loading />}
        <ErrorBox error={settings.error} />
        {settings.data && locations.data && (
          <SettingsForm campId={campId} s={settings.data} locations={locations.data} canEdit={perms.can(P.SETTINGS_MANAGE)} />
        )}
      </Card>
    </div>
  )
}

function MealLocationsSection() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })
  return (
    <Card title={t('camp.settings.meal_locations')}>
      {locations.isLoading && <Loading />}
      <ErrorBox error={locations.error} />
      {locations.data && <MealLocations campId={campId} rows={locations.data} canEdit={perms.can(P.SETTINGS_MANAGE)} />}
    </Card>
  )
}

function CampInfoCard({ camp, canEdit }: { camp: Camp; canEdit: boolean }) {
  const { t } = useTranslation()
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
    <Card title={t('camp.settings.camp_info')}>
      <div className="space-y-3">
        <Field label={t('camp.common.code')} hint={t('camp.settings.code_fixed')}>
          {(id) => <input id={id} className={inputCls} value={camp.code} disabled />}
        </Field>
        <Field label={t('camp.common.name')}>
          {(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={200} />}
        </Field>
        <Field label={t('camp.common.location')}>
          {(id) => <input id={id} className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} disabled={!canEdit} maxLength={300} />}
        </Field>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={!canEdit} /> {t('camp.common.active')}
        </label>
        <ErrorBox error={m.error} />
        {canEdit && (
          <div className="flex items-center gap-3">
            <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!dirty || !name.trim()}>
              {t('camp.common.save')}
            </Button>
            {m.isSuccess && !dirty && <span className="text-sm text-green-600">{t('camp.common.saved')}</span>}
          </div>
        )}
      </div>
    </Card>
  )
}

function SettingsForm({ campId, s, locations, canEdit }: { campId: string; s: CampSettings; locations: MealLocation[]; canEdit: boolean }) {
  const { t } = useTranslation()
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
    autoCodePrefix: s.autoCodePrefix ?? 'Z',
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
        autoCodePrefix: f.autoCodePrefix.trim().toUpperCase(),
      }),
    [campKeys.settings(campId)],
  )
  const activeLocations = locations.filter((l) => l.isActive || l.id === f.defaultMealLocationId)
  const cycle = Number(f.rosterOnDays) + Number(f.rosterOffDays)

  return (
    <form
      className="space-y-3"
      noValidate // шалгалтыг backend хийж хэрэглэгчийн хэлээр мессеж буцаана (браузерын мессеж биш)
      onSubmit={(e) => {
        e.preventDefault()
        m.mutate(undefined)
      }}
    >
      {!s.configured && <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">{t('camp.settings.defaults_note')}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('camp.settings.vat')}>
          {(id) => <input id={id} type="number" step="0.01" min={0} max={99.99} className={inputCls} value={f.vatRate} onChange={(e) => set('vatRate', e.target.value)} disabled={!canEdit} />}
        </Field>
        <Field label={t('camp.settings.changeover')}>
          {(id) => (
            <select id={id} className={inputCls} value={f.changeoverWeekday} onChange={(e) => set('changeoverWeekday', e.target.value)} disabled={!canEdit}>
              {weekdayNames().map((w, i) => (
                <option key={i} value={i}>
                  {w}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('camp.settings.on_days')}>
          {(id) => <input id={id} type="number" min={1} max={28} className={inputCls} value={f.rosterOnDays} onChange={(e) => set('rosterOnDays', e.target.value)} disabled={!canEdit} />}
        </Field>
        <Field label={t('camp.settings.off_days')} hint={t('camp.settings.off_days_hint')}>
          {(id) => <input id={id} type="number" min={2} max={28} className={inputCls} value={f.rosterOffDays} onChange={(e) => set('rosterOffDays', e.target.value)} disabled={!canEdit} />}
        </Field>
      </div>
      {Number.isFinite(cycle) && cycle > 0 && (
        <p className="text-xs text-gray-500">
          {t('camp.settings.cycle', { cycle, weekday: weekdayName(Number(f.changeoverWeekday)), on: f.rosterOnDays })}
        </p>
      )}
      <Field label={t('camp.settings.cutoff')} hint={t('camp.settings.cutoff_hint')}>
        {(id) => <input id={id} type="time" className={inputCls} value={f.mealOrderCutoffTime} onChange={(e) => set('mealOrderCutoffTime', e.target.value)} disabled={!canEdit} />}
      </Field>
      <Field label={t('camp.settings.default_location')} hint={t('camp.settings.default_location_hint')}>
        {(id) => (
          <select id={id} className={inputCls} value={f.defaultMealLocationId} onChange={(e) => set('defaultMealLocationId', e.target.value)} disabled={!canEdit}>
            <option value="">{t('camp.common.not_selected')}</option>
            {activeLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('camp.settings.catering')} hint={t('camp.settings.catering_hint')}>
        {(id) => (
          <select id={id} className={inputCls} value={f.cateringOrganizationId} onChange={(e) => set('cateringOrganizationId', e.target.value)} disabled={!canEdit}>
            <option value="">{t('camp.common.not_selected')}</option>
            {catering.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {f.cateringOrganizationId && catering.data && !catering.data.some((o) => o.id === f.cateringOrganizationId) && (
              <option value={f.cateringOrganizationId}>{t('camp.settings.catering_current_invalid')}</option>
            )}
          </select>
        )}
      </Field>
      <Field label={t('camp.settings.auto_code_prefix')} hint={t('camp.settings.auto_code_prefix_hint', { example: `${(f.autoCodePrefix || 'Z').toUpperCase()}0001` })}>
        {(id) => (
          <input
            id={id}
            className={`${inputCls} font-mono uppercase`}
            maxLength={3}
            value={f.autoCodePrefix}
            onChange={(e) => set('autoCodePrefix', e.target.value.replace(/[^a-zA-Z]/g, ''))}
            disabled={!canEdit}
          />
        )}
      </Field>
      <ErrorBox error={m.error ?? catering.error} />
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" loading={m.isPending}>
            {t('camp.settings.save_settings')}
          </Button>
          {m.isSuccess && <span className="text-sm text-green-600">{t('camp.common.saved')}</span>}
        </div>
      )}
    </form>
  )
}

function MealLocations({ campId, rows, canEdit }: { campId: string; rows: MealLocation[]; canEdit: boolean }) {
  const { t } = useTranslation()
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
        <Empty>{t('camp.settings.no_locations')}</Empty>
      ) : (
        <Table head={[t('camp.common.name'), t('camp.common.status'), '']}>
          {rows.map((l) => (
            <tr key={l.id}>
              <td className={td}>
                {editing?.id === l.id ? (
                  <input
                    aria-label={t('camp.settings.location_name')}
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
                        {t('camp.common.save')}
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing(null)}>
                        {t('camp.common.cancel')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" onClick={() => setEditing({ id: l.id, name: l.name })}>
                        {t('camp.common.rename')}
                      </Button>
                      <Button variant="ghost" onClick={() => update.mutate({ id: l.id, isActive: !l.isActive })}>
                        {l.isActive ? t('camp.common.deactivate') : t('camp.common.activate')}
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
          <input
            aria-label={t('camp.settings.new_location')}
            className={inputCls}
            placeholder={t('camp.settings.new_location')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
          <Button type="submit" loading={add.isPending} disabled={!name.trim()}>
            {t('camp.common.add')}
          </Button>
        </form>
      )}
      <ErrorBox error={add.error ?? update.error} />
    </div>
  )
}
