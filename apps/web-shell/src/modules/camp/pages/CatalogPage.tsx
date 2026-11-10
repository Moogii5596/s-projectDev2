import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import type { CatalogItem, CatalogKind } from '../api/types'
import { campKeys, useAppPermissions } from '../../../core/useAppPermissions'
import { useAppMutation } from '../../../core/useAppMutation'
import { P } from '../../../core/permissions'
import { localizedCatalogName } from '../../../core/labels'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Table, td } from '../../../core/ui'
import { LocalizedNameFields, type LocalizedNameInput } from '../components/LocalizedNameFields'

const emptyName = (): LocalizedNameInput => ({ name: '', nameI18n: { en: '', zh: '' } })

/**
 * v0.2.1 — Системийн тохиргоо › Албан тушаал (Q2) / Байрны төрөл (Q4): байгууллагын нийтийн каталог.
 * Засах: бүх кемпийн `camp.master.manage` (байгууллагын админ). Нэр давхардахгүй (зай, том/жижиг үсэг үл хамаарна — backend).
 * Устгахгүй — идэвхгүй болгоно (одоогийн ажилтан / байранд хэвээр үлдэнэ, шинээр сонгогдохгүй).
 */
/** `rowAction` — v0.2.2 Блок 4: мөрөнд нэмэлт товч (HR албан тушаалын «Эрхийн загвар») */
export default function CatalogPage({ kind, rowAction }: { kind: CatalogKind; rowAction?: (c: CatalogItem) => ReactNode }) {
  const { t, i18n } = useTranslation()
  const perms = useAppPermissions()
  const canEdit = perms.can(P.MASTER_MANAGE)
  const key = campKeys.catalog(kind)
  const list = useQuery({ queryKey: key, queryFn: () => campApi.catalog(kind) })
  const [name, setName] = useState<LocalizedNameInput>(emptyName)
  const [editing, setEditing] = useState<(LocalizedNameInput & { id: string }) | null>(null)
  const add = useAppMutation(
    () => campApi.createCatalogItem(kind, { name: name.name.trim(), nameI18n: { en: name.nameI18n.en.trim(), zh: name.nameI18n.zh.trim() } }),
    [key],
    () => setName(emptyName()),
  )
  const update = useAppMutation(
    (v: { c: CatalogItem; value?: LocalizedNameInput; isActive?: boolean }) =>
      campApi.updateCatalogItem(kind, v.c.id, {
        name: v.value?.name.trim(),
        nameI18n: v.value ? { en: v.value.nameI18n.en.trim(), zh: v.value.nameI18n.zh.trim() } : undefined,
        isActive: v.isActive,
      }),
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
                    <LocalizedNameFields value={editing} onChange={(value) => setEditing({ ...value, id: c.id })} />
                  ) : (
                    <>
                      {localizedCatalogName(c, i18n.resolvedLanguage ?? i18n.language)}
                      {/* v0.2.3 Блок D (S4): албан тушаалын индекс (импортоор) */}
                      {c.code && <span className="ml-2 font-mono text-xs text-gray-500">{c.code}</span>}
                    </>
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
        {!canEdit && <p className="text-xs text-gray-500 mt-3">{t('camp.catalog.admin_only')}</p>}
        <div className="mt-3">
          <ErrorBox error={add.error ?? update.error} />
        </div>
      </Card>
    </div>
  )
}
