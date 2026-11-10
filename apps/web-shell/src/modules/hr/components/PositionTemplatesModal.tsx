import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-bridge'
import type { CampTemplateScope, CatalogItem } from '../api/camp-bridge'
import { campKeys } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { localizedCatalogName } from '../../../core/labels'
import { Button, Empty, ErrorBox, Loading, Modal, inputSmCls } from '../../../core/ui'

type Row = { roleId: string; scope: CampTemplateScope }

/**
 * v0.2.2 Блок 4 (B4-Q5) — албан тушаал → эрхийн загвар (роль × хүрээ). Хадгалсны дараа одоогийн ажилтнуудад
 * автоматаар хэрэгжихгүй — «Ажилтнуудад хэрэгжүүлэх» (Блок 2-ын зарчим: загвар өөрчлөхөд хэрэглэгчийн эрх шууд өөрчлөгдөхгүй).
 */
export default function PositionTemplatesModal({ position, onClose }: { position: CatalogItem; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const key = campKeys.positionTemplates(position.id)
  const current = useQuery({ queryKey: key, queryFn: () => campApi.positionTemplates(position.id) })
  const roles = useQuery({ queryKey: campKeys.roles, queryFn: campApi.roles })
  const [rows, setRows] = useState<Row[] | null>(null)
  const [applied, setApplied] = useState<number | null>(null)
  useEffect(() => {
    if (current.data && rows === null) setRows(current.data.templates.map((x) => ({ roleId: x.roleId, scope: x.scope })))
  }, [current.data, rows])

  const save = useAppMutation(() => campApi.setPositionTemplates(position.id, rows ?? []), [key], (res) => {
    setRows(res.templates.map((x) => ({ roleId: x.roleId, scope: x.scope })))
    setApplied(null)
  })
  const apply = useAppMutation(() => campApi.applyPositionTemplates(position.id), [campKeys.users, campKeys.userRoles], (res) => setApplied(res.users))

  const saved = JSON.stringify(current.data?.templates.map((x) => ({ roleId: x.roleId, scope: x.scope })) ?? [])
  const dirty = rows !== null && JSON.stringify(rows) !== saved
  const unused = (roles.data ?? []).filter((r) => !rows?.some((x) => x.roleId === r.id))

  return (
    <Modal
      title={t('hr.tpl.title', { name: localizedCatalogName(position, i18n.resolvedLanguage ?? i18n.language) })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => apply.mutate(undefined)} loading={apply.isPending} disabled={dirty || !rows?.length}>
            {t('hr.tpl.apply')}
          </Button>
          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!dirty}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <p className="text-xs text-gray-500">{t('hr.tpl.help')}</p>
      {(current.isLoading || roles.isLoading) && <Loading />}
      <ErrorBox error={current.error ?? roles.error} />
      {rows && rows.length === 0 && <Empty>{t('hr.tpl.empty')}</Empty>}
      {rows?.map((r, i) => (
        <div key={r.roleId} className="flex gap-2 items-center">
          <span className="flex-1 text-sm text-gray-900">{roles.data?.find((x) => x.id === r.roleId)?.name ?? '…'}</span>
          <select
            aria-label={t('hr.tpl.scope')}
            className={inputSmCls}
            value={r.scope}
            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, scope: e.target.value as CampTemplateScope } : x)))}
          >
            <option value="EMPLOYEE_CAMP">{t('hr.tpl.scope.EMPLOYEE_CAMP')}</option>
            <option value="ALL_CAMPS">{t('hr.tpl.scope.ALL_CAMPS')}</option>
          </select>
          <button type="button" className="text-red-600 text-sm hover:underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            {t('hr.tpl.remove')}
          </button>
        </div>
      ))}
      {rows && unused.length > 0 && (
        <select
          aria-label={t('hr.tpl.add')}
          className={`${inputSmCls} w-full`}
          value=""
          onChange={(e) => e.target.value && setRows([...rows, { roleId: e.target.value, scope: 'EMPLOYEE_CAMP' }])}
        >
          <option value="">{t('hr.tpl.add')}</option>
          {unused.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}
      {dirty && <p className="text-xs text-yellow-700">{t('hr.tpl.unsaved')}</p>}
      {applied !== null && <p className="text-xs text-green-700">{t('hr.tpl.applied', { n: applied })}</p>}
      <ErrorBox error={save.error ?? apply.error} />
    </Modal>
  )
}
