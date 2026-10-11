import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { LANG_LABELS, LANGS, Lang, currentLang, setLanguage } from '../i18n'
import { saveLocale } from '../api/i18n'

/**
 * v0.2.0 §0.7 — МН · EN · 中文. Нэвтэрсэн бол профайлд хадгална (өөр төхөөрөмж дээр ч ижил);
 * нэвтрэх хуудсанд зөвхөн энэ төхөөрөмжид.
 */
export default function LanguageSwitcher({ persist = false }: { persist?: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const lang = currentLang()
  const choose = (l: Lang) => {
    if (l === lang) return
    setLanguage(l)
    // Сервер талын текст (алдаа, шошго) шинэ хэлээр
    void qc.invalidateQueries()
    if (persist) void saveLocale(l).catch(() => undefined)
  }
  return (
    <div role="group" aria-label={t('common.language')} className="inline-flex rounded-full border border-gray-300 overflow-hidden bg-white">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={l === lang}
          onClick={() => choose(l)}
          className={`px-2.5 py-1 text-xs ${l === lang ? 'bg-gray-900 text-white font-semibold' : 'text-gray-700 hover:bg-gray-100'}`}
        >
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  )
}
