import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { AssetCategory } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P, canInAnyCamp } from '../lib/permissions'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Table, inputCls, td } from '../components/ui'
import { useTranslation } from 'react-i18next'

/** /camp/admin/asset-categories — хөрөнгийн ангилал (tenant түвшин; аль нэг кемпэд asset.manage эрхтэй бол засна) */
export default function AssetCategoriesPage() {
  const { t } = useTranslation()
  const perms = useCampPermissions()
  const canEdit = canInAnyCamp(perms.data, P.ASSET_MANAGE)
  const list = useQuery({ queryKey: campKeys.assetCategories, queryFn: () => campApi.assetCategories(false) })
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const add = useCampMutation(() => campApi.createAssetCategory(name.trim()), [campKeys.assetCategories], () => setName(''))
  const update = useCampMutation(
    (v: { c: AssetCategory; name?: string; isActive?: boolean }) => campApi.updateAssetCategory(v.c.id, { name: v.name, isActive: v.isActive }),
    [campKeys.assetCategories],
    () => setEditing(null),
  )

  return (
    <div className="space-y-4">
      <PageHeader title={t('camp.system.section.asset-categories')} subtitle={t('camp.assetcat.subtitle')} />
      <Card>
        {list.isLoading && <Loading />}
        <ErrorBox error={list.error} onRetry={() => list.refetch()} />
        {list.data && list.data.length === 0 && <Empty>{t('camp.assetcat.empty')}</Empty>}
        {list.data && list.data.length > 0 && (
          <Table head={[t('camp.common.name'), t('camp.common.status'), '']}>
            {list.data.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  {editing?.id === c.id ? (
                    <input aria-label={t('camp.assetcat.name')} className={inputCls} value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} maxLength={100} autoFocus />
                  ) : (
                    c.name
                  )}
                </td>
                <td className={td}>
                  <ActiveBadge active={c.isActive} />
                </td>
                <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                  {canEdit &&
                    (editing?.id === c.id ? (
                      <>
                        <Button variant="ghost" disabled={!editing.name.trim() || editing.name.trim() === c.name} onClick={() => update.mutate({ c, name: editing.name.trim() })}>
                          {t('camp.common.save')}
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(null)}>
                          {t('camp.common.cancel')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name })}>
                          {t('camp.common.rename')}
                        </Button>
                        <Button variant="ghost" onClick={() => update.mutate({ c, isActive: !c.isActive })}>
                          {c.isActive ? t('camp.common.deactivate') : t('camp.common.activate')}
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
            className="flex gap-2 mt-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) add.mutate(undefined)
            }}
          >
            <input aria-label={t('camp.assetcat.new')} className={inputCls} placeholder={t('camp.assetcat.new')} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            <Button type="submit" loading={add.isPending} disabled={!name.trim()}>
              {t('camp.common.add')}
            </Button>
          </form>
        )}
        <div className="mt-3">
          <ErrorBox error={add.error ?? update.error} />
        </div>
      </Card>
    </div>
  )
}
