import { useTranslation } from 'react-i18next';

export default function RouteErrorBoundary() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
      <h1 className="text-xl font-semibold">{t('common.error')}</h1>
      <button className="rounded border px-4 py-2" onClick={() => window.location.reload()}>
        {t('common.retry')}
      </button>
    </main>
  );
}
