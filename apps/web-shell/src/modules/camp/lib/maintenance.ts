import i18n from '../../../i18n'
import type { MaintenanceAction, MaintenanceStatus } from '../api/types'

/**
 * Засварын төлвийн машин — backend `maintenance-flow.ts`-тэй ИЖИЛ (UI товч харуулах; backend дахин шалгана).
 *   start: OPEN → IN_PROGRESS (parts) · complete: IN_PROGRESS → DONE (parts) · reopen: DONE → IN_PROGRESS (close)
 *   close: DONE → CLOSED (close) · cancel: OPEN/IN_PROGRESS → CANCELLED (close эсвэл үүсгэсэн хүн + create)
 */
export interface MaintenanceActor {
  canParts: boolean
  canClose: boolean
  canCreate: boolean
  isReporter: boolean
}

const FROM: Record<MaintenanceAction, MaintenanceStatus[]> = {
  start: ['OPEN'],
  complete: ['IN_PROGRESS'],
  reopen: ['DONE'],
  close: ['DONE'],
  cancel: ['OPEN', 'IN_PROGRESS'],
}

export const ACTION_LABEL = {} as Record<MaintenanceAction, string>
for (const a of ['start', 'complete', 'reopen', 'close', 'cancel'] as MaintenanceAction[]) {
  Object.defineProperty(ACTION_LABEL, a, { enumerable: true, get: () => i18n.t(`camp.maint.action.${a}`) })
}

function allowed(action: MaintenanceAction, a: MaintenanceActor): boolean {
  switch (action) {
    case 'start':
    case 'complete':
      return a.canParts
    case 'reopen':
    case 'close':
      return a.canClose
    case 'cancel':
      return a.canClose || (a.isReporter && a.canCreate)
  }
}

/** Тухайн төлөв ба эрхэд харагдах үйлдлүүд (дарааллаар) */
export function availableActions(status: MaintenanceStatus, a: MaintenanceActor): MaintenanceAction[] {
  return (Object.keys(FROM) as MaintenanceAction[]).filter((act) => FROM[act].includes(status) && allowed(act, a))
}

/** Сэлбэг нэмэх/засах/устгах: OPEN / IN_PROGRESS / DONE + parts эрх */
export const canEditParts = (status: MaintenanceStatus, a: MaintenanceActor) => a.canParts && ['OPEN', 'IN_PROGRESS', 'DONE'].includes(status)

/** Гарчиг/тайлбар/зэрэглэл: OPEN / IN_PROGRESS + (close эрх эсвэл үүсгэсэн хүн) */
export const canEditDetails = (status: MaintenanceStatus, a: MaintenanceActor) =>
  ['OPEN', 'IN_PROGRESS'].includes(status) && (a.canClose || (a.isReporter && a.canCreate))

export const STATUS_TONE: Record<MaintenanceStatus, 'yellow' | 'blue' | 'green' | 'gray' | 'red'> = {
  OPEN: 'yellow',
  IN_PROGRESS: 'blue',
  DONE: 'green',
  CLOSED: 'gray',
  CANCELLED: 'red',
}
