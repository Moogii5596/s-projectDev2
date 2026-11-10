import { useTranslation } from 'react-i18next'

/** Debug → MFE ачаалж байх үеийн текст (i18n; v0.2.4 hardcode цэвэрлэгээ) */
export default function MfeLoading() {
  const { t } = useTranslation()
  return <div className="py-8 text-center text-sm text-gray-500">{t('debug.mfe_loading')}</div>
}
