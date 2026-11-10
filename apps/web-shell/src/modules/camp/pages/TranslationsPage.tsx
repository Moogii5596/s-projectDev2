import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  applyTranslations,
  exportTranslations,
  listCatalog,
  listHistory,
  listOverrides,
  previewTranslations,
  type I18nPreview,
  type I18nCatalogRow,
} from '../../../api/i18n'
import { LANGS } from '../../../i18n'
import { downloadBlob } from '../../../core/download'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, PageHeader, Table, inputCls, td } from '../../../core/ui'

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
  const [search, setSearch] = useState('')
  const [section, setSection] = useState<'all' | 'web' | 'server' | 'term'>('all')
  const overrides = useQuery({ queryKey: ['i18n', 'admin', 'overrides'], queryFn: listOverrides })
  const catalog = useQuery({ queryKey: ['i18n', 'admin', 'catalog'], queryFn: listCatalog })
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
  const catalogRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    return (catalog.data ?? []).filter((row) =>
      (section === 'all' || row.section === section) &&
      (!needle || [row.key, row.defaults.mn, row.defaults.en, row.defaults.zh, ...Object.values(row.texts)]
        .some((value) => value.toLocaleLowerCase().includes(needle))),
    ).slice(0, 100)
  }, [catalog.data, search, section])

  const saveCatalogRow = (row: I18nCatalogRow, texts: I18nCatalogRow['texts']) => {
    apply.mutate(LANGS.map((lang) => ({
      key: row.key,
      lang,
      to: texts[lang] === row.defaults[lang] ? null : texts[lang],
    })))
  }

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

      <Card title={t('camp.i18n.editor')}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label={t('camp.i18n.search')}>{(id) => <input id={id} className={inputCls} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('camp.i18n.search_placeholder')} />}</Field>
          <Field label={t('camp.i18n.section')}>{(id) => <select id={id} className={inputCls} value={section} onChange={(event) => setSection(event.target.value as typeof section)}>
            <option value="all">{t('camp.i18n.all_sections')}</option>
            <option value="web">web</option>
            <option value="server">server</option>
            <option value="term">term</option>
          </select>}</Field>
        </div>
        {catalog.isLoading && <Loading />}
        <ErrorBox error={catalog.error} onRetry={() => catalog.refetch()} />
        {catalog.data && catalogRows.length === 0 && <Empty>{t('camp.i18n.no_matches')}</Empty>}
        {catalogRows.length > 0 && (
          <>
            <p className="mb-2 text-xs text-gray-500">{t('camp.i18n.result_count', { n: catalogRows.length, total: catalog.data?.length ?? 0 })}</p>
            <Table head={[t('camp.i18n.key'), t('camp.i18n.default_mn'), ...LANGS, '']}>
              {catalogRows.map((row) => (
                <TranslationEditorRow key={row.key} row={row} saving={apply.isPending} onSave={(texts) => saveCatalogRow(row, texts)} />
              ))}
            </Table>
          </>
        )}
        <ErrorBox error={apply.error} />
      </Card>

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

function TranslationEditorRow({
  row,
  saving,
  onSave,
}: {
  row: I18nCatalogRow
  saving: boolean
  onSave: (texts: I18nCatalogRow['texts']) => void
}) {
  const { t } = useTranslation()
  const [texts, setTexts] = useState(row.texts)
  return (
    <tr>
      <td className={`${td} align-top`}>
        <div className="font-mono text-xs">{row.key}</div>
        <div className="text-xs text-gray-400">{row.section}</div>
      </td>
      <td className={`${td} align-top text-xs text-gray-500`}>{row.defaults.mn}</td>
      {LANGS.map((lang) => (
        <td key={lang} className={`${td} min-w-48 align-top`}>
          <textarea
            className={`${inputCls} min-h-20`}
            aria-label={`${row.key} ${lang}`}
            value={texts[lang]}
            onChange={(event) => setTexts((current) => ({ ...current, [lang]: event.target.value }))}
          />
        </td>
      ))}
      <td className={`${td} align-top`}>
        <Button
          size="sm"
          loading={saving}
          disabled={LANGS.every((lang) => texts[lang] === row.texts[lang])}
          onClick={() => onSave(texts)}
        >
          {t('camp.i18n.save')}
        </Button>
      </td>
    </tr>
  )
}
