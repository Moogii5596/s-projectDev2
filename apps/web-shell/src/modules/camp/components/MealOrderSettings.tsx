import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import type { CampSettings } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { gridToLines, linesToGrid, type Grid } from '../lib/meal-order'
import MealGrid from './MealGrid'
import { Button, Card, Empty, ErrorBox, Field, Loading, inputCls } from './ui'

type AfterCutoff = NonNullable<CampSettings['mealOrderAfterCutoff']>
type EditAfter = NonNullable<CampSettings['mealOrderEditAfterAccept']>
type Fill = NonNullable<CampSettings['mealOrderDefaultFill']>

/** Кемпийн тохиргоо → «Хоолны захиалга»: урсгалын дүрэм (G-8) + тогтмол загвар. Бүгд тохиргоо — кодод тогтмол дүрэм алга */
export default function MealOrderSettings({ campId }: { campId: string }) {
  const { t } = useTranslation()
  const perms = useCampPermissions(campId)
  const canEdit = perms.can(P.SETTINGS_MANAGE)
  const settings = useQuery({ queryKey: campKeys.settings(campId), queryFn: () => campApi.settings(campId) })
  const locations = useQuery({ queryKey: campKeys.mealLocations(campId), queryFn: () => campApi.mealLocations(campId) })
  const template = useQuery({ queryKey: campKeys.mealTemplate(campId), queryFn: () => campApi.mealTemplate(campId) })
  const s = settings.data

  const init = () => ({
    leadDays: String(s?.mealOrderLeadDays ?? 1),
    afterCutoff: (s?.mealOrderAfterCutoff ?? 'BLOCK') as AfterCutoff,
    requiresAccept: s?.mealOrderRequiresAccept ?? true,
    editAfterAccept: (s?.mealOrderEditAfterAccept ?? 'FORBID') as EditAfter,
    defaultFill: (s?.mealOrderDefaultFill ?? 'EMPTY') as Fill,
    allowSelfAccept: s?.mealOrderAllowSelfAccept ?? false,
  })
  const [f, setF] = useState(init)
  useEffect(() => setF(init()), [s])
  const [tpl, setTpl] = useState<Grid>({})
  useEffect(() => setTpl(linesToGrid(template.data?.lines ?? [])), [template.data])

  // PUT /settings нь бүтэн тохиргоо (одоогийн утгууд + шинэ талбарууд)
  const saveSettings = useCampMutation(
    () =>
      campApi.saveSettings(campId, {
        vatRate: Number(s!.vatRate),
        changeoverWeekday: s!.changeoverWeekday,
        rosterOnDays: s!.rosterOnDays,
        rosterOffDays: s!.rosterOffDays,
        mealOrderCutoffTime: s!.mealOrderCutoffTime,
        defaultMealLocationId: s!.defaultMealLocationId,
        mealOrderLeadDays: Number(f.leadDays),
        mealOrderAfterCutoff: f.afterCutoff,
        mealOrderRequiresAccept: f.requiresAccept,
        mealOrderEditAfterAccept: f.editAfterAccept,
        mealOrderDefaultFill: f.defaultFill,
        mealOrderAllowSelfAccept: f.allowSelfAccept,
      }),
    [campKeys.settings(campId), campKeys.mealOrderAll(campId)],
  )
  const saveTemplate = useCampMutation(() => campApi.saveMealTemplate(campId, gridToLines(tpl)), [campKeys.mealTemplate(campId), campKeys.mealOrderAll(campId)])

  if (settings.isLoading || locations.isLoading || template.isLoading) return <Loading />
  if (!s) return <ErrorBox error={settings.error} />
  const activeLocations = (locations.data ?? []).filter((l) => l.isActive)

  return (
    <div className="space-y-4">
      <Card title={t('camp.mo.set.title')}>
        <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); saveSettings.mutate(undefined) }}>
          <p className="text-xs text-gray-500">{t('camp.mo.set.cutoff_note', { time: s.mealOrderCutoffTime ?? '—' })}</p>
          <Field label={t('camp.mo.set.lead_days')} hint={t('camp.mo.set.lead_days_hint')}>
            {(id) => <input id={id} type="number" min={0} max={30} className={inputCls} value={f.leadDays} disabled={!canEdit} onChange={(e) => setF((p) => ({ ...p, leadDays: e.target.value }))} />}
          </Field>
          <Field label={t('camp.mo.set.after_cutoff')} hint={t(`camp.mo.set.after.${f.afterCutoff}_hint`)}>
            {(id) => (
              <select id={id} className={inputCls} value={f.afterCutoff} disabled={!canEdit} onChange={(e) => setF((p) => ({ ...p, afterCutoff: e.target.value as AfterCutoff }))}>
                {(['BLOCK', 'APPROVAL', 'FREE'] as const).map((v) => <option key={v} value={v}>{t(`camp.mo.set.after.${v}`)}</option>)}
              </select>
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={f.requiresAccept} disabled={!canEdit} onChange={(e) => setF((p) => ({ ...p, requiresAccept: e.target.checked }))} />
            {t('camp.mo.set.requires_accept')}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={f.allowSelfAccept} disabled={!canEdit} onChange={(e) => setF((p) => ({ ...p, allowSelfAccept: e.target.checked }))} />
            {t('camp.mo.set.allow_self_accept')}
          </label>
          <Field label={t('camp.mo.set.edit_after_accept')} hint={t(`camp.mo.set.edit.${f.editAfterAccept}_hint`)}>
            {(id) => (
              <select id={id} className={inputCls} value={f.editAfterAccept} disabled={!canEdit} onChange={(e) => setF((p) => ({ ...p, editAfterAccept: e.target.value as EditAfter }))}>
                {(['FORBID', 'ALLOW', 'TWO_SIDED'] as const).map((v) => <option key={v} value={v}>{t(`camp.mo.set.edit.${v}`)}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('camp.mo.set.default_fill')} hint={t(`camp.mo.set.fill.${f.defaultFill}_hint`)}>
            {(id) => (
              <select id={id} className={inputCls} value={f.defaultFill} disabled={!canEdit} onChange={(e) => setF((p) => ({ ...p, defaultFill: e.target.value as Fill }))}>
                {(['EMPTY', 'COPY_PREV', 'TEMPLATE'] as const).map((v) => <option key={v} value={v}>{t(`camp.mo.set.fill.${v}`)}</option>)}
              </select>
            )}
          </Field>
          <ErrorBox error={saveSettings.error} />
          {saveSettings.isSuccess && <p className="text-xs text-green-700">{t('camp.common.saved')}</p>}
          {canEdit && <Button loading={saveSettings.isPending} onClick={() => saveSettings.mutate(undefined)}>{t('camp.common.save')}</Button>}
        </form>
      </Card>

      <Card title={t('camp.mo.set.template')}>
        <p className="text-xs text-gray-500 mb-3">{t('camp.mo.set.template_hint')}</p>
        {activeLocations.length === 0 ? <Empty>{t('camp.mo.no_locations')}</Empty> : <MealGrid locations={activeLocations} values={tpl} onChange={setTpl} disabled={!canEdit} />}
        <ErrorBox error={saveTemplate.error} />
        {saveTemplate.isSuccess && <p className="text-xs text-green-700 mt-2">{t('camp.common.saved')}</p>}
        {canEdit && activeLocations.length > 0 && <Button className="mt-3" loading={saveTemplate.isPending} onClick={() => saveTemplate.mutate(undefined)}>{t('camp.common.save')}</Button>}
      </Card>
    </div>
  )
}
