import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Badge, Card, PageHeader } from '../../core/ui'
import { currentLang } from '../../i18n'
import { latestVersion, noteLang, releasedNotes, writeSeen } from '../../release-notes/release-notes'
import type { NoteType } from '../../release-notes/notes'
import { feedbackApi, feedbackKeys } from './api'
import { groupDoneByVersion } from './lib'

const TYPE_TONE: Record<NoteType, 'green' | 'blue' | 'yellow' | 'gray'> = { new: 'green', improved: 'blue', fixed: 'yellow', changed: 'gray' }

/**
 * v0.2.3 Блок F — «Шинэчлэлийн түүх»: хувилбар бүрийн өөрчлөлт (release-notes/notes.ts, монгол + 中文)
 * + тухайн хувилбарт хэрэгжсэн санал хүсэлт (`core_feedback.done_version`).
 */
export default function WhatsNewPage() {
  const { t } = useTranslation()
  const lang = noteLang(currentLang())
  const notes = releasedNotes()
  const done = useQuery({ queryKey: feedbackKeys.list({ status: 'DONE', limit: 500 }), queryFn: () => feedbackApi.list({ status: 'DONE', limit: 500 }) })
  const byVersion = groupDoneByVersion(done.data?.data ?? [])

  // Үзсэн гэж тэмдэглэнэ → цэсний «Шинэ» тэмдэг арилна (Layout storage event-ээр биш, дараагийн render-д)
  useEffect(() => {
    const v = latestVersion()
    if (v) {
      writeSeen(v)
      window.dispatchEvent(new Event('whats-new-seen'))
    }
  }, [])

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('whatsnew.title')}
        subtitle={
          <>
            {t('whatsnew.subtitle')} <Link to="/feedback" className="text-blue-600 hover:underline">{t('whatsnew.to_feedback')}</Link>
          </>
        }
      />
      {notes.map((n, i) => {
        const implemented = byVersion.get(n.version) ?? []
        return (
          <Card key={n.version} title={`${n.version} — ${n.title[lang]}`} actions={<span className="text-xs text-gray-400">{n.date}{i === 0 && <> · <Badge tone="blue">{t('whatsnew.current')}</Badge></>}</span>}>
            <ul className="space-y-2">
              {n.items.map((it, j) => (
                <li key={j} className="flex flex-col gap-1 sm:flex-row sm:gap-2 text-sm text-gray-800">
                  <span className="shrink-0 sm:min-w-[6.5rem]"><Badge tone={TYPE_TONE[it.type]}>{t(`whatsnew.type.${it.type}`)}</Badge></span>
                  <span>{it[lang]}</span>
                </li>
              ))}
            </ul>
            {implemented.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-600 mb-1">{t('whatsnew.implemented')}</p>
                <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
                  {implemented.map((f) => (
                    <li key={f.id}>
                      {f.title} <span className="text-xs text-gray-400">— {f.authorName}{f.voteCount > 0 && ` · +${f.voteCount}`}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
