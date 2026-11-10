import { useTranslation } from 'react-i18next'

export default function LoadingSpinner({ message }: { message?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-gray-400 text-sm">{message ?? t('camp.common.loading')}</div>
    </div>
  )
}
