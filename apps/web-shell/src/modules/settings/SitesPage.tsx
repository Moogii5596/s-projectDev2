import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, Card, Empty, ErrorBox, Field, Loading, Table, inputCls, td } from '../../core/ui'
import { sitesApi, sitesQueryKey, type Site, type SiteInput, type SiteType } from './sites-api'

const EMPTY_INPUT: SiteInput = { type: 'OTHER', code: '', name: '' }
const SITE_TYPES: SiteType[] = ['CAMP', 'OFFICE', 'MINE', 'OTHER']

export default function SitesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [input, setInput] = useState<SiteInput>(EMPTY_INPUT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const sites = useQuery({ queryKey: sitesQueryKey, queryFn: sitesApi.list })
  const refresh = () => queryClient.invalidateQueries({ queryKey: sitesQueryKey })
  const save = useMutation({
    mutationFn: () => editingId ? sitesApi.update(editingId, input) : sitesApi.create(input),
    onSuccess: () => {
      setInput(EMPTY_INPUT)
      setEditingId(null)
      void refresh()
    },
  })
  const archive = useMutation({ mutationFn: sitesApi.archive, onSuccess: refresh })
  const restore = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => sitesApi.update(id, { isActive }),
    onSuccess: refresh,
  })

  if (sites.isLoading) return <Loading />
  if (sites.isError) return <ErrorBox error={sites.error} onRetry={() => sites.refetch()} />

  const beginEdit = (site: Site) => {
    setEditingId(site.id)
    setInput({ type: site.type, code: site.code, name: site.name })
  }
  const cancelEdit = () => {
    setEditingId(null)
    setInput(EMPTY_INPUT)
  }

  return (
    <div className="space-y-4">
      <Card title={t('core.site.title')}>
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <Field label={t('core.site.type')}>{(id) => (
            <select id={id} className={inputCls} value={input.type} disabled={Boolean(editingId)} onChange={(event) => setInput((value) => ({ ...value, type: event.target.value as SiteType }))}>
              {SITE_TYPES.map((type) => <option key={type} value={type}>{t(`core.site.type_${type.toLowerCase()}`)}</option>)}
            </select>
          )}</Field>
          <Field label={t('core.site.code')}>{(id) => <input id={id} className={inputCls} value={input.code} maxLength={40} onChange={(event) => setInput((value) => ({ ...value, code: event.target.value.toUpperCase() }))} required />}</Field>
          <Field label={t('core.site.name')}>{(id) => <input id={id} className={inputCls} value={input.name} maxLength={200} onChange={(event) => setInput((value) => ({ ...value, name: event.target.value }))} required />}</Field>
          <div className="flex items-end gap-2">
            <Button type="submit" loading={save.isPending} disabled={!input.code.trim() || !input.name.trim()}>{t(editingId ? 'core.site.save' : 'core.site.add')}</Button>
            {editingId && <Button type="button" variant="secondary" onClick={cancelEdit}>{t('core.site.cancel')}</Button>}
          </div>
        </form>
        <ErrorBox error={save.error} />
      </Card>

      {sites.data?.length === 0 ? <Card><Empty>{t('core.site.empty')}</Empty></Card> : (
        <Card>
          <Table head={[t('core.site.type'), t('core.site.code'), t('core.site.name'), t('core.site.status'), '']}>
            {sites.data?.map((site) => (
              <tr key={site.id}>
                <td className={td}>{t(`core.site.type_${site.type.toLowerCase()}`)}</td>
                <td className={td}>{site.code}</td>
                <td className={td}>{site.name}</td>
                <td className={td}>{t(site.isActive ? 'core.site.active' : 'core.site.inactive')}</td>
                <td className={`${td} text-right`}>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => beginEdit(site)}>{t('core.site.edit')}</Button>
                    {site.isActive
                      ? <Button size="sm" variant="ghost" disabled={archive.isPending} onClick={() => {
                        if (window.confirm(t('core.site.confirm_archive'))) archive.mutate(site.id)
                      }}>{t('core.site.archive')}</Button>
                      : <Button size="sm" variant="ghost" disabled={restore.isPending} onClick={() => restore.mutate({ id: site.id, isActive: true })}>{t('core.site.restore')}</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <ErrorBox error={archive.error || restore.error} />
        </Card>
      )}
    </div>
  )
}
