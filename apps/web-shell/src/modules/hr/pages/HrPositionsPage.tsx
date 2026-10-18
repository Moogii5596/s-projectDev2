import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogItem } from '../../camp/api/types'
import { useCampPermissions } from '../../camp/hooks/useCampPermissions'
import { isSystemAdmin } from '../../camp/lib/permissions'
import { Button } from '../../camp/components/ui'
import CatalogPage from '../../camp/pages/CatalogPage'
import PositionTemplatesModal from '../components/PositionTemplatesModal'

/** /hr/:campId/positions — албан тушаалын каталог + (B4-Q5) мөр бүрт «Эрхийн загвар» (системийн админ) */
export default function HrPositionsPage() {
  const { t } = useTranslation()
  const perms = useCampPermissions()
  const canRoles = isSystemAdmin(perms.data)
  const [tpl, setTpl] = useState<CatalogItem | null>(null)
  return (
    <>
      <CatalogPage
        kind="positions"
        rowAction={
          canRoles
            ? (c) => (
                <Button variant="ghost" onClick={() => setTpl(c)}>
                  {t('hr.tpl.button')}
                </Button>
              )
            : undefined
        }
      />
      {tpl && <PositionTemplatesModal position={tpl} onClose={() => setTpl(null)} />}
    </>
  )
}
