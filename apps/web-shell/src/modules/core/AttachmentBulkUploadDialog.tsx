import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button, ErrorBox, Modal } from '../../core/ui'
import { attachmentsApi, type AttachmentBulkPreviewItem } from './api'

const signature = (files: File[]) => files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|')

export default function AttachmentBulkUploadDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<AttachmentBulkPreviewItem[] | null>(null)
  const [previewSignature, setPreviewSignature] = useState('')
  const currentSignature = useMemo(() => signature(files), [files])
  const previewUpload = useMutation({
    mutationFn: () => attachmentsApi.previewBulk('CAMP_MAINTENANCE', files),
    onSuccess: ({ items }) => {
      setPreview(items)
      setPreviewSignature(currentSignature)
    },
  })
  const commitUpload = useMutation({
    mutationFn: () => attachmentsApi.commitBulk('CAMP_MAINTENANCE', files),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['core', 'attachments'] })
      onClose()
    },
  })
  const canCommit = preview !== null && previewSignature === currentSignature && preview.length === files.length && preview.every((item) => item.status === 'READY')

  return (
    <Modal
      title={t('files.bulk.title')}
      onClose={onClose}
      wide
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t('camp.common.cancel')}</Button>
          <Button variant="secondary" loading={previewUpload.isPending} disabled={files.length === 0} onClick={() => previewUpload.mutate()}>{t('files.bulk.preview')}</Button>
          <Button loading={commitUpload.isPending} disabled={!canCommit} onClick={() => commitUpload.mutate()}>{t('files.bulk.commit')}</Button>
        </>
      )}
    >
      <p className="text-sm text-gray-600">{t('files.bulk.hint')}</p>
      <input
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.txt,.csv"
        onChange={(event) => {
          setFiles(Array.from(event.target.files ?? []))
          setPreview(null)
          setPreviewSignature('')
          previewUpload.reset()
          commitUpload.reset()
        }}
      />
      {previewUpload.error && <ErrorBox error={previewUpload.error} />}
      {commitUpload.error && <ErrorBox error={commitUpload.error} />}
      {preview && (
        <div className="max-h-72 overflow-auto rounded border border-gray-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-left">
              <tr>
                <th className="p-2">{t('files.bulk.file')}</th>
                <th className="p-2">{t('files.bulk.object')}</th>
                <th className="p-2">{t('files.bulk.type')}</th>
                <th className="p-2">{t('files.bulk.status')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((item, index) => (
                <tr key={`${item.fileName}-${index}`} className="border-t">
                  <td className="p-2">{item.fileName}</td>
                  <td className="p-2">{item.objectCode ?? '—'}</td>
                  <td className="p-2">{item.docType ?? '—'}</td>
                  <td className="p-2">{t(`files.bulk.status.${item.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
