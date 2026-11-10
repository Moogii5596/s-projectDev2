import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Card, ErrorBox, Loading } from '../../core/ui'
import { tenantModulesApi, tenantModulesQueryKey, type TenantModuleView } from './modules-api'

export default function ModulesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: tenantModulesQueryKey, queryFn: tenantModulesApi.list })
  const update = useMutation({
    mutationFn: ({ id, active }: { id: TenantModuleView['id']; active: boolean }) => tenantModulesApi.setActive(id, active),
    onSuccess: (modules) => {
      queryClient.setQueryData(tenantModulesQueryKey, modules)
    },
  })

  if (query.isLoading) return <Loading />
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />

  return (
    <Card title={t('settings.modules.title')}>
      <div className="space-y-3">
        {query.data?.map((module) => (
          <label key={module.id} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={module.active}
              disabled={module.required || update.isPending}
              onChange={(event) => update.mutate({ id: module.id, active: event.target.checked })}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {t(`settings.modules.name.${module.id}`)}
                {module.required && <span className="text-xs text-gray-500">{t('settings.modules.required')}</span>}
                {module.debugOnly && <span className="text-xs text-amber-700">{t('settings.modules.debugOnly')}</span>}
              </span>
              {module.dependencies.length > 0 && (
                <span className="mt-1 block text-xs text-gray-500">
                  {t('settings.modules.dependencies', {
                    dependencies: module.dependencies.map((id) => t(`settings.modules.name.${id}`)).join(', '),
                  })}
                </span>
              )}
            </span>
          </label>
        ))}
        <ErrorBox error={update.error} />
      </div>
    </Card>
  )
}
