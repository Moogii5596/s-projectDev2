import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { campApi } from '../../camp/api/camp-api'
import { campKeys } from '../../camp/hooks/useCampPermissions'
import { useCampMutation } from '../../camp/hooks/useCampMutation'
import { Button, ErrorBox, inputSmCls } from '../../camp/components/ui'
import { inviteLink } from '../lib/user-access'

/**
 * v0.2.2 Блок 4 — урилга: «Линк үүсгэх» (нэг удаа харагдана → хуулах) · «Имэйлээр илгээх» (SMTP + бодит имэйлтэй үед).
 * Шинэ урилга өмнөхийг хүчингүй болгоно (backend). Эрх: системийн админ (SEC-009).
 */
export default function InviteActions({ userId, hasRealEmail }: { userId: string; hasRealEmail: boolean }) {
  const { t } = useTranslation()
  const options = useQuery({ queryKey: campKeys.inviteOptions, queryFn: campApi.inviteOptions, staleTime: 60_000 })
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const byLink = useCampMutation(() => campApi.inviteUser(userId, 'LINK'), [campKeys.users], (res) => {
    setLink(inviteLink(res, window.location.origin))
    setCopied(false)
  })
  const byEmail = useCampMutation(() => campApi.inviteUser(userId, 'EMAIL'), [campKeys.users], () => setSent(true))

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false) // хуулах боломжгүй (http, эрх) — талбараас гараар хуулна
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => byLink.mutate(undefined)} loading={byLink.isPending}>
          {t('hr.access.make_link')}
        </Button>
        {options.data?.emailEnabled && hasRealEmail && (
          <Button size="sm" variant="secondary" onClick={() => byEmail.mutate(undefined)} loading={byEmail.isPending}>
            {t('hr.access.send_email')}
          </Button>
        )}
      </div>
      {link && (
        <div className="flex gap-2 items-center">
          <input aria-label={t('hr.access.link')} readOnly className={`${inputSmCls} flex-1 font-mono text-xs`} value={link} onFocus={(e) => e.target.select()} />
          <Button size="sm" onClick={copy}>
            {copied ? t('hr.access.copied') : t('hr.access.copy')}
          </Button>
        </div>
      )}
      {link && <p className="text-xs text-gray-500">{t('hr.access.link_hint')}</p>}
      {sent && <p className="text-xs text-green-700">{t('hr.access.email_sent')}</p>}
      <ErrorBox error={byLink.error ?? byEmail.error} />
    </div>
  )
}
