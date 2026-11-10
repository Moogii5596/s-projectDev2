import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogItem } from '../api/camp-bridge'
import { useAppPermissions } from '../../../core/useAppPermissions'
import { isSystemAdmin } from '../../../core/permissions'
import { Button } from '../../../core/ui'
import { CatalogPage } from '../api/camp-bridge'
import PositionTemplatesModal from '../components/PositionTemplatesModal'

/** /hr/:campId/positions — албан тушаалын каталог + (B4-Q5) мөр бүрт «Эрхийн загвар» (системийн админ) */
export default function HrPositionsPage() {
  const { t } = useTranslation()
  const perms = useAppPermissions()
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
