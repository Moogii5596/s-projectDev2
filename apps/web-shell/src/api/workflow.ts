import apiClient from './client'

export interface SlaReport {
  summary: {
    total: number
    completed_on_time: number
    escalated: number
    overdue: number
    avg_completion_hours: number
  }
  by_step: Array<{ step_order: number; role: string; avg_hours: number; escalation_rate: number }>
  period: { from: string; to: string }
}

export interface WorkflowDefinition {
  id: string
  name: string
  stepsConfig: unknown
  slaHours: number
  escalationEnabled: boolean
  delegationEnabled: boolean
}

export interface Delegation {
  id: string
  delegatorId: string
  delegateId: string
  validFrom: string
  validUntil: string
  reason?: string
  isActive: boolean
}

export interface WorkflowDefinitionInput {
  name: string
  stepsConfig: unknown
  slaHours: number
  escalationEnabled: boolean
  delegationEnabled: boolean
}

export async function getApprovalSla(): Promise<SlaReport> {
  const response = await apiClient.get<SlaReport>('/api/v1/reports/approval-sla')
  return response.data
}

export async function getWorkflowDefinitions(): Promise<WorkflowDefinition[]> {
  const response = await apiClient.get<WorkflowDefinition[]>('/api/v1/workflow/definitions')
  return response.data
}

export async function saveWorkflowDefinition(input: WorkflowDefinitionInput, id?: string) {
  const response = id
    ? await apiClient.put<WorkflowDefinition>(`/api/v1/workflow/definitions/${id}`, input)
    : await apiClient.post<WorkflowDefinition>('/api/v1/workflow/definitions', input)
  return response.data
}

export async function getDelegations(): Promise<Delegation[]> {
  const response = await apiClient.get<Delegation[]>('/api/v1/workflow/delegations')
  return response.data
}

export async function createDelegation(input: Omit<Delegation, 'id' | 'isActive' | 'validFrom'> & { validFrom?: string }) {
  const response = await apiClient.post<Delegation>('/api/v1/workflow/delegations', input)
  return response.data
}

export async function revokeDelegation(id: string) {
  await apiClient.delete(`/api/v1/workflow/delegations/${id}`)
}