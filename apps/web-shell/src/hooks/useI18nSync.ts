import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getWebMessages } from '../api/i18n'
import { applyOverrides, currentLang, getLanguageSelectionRevision, isLang, setLanguage } from '../i18n'
import { useMe } from './useMe'

/**
 * v0.2.0 §0.7 — нэвтэрсний дараа:
 *   1) Профайлын хэл (core_users.locale) — нэвтрэх бүрт нэг удаа (өөр төхөөрөмж дээр ч ижил)
 *   2) Байгууллагын орчуулгын засвар — 60 сек тутам (Excel-ээр засаад оруулмагц ≤60с-д шинэчлэгдэнэ)
 */
export function useI18nSync(): void {
  const { i18n } = useTranslation()
  const { me } = useMe()
  const appliedFor = useRef<string | null>(null)
  const selectionRevisionAtMount = useRef(getLanguageSelectionRevision())

  useEffect(() => {
    if (!me || appliedFor.current === me.id) return
    appliedFor.current = me.id
    if (
      isLang(me.locale) &&
      me.locale !== currentLang() &&
      getLanguageSelectionRevision() === selectionRevisionAtMount.current
    ) {
      setLanguage(me.locale, 'profile')
    }
  }, [me])

  const lang = isLang(i18n.language) ? i18n.language : 'mn'
  const { data } = useQuery({
    queryKey: ['i18n', 'web', lang],
    queryFn: () => getWebMessages(lang),
    enabled: !!me,
    // #32: 60 с → 10 мин — админы нэр томьёоны өөрчлөлт хамгийн ихдээ 10 мин-д (эсвэл хуудас дахин ачаалахад) хүрнэ
    refetchInterval: 600_000,
    staleTime: 300_000,
  })
  // react-query structural sharing: өөрчлөгдөөгүй бол ижил объект → effect дахин ажиллахгүй
  useEffect(() => {
    if (data) applyOverrides(data.lang, data.messages)
  }, [data])
}
