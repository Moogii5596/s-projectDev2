import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, Card, ErrorBox, Loading, inputCls } from '../../core/ui'
import { LANGS, LANG_LABELS } from '../../i18n'
import { settingsApi, settingsQueryKey, type TenantProfile } from './settings-api'
import { attachmentsApi } from './core-bridge'
import { useMe } from '../../hooks/useMe'

export default function TenantProfilePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: settingsQueryKey, queryFn: settingsApi.get })
  const [form, setForm] = useState<TenantProfile | null>(null)
  useEffect(() => {
    if (query.data) setForm(query.data.profile)
  }, [query.data])
  const save = useMutation({
    mutationFn: settingsApi.updateProfile,
    onSuccess: (data) => queryClient.setQueryData(settingsQueryKey, data),
  })

  if (query.isLoading) return <Loading />
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />
  if (!form) return <Loading />
  const set = <K extends keyof TenantProfile>(key: K, value: TenantProfile[K]) => setForm((current) => current && ({ ...current, [key]: value }))

  return (
    <Card title={t('settings.profile.title')}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(form) }}>
        <label className="block text-sm">
          <span className="mb-1 block">{t('settings.profile.name')}</span>
          <input className={inputCls} value={form.name} maxLength={200} onChange={(event) => set('name', event.target.value)} />
        </label>
        <TenantLogo logoPath={query.data?.profile.logoPath ?? null} onUploaded={() => queryClient.invalidateQueries({ queryKey: settingsQueryKey })} />
        <label className="block text-sm">
          <span className="mb-1 block">{t('settings.profile.timeZone')}</span>
          <input className={inputCls} value={form.timeZone} maxLength={100} onChange={(event) => set('timeZone', event.target.value)} />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('settings.profile.activeLanguages')}</legend>
          <div className="flex flex-wrap gap-4">
            {LANGS.map((lang) => (
              <label key={lang} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.activeLanguages.includes(lang)}
                  onChange={(event) => {
                    const activeLanguages = event.target.checked
                      ? [...form.activeLanguages, lang]
                      : form.activeLanguages.filter((item) => item !== lang)
                    if (activeLanguages.length > 0) {
                      set('activeLanguages', activeLanguages)
                      if (!activeLanguages.includes(form.defaultLanguage)) set('defaultLanguage', activeLanguages[0])
                    }
                  }}
                />
                {LANG_LABELS[lang]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block">{t('settings.profile.defaultLanguage')}</span>
            <select
              className={inputCls}
              value={form.defaultLanguage}
              onChange={(event) => {
                const defaultLanguage = event.target.value as TenantProfile['defaultLanguage']
                setForm((current) => current && ({
                  ...current,
                  defaultLanguage,
                  activeLanguages: current.activeLanguages.includes(defaultLanguage)
                    ? current.activeLanguages
                    : [...current.activeLanguages, defaultLanguage],
                }))
              }}
            >
              {LANGS.filter((lang) => form.activeLanguages.includes(lang)).map((lang) => (
                <option key={lang} value={lang}>{LANG_LABELS[lang]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">{t('settings.profile.baseCurrency')}</span>
            <input className={inputCls} value={form.baseCurrency} maxLength={3} onChange={(event) => set('baseCurrency', event.target.value.toUpperCase())} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">{t('settings.profile.dateFormat')}</span>
            <select className={inputCls} value={form.dateFormat} onChange={(event) => set('dateFormat', event.target.value as TenantProfile['dateFormat'])}>
              {['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'].map((format) => <option key={format}>{format}</option>)}
            </select>
          </label>
        </div>
        <ErrorBox error={save.error} />
        <Button type="submit" loading={save.isPending} disabled={!form.name.trim() || form.activeLanguages.length === 0}>
          {t('camp.common.save')}
        </Button>
      </form>
    </Card>
  )
}

/** v0.2.4 SYS-01 + FILE-01 — байгууллагын лого (TENANT_LOGO хавсралт, ≤2 MB зураг). Bearer-тэй татаж blob URL-ээр харуулна. */
function TenantLogo({ logoPath, onUploaded }: { logoPath: string | null; onUploaded: () => void }) {
  const { t } = useTranslation()
  const { me } = useMe()
  const attachmentId = logoPath?.startsWith('attachment:') ? logoPath.slice('attachment:'.length) : null
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!attachmentId) return setUrl(null)
    let revoked: string | null = null
    let cancelled = false
    attachmentsApi.download(attachmentId).then((blob) => {
      if (cancelled) return
      revoked = URL.createObjectURL(blob)
      setUrl(revoked)
    }).catch(() => setUrl(null))
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [attachmentId])
  const upload = useMutation({
    mutationFn: (file: File) => attachmentsApi.upload('TENANT_LOGO', me!.tenantId, [file]),
    onSuccess: onUploaded,
  })
  return (
    <div className="block text-sm">
      <span className="mb-1 block">{t('settings.profile.logo')}</span>
      <div className="flex items-center gap-3">
        {url ? <img src={url} alt="" className="h-12 w-12 rounded border object-contain" /> : <div className="h-12 w-12 rounded border border-dashed bg-gray-50" />}
        <label className="cursor-pointer text-blue-600 hover:underline">
          {upload.isPending ? t('camp.common.wait') : t('settings.profile.logo_upload')}
          <input type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" disabled={!me || upload.isPending} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = '' }} />
        </label>
      </div>
      <p className="mt-1 text-xs text-gray-400">{t('settings.profile.logo_hint')}</p>
      {upload.isError && <ErrorBox error={upload.error} />}
    </div>
  )
}
