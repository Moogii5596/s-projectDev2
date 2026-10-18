import { Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * v0.2.2 Блок 6 (PIL-10): `React.lazy` хуудсуудын ачааллын хүрээ.
 * Layout-уудын `<Outlet />`-ийг ороож — хуудас ачаалагдах хооронд толгой/цэс харагдсаар байна.
 */
export default function PageSuspense({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Suspense
      fallback={
        <div className="py-10 text-center text-sm text-gray-400" role="status">
          {t('common.loading')}
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
