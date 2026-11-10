import { useTranslation } from 'react-i18next'
import { Button } from '../../core/ui'
import { FeedImageGrid, ImagePicker, type FeedImageDto } from './feed-bridge'
import { remainingAttachmentSlots } from './lib'

interface Props {
  attachments: FeedImageDto[]
  files: File[]
  disabled?: boolean
  onFilesChange: (files: File[]) => void
  onRemove: (id: string) => void
}

export default function FeedbackAttachments({ attachments, files, disabled = false, onFilesChange, onRemove }: Props) {
  const { t } = useTranslation()
  const maxNewFiles = remainingAttachmentSlots(attachments.length)

  return (
    <section className="space-y-2" aria-label={t('feedback.attachments')}>
      <div>
        <p className="text-sm font-medium text-gray-700">{t('feedback.attachments')}</p>
        <p className="text-xs text-gray-500">{t('feedback.attachments.hint')}</p>
      </div>
      {attachments.length > 0 && (
        <>
          <FeedImageGrid images={attachments} dataSaver />
          <ul className="flex flex-wrap gap-2">
            {attachments.map((image, index) => (
              <li key={image.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={`${t('feedback.attachments.remove')} ${index + 1}`}
                  onClick={() => onRemove(image.id)}
                >
                  {t('feedback.attachments.remove')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      <fieldset disabled={disabled}>
        <ImagePicker value={files} onChange={onFilesChange} max={maxNewFiles} />
      </fieldset>
    </section>
  )
}
