import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { isEnabled } from '../../config/enabled-modules'
import { DEBUG_MODULES, debugModulePath, isBuildModule } from '../../lib/modules'
import { tenantModulesApi, tenantModulesQueryKey } from './modules-api'
import { Card, ErrorBox, Loading, NoAccess } from '../../core/ui'

export default function DebugModulesPage() {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: tenantModulesQueryKey, queryFn: tenantModulesApi.getMine })
  if (query.isLoading) return <Loading />
  if (query.isError) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />

  const modules: { id: (typeof DEBUG_MODULES)[number]; path: string }[] = []
  for (const id of DEBUG_MODULES) {
    const path = debugModulePath(id)
    if (!path || !query.data?.includes(id)) continue
    if (id === 'workflow') {
      if (isEnabled('mr')) modules.push({ id, path })
      continue
    }
    if (isBuildModule(id) && isEnabled(id)) modules.push({ id, path })
  }
  if (modules.length === 0) return <NoAccess what={t('nav.debug')} />

  return (
    <Card title={t('nav.debug')}>
      <ul className="space-y-2">
        {modules.map(({ id, path }) => (
          <li key={id}>
            <Link className="text-sm text-blue-700 hover:underline" to={path}>
              {t(`settings.modules.name.${id}`)}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
