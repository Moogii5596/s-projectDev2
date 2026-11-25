import { Module } from '@nestjs/common';
import { CampAccessService } from './camp-access.service';
import { CampAuditService } from './camp-audit.service';
import { SiteDataTransferScope } from './site-data-transfer.scope';

/**
 * v0.2.2 H1 — эрх шалгах, аудитын нийтлэг цөм (Кемп, HR, Core хуваалцана; эрхийн код v0.3 хүртэл `camp.*`).
 * HR/Core нь CampModule-ийг import хийхгүй, зөвхөн энэ модулийг — тойрог хамааралгүй.
 */
@Module({
  providers: [CampAccessService, CampAuditService, SiteDataTransferScope],
  exports: [CampAccessService, CampAuditService, SiteDataTransferScope],
})
export class CampCommonModule {}
