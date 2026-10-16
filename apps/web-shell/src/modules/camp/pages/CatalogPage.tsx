import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import type { CatalogItem, CatalogKind } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { P } from '../lib/permissions'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Table, inputCls, td } from '../components/ui'

/**
 * v0.2.1 — Системийн тохиргоо › Албан тушаал (Q2) / Байрны төрөл (Q4): байгууллагын нийтийн каталог.
 * Засах: бүх кемпийн `camp.master.manage` (байгууллагын админ). Нэр давхардахгүй (зай, том/жижиг үсэг үл хамаарна — backend).
 * Устгахгүй — идэвхгүй болгоно (одоогийн ажилтан / байранд хэвээр үлдэнэ, шинээр сонгогдохгүй).
 */
/** `rowAction` — v0.2.2 Блок 4: мөрөнд нэмэлт товч (HR албан тушаалын «Эрхийн загвар») */
export default function CatalogPage({ kind, rowAction }: { kind: CatalogKind; rowAction?: (c: CatalogItem) => ReactNode }) {
  const { t } = useTranslation()
  const perms = useCampPermissions()
  const canEdit = perms.can(P.MASTER_MANAGE)
  const key = campKeys.catalog(kind)
  const list = useQuery({ queryKey: key, queryFn: () => campApi.catalog(kind) })
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const add = useCampMutation(() => campApi.createCatalogItem(kind, name.trim()), [key], () => setName(''))
  const update = useCampMutation(
    (v: { c: CatalogItem; name?: string; isActive?: boolean }) => campApi.updateCatalogItem(kind, v.c.id, { name: v.name, isActive: v.isActive }),
    [key],
    () => setEditing(null),
  )
  const prefix = kind === 'positions' ? 'camp.position' : 'camp.btype'
  const usage = (c: CatalogItem) => (kind === 'positions' ? c.activeEmployees : c.buildings) ?? 0

  return (
    <div className="space-y-4">
      <PageHeader title={t(`camp.system.section.${kind}`)} subtitle={t(`${prefix}.subtitle`)} />
      <Card>
        {list.isLoading && <Loading />}
        <ErrorBox error={list.error} onRetry={() => list.refetch()} />
        {list.data && list.data.length === 0 && <Empty>{t(`${prefix}.empty`)}</Empty>}
        {list.data && list.data.length > 0 && (
          <Table head={[t('camp.common.name'), t(`${prefix}.usage`), t('camp.common.status'), '']}>
            {list.data.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  {editing?.id === c.id ? (
                    <input aria-label={t('camp.common.name')} className={inputCls} value={editing.name} onChange={(e) => setEditing({ id: c.id, name: e.target.value })} maxLength={100} autoFocus />
                  ) : (
                    c.name
                  )}
                </td>
                <td className={td}>{usage(c)}</td>
                <td className={td}>
                  <ActiveBadge active={c.isActive} />
                </td>
                <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                  {rowAction?.(c)}
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
            <input aria-label={t(`${prefix}.new`)} className={inputCls} placeholder={t(`${prefix}.new`)} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            <Button type="submit" loading={add.isPending} disabled={!name.trim()}>
              {t('camp.common.add')}
            </Button>
          </form>
        )}
        {!canEdit && <p className="text-xs text-gray-500 mt-3">{t('camp.catalog.admin_only')}</p>}
        <div className="mt-3">
          <ErrorBox error={add.error ?? update.error} />
        </div>
      </Card>
    </div>
  )
}
