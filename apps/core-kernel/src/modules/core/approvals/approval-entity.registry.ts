import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { getModuleManifest } from '../modules/module-registry';
import type { ApprovalStep } from './approval-steps';

type Tx = Prisma.TransactionClient;

export type ApprovalDecision = 'APPROVED' | 'REJECTED';

export interface ApprovalDecisionContext {
  tenantId: string;
  entityId: string;
  instanceId: string;
  /** core_users.id — шийдсэн хүн */
  actorId: string;
  /** орлон гүйцэтгэгч бол хэний өмнөөс */
  onBehalfOf: string | null;
  action: ApprovalDecision;
  comment: string | null;
  /** Энэ шийдвэрээр урсгал бүрэн дууссан (APPROVED/REJECTED) */
  final: boolean;
  /** Урсгалын эцсийн төлөв (final=false бол 'PENDING') */
  status: 'PENDING' | ApprovalDecision;
}

/**
 * Модуль бүр өөрийн батлуулах объектын төрлийг бүртгэнэ (цөмийн кодыг өөрчлөхгүй).
 *   - `onStep` — шийдвэр бүрт (жнь MR-ийн approval_logs, version)
 *   - `onFinal` — урсгал дуусахад (объектын төлөв, төсөв, event) — нэг transaction дотор
 */
export interface ApprovalEntityHandler {
  /** `^[A-Z][A-Z0-9_]+$` — workflow_definitions.entity_type */
  entityType: string;
  /** `TENANT_MODULES`-ийн id — модуль унтраалттай бол урсгал/жагсаалтад харагдахгүй */
  module: string;
  labelKey: string;
  /** Тохиргоонд санал болгох эрхүүд (алхмын эрх) */
  approvePermissions: readonly string[];
  /** Идэвхтэй тодорхойлолт үүсээгүй tenant-д анх удаа хэрэглэх default алхмууд */
  defaultSteps?: readonly ApprovalStep[];
  onStep?(tx: Tx, ctx: ApprovalDecisionContext): Promise<void>;
  onFinal?(tx: Tx, ctx: ApprovalDecisionContext): Promise<void>;
}

const ENTITY_TYPE_RE = /^[A-Z][A-Z0-9_]{1,59}$/;

@Injectable()
export class ApprovalEntityRegistry {
  private readonly handlers = new Map<string, ApprovalEntityHandler>();

  register(handler: ApprovalEntityHandler): void {
    if (!ENTITY_TYPE_RE.test(handler.entityType)) throw new Error(`Approval entity type буруу: ${handler.entityType}`);
    const module = getModuleManifest(handler.module);
    if (!module) throw new Error(`Approval entity модуль manifest-д байхгүй: ${handler.module}`);
    if (!module.approvalTypes?.includes(handler.entityType)) {
      throw new Error(`Approval entity type manifest-д бүртгэгдээгүй: ${handler.entityType}`);
    }
    const existing = this.handlers.get(handler.entityType);
    if (existing && existing.module !== handler.module) throw new Error(`Approval entity type давхардсан: ${handler.entityType}`);
    this.handlers.set(handler.entityType, handler);
  }

  get(entityType: string): ApprovalEntityHandler | undefined {
    return this.handlers.get(entityType);
  }

  list(): ApprovalEntityHandler[] {
    return [...this.handlers.values()].sort((a, b) => a.entityType.localeCompare(b.entityType));
  }
}
