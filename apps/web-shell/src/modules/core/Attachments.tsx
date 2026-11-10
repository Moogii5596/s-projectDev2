import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, Card, ErrorBox, Loading } from '../../core/ui'
import { INTL_LOCALE, currentLang } from '../../i18n'
import { attachmentKeys, attachmentsApi, type AttachmentView } from './api'
import { formatBytes, saveBlob } from './files'

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.txt,.csv'

/** v0.2.4 FILE-01 — объектын хавсралт (жагсаалт, оруулах, татах, устгах). Эрх = объектын эрх (backend) */
export default function Attachments({ entityType, entityId, canUpload = true }: { entityType: string; entityId: string; canUpload?: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const key = attachmentKeys(entityType, entityId)
  const q = useQuery({ queryKey: key, queryFn: () => attachmentsApi.list(entityType, entityId) })
  const upload = useMutation({
    mutationFn: (files: File[]) => attachmentsApi.upload(entityType, entityId, files),
    onSuccess: (data) => qc.setQueryData(key, data),
    onSettled: () => {
      if (input.current) input.current.value = ''
    },
  })
  const remove = useMutation({ mutationFn: attachmentsApi.remove, onSuccess: () => qc.invalidateQueries({ queryKey: key }) })
  const download = useMutation({ mutationFn: async (a: AttachmentView) => saveBlob(await attachmentsApi.download(a.id), a.fileName) })
  const locale = INTL_LOCALE[currentLang()]

  return (
    <Card
      title={t('files.title')}
      actions={canUpload && (
        <>
          <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files?.length && upload.mutate([...e.target.files])} />
          <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => input.current?.click()}>{t('files.upload')}</Button>
        </>
      )}
    >
      {q.isLoading && <Loading />}
      {q.isError && <ErrorBox error={q.error} />}
      {(upload.error || remove.error || download.error) && <ErrorBox error={upload.error ?? remove.error ?? download.error} />}
      {q.data && q.data.items.length === 0 && <p className="text-sm text-gray-400">{t('files.empty')}</p>}
      <ul className="divide-y divide-gray-100">
        {q.data?.items.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <button type="button" className="min-w-0 flex-1 truncate text-left text-blue-600 hover:underline" onClick={() => download.mutate(a)}>{a.fileName}</button>
            <span className="text-xs text-gray-500">
              {a.docType && `${a.docType} · v${a.version} · `}
              {formatBytes(a.sizeBytes, locale)} · {a.uploadedByName ?? '—'} · {new Date(a.createdAt).toLocaleDateString(locale)}
            </span>
            {a.canDelete && (
              <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === a.id} onClick={() => window.confirm(t('files.delete_confirm', { name: a.fileName })) && remove.mutate(a.id)}>
                {t('files.delete')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-gray-400">{t('files.hint')}</p>
    </Card>
  )
}
