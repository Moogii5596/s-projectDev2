import { Injectable } from '@nestjs/common';
import type { DataTransferScope } from '../../core/import-export/data-transfer.types';
import type { Tx } from '../../core/platform/tenant-tx';
import { AccessService } from '../../core/platform/access.service';
import type { CampPermission } from './camp-permissions';
import { getCampOr404 } from './camp-lookup';

/**
 * CORE-10 — импорт/экспортын хүрээ = ажлын байр (кемп). HR ба Кемпийн handler-ууд цөмийн `DataTransferRegistry`-д
 * энэ шалгалттай бүртгэгдэнэ; цөмийн `DataTransferService` кемпийг мэдэхгүй.
 */
@Injectable()
export class SiteDataTransferScope implements DataTransferScope {
  constructor(private readonly access: AccessService) {}

  requirePermission(tx: Tx, tenantId: string, authId: string, scopeId: string, permission: string | string[]): Promise<string> {
    return this.access.require(tx, tenantId, authId, scopeId, permission as CampPermission | CampPermission[]);
  }

  async requireAccess(tx: Tx, tenantId: string, authId: string, scopeId: string): Promise<void> {
    await this.access.requireAccess(tx, tenantId, authId, scopeId);
  }

  async describe(tx: Tx, tenantId: string, scopeId: string): Promise<{ code: string }> {
    return { code: (await getCampOr404(tx, tenantId, scopeId)).code };
  }
}
