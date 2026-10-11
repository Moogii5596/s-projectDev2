import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  applyTranslations,
  exportTranslations,
  listHistory,
  listOverrides,
  previewTranslations,
  type I18nPreview,
} from '../../../api/i18n'
import { downloadBlob } from '../lib/download'
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Table, td } from '../components/ui'

/**
 * Системийн тохиргоо → Орчуулга (v0.2.0 §0.7, OWNER/ADMIN). Build-гүй, шууд:
 *   Excel татах (key · хэсэг · анхдагч · mn · en · zh) → засах → оруулах → өөрчлөлт (хуучин → шинэ) + алдаа → баталгаажуулах.
 *   Нээлттэй хуудсууд ≤60 сек-д (эсвэл refresh) шинэ текстээр. Хоосон нүд = анхдагч руу буцаах.
 */
export default function TranslationsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<I18nPreview | null>(null)
  const overrides = useQuery({ queryKey: ['i18n', 'admin', 'overrides'], queryFn: listOverrides })
  const history = useQuery({ queryKey: ['i18n', 'admin', 'history'], queryFn: () => listHistory() })

  const download = useMutation({
    mutationFn: exportTranslations,
    onSuccess: (blob) => downloadBlob(blob, `translations-${new Date().toISOString().slice(0, 10)}.xlsx`),
  })
  const upload = useMutation({ mutationFn: previewTranslations, onSuccess: setPreview })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['i18n'] })
  }
  const apply = useMutation({
    mutationFn: applyTranslations,
    onSuccess: () => {
      setPreview(null)
      refresh()
    },
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('camp.i18n.title')}
        subtitle={t('camp.i18n.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => download.mutate()} loading={download.isPending}>
              {t('camp.i18n.download')}
            </Button>
            <Button onClick={() => fileRef.current?.click()} loading={upload.isPending}>
              {t('camp.i18n.upload')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              aria-label={t('camp.i18n.upload')}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) upload.mutate(f)
                e.target.value = ''
              }}
            />
          </>
        }
      />
      <p className="text-xs text-gray-500">{t('camp.i18n.rules', { room: '{room}' })}</p>
      <ErrorBox error={download.error ?? upload.error ?? apply.error} />

      {preview && (
        <Card
          title={t('camp.i18n.preview_title', { n: preview.changes.length, e: preview.errors.length, u: preview.unchanged })}
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPreview(null)}>
                {t('camp.common.cancel')}
              </Button>
              <Button
                size="sm"
                disabled={preview.changes.length === 0}
                loading={apply.isPending}
                onClick={() => apply.mutate(preview.changes.map(({ key, lang, to }) => ({ key, lang, to })))}
              >
                {t('camp.i18n.confirm', { n: preview.changes.length })}
              </Button>
            </div>
          }
        >
          {preview.errors.length > 0 && (
            <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 space-y-1">
              {preview.errors.map((e, i) => (
                <div key={i}>
                  {t('camp.i18n.row', { row: e.row })} · <span className="font-mono">{e.key}</span>
                  {e.lang ? ` (${e.lang})` : ''}: {e.message}
                </div>
              ))}
            </div>
          )}
          {preview.changes.length === 0 ? (
            <Empty>{t('camp.i18n.no_changes')}</Empty>
          ) : (
            <Table head={[t('camp.i18n.key'), t('camp.i18n.lang'), t('camp.i18n.old'), t('camp.i18n.new')]}>
              {preview.changes.map((c) => (
                <tr key={`${c.key}:${c.lang}`}>
                  <td className={`${td} font-mono text-xs`}>{c.key}</td>
                  <td className={td}>{c.lang}</td>
                  <td className={`${td} text-gray-500 line-through decoration-gray-300`}>{c.from}</td>
                  <td className={td}>{c.to === null ? <Badge>{t('camp.i18n.default')}</Badge> : c.to}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Card title={t('camp.i18n.current', { n: overrides.data?.length ?? 0 })}>
        {overrides.isLoading && <Loading />}
        <ErrorBox error={overrides.error} />
        {overrides.data && overrides.data.length === 0 && <Empty>{t('camp.i18n.none')}</Empty>}
        {overrides.data && overrides.data.length > 0 && (
          <Table head={[t('camp.i18n.key'), t('camp.i18n.lang'), t('camp.i18n.default'), t('camp.i18n.new'), '']}>
            {overrides.data.map((o) => (
              <tr key={`${o.key}:${o.lang}`}>
                <td className={`${td} font-mono text-xs`}>{o.key}</td>
                <td className={td}>{o.lang}</td>
                <td className={`${td} text-gray-500`}>{o.default}</td>
                <td className={td}>{o.text}</td>
                <td className={`${td} text-right`}>
                  <Button variant="ghost" onClick={() => apply.mutate([{ key: o.key, lang: o.lang, to: null }])}>
                    {t('camp.i18n.reset')}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title={t('camp.i18n.history')}>
        {history.isLoading && <Loading />}
        {history.data && history.data.length === 0 && <Empty>{t('camp.i18n.no_history')}</Empty>}
        {history.data && history.data.length > 0 && (
          <Table head={[t('camp.i18n.when'), t('camp.i18n.who'), t('camp.i18n.key'), t('camp.i18n.lang'), t('camp.i18n.old'), t('camp.i18n.new')]}>
            {history.data.slice(0, 50).map((h) => (
              <tr key={h.id}>
                <td className={`${td} whitespace-nowrap text-gray-500`}>{new Date(h.changedAt).toLocaleString()}</td>
                <td className={td}>{h.changedByName ?? '—'}</td>
                <td className={`${td} font-mono text-xs`}>{h.key}</td>
                <td className={td}>{h.lang}</td>
                <td className={`${td} text-gray-500`}>{h.oldText ?? t('camp.i18n.default')}</td>
                <td className={td}>{h.newText ?? t('camp.i18n.default')}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}
