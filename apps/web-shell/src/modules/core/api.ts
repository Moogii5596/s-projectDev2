import apiClient from '../../api/client'

/**
 * v0.2.4 — цөмийн нийтлэг үйлчилгээний API: мэдэгдэл (NTF-01), батлах урсгал (WF-06), хавсралт (FILE-01), Debug (DBG-01).
 * Төрлүүд backend-ийн DTO-тай ТАМ АДИЛ (RULE-20): notification.service.ts, approvals.service.ts, attachments.service.ts, debug.service.ts.
 */

// ── Мэдэгдэл ───────────────────────────────────────────────
export type NotificationParams = Record<string, string | number | boolean | null>

export interface NotificationView {
  id: string
  type: string
  titleKey: string
  bodyKey: string | null
  params: NotificationParams
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationPrefView {
  type: string
  module: string
  labelKey: string
  inApp: boolean
  email: boolean
}

export const notificationsApi = {
  list: async (q: { unreadOnly?: boolean; before?: string; limit?: number } = {}) =>
    (await apiClient.get<{ items: NotificationView[]; nextBefore: string | null }>('/api/v1/core/notifications', { params: q })).data,
  unreadCount: async () => (await apiClient.get<{ count: number }>('/api/v1/core/notifications/unread-count')).data,
  markRead: async (id: string) => (await apiClient.post(`/api/v1/core/notifications/${id}/read`)).data,
  markAllRead: async () => (await apiClient.post<{ count: number }>('/api/v1/core/notifications/read-all')).data,
  preferences: async () => (await apiClient.get<{ items: NotificationPrefView[] }>('/api/v1/core/notifications/preferences')).data,
  updatePreferences: async (items: Array<{ type: string; inApp: boolean; email: boolean }>) =>
    (await apiClient.put<{ items: NotificationPrefView[] }>('/api/v1/core/notifications/preferences', { items })).data,
}

export const notificationKeys = {
  all: ['core', 'notifications'] as const,
  unread: ['core', 'notifications', 'unread'] as const,
  prefs: ['core', 'notifications', 'prefs'] as const,
}

// ── Батлах урсгал ──────────────────────────────────────────
export interface ApprovalListItem {
  id: string
  entityType: string
  labelKey: string
  title: string
  link: string | null
  status: string
  currentStep: number
  totalSteps: number
  stepName: string | null
  requesterName: string | null
  amount: number | null
  createdAt: string
  dueAt: string | null
  onBehalfOf: string | null
}

export interface ApprovalDetail extends ApprovalListItem {
  canDecide: boolean
  steps: Array<{ index: number; name: string | null; permission: string | null; role: string | null; quorum: number }>
  logs: Array<{ stepOrder: number; action: string; comment: string | null; actorName: string | null; onBehalfOfName: string | null; actedAt: string }>
}

export interface ApprovalStepInput {
  name?: string
  permission: string
  quorum: number
  minAmount?: number
  maxAmount?: number
}

export interface ApprovalDefinitionView {
  id: string
  version: number
  name: string
  isActive: boolean
  slaHours: number
  escalationEnabled: boolean
  delegationEnabled: boolean
  steps: Array<ApprovalStepInput & { order: number; role?: string }>
  pendingCount: number
  createdAt: string
}

export interface ApprovalEntityType {
  entityType: string
  module: string
  labelKey: string
  approvePermissions: string[]
}

export interface DelegationView {
  id: string
  mine: boolean
  delegatorName: string | null
  delegateName: string | null
  delegateId: string
  validFrom: string
  validUntil: string
  reason: string | null
}

export const approvalsApi = {
  inbox: async () => (await apiClient.get<{ items: ApprovalListItem[] }>('/api/v1/core/approvals/inbox')).data,
  mine: async () => (await apiClient.get<{ items: ApprovalListItem[] }>('/api/v1/core/approvals/mine')).data,
  detail: async (id: string) => (await apiClient.get<ApprovalDetail>(`/api/v1/core/approvals/instances/${id}`)).data,
  decide: async (id: string, action: 'APPROVE' | 'REJECT', comment?: string) =>
    (await apiClient.post<ApprovalDetail>(`/api/v1/core/approvals/instances/${id}/decide`, { action, comment })).data,
  entityTypes: async () => (await apiClient.get<{ items: ApprovalEntityType[] }>('/api/v1/core/approvals/entity-types')).data,
  definitions: async (entityType: string) =>
    (await apiClient.get<{ items: ApprovalDefinitionView[] }>('/api/v1/core/approvals/definitions', { params: { entityType } })).data,
  saveDefinition: async (body: { entityType: string; name: string; steps: ApprovalStepInput[]; slaHours: number; escalationEnabled: boolean; delegationEnabled: boolean }) =>
    (await apiClient.post<{ items: ApprovalDefinitionView[] }>('/api/v1/core/approvals/definitions', body)).data,
  delegates: async () => (await apiClient.get<{ items: Array<{ id: string; name: string }> }>('/api/v1/core/approvals/delegates')).data,
  delegations: async () => (await apiClient.get<{ items: DelegationView[] }>('/api/v1/core/approvals/delegations')).data,
  createDelegation: async (body: { delegateId: string; validFrom?: string; validUntil: string; reason?: string }) =>
    (await apiClient.post<{ items: DelegationView[] }>('/api/v1/core/approvals/delegations', body)).data,
  revokeDelegation: async (id: string) => (await apiClient.delete<{ items: DelegationView[] }>(`/api/v1/core/approvals/delegations/${id}`)).data,
}

export const approvalKeys = {
  inbox: ['core', 'approvals', 'inbox'] as const,
  mine: ['core', 'approvals', 'mine'] as const,
  detail: (id: string) => ['core', 'approvals', 'detail', id] as const,
  types: ['core', 'approvals', 'types'] as const,
  definitions: (t: string) => ['core', 'approvals', 'definitions', t] as const,
  delegations: ['core', 'approvals', 'delegations'] as const,
  delegates: ['core', 'approvals', 'delegates'] as const,
}

// ── Хавсралт ───────────────────────────────────────────────
export interface AttachmentView {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  docType: string | null
  version: number
  docDate: string | null
  uploadedByName: string | null
  createdAt: string
  canDelete: boolean
}

export interface AttachmentBulkPreviewItem {
  fileName: string
  objectCode: string | null
  docType: string | null
  docDate: string | null
  status: 'READY' | 'INVALID_NAME' | 'OBJECT_NOT_FOUND' | 'DUPLICATE_IN_BATCH'
}

export interface AttachmentNamePattern {
  entityType: string
  pattern: string
}

export const attachmentsApi = {
  list: async (entityType: string, entityId: string) =>
    (await apiClient.get<{ items: AttachmentView[] }>('/api/v1/core/attachments', { params: { entityType, entityId } })).data,
  upload: async (entityType: string, entityId: string, files: File[]) => {
    const fd = new FormData()
    for (const f of files) fd.append('files', f, f.name)
    return (await apiClient.post<{ items: AttachmentView[] }>('/api/v1/core/attachments', fd, { params: { entityType, entityId } })).data
  },
  download: async (id: string) => (await apiClient.get<Blob>(`/api/v1/core/attachments/${id}/download`, { responseType: 'blob' })).data,
  remove: async (id: string) => (await apiClient.delete(`/api/v1/core/attachments/${id}`)).data,
  patterns: async () => (await apiClient.get<AttachmentNamePattern[]>('/api/v1/core/attachments/patterns')).data,
  savePattern: async (body: AttachmentNamePattern) =>
    (await apiClient.put<AttachmentNamePattern[]>('/api/v1/core/attachments/patterns', body)).data,
  previewBulk: async (entityType: string, files: File[]) => {
    const fd = new FormData()
    for (const file of files) fd.append('files', file, file.name)
    return (await apiClient.post<{ items: AttachmentBulkPreviewItem[] }>('/api/v1/core/attachments/bulk/preview', fd, { params: { entityType } })).data
  },
  commitBulk: async (entityType: string, files: File[]) => {
    const fd = new FormData()
    for (const file of files) fd.append('files', file, file.name)
    return (await apiClient.post<{ uploaded: number }>('/api/v1/core/attachments/bulk/commit', fd, { params: { entityType } })).data
  },
}

export const attachmentKeys = (entityType: string, entityId: string) => ['core', 'attachments', entityType, entityId] as const

// ── Debug ─────────────────────────────────────────────────
export interface DebugSystem {
  version: string
  commit: string | null
  buildDate: string | null
  startedAt: string
  uptimeSec: number
  node: string
  nest: string | null
  platform: string
  pid: number
  memoryMb: { rss: number; heapUsed: number }
  environment: string
  tenant: { id: string; slug: string; name: string } | null
  config: Array<{ key: string; secret: boolean; set: boolean; value: string | null }>
}

export interface DebugHealthCheck {
  ok: boolean
  ms?: number
  error: string | null
}

export interface DebugHealth {
  db: DebugHealthCheck & { sizeBytes?: number; lastMigration?: string | null }
  redis: DebugHealthCheck
  gotrue: DebugHealthCheck
  smtp: { configured: boolean }
  storage: { ok: boolean; error: string | null; bytes?: number; files?: number; diskFreeBytes?: number; diskTotalBytes?: number }
  storageDbWarning: { thresholdGb: number | null; combinedBytes: number | null; overThreshold: boolean | null; configValid: boolean }
  queues: { outbox?: Record<string, number>; notificationEmail?: Record<string, number>; error?: string }
  cron: Array<{
    name: string
    lastRun: string | null
    nextRun: string | null
    lastStatus: 'SUCCEEDED' | 'FAILED' | null
    lastResult: unknown
    lastError: string | null
  }>
}

/** = backend `LoginLockStatus` (auth/login-lock.service.ts) — v0.2.5 H1 */
export interface DebugLoginLock {
  locked: boolean
  lockedUntil: string | null
  failedCount: number
}

export interface DebugPermissions {
  user: { id: string; fullName: string | null; email: string; role: string; isActive: boolean }
  isTenantAdmin: boolean
  debugView: boolean
  items: Array<{ code: string; scope: 'TENANT' | 'SITE'; siteName: string | null; source: string; roleName: string | null }>
}

export const debugApi = {
  me: async () => (await apiClient.get<{ canManage: boolean }>('/api/v1/core/debug/me')).data,
  system: async () => (await apiClient.get<DebugSystem>('/api/v1/core/debug/system')).data,
  health: async () => (await apiClient.get<DebugHealth>('/api/v1/core/debug/health')).data,
  users: async () => (await apiClient.get<Array<{ id: string; fullName: string | null; email: string; role: string; isActive: boolean }>>('/api/v1/core/debug/users')).data,
  permissions: async (userId: string) => (await apiClient.get<DebugPermissions>(`/api/v1/core/debug/permissions/${userId}`)).data,
  logs: async (level?: 'error' | 'warn') =>
    (await apiClient.get<{ items: Array<{ at: string; level: string; context: string | null; message: string }> }>('/api/v1/core/debug/logs', { params: { level } })).data,
  audit: async (q: { entityType?: string; limit?: number }) =>
    (await apiClient.get<{ items: Array<{ id: string; at: string; entityType: string; entityId: string; action: string; summaryKey: string; summaryParams: Record<string, unknown>; actorName: string | null }> }>('/api/v1/core/debug/audit', { params: q })).data,
  i18nMissing: async () => (await apiClient.get<{ total: number; items: Array<{ key: string; section: string; missing: string[] }> }>('/api/v1/core/debug/i18n-missing')).data,
  outbox: async () =>
    (await apiClient.get<{ items: Array<{ id: string; eventType: string; aggregateType: string; aggregateId: string; status: string; retryCount: number; lastError: string | null; createdAt: string }> }>('/api/v1/core/debug/outbox')).data,
  clearCaches: async () => (await apiClient.post('/api/v1/core/debug/actions/cache-clear')).data,
  retryOutbox: async (id: string) => (await apiClient.post(`/api/v1/core/debug/actions/outbox/${id}/retry`)).data,
  loginLock: async (userId: string) => (await apiClient.get<DebugLoginLock>(`/api/v1/core/debug/users/${userId}/login-lock`)).data,
  unlockLogin: async (userId: string) => (await apiClient.post<{ ok: true; wasLocked: boolean }>(`/api/v1/core/debug/actions/users/${userId}/unlock`)).data,
}
