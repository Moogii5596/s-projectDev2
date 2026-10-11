import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getWebMessages } from '../api/i18n'
import { applyOverrides, currentLang, isLang, setLanguage } from '../i18n'
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

  useEffect(() => {
    if (!me || appliedFor.current === me.id) return
    appliedFor.current = me.id
    if (isLang(me.locale) && me.locale !== currentLang()) setLanguage(me.locale)
  }, [me])

  const lang = isLang(i18n.language) ? i18n.language : 'mn'
  const { data } = useQuery({
    queryKey: ['i18n', 'web', lang],
    queryFn: () => getWebMessages(lang),
    enabled: !!me,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  // react-query structural sharing: өөрчлөгдөөгүй бол ижил объект → effect дахин ажиллахгүй
  useEffect(() => {
    if (data) applyOverrides(data.lang, data.messages)
  }, [data])
}
