import { useState } from 'react'
import { Link, Navigate, NavLink, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../api/camp-api'
import type { Camp } from '../api/types'
import { campKeys, useCampPermissions } from '../hooks/useCampPermissions'
import { useCampMutation } from '../hooks/useCampMutation'
import { useMe } from '../../../hooks/useMe'
import { P } from '../lib/permissions'
import { ActiveBadge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Table, inputCls, td } from '../components/ui'
import { CreateCampModal } from './CampHomePage'
import OrganizationsPage from './OrganizationsPage'
import AssetCategoriesPage from './AssetCategoriesPage'
import RolesPage from './RolesPage'
import UserRolesPage from './UserRolesPage'
import TranslationsPage from './TranslationsPage'
import CatalogPage from './CatalogPage'

/**
 * /camp/system/:section — FB-11 (v0.2.0) "Системийн тохиргоо": кемпүүд, байгууллага, албан тушаал, байрны төрөл (v0.2.1), хөрөнгийн ангилал,
 * роль ба эрх, хэрэглэгчийн роль, орчуулга (OWNER/ADMIN). Хуучин /camp/admin/* → энд redirect.
 * v0.2.2 H2: албан тушаал → «Хүний нөөц» (/hr/positions).
 */
const SECTIONS = ['camps', 'organizations', 'building-types', 'asset-categories', 'roles', 'user-roles', 'translations'] as const
const ADMIN_ONLY: readonly string[] = ['roles', 'user-roles', 'translations']

export default function SystemSettingsPage() {
  const { t } = useTranslation()
  const { section = 'camps' } = useParams()
  const { me } = useMe()
  const isOrgAdmin = me?.role === 'OWNER' || me?.role === 'ADMIN'
  // SEC-009 (Блок 6б): роль ба эрх, хэрэглэгчийн роль, орчуулга — зөвхөн системийн админ
  const visible = SECTIONS.filter((s) => !ADMIN_ONLY.includes(s) || isOrgAdmin)
  if (!(SECTIONS as readonly string[]).includes(section)) return <Navigate to="/camp/system/camps" replace />

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500">
        <Link to="/camp?list=1" className="hover:text-blue-600">
          {t('camp.layout.all_camps')}
        </Link>{' '}
        / {t('camp.system.title')}
      </div>
      <div className="flex flex-col gap-5 md:flex-row">
        <nav aria-label={t('camp.system.title')} className="md:w-56 shrink-0 flex md:flex-col gap-1 overflow-x-auto">
          {visible.map((s) => (
            <NavLink
              key={s}
              to={`/camp/system/${s}`}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm whitespace-nowrap ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'}`
              }
            >
              {t(`camp.system.section.${s}`)}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          {section === 'camps' && <CampsSection />}
          {section === 'organizations' && <OrganizationsPage />}
          {section === 'building-types' && <CatalogPage kind="building-types" />}
          {section === 'asset-categories' && <AssetCategoriesPage />}
          {section === 'roles' && <RolesPage />}
          {section === 'user-roles' && <UserRolesPage />}
          {section === 'translations' && (isOrgAdmin ? <TranslationsPage /> : <Empty>{t('camp.error.forbidden')}</Empty>)}
        </div>
      </div>
    </div>
  )
}

function CampsSection() {
  const { t } = useTranslation()
  const perms = useCampPermissions()
  const camps = useQuery({ queryKey: campKeys.camps, queryFn: () => campApi.camps(false) })
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Camp | null>(null)
  const canEdit = perms.can(P.MASTER_MANAGE)
  return (
    <div className="space-y-4">
      <PageHeader title={t('camp.system.section.camps')} actions={canEdit && <Button onClick={() => setCreating(true)}>{t('camp.home.add_camp')}</Button>} />
      <Card>
        {camps.isLoading && <Loading />}
        <ErrorBox error={camps.error} onRetry={() => camps.refetch()} />
        {camps.data && camps.data.length === 0 && <Empty>{t('camp.home.empty')}</Empty>}
        {camps.data && camps.data.length > 0 && (
          <Table head={[t('camp.common.code'), t('camp.common.name'), t('camp.common.location'), t('camp.common.status'), '']}>
            {camps.data.map((c) => (
              <tr key={c.id}>
                <td className={`${td} font-mono`}>{c.code}</td>
                <td className={td}>
                  <Link to={`/camp/${c.id}`} className="text-blue-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className={`${td} text-gray-500`}>{c.location ?? '—'}</td>
                <td className={td}>
                  <ActiveBadge active={c.isActive} />
                </td>
                <td className={`${td} text-right`}>
                  {canEdit && (
                    <Button variant="ghost" onClick={() => setEditing(c)}>
                      {t('camp.common.edit')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {creating && <CreateCampModal onClose={() => setCreating(false)} />}
      {editing && <EditCampModal camp={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditCampModal({ camp, onClose }: { camp: Camp; onClose: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(camp.name)
  const [location, setLocation] = useState(camp.location ?? '')
  const [isActive, setIsActive] = useState(camp.isActive)
  const m = useCampMutation(() => campApi.updateCamp(camp.id, { name: name.trim(), location: location.trim() || null, isActive }), [campKeys.camps], onClose)
  return (
    <Modal
      title={`${camp.code} · ${camp.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('camp.common.cancel')}
          </Button>
          <Button onClick={() => m.mutate(undefined)} loading={m.isPending} disabled={!name.trim()}>
            {t('camp.common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('camp.common.name')}>{(id) => <input id={id} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />}</Field>
      <Field label={t('camp.common.location')}>
        {(id) => <input id={id} className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} />}
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> {t('camp.common.active')}
      </label>
      <ErrorBox error={m.error} />
    </Modal>
  )
}
