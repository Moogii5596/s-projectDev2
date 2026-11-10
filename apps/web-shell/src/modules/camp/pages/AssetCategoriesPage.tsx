import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { AssetCategory } from '../api/types'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { P, canInAnyCamp } from '../../../core/permissions'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Table, td } from '../../../core/ui'
import { useTranslation } from 'react-i18next'
import { localizedCatalogName } from '../../../core/labels'
import { LocalizedNameFields, type LocalizedNameInput } from '../components/LocalizedNameFields'

const emptyName = (): LocalizedNameInput => ({ name: '', nameI18n: { en: '', zh: '' } })

/** /camp/admin/asset-categories — хөрөнгийн ангилал (tenant түвшин; аль нэг кемпэд asset.manage эрхтэй бол засна) */
export default function AssetCategoriesPage() {
  const { t, i18n } = useTranslation()
  const perms = useAppPermissions()
  const canEdit = canInAnyCamp(perms.data, P.ASSET_MANAGE)
  const list = useQuery({ queryKey: campKeys.assetCategories, queryFn: () => campApi.assetCategories(false) })
  const [name, setName] = useState<LocalizedNameInput>(emptyName)
  const [editing, setEditing] = useState<(LocalizedNameInput & { id: string }) | null>(null)
  const add = useAppMutation(
    () => campApi.createAssetCategory({ name: name.name.trim(), nameI18n: { en: name.nameI18n.en.trim(), zh: name.nameI18n.zh.trim() } }),
    [campKeys.assetCategories],
    () => setName(emptyName()),
  )
  const update = useAppMutation(
    (v: { c: AssetCategory; value?: LocalizedNameInput; isActive?: boolean }) =>
      campApi.updateAssetCategory(v.c.id, {
        name: v.value?.name.trim(),
        nameI18n: v.value ? { en: v.value.nameI18n.en.trim(), zh: v.value.nameI18n.zh.trim() } : undefined,
        isActive: v.isActive,
      }),
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
                    <LocalizedNameFields value={editing} onChange={(value) => setEditing({ ...value, id: c.id })} />
                  ) : (
                    localizedCatalogName(c, i18n.resolvedLanguage ?? i18n.language)
                  )}
                </td>
                <td className={td}>
                  <ActiveBadge active={c.isActive} />
                </td>
                <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                  {canEdit &&
                    (editing?.id === c.id ? (
                      <>
                        <Button
                          variant="ghost"
                          disabled={
                            !editing.name.trim() ||
                            (editing.name.trim() === c.name &&
                              editing.nameI18n.en.trim() === (c.nameI18n?.en ?? '') &&
                              editing.nameI18n.zh.trim() === (c.nameI18n?.zh ?? ''))
                          }
                          onClick={() => update.mutate({ c, value: editing })}
                        >
                          {t('camp.common.save')}
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(null)}>
                          {t('camp.common.cancel')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name, nameI18n: { en: c.nameI18n?.en ?? '', zh: c.nameI18n?.zh ?? '' } })}>
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
              if (name.name.trim()) add.mutate(undefined)
            }}
          >
            <LocalizedNameFields value={name} onChange={setName} />
            <Button type="submit" loading={add.isPending} disabled={!name.name.trim()}>
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
