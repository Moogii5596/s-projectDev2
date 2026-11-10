import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, Card, ErrorBox, Loading, inputCls } from '../../core/ui'
import { settingsApi, settingsQueryKey, type TenantSecurityPolicy } from './settings-api'

export default function SecurityPolicyPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: settingsQueryKey, queryFn: settingsApi.get })
  const [form, setForm] = useState<TenantSecurityPolicy | null>(null)
  useEffect(() => {
    if (query.data) setForm(query.data.security)
  }, [query.data])
  const save = useMutation({
    mutationFn: settingsApi.updateSecurity,
    onSuccess: (data) => queryClient.setQueryData(settingsQueryKey, data),
  })

  if (query.isLoading) return <Loading />
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />
  if (!form) return <Loading />
  const set = (key: keyof TenantSecurityPolicy, value: number) => setForm((current) => current && ({ ...current, [key]: value }))
  const numberField = (key: keyof TenantSecurityPolicy, min: number, max: number) => (
    <input
      className={inputCls}
      type="number"
      min={min}
      max={max}
      step={1}
      value={form[key]}
      onChange={(event) => set(key, Number(event.target.value))}
    />
  )

  return (
    <Card title={t('settings.security.title')}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(form) }}>
        <label className="block max-w-sm text-sm">
          <span className="mb-1 block">{t('settings.security.passwordMinLength')}</span>
          {numberField('passwordMinLength', 6, 72)}
        </label>
        <label className="block max-w-sm text-sm">
          <span className="mb-1 block">{t('settings.security.loginFailureLimit')}</span>
          {numberField('loginFailureLimit', 3, 20)}
        </label>
        <label className="block max-w-sm text-sm">
          <span className="mb-1 block">{t('settings.security.loginLockoutMinutes')}</span>
          {numberField('loginLockoutMinutes', 1, 1440)}
        </label>
        <label className="block max-w-sm text-sm">
          <span className="mb-1 block">{t('settings.security.sessionDurationMinutes')}</span>
          {numberField('sessionDurationMinutes', 0, 43200)}
        </label>
        <p className="text-xs text-gray-500">{t('settings.security.sessionDurationHelp')}</p>
        <ErrorBox error={save.error} />
        <Button type="submit" loading={save.isPending}>
          {t('camp.common.save')}
        </Button>
      </form>
    </Card>
  )
}
