import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { campApi } from '../api/camp-api'
import type { AssetCategory } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P, canInAnyCamp } from '../lib/permissions'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Table, inputCls, td } from '../components/ui'

/** /camp/admin/asset-categories — хөрөнгийн ангилал (tenant түвшин; аль нэг кемпэд asset.manage эрхтэй бол засна) */
export default function AssetCategoriesPage() {
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
      <div className="text-sm text-gray-500">
        <Link to="/camp" className="hover:text-blue-600">
          Кемпүүд
        </Link>{' '}
        / Хөрөнгийн ангилал
      </div>
      <PageHeader title="Хөрөнгийн ангилал" subtitle="Бүх кемпэд нийтлэг (жнь: Тавилга, Цахилгаан бараа, Гал тогооны тоног)" />
      <Card>
        {list.isLoading && <Loading />}
        <ErrorBox error={list.error} onRetry={() => list.refetch()} />
        {list.data && list.data.length === 0 && <Empty>Ангилал бүртгэгдээгүй</Empty>}
        {list.data && list.data.length > 0 && (
          <Table head={['Нэр', 'Төлөв', '']}>
            {list.data.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  {editing?.id === c.id ? (
                    <input aria-label="Ангиллын нэр" className={inputCls} value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} maxLength={100} autoFocus />
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
                          Хадгалах
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(null)}>
                          Болих
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={() => setEditing({ id: c.id, name: c.name })}>
                          Нэр солих
                        </Button>
                        <Button variant="ghost" onClick={() => update.mutate({ c, isActive: !c.isActive })}>
                          {c.isActive ? 'Идэвхгүй болгох' : 'Идэвхжүүлэх'}
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
            <input aria-label="Шинэ ангиллын нэр" className={inputCls} placeholder="Шинэ ангиллын нэр" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            <Button type="submit" loading={add.isPending} disabled={!name.trim()}>
              Нэмэх
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
