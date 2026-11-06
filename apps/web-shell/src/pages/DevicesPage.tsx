import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { currentLang, INTL_LOCALE } from '../i18n'
import { listSessions, revokeOtherSessions, revokeSession, sessionKeys } from '../api/sessions'
import { deviceTitle, otherDevices, sortDevices } from '../lib/devices'
import { useCampMutation } from '../modules/camp/hooks/useCampMutation'
import { Badge, Button, Card, ErrorBox, Loading, Modal, PageHeader } from '../modules/camp/components/ui'

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(INTL_LOCALE[currentLang()], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * /account/devices — v0.2.3 Блок 4б (PIL-15, D-3): миний бүртгэлээр нэвтэрсэн төхөөрөмжүүд.
 * Хэрэглэгч өөрөө танихгүй / хэрэггүй төхөөрөмжөөс гаргана. Энэ төхөөрөмжийг эндээс гаргахгүй (цэсийн «Гарах»).
 */
export default function DevicesPage() {
  const { t } = useTranslation()
  const sessions = useQuery({ queryKey: sessionKeys.all, queryFn: listSessions })
  const [confirmAll, setConfirmAll] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const revokeOne = useCampMutation((id: string) => revokeSession(id), [sessionKeys.all], () => setNotice(null))
  const revokeAll = useCampMutation(() => revokeOtherSessions(), [sessionKeys.all], (n) => {
    setConfirmAll(false)
    setNotice(t('devices.revoked_n', { n }))
  })

  const list = sortDevices(sessions.data ?? [])
  const others = otherDevices(list)

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('devices.title')}
        subtitle={t('devices.subtitle')}
        actions={others.length > 0 ? <Button variant="danger" size="sm" onClick={() => setConfirmAll(true)}>{t('devices.revoke_others')}</Button> : undefined}
      />
      {notice && <div role="status" className="bg-green-50 text-green-700 text-sm px-3 py-2 rounded-lg">{notice}</div>}
      <ErrorBox error={sessions.error ?? revokeOne.error} onRetry={() => sessions.refetch()} />
      {sessions.isLoading && <Loading />}
      <div className="space-y-3">
        {list.map((d) => (
          <Card key={d.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{deviceTitle(d.userAgent, t('devices.unknown'))}</span>
                  {d.current && <Badge tone="green">{t('devices.current')}</Badge>}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {t('devices.last_active')}: {fmt(d.lastActiveAt)} · {t('devices.signed_in')}: {fmt(d.createdAt)}
                  {d.ip && <> · IP {d.ip}</>}
                </p>
              </div>
              {!d.current && (
                <Button variant="secondary" size="sm" loading={revokeOne.isPending && revokeOne.variables === d.id} onClick={() => revokeOne.mutate(d.id)}>
                  {t('devices.revoke')}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      {sessions.data && others.length === 0 && <p className="text-sm text-gray-500">{t('devices.only_this')}</p>}
      <p className="text-sm"><Link to="/change-password" className="text-blue-600 hover:underline">{t('auth.change.link')}</Link></p>

      {confirmAll && (
        <Modal
          title={t('devices.revoke_others')}
          onClose={() => setConfirmAll(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmAll(false)}>{t('camp.common.cancel')}</Button>
              <Button variant="danger" loading={revokeAll.isPending} onClick={() => revokeAll.mutate(undefined)}>{t('devices.revoke_others')}</Button>
            </>
          }
        >
          <p className="text-sm text-gray-700">{t('devices.revoke_others_confirm', { n: others.length })}</p>
          <ErrorBox error={revokeAll.error} />
        </Modal>
      )}
    </div>
  )
}
