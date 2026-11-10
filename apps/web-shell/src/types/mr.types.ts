// MR статус enum
export enum MrStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// MR Item — DB field names: description, unitOfMeasure (NOT itemName, unit)
interface MrItem {
  id: string
  headerId: string
  tenantId: string
  lineNumber: number
  description: string       // itemName биш!
  unitOfMeasure: string     // unit биш!
  quantity: number
  unitPrice: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

// MR Header
export interface MrHeader {
  id: string
  tenantId: string
  requesterId: string
  title: string
  status: MrStatus
  version: number
  approvedAt: string | null
  approvedBy: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  items?: MrItem[]
  /** Phase 6.0b [SEC-004]: GET /requisitions/:id, approve, reject-ийн хариунд */
  workflow?: MrWorkflow
}

// Phase 6.0b [SEC-004] — workflow-ийн алхам (backend `MrWorkflowSummary`)
interface MrWorkflowStep {
  order: number
  role: string
  quorum: number
}

export interface MrWorkflow {
  instanceId: string | null
  /** PENDING | APPROVED | REJECTED | LEGACY */
  status: string
  /** 0-ээс эхэлсэн индекс; дууссан бол totalSteps */
  currentStep: number
  totalSteps: number
  steps: MrWorkflowStep[]
  approvals: { stepIndex: number; actorId: string; action: string; actedAt: string }[]
}

// DTOs
export interface CreateMrItemDto {
  description: string       // Backend DTO field name
  quantity: number
  unitOfMeasure?: string    // Backend DTO field name
  unitPrice?: number
  notes?: string
}

export interface CreateMrDto {
  title: string
  notes?: string
  items: CreateMrItemDto[]
}

export interface SubmitMrDto {
  notes?: string
}

export interface ApproveMrDto {
  notes?: string
}

export interface RejectMrDto {
  reason: string
  notes?: string
}
