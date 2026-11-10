import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, Card, ErrorBox, Field, Loading, inputCls } from '../../core/ui'
import { attachmentsApi, type AttachmentNamePattern } from './core-bridge'

const PATTERNS_KEY = ['core', 'attachment-patterns'] as const

export default function AttachmentPatternsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: PATTERNS_KEY, queryFn: attachmentsApi.patterns })
  const [values, setValues] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: (item: AttachmentNamePattern) => attachmentsApi.savePattern(item),
    onSuccess: (items) => {
      queryClient.setQueryData(PATTERNS_KEY, items)
      void queryClient.invalidateQueries({ queryKey: PATTERNS_KEY })
    },
  })

  useEffect(() => {
    if (query.data) setValues(Object.fromEntries(query.data.map((item) => [item.entityType, item.pattern])))
  }, [query.data])

  if (query.isLoading) return <Loading />
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />

  return (
    <Card title={t('files.patterns.title')}>
      <p className="mb-4 text-sm text-gray-600">{t('files.patterns.hint')}</p>
      <div className="space-y-4">
        {query.data?.map((item) => (
          <form
            key={item.entityType}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              save.mutate({ entityType: item.entityType, pattern: values[item.entityType] ?? item.pattern })
            }}
          >
            <Field label={t('files.patterns.entity', { entityType: item.entityType })}>{(id) => (
              <input
                id={id}
                className={inputCls}
                value={values[item.entityType] ?? item.pattern}
                maxLength={100}
                onChange={(event) => setValues((current) => ({ ...current, [item.entityType]: event.target.value }))}
              />
            )}</Field>
            <Button type="submit" loading={save.isPending} disabled={!values[item.entityType]?.trim()}>{t('files.patterns.save')}</Button>
          </form>
        ))}
      </div>
      <ErrorBox error={save.error} />
    </Card>
  )
}
