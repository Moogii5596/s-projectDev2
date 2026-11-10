import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { notificationText, relativeTime, resolveNotificationParams } from '../notification-text'
import { formatBytes } from '../files'

const dict: Record<string, string> = {
  'approval.entity.mr': 'Материалын хүсэлт',
  'notify.approval.requested.title': 'Таны батлалт хүлээж байна: {entity}',
}
const t = ((key: string, opts?: Record<string, unknown>) =>
  (dict[key] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(opts?.[k] ?? `{${k}}`))) as unknown as TFunction

describe('notification-text (NTF-01)', () => {
  it('`*Key` параметрийг орчуулж нэргүй хувилбарт өгнө (backend resolveKeyParams-тэй ижил)', () => {
    expect(resolveNotificationParams(t, { entityKey: 'approval.entity.mr', title: 'MR-1' })).toMatchObject({ entity: 'Материалын хүсэлт', title: 'MR-1' })
    expect(notificationText(t, 'notify.approval.requested.title', { entityKey: 'approval.entity.mr' })).toBe('Таны батлалт хүлээж байна: Материалын хүсэлт')
    expect(notificationText(t, null, {})).toBe('')
  })

  it('харьцангуй хугацаа ба файлын хэмжээ', () => {
    const now = Date.parse('2026-11-07T12:00:00Z')
    expect(relativeTime('2026-11-07T11:55:00Z', 'en', now)).toBe('5 minutes ago')
    expect(relativeTime('2026-10-01T00:00:00Z', 'en', now)).toMatch(/2026/)
    expect(formatBytes(512, 'en')).toBe('512 B')
    expect(formatBytes(1536, 'en')).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 * 1024, 'en')).toBe('5 MB')
  })
})
