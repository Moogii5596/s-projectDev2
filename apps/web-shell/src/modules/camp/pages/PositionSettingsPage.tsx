import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import type { PositionSetting } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { PatternStrip, ShiftPatternModal } from '../components/ShiftPattern'
import { Button, Card, Empty, ErrorBox, Loading, Table, inputSmCls, td } from '../components/ui'

/** <select>-ийн утга ↔ boolean | null ('' = анхдагч) */
const toTri = (v: string): boolean | null => (v === '' ? null : v === 'yes')
const fromTri = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no')

/**
 * v0.2.1 (Q1, Д-1, Д-2) — Кемпийн тохиргоо › Албан тушаал: энэ кемп дэх албан тушаал бүрийн АНХДАГЧ утга
 *   ажлын хоолны байршил · хоол авах · ээлжийн загвар. Ажилтан дээр өөр утга тохируулбал тэр нь давамгайлна.
 * Албан тушаалын жагсаалт = байгууллагын каталог (Системийн тохиргоо › Албан тушаал).
 */
export default function PositionSettingsPage() {
  const { t } = useTranslation()
  const { campId = '' } = useParams()
  const perms = useCampPermissions(campId)
  const canEdit = perms.can(P.MASTER_MANAGE)
  const rows = useQuery({ queryKey: campKeys.positionSettings(campId), queryFn: () => campApi.positionSettings(campId) })
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })
  const [pattern, setPattern] = useState<PositionSetting | null>(null)
  const save = useCampMutation(
    (v: { positionId: string; body: { mealLocationId?: string | null; mealsIncluded?: boolean | null } }) => campApi.savePositionSetting(campId, v.positionId, v.body),
    [campKeys.positionSettings(campId), campKeys.employees(campId), campKeys.presence(campId), campKeys.stays(campId)],
  )
  const onDays = settings.data?.rosterOnDays ?? 14
  const defaultLoc = locations.data?.find((l) => l.id === settings.data?.defaultMealLocationId)?.name ?? t('camp.presence.no_location')

  return (
    <div className="space-y-4">
      <Card title={t('camp.settings.section.positions')}>
        <p className="text-xs text-gray-500 mb-3">{t('camp.pos.help', { location: defaultLoc })}</p>
        {(rows.isLoading || settings.isLoading || locations.isLoading) && <Loading />}
        <ErrorBox error={rows.error ?? settings.error ?? locations.error} onRetry={() => rows.refetch()} />
        {rows.data && rows.data.length === 0 && (
          <Empty>
            {t('camp.pos.empty')}{' '}
            <Link to="/hr/positions" className="text-blue-600 hover:underline">
              {t('camp.system.section.positions')}
            </Link>
          </Empty>
        )}
        {rows.data && rows.data.length > 0 && locations.data && (
          <Table head={[t('camp.pos.col.position'), t('camp.dept.employees'), t('camp.pos.col.location'), t('camp.pos.col.meals'), t('camp.dept.shift_cols', { days: onDays }), '']}>
            {rows.data.map((r) => (
              <tr key={r.positionId} className={r.isActive ? '' : 'opacity-60'}>
                <td className={td}>
                  {r.name}
                  {!r.isActive && <span className="ml-2 text-xs text-gray-500">({t('camp.common.inactive')})</span>}
                </td>
                <td className={td}>{r.activeEmployees}</td>
                <td className={td}>
                  <select
                    aria-label={t('camp.pos.location_of', { name: r.name })}
                    className={`${inputSmCls} w-auto`}
                    value={r.mealLocationId ?? ''}
                    disabled={!canEdit || save.isPending}
                    onChange={(e) => save.mutate({ positionId: r.positionId, body: { mealLocationId: e.target.value || null } })}
                  >
                    <option value="">{t('camp.pos.default_location', { location: defaultLoc })}</option>
                    {locations.data
                      .filter((l) => l.isActive || l.id === r.mealLocationId)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className={td}>
                  <select
                    aria-label={t('camp.pos.meals_of', { name: r.name })}
                    className={`${inputSmCls} w-auto`}
                    value={fromTri(r.mealsIncluded)}
                    disabled={!canEdit || save.isPending}
                    onChange={(e) => save.mutate({ positionId: r.positionId, body: { mealsIncluded: toTri(e.target.value) } })}
                  >
                    <option value="">{t('camp.pos.meals_default')}</option>
                    <option value="yes">{t('camp.common.yes')}</option>
                    <option value="no">{t('camp.pos.no_meals')}</option>
                  </select>
                </td>
                <td className={td}>
                  <PatternStrip segments={r.shiftPattern} onDays={onDays} emptyText={t('camp.pos.pattern_from_dept')} />
                </td>
                <td className={`${td} text-right`}>
                  {canEdit && (
                    <Button variant="ghost" onClick={() => setPattern(r)}>
                      {t('camp.dept.shift')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="mt-3">
          <ErrorBox error={save.error} />
        </div>
      </Card>
      {pattern && (
        <ShiftPatternModal
          title={t('camp.pos.pattern_title', { name: pattern.name })}
          note={t('camp.pos.pattern_note')}
          initial={pattern.shiftPattern}
          onDays={onDays}
          changeover={settings.data?.changeoverWeekday ?? 3}
          save={(segments) => campApi.savePositionSetting(campId, pattern.positionId, { shiftPattern: segments })}
          invalidate={[campKeys.positionSettings(campId), campKeys.presence(campId), campKeys.stays(campId), campKeys.calendar(campId)]}
          onClose={() => setPattern(null)}
        />
      )}
    </div>
  )
}
