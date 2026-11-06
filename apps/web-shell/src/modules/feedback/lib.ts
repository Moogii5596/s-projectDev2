import type { FeedbackItemDto, FeedbackKind, FeedbackStatus } from './api'

/** v0.2.3 Блок F — санал хүсэлтийн цэвэр туслах функц (vitest) */
export const MAX_FEEDBACK_ATTACHMENTS = 3
export const MAX_FEEDBACK_ATTACHMENT_BYTES = 15 * 1024 * 1024

export function remainingAttachmentSlots(attachmentCount: number): number {
  return Math.max(0, MAX_FEEDBACK_ATTACHMENTS - attachmentCount)
}

export function filesWithinAttachmentLimit(files: Pick<File, 'size'>[]): boolean {
  return files.every((file) => file.size <= MAX_FEEDBACK_ATTACHMENT_BYTES)
}

export type Tone = 'gray' | 'green' | 'yellow' | 'red' | 'blue'

export const STATUS_TONE: Record<FeedbackStatus, Tone> = {
  NEW: 'gray',
  ACCEPTED: 'blue',
  PLANNED: 'yellow',
  DONE: 'green',
  REJECTED: 'red',
}

export const KIND_TONE: Record<FeedbackKind, Tone> = { BUG: 'red', IDEA: 'blue', REQUEST: 'yellow' }

/** «Хийгдсэн» саналуудыг хувилбараар нь бүлэглэнэ ('v0.2.3' → [...]) — Шинэчлэлийн түүхэд */
export function groupDoneByVersion(items: FeedbackItemDto[]): Map<string, FeedbackItemDto[]> {
  const m = new Map<string, FeedbackItemDto[]>()
  for (const it of items) {
    if (it.status !== 'DONE' || !it.doneVersion) continue
    const list = m.get(it.doneVersion) ?? []
    list.push(it)
    m.set(it.doneVersion, list)
  }
  return m
}

/** Хувилбарын оролт зөв эсэх (backend `normalizeVersion`-тэй ижил): 0.2.3 / v0.2.3 / v0.2.2.1 */
export const isVersion = (v: string): boolean => /^v?\d+(\.\d+){1,3}$/i.test(v.trim())

/** Санал илгээх хуудсыг (навигацийн state) хадгалах зам — /feedback өөрөө бол null */
export function sourcePath(from: unknown): string | null {
  if (typeof from !== 'string' || !from.startsWith('/')) return null
  if (from.startsWith('/feedback')) return null
  return from.slice(0, 300)
}
