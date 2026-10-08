// ── Tenant ──────────────────────────────────────────────────
export type TierType = 'tier1' | 'tier2' | 'tier3';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  tier: TierType;
  isActive: boolean;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ── User ─────────────────────────────────────────────────────
export type UserRole = 'requester' | 'approver' | 'admin' | 'viewer';

export interface User {
  id: string;
  tenantId: string;
  authId: string;
  email: string;
  fullName?: string;
  role: UserRole;
  isActive: boolean;
}

// ── Request User Context (JWT decoded) ───────────────────────
export interface RequestUser {
  id: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
}

// ── Material Requisition ──────────────────────────────────────
export type MrStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'PROVISIONALLY_APPROVED';

export interface MrItem {
  id: string;
  tenantId: string;
  headerId: string;
  lineNumber: number;
  description: string;
  unitOfMeasure: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MrHeader {
  id: string;
  tenantId: string;
  mrNumber: string;
  title: string;
  status: MrStatus;
  requesterId: string;
  department?: string;
  requiredDate?: string;
  totalAmount: number;
  currency: string;
  notes?: string;
  version: number;
  items?: MrItem[];
  createdAt: string;
  updatedAt: string;
}

// ── API Response ─────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

// ── Events ───────────────────────────────────────────────────
export interface CloudEvent<T = unknown> {
  specversion: '1.0';
  id: string;
  source: string;
  type: string;
  time: string;
  tenantid: string;
  datacontenttype: 'application/json';
  data: T;
}

export type MrEventType =
  | 'mr.created'
  | 'mr.updated'
  | 'mr.submitted'
  | 'mr.approved'
  | 'mr.rejected'
  | 'mr.cancelled';
